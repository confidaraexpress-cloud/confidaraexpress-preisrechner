/* Art der Lieferadresse nach der Angebotsauswahl (TG22 Residential) — gemeinsame Mocks und
 * Bedienung für die Browser-E2E-Suiten.
 *
 * ── Warum es diese Datei gibt ─────────────────────────────────────────────
 * Ein Angebot, dessen `requiredPriceInputs` die Art der Lieferadresse nennt, ist erst buchbar,
 * wenn der Kunde sie auf der Buchungsseite gewählt und der Server sie gebunden hat. Jede Suite,
 * die ein solches Angebot bucht, braucht deshalb dieselben zwei Endpunkte und dieselbe Bedienung.
 * EINE Stelle, nicht eine Kopie je Suite — dieselbe Regel wie helpers/newShipmentForm.mjs.
 *
 * ── Was der Mock tut ──────────────────────────────────────────────────────
 * Er verhält sich wie der Vertrag: Preisstand (Revision), Optionskennung, gebundene Wahl,
 * Konflikt bei veraltetem Stand, abgelaufene Optionen, idempotenter Doppelklick. Die Beträge
 * stehen als fertige Serverwerte im Zustand — die Suite nennt sie, der Mock gibt sie wieder.
 * Es entsteht nie ein echter Request.
 *
 * ── Reihenfolge der Routen ────────────────────────────────────────────────
 * Playwright prüft Routen in UMGEKEHRTER Registrierungsreihenfolge. `mockeLieferadresse` muss
 * deshalb NACH dem Sammel-Mock einer Suite registriert werden — sonst beantwortet der Sammel-Mock
 * die beiden Endpunkte mit einem leeren Objekt, und die Buchungsseite zeigt (richtig) den Fehler.
 */

export const LIEFERADRESSE_ID = Object.freeze({
  geschaeft: "residential-delivery-business",
  privat: "residential-delivery-private",
});

/**
 * Der serverseitige Zustand genau eines Angebots. `geschaeft`, `privat` und `zuschlag` sind
 * `{ net, vat, gross }` in Euro — so, wie der Server sie nennt.
 */
export function lieferadressZustand({
  offerId, geschaeft, privat, zuschlag,
  optionsId = "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
  insuranceAvailable = false, insuranceDetails = null,
  // TG22 Same-Day: `{ basis, zuschlag, block }` — der Versandpreis ohne Zuschlag, der Zuschlag der Abholung am
  // selben Tag und der Block der Options- und Bindungsantwort (`pickupTodayUntil`, `collectionDate`,
  // `collectionReadyFrom`). `geschaeft`/`privat` sind dann die Preise MIT diesem Zuschlag. Ohne Angabe gilt
  // Zeile für Zeile der bisherige Vertrag.
  sameDay = null,
} = {}) {
  return {
    offerId, geschaeft, privat, zuschlag, insuranceAvailable, insuranceDetails, sameDay,
    revision: 0, optionsId, bound: null, insuranceSelected: false,
    optionsCalls: [], bindCalls: [],
    failOptions: 0, optionsDelayMs: 0, bindDelayMs: 0,
    // Eine einmalige Ablehnung `{ status, body }` der nächsten Options- bzw. Bindungsanfrage.
    optionsReject: null, bindReject: null,
  };
}

const summen = (p) => ({
  customerShippingNet: p.net, shippingVat: p.vat, customerShippingGross: p.gross,
  insuranceGross: 0, customerTotalNet: p.net, customerTotalGross: p.gross,
});

// TG22 Same-Day: der Block, den Options- und Bindungsantwort für eine Abholung am selben Tag tragen.
const selberTagBlock = (z) => ({ ...z.sameDay.block, surcharge: { ...z.sameDay.zuschlag } });

export function optionsAntwort(z) {
  return {
    offerId: z.offerId, offerRevision: z.revision, optionsId: z.optionsId,
    expiresAt: "2099-01-01T00:00:00.000Z", priceInput: "deliveryIsResidential", boundValue: z.bound,
    options: [
      { value: false, surcharge: { net: 0, vat: 0, gross: 0 }, totals: summen(z.geschaeft) },
      { value: true, surcharge: { ...z.zuschlag }, totals: summen(z.privat) },
    ],
    ...(z.sameDay ? { sameDayCollection: selberTagBlock(z) } : {}),
  };
}

/** Die öffentlichen Bestandteile einer Bindung — Geschäftsadresse genau eine Zeile (ohne Abholung am selben Tag). */
export function bestandteile(z, wert) {
  const basis = { type: "shipping_base", taxable: true, ...(z.sameDay ? z.sameDay.basis : z.geschaeft) };
  const selberTag = z.sameDay ? [{ type: "same_day_collection_surcharge", taxable: true, ...z.sameDay.zuschlag }] : [];
  return wert
    ? [basis, ...selberTag, { type: "residential_delivery_surcharge", taxable: true, ...z.zuschlag }]
    : [basis, ...selberTag];
}

export function bindungsAntwort(z, wert, { insuranceReset = false, idempotent = false } = {}) {
  const preis = wert ? z.privat : z.geschaeft;
  return {
    offerId: z.offerId, offerRevision: z.revision, priceInputs: { deliveryIsResidential: wert },
    priceCompleteness: "complete", components: bestandteile(z, wert), totals: summen(preis),
    // Der Ausschnitt trägt bewusst KEIN `requiredPriceInputs` — wie der Vertrag.
    offer: {
      netPrice: preis.net, vatAmount: preis.vat, finalPrice: preis.gross, bookable: true, unavailableReason: null,
      priceCompleteness: "complete", insuranceAvailable: z.insuranceAvailable, insuranceDetails: z.insuranceDetails,
    },
    insuranceReset, idempotent,
    ...(z.sameDay ? { sameDayCollection: selberTagBlock(z) } : {}),
  };
}

/** Der Server hebt Bindung und Optionsstand auf — etwa nach einer Preisänderung mit Neubestätigung. */
export function invalidiereLieferadresse(z, neueOptionsId) {
  z.revision += 1;
  z.bound = null;
  z.optionsId = neueOptionsId;
}

const warte = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/**
 * Beantwortet beide Endpunkte für einen oder mehrere Angebotszustände. Jede Anfrage landet in
 * `anfragen` (`{ pfad, body }`) — auch eine für ein Angebot ohne Zustand, damit eine Suite prüfen
 * kann, dass für ein Angebot ohne diese Angabe gar keine Anfrage entsteht.
 */
export async function mockeLieferadresse(page, zustaende, anfragen = []) {
  const liste = Array.isArray(zustaende) ? zustaende : [zustaende];
  await page.route("**/api/offers/price-input*", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    let body = {};
    try { body = JSON.parse(req.postData() || "{}"); } catch { body = {}; }
    anfragen.push({ pfad: p, body });
    const z = liste.find((x) => x.offerId === body.offerId) || null;
    const unbekannt = () => json(404, { error: "Angebot nicht gefunden.", code: "OFFER_NOT_FOUND" });

    if (p.endsWith("/api/offers/price-input-options")) {
      if (!z) return unbekannt();
      z.optionsCalls.push(body);
      await warte(z.optionsDelayMs);
      if (z.optionsReject) {
        const ablehnung = z.optionsReject;
        z.optionsReject = null;
        return json(ablehnung.status, ablehnung.body);
      }
      if (z.failOptions > 0) {
        z.failOptions -= 1;
        return json(503, { error: "Der Zuschlag konnte nicht berechnet werden.", code: "PRICE_INPUT_OPTIONS_UNAVAILABLE" });
      }
      if (body.offerRevision !== z.revision) {
        return json(409, { error: "Der Preis wurde aktualisiert.", code: "OFFER_PRICE_CONFLICT", offerRevision: z.revision });
      }
      return json(200, optionsAntwort(z));
    }

    if (p.endsWith("/api/offers/price-inputs")) {
      if (!z) return unbekannt();
      z.bindCalls.push(body);
      await warte(z.bindDelayMs);
      if (z.bindReject) {
        const ablehnung = z.bindReject;
        z.bindReject = null;
        return json(ablehnung.status, ablehnung.body);
      }
      const wert = body.deliveryIsResidential;
      // Doppelklick: genau dieser Zustand ist schon gebunden — derselbe Stand oder der davor.
      if (z.bound === wert && body.optionsId === z.optionsId
          && (body.offerRevision === z.revision || body.offerRevision + 1 === z.revision)) {
        return json(200, bindungsAntwort(z, wert, { idempotent: true }));
      }
      if (body.offerRevision !== z.revision) {
        return json(409, { error: "Der Preis wurde aktualisiert.", code: "OFFER_PRICE_CONFLICT", offerRevision: z.revision });
      }
      if (body.optionsId !== z.optionsId) {
        return json(409, { error: "Die Angaben sind abgelaufen.", code: "PRICE_INPUT_OPTIONS_EXPIRED" });
      }
      if (body.expectedShippingGross !== (wert ? z.privat : z.geschaeft).gross) {
        return json(409, { error: "Bitte bestätigen Sie den Preis erneut.", code: "PRICE_CONFIRMATION_REQUIRED" });
      }
      const insuranceReset = z.insuranceSelected === true;
      z.revision += 1;
      z.bound = wert;
      z.insuranceSelected = false;
      return json(200, bindungsAntwort(z, wert, { insuranceReset }));
    }
    return route.fallback();
  });
  return anfragen;
}

/**
 * Wählt die Art der Lieferadresse wie ein Kunde: Klick auf die Karte, dann warten, bis die
 * Bindung zurück ist (Radio gewählt und wieder bedienbar) UND die Seite das gebundene Angebot
 * trägt. Das gebundene Angebot erreicht die Seite über den Verlaufseintrag — einen Render nach dem
 * Radio; bis dahin steht dort (richtig) noch der vorläufige Preis. Nichts wird erzwungen; ist die
 * Wahl bereits gebunden, bleibt es beim Warten.
 */
export async function waehleLieferadresse(page, privat, { timeout = 20000 } = {}) {
  const id = privat ? LIEFERADRESSE_ID.privat : LIEFERADRESSE_ID.geschaeft;
  const karte = page.locator(`label[for="${id}"]`);
  await karte.waitFor({ state: "visible", timeout });
  await page.waitForFunction((rid) => { const el = document.getElementById(rid); return !!el && !el.disabled; }, id, { timeout });
  if (!(await page.locator(`#${id}`).isChecked())) await karte.click();
  await page.waitForFunction((rid) => {
    const el = document.getElementById(rid);
    if (!el || !el.checked || el.disabled) return false;
    const label = document.querySelector(".blsum-price-label");
    return !label || !/Vorläufiger Preis/.test(label.textContent || "");
  }, id, { timeout });
}
