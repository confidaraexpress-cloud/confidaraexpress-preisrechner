/* ── Adressbuch — Feldauslegung in Versand und Auftrag ────────────────────────
   Herausgelöst aus addressBookView.mjs (Modularisierungs-Audit). DIE eine
   Stelle, an der Adressbuchfelder ausgelegt werden (siehe CLAUDE.md,
   „Adressbuchauswahl im Versandformular"): beide Zielschemata — das
   NewShipmentPage-Formular und der Auftrags-Empfänger — liegen bewusst
   nebeneinander in diesem Modul, damit sie nicht auseinanderlaufen.
   Kein React, kein Netzwerk. */

import { normalizeStateCode } from "./stateCodes.mjs";

// Adressobjekt → Patch für das bestehende NewShipmentPage-Formular (Präfix
// "s_" oder "r_"). Reiner Wertekopie — KEINE dauerhafte addressId-Referenz.
// JUMiNGO-Mapping: contactName→fullName, streetAndNumber→street,
// addressAdd→addition, postalCode→zip, company→company, city/country/email/
// phone direkt. `state` hat im bestehenden Formular kein Zielfeld → bewusst
// NICHT gesetzt (keine Felder ergänzen, die es nicht gibt).
export function mapAddressToShipmentFormPatch(address, prefix) {
  const a = address || {};
  const p = prefix === "r" ? "r" : "s";
  return {
    [`${p}_company`]: a.company || "",
    // Die strukturierte Kontaktperson wird übernommen, wenn die Adresse sie führt.
    //
    // Trägt sie nur den alten `contactName` (Altbestand), bleiben diese beiden Felder
    // LEER — sie werden nicht aus ihm erzeugt. Der Kunde sieht dann zwei leere
    // Pflichtfelder und ergänzt sie bewusst; das ist der ganze Zweck der Trennung. Ein
    // geratener Nachname wäre schlimmer als ein leeres Feld.
    [`${p}_firstName`]: a.firstName || "",
    [`${p}_lastName`]: a.lastName || "",
    // Der Altwert wandert weiter in das (nicht mehr sichtbare) Legacyfeld, damit er im
    // Vorgang und im Entwurf nicht verloren geht. Gebucht wird er nur, solange die
    // strukturierten Felder fehlen — und die sind Pflicht, also praktisch nie.
    [`${p}_fullName`]: a.contactName || "",
    [`${p}_street`]: a.streetAndNumber || "",
    [`${p}_addition`]: a.addressAdd || "",
    [`${p}_zip`]: a.postalCode || "",
    [`${p}_city`]: a.city || "",
    [`${p}_country`]: (a.country || "DE").toUpperCase(),
    // Bundesstaat nur übernehmen, wenn er für DIESES Land überhaupt gilt und ein belegter Code
    // ist. Das Adressbuchfeld ist historisch Freitext („Bundesland / Region", z. B. „Berlin"):
    // ein solcher Wert darf nicht als US-Bundesstaat in eine Sendung wandern, sondern fällt hier
    // auf leer zurück und wird im Formular bewusst neu gewählt.
    [`${p}_state`]: normalizeStateCode(a.country, a.state),
    [`${p}_phone`]: a.phone || "",
    [`${p}_email`]: a.email || "",
  };
}

// Adressobjekt → Empfängerform eines Auftrags (`recipient` in
// POST /api/kunde/orders). Geschwister-Mapper zu mapAddressToShipmentFormPatch:
// dieselbe Quelle, dieselben Feldbedeutungen, nur ein anderes Zielschema
// (firstName/lastName direkt, addressAdd→addressAddition, postalCode/city/country/
// phone/email/company direkt). Bewusst HIER und nicht im Auftragsformular — es
// gibt genau eine Stelle, an der Adressbuchfelder ausgelegt werden.
//
// `state`, `label`, `notes`, `role` und die Standardflags haben im Auftrag kein
// Ziel und werden NICHT übernommen (keine Felder erfinden, die es nicht gibt).
// Das Ergebnis ist eine reine Vorbelegung: der Auftrag speichert einen Snapshot,
// es entsteht KEINE dauerhafte Referenz auf die Adressbuchzeile.
export function mapAddressToOrderRecipient(address) {
  const a = address || {};
  return {
    company: a.company || "",
    // Eingabe-Audit A5 (2026-11-03): Vor- und Nachname gehen getrennt in den Auftrag — wie die Kontaktperson der
    // Sendung. Bisher wurden sie zu `fullName` zusammengesetzt, und „Versand vorbereiten“ verlor sie, weil ein
    // Name nie zerlegt wird. Ein Altwert `contactName` ohne getrennte Felder bleibt leer: der Kunde ergänzt ihn.
    firstName: String(a.firstName || "").trim(),
    lastName: String(a.lastName || "").trim(),
    streetAndNumber: a.streetAndNumber || "",
    addressAddition: a.addressAdd || "",
    postalCode: a.postalCode || "",
    city: a.city || "",
    country: (a.country || "DE").toUpperCase(),
    phone: a.phone || "",
    email: a.email || "",
  };
}
