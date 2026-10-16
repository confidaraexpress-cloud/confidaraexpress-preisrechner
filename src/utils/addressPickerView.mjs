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

// Die Kontaktperson einer Adresse (Paritätsaudit A2). Seit dem Versandkontakt-
// Vertrag sind Vor- und Nachname bei neuen Adressen Pflicht; `contactName` trägt
// nur noch der Altbestand (er wird nie zerlegt). Vorher lasen Liste, Picker und
// Rollen-Dialog ausschließlich `contactName` — die Person neuer Adressen erschien
// nirgends, eine Adresse ohne Bezeichnung und Firma hieß „Ohne Bezeichnung“.
export function addressContactPerson(address) {
  const a = address || {};
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  const vollerName = [text(a.firstName), text(a.lastName)].filter(Boolean).join(" ");
  return vollerName || text(a.contactName);
}

// Zeile 1 — der beste vorhandene Name: Bezeichnung, Firma, sonst die Kontaktperson.
export function addressPickerLabel(address) {
  const a = address || {};
  const name = ((a.label || a.company || "").trim()) || addressContactPerson(a);
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
  const person = addressContactPerson(a);
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
