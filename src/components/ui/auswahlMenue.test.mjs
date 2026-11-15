// Auswahlmenü des Kundenbereichs (Premium Control System 2.0, Betreiberauftrag 2026-11-14).
// A) die reine Logik (auswahlLogik.mjs) am echten Verhalten; B) die Zusagen des Bauteils am Quelltext — es kennt keine
// Fachregel, meldet nur echte Wechsel, wählt nie beiläufig und hält die Liste im Bild.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bewegeMarke, istWechsel, optionsIndex, startMarke } from "./auswahlLogik.mjs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const menue = ohneKommentare(lies("./AuswahlMenue.jsx"));

const OPTIONEN = [
  { value: "standard", label: "Standard" },
  { value: "premium", label: "Premium", disabled: true },
  { value: "none", label: "Keine" },
];

// ── A) Logik ─────────────────────────────────────────────────────────────────────────────────────────────────────

test("A1 — optionsIndex vergleicht strikt: false ist ein Wert, null keiner", () => {
  const ja_nein = [{ value: false }, { value: true }];
  assert.equal(optionsIndex(ja_nein, false), 0);
  assert.equal(optionsIndex(ja_nein, true), 1);
  assert.equal(optionsIndex(ja_nein, null), -1, "null darf nicht als false gelten (keine Vorauswahl)");
  assert.equal(optionsIndex(ja_nein, 0), -1);
  assert.equal(optionsIndex(ja_nein, "false"), -1);
  assert.equal(optionsIndex(null, false), -1);
  assert.equal(optionsIndex([null, { value: 1 }], 1), 1, "eine Lücke in der Liste bricht die Suche nicht");
});

test("A2 — startMarke: auf der gewählten, sonst auf der ersten wählbaren, sonst auf der ersten Option", () => {
  assert.equal(startMarke(OPTIONEN, "none"), 2);
  assert.equal(startMarke(OPTIONEN, "premium"), 1, "auch eine gesperrte gewählte Option wird markiert");
  assert.equal(startMarke(OPTIONEN, null), 0);
  assert.equal(startMarke([{ value: 1, disabled: true }, { value: 2 }], null), 1);
  assert.equal(startMarke([{ value: 1, disabled: true }], null), 0);
  assert.equal(startMarke([], "x"), -1);
  assert.equal(startMarke(undefined, "x"), -1);
});

test("A3 — bewegeMarke: Pfeile, Pos1 und Ende ohne Umlauf; andere Tasten bewegen nichts", () => {
  assert.equal(bewegeMarke(0, "ArrowDown", 3), 1);
  assert.equal(bewegeMarke(2, "ArrowDown", 3), 2, "kein Umlauf am Ende");
  assert.equal(bewegeMarke(0, "ArrowUp", 3), 0, "kein Umlauf am Anfang");
  assert.equal(bewegeMarke(2, "ArrowUp", 3), 1);
  assert.equal(bewegeMarke(1, "Home", 3), 0);
  assert.equal(bewegeMarke(1, "End", 3), 2);
  assert.equal(bewegeMarke(-1, "ArrowDown", 3), 0, "ohne Markierung beginnt ArrowDown oben");
  assert.equal(bewegeMarke(-1, "ArrowUp", 3), 2, "ohne Markierung beginnt ArrowUp unten");
  assert.equal(bewegeMarke(7, "ArrowDown", 3), 0, "eine ungültige Markierung gilt als keine");
  for (const taste of ["Enter", " ", "Tab", "Escape", "a"]) assert.equal(bewegeMarke(1, taste, 3), null, taste);
  assert.equal(bewegeMarke(0, "ArrowDown", 0), -1, "leere Liste");
});

test("A4 — istWechsel: gesperrte Optionen und die schon gewählte lösen nichts aus", () => {
  assert.equal(istWechsel(OPTIONEN, 0, "none"), true);
  assert.equal(istWechsel(OPTIONEN, 2, "none"), false, "die gewählte Option ist kein Wechsel");
  assert.equal(istWechsel(OPTIONEN, 1, "none"), false, "eine gesperrte Option ist nie wählbar");
  assert.equal(istWechsel(OPTIONEN, 9, "none"), false);
  assert.equal(istWechsel(null, 0, "none"), false);
  assert.equal(istWechsel([{ value: false }], 0, null), true, "erste Wahl aus dem leeren Zustand");
});

// ── B) Bauteil ───────────────────────────────────────────────────────────────────────────────────────────────────

test("B1 — keine Fachregel im Bauteil: es meldet nur echte Wechsel über onChange", () => {
  assert.match(menue, /import \{ bewegeMarke, istWechsel, optionsIndex, startMarke \} from "\.\/auswahlLogik\.mjs";/);
  assert.match(menue, /if \(!o \|\| o\.disabled\) return;/, "eine gesperrte Option darf nichts auslösen");
  assert.match(menue, /if \(wechsel\) onChange\(o\.value\);/, "onChange nur bei echtem Wechsel");
  assert.equal((menue.match(/onChange\(/g) || []).length, 1, "genau ein Weg nach außen");
  assert.doesNotMatch(menue, /apiFetch|fetch\(|localStorage|sessionStorage/, "das Bauteil spricht mit niemandem");
});

test("B2 — Tastatur: Escape schließt nativ (vor einem umgebenden Dialog), Tab schließt OHNE Wahl", () => {
  assert.match(menue, /knoten\.addEventListener\("keydown", beiEscape\);/, "Escape muss nativ am Umschlag hängen");
  assert.match(menue, /if \(e\.key !== "Escape"\) return;\s*e\.stopPropagation\(\);/);
  assert.match(menue, /if \(e\.key === "Tab"\) setOffen\(false\);/);
  const tab = menue.slice(menue.indexOf('if (e.key === "Tab")'), menue.indexOf('if (e.key === "Tab")') + 60);
  assert.doesNotMatch(tab, /waehle/, "Tab darf nie wählen — eine Wahl löst Speichern oder Neubepreisung aus");
  assert.match(menue, /\["Enter", " ", "Spacebar", "ArrowDown", "ArrowUp"\]\.includes\(e\.key\)/, "Öffnen per Tastatur");
});

test("B3 — Zeiger: mousedown hält den Fokus am Auslöser, gewählt wird erst mit dem Klick; Zeigen scrollt nie", () => {
  assert.match(menue, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
  // Auch ein Klick in den Rand oder die Fuge der Liste (kein <li> getroffen) darf den Fokus nicht vom Auslöser nehmen —
  // sonst stünde die Liste offen, aber Pfeile und Escape gingen ins Leere. Die Bildlaufleiste bleibt bedienbar.
  assert.match(menue, /if \(e\.target === e\.currentTarget && e\.nativeEvent\.offsetX < e\.currentTarget\.clientWidth\) e\.preventDefault\(\);/);
  assert.match(menue, /onClick=\{\(\) => waehle\(i\)\}/);
  // Markiert wird erst bei echter Zeigerbewegung: ein ruhender Zeiger, unter dem sich die Liste öffnet oder per Tastatur
  // weiterscrollt, verschiebt die Tastaturmarkierung nicht.
  assert.match(menue, /onMouseMove=\{\(\) => \{ if \(i !== markiert\) \{ durchZeiger\.current = true; setMarkiert\(i\); \} \}\}/);
  assert.doesNotMatch(menue, /onMouseEnter=/, "mouseenter feuert auch unter einem ruhenden Zeiger");
  assert.match(menue, /if \(durchZeiger\.current\) \{ durchZeiger\.current = false; return; \}/,
    "eine per Zeiger markierte Option darf die Liste nicht scrollen");
  assert.match(menue, /if \(!wrapRef\.current\?\.contains\(e\.target\) && !listeRef\.current\?\.contains\(e\.target\)\) setOffen\(false\);/,
    "Klick daneben schließt (Umschlag und Portal-Liste einzeln geprüft)");
});

test("B4 — Lage: oberste Ebene (ohne Popover-API Portal an <body>), immer nach unten, Platz ohne Animation, feste Leisten werden gemessen", () => {
  assert.match(menue, /\{listeElement && \(MIT_POPOVER \? listeElement : createPortal\(listeElement, document\.body\)\)\}/,
    "ohne Popover-API muss die Liste weiter als Portal an <body> hängen (kein Abschneiden durch Vorfahren)");
  assert.match(menue, /const top = t\.bottom \+ ABSTAND;/, "die Liste öffnet unter dem Auslöser");
  assert.match(menue, /wurzel\.style\.scrollBehavior = "auto";\s*window\.scrollBy\(0, hoch\);\s*wurzel\.style\.scrollBehavior = vorher;/,
    "das Hochrücken läuft ohne Animation und stellt den Stil wieder her");
  assert.match(menue, /Math\.max\(freieOberkante\(x, liste\), angemeldeteOberkante\(t\.top\)\)/,
    "der Auslöser darf nie unter eine feste oder angemeldete Leiste geschoben werden");
  assert.match(menue, /Math\.max\(freieOberkante\(x, listeRef\.current\), angemeldeteOberkante\(t\.top\)\) \+ RAND;/,
    "ins Bild holen misst die Leisten oben ohne die Liste selbst");
  // Oben wie unten wird die offene Liste beim Abtasten übersprungen — als Popover steht sie vor dem ersten Platzieren
  // oben links in der obersten Ebene und gälte sonst als feste Leiste (gemessen 2026-11-15).
  assert.match(menue, /leisteAn\(document\.elementsFromPoint\(x, y \+ 1\)\.find\(\(el\) => !liste \|\| !liste\.contains\(el\)\)\)/);
  assert.doesNotMatch(menue, /document\.elementFromPoint\(/, "ein Abtasten ohne Ausnahme der Liste träfe die Liste selbst");
  assert.match(menue, /freieUnterkante\(t\.left \+ t\.width \/ 2, liste\)/, "feste Leisten unten begrenzen die Liste");
  assert.match(menue, /if \(t\.bottom < 0 \|\| t\.top > window\.innerHeight\) \{ setOffen\(false\); return; \}/,
    "weggescrollt schließt die Liste statt losgelöst zu schweben");
  // …aber beim Öffnen holt das Menü den Auslöser zuerst ins Bild — sonst schlösse die Liste per Tastatur sofort wieder
  // (Fokus scrollt sanft, Enter kommt vorher; gemessen in billingMode B12).
  assert.match(menue, /if \(!offen\) return undefined;\s*zeigeObenauf\(listeRef\.current\);\s*insBild\(\);\s*platziere\(\);\s*platzSchaffen\(\);\s*startScroll\(\);/,
    "die Reihenfolge beim Öffnen: obenauf zeigen (erst dann hat die Liste Geometrie), ins Bild, platzieren, Platz schaffen, Startscroll");
  assert.match(menue, /const dy = t\.top < oben \? t\.top - oben : t\.bottom > unten \? t\.bottom - unten : 0;/);
  // Knapper Platz (200 % Zoom): erst fällt der Rand, dann die Mindesthöhe — die Liste reicht nie unter eine feste Leiste.
  assert.match(menue, /Math\.max\(Math\.min\(MIN_HOEHE, bisLeiste\), Math\.min\(MAX_HOEHE, bisLeiste - RAND\), NAMENSZEILE\)/,
    "die Liste reicht unter eine feste Leiste, obwohl über ihr noch Platz für eine Namenszeile ist");
  // Startscroll nur bis zur Namenszeile der gewählten Option — sonst verschwinden die Optionen darüber ganz.
  assert.match(menue, /if \(sichtbarBis > liste\.clientHeight\) liste\.scrollTop = sichtbarBis - liste\.clientHeight;/);
  assert.doesNotMatch(menue, /option\.scrollIntoView/, "der Startscroll holt die ganze Option herein");
  assert.match(menue, /useEffect\(\(\) => \{ if \(disabled && offen\) setOffen\(false\); \}, \[disabled, offen\]\);/);
});

test("B5 — Leisten, die erst beim Scrollen erscheinen, melden sich an: die klebende Buchungszusammenfassung", () => {
  assert.match(menue, /document\.querySelectorAll\("\[data-klebt-oben\]"\)/);
  const leiste = ohneKommentare(lies("../booking/BookingStickySummary.jsx"));
  assert.match(leiste, /className=\{`booking-sticky-layer\$\{stuck \? " is-stuck" : ""\}`\}\s*aria-hidden="true"\s*data-klebt-oben=""/,
    "die klebende Zusammenfassung meldet sich nicht an — ein Menü schöbe seinen Auslöser darunter");
});

test("B7 — Lesereihenfolge: die Liste steht im DOM direkt hinter dem Auslöser (Popover, oberste Ebene, kein Fokuswechsel)", () => {
  // Freigabeprüfung 2026-11-15: Als Portal am Ende von <body> erreichten Wischgesten (VoiceOver iOS, TalkBack) die
  // Optionen nicht — dazwischen lag der Rest der Seite. Die Liste wird jetzt im Umschlag gerendert, gleich nach dem
  // Auslöser, und über die Popover-API obenauf gezeichnet.
  assert.match(menue, /const MIT_POPOVER = typeof HTMLElement !== "undefined" && typeof HTMLElement\.prototype\.showPopover === "function";/);
  assert.match(menue, /popover=\{MIT_POPOVER \? "manual" : undefined\}/,
    "nur „manual“: kein eigenes Schließen des Browsers, kein Fokuswechsel — das Bauteil regelt Escape und Klick daneben");
  assert.doesNotMatch(menue, /popover=\{?"auto"/, "„auto“ schlösse die Liste beim Klick auf den Auslöser selbst (Licht-Schließen)");
  assert.match(menue, /if \(!MIT_POPOVER \|\| !liste \|\| liste\.matches\(":popover-open"\)\) return;\s*try \{ liste\.showPopover\(\); \}/,
    "showPopover nur einmal und nur mit Popover-API (ein zweiter Aufruf wirft)");
  // Die Liste folgt im JSX unmittelbar auf den Auslöser — beides Kinder desselben Umschlags.
  assert.match(menue, /<\/button>\s*\{listeElement && \(MIT_POPOVER \? listeElement/,
    "zwischen Auslöser und Liste darf nichts stehen — sonst läge es beim Wischen dazwischen");
  assert.doesNotMatch(menue, /listeRef\.current\??\.focus\(/, "der Fokus bleibt am Auslöser (select-only combobox)");
  // Browser-Vorgaben für [popover] (inset 0, fit-content, CanvasText) sind aufgehoben, sonst stünde die Liste mittig.
  const css = readFileSync(new URL("../../styles/premium-editorial.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const regel = css.match(/:root\[data-ce-bereich="kunde"\] \.ce-auswahl-liste \{([^}]*)\}/);
  assert.ok(regel, "Regel .ce-auswahl-liste fehlt");
  for (const d of [/inset: auto;/, /height: auto;/, /margin: 0;/, /color: var\(--ce-color-text-primary\);/]) {
    assert.match(regel[1], d, `.ce-auswahl-liste: ${d} fehlt`);
  }
});

test("B6 — Zugänglichkeit: Combobox mit Liste, Zustand je Option, beschriftet über das sichtbare Etikett", () => {
  assert.match(menue, /role="combobox"/);
  assert.match(menue, /aria-haspopup="listbox"/);
  assert.match(menue, /aria-controls=\{offen \? listeId : undefined\}/);
  assert.match(menue, /aria-labelledby=\{labelId \? `\$\{labelId\} \$\{ausloeserId\}` : undefined\}/);
  assert.match(menue, /aria-busy=\{busy \|\| undefined\}/);
  assert.match(menue, /role="listbox"/);
  assert.match(menue, /aria-selected=\{o\.value === value\}/);
  assert.match(menue, /aria-disabled=\{o\.disabled \? true : undefined\}/);
  assert.match(menue, /data-wert=\{gewaehlt \? String\(gewaehlt\.value\) : ""\}/, "der Wert ist für Tests am Auslöser lesbar");
  // Ein eigener Name (aria-label, etwa Name plus Preis in Worten) verdrängt den Inhalt — Abzeichen, Erklärung und
  // Hinweis bleiben dann als Beschreibung erreichbar.
  assert.match(menue, /aria-label=\{o\.ariaLabel \|\| undefined\}/);
  assert.match(menue, /aria-describedby=\{beschreibungVon\(o, i\)\}/);
  assert.match(menue, /if \(!o\.ariaLabel\) return undefined;/, "ohne eigenen Namen läse der Screenreader alles doppelt");
  for (const teil of ["abzeichen", "beschreibung", "hinweis"]) {
    assert.match(menue, new RegExp(`id=\\{\`\\$\\{optionId\\(o, i\\)\\}-${teil}\`\\}`), `${teil} ohne id`);
  }
});
