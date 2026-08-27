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
// (contactName→fullName, addressAdd→addressAddition, postalCode/city/country/
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
    fullName: a.contactName || "",
    streetAndNumber: a.streetAndNumber || "",
    addressAddition: a.addressAdd || "",
    postalCode: a.postalCode || "",
    city: a.city || "",
    country: (a.country || "DE").toUpperCase(),
    phone: a.phone || "",
    email: a.email || "",
  };
}
