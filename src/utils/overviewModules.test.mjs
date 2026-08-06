// Tests der reinen Logik der operativen Übersichtsmodule (Paket D).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_ACTIONS, recentShipments, overviewInvoiceFacts, topNotifications, hasOperationalData,
} from "./overviewModules.mjs";

const ship = (id, created_at, over) => ({ id, created_at, status: "booked", price_final: 10, ...over });

test("1 — Schnellaktionen nutzen ausschließlich vorhandene Ziele", () => {
  const SEITEN = ["new", "shipments", "invoices", "support"];
  const ROUTEN = ["/calculator"];
  for (const a of QUICK_ACTIONS) {
    assert.ok(a.page || a.route, `${a.key}: kein Ziel`);
    if (a.page) assert.ok(SEITEN.includes(a.page), `${a.key}: unbekannte Seite ${a.page}`);
    if (a.route) assert.ok(ROUTEN.includes(a.route), `${a.key}: unbekannte Route ${a.route}`);
    assert.ok(a.label && a.desc && a.icon, `${a.key}: unvollständig`);
  }
  assert.equal(QUICK_ACTIONS.length, 5);
});

test("2 — genau EINE Schnellaktion ist visuell primär", () => {
  assert.equal(QUICK_ACTIONS.filter((a) => a.primary).length, 1);
});

test("3 — letzte Sendungen: neueste zuerst, gedeckelt, ohne Mutation", () => {
  const list = [
    ship(1, "2026-08-01T10:00:00Z"),
    ship(2, "2026-08-06T10:00:00Z"),
    ship(3, "2026-08-03T10:00:00Z"),
    ship(4, "2026-08-05T10:00:00Z"),
    ship(5, "2026-08-04T10:00:00Z"),
  ];
  const kopie = JSON.parse(JSON.stringify(list));
  const rows = recentShipments(list, 4);
  assert.deepEqual(rows.map((s) => s.id), [2, 4, 5, 3]);
  assert.equal(rows.length, 4);
  assert.deepEqual(list, kopie, "die Eingabeliste wurde mutiert");
});

test("4 — Sendungen ohne verwertbares Datum verschwinden nicht, sie stehen hinten", () => {
  const rows = recentShipments([
    ship(1, null), ship(2, "2026-08-06T10:00:00Z"), ship(3, "kein datum"),
  ], 10);
  assert.deepEqual(rows.map((s) => s.id), [2, 1, 3]);
});

test("5 — letzte Sendungen verändern die Sendungsdaten nicht", () => {
  const s = ship(1, "2026-08-06T10:00:00Z", { price_final: 22.19, status: "label_ready", weight: 5 });
  const [row] = recentShipments([s], 1);
  assert.equal(row, s, "die Sendung wird nicht 1:1 durchgereicht");
  assert.equal(row.price_final, 22.19);
  assert.equal(row.status, "label_ready");
});

test("6 — offene Rechnungen kommen aus der bestehenden Serversummary", () => {
  const invoices = [{ id: 1, status: "open", is_overdue: true }];
  const summary = { open_count: 2, open_amount: 99.5, overdue_count: 1, next_due_date: "2026-08-20", currency: "EUR" };
  const facts = overviewInvoiceFacts(invoices, summary);
  assert.equal(facts.showModule, true);
  assert.equal(facts.openAmount, 99.5, "der Betrag wird nicht aus der Summary gelesen");
  assert.equal(facts.openCount, 2);
  assert.equal(facts.overdueCount, 1);
  assert.equal(facts.nextDueDate, "2026-08-20");
});

test("7 — ohne offene Forderung bleibt das Modul stumm (keine Nullkarte)", () => {
  assert.equal(overviewInvoiceFacts([], null).showModule, false);
  assert.equal(overviewInvoiceFacts([], null).state, "empty");
  const bezahlt = overviewInvoiceFacts([{ id: 1, status: "paid" }], { open_count: 0 });
  assert.equal(bezahlt.showModule, false);
  assert.equal(bezahlt.state, "noOpen");
});

test("8 — die Überfälligkeit stammt nur aus dem Serverflag, nie aus einem Datumsvergleich", () => {
  const summary = { open_count: 1, open_amount: 10, currency: "EUR" }; // ohne overdue_count
  const facts = overviewInvoiceFacts(
    [{ id: 1, status: "open", is_overdue: true }, { id: 2, status: "open", due_date: "1999-01-01" }],
    summary,
  );
  // Nur die Rechnung mit is_overdue===true zählt — das alte Fälligkeitsdatum
  // der zweiten Rechnung wird NICHT nachgerechnet.
  assert.equal(facts.overdueCount, 1);
});

test("9 — wichtigste Benachrichtigungen: ungelesene zuerst, dann die neuesten", () => {
  const items = [
    { id: 1, read: true, updatedAt: "2026-08-06T10:00:00Z" },
    { id: 2, read: false, updatedAt: "2026-08-01T10:00:00Z" },
    { id: 3, read: false, updatedAt: "2026-08-05T10:00:00Z" },
    { id: 4, read: true, updatedAt: "2026-08-04T10:00:00Z" },
  ];
  assert.deepEqual(topNotifications(items, 3).map((n) => n.id), [3, 2, 1]);
  assert.equal(topNotifications(items, 10).length, 4);
  assert.deepEqual(topNotifications(null), []);
});

test("10 — Arbeitsfläche sobald irgendetwas Operatives vorliegt", () => {
  assert.equal(hasOperationalData({ shipments: [{ id: 1 }], invoices: [] }), true);
  assert.equal(hasOperationalData({ shipments: [], invoices: [{ id: 1 }] }), true);
  assert.equal(hasOperationalData({ shipments: [], invoices: [] }), false);
});

test("11 — vor dem ersten erfolgreichen Laden blitzt kein Onboarding auf", () => {
  // ready:false → die Seite gilt als operativ, die Module zeigen ihre eigenen
  // Ladezustände. Sonst stünde beim ersten Rendern kurz das Onboarding da.
  assert.equal(hasOperationalData({ shipments: [], invoices: [], ready: false }), true);
  assert.equal(hasOperationalData({ shipments: [], invoices: [], ready: true }), false);
  // `ready` ist standardmäßig true: wer die Ladeschranke nicht übergibt, meint
  // einen fertig geladenen Bestand. Ohne Argumente ist das ein leeres Konto.
  assert.equal(hasOperationalData(), false);
  assert.equal(hasOperationalData({ shipments: [{ id: 1 }] }), true);
});
