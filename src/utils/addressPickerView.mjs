/* ── Adressbuch — Darstellung eines Treffers in der Adressauswahl ─────────────
   Herausgelöst aus addressBookView.mjs (Modularisierungs-Audit). Fachmodul des
   AddressPickers: die drei Anzeigezeilen eines Treffers. Kein React, kein
   Netzwerk.

   DREI Zeilen, drei reine Funktionen: Bezeichnung/Firma · Person · Anschrift.

   Warum drei und nicht zwei: mit nur Name + Anschrift sahen zwei Einträge
   DERSELBEN Firma an DERSELBEN Adresse mit unterschiedlichen Ansprechpartnern
   vollkommen identisch aus — genau der Fall, für den ein Adressbuch zwei Zeilen
   führt. Die Kontaktperson stand in `addressPickerLabel` nur dann, wenn weder
   Bezeichnung noch Firma existierten; sonst fiel sie ersatzlos weg.

   Hier wird nichts gekürzt und nichts abgeschnitten: ein langer Firmenname
   bricht in der Darstellung um (CSS), er verliert keine Zeichen. Und es wird
   nie ein roher Backendwert als Ersatz eingesetzt, nie „undefined" im Text. */

// Zeile 1 — der beste vorhandene Name. Unverändert (Bestandsverhalten).
export function addressPickerLabel(address) {
  const a = address || {};
  const name = (a.label || a.company || a.contactName || "").trim();
  return name || "Ohne Bezeichnung";
}

// Zeile 2 — was Zeile 1 NICHT schon sagt: im Normalfall die Kontaktperson.
// Trägt der Eintrag zusätzlich eine eigene Bezeichnung („Zentrale"), steht die
// Firma hier mit — sonst ginge sie unter. Doppelungen entstehen nicht: was
// bereits Zeile 1 ist, erscheint hier nicht noch einmal. Leerer String heißt
// „diese Zeile entfällt" (kein leerer Absatz in der Liste).
export function addressPickerPerson(address) {
  const a = address || {};
  const titel = addressPickerLabel(a);
  const teile = [];
  const firma = typeof a.company === "string" ? a.company.trim() : "";
  const person = typeof a.contactName === "string" ? a.contactName.trim() : "";
  if (firma && firma !== titel) teile.push(firma);
  if (person && person !== titel) teile.push(person);
  return teile.join(" · ");
}

// Zeile 3 — die Anschrift: Straße · PLZ Ort · Land.
export function addressPickerMeta(address) {
  const a = address || {};
  return [a.streetAndNumber, [a.postalCode, a.city].filter(Boolean).join(" ").trim(), a.country]
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean)
    .join(" · ");
}
