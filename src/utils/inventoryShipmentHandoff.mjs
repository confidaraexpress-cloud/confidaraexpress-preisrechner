/* ── Lager & Aufträge — Übergabe in den bestehenden Versandprozess ───────────
   Herausgelöst aus inventoryView.mjs (Modularisierungs-Audit). Fachmodul der
   Nahtstelle Lager → „Neue Sendung": der normalisierte Lagerbezug, der
   Herkunftshinweis und die beiden Prefill-Abbildungen. Reine Abbildungen —
   keine API, kein React, kein Zustand. */

/* ══════════ Lagerbezug-Snapshot (Absicht) ═══════════════════════════════════

   Kanonische Heimat von normalizeInventoryContext(): sie stand ursprünglich in
   shippingFlowState.mjs, das aber bereits AUS formDraftsView.mjs importiert
   (FORM_SERVICE_FILTERS/FORM_SHIPPING_MODES) — ein Import in umgekehrter
   Richtung (formDraftsView.mjs → shippingFlowState.mjs) hätte einen Importzyklus
   erzeugt, exakt die Falle, die dieses Projekt an anderer Stelle bereits einmal
   umgangen hat (AuthContext ↔ ShippingFlowContext). Dieses Modul importiert
   nichts aus beiden und ist damit der zyklusfreie gemeinsame Ort; die alten
   Exportstellen bleiben über Re-Exports erhalten (inventoryView.mjs und —
   dahinter — shippingFlowState.mjs). */

// Normalisiert die Lagerabsicht. Alles, was nicht exakt einer der beiden
// erlaubten Formen entspricht, wird VERWORFEN (null) — nie halb übernommen: ein
// halber Lagerbezug würde eine falsche Ausbuchung vorbereiten.
//
// name/sku je Artikelposition sind ADDITIV und REIN KOSMETISCH: sie tragen den
// Herkunftshinweis (inventoryOriginNotice) über einen Reload/ein Fortsetzen
// hinweg, ohne dafür einen Artikel erneut abrufen zu müssen. Sie sind niemals
// Teil einer fachlichen Entscheidung — weder hier noch serverseitig (das Backend
// liest aus derselben Absicht ausschließlich productId/quantity/orderId, siehe
// lib/inventoryShipment.js).
export function normalizeInventoryContext(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const isId = (v) => typeof v === "string" && /^[0-9]{1,19}$/.test(v) && !/^0+$/.test(v);
  const isQty = (v) => Number.isInteger(v) && v >= 1 && v <= 1000000;
  const dispStr = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

  if (raw.orderId !== undefined && raw.orderId !== null && raw.orderId !== "") {
    if (!isId(String(raw.orderId))) return null;
    return { orderId: String(raw.orderId), orderNumber: typeof raw.orderNumber === "string" ? raw.orderNumber : null };
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > 100) return null;
  const items = [];
  for (const it of raw.items) {
    if (!it || typeof it !== "object") return null;
    if (!isId(String(it.productId))) return null;
    const qty = typeof it.quantity === "number" ? it.quantity : Number(it.quantity);
    if (!isQty(qty)) return null;
    items.push({ productId: String(it.productId), quantity: qty, name: dispStr(it.name), sku: dispStr(it.sku) });
  }
  const warehouseId = raw.warehouseId !== undefined && raw.warehouseId !== null && raw.warehouseId !== ""
    ? String(raw.warehouseId) : null;
  if (warehouseId !== null && !isId(warehouseId)) return null;
  return { warehouseId, items };
}

/**
 * Der Herkunftshinweis EINER Quelle — abgeleitet aus dem bereits normalisierten
 * Lagerbezug, nicht aus einem separaten, nur einmalig gesetzten Text. Damit lässt
 * sich derselbe Satz sowohl beim ERSTEN Prefill (Auftrag/Artikel → „Neue Sendung")
 * als auch bei jedem SPÄTEREN Reload/Fortsetzen erzeugen — eine fachliche Quelle,
 * keine zwei unabhängigen Wahrheiten (technicalInventoryContext + separater
 * UI-Text). Bei einer normalen Sendung (context === null) liefert sie "": die
 * Hinweiszeile erscheint dann gar nicht.
 *
 * Trägt AUSSCHLIESSLICH Confidara-eigene Fachbegriffe (Artikel, Auftrag, Menge) —
 * nie Providerinterna (kein JUMiNGO-Name, keine Providerreferenz, kein Preis).
 */
export function inventoryOriginNotice(context) {
  if (!context || typeof context !== "object") return "";
  if (context.orderId) {
    return context.orderNumber
      ? `Versand aus Auftrag ${context.orderNumber}. Bitte Paketdaten prüfen und ergänzen.`
      : "Versand aus einem Auftrag. Bitte Paketdaten prüfen und ergänzen.";
  }
  const item = Array.isArray(context.items) ? context.items[0] : null;
  if (!item) return "";
  const qty = Number(item.quantity) || 0;
  const label = (typeof item.name === "string" && item.name.trim())
    || (typeof item.sku === "string" && item.sku.trim())
    || "Artikel";
  return `Versand von ${qty} × ${label}. Bitte Empfänger und Paketdaten ergänzen.`;
}

/* ══════════ Prefill in den bestehenden Versandprozess ═══════════════════ */

// Beide Wege (Artikel versenden, Auftrag versenden) münden in DENSELBEN
// bestehenden Versandprozess. Diese Abbildungen erzeugen deshalb genau das,
// was NewShipmentPage ohnehin kennt: einen Werte-Patch auf die r_*/Paketfelder
// plus die Lagerabsicht, die bei /calculate-price mitgeschickt wird.
//
// AUSDRÜCKLICH NICHT enthalten: Paketmaße. Artikelmaße sind keine Paketmaße —
// fünf Artikel à 20 × 10 × 5 cm ergeben kein rechnerisch bestimmbares Paket.
// Es gibt kein Bin Packing; Maße bestätigt weiterhin der Mensch.

/**
 * Auftrag → Versand-Prefill.
 * Erwartet die Antwort von GET /api/kunde/orders/:id/shipping-prefill.
 * Rückgabe: { form, inventory, notice } — oder null, wenn nichts Brauchbares da ist.
 */
export function mapOrderPrefillToShipment(prefill) {
  if (!prefill || typeof prefill !== "object") return null;
  const r = prefill.recipient && typeof prefill.recipient === "object" ? prefill.recipient : null;
  if (!r) return null;

  const form = {
    r_company: r.company || "",
    r_fullName: r.fullName || "",
    r_street: r.streetAndNumber || "",
    r_addition: r.addressAddition || "",
    r_zip: r.postalCode || "",
    r_city: r.city || "",
    r_country: (r.country || "DE").toUpperCase(),
    r_phone: r.phone || "",
    r_email: r.email || "",
  };
  // Das Warengewicht ist ein AUSGANGSPUNKT, kein Ergebnis: es wird nur gesetzt,
  // wenn der Server für jede offene Position ein Stückgewicht hatte. Sonst bleibt
  // das Feld leer — lieber keine Zahl als eine zu niedrige.
  if (typeof prefill.suggestedWeightKg === "number" && prefill.suggestedWeightKg > 0) {
    form.weight = String(prefill.suggestedWeightKg);
  }

  const orderNumber = prefill.order && typeof prefill.order.orderNumber === "string" ? prefill.order.orderNumber : null;
  const inv = { orderId: String(prefill.order?.id ?? ""), orderNumber };
  return { form, inventory: inv, notice: inventoryOriginNotice(inv) };
}

/**
 * Artikel → Versand-Prefill (Direktversand ohne Auftrag).
 * Der Empfänger bleibt leer — ein Artikel kennt keinen Empfänger.
 * Rückgabe: { form, inventory, notice } — oder null bei ungültiger Menge.
 */
export function mapProductToShipment(product, quantity, warehouseId = null) {
  if (!product || typeof product !== "object") return null;
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 1000000) return null;

  const form = {};
  const unit = Number(product.weightKg);
  if (Number.isFinite(unit) && unit > 0) {
    const total = Number((unit * qty).toFixed(3));
    // Die Versandvalidierung lässt 0,1–1000 kg zu. Ein rechnerisch größeres
    // Gesamtgewicht wird NICHT gekappt — dann bleibt das Feld leer und der
    // Kunde entscheidet (mehrere Pakete, Teilmenge, andere Aufteilung).
    if (total >= 0.1 && total <= 1000) form.weight = String(total);
  }

  const inv = {
    warehouseId: warehouseId != null ? String(warehouseId) : null,
    // name/sku sind rein kosmetisch (siehe normalizeInventoryContext) — sie tragen
    // den Herkunftshinweis über einen Reload hinweg, ohne den Artikel erneut
    // abzurufen. Fachlich verwendet wird ausschließlich productId/quantity.
    items: [{ productId: String(product.id), quantity: qty, name: product.name || null, sku: product.sku || null }],
  };
  return { form, inventory: inv, notice: inventoryOriginNotice(inv) };
}
