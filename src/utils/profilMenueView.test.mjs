// Profilmenü (Betreiberentscheidung 2026-11-08) — Inhalt, Lage und Tastaturweg als reine Logik. Das Verhalten im Browser
// prüft tests/e2e/profilMenue.test.mjs, die Quelltextanker components/ui/profilMenue.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROFIL_MENUE_EINTRAEGE, PROFIL_MENUE_MASS, PROFIL_MENUE_TEXT, profilMenueLage, profilMenueZiel,
} from "./profilMenueView.mjs";

const icons = readFileSync(new URL("../components/ui/Icon.jsx", import.meta.url), "utf8");
const seite = readFileSync(new URL("../pages/DashboardPage.jsx", import.meta.url), "utf8");

test("1 — genau die vier beschlossenen Aktionen, in fester Reihenfolge und mit dem beschlossenen Wortlaut", () => {
  assert.deepEqual(PROFIL_MENUE_EINTRAEGE.map((e) => [e.key, e.titel, e.untertitel ?? null]), [
    ["konto", "Mein Konto", "Profil und Unternehmensdaten"],
    ["sicherheit", "Sicherheit & Passwort", "Zugangsdaten verwalten"],
    ["support", "Meine Supportanfragen", "Anfragen und Antworten ansehen"],
    ["abmelden", "Abmelden", null],
  ]);
  assert.ok(Object.isFrozen(PROFIL_MENUE_EINTRAEGE) && PROFIL_MENUE_EINTRAEGE.every(Object.isFrozen), "das Modell ist veränderbar");
  assert.equal(PROFIL_MENUE_TEXT.kontoart, "Geschäftskundenkonto");
  assert.equal(PROFIL_MENUE_TEXT.knopf, "Profilmenü");
});

test("2 — jede Aktion nutzt einen bestehenden Weg: Seitenbereiche der Shell, ein Abschnitt, der Abmeldeweg", () => {
  const ziele = PROFIL_MENUE_EINTRAEGE.filter((e) => !e.abmelden).map((e) => e.ziel);
  assert.deepEqual(ziele, ["profile", "profile", "support"]);
  const bereiche = seite.match(/const DASHBOARD_PAGES = \[([^\]]+)\]/);
  assert.ok(bereiche, "DASHBOARD_PAGES nicht gefunden");
  for (const ziel of ziele) assert.ok(bereiche[1].includes(`"${ziel}"`), `${ziel} ist kein Bereich der Shell`);
  assert.equal(PROFIL_MENUE_EINTRAEGE.find((e) => e.key === "sicherheit").abschnitt, "sicherheit");
  const ab = PROFIL_MENUE_EINTRAEGE.find((e) => e.key === "abmelden");
  assert.equal(ab.abmelden, true);
  assert.equal(ab.ziel, undefined, "Abmelden ist keine Navigation");
  assert.equal(ab.trennerDavor, true, "vor „Abmelden“ fehlt die Trennlinie");
  assert.equal(PROFIL_MENUE_EINTRAEGE.filter((e) => e.trennerDavor).length, 1);
});

test("3 — Linienicons aus dem eigenen System: Profil, Schloss, Headset, Logout", () => {
  assert.deepEqual(PROFIL_MENUE_EINTRAEGE.map((e) => e.icon), ["user", "lock", "headset", "logout"]);
  for (const name of [...PROFIL_MENUE_EINTRAEGE.map((e) => e.icon), "chevronRight", "chevron"]) {
    assert.match(icons, new RegExp(`\\n\\s*${name}:`), `Icon „${name}“ fehlt im Iconsystem`);
  }
});

const DESKTOP = { breite: 1440, hoehe: 900, unten: 0 };
const CHIP_1440 = { left: 1190, right: 1408, top: 8, bottom: 56 };

test("4 — Lage: rechtsbündig direkt unter dem Chip, 336 px breit, Pfeil auf die Chipmitte", () => {
  const l = profilMenueLage({ anker: CHIP_1440, flaeche: DESKTOP });
  assert.deepEqual(l, { top: 64, left: 1072, breite: 336, maxHoehe: 820, pfeil: 227 });
  assert.equal(l.left + l.breite, CHIP_1440.right, "nicht rechtsbündig am Chip");
  assert.ok(PROFIL_MENUE_MASS.breite >= 320 && PROFIL_MENUE_MASS.breite <= 350, "Breite außerhalb von 320–350 px");
});

test("5 — Lage bleibt im Fenster: Rand 16 px, schmale Fenster verkleinern die Breite, nie negativ", () => {
  // Chip nahe am linken Rand: das Menü rückt nach rechts, bis es den Rand hält.
  const links = profilMenueLage({ anker: { left: 20, right: 200, top: 8, bottom: 56 }, flaeche: DESKTOP });
  assert.equal(links.left, 16);
  // Chip über den rechten Rand hinaus (Zoom, Rundung): das Menü endet 16 px vor dem Rand.
  const rechts = profilMenueLage({ anker: { left: 1300, right: 1460, top: 8, bottom: 56 }, flaeche: DESKTOP });
  assert.equal(rechts.left + rechts.breite, 1440 - 16);
  // Sehr schmal: Breite = Fenster minus zweimal Rand.
  const schmal = profilMenueLage({ anker: { left: 100, right: 300, top: 8, bottom: 56 }, flaeche: { breite: 320, hoehe: 640 } });
  assert.equal(schmal.breite, 288);
  assert.equal(schmal.left, 16);
  const winzig = profilMenueLage({ anker: { left: 0, right: 10, top: 0, bottom: 10 }, flaeche: { breite: 20, hoehe: 100 } });
  assert.ok(winzig.breite >= 0, "negative Breite");
});

test("6 — Höchsthöhe bis zum unteren Rand, über einer festen Leiste (Demo); nie unter der Mindesthöhe", () => {
  const flach = profilMenueLage({ anker: CHIP_1440, flaeche: { breite: 1440, hoehe: 412, unten: 0 } });
  assert.equal(flach.maxHoehe, 412 - 16 - 64);
  const demo = profilMenueLage({ anker: CHIP_1440, flaeche: { breite: 1440, hoehe: 900, unten: 72 } });
  assert.equal(demo.maxHoehe, 900 - 72 - 16 - 64);
  const winzig = profilMenueLage({ anker: CHIP_1440, flaeche: { breite: 1440, hoehe: 120, unten: 0 } });
  assert.equal(winzig.maxHoehe, PROFIL_MENUE_MASS.mindestHoehe);
});

test("7 — der Pfeil bleibt in der Fläche (nie in der Rundung) und zeigt sonst auf die Chipmitte", () => {
  const breit = profilMenueLage({ anker: { left: 200, right: 1408, top: 8, bottom: 56 }, flaeche: DESKTOP });
  assert.equal(breit.pfeil, PROFIL_MENUE_MASS.pfeilRand, "Pfeil links in der Rundung");
  const schmalerChip = profilMenueLage({ anker: { left: 1400, right: 1408, top: 8, bottom: 56 }, flaeche: DESKTOP });
  assert.equal(schmalerChip.pfeil, schmalerChip.breite - PROFIL_MENUE_MASS.pfeilRand, "Pfeil rechts in der Rundung");
});

test("8 — fail-closed: ohne gültigen Chip oder ohne Fläche keine erfundene Lage", () => {
  assert.equal(profilMenueLage(), null);
  assert.equal(profilMenueLage({ anker: null, flaeche: DESKTOP }), null);
  assert.equal(profilMenueLage({ anker: CHIP_1440, flaeche: null }), null);
  assert.equal(profilMenueLage({ anker: { left: NaN, right: 10, top: 0, bottom: 10 }, flaeche: DESKTOP }), null);
  assert.equal(profilMenueLage({ anker: { left: 30, right: 10, top: 0, bottom: 10 }, flaeche: DESKTOP }), null);
  assert.equal(profilMenueLage({ anker: CHIP_1440, flaeche: { breite: "1440", hoehe: 900 } }), null);
});

test("9 — Tastaturweg: Pfeile im Kreis, Pos1/Ende an die Enden, sonst keine Wirkung", () => {
  assert.equal(profilMenueZiel("ArrowDown", 0, 4), 1);
  assert.equal(profilMenueZiel("ArrowDown", 3, 4), 0, "vom letzten Eintrag zurück zum ersten");
  assert.equal(profilMenueZiel("ArrowUp", 0, 4), 3, "vom ersten Eintrag zum letzten");
  assert.equal(profilMenueZiel("ArrowUp", 2, 4), 1);
  assert.equal(profilMenueZiel("ArrowDown", -1, 4), 0, "Fokus außerhalb: erster Eintrag");
  assert.equal(profilMenueZiel("ArrowUp", -1, 4), 3, "Fokus außerhalb: letzter Eintrag");
  assert.equal(profilMenueZiel("Home", 2, 4), 0);
  assert.equal(profilMenueZiel("End", 0, 4), 3);
  assert.equal(profilMenueZiel("ArrowDown", 7, 4), 0, "ungültiger Index zählt als außerhalb");
  for (const taste of ["Tab", "Enter", " ", "Escape", "a"]) assert.equal(profilMenueZiel(taste, 1, 4), null, taste);
  assert.equal(profilMenueZiel("ArrowDown", 0, 0), null);
  assert.equal(profilMenueZiel("ArrowDown", 0, undefined), null);
});
