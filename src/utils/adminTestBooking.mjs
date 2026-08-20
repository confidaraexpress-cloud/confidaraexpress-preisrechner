// Testbuchungsberechtigung eines Kundenkontos — reine Auswertung und Texte.
//
// ─── Was diese Berechtigung IST ──────────────────────────────────────────────
// `users.test_booking_enabled` erlaubt einem Konto, den offiziellen
// JUMiNGO-Testgutschein zu verwenden. Sie ist damit eine PRODUKTberechtigung,
// keine Betriebsrolle.
//
// Bis zum Paket „Testkundenberechtigung" hing derselbe Ablauf serverseitig an
// der ADMINROLLE. Das war eine Übergangslösung und fachlich falsch: ein
// Testkunde ist ein normales Kundenkonto (role=customer) mit einer
// ausdrücklich vergebenen Erlaubnis — und umgekehrt soll ein Admin nicht
// allein deshalb Providerabläufe in einem Sondermodus auslösen können, weil er
// Nutzer verwalten darf. Deshalb gilt die Regel für JEDE Rolle: auch ein Admin
// braucht das Flag.
//
// ─── Was dieses Modul NICHT tut ──────────────────────────────────────────────
// Es entscheidet nichts. Die Berechtigung wird ausschließlich serverseitig
// geprüft (lib/sandboxVoucher.js) und bei jedem Request frisch aus der
// Datenbank geladen. Hier wird nur ANGEZEIGT, was der Server bereits gesagt
// hat — und der abgesendete Wert vorbereitet.

// Strikt boolesch. Ein fehlendes Feld (Backend vor der Migration), `undefined`,
// `null`, `"true"` oder `1` sind KEINE Berechtigung — dieselbe fail-closed
// Regel wie serverseitig. Ein Konto, dessen Zustand das Frontend nicht kennt,
// wird als „nicht freigeschaltet" angezeigt und nie als freigeschaltet.
export function isTestBookingEnabled(user) {
  if (!user || typeof user !== "object") return false;
  return user.test_booking_enabled === true || user.testBookingEnabled === true;
}

// Liest den bestätigten Zustand aus der PUT-Antwort. Gibt `null` zurück, wenn
// die Antwort nicht verwertbar ist — der Aufrufer lädt dann die Wahrheit neu,
// statt einen geratenen Zustand anzuzeigen.
export function selectTestBookingResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.testBookingEnabled !== true && data.testBookingEnabled !== false) return null;
  return { testBookingEnabled: data.testBookingEnabled };
}

export const TEST_BOOKING_TEXTS = Object.freeze({
  cardTitle: "Testbuchungen",
  switchLabel: "Testbuchungen freigeschaltet",
  statusOn: "Freigeschaltet",
  statusOff: "Nicht freigeschaltet",
  // Sagt, was die Berechtigung bewirkt UND was sie nicht ersetzt. Ohne den
  // zweiten Teil liest sie sich wie ein Freibrief für kostenlose Buchungen.
  hintOff:
    "Das Konto kann keine Testbuchungen durchführen. Buchungen laufen ausschließlich regulär und kostenpflichtig.",
  hintOn:
    "Das Konto kann Testbuchungen mit dem offiziellen Testgutschein durchführen. Es gelten weiterhin alle übrigen Prüfungen — Testtarif und Bestätigung durch den Anbieter.",
  explanation:
    "Eine Testbuchung erzeugt ein Testlabel, das nicht für echte Pakete verwendbar ist, und eine Testrechnung ohne Zahlungsforderung. Reguläre Buchungen dieses Kontos bleiben davon unberührt.",
  // Die Rollenklarstellung steht sichtbar in der Karte: sie ist der eigentliche
  // Inhalt dieser Änderung und darf nicht nur im Quelltext stehen.
  roleNote:
    "Die Adminrolle allein reicht dafür nicht aus — auch ein Adminkonto braucht diese Freischaltung.",
  grantTitle: "Testbuchungen freischalten?",
  grantText:
    "Das Konto kann danach Testbuchungen mit dem offiziellen Testgutschein durchführen. Dabei entstehen Testlabels und Testrechnungen, keine Zahlungsforderungen.",
  grantConfirm: "Freischalten",
  revokeTitle: "Testbuchungen entziehen?",
  revokeText:
    "Das Konto kann danach keine Testbuchungen mehr durchführen. Der Entzug wirkt sofort — auch für bereits angemeldete Sitzungen. Bereits erzeugte Testbuchungen bleiben unverändert bestehen.",
  revokeConfirm: "Entziehen",
  auditNote: "Die Änderung wird im Auditlog festgehalten.",
  busy: "Wird gespeichert…",
  successOn: "Testbuchungen freigeschaltet.",
  successOff: "Testbuchungen entzogen.",
});

// Fehlertexte je HTTP-Status. `null` bei 401/403: die zentrale Behandlung in
// apiFetch übernimmt dort (Sitzungsende bzw. fehlende Adminrechte) — eine
// zweite Meldung daneben wäre widersprüchlich.
export function testBookingError(status) {
  if (status === 401 || status === 403) return null;
  if (status === 404) return "Kundenkonto nicht gefunden.";
  if (status === 429) return "Zu viele Anfragen. Bitte einen Moment warten.";
  if (status === 400) return "Die Anfrage wurde abgelehnt. Bitte Seite neu laden und erneut versuchen.";
  return "Die Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.";
}

// Ein Aufruf, der den bereits gesetzten Wert erneut setzt, ist serverseitig ein
// erlaubtes No-Op. Das Frontend spart ihn sich trotzdem: ein Request ohne
// fachliche Wirkung erzeugt nur einen Auditeintrag und eine Erfolgsmeldung, die
// nichts meldet.
export function testBookingHasChange(current, next) {
  return (current === true) !== (next === true);
}
