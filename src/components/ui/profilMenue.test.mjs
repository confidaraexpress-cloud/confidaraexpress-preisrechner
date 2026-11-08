// Profilmenü am Benutzerchip (Betreiberentscheidung 2026-11-08) — Quelltextanker von Chip, Menü, Shells,
// Kontoeinstellungen und Stylesheet. Das Repository hat keine Renderschicht; das Verhalten im Browser prüft
// tests/e2e/profilMenue.test.mjs, die reine Logik utils/profilMenueView.test.mjs und utils/profilAbschnitt.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const chip = ohneKommentare(src("./UserChip.jsx"));
const menue = ohneKommentare(src("./ProfilMenue.jsx"));
const seite = ohneKommentare(src("../../pages/DashboardPage.jsx"));
const overview = ohneKommentare(src("../dashboard/Overview.jsx"));
const layout = ohneKommentare(src("../layout/DashboardLayout.jsx"));
const profil = ohneKommentare(src("../dashboard/Profile.jsx"));
const abschnitt = ohneKommentare(src("../dashboard/ProfileCardHead.jsx"));
const appKarte = ohneKommentare(src("../dashboard/AppInstallCard.jsx"));
const sprung = ohneKommentare(src("../../hooks/useAbschnittSprung.js"));
const editorial = src("../../styles/premium-editorial.css").replace(/\/\*[\s\S]*?\*\//g, "");
const overviewCss = src("../../styles/overview.css").replace(/\/\*[\s\S]*?\*\//g, "");
const ED = ':root[data-ce-bereich="kunde"] ';
function edRegel(selector, quelle = editorial) {
  const kopf = `${ED}${selector} {`;
  const start = quelle.indexOf(kopf);
  return start < 0 ? null : quelle.slice(start + kopf.length, quelle.indexOf("}", start));
}

test("1 — der Chip ist ein Menüknopf: aria-haspopup, aria-expanded, aria-controls nur bei offenem Menü — keine Navigation mehr", () => {
  const knopf = chip.slice(chip.indexOf('<button type="button" className="pp-uchip"'), chip.indexOf("</button>"));
  assert.match(knopf, /aria-haspopup="menu"/);
  assert.match(knopf, /aria-expanded=\{offen !== null\}/);
  assert.match(knopf, /aria-controls=\{offen \? menueId : undefined\}/);
  assert.match(knopf, /onClick=\{\(\) => setOffen\(\(o\) => \(o \? null : "erstes"\)\)\}/, "Klick schaltet um");
  assert.match(knopf, /onKeyDown=\{tasteAmChip\}/);
  assert.doesNotMatch(knopf, /aria-label=/, "R9: der Name entsteht aus dem sichtbaren Text");
  assert.match(knopf, /<span className="pp-uchip-pfeil" aria-hidden="true"><Icon n="chevron" s=\{16\} \/><\/span>/);
  assert.doesNotMatch(chip, /\bonClick\b[^\n]*navigat|"profile"/, "der Chip kennt kein Ziel");
  assert.match(chip, /export function UserChip\(\{ user, onNavigate, onLogout, label = PROFIL_MENUE_TEXT\.knopf \}\)/);
  assert.match(chip, /\{offen && \(\s*<ProfilMenue/);
  assert.match(chip, /marke=\{<CompanyMark initial=\{initial\} logoUrl=\{logoUrl\} \/>\}/, "der Kopf zeigt nicht dieselbe Marke");
});

test("2 — eine Aktion: zuerst schließen und Fokus an den Chip, dann der Weg der Shell; der Sprung nur als Folgeaktion", () => {
  const aktion = chip.slice(chip.indexOf("const auswaehlen"), chip.indexOf("const tasteAmChip"));
  assert.ok(aktion.indexOf("schliessen({ fokus: true });") > -1, "kein Fokus an den Chip");
  assert.ok(aktion.indexOf("schliessen({ fokus: true });") < aktion.indexOf("onLogout()"), "Abmelden vor dem Fokus");
  assert.ok(aktion.indexOf("schliessen({ fokus: true });") < aktion.indexOf("onNavigate("), "Navigation vor dem Fokus");
  assert.match(aktion, /if \(eintrag\.abmelden\) \{\s*if \(onLogout\) onLogout\(\);\s*return;\s*\}/);
  assert.match(aktion, /const folge = eintrag\.abschnitt \? \(\) => profilAbschnittAnfordern\(eintrag\.abschnitt\) : null;/);
  assert.match(aktion, /onNavigate\(eintrag\.ziel, null, folge\);/);
  assert.equal((chip.match(/profilAbschnittAnfordern\(/g) || []).length, 1, "Sprungwunsch außerhalb der Folgeaktion");
  assert.match(chip, /const schliessen = useCallback\(\(\{ fokus = false \} = \{\}\) => \{\s*setOffen\(null\);\s*if \(fokus\) knopfRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
});

test("3 — beide Shells geben ihre bestehenden Wege: Seitennavigation (mit Verlassen-Schutz) und Abmeldeweg", () => {
  assert.match(seite, /<UserChip user=\{user\} onNavigate=\{navigateTo\} onLogout=\{requestLogout\} \/>/);
  assert.match(seite, /onLogout=\{requestLogout\}\s*onNotificationNav=/, "die Übersicht bekommt den geschützten Abmeldeweg nicht");
  assert.match(overview, /<UserChip user=\{user\} onNavigate=\{onNavigate\} onLogout=\{onLogout\} \/>/);
  assert.doesNotMatch(overview, /onProfile/);
  assert.equal((layout.match(/<UserChip user=\{user\} onNavigate=\{navigateTo\} onLogout=\{abmelden\} \/>/g) || []).length, 2);
  assert.match(layout, /const abmelden = \(\) => \{\s*setSidebarOpen\(false\);\s*logout\(\);\s*navigate\("\/login"\);\s*\};/);
  assert.match(layout, /<DashboardSidebar[\s\S]*?onLogout=\{abmelden\}[\s\S]*?\/>/, "Sidebar und Menü teilen nicht denselben Abmeldeweg");
  for (const [name, code] of [["DashboardPage", seite], ["Overview", overview], ["DashboardLayout", layout]]) {
    assert.doesNotMatch(code, /<UserChip[^>]*onClick=/, `${name}: der Chip navigiert wieder direkt`);
  }
  // Der geschützte Abmeldeweg geht weiter durch den Verlassen-Schutz von „Neue Sendung".
  assert.match(seite, /const requestLogout = \(\) => \{\s*const target = \{ type: "logout" \};\s*if \(page === "new" && leaveGuardRef\.current && leaveGuardRef\.current\(target\)\) return;\s*performNav\(target\);\s*\};/);
});

test("4 — das Menü: Portal an <body>, Kopf außerhalb der Menürolle, Einträge als menuitem mit tabIndex -1", () => {
  assert.match(menue, /return createPortal\(/);
  assert.match(menue, /document\.body,\s*\);/);
  assert.match(menue, /<div className="ce-pm-liste" id=\{id\} role="menu" aria-labelledby=\{kopfId\} onKeyDown=\{tasteImMenue\}>/);
  assert.ok(menue.indexOf('className="ce-pm-kopf"') < menue.indexOf('role="menu"'), "der Kopf steht in der Menürolle");
  assert.match(menue, /<div className="ce-pm-identitaet" id=\{kopfId\}>/);
  assert.match(menue, /<span className="ce-pm-kontoart">\{PROFIL_MENUE_TEXT\.kontoart\}<\/span>/);
  assert.match(menue, /\{org && <span className="ce-pm-firma">\{org\}<\/span>\}/, "Firma ohne Rückfall erfunden");
  assert.match(menue, /role="menuitem"\s*tabIndex=\{-1\}/);
  assert.match(menue, /<div className="ce-pm-trenner" role="separator" \/>/);
  assert.match(menue, /\{!eintrag\.abmelden && <span className="ce-pm-pfeil" aria-hidden="true"><Icon n="chevronRight" s=\{16\} \/><\/span>\}/);
  assert.match(menue, /<span className="ce-pm-symbol" aria-hidden="true"><Icon n=\{eintrag\.icon\} s=\{18\} \/><\/span>/);
  assert.doesNotMatch(menue, /fetch\(|apiFetch|localStorage|sessionStorage|console\./, "das Menü lädt, speichert oder loggt");
  assert.doesNotMatch(chip, /fetch\(|apiFetch|localStorage|sessionStorage|ce_token|console\./);
});

test("5 — Schließen: Klick daneben (nicht der Chip), Escape und Tab mit Fokus an den Chip, Fokus außerhalb, jede Navigation", () => {
  const daneben = menue.slice(menue.indexOf("const daneben"), menue.indexOf("const taste = "));
  assert.match(daneben, /if \(boxRef\.current\?\.contains\(ziel\) \|\| ankerRef\.current\?\.contains\(ziel\)\) return;/);
  assert.match(daneben, /onSchliessenRef\.current\?\.\(\{ fokus: false \}\);/);
  assert.match(menue, /if \(e\.key !== "Escape"\) return;\s*e\.preventDefault\(\);\s*onSchliessenRef\.current\?\.\(\{ fokus: true \}\);/);
  assert.match(menue, /document\.addEventListener\("pointerdown", daneben\);/);
  assert.match(menue, /if \(e\.key === "Tab"\) onSchliessenRef\.current\?\.\(\{ fokus: true \}\);/);
  assert.doesNotMatch(menue.slice(menue.indexOf("const tasteImMenue")), /e\.key === "Tab"\)[^;]*preventDefault/, "Tab darf nicht festgehalten werden");
  assert.match(menue, /if \(location\.key !== startOrt\.current\) onSchliessenRef\.current\?\.\(\{ fokus: false \}\);/);
  assert.match(menue, /window\.addEventListener\("popstate", zurueck\);/, "Zurück/Vor des Browsers schließt nicht sofort");
  assert.match(menue, /window\.removeEventListener\("popstate", zurueck\);/);
  assert.match(menue, /onBlur=\{fokusVerlassen\}/);
  assert.match(menue, /if \(!anker \|\| !anker\.isConnected \|\| anker\.getClientRects\(\)\.length === 0\) \{\s*onSchliessenRef\.current\?\.\(\{ fokus: false \}\);/,
    "ein ausgeblendeter Chip schließt das Menü nicht");
});

test("6 — Fokus hinein erst, wenn das Menü gemessen und sichtbar ist; Lage aus der reinen Logik", () => {
  assert.match(menue, /const bereit = lage !== null;/);
  assert.match(menue, /if \(!bereit\) return;\s*const liste = eintragRefs\.current\.filter\(Boolean\);\s*const ziel = start === "letztes" \? liste\[liste\.length - 1\] : liste\[0\];/);
  assert.match(menue, /profilMenueLage\(\{ anker: anker\.getBoundingClientRect\(\), flaeche: sichtbareFlaeche\(\) \}\)/);
  assert.match(menue, /: \{ visibility: "hidden" \};/, "vor der Messung sichtbar");
  assert.match(menue, /profilMenueZiel\(e\.key, liste\.indexOf\(document\.activeElement\), liste\.length\)/);
});

test("7 — „Sicherheit & Passwort“: Abschnitt „Sicherheit“ der bestehenden Kontoeinstellungen als Sprungziel, keine neue Seite", () => {
  assert.match(profil, /<SettingsSection title="Sicherheit" subtitle="Schützen Sie Ihr Konto" id="profil-sicherheit"\s*className="profile-card--sprungziel" abschnittRef=\{sicherheitRef\} titelRef=\{sicherheitTitelRef\}>/);
  assert.match(profil, /useSyncExternalStore\(profilAbschnittAbonnieren, profilAbschnittWunsch, \(\) => null\)/);
  assert.match(profil, /if \(abschnittWunsch !== "sicherheit" \|\| !profilAbschnittEinloesen\("sicherheit"\)\) return;\s*setSicherheitSprung\(true\);/);
  assert.match(profil, /useAbschnittSprung\(sicherheitSprung, sicherheitRef, sicherheitTitelRef, \(\) => setSicherheitSprung\(false\), \{ oben: true \}\);/);
  assert.match(profil, /<PasswordChangeSection \/>/, "die Passwortänderung ist nicht mehr die bestehende");
  assert.match(abschnitt, /<section id=\{id\} ref=\{abschnittRef\}/);
  assert.match(abschnitt, /<h2 className="table-card-title" ref=\{titelRef\} tabIndex=\{titelRef \? -1 : undefined\}>\{title\}<\/h2>/);
  // Ein gemeinsamer Sprung: die App-Karte nutzt denselben Hook unverändert (ohne „oben“).
  assert.match(appKarte, /useAbschnittSprung\(sprung, karteRef, titelRef, \(\) => setSprung\(false\)\);/);
  assert.equal((appKarte.match(/scrollTo\(|ResizeObserver/g) || []).length, 0, "die App-Karte hat wieder einen eigenen Sprung");
  assert.match(sprung, /export function useAbschnittSprung\(aktiv, zielRef, fokusRef, onEnde, \{ oben = false \} = \{\}\)/);
  assert.match(sprung, /if \(oben \? Math\.abs\(ziel - window\.scrollY\) >= 2 : !imBild\(\)\) \{/);
  for (const ereignis of ["wheel", "touchstart", "pointerdown", "keydown"]) assert.ok(sprung.includes(`"${ereignis}"`), `Nutzeraktion ${ereignis} beendet den Sprung nicht`);
  assert.match(sprung, /fertigTimer = window\.setTimeout\(beenden, 2000\);/);
});

test("8 — Stylesheet: Kundenbereich, Ebene der Fenster, Material der Kennzahlfenster, Zeigen nur mit echtem Zeiger", () => {
  const box = edRegel(".ce-pm");
  assert.ok(box, "Abschnitt 28 fehlt");
  assert.match(box, /position: absolute;/);
  assert.match(box, /z-index: var\(--ce-z-dropdown\);/);
  assert.match(box, /background: var\(--ce-pr-ed-karte-licht\) padding-box, var\(--ce-pr-ed-kante-licht\) border-box;/);
  assert.match(box, /box-shadow: var\(--ce-pr-ed-shadow-fenster\);/);
  assert.match(box, /border-radius: var\(--ce-pr-radius-card\);/);
  assert.match(edRegel(".ce-pm-eintrag"), /min-height: 3\.25rem;/);
  assert.match(editorial, /@media \(max-height: 30em\) \{[\s\S]*?\.ce-pm-eintrag \{ min-height: 3rem;/, "flache Fenster: Ziele unter 48 px");
  assert.match(editorial, /@media \(hover: hover\) and \(pointer: fine\) \{\s*:root\[data-ce-bereich="kunde"\] \.ce-pm-eintrag:hover \{ background: var\(--ce-pr-signal-soft\); \}/);
  assert.match(edRegel(".ce-pm-eintrag:focus-visible"), /outline: var\(--ce-focus-ring\);\s*outline-offset: -2px;/);
  assert.match(editorial, /@media \(prefers-reduced-motion: no-preference\) \{\s*:root\[data-ce-bereich="kunde"\] \.ce-pm\[data-bereit\] \{ animation: ce-pm-auf 160ms/);
  assert.match(editorial, /@media \(prefers-reduced-motion: reduce\) \{\s*:root\[data-ce-bereich="kunde"\] :is\(\.ce-pm-eintrag, \.ce-pm-symbol, \.ce-pm-pfeil svg\) \{ transition: none; \}/);
  assert.match(editorial, /@media print \{\s*:root\[data-ce-bereich="kunde"\] \.ce-pm \{ display: none; \}/);
  assert.match(edRegel(".ce-pm-liste"), /overflow-y: auto;/, "zu wenig Höhe: nur die Liste scrollt");
  // Chip: Klappmarke dreht sich offen, ohne Bewegung bei reduzierter Bewegung.
  assert.match(overviewCss, /\.pp-uchip\[aria-expanded="true"\] \.pp-uchip-pfeil svg \{ transform: rotate\(180deg\); \}/);
  assert.match(overviewCss, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.pp-uchip-pfeil svg \{ transition: none; \}/);
});

test("9 — Mobil unverändert: die Topbar trägt weiter Menü, Marke und Glocke; der Chip bleibt im Seitenkopf", () => {
  for (const [name, code] of [["DashboardPage", seite], ["DashboardLayout", layout]]) {
    const bar = code.slice(code.indexOf('className="mobile-topbar"'), code.indexOf("</div>", code.indexOf('className="topbar-right"')));
    assert.ok(bar.length > 0, `${name}: Topbar nicht gefunden`);
    assert.doesNotMatch(bar, /UserChip|ProfilMenue/, `${name}: Profilmenü in der Topbar`);
  }
});
