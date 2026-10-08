/* ── Sprungziele im Adminbereich (UX-Paket 5) ────────────────────────────────
   Ein Link kann beim Öffnen einer Seite einen Bereich aufklappen (Partnerdetail:
   Abrechnungsdaten, Gutschriften, Provisionen) oder den Pre-Live-Testlauf der
   Gutschriften vorbelegen. Getragen wird das ausschließlich über den
   Router-State, zusätzlich zur Herkunft `from` (adminBackLink.mjs) — kein neuer
   Adressparameter, keine neue Route.

   Sicherheit: der State stammt aus der History des Browsers und gilt als
   Eingabe. Ein Bereich wird nur aus der festen Liste geöffnet, der Testlauf nur
   bei einem ausdrücklichen `true`. Über Rechte und Bereich der Daten entscheidet
   weiter allein der Server (der Testlauf erscheint ohnehin nur bei aktivem
   Testmodus). */

const own = (map, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key);

// Bereiche des Partnerdetails, die ein Link gezielt öffnen darf.
export const PARTNER_SECTION_IDS = Object.freeze({
  billing: "adm-sp-billing-card",
  creditNotes: "adm-sp-credit-notes-card",
  commissions: "adm-sp-commissions-card",
});

/** Router-State eines Links ins Partnerdetail: Herkunft plus zu öffnender Bereich. */
export function withSection(from, bereich) {
  const basis = from && typeof from === "object" ? { ...from } : {};
  return own(PARTNER_SECTION_IDS, bereich) ? { ...basis, bereich } : (from || undefined);
}

/** Id des zu öffnenden Bereichs aus dem Router-State — nur aus der festen Liste, sonst null. */
export function sectionFromState(state) {
  const bereich = state && typeof state === "object" ? state.bereich : null;
  return own(PARTNER_SECTION_IDS, bereich) ? PARTNER_SECTION_IDS[bereich] : null;
}

/** Router-State eines Links zu den Gutschriften mit vorbelegtem Pre-Live-Testlauf. */
export function withTestRun(from) {
  return { ...(from && typeof from === "object" ? from : {}), testlauf: true };
}

/** Soll der Pre-Live-Testlauf vorbelegt sein? Nur bei einem ausdrücklichen `true`. */
export const testRunFromState = (state) => !!state && typeof state === "object" && state.testlauf === true;
