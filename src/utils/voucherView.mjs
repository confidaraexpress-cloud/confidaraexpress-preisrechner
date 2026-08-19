// utils/voucherView.mjs — reine Auswertungslogik des Gutscheinfelds im Buchungsschritt 2.
//
// Was hier NICHT passiert — und zwar bewusst:
//   • Es wird KEIN Rabatt berechnet. Kein „Code = 100 %", kein Prozentsatz, keine Rabatthöhe.
//   • Es wird KEIN Preis abgeleitet. Jeder Betrag stammt aus der serverbestätigten Antwort.
//   • Es gibt KEINE Liste gültiger Codes im Frontend. Ob ein Code gilt, weiß nur der Server
//     (und letztlich nur JUMiNGO). Das Feld nimmt beliebigen Text entgegen und fragt nach.
// Damit kann ein manipulierter Client keinen 0-Euro-Preis erzeugen — er kann höchstens eine
// Anzeige verfälschen, die die Buchung ohnehin nicht bindet: /book prüft unmittelbar vor der
// Bestellung erneut vollständig gegen JUMiNGO.
//
// Version 1 unterstützt ausschließlich den offiziellen JUMiNGO-TESTGUTSCHEIN. Es ist bewusst
// KEINE allgemeine Rabattengine: keine Kampagnen, keine Stapelung, keine Mehrfachgutscheine.

// Zustände des Felds. Bewusst klein und endlich — kein State-Management-Paket, kein Reducer.
export const VOUCHER_STATUS = {
  IDLE:     "idle",     // nichts angewendet
  CHECKING: "checking", // Serverprüfung läuft
  APPLIED:  "applied",  // vom Server bestätigt
  INVALID:  "invalid",  // Server sagt: nicht anwendbar
  ERROR:    "error",    // technischer Fehler (Netz/Server)
};

// EINE Meldung für „nicht anwendbar". Sie unterscheidet bewusst nicht zwischen „Code existiert
// nicht", „nicht berechtigt", „falscher Tarif" oder „vom Provider abgelehnt": jede Differenzierung
// wäre eine Auskunft darüber, welche Codes es gibt und wer sie benutzen darf.
export const VOUCHER_INVALID_MESSAGE = "Gutscheincode konnte nicht angewendet werden.";
// Technische Störung — hier ist ein erneuter Versuch sinnvoll, deshalb ein anderer Text.
export const VOUCHER_ERROR_MESSAGE = "Der Gutscheincode konnte gerade nicht geprüft werden. Bitte versuchen Sie es erneut.";

// Ein Gutscheincode wird getrimmt, aber sonst unverändert übernommen. Keine Normalisierung auf
// Kleinschreibung im Frontend: welche Schreibweise gilt, entscheidet der Server.
export function normalizeVoucherInput(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function canSubmitVoucher(inputCode, status) {
  return normalizeVoucherInput(inputCode).length > 0 && status !== VOUCHER_STATUS.CHECKING;
}

// Eine Zahl aus der Serverantwort. 0 ist ein GÜLTIGER Betrag und darf nie als „fehlt" gelten —
// deshalb keine Falsy-Prüfung, sondern ausschließlich Number.isFinite.
function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Wertet die Antwort von POST /api/jumingo/cart-total aus.
//
// Ein Gutschein gilt NUR dann als angewendet, wenn der Server es ausdrücklich sagt
// (`voucher.applied === true`) UND belastbare Beträge mitliefert. Fehlt eines davon, ist das
// Ergebnis „nicht anwendbar" — niemals „wahrscheinlich schon". Fail-safe, nicht fail-open.
export function readVoucherResponse(body) {
  const b = body && typeof body === "object" ? body : {};
  const v = b.voucher && typeof b.voucher === "object" ? b.voucher : {};
  const t = b.totals && typeof b.totals === "object" ? b.totals : {};

  if (v.applied !== true) return { status: VOUCHER_STATUS.INVALID, code: null, totals: null, percent: null };

  const totals = {
    subtotalNet:   num(t.subtotalNet),
    subtotalVat:   num(t.subtotalVat),
    subtotalGross: num(t.subtotalGross),
    discountGross: num(t.discountGross),
    finalNet:      num(t.finalNet),
    finalVat:      num(t.finalVat),
    finalGross:    num(t.finalGross),
  };
  // Ohne belegten Endbetrag und ohne belegten Zwischenbetrag ist die Antwort nicht darstellbar.
  if (totals.finalGross === null || totals.subtotalGross === null) {
    return { status: VOUCHER_STATUS.INVALID, code: null, totals: null, percent: null };
  }
  const code = typeof v.code === "string" && v.code.trim() !== "" ? v.code.trim() : null;
  if (!code) return { status: VOUCHER_STATUS.INVALID, code: null, totals: null, percent: null };

  return {
    status: VOUCHER_STATUS.APPLIED,
    code,
    percent: num(v.percent),
    totals,
    testBooking: b.testBooking === true,
  };
}

// Die Preiszeilen des Bestätigungsschritts.
//
// Ohne angewendeten Gutschein bleibt die Darstellung EXAKT wie bisher (ein Gesamtbetrag) — die
// normale Buchung verändert sich nicht. Mit Gutschein kommen Zwischensumme, Rabattzeile und
// „Zu zahlen" hinzu; die ursprünglichen Beträge bleiben sichtbar, damit der Kunde erkennt, was
// der Gutschein bewirkt hat.
export function voucherPriceLines({ voucher, fallbackGross }) {
  const applied = voucher && voucher.status === VOUCHER_STATUS.APPLIED && voucher.totals;
  if (!applied) {
    return { hasVoucher: false, subtotalGross: num(fallbackGross), discountGross: null, finalGross: num(fallbackGross) };
  }
  return {
    hasVoucher: true,
    subtotalGross: voucher.totals.subtotalGross,
    discountGross: voucher.totals.discountGross,
    finalGross:    voucher.totals.finalGross,
    code:          voucher.code,
    percent:       voucher.percent,
  };
}

// ── Invalidierung ────────────────────────────────────────────────────────────
// Ein angewendeter Gutschein muss sofort verfallen, sobald sich etwas PREIS- ODER TARIFRELEVANTES
// ändert — sonst stünde ein bestätigter 0-Euro-Betrag neben einer inzwischen anderen Sendung.
//
// Bewusst NICHT invalidierend: Referenznummer, Labelformat und die rein informativen
// E-Mail-Optionen. Sie ändern den Preis nicht, und ein unnötiger Verfall wäre für den Nutzer
// nur lästig.
//
// Die Liste beschreibt die preisbildenden Größen des Buchungsvorgangs; sie ist bewusst
// vollständig aufgeführt statt „alles außer X", damit ein neu hinzukommendes Feld eine bewusste
// Entscheidung erzwingt.
export const VOUCHER_PRICE_RELEVANT_KEYS = [
  "tariffId", "shipperTariffId", "serviceType",
  "insuranceType", "insuranceValue", "goodsValue",
  "weight", "length", "width", "height", "packageCount",
  "senderCountry", "senderZip", "recipientCountry", "recipientZip",
  "shippingDate", "pickupWindow",
];

// Erzeugt den Vergleichsschlüssel. Ändert er sich, verfällt der Gutschein. Reine Funktion,
// damit die Regel testbar ist und nicht in einem Effekt versteckt liegt.
export function voucherInvalidationKey(source) {
  const s = source && typeof source === "object" ? source : {};
  return VOUCHER_PRICE_RELEVANT_KEYS
    .map((k) => `${k}=${s[k] === null || s[k] === undefined ? "" : String(s[k])}`)
    .join("|");
}

export function shouldInvalidateVoucher(previousKey, nextKey) {
  return typeof previousKey === "string" && previousKey !== nextKey;
}
