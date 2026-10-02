// ─────────────────────────────────────────────────────────────────────────────
// Netto/Brutto-Anzeigevertrag — WIE ein bereits feststehender Betrag gezeigt wird.
//
// Betreiberentscheidung 2026-10-02:
//   • Jede ECHTE neue Preisberechnung startet in NETTO (NewShipmentPage, CalculatorPage).
//   • Der Kunde kann jederzeit zwischen netto und brutto umschalten; die Wahl gilt
//     durchgehend über Angebotsliste, Tarifdetails, Optionen, Buchung und Bestätigung.
//   • Die Umschaltung ist REINE DARSTELLUNG: kein Request, keine Neuberechnung, keine
//     Angebotsrevision, keine Bindung, kein anderer Buchungsbetrag.
//   • Der zahlbare Bruttobetrag bleibt in jedem Modus erkennbar.
//
// Dieses Modul WÄHLT ausschließlich zwischen zwei Beträgen, die der Server bereits
// geliefert hat (netto und brutto desselben Preises). Es rechnet nichts: keine Steuer,
// keine Division, keine Summe, keine Rundung. Fehlt der Betrag einer Seite, ist er
// `null` — die Oberfläche zeigt dann „—" und NIE den anderen Betrag unter falscher
// Beschriftung.
//
// Framework-frei, damit die Regeln mit `node --test` direkt prüfbar sind.
// ─────────────────────────────────────────────────────────────────────────────

export const VAT_MODE_NET = "net";
export const VAT_MODE_GROSS = "gross";

export const VAT_TEXT = Object.freeze({
  net: "netto",
  gross: "brutto",
  exclVat: "exkl. MwSt.",
  inclVat: "inkl. MwSt.",
  payable: "zahlbar",
  toggleLabel: "Preisanzeige",
  netTotal: "Gesamtbetrag netto",
});

/** Jeder andere Wert als „gross" ist netto — die Standardanzeige. */
export function normalizeVatMode(mode) {
  return mode === VAT_MODE_GROSS ? VAT_MODE_GROSS : VAT_MODE_NET;
}

export const isGrossVatMode = (mode) => mode === VAT_MODE_GROSS;

// Nur eine echte, endliche Zahl ist ein Betrag. `null`, `undefined`, ein Leerstring oder
// `NaN` bleiben „kein Betrag" — `money()` machte daraus sonst einen erfundenen Nullbetrag.
const betrag = (w) => (typeof w === "number" && Number.isFinite(w) ? w : null);

/**
 * Die beiden Beträge eines Preises in Anzeigereihenfolge: zuerst der des gewählten
 * Modus (`primary`), danach der andere (`secondary`).
 *
 * @param {{net?: number|null, gross?: number|null}} preis  netto und brutto, beide vom Server
 * @param {string} mode  „net" | „gross" (alles andere gilt als netto)
 * @returns {{ mode: string,
 *             primary:   { amount: number|null, isGross: boolean },
 *             secondary: { amount: number|null, isGross: boolean } }}
 */
export function vatDisplay(preis, mode) {
  const p = preis && typeof preis === "object" ? preis : {};
  const netto = betrag(p.net);
  const brutto = betrag(p.gross);
  const m = normalizeVatMode(mode);
  return m === VAT_MODE_GROSS
    ? { mode: m, primary: { amount: brutto, isGross: true }, secondary: { amount: netto, isGross: false } }
    : { mode: m, primary: { amount: netto, isGross: false }, secondary: { amount: brutto, isGross: true } };
}

/** „inkl. MwSt." bzw. „exkl. MwSt." zu einem Betrag aus `vatDisplay`. */
export const vatSuffixText = (isGross) => (isGross ? VAT_TEXT.inclVat : VAT_TEXT.exclVat);
