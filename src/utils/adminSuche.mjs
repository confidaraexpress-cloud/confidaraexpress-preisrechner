// Admin-Suche (/admin/suche, Betreiberauftrag 2026-11-22, D4: am Telefon „plus Suche“) — reine Hilfen ohne React.
// Vertrag: GET /admin/search?q=&types= (Backend routes/admin/search.js): Suchbegriff 2–100 Zeichen, Bereiche
// customers, shipments, invoices (kommagetrennt, ohne Angabe alle), Antwort { customers, shipments, invoices, types }.
// Trackingnummern kommen nur maskiert, Pre-Live-Daten gar nicht; Testbuchungen und nicht produktive Rechnungen tragen
// eine Marke (isTestBooking, isProductive) — hier wird nichts davon erfunden oder umgedeutet.

export const SUCHE_PFAD = "/admin/suche";
export const BEGRIFF_MIN = 2;
export const BEGRIFF_MAX = 100;

export const SUCH_BEREICHE = Object.freeze([
  Object.freeze({ id: "alle", label: "Alle", types: null }),
  Object.freeze({ id: "kunden", label: "Kunden", types: "customers" }),
  Object.freeze({ id: "sendungen", label: "Sendungen", types: "shipments" }),
  Object.freeze({ id: "rechnungen", label: "Rechnungen", types: "invoices" }),
]);

export const SUCHE_TEXT = Object.freeze({
  titel: "Suche",
  untertitel: "Kunden, Sendungen und Rechnungen an einer Stelle finden.",
  feld: "Suchbegriff",
  platzhalter: "Firma, Nummer oder E-Mail",
  hilfe: "Firma, Name, E-Mail oder Kundennummer · Sendungsnummer, Auftragsbestätigung (CE‑AB…), Geschäftsauftrag oder Trackingnummer · Rechnungsnummer.",
  suchen: "Suchen",
  sucht: "Sucht …",
  zuKurz: `Bitte geben Sie mindestens ${BEGRIFF_MIN} Zeichen ein.`,
  zuLang: `Bitte geben Sie höchstens ${BEGRIFF_MAX} Zeichen ein.`,
  leer: "Keine Treffer. Prüfen Sie die Schreibweise oder suchen Sie in allen Bereichen.",
  start: "Geben Sie einen Suchbegriff ein. Die Suche durchsucht alle Kunden, Sendungen und Rechnungen — nicht nur eine Seite.",
  fehler: "Die Suche ist momentan nicht möglich. Bitte versuchen Sie es erneut.",
  zuViele: "Zu viele Suchanfragen. Bitte warten Sie einen Moment.",
  erneut: "Erneut suchen",
  kunden: "Kunden",
  sendungen: "Sendungen",
  rechnungen: "Rechnungen",
  testbuchung: "Testbuchung",
  testrechnung: "Testbeleg",
});

// Woran eine Sendung gefunden wurde (matchedBy des Backends) — nur die Werte, die der Server liefert.
const GEFUNDEN_UEBER = Object.freeze({
  id: "Sendungsnummer",
  order_confirmation: "Auftragsbestätigung",
  business_order: "Geschäftsauftrag",
  tracking: "Trackingnummer",
});
export const gefundenUeber = (matchedBy) => GEFUNDEN_UEBER[matchedBy] || null;

const bereichNachId = (id) => SUCH_BEREICHE.find((b) => b.id === id) || SUCH_BEREICHE[0];

/** Zustand aus der Adresse: ?q=&bereich= — unbekannte Werte fallen auf „alle“ bzw. leer zurück. */
export function sucheAusAdresse(search) {
  const p = new URLSearchParams(typeof search === "string" ? search : "");
  const q = (p.get("q") || "").slice(0, BEGRIFF_MAX);
  return { q, bereich: bereichNachId(p.get("bereich")).id };
}

/** Adresse aus dem Zustand (für navigate mit replace): leerer Begriff und „alle“ bleiben weg. */
export function adresseAusSuche({ q = "", bereich = "alle" } = {}) {
  const p = new URLSearchParams();
  const begriff = String(q).trim();
  if (begriff) p.set("q", begriff);
  if (bereich && bereich !== "alle" && SUCH_BEREICHE.some((b) => b.id === bereich)) p.set("bereich", bereich);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Prüft den Begriff wie der Server (2–100 Zeichen nach trim). → null oder Hinweistext. */
export function begriffPruefen(q) {
  const begriff = String(q ?? "").trim();
  if (begriff.length < BEGRIFF_MIN) return SUCHE_TEXT.zuKurz;
  if (begriff.length > BEGRIFF_MAX) return SUCHE_TEXT.zuLang;
  return null;
}

/** types-Parameter für den Server; null = alle Bereiche (Parameter entfällt). */
export const typesFuerBereich = (bereich) => bereichNachId(bereich).types;

/** Antwort defensiv in Gruppen: nur Felder des Vertrags, Arrays immer vorhanden. */
export function trefferAusAntwort(body) {
  const liste = (x) => (Array.isArray(x) ? x : []);
  const b = body && typeof body === "object" ? body : {};
  const kunden = liste(b.customers).map((c) => ({
    id: c.id, kundennummer: c.customerNumber || null, status: c.status || null,
    firma: c.company || null, name: c.name || null, email: c.email || null,
  }));
  const sendungen = liste(b.shipments).map((s) => ({
    id: s.id, status: s.status || null, carrier: s.carrier || null,
    von: s.fromCountry || null, nach: s.toCountry || null, erstellt: s.createdAt || null,
    auftrag: s.orderConfirmationNumber || null, geschaeftsauftrag: s.businessOrderNumber || null,
    tracking: s.maskedTrackingNumber || null, test: s.isTestBooking === true,
    firma: s.customerCompany || null, kundennummer: s.customerNumber || null, gefunden: gefundenUeber(s.matchedBy),
  }));
  const rechnungen = liste(b.invoices).map((i) => ({
    id: i.id, nummer: i.invoiceNumber || null, status: i.status || null, art: i.documentType || null,
    betrag: i.grossAmount ?? null, waehrung: i.currency || "EUR", erstellt: i.createdAt || null,
    test: i.isProductive === false, firma: i.customerCompany || null, kundennummer: i.customerNumber || null,
  }));
  return { kunden, sendungen, rechnungen, anzahl: kunden.length + sendungen.length + rechnungen.length };
}

/** Fehlertext für eine Antwort ohne Erfolg (400 nennt der Server selbst; 401/403 regelt der Client zentral). */
export function suchFehler(status, body) {
  if (status === 429) return SUCHE_TEXT.zuViele;
  if (status === 400 && body && typeof body.error === "string" && body.error.trim()) return body.error.trim();
  return SUCHE_TEXT.fehler;
}
