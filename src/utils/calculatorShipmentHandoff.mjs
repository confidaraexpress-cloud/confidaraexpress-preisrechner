/* ── Preisrechner → „Neue Sendung": die Übergabe eines gewählten Angebots ─────────
   Produktionsbefund 2026-10-02: „Angebot auswählen" im Preisrechner öffnete „Neue Sendung"
   leer — Route, Paket, Versanddatum und das gewählte Angebot waren weg, das Datum stand auf
   heute. Ursache: der Preisrechner führt seinen Vorgang im Bereich „calculator", „Neue
   Sendung" liest beim Mount den Bereich „shipment" — eine Übergabe zwischen beiden gab es
   nicht, der Knopf navigierte nur.

   Dieses Modul bildet die Übergabe. Rein: kein React, kein Netz, kein Preis, keine Uhr.

   ── Nur, was der Preisrechner KENNT ─────────────────────────────────────────────────
   Land, PLZ und Ort beider Seiten, die Paketdaten, das Versanddatum, Abhol- und
   Versandartfilter und der Netto-/Brutto-Modus. Keine Straße, kein Name, keine Firma, kein
   Kontakt, keine Sendungsangaben — der Preisrechner erhebt sie nicht, und erfunden wird
   nichts. Diese Felder bleiben leer und werden in „Neue Sendung" ergänzt.

   ── Das Angebot reist nur als ABSICHT ───────────────────────────────────────────────
   Übergeben werden der Anzeigename und die Felder der bestehenden Angebotsidentität
   (`offerKey` in offerIdentity.mjs: `offerId`, als dokumentierter Rückfall die Tarif-ID) —
   NIE Preis, Buchbarkeit oder das Angebotsobjekt. Ein Preisrechner-Angebot ist an keine
   vollständige Sendung gebunden; buchbar wird erst, was „Neue Sendung" mit den vollständigen
   Angaben serverseitig neu berechnet hat. Die Absicht steht deshalb nie in `selected` des
   Vorgangs — genau dieses Feld liest die Buchungsseite als Rückfallquelle.

   ── Auflösung genau EINMAL, ohne zu raten ────────────────────────────────────────────
   Nach der ersten erfolgreichen Neuberechnung wird die Absicht aufgelöst: trägt die neue
   Liste GENAU EIN auswählbares Angebot derselben Identität, wird es markiert; sonst wird
   nichts markiert und ein Hinweis gezeigt. Kein Name-, Carrier- oder Preisvergleich — ein
   ähnliches Angebot ist nicht dasselbe. Die `offerId` ist je Berechnung neu; laufübergreifend
   trägt nur die Tarif-ID (JUMiNGO-Tarife, z. B. 3588 oder „s-2036"). Transglobal-Angebote
   führen öffentlich keine dauerhafte Kennung — ihre Absicht wird nach der Neuberechnung
   deshalb ehrlich gelöst statt geraten.

   ── Zweite Quelle: der öffentliche Preisrechner (2026-10-16) ────────────────────────
   Von preisrechner.confidaraexpress.de kommt die Auswahl nach dem Login über das geprüfte
   Übergabetoken (POST /api/price-quote/handoff/verify): dieselben 15 Felder wie hier, dazu die
   Tarifwahl. Ihre Identität ist der `productKey` — derselbe Schlüssel, den der Server auch in die
   Kundenantwort schreibt (aus Quelle, Produkt und Übergabeart, laufübergreifend stabil). Die
   Absicht trägt zusätzlich den öffentlichen Preis samt Status, NUR zum sichtbaren Vergleich: nach
   der Neuberechnung steht der Kundenpreis daneben, nie still an seiner Stelle. */

import { createEmptyShipmentForm } from "./newShipmentForm.mjs";
// Individuelle Mehrpaketsendungen (Canonical v2.79): weitere Zeilen reisen mit.
import { normalizeExtraPackageLines, formPatchFromServerPackageLines, EXTRA_PACKAGE_LINES_KEY } from "./packageLines.mjs";
import { offerSelectable, sameOffer } from "./offerIdentity.mjs";
// Dieselben Wertelisten wie Formularentwurf und Vorgang — keine zweite Aufzählung.
import { FORM_SERVICE_FILTERS, FORM_SHIPPING_MODES } from "./formDraftsView.mjs";

export const CALCULATOR_INTENT_SOURCE = "calculator";
export const PUBLIC_CALCULATOR_INTENT_SOURCE = "public_calculator";
const QUELLEN = Object.freeze([CALCULATOR_INTENT_SOURCE, PUBLIC_CALCULATOR_INTENT_SOURCE]);
const PRODUCT_KEY_RE = /^pk1_[A-Za-z0-9_-]{22}$/;
const PREISSTATUS = Object.freeze(["exact", "from"]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PACKAGE_KEYS = ["packageCount", "weight", "length", "width", "height"];

const text = (v) => (typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

const betrag = (w) => (typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : null);

/** Der öffentliche Preis einer Übergabe — nur zum Vergleich, nie zur Buchung. */
function oeffentlicherPreis(raw) {
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  if (!p || !PREISSTATUS.includes(p.priceStatus) || betrag(p.netPrice) === null) return null;
  return Object.freeze({
    priceStatus: p.priceStatus,
    netPrice: betrag(p.netPrice),
    vatAmount: betrag(p.vatAmount),
    finalPrice: betrag(p.finalPrice),
    currency: typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency) ? p.currency : null,
  });
}

/**
 * Die Absicht in geprüfter Form — oder `null`. Ohne Anzeigename oder ohne jede
 * Identität ist sie wertlos und wird verworfen. Eine Absicht aus dem öffentlichen
 * Preisrechner trägt als Identität ausschließlich den `productKey`.
 *
 * @returns {{source: "calculator", offerId: string|null, tariffId: string|number|null, label: string}
 *          |{source: "public_calculator", offerId: null, tariffId: null, label: string, productKey: string,
 *            publicPrice: object|null}|null}
 */
export function normalizeCalculatorIntent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!QUELLEN.includes(raw.source)) return null;
  if (raw.source === PUBLIC_CALCULATOR_INTENT_SOURCE) {
    const productKey = typeof raw.productKey === "string" && PRODUCT_KEY_RE.test(raw.productKey) ? raw.productKey : null;
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 160) : "";
    if (label === "" || productKey === null) return null;
    return Object.freeze({
      source: PUBLIC_CALCULATOR_INTENT_SOURCE, offerId: null, tariffId: null, label, productKey,
      publicPrice: oeffentlicherPreis(raw.publicPrice),
    });
  }
  const offerId = typeof raw.offerId === "string" && raw.offerId.trim() !== "" && raw.offerId.trim().length <= 64
    ? raw.offerId.trim() : null;
  const tariffId = typeof raw.tariffId === "number" && Number.isFinite(raw.tariffId)
    ? raw.tariffId
    : typeof raw.tariffId === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(raw.tariffId.trim())
      ? raw.tariffId.trim() : null;
  const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 160) : "";
  if (label === "" || (offerId === null && tariffId === null)) return null;
  return Object.freeze({ source: CALCULATOR_INTENT_SOURCE, offerId, tariffId, label });
}

/**
 * Die Übergabe als Patch für den Bereich „shipment" des laufenden Vorgangs.
 *
 * Ein vollständiger Bereich: Formular, Datum und Filter aus dem Preisrechner, alles
 * Ergebnisabhängige leer. Der Aufrufer leert den Bereich vorher — nichts aus einem älteren
 * Sendungsvorgang wird mit dieser Übergabe gemischt.
 *
 * @param {object} arg
 * @param {object} arg.calculator  Stand des Preisrechners: { form, shippingDate, serviceFilter,
 *                                 shippingModeFilter, vatMode }
 * @param {object} arg.tariff      das gewählte Angebot (nur Identität wird gelesen)
 * @param {string} arg.label       Anzeigename „Carrier · Service" aus den bestehenden Anzeigehelfern
 */
export function calculatorSelectionToShipmentTransfer({ calculator, tariff, label } = {}) {
  const c = calculator && typeof calculator === "object" ? calculator : {};
  const f = c.form && typeof c.form === "object" ? c.form : {};
  const form = createEmptyShipmentForm();
  form.s_country = text(f.from_country);
  form.s_zip = text(f.from_zip);
  form.s_city = text(f.from_city);
  form.r_country = text(f.to_country);
  form.r_zip = text(f.to_zip);
  form.r_city = text(f.to_city);
  for (const k of PACKAGE_KEYS) {
    const wert = text(f[k]);
    // Die Paketanzahl behält ihre Vorgabe, wenn der Preisrechner keine trägt.
    if (wert !== "" || k !== "packageCount") form[k] = wert;
  }
  // Weitere Paketzeilen (Canonical v2.79): unverändert mit — die Übergabe verliert keine Zeile.
  const weitere = normalizeExtraPackageLines(f[EXTRA_PACKAGE_LINES_KEY]);
  if (weitere.length) form[EXTRA_PACKAGE_LINES_KEY] = weitere;
  const t = tariff && typeof tariff === "object" ? tariff : {};
  return {
    form,
    shippingDate: typeof c.shippingDate === "string" && ISO_DATE_RE.test(c.shippingDate) ? c.shippingDate : null,
    serviceFilter: FORM_SERVICE_FILTERS.includes(c.serviceFilter) ? c.serviceFilter : "all",
    shippingModeFilter: FORM_SHIPPING_MODES.includes(c.shippingModeFilter) ? c.shippingModeFilter : "all",
    // Die Auswahlliste der Versanddienste entsteht erst aus einer Berechnung — wie beim
    // Fortsetzen eines Entwurfs wird der Carrierfilter deshalb nicht übernommen.
    selectedPublicCarrierIds: [],
    sortMode: "recommended",
    vatMode: c.vatMode === "gross" ? "gross" : "net",
    tariffs: [],
    publicCarriers: [],
    selected: null,
    ceShipmentId: null,
    customs: null,
    inventoryContext: null,
    calculatedAt: null,
    scrollY: 0,
    calculatorIntent: normalizeCalculatorIntent({
      source: CALCULATOR_INTENT_SOURCE,
      offerId: typeof t.offerId === "string" ? t.offerId : null,
      tariffId: t.id ?? null,
      label,
    }),
  };
}

/**
 * Die Übergabe aus dem öffentlichen Preisrechner als Patch für „shipment" — dieselbe Form wie die
 * Übergabe des Kundenrechners. Die geprüften Eingaben (Antwort von handoff/verify) tragen dieselben
 * Feldnamen wie dessen Formular; die Tarifwahl reist nur als Absicht samt öffentlichem Preis.
 *
 * @param {object} arg
 * @param {object} arg.input      geprüfte Eingaben (15 Felder)
 * @param {object} arg.selection  Tarifwahl: { productKey, priceStatus, netPrice, vatAmount, finalPrice, currency }
 * @param {string} arg.label      Anzeigename „Carrier · Service" aus den bestehenden Anzeigehelfern
 */
export function publicQuoteToShipmentTransfer({ input, selection, label } = {}) {
  const i = input && typeof input === "object" ? input : {};
  const auswahl = selection && typeof selection === "object" ? selection : {};
  // Unterschiedliche Pakete (Canonical v2.79) reisen als `packageLines` (Zahlen, Vertrag der API) —
  // im Formular werden daraus Zeile 1 und `extraPackageLines`.
  const paketzeilen = formPatchFromServerPackageLines(i.packageLines);
  const patch = calculatorSelectionToShipmentTransfer({
    calculator: {
      form: paketzeilen ? { ...i, ...paketzeilen } : i,
      shippingDate: i.shippingDate,
      serviceFilter: i.serviceFilter,
      shippingModeFilter: i.shippingModeFilter,
      vatMode: "net",
    },
    tariff: {},
    label,
  });
  return {
    ...patch,
    calculatorIntent: normalizeCalculatorIntent({
      source: PUBLIC_CALCULATOR_INTENT_SOURCE,
      productKey: auswahl.productKey,
      label,
      publicPrice: auswahl,
    }),
  };
}

/**
 * Löst die Absicht gegen die Angebote einer NEUEN Berechnung auf.
 *
 * `matched` nur bei GENAU EINEM auswählbaren Angebot derselben Identität (dieselbe `offerId`
 * oder dieselbe Tarif-ID, verglichen über `sameOffer`). Alles andere ist `unmatched` — es wird
 * kein ähnliches Angebot gewählt.
 *
 * @returns {{outcome: "matched"|"unmatched", offer: object|null, label: string}|null}
 */
export function resolveCalculatorIntent(tariffs, intent) {
  const absicht = normalizeCalculatorIntent(intent);
  if (!absicht) return null;
  const liste = Array.isArray(tariffs) ? tariffs : [];
  if (absicht.source === PUBLIC_CALCULATOR_INTENT_SOURCE) {
    // Derselbe productKey in der Kundenantwort — genau ein auswählbarer Treffer oder keiner.
    const gleich = liste.filter((t) => t && typeof t === "object" && t.productKey === absicht.productKey);
    const angebot = gleich.length === 1 && offerSelectable(gleich[0]) ? gleich[0] : null;
    return Object.freeze({
      outcome: angebot ? "matched" : "unmatched", offer: angebot, label: absicht.label,
      source: PUBLIC_CALCULATOR_INTENT_SOURCE, publicPrice: absicht.publicPrice,
    });
  }
  const treffer = liste.filter((t) => t && typeof t === "object" && (
    (absicht.offerId !== null && sameOffer({ offerId: absicht.offerId }, t))
    || (absicht.tariffId !== null && sameOffer({ id: absicht.tariffId }, { id: t.id }))));
  const offer = treffer.length === 1 && offerSelectable(treffer[0]) ? treffer[0] : null;
  return Object.freeze({ outcome: offer ? "matched" : "unmatched", offer, label: absicht.label });
}

/**
 * Der Hinweis in „Neue Sendung" — oder "" ohne Absicht.
 *
 *   offene Absicht                → sie ist sichtbar, und der Weg (ergänzen, neu vergleichen) ist genannt
 *   aufgelöst, Angebot markiert    → nur solange genau dieses Angebot ausgewählt ist
 *   aufgelöst, nicht zuzuordnen    → ehrlich, ohne Grund zu erfinden
 */
export function calculatorIntentNotice({ intent = null, resolution = null, selected = null } = {}) {
  const absicht = normalizeCalculatorIntent(intent);
  if (absicht) {
    return `Ihr Angebot aus dem Preisrechner: ${absicht.label}. Bitte ergänzen Sie die fehlenden Angaben und `
      + "vergleichen Sie die Angebote — Preis und Verfügbarkeit werden dabei mit Ihren vollständigen Angaben neu berechnet.";
  }
  if (!resolution || typeof resolution !== "object") return "";
  if (resolution.outcome === "matched") {
    return resolution.offer && sameOffer(resolution.offer, selected)
      ? `Ihr Angebot aus dem Preisrechner ist ausgewählt: ${resolution.label}. Der Preis wurde mit Ihren vollständigen Angaben neu berechnet.`
      : "";
  }
  if (resolution.outcome === "unmatched") {
    return `Das im Preisrechner gewählte Angebot (${resolution.label}) lässt sich nach der neuen Berechnung `
      + "nicht eindeutig zuordnen. Bitte wählen Sie ein Angebot aus der Liste.";
  }
  return "";
}

/* ── Preisvergleich nach der Übernahme aus dem öffentlichen Preisrechner ─────────────
   Nur bei genau einem Treffer und nur, solange genau dieses Angebot ausgewählt ist: der neu
   berechnete Kundenpreis NEBEN dem öffentlichen Preis samt Status („ab" oder exakt). Weicht er
   ab, sagt der Satz es deutlich; überschrieben wird nichts, gebucht wird der neue Preis. */
const euro = (w) => (betrag(w) === null ? null : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(w));

export const PUBLIC_PRICE_COMPARISON_TEXT = Object.freeze({
  title: "Preisvergleich zu Ihrer Auswahl im Preisrechner",
  publicLabel: "Preis im Preisrechner",
  customerLabel: "Ihr Preis jetzt",
  changed: "Der neu berechnete Preis weicht vom Preis im Preisrechner ab. Gebucht wird der neu berechnete Preis.",
  same: "Der neu berechnete Preis entspricht dem Preis im Preisrechner.",
  fromNote: "Im Preisrechner war das ein „ab“-Preis ohne vollständige Sendungsangaben.",
});

/**
 * @returns {{publicNet: string, publicGross: string|null, customerNet: string, customerGross: string|null,
 *            changed: boolean, note: string, fromNote: string|null}|null}
 */
export function publicPriceComparison({ resolution = null, selected = null } = {}) {
  const r = resolution && typeof resolution === "object" ? resolution : null;
  if (!r || r.source !== PUBLIC_CALCULATOR_INTENT_SOURCE || r.outcome !== "matched" || !r.offer) return null;
  if (!sameOffer(r.offer, selected)) return null;
  const oeffentlich = r.publicPrice;
  const kunde = selected;
  const kundeNetto = euro(kunde.netPrice);
  if (!oeffentlich || kundeNetto === null) return null;
  const vorsatz = oeffentlich.priceStatus === "from" ? "ab " : "";
  const geaendert = Math.round(oeffentlich.netPrice * 100) !== Math.round(kunde.netPrice * 100);
  return {
    publicNet: `${vorsatz}${euro(oeffentlich.netPrice)}`,
    publicGross: oeffentlich.finalPrice === null ? null : `${vorsatz}${euro(oeffentlich.finalPrice)}`,
    customerNet: kundeNetto,
    customerGross: euro(kunde.finalPrice),
    changed: geaendert,
    note: geaendert ? PUBLIC_PRICE_COMPARISON_TEXT.changed : PUBLIC_PRICE_COMPARISON_TEXT.same,
    fromNote: oeffentlich.priceStatus === "from" ? PUBLIC_PRICE_COMPARISON_TEXT.fromNote : null,
  };
}
