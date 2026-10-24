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
//
// Stand 2026-10-24 (Gesamtauftrag C, Canonical v2.73): Geschäftsanschrift Anna-Fischer-Weg 11, 70794
// Filderstadt-Bernhausen, Telefon 016092717124, Ansprechpartner Miguel Vance. Er ist als Geschäftsführer der UG
// vorgesehen — „Geschäftsführer" heißt er erst nach bestätigter Beurkundung, bis dahin „Ansprechpartner". Vor der
// Gründung bleiben beide Betreiber die Diensteanbieter (§ 5 DDG); für den Inhalt (§ 18 Abs. 2 MStV) genügt eine
// verantwortliche Person, deshalb nennt dieser Abschnitt nur Miguel Vance.
export const COMPANY_PROFILE = Object.freeze({
  brand: "ConfidaraExpress",
  formationStatus: "Gründung einer UG (haftungsbeschränkt) in Vorbereitung",
  // Die Personen, die das Angebot betreiben und bereits als Verantwortliche veröffentlicht sind (Diensteanbieter
  // vor der Gründung). Darüber hinaus erscheint der zweite Betreiber nirgends.
  operators: Object.freeze(["Miguel Vance", "Patrick Werner"]),
  // Ansprechpartner für Kunden — Kontaktabschnitt des Impressums und Startseite des Preisrechners.
  contactPerson: "Miguel Vance",
  // Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV — eine Person.
  contentResponsible: "Miguel Vance",
  address: Object.freeze({ street: "Anna-Fischer-Weg 11", zip: "70794", city: "Filderstadt-Bernhausen", country: "Deutschland" }),
  phone: "016092717124",
  email: "support@confidaraexpress.de",
  vatIdNote: "Eine Umsatzsteuer-Identifikationsnummer ist nicht vorhanden.",
  registerNote: "Es besteht keine Eintragung im Handelsregister. Die Gründung einer UG (haftungsbeschränkt) ist in Vorbereitung.",
});

// „ConfidaraExpress – Gründung einer UG (haftungsbeschränkt) in Vorbereitung"
export const COMPANY_DISPLAY_NAME = `${COMPANY_PROFILE.brand} – ${COMPANY_PROFILE.formationStatus}`;
