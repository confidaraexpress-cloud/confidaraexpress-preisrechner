/* ── Texte der Kunden-Anmeldung (Betreiberentscheidung G1, 2026-10-27) ─────────────────────────────────────
   Eine Quelle für die React-Seite (pages/AuthPage.jsx) und das statische Seitengerüst (login.html, register.html),
   das dieselben Sätze vor dem ersten Rendern zeigt — authSeitenGeruest.test.mjs hält beide gleich.

   Botschaft wie der öffentliche Preisrechner: „Versand- und Logistikmanagement für Unternehmen.“ Der weiche
   Trennstrich in „Logistik|management (U+00AD)“ erlaubt den Umbruch in schmalen Spalten. Ehrlichkeitsgrenze (Audit D6): „Lager“
   meint die Software für den EIGENEN Bestand des Kunden — ConfidaraExpress lagert nicht ein, kein Fulfillment. */
export const AUTH_TEXT = Object.freeze({
  titel: "Versand- und Logistik\u00admanagement für Unternehmen.",
  lead: "Preise mehrerer Versanddienstleister vergleichen, Sendungen buchen und verfolgen, Bestand und Aufträge Ihres Lagers führen – in einem Kundenbereich.",
  kartenLegende: "Versand innerhalb Deutschlands und in alle anderen Länder der EU",
  // Vorsätze der Kontaktlinks nur für Screenreader (sichtbar sind Symbol und Wert): „E-Mail an support@…“, „Anrufen: 0160…“.
  kontaktMail: "E-Mail an ",
  kontaktTelefon: "Anrufen: ",
  // Startklar (Betreiberentscheidung 2026-11-23, Konzept K4 der Master-Vollanalyse): zwei Wege für neue Besucher — die
  // öffentliche Demo (/demo) und der öffentliche Preisrechner. Nur Verweise auf das Bestehende: keine zweite Demo, kein
  // zweiter Rechner. Am Desktop stehen beide im Kopf; schmal steht der Preisrechner im Kopf neben der Marke und beide
  // Wege unter dem Blatt — das Formular beginnt dort, wo es vorher begann (Audit D2).
  wegeBereich: "Ohne Anmeldung umsehen",
  demo: "Demo ansehen",
  preise: "Versandpreise berechnen",
  wegeFrage: "Erst einmal umsehen?",
});
