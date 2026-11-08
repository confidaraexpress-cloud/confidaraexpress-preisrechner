// Sprungwunsch in einen Abschnitt der Kontoeinstellungen (Profilmenü, 2026-11-08): angefordert nur für bekannte
// Abschnitte, eingelöst genau einmal, gemeldet an Abonnenten (schon offene Kontoeinstellungen reagieren ohne Remount).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROFIL_ABSCHNITTE, profilAbschnittAbonnieren, profilAbschnittAnfordern, profilAbschnittEinloesen, profilAbschnittWunsch,
} from "./profilAbschnitt.mjs";

test("1 — nur bekannte Abschnitte; ein unbekannter Wunsch entsteht nicht", () => {
  assert.deepEqual([...PROFIL_ABSCHNITTE], ["sicherheit"]);
  assert.equal(profilAbschnittAnfordern("passwort"), false);
  assert.equal(profilAbschnittAnfordern(""), false);
  assert.equal(profilAbschnittAnfordern(undefined), false);
  assert.equal(profilAbschnittWunsch(), null);
});

test("2 — eingelöst wird genau einmal und nur für den angeforderten Abschnitt", () => {
  assert.equal(profilAbschnittAnfordern("sicherheit"), true);
  assert.equal(profilAbschnittWunsch(), "sicherheit");
  assert.equal(profilAbschnittEinloesen("app"), false, "ein anderer Abschnitt verbraucht den Wunsch");
  assert.equal(profilAbschnittWunsch(), "sicherheit");
  assert.equal(profilAbschnittEinloesen("sicherheit"), true);
  assert.equal(profilAbschnittWunsch(), null);
  assert.equal(profilAbschnittEinloesen("sicherheit"), false, "zweites Einlösen");
});

test("3 — Abonnenten hören Anforderung und Einlösung; nach dem Abmelden nichts mehr", () => {
  let meldungen = 0;
  const ab = profilAbschnittAbonnieren(() => { meldungen += 1; });
  profilAbschnittAnfordern("sicherheit");
  assert.equal(meldungen, 1);
  profilAbschnittEinloesen("sicherheit");
  assert.equal(meldungen, 2);
  profilAbschnittEinloesen("sicherheit");
  assert.equal(meldungen, 2, "ein leeres Einlösen meldet nichts");
  ab();
  profilAbschnittAnfordern("sicherheit");
  assert.equal(meldungen, 2, "nach dem Abmelden noch gemeldet");
  profilAbschnittEinloesen("sicherheit");
});

test("4 — kein Storage, keine Adresse: der Wunsch lebt nur im Modul", async () => {
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("./profilAbschnitt.mjs", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /localStorage|sessionStorage|history\.|location\./);
});
