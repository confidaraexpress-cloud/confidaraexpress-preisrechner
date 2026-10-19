// src/config/companyProfile.js — die öffentlichen Unternehmensangaben an EINER Stelle (Schritt 3, 2026-10-17).
//
// Betreiberentscheidung 2026-10-17 (Canonical Context 1A „Unternehmensstatus und Darstellung"):
//   • ConfidaraExpress ist KEINE gegründete GbR.
//   • Die Gründung einer UG (haftungsbeschränkt) ist beschlossen; Beurkundung und Eintragung sind nicht bestätigt.
//   • Freigegebene Darstellung: „ConfidaraExpress – Gründung einer UG (haftungsbeschränkt) in Vorbereitung".
//     „UG (haftungsbeschränkt) i. G." erst nach bestätigter Beurkundung, nach der Eintragung die eingetragenen Daten.
//
// Marke ≠ Rechnungsaussteller: Rechnungen tragen ausschließlich die serverseitigen Ausstellerdaten. Hier steht nur,
// was bereits veröffentlicht und belegt ist — keine erfundenen Register-, Steuer- oder Geschäftsführerangaben.
// Veröffentlichte Rechtsfassungen (AGB 2026-08, Datenschutzerklärung 2026-07) bleiben wortgleich und lesen hier
// bewusst NICHT mit (Canonical 5.6/5.7).
export const COMPANY_PROFILE = Object.freeze({
  brand: "ConfidaraExpress",
  formationStatus: "Gründung einer UG (haftungsbeschränkt) in Vorbereitung",
  // Die Personen, die das Angebot betreiben und bereits als Verantwortliche veröffentlicht sind.
  operators: Object.freeze(["Miguel Vance", "Patrick Werner"]),
  address: Object.freeze({ street: "Weiherstraße 25", zip: "73207", city: "Plochingen", country: "Deutschland" }),
  phone: "015118003775",
  email: "support@confidaraexpress.de",
  vatIdNote: "Eine Umsatzsteuer-Identifikationsnummer ist nicht vorhanden.",
  registerNote: "Es besteht keine Eintragung im Handelsregister. Die Gründung einer UG (haftungsbeschränkt) ist in Vorbereitung.",
});

// „ConfidaraExpress – Gründung einer UG (haftungsbeschränkt) in Vorbereitung"
export const COMPANY_DISPLAY_NAME = `${COMPANY_PROFILE.brand} – ${COMPANY_PROFILE.formationStatus}`;
