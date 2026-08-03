// Reine Logik der Kunden-Supportanfrage (utils/supportRequest.mjs) + Verdrahtung der
// Supportkarte und des Dialogs. Kein Rendering, keine neue Dependency.
//
// Geprüft: Kategorienvertrag, Eingabezustände an den Grenzen, Absende-Payload
// (kein Mass Assignment), Erfolgsmeldung im festgelegten Wortlaut, Ticketnummer
// ausschließlich aus der Serverantwort, Fehlerabbildung — plus Source-Asserts für
// den Dialog (Mehrfachabsende-Schutz, kein dangerouslySetInnerHTML, kein Logging)
// und die API-Schicht (zentrales apiFetch, korrekter Pfad).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_VALUES,
  SUPPORT_CARD,
  SUPPORT_GENERIC_ERROR,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MESSAGE_MIN,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_SUBJECT_MIN,
  SUPPORT_SUCCESS_BASE,
  buildSupportRequestBody,
  mapSupportError,
  readTicketNumber,
  supportCategoryLabel,
  supportFormState,
  supportMessageState,
  supportSubjectState,
  supportSuccessMessage,
} from "./supportRequest.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const dialogJsx = read("../components/support/SupportRequestDialog.jsx");
const apiJs = read("../api/supportApi.js");
const sidebarJsx = read("../components/layout/DashboardSidebar.jsx");

const ok = (over = {}) => ({
  category: "invoice",
  subject: "Frage zur Rechnung",
  message: "Ich habe eine Frage zu meiner letzten Rechnung.",
  ...over,
});

/* ── Kategorien ──────────────────────────────────────────────────────────── */

test("1 — genau sieben Kategorien mit den festgelegten technischen Werten", () => {
  assert.deepEqual([...SUPPORT_CATEGORY_VALUES],
    ["booking", "tracking", "invoice", "cancellation", "account", "technical", "other"]);
  assert.equal(SUPPORT_CATEGORIES.length, 7);
});

test("2 — deutsche Kategorielabels exakt wie festgelegt", () => {
  assert.equal(supportCategoryLabel("booking"), "Buchung und Versand");
  assert.equal(supportCategoryLabel("tracking"), "Sendungsverfolgung");
  assert.equal(supportCategoryLabel("invoice"), "Rechnung");
  assert.equal(supportCategoryLabel("cancellation"), "Stornierung");
  assert.equal(supportCategoryLabel("account"), "Konto und Unternehmen");
  assert.equal(supportCategoryLabel("technical"), "Technisches Problem");
  assert.equal(supportCategoryLabel("other"), "Sonstiges");
  assert.equal(supportCategoryLabel("gibtesnicht"), null);
});

test("3 — keine Kategorie ist vorausgewählt (der Kunde wählt bewusst)", () => {
  assert.equal(supportFormState({ category: "", subject: "abc", message: "x".repeat(20) }).categoryValid, false);
  assert.match(dialogJsx, /<option value="">\{SUPPORT_CATEGORY_PLACEHOLDER\}<\/option>/,
    "Platzhalteroption fehlt");
  assert.match(dialogJsx, /useState\(""\)/, "Kategorie startet nicht leer");
});

/* ── Eingabezustände ─────────────────────────────────────────────────────── */

test("4 — Betreff: Grenzen 3…200 werden auf dem GETRIMMTEN Wert gemessen", () => {
  assert.equal(supportSubjectState("abc").valid, true);
  assert.equal(supportSubjectState("  abc  ").valid, true);
  assert.equal(supportSubjectState("ab").valid, false);
  assert.equal(supportSubjectState("ab").tooShort, true);
  assert.equal(supportSubjectState("a".repeat(SUPPORT_SUBJECT_MAX)).valid, true);
  assert.equal(supportSubjectState("a".repeat(SUPPORT_SUBJECT_MAX + 1)).tooLong, true);
  // Reine Leerzeichen sind KEINE Eingabe — aber auch kein „zu kurz“-Vorwurf.
  assert.equal(supportSubjectState("    ").empty, true);
  assert.equal(supportSubjectState("    ").tooShort, false);
});

test("5 — Nachricht: Grenzen 20…5000 auf dem getrimmten Wert", () => {
  assert.equal(supportMessageState("a".repeat(SUPPORT_MESSAGE_MIN)).valid, true);
  assert.equal(supportMessageState("a".repeat(SUPPORT_MESSAGE_MIN - 1)).tooShort, true);
  assert.equal(supportMessageState("a".repeat(SUPPORT_MESSAGE_MAX)).valid, true);
  assert.equal(supportMessageState("a".repeat(SUPPORT_MESSAGE_MAX + 1)).tooLong, true);
});

test("6 — der Zähler misst die ROHLÄNGE (passend zum maxLength-Attribut)", () => {
  // Sonst springt der Zähler zurück, während der Kunde Leerzeichen tippt.
  assert.equal(supportSubjectState("  ab  ").length, 6);
  assert.equal(supportSubjectState("  ab  ").trimmedLength, 2);
});

test("7 — canSubmit verlangt Kategorie UND Betreff UND Nachricht", () => {
  assert.equal(supportFormState(ok()).canSubmit, true);
  assert.equal(supportFormState(ok({ category: "" })).canSubmit, false);
  assert.equal(supportFormState(ok({ category: "erfunden" })).canSubmit, false);
  assert.equal(supportFormState(ok({ subject: "ab" })).canSubmit, false);
  assert.equal(supportFormState(ok({ message: "zu kurz" })).canSubmit, false);
  assert.equal(supportFormState(undefined).canSubmit, false);
});

/* ── Absende-Payload ─────────────────────────────────────────────────────── */

test("8 — der Body enthält GENAU category/subject/message, getrimmt", () => {
  const body = buildSupportRequestBody(ok({ subject: "  Betreff  ", message: "  " + "x".repeat(30) + "  " }));
  assert.deepEqual(Object.keys(body).sort(), ["category", "message", "subject"]);
  assert.equal(body.subject, "Betreff");
  assert.equal(body.message, "x".repeat(30));
});

test("9 — Mass Assignment ist ausgeschlossen (kein status, keine ID, keine Ticketnummer)", () => {
  const body = buildSupportRequestBody(ok({
    status: "resolved", ticketNumber: "CE-SUP26-09999", userId: 1, user_id: 1,
    adminNote: "x", revision: 9, id: 7,
  }));
  assert.deepEqual(Object.keys(body).sort(), ["category", "message", "subject"]);
});

test("10 — eine ungültige Kategorie wird fail-closed abgelehnt (kein Fallback)", () => {
  assert.throws(() => buildSupportRequestBody(ok({ category: "erfunden" })), /invalid_category/);
  assert.throws(() => buildSupportRequestBody(ok({ category: "" })), /invalid_category/);
  assert.throws(() => buildSupportRequestBody(undefined), /invalid_category/);
});

/* ── Erfolgsmeldung + Ticketnummer ───────────────────────────────────────── */

test("11 — die Erfolgsmeldung hat den festgelegten Wortlaut", () => {
  assert.equal(
    supportSuccessMessage("CE-SUP26-00001"),
    "Ihre Supportanfrage wurde erfolgreich übermittelt. Wir melden uns zeitnah bei Ihnen. Ihre Ticketnummer: CE-SUP26-00001"
  );
});

test("12 — ohne Ticketnummer entfällt der Ticketsatz (nie „undefined“)", () => {
  for (const v of ["", "   ", null, undefined, 42, {}]) {
    const msg = supportSuccessMessage(v);
    assert.equal(msg, SUPPORT_SUCCESS_BASE);
    assert.ok(!msg.includes("undefined"), `Meldung enthält „undefined“: ${msg}`);
    assert.ok(!msg.includes("Ticketnummer"), `Ticketsatz ohne Nummer: ${msg}`);
  }
});

test("13 — die Ticketnummer stammt AUSSCHLIESSLICH aus der Serverantwort", () => {
  assert.equal(readTicketNumber({ supportRequest: { ticketNumber: "CE-SUP26-00007" } }), "CE-SUP26-00007");
  assert.equal(readTicketNumber({ supportRequest: { ticket_number: "CE-SUP26-00008" } }), "CE-SUP26-00008");
  assert.equal(readTicketNumber({ ticketNumber: "CE-SUP26-00009" }), "CE-SUP26-00009");
  // Nichts wird aus anderen Feldern abgeleitet oder erzeugt.
  assert.equal(readTicketNumber({ supportRequest: { id: 7, subject: "x" } }), "");
  assert.equal(readTicketNumber({}), "");
  assert.equal(readTicketNumber(null), "");
  assert.equal(readTicketNumber("CE-SUP26-00001"), "");
});

/* ── Fehlerabbildung ─────────────────────────────────────────────────────── */

test("14 — bekannte Fehlercodes werden kundentauglich übersetzt", () => {
  assert.match(mapSupportError(400, { code: "SUPPORT_CATEGORY_INVALID" }), /Kategorie/);
  assert.match(mapSupportError(400, { code: "SUPPORT_SUBJECT_INVALID" }), /Betreff/);
  assert.match(mapSupportError(400, { code: "SUPPORT_MESSAGE_INVALID" }), /Anliegen/);
  assert.match(mapSupportError(429, { code: "SUPPORT_RATE_LIMITED" }), /einigen Minuten/);
  assert.match(mapSupportError(403, { code: "ACCOUNT_NOT_AVAILABLE" }), /neu an/);
});

test("15 — unbekannte Fehler fallen auf eine generische Meldung zurück", () => {
  assert.equal(mapSupportError(500, {}), SUPPORT_GENERIC_ERROR);
  assert.equal(mapSupportError(0, null), SUPPORT_GENERIC_ERROR);
  assert.equal(mapSupportError(500, { code: "constructor" }), SUPPORT_GENERIC_ERROR);
});

test("16 — Servertexte werden NIE roh übernommen", () => {
  const leak = "at Object.<anonymous> (/app/routes/support.js:123) pg:23505";
  for (const status of [400, 429, 500]) {
    const msg = mapSupportError(status, { error: leak, message: leak, detail: leak });
    assert.ok(!msg.includes("routes/support.js"), `technische Details geleakt: ${msg}`);
    assert.ok(!msg.includes("pg:"), `SQL-Details geleakt: ${msg}`);
  }
});

/* ── Verdrahtung: Dialog ─────────────────────────────────────────────────── */

test("17 — der Dialog schützt gegen Mehrfachabsenden ohne State-Abhängigkeit", () => {
  // Ein `if (busy) return` allein genügt nicht: drei Klicks in einem Tick lesen
  // alle denselben alten State-Wert. Der Ref-Guard ist die tragende Absicherung.
  assert.match(dialogJsx, /const inFlight = useRef\(false\)/, "Ref-Guard fehlt");
  assert.match(dialogJsx, /if \(!canSubmit \|\| inFlight\.current\) return;/, "Guard wird nicht geprüft");
  assert.match(dialogJsx, /inFlight\.current = true;/, "Guard wird nicht gesetzt");
  assert.match(dialogJsx, /finally \{\s*\n\s*inFlight\.current = false;/, "Guard wird nicht freigegeben");
});

test("18 — der Dialog rendert keinen unsanitierten HTML-Inhalt", () => {
  assert.ok(!dialogJsx.includes("dangerouslySetInnerHTML"), "dangerouslySetInnerHTML ist nicht zulässig");
  assert.ok(!dialogJsx.includes("innerHTML"), "innerHTML ist nicht zulässig");
});

test("19 — der Dialog loggt keine Eingaben und keine Antwortdaten", () => {
  assert.ok(!/console\.(log|error|warn|info)/.test(dialogJsx), "Logging im Dialog gefunden");
  assert.ok(!/console\./.test(apiJs), "Logging in der API-Schicht gefunden");
});

test("20 — 401/403 werden dem Kunden NICHT als Fehler gezeigt (zentraler Logout)", () => {
  assert.match(dialogJsx, /r\.status !== 401 && r\.status !== 403/, "401/403-Sonderbehandlung fehlt");
});

test("21 — Dialogsprache und Barrierefreiheit wie beim bestehenden Dialog", () => {
  assert.match(dialogJsx, /role="dialog"/, "role fehlt");
  assert.match(dialogJsx, /aria-modal="true"/, "aria-modal fehlt");
  assert.match(dialogJsx, /aria-labelledby=\{titleId\}/, "aria-labelledby fehlt");
  assert.match(dialogJsx, /e\.key === "Escape" && !busy/, "Escape-Guard fehlt");
  assert.match(dialogJsx, /openerRef\.current\?\.focus\?\.\(\)/, "Fokus-Restore fehlt");
  assert.match(dialogJsx, /e\.key === "Tab"/, "Fokusfalle fehlt");
  // Escape/Backdrop dürfen während des Sendens nicht schließen.
  assert.match(dialogJsx, /e\.target === e\.currentTarget && !busy/, "Backdrop-Guard fehlt");
});

test("22 — nur das bestehende Icon-System, keine neue Dependency", () => {
  assert.ok(!dialogJsx.includes("lucide-react"), "lucide-react ist im Projekt nicht zulässig");
  assert.match(dialogJsx, /from "\.\.\/ui\/Icon"/, "die zentrale Icon-Komponente fehlt");
});

/* ── Verdrahtung: API-Schicht ────────────────────────────────────────────── */

test("23 — die API-Schicht nutzt das zentrale apiFetch mit auth:true", () => {
  assert.match(apiJs, /import \{ apiFetch \} from "\.\/client"/, "apiFetch wird nicht verwendet");
  assert.match(apiJs, /auth: true/, "auth:true fehlt — 401/403 liefen sonst nicht zentral");
  assert.ok(!/\bfetch\(/.test(apiJs.replace(/apiFetch\(/g, "")), "direkter fetch-Aufruf gefunden");
});

test("24 — der Pfad entspricht dem Backendvertrag (ohne /api-Präfix)", () => {
  assert.match(apiJs, /`\/kunde\/support-requests`/, "Pfad weicht vom Vertrag ab");
  assert.ok(!apiJs.includes("/api/kunde/support-requests"), "falsches /api-Präfix");
});

test("25 — der Body wird zentral gebaut (keine zweite Payload-Abstraktion)", () => {
  assert.match(apiJs, /buildSupportRequestBody/, "zentraler Body-Builder wird nicht genutzt");
});

/* ── Verdrahtung: Supportkarte ───────────────────────────────────────────── */

test("26 — der festgelegte Wortlaut der Karte steht genau einmal zentral", () => {
  assert.equal(SUPPORT_CARD.kicker, "Ihr persönlicher Kontakt");
  assert.equal(SUPPORT_CARD.title, "Wir helfen Ihnen weiter");
  assert.equal(SUPPORT_CARD.action, "Support kontaktieren");
  assert.equal(SUPPORT_CARD.hint, "Ihre Anfrage wird zeitnah beantwortet.");
  // Die Sidebar darf ihn nicht als Literal duplizieren.
  for (const literal of Object.values(SUPPORT_CARD)) {
    assert.ok(!sidebarJsx.includes(`>${literal}<`), `Wortlaut in der Sidebar dupliziert: ${literal}`);
  }
});

test("27 — die Karte öffnet den Dialog und führt nicht mehr ins Postfach", () => {
  assert.match(sidebarJsx, /<button type="button" className="pp-scard"/, "Karte ist keine Schaltfläche");
  assert.ok(!sidebarJsx.includes("mailto:"), "mailto-Einstieg wurde nicht entfernt");
  assert.match(sidebarJsx, /\{supportOpen && <SupportRequestDialog onClose=/, "Dialog wird nicht gerendert");
});
