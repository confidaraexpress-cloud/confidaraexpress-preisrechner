// Tests für das zentrale Kunden-Rechnungs-View-Model (Go-live). Läuft über
// `node --test`. Deckt ab: die drei echten Zahlungszustände, Dokument-/E-Mail-
// Status, Zeitraum-Zelle (Leistungsdatum nur bei Abweichung, Fälligkeit nur
// solange offen), Filter, Zusammenfassungs-Zustände (serverseitige summary hat
// Vorrang) und — als Go-live-Kern — dass das Modul KEINE internen Test-,
// Vorschau- oder Modus-Zustände mehr kennt.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TONE,
  isOverdueInvoice,
  paymentStatus,
  isTestInvoice,
  documentStatusMeta, emailDeliveryMeta,
  invoicePeriod, unavailableActionReason,
  INVOICE_FILTERS, matchesInvoiceFilter,
  FILTER_EMPTY_TEXT, LIST_EMPTY_TITLE, LIST_EMPTY_TEXT, LOADING_TEXT, LOAD_ERROR_TEXT,
  customerInvoiceSummary,
} from "./customerInvoiceView.mjs";

import * as viewModule from "./customerInvoiceView.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const viewSrc = fs.readFileSync(path.join(HERE, "customerInvoiceView.mjs"), "utf8");
// Nur der ausführbare Code — Kommentare erklären die entfernten Begriffe bewusst
// beim Namen und dürfen die Begriffsprüfung nicht fälschlich auslösen.
const viewCode = viewSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// Eine produktive Kundenrechnung — der einzige Rechnungstyp, den der Kundenbereich
// seit dem Go-live überhaupt noch erhält.
const inv = (over = {}) => ({
  id: 1, invoice_number: "CE-RE26-00001", amount: "49.25", gross_amount: "49.25", currency: "EUR",
  status: "unpaid", due_date: "2099-01-01", issued_at: "2026-07-19", created_at: "2026-07-19",
  service_date: null, document_status: "ready", email_status: "sent",
  is_overdue: false, download_available: true,
  ...over,
});

// ── Überfälligkeit ───────────────────────────────────────────────────────────
test("1 — isOverdueInvoice: strikt das Serverfeld, kein eigener Datumsvergleich", () => {
  assert.equal(isOverdueInvoice(inv({ is_overdue: true })), true);
  assert.equal(isOverdueInvoice(inv({ is_overdue: false })), false);
  assert.equal(isOverdueInvoice(inv({ is_overdue: undefined })), false);
  assert.equal(isOverdueInvoice(null), false);
  // Ein längst vergangenes Fälligkeitsdatum macht die Rechnung NICHT überfällig,
  // solange der Server es nicht sagt — sonst liefen Anzeige und Kennzahlen an
  // Tagesrändern auseinander.
  assert.equal(isOverdueInvoice(inv({ due_date: "2000-01-01", is_overdue: false })), false);
});

// ── Zahlungsstatus: genau drei echte Kundenzustände ──────────────────────────
test("2 — paymentStatus: bezahlt → Bezahlt", () => {
  assert.deepEqual(paymentStatus(inv({ status: "paid" })), [TONE.POSITIVE, "Bezahlt"]);
});
test("3 — paymentStatus: offen + überfällig → Überfällig", () => {
  assert.deepEqual(paymentStatus(inv({ status: "unpaid", is_overdue: true })), [TONE.CRITICAL, "Überfällig"]);
});
test("4 — paymentStatus: offen, nicht überfällig → Offen", () => {
  assert.deepEqual(paymentStatus(inv({ status: "unpaid", is_overdue: false })), [TONE.ATTENTION, "Offen"]);
});
test("5 — paymentStatus: bezahlt schlägt überfällig (eine eindeutige Aussage)", () => {
  assert.deepEqual(paymentStatus(inv({ status: "paid", is_overdue: true })), [TONE.POSITIVE, "Bezahlt"]);
});
test("6 — GO-LIVE: es gibt NUR diese drei Zahlungszustände", () => {
  const labels = new Set();
  for (const status of ["paid", "unpaid", undefined, "irgendwas"]) {
    for (const overdue of [true, false, undefined]) {
      labels.add(paymentStatus(inv({ status, is_overdue: overdue }))[1]);
    }
  }
  assert.deepEqual([...labels].sort(), ["Bezahlt", "Offen", "Überfällig"],
    "kein weiterer Zahlungszustand - insbesondere kein Nicht-zahlungswirksam-Zustand");
});

// ── Dokument-/E-Mail-Status ──────────────────────────────────────────────────
test("7 — documentStatusMeta: kompakte Labels ohne Fließtext", () => {
  assert.deepEqual(documentStatusMeta(inv({ document_status: "ready" })), [TONE.POSITIVE, "PDF bereit"]);
  assert.deepEqual(documentStatusMeta(inv({ document_status: "generating" })), [TONE.NEUTRAL, "PDF wird erstellt"]);
  assert.deepEqual(documentStatusMeta(inv({ document_status: "pending_document" })), [TONE.NEUTRAL, "PDF wird erstellt"]);
  assert.deepEqual(documentStatusMeta(inv({ document_status: "document_failed" })), [TONE.CRITICAL, "PDF-Erstellung fehlgeschlagen"]);
});
// R3: Der Kunde sieht NUR die abgeschlossene Tatsache — nie einen internen Betriebszustand.
// „Versand fehlgeschlagen" neben einer gültigen, herunterladbaren Rechnung liest sich wie ein
// Rechnungs- oder Zahlungsfehler; der Kunde kann daran ohnehin nichts ändern.
test("8 — emailDeliveryMeta: nur der erfolgte Versand wird angezeigt", () => {
  assert.deepEqual(emailDeliveryMeta(inv({ sent_by_email: true })), [TONE.POSITIVE, "Per E-Mail versendet"]);
  // Liefert der Server das Feld, ist es maßgeblich — auch gegen ein abweichendes email_status.
  assert.equal(emailDeliveryMeta(inv({ sent_by_email: false, email_status: "sent" })), null,
    "sent_by_email hat Vorrang vor dem Übergangsfeld");
  for (const state of [{ sent_by_email: false, email_status: "pending" },
                       { email_status: "pending" },
                       { sent_by_email: null, email_status: "failed" }]) {
    assert.equal(emailDeliveryMeta(inv(state)), null, `kein Hinweis erwartet für ${JSON.stringify(state)}`);
  }
  assert.equal(emailDeliveryMeta(null), null);
});
test("8b — emailDeliveryMeta: kein technischer Zustand erreicht die Oberfläche", () => {
  // Selbst wenn ein älteres Backend die Rohzustände noch mitliefert, entsteht daraus KEIN Label
  // außer dem positiven Fall. Insbesondere nie „Versand fehlgeschlagen"/„Wird versendet".
  for (const s of ["pending", "sending", "failed", "bounced", "unknown", "", null, undefined]) {
    assert.equal(emailDeliveryMeta(inv({ email_status: s })), null, `Rohzustand darf nichts anzeigen: ${s}`);
  }
  // Rückwärtskompatibel: ein Backend ohne sent_by_email, aber mit email_status='sent'.
  assert.deepEqual(emailDeliveryMeta(inv({ email_status: "sent" })), [TONE.POSITIVE, "Per E-Mail versendet"]);
  // Und der Text enthält keinen Fehler-/Alarmbegriff.
  const [, label] = emailDeliveryMeta(inv({ sent_by_email: true }));
  for (const bad of ["fehlgeschlagen", "ausstehend", "Fehler", "Provider", "Retry"]) {
    assert.equal(label.includes(bad), false, `Kundenlabel darf ${bad} nicht enthalten`);
  }
});
test("8c — ein fehlgeschlagener Versand entwertet die Rechnung nicht", () => {
  // Zahlungsstatus, Dokumentstatus und Downloadberechtigung bleiben davon unberührt.
  const failed = inv({ sent_by_email: false, email_status: "failed", status: "unpaid", document_status: "ready", download_available: true });
  assert.deepEqual(paymentStatus(failed), [TONE.ATTENTION, "Offen"]);
  assert.deepEqual(documentStatusMeta(failed), [TONE.POSITIVE, "PDF bereit"]);
  assert.equal(unavailableActionReason(failed), "", "der Download muss weiterhin angeboten werden");
});

// ── Zeitraum-Zelle ────────────────────────────────────────────────────────────
test("9 — invoicePeriod: Leistungsdatum nur, wenn vorhanden UND abweichend", () => {
  assert.equal(invoicePeriod(inv({ issued_at: "2026-07-19", service_date: "2026-07-19" })).serviceAt, null);
  assert.equal(invoicePeriod(inv({ issued_at: "2026-07-19", service_date: "2026-07-20" })).serviceAt, "2026-07-20");
  assert.equal(invoicePeriod(inv({ issued_at: "2026-07-19", service_date: null })).serviceAt, null);
});
// R2: service_date ist ein fachliches KALENDERDATUM und kommt als "YYYY-MM-DD".
// Der frühere Vergleich rechnete beide Werte über toISOString() nach UTC — dadurch fiel der
// als "2026-07-30T22:00:00.000Z" gelieferte 31.07. mit dem Rechnungsdatum 30.07. zusammen und
// das Leistungsdatum verschwand im Portal vollständig.
test("9b — invoicePeriod: Kalenderdatum wird als solches erkannt, nicht nach UTC gerechnet", () => {
  // Rechnung am 30.07. abends (deutscher Geschäftstag), Leistung am 31.07.
  const p = invoicePeriod(inv({ issued_at: "2026-07-30T15:27:13.621Z", service_date: "2026-07-31" }));
  assert.equal(p.serviceAt, "2026-07-31", "das Leistungsdatum muss sichtbar bleiben");
});
test("9c — invoicePeriod: Leistungsdatum bleibt über Zeitzonen hinweg stabil", () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "Europe/Berlin", "America/New_York", "Pacific/Auckland"]) {
      process.env.TZ = tz;
      // abweichender Tag → sichtbar
      assert.equal(
        invoicePeriod(inv({ issued_at: "2026-07-30T15:27:13.621Z", service_date: "2026-07-31" })).serviceAt,
        "2026-07-31", `${tz}: abweichendes Leistungsdatum muss sichtbar sein`);
      // gleicher Tag → weiterhin ausgeblendet (keine redundante Zeile)
      assert.equal(
        invoicePeriod(inv({ issued_at: "2026-07-31T09:00:00.000Z", service_date: "2026-07-31" })).serviceAt,
        null, `${tz}: identischer Tag bleibt ausgeblendet`);
      // Monats-, Jahres- und Schaltjahresgrenze
      for (const [issued, service] of [["2026-01-31T12:00:00.000Z", "2026-02-01"],
                                       ["2026-12-31T12:00:00.000Z", "2027-01-01"],
                                       ["2028-02-28T12:00:00.000Z", "2028-02-29"]]) {
        assert.equal(invoicePeriod(inv({ issued_at: issued, service_date: service })).serviceAt, service,
          `${tz}: Grenzfall ${service}`);
      }
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});
test("9d — invoicePeriod bleibt auch gegen die ALTE API-Form richtig (Defense in Depth)", () => {
  // Käme service_date durch ein Backend-Rollback wieder als verschobener UTC-Zeitstempel
  // ("2026-07-30T22:00:00.000Z" für den Kalendertag 31.07.), bestimmt calendarDay den Tag in
  // der Geschäftszeitzone — das Leistungsdatum bliebe sichtbar und richtig. Genau das konnte
  // die frühere UTC-Gleichheitsprüfung nicht: sie ließ beide Werte auf den 30.07. fallen.
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "Europe/Berlin", "America/New_York"]) {
      process.env.TZ = tz;
      const p = invoicePeriod(inv({ issued_at: "2026-07-30T15:27:13.621Z", service_date: "2026-07-30T22:00:00.000Z" }));
      assert.equal(p.serviceDay, "2026-07-31", `${tz}: alte API-Form muss trotzdem den 31.07. ergeben`);
      assert.equal(p.issuedDay, "2026-07-30", `${tz}: Rechnungsdatum bleibt der deutsche Geschäftstag`);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
  // Und der UTC-basierte Kalendertagvergleich ist aus dem ausführbaren Code verschwunden.
  assert.equal(/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(viewCode), false,
    "kein UTC-basierter Kalendertagvergleich mehr");
});
test("9e — invoicePeriod liefert kanonische Kalendertage für die Anzeige", () => {
  const p = invoicePeriod(inv({ issued_at: "2026-07-30T15:27:13.621Z", service_date: "2026-07-31",
                                due_date: "2026-08-06T15:27:13.621Z", status: "unpaid" }));
  for (const [k, v] of [["issuedDay", "2026-07-30"], ["serviceDay", "2026-07-31"], ["dueDay", "2026-08-06"]]) {
    assert.equal(p[k], v, `${k} muss ein kanonischer Kalendertag sein`);
    assert.match(p[k], /^\d{4}-\d{2}-\d{2}$/);
  }
  // Bezahlte Rechnung: keine Fälligkeit, also auch kein dueDay.
  assert.equal(invoicePeriod(inv({ status: "paid" })).dueDay, null);
});
test("10 — invoicePeriod: Fälligkeit nur solange die Forderung offen ist", () => {
  assert.equal(invoicePeriod(inv({ status: "unpaid", due_date: "2099-01-01" })).dueAt, "2099-01-01");
  assert.equal(invoicePeriod(inv({ status: "paid", due_date: "2099-01-01" })).dueAt, null, "bezahlt ⇒ Fälligkeit erledigt");
});
test("11 — invoicePeriod: overdue-Flag nur zusammen mit sichtbarer Fälligkeit", () => {
  assert.equal(invoicePeriod(inv({ status: "unpaid", is_overdue: true })).overdue, true);
  assert.equal(invoicePeriod(inv({ status: "paid", is_overdue: true })).overdue, false);
});
test("12 — GO-LIVE: invoicePeriod liefert keinen nonPayableNote mehr", () => {
  assert.equal("nonPayableNote" in invoicePeriod(inv()), false);
});

// ── Aktionen ──────────────────────────────────────────────────────────────────
test("13 — unavailableActionReason: verfügbar ⇒ leer; sonst ehrliche Begründung ohne interne Begriffe", () => {
  assert.equal(unavailableActionReason(inv({ download_available: true })), "");
  assert.equal(unavailableActionReason(inv({ download_available: false, document_status: "generating" })), "Rechnung wird erstellt");
  assert.equal(unavailableActionReason(inv({ download_available: false, document_status: "document_failed" })), "Rechnung konnte noch nicht erstellt werden");
  assert.equal(unavailableActionReason(inv({ download_available: false, document_status: "ready" })), "Derzeit nicht verfügbar");
  for (const s of ["ready", "generating", "pending_document", "document_failed"]) {
    const reason = unavailableActionReason(inv({ download_available: false, document_status: s }));
    assert.doesNotMatch(reason, /Test|Vorschau|Kundenversand|zahlungswirksam/i, `interner Begriff in „${reason}"`);
  }
});

// ── Filter ────────────────────────────────────────────────────────────────────
test("14 — GO-LIVE: genau vier Filter, kein Test-und-Vorschau-Filter", () => {
  assert.deepEqual(INVOICE_FILTERS.map((f) => f.value), ["", "open", "overdue", "paid"]);
  assert.deepEqual(INVOICE_FILTERS.map((f) => f.label), ["Alle", "Offen", "Überfällig", "Bezahlt"]);
});
test("15 — matchesInvoiceFilter: Alle/Offen/Überfällig/Bezahlt", () => {
  const offen = inv({ status: "unpaid", is_overdue: false });
  const faellig = inv({ status: "unpaid", is_overdue: true });
  const bezahlt = inv({ status: "paid" });
  for (const i of [offen, faellig, bezahlt]) assert.equal(matchesInvoiceFilter(i, ""), true);
  assert.equal(matchesInvoiceFilter(offen, "open"), true);
  assert.equal(matchesInvoiceFilter(faellig, "open"), true, "überfällig ist Teilmenge von offen");
  assert.equal(matchesInvoiceFilter(bezahlt, "open"), false);
  assert.equal(matchesInvoiceFilter(faellig, "overdue"), true);
  assert.equal(matchesInvoiceFilter(offen, "overdue"), false);
  assert.equal(matchesInvoiceFilter(bezahlt, "paid"), true);
  assert.equal(matchesInvoiceFilter(offen, "paid"), false);
});

// ── Zusammenfassung ───────────────────────────────────────────────────────────
test("16 — customerInvoiceSummary: keine Rechnungen ⇒ 'empty'", () => {
  assert.deepEqual(customerInvoiceSummary([], null), { state: "empty" });
  assert.deepEqual(customerInvoiceSummary([], { open_count: 5 }), { state: "empty" });
});
test("17 — customerInvoiceSummary: offene Forderung ⇒ 'open' aus der Server-Summary", () => {
  const s = customerInvoiceSummary([inv()], { open_amount: 49.25, open_count: 1, overdue_count: 0, next_due_date: "2026-08-06", currency: "EUR", mixed_currency: false });
  assert.equal(s.state, "open");
  assert.equal(s.openAmount, 49.25);
  assert.equal(s.openCount, 1);
  assert.equal(s.nextDueDate, "2026-08-06");
});
test("18 — customerInvoiceSummary: alles bezahlt ⇒ 'noOpen', ohne Preview-Zusatz", () => {
  const s = customerInvoiceSummary([inv({ status: "paid" })], { open_amount: 0, open_count: 0, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false });
  assert.equal(s.state, "noOpen");
  assert.equal("previewCount" in s, false, "GO-LIVE: kein Zähler für interne Dokumente mehr");
});
test("19 — customerInvoiceSummary: fehlende Server-Summary ⇒ fail-closed 'noOpen'", () => {
  assert.equal(customerInvoiceSummary([inv()], null).state, "noOpen");
  assert.equal(customerInvoiceSummary([inv()], { open_count: "nicht-numerisch" }).state, "noOpen");
});
test("20 — customerInvoiceSummary: mixedCurrency wird durchgereicht", () => {
  const s = customerInvoiceSummary([inv()], { open_amount: 10, open_count: 1, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: true });
  assert.equal(s.mixedCurrency, true);
});

// ── Texte ─────────────────────────────────────────────────────────────────────
test("21 — Leerzustand nennt weder Test noch Vorschau und erklärt die Entstehung", () => {
  assert.equal(LIST_EMPTY_TITLE, "Noch keine Rechnungen vorhanden");
  assert.equal(LIST_EMPTY_TEXT, "Sobald eine Rechnung für eine gebuchte Sendung erstellt wurde, erscheint sie hier automatisch.");
  for (const t of [FILTER_EMPTY_TEXT, LIST_EMPTY_TITLE, LIST_EMPTY_TEXT, LOADING_TEXT, LOAD_ERROR_TEXT]) {
    assert.doesNotMatch(t, /Test|Vorschau|zahlungswirksam/i, `interner Begriff in „${t}"`);
  }
});

// ── GO-LIVE: das Modul kennt interne Zustände nicht mehr ─────────────────────
test("22 — GO-LIVE: die modus-/testbezogenen Exporte existieren nicht mehr", () => {
  for (const gone of ["documentModeMeta", "documentModeHint", "amountLabel", "isProductiveInvoice", "isPayableInvoice"]) {
    assert.equal(gone in viewModule, false, `${gone} darf im Kunden-View-Model nicht mehr existieren`);
  }
});

test("23 — GO-LIVE: kein interner Begriff und keine Produktivitätsheuristik im ausführbaren Code", () => {
  for (const term of ["Interne Vorschau", "Testdokument", "Dokumentbetrag", "zahlungswirksam", "Kein Kundenversand", "Test & Vorschau"]) {
    assert.equal(viewCode.includes(term), false, `interner Begriff „${term}" steht noch im Code`);
  }
  // Keine Frontend-Heuristik: die Produktivität wird serverseitig entschieden, hier
  // nicht rekonstruiert — weder über is_productive noch über document_mode_label.
  assert.equal(/is_productive|document_mode_label|is_test_document/.test(viewCode), false,
    "das View-Model darf die serverseitige Klassifizierung nicht erneut auswerten");
});

test("24 — Selbsttest: die Prüflogik greift tatsächlich", () => {
  // Die Begriffsprüfung ist nicht leerlaufend: derselbe Test findet einen Begriff,
  // der wirklich im Code steht.
  assert.equal(viewCode.includes("Überfällig"), true, "Selbsttest: Begriffssuche funktioniert");
  // Und die Exportprüfung erkennt einen vorhandenen Export.
  assert.equal("paymentStatus" in viewModule, true);
  assert.ok(Object.values(TONE).length === 4 && new Set(Object.values(TONE)).size === 4);
});

// ─── Testrechnung einer eigenen Testbuchung ─────────────────────────────────
// Die Liste enthält seit dem Testrechnungspaket zusätzlich die EIGENEN Testrechnungen
// des Kunden. Sie sind KEINE Forderungen — ohne eigenen Zustand läsen sie sich als
// offene Zahlungspflicht.

test("Testrechnung: eigener, neutraler Zustand statt Offen", () => {
  assert.deepEqual(paymentStatus({ status: "unpaid", is_test_booking: true }), [TONE.NEUTRAL, "Testrechnung"]);
  // Der Zustand steht ZUERST: er beschreibt die Art des Belegs, nicht den Zahlungsstand.
  assert.deepEqual(paymentStatus({ status: "unpaid", is_test_booking: true, is_overdue: true }),
    [TONE.NEUTRAL, "Testrechnung"]);
});

test("Testrechnung: strikt boolesch — kein truthy-Zufall", () => {
  for (const bad of ["true", 1, "1", {}, null, undefined]) {
    assert.equal(isTestInvoice({ is_test_booking: bad }), false, JSON.stringify(bad));
  }
  assert.equal(isTestInvoice({ is_test_booking: true }), true);
  // Ein Backend ohne das Feld liefert schlicht keine Testrechnung.
  assert.equal(isTestInvoice({}), false);
  assert.equal(isTestInvoice(null), false);
});

test("produktive Rechnungen behalten ihre drei Zustände unverändert", () => {
  assert.deepEqual(paymentStatus({ status: "paid" }), [TONE.POSITIVE, "Bezahlt"]);
  assert.deepEqual(paymentStatus({ status: "unpaid", is_overdue: true }), [TONE.CRITICAL, "Überfällig"]);
  assert.deepEqual(paymentStatus({ status: "unpaid" }), [TONE.ATTENTION, "Offen"]);
});

test("Filter Offen schliesst Testrechnungen aus", () => {
  const test_ = { status: "unpaid", is_test_booking: true };
  const offen = { status: "unpaid" };
  assert.equal(matchesInvoiceFilter(test_, "open"), false, "Testrechnung ist keine offene Forderung");
  assert.equal(matchesInvoiceFilter(offen, "open"), true);
  // „Alle" zeigt sie weiterhin — der Kunde soll seinen Testvorgang vollständig sehen.
  assert.equal(matchesInvoiceFilter(test_, ""), true);
  // „Bezahlt" und „Überfällig" schließen sie von selbst aus.
  assert.equal(matchesInvoiceFilter(test_, "paid"), false);
  assert.equal(matchesInvoiceFilter(test_, "overdue"), false);
});
