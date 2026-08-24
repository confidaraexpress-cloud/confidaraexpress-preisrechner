// Phase 4 — die AGB-Zahlungsklausel (§5.5) deckt sich mit der Geschäftsregel.
//
// Gezielter Quelltext-/Rendertest auf GENAU diese Klausel. Kein Snapshot der ganzen Seite:
// ein Rechtstext ändert sich absichtlich selten, und ein Volltext-Snapshot würde bei jeder
// Formatierung anschlagen, ohne etwas über die Aussage zu sagen.
//
// Run: node --test src/utils/legalTermsClause.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const agb = readFileSync(join(SRC, "pages/AGBPage.jsx"), "utf8");
const flach = agb.replace(/\s+/g, " ");

test("(1) §5.5 nennt 7 Tage rein netto nach Rechnungserhalt", () => {
  assert.ok(/<strong>5\.5<\/strong>/.test(flach), "Klausel 5.5 fehlt");
  assert.ok(/7 Tagen<\/strong> rein netto nach Rechnungserhalt/.test(flach),
    "die geltende Zahlungsregel steht nicht in §5.5");
});

test("(2) die abgelöste Regel ist vollständig verschwunden", () => {
  assert.ok(!/28 Tagen/.test(flach), "„28 Tagen“ steht noch in den AGB");
  assert.ok(!/nach Rechnungsdatum ohne Abzug/.test(flach), "der alte Fristbeginn steht noch");
});

test("(3) NUR der Zahlungsparameter wurde angefasst", () => {
  // Die übrigen Zusagen derselben Klausel bleiben wörtlich erhalten — sie waren nicht Teil
  // der beauftragten Änderung. Bricht einer dieser Sätze weg, war der Eingriff zu groß.
  for (const satz of [
    "Soweit keine abweichende individuelle Vereinbarung getroffen wurde",
    "Individuell vereinbarte Zahlungsziele bleiben unberührt",
    "Skontogewährung findet nicht statt, sofern nicht schriftlich abweichend vereinbart",
  ]) {
    assert.ok(flach.includes(satz), `unverändert erwartet, fehlt aber: „${satz}“`);
  }
  // Die Nachbarklauseln stehen ebenfalls unangetastet — Stichprobe an den Ankern.
  for (const anker of ["<strong>5.4</strong>", "<strong>5.6</strong>", "Verzugszinsen"]) {
    assert.ok(flach.includes(anker), `Nachbarklausel verändert: ${anker}`);
  }
});

test("(4) der Rechtstext ist statisch — kein UI-Formatter speist ihn", () => {
  // Ein Legal-Dokument ist versionierter statischer Text. Käme die Frist aus
  // utils/paymentTerm.mjs, änderte eine reine Anzeigeanpassung stillschweigend die AGB.
  assert.ok(!/paymentTerm\.mjs/.test(agb), "die AGB werden aus der UI-Quelle gespeist");
  assert.ok(!/paymentTermSentence|paymentTermLabel|PAYMENT_TERM_DAYS/.test(agb),
    "ein Zahlungsziel-Formatter wird im Rechtstext verwendet");
  // Und die Zahl steht als Literal im Text, nicht als Interpolation.
  assert.ok(/<strong>7 Tagen<\/strong>/.test(flach), "die Frist steht nicht als fester Text");
});

test("(5) der angezeigte Stand wurde NICHT eigenmächtig verändert", () => {
  // Die Sperre bleibt, was sie war: ein Wirkungsdatum darf nicht ERFUNDEN werden.
  // Sie zeigt nur auf einen anderen Wert, weil jetzt eine fachlich freigegebene
  // Zielfassung existiert — August 2026, freigegeben zusammen mit der
  // registrierten AGB-Fassung 2026-08 (legal/terms/2026-08 im API-Repository).
  //
  // Website und registrierte PDF müssen denselben Stand zeigen: die
  // Auftragsbestätigung und die Rechnung tragen die eingefrorene PDF-Fassung,
  // der Kunde liest denselben Text auf /agb. Liefen die beiden auseinander,
  // gäbe es zwei Stände desselben Vertrags im Umlauf.
  //
  // Wer diesen Wert ändert, ändert einen veröffentlichten Rechtstext. Das ist
  // eine fachliche Freigabe, keine Codepflege — und es gehört immer eine neue,
  // registrierte Fassung dazu.
  assert.ok(/Stand: August 2026/.test(flach),
    "der Stand wurde geändert — ein Wirkungsdatum darf nicht erfunden werden");
});
