/* ── Texte der Kunden-Anmeldung (Betreiberentscheidung G1, 2026-10-27) ─────────────────────────────────────
   Eine Quelle für die React-Seite (pages/AuthPage.jsx) und das statische Seitengerüst (login.html, register.html),
   das dieselben Sätze vor dem ersten Rendern zeigt — authSeitenGeruest.test.mjs hält beide gleich.

   Botschaft wie der öffentliche Preisrechner: „Versand- und Logistikmanagement für Unternehmen.“ Der weiche
   Trennstrich in „Logistik|management (U+00AD)“ erlaubt den Umbruch in schmalen Spalten. Ehrlichkeitsgrenze (Audit D6): „Lager“
   meint die Software für den EIGENEN Bestand des Kunden — ConfidaraExpress lagert nicht ein, kein Fulfillment. */
export const AUTH_TEXT = Object.freeze({
  titel: "Versand- und Logistik\u00admanagement für Unternehmen.",
  lead: "Preise mehrerer Versanddienstleister vergleichen, Sendungen buchen und verfolgen, Bestand und Aufträge Ihres Lagers führen – in einem Kundenbereich.",
  kartenLegende: "Versand ab Deutschland in die Länder der EU",
});
