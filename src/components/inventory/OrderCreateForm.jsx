import React, { useState, useCallback, useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";
import { InlineError, ProductPicker, CollapsibleSection } from "./InventoryShared";
import { AddressPicker } from "../addressbook/AddressPicker";
import { getProduct, getProducts, getWarehouses } from "../../api/inventoryApi";
import { formatUnits } from "../../utils/inventoryView.mjs";
// Länderliste und Adressbuchauslegung kommen aus den bestehenden Quellen —
// keine zweite Länderdatei, keine zweite Adressbuchlogik.
import { countries } from "../../utils/countries";
import { mapAddressToOrderRecipient, TAB_RECIPIENT } from "../../utils/addressBookView.mjs";
import { AddressSuggestInput } from "../address/AddressSuggestInput";
import { AddressStatusLine } from "../address/AddressStatusLine";
import { useAddressValidation } from "../../hooks/useAddressValidation";
import { applyStreetSuggestion } from "../../utils/addressValidationView.mjs";
import {
  ORDER_RECIPIENT_LIMITS, emptyOrderRecipient, postalCodeRequirement,
  validateOrderRecipient, normalizeOrderRecipient, reservationPreview,
  reservationPreviewLines, quantityError, positionErrors, canSubmitOrder,
  STOCK_EXPLANATION, insufficientStockMessage, extrasFilled, MAX_ORDER_POSITIONS,
} from "../../utils/orderCreateView.mjs";

/* ── Auftrag erstellen ───────────────────────────────────────────────────────
   Drei Abschnitte, ein Schritt: Empfänger → Positionen → Zusatzangaben. Kein
   Wizard — der Vorgang ist kurz genug, und ein mehrstufiger Ablauf verbärge
   genau die Übersicht, die hier gebraucht wird.

   Die Empfängerfelder entsprechen EXAKT dem bestehenden Adressvertrag des
   Versands (fullName/streetAndNumber/postalCode/city/country/company/
   addressAddition/phone/email) — der Auftrag speichert genau diese Form als
   Snapshot, sodass sie später unverändert in den Versandprozess übernommen
   werden kann.

   „Verfügbar: X" und die Reservierungsvorschau sind Orientierung, keine Zusage.
   Ob eine Menge reserviert werden darf, entscheidet allein das Backend — und
   zwar atomar beim Anlegen. Die Absendesperre bei zu großer Menge ist eine
   Bedienhilfe gegen einen sicheren Fehlschlag, KEINE Race-Condition-Absicherung;
   die bleibt vollständig serverseitig.

   Was dieses Formular ausdrücklich NICHT tut: Carrierpreise berechnen, eine
   Sendung erzeugen, ein Label buchen oder Paketmaße verlangen. Ein Auftrag
   reserviert Bestand — mehr nicht. */

function Feld({ id, label, value, onChange, error, hint, ...rest }) {
  return (
    <div className="inv-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="field-input" value={value} onChange={(e) => onChange(e.target.value)}
             aria-invalid={error ? "true" : undefined}
             aria-describedby={error ? `${id}-err` : (hint ? `${id}-hint` : undefined)} {...rest} />
      {error && <p className="inv-field-error" id={`${id}-err`}>{error}</p>}
      {!error && hint && <p className="inv-field-hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

/* Startwerte an EINER Stelle — daraus speisen sich die Felder UND der
   Startzustand von „Zusatzangaben". Wer hier später eine Vorbelegung ergänzt,
   bekommt den passenden Aufklappzustand geschenkt, statt ihn zu vergessen. */
const START_ZUSATZ = Object.freeze({ customerReference: "", notes: "" });

export function OrderCreateForm({ busy, error, onSubmit, onCancel }) {
  const [recipient, setRecipient] = useState(() => emptyOrderRecipient());
  const [customerReference, setCustomerReference] = useState(START_ZUSATZ.customerReference);
  const [notes, setNotes] = useState(START_ZUSATZ.notes);
  const [positions, setPositions] = useState([]);  // [{ product, quantity }]
  const [errs, setErrs] = useState({});
  const [showErrors, setShowErrors] = useState(false);

  const [pickerItems, setPickerItems] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [prefillNote, setPrefillNote] = useState("");
  const [positionNote, setPositionNote] = useState("");
  const [stockConflict, setStockConflict] = useState("");
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [defaultWarehouseId, setDefaultWarehouseId] = useState("");
  // „Zusatzangaben" startet geschlossen und öffnet sich nur, wenn beim Aufbau
  // schon Angaben vorliegen — abgeleitet aus denselben Startwerten, nicht fest
  // verdrahtet. Reiner UI-Zustand, keine Persistenz.
  const [extrasOpen, setExtrasOpen] = useState(() => extrasFilled(START_ZUSATZ));

  const set = (k) => (val) => setRecipient((cur) => ({ ...cur, [k]: val }));

  useEffect(() => {
    getWarehouses({ limit: 50 }).then(async (r) => {
      if (!r.ok) return;
      const list = (await r.json()).warehouses || [];
      setWarehouses(list);
      const def = list.find(w => w.isDefault) || list[0];
      if (def) { setWarehouseId(def.id); setDefaultWarehouseId(def.id); }
    }).catch(() => {});
  }, []);

  const sucheArtikel = useCallback(async (term) => {
    setPickerLoading(true);
    try {
      const res = await getProducts({ limit: 20, q: term || undefined, status: "active" });
      if (res.ok) setPickerItems((await res.json()).products || []);
    } catch { /* Fehler zeigt das Formular beim Absenden */ }
    finally { setPickerLoading(false); }
  }, []);

  useEffect(() => { if (pickerOpen) sucheArtikel(""); }, [pickerOpen, sucheArtikel]);

  /* ── Empfänger aus dem Adressbuch ──
     Die Übernahme ist eine EINMALIGE Vorbelegung: sie ersetzt den Empfänger
     genau jetzt und lässt danach los. Es gibt bewusst keine Bindung an die
     Adressbuchzeile — wer nach der Übernahme die Straße korrigiert, behält
     seine Korrektur, und nichts synchronisiert sie später wieder weg. Ebenso
     wird nichts zurück ins Adressbuch geschrieben. */
  const adresseUebernehmen = (address) => {
    setRecipient(mapAddressToOrderRecipient(address));
    setAddressPickerOpen(false);
    setPrefillNote("Adresse aus dem Adressbuch übernommen. Sie können sie hier frei anpassen.");
    if (showErrors) setErrs(validateOrderRecipient(mapAddressToOrderRecipient(address)));
  };

  const positionMengeRef = useRef({});

  const positionHinzu = (product) => {
    const vorhanden = positions.find(p => String(p.product.id) === String(product.id));
    setPickerOpen(false);
    if (vorhanden) {
      // Kein zweiter Eintrag für denselben Artikel: das Backend führt je Auftrag
      // genau eine Position je Artikel (UNIQUE order_id/product_id) und fasst
      // Doppelte zusammen. Eine stille Erhöhung um 1 sähe für den Nutzer aus,
      // als sei nichts passiert — stattdessen führt der Klick zur bestehenden
      // Position und sagt, dass sie schon da ist.
      setPositionNote(`„${product.name}" ist bereits als Position enthalten. Passen Sie dort die Menge an.`);
      window.requestAnimationFrame(() => positionMengeRef.current[String(product.id)]?.focus());
      return;
    }
    if (positions.length >= MAX_ORDER_POSITIONS) {
      setPositionNote(`Ein Auftrag fasst höchstens ${MAX_ORDER_POSITIONS} Positionen.`);
      return;
    }
    setPositionNote("");
    setPositions((cur) => [...cur, { product, quantity: "1" }]);
  };

  const mengeSetzen = (id, wert) => {
    setStockConflict("");
    setPositions((cur) => cur.map(p => (String(p.product.id) === String(id) ? { ...p, quantity: wert } : p)));
  };
  const positionWeg = (id) => {
    setPositionNote("");
    setStockConflict("");
    setPositions((cur) => cur.filter(p => String(p.product.id) !== String(id)));
  };

  /* Nach einem serverseitigen INSUFFICIENT_STOCK: die Bestände der aktuellen
     Positionen frisch holen, damit die angezeigten Zahlen wieder stimmen. Die
     MENGEN bleiben unangetastet — was stattdessen bestellt werden soll, weiß
     nur der Nutzer. Ein Artikel je Anfrage ist hier vertretbar: der Pfad läuft
     nur im Konfliktfall und ein Auftrag trägt in der Praxis wenige Positionen
     (Obergrenze 100, siehe MAX_ORDER_POSITIONS). */
  const bestaendeAktualisieren = useCallback(async () => {
    const aktuell = positions;
    if (aktuell.length === 0) return;
    const frisch = await Promise.all(aktuell.map(async (p) => {
      try {
        const res = await getProduct(p.product.id);
        if (!res.ok) return null;
        return (await res.json()).product || null;
      } catch { return null; }
    }));
    setPositions((cur) => cur.map((p) => {
      const treffer = frisch.find((f) => f && String(f.id) === String(p.product.id));
      return treffer ? { ...p, product: treffer } : p;
    }));
  }, [positions]);

  const absenden = async (ev) => {
    ev.preventDefault();
    setShowErrors(true);
    const gefunden = validateOrderRecipient(recipient);
    setErrs(gefunden);
    if (Object.keys(gefunden).length > 0) return;
    if (positions.length === 0) { setPositionNote("Fügen Sie mindestens eine Position hinzu."); return; }
    if (positionErrors(positions).length > 0) return;

    setStockConflict("");
    const ergebnis = await onSubmit({
      recipient: normalizeOrderRecipient(recipient),
      warehouseId: warehouseId || undefined,
      customerReference: customerReference.trim() || null,
      notes: notes.trim() || null,
      items: positions.map(p => ({ productId: p.product.id, quantity: Number(p.quantity) })),
    });

    // Der Bestand kann sich zwischen Anzeige und Absenden geändert haben — das
    // ist genau der Fall, den das Backend atomar abfängt. Hier wird er nur
    // erklärt und die Anzeige nachgezogen.
    const meldung = insufficientStockMessage(ergebnis?.body, positions);
    if (meldung) {
      setStockConflict(meldung);
      await bestaendeAktualisieren();
    }
  };

  // Adressprüfung der Lieferadresse — dieselbe zentrale Logik wie in „Neue Sendung" und im
  // Adressbuch. Ein Auftrag reserviert nur Bestand; die Prüfung blockiert das Anlegen NICHT.
  const addressCheck = useAddressValidation({
    country: recipient.country, postalCode: recipient.postalCode,
    city: recipient.city, street: recipient.streetAndNumber,
  });

  // Dieselbe Regel wie in den anderen Adressformularen: genau ein Ort wird ergänzt,
  // mehrere bleiben Vorschläge.
  useEffect(() => {
    if (addressCheck.cityOptions.length === 1 && !String(recipient.city || "").trim()) {
      setRecipient((cur) => (String(cur.city || "").trim() ? cur : { ...cur, city: addressCheck.cityOptions[0] }));
    }
  }, [addressCheck.cityOptions]);

  const plzRegel = postalCodeRequirement(recipient.country);
  const positionsFehler = positionErrors(positions);
  const absendbar = canSubmitOrder({ recipient, positions });
  const zusatzGefuellt = extrasFilled({ warehouseId, defaultWarehouseId, customerReference, notes });

  return (
    <form onSubmit={absenden} className="inv-form" noValidate>
      <InlineError text={error} />

      <fieldset className="inv-fieldset" disabled={busy}>
        <legend className="inv-legend">Empfänger</legend>
        <p className="inv-field-hint">An diese Adresse geht die spätere Sendung. Sie können sie hier eingeben oder aus dem Adressbuch übernehmen.</p>

        {/* Dieselbe Auswahl wie in „Neue Sendung", nur mit anderem Reiter — ein
            Bauteil, zwei Aufrufer (components/addressbook/AddressPicker).
            Hier bleibt sie bewusst IN-FLOW aufklappend (die schwebende Fassung
            gehört in die Abschnittsüberschrift eines langen Formulars); nur der
            Reiter kommt jetzt als Prop statt festverdrahtet. */}
        {addressPickerOpen
          ? <AddressPicker tab={TAB_RECIPIENT} onSelect={adresseUebernehmen} onClose={() => setAddressPickerOpen(false)} disabled={busy} />
          : (
            <div className="inv-addrpicker-open">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setPrefillNote(""); setAddressPickerOpen(true); }}>
                {/* `idcard` ist im ganzen Portal das Zeichen für das Adressbuch
                    (siehe DashboardSidebar) — kein zweites Symbol dafür. */}
                <Icon n="idcard" s={16} />Aus Adressbuch auswählen
              </button>
              {prefillNote && <span className="inv-field-hint">{prefillNote}</span>}
            </div>
          )}

        <div className="inv-grid-2">
          <Feld id="o-company" label="Firma" value={recipient.company} onChange={set("company")}
                maxLength={ORDER_RECIPIENT_LIMITS.company} autoComplete="organization" />
          {/* Pflichtfeld des Backends ist `fullName`. Der Zusatz benennt, was
              hier hingehört: bei einer Firmenlieferung die Person, an die das
              Paket adressiert wird. */}
          <Feld id="o-name" label="Name / Ansprechpartner *" value={recipient.fullName} onChange={set("fullName")}
                error={errs.fullName} maxLength={ORDER_RECIPIENT_LIMITS.fullName} autoComplete="name" />
        </div>
        <div className="inv-grid-2">
          <AddressSuggestInput
            id="o-street" label="Straße und Hausnummer" required
            value={recipient.streetAndNumber}
            onChange={(v) => set("streetAndNumber")(v)}
            onSelect={(item) => set("streetAndNumber")(
              applyStreetSuggestion(recipient.streetAndNumber, typeof item === "string" ? item : item.street))}
            suggestions={addressCheck.streetOptions}
            error={errs.streetAndNumber}
            maxLength={ORDER_RECIPIENT_LIMITS.streetAndNumber}
            autoComplete="address-line1" />
          <Feld id="o-add" label="Adresszusatz" value={recipient.addressAddition} onChange={set("addressAddition")}
                maxLength={ORDER_RECIPIENT_LIMITS.addressAddition} autoComplete="address-line2" />
        </div>
        <div className="inv-grid-3">
          {/* Der Stern folgt dem LAND, nicht der Gewohnheit: das Backend prüft
              die PLZ über validatePostalCode() — Pflicht ist sie nur, wo das
              Land eine kennt. Länder ohne Postleitzahlsystem bekommen gar kein
              Feld. */}
          {plzRegel.shown && (
            <Feld id="o-zip" label={plzRegel.required ? "PLZ *" : "PLZ"} value={recipient.postalCode} onChange={set("postalCode")}
                  error={errs.postalCode} maxLength={ORDER_RECIPIENT_LIMITS.postalCode} autoComplete="postal-code" />
          )}
          <AddressSuggestInput
            id="o-city" label="Ort" required
            value={recipient.city}
            onChange={(v) => set("city")(v)}
            onSelect={(item) => set("city")(typeof item === "string" ? item : item.city)}
            suggestions={addressCheck.cityOptions}
            error={errs.city}
            maxLength={ORDER_RECIPIENT_LIMITS.city}
            autoComplete="address-level2" />
          <div className="inv-field">
            <label className="field-label" htmlFor="o-country">Land *</label>
            {/* Sichtbar der Landesname, gespeichert und gesendet unverändert der
                ISO-Code — dieselbe Liste wie im Versandformular, keine zweite
                Länderquelle. */}
            <select id="o-country" className="field-select" value={recipient.country}
                    onChange={(e) => set("country")(e.target.value)}
                    aria-invalid={errs.country ? "true" : undefined} autoComplete="country">
              {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            {errs.country && <p className="inv-field-error">{errs.country}</p>}
          </div>
        </div>
        {/* Ergebnis der Adressprüfung — erscheint nur, wenn es etwas zu sagen gibt. */}
        <AddressStatusLine
          status={addressCheck.status}
          acknowledged={addressCheck.acknowledged}
          onAcknowledge={addressCheck.acknowledge}
          citySuggestions={addressCheck.cityOptions}
          onPickCity={(c) => set("city")(c)}
        />
        <div className="inv-grid-2">
          <Feld id="o-phone" label="Telefon" value={recipient.phone} onChange={set("phone")}
                maxLength={ORDER_RECIPIENT_LIMITS.phone} autoComplete="tel" />
          <Feld id="o-email" label="E-Mail" value={recipient.email} onChange={set("email")}
                error={errs.email} maxLength={ORDER_RECIPIENT_LIMITS.email} type="email" autoComplete="email" />
        </div>
      </fieldset>

      <fieldset className="inv-fieldset" disabled={busy}>
        <legend className="inv-legend">Positionen</legend>
        <p className="inv-field-hint">Welche Artikel gehören zu diesem Auftrag und in welcher Menge?</p>

        {stockConflict && <div className="inv-inline-error" role="alert"><Icon n="info" s={16} /><span>{stockConflict}</span></div>}
        {positionNote && <p className="inv-field-error" role="status">{positionNote}</p>}
        {showErrors && positions.length === 0 && !positionNote && (
          <p className="inv-field-error">Mindestens eine Position ist erforderlich.</p>
        )}

        {positions.length > 0 && (
          <ul className="inv-positions">
            {positions.map(({ product, quantity }) => {
              const vorschau = reservationPreview(product, quantity);
              const fehler = positionsFehler.find(f => String(f.productId) === String(product.id));
              const zeilen = reservationPreviewLines(vorschau);
              return (
                <li key={product.id} className="inv-position">
                  <div className="inv-position-main">
                    <span className="inv-position-name">{product.name}</span>
                    <span className="inv-cell-meta inv-position-sku">
                      <span className="inv-cell-sku">{product.sku}</span>
                      <span className="inv-position-avail">{formatUnits(product.stock?.available)} verfügbar</span>
                    </span>
                  </div>
                  <div className="inv-position-qty">
                    <label className="sr-only" htmlFor={`pos-${product.id}`}>Menge für {product.name}</label>
                    <input id={`pos-${product.id}`} className="field-input" type="number" inputMode="numeric" min="1" step="1"
                           ref={(el) => { positionMengeRef.current[String(product.id)] = el; }}
                           aria-invalid={fehler ? "true" : undefined}
                           value={quantity} onChange={(e) => mengeSetzen(product.id, e.target.value)} />
                    <button type="button" className="btn btn-icon btn-sm" aria-label={`Position ${product.name} entfernen`}
                            onClick={() => positionWeg(product.id)}>
                      <Icon n="trash" s={16} />
                    </button>
                  </div>
                  {/* Erst der Fehler, dann die Vorschau: bei zu großer Menge gibt
                      es keine sinnvolle „danach"-Aussage. */}
                  {fehler && <p className="inv-position-warn">{fehler.message}</p>}
                  {!fehler && zeilen.length > 0 && (
                    <p className="inv-position-preview">{zeilen.join(" · ")}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {pickerOpen
          ? <ProductPicker products={pickerItems} loading={pickerLoading} value={null} onChange={positionHinzu}
                           onSearch={sucheArtikel} disabled={busy} addedIds={positions.map(p => p.product.id)} />
          : (
            <button type="button" className="btn btn-outline" onClick={() => { setPositionNote(""); setPickerOpen(true); }}>
              <Icon n="plus" s={16} />Position hinzufügen
            </button>
          )}

        {/* Eine Erklärung, an der Stelle, an der die Mengen entstehen — der
            frühere Fußzeilensatz unter den Buttons ist dafür entfallen. */}
        <div className="inv-stock-explain">
          <h3 className="inv-stock-explain-title"><Icon n="info" s={16} />{STOCK_EXPLANATION.title}</h3>
          <ul className="inv-stock-explain-list">
            {STOCK_EXPLANATION.lines.map((satz) => <li key={satz}>{satz}</li>)}
          </ul>
        </div>
      </fieldset>

      <CollapsibleSection
        id="o-extras"
        title="Zusatzangaben"
        hint="Optional. Ohne diese Angaben wird der Auftrag im Standardlager angelegt."
        open={extrasOpen}
        onToggle={() => setExtrasOpen((v) => !v)}
        filled={zusatzGefuellt}
        disabled={busy}
      >
        <div className="inv-grid-2">
          {warehouses.length > 1 && (
            <div className="inv-field">
              <label className="field-label" htmlFor="o-wh">Lager</label>
              <select id="o-wh" className="field-select" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={busy}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}
          <Feld id="o-ref" label="Ihre Referenz" value={customerReference} onChange={setCustomerReference}
                maxLength={80} hint="Erscheint in der Auftragsliste und auf der Detailseite." disabled={busy} />
        </div>
        <div className="inv-field">
          <label className="field-label" htmlFor="o-notes">Notiz</label>
          <textarea id="o-notes" className="field-textarea" rows={2} value={notes}
                    onChange={(e) => setNotes(e.target.value)} maxLength={2000} disabled={busy} />
        </div>
      </CollapsibleSection>

      <div className="inv-form-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>Abbrechen</button>
        {/* Deaktiviert nur bei einem Fehler, den der Nutzer hier sieht und
            beheben kann. Die verbindliche Prüfung bleibt serverseitig. */}
        <button type="submit" className="btn btn-primary" disabled={busy || (showErrors && !absendbar)}>
          {busy ? "Wird angelegt …" : "Auftrag anlegen"}
        </button>
      </div>
    </form>
  );
}
