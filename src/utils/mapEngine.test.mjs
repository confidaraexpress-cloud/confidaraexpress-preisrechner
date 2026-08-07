/* Vertrag des Kartenadapters — Quelltextprüfung.
   =============================================================================
   Diese Datei prüft Zusicherungen, die weder ein Browsertest noch eine reine
   Logikprüfung erreicht: Die E2E-Tests laufen bewusst gegen die DOM-Testengine
   (keine Kacheln, kein WebGL), sehen also den echten maplibre-Pfad nie. Genau
   dort sitzen aber die Eigenschaften, die teuer sind, wenn sie verrutschen:
   Bündelgröße, Sicherheit und die Frage, was einen Kartenausfall auslöst.

   Jede Zusicherung hier hat einen gemessenen Anlass. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ENGINE = lies("./mapEngine.js");
const CONFIG = lies("../config/map.js");
const KARTE = lies("../components/offers/AccessPointMap.jsx");

test("1 — die Kartenbibliothek wird ausschließlich dynamisch geladen", () => {
  // Sonst läge maplibre-gl (rund 970 kB) im Hauptbündel und belastete jede
  // Seite — auch die, die nie eine Karte zeigt.
  assert.match(ENGINE, /\bimport\("maplibre-gl"\)/, "kein dynamischer Import");
  for (const [name, quelle] of [["mapEngine.js", ENGINE], ["AccessPointMap.jsx", KARTE], ["map.js", CONFIG]]) {
    assert.doesNotMatch(quelle, /^import\s[^\n]*from\s+["']maplibre-gl["']/m,
      `${name}: statischer Import zieht die Bibliothek ins Hauptbündel`);
  }
});

test("2 — ein einzelner Kachelfehler räumt die Karte NICHT ab", () => {
  // GEMESSENER ANLASS: Eine frühere Fassung tat genau das —
  //   map.once("error", (e) => reject(...))
  // MapLibres „error“-Ereignis feuert aber auch für JEDES einzelne fehlende
  // Kachelbild (Netzaussetzer, Rate-Limit, blockierender Proxy). Ein einziges
  // nicht geladenes Bild ersetzte damit die gesamte Karte durch die
  // Fehlerfläche. Nachgemessen bei blockiertem Kachelserver: Karte weg,
  // obwohl Marker und Bedienung funktioniert hätten.
  assert.doesNotMatch(ENGINE, /once\("error"[^)]*reject/,
    "die Bereitschaft darf nicht am error-Ereignis scheitern — das feuert je Kachel");
  // Bereitschaft haengt am STIL, nicht an den Kacheln: Marker sind DOM-
  // Ueberlagerungen, fitBounds ist reine Rechnung — beides braucht kein
  // Kachelbild. „load“ wartet dagegen auf die Quellen und blieb bei gesperrtem
  // Kachelserver messbar aus (nach 6 s noch Ladezustand).
  assert.match(ENGINE, /once\("styledata", fertig\)/, "der Stil muss die Bereitschaft ausloesen");
  assert.match(ENGINE, /once\("load", fertig\)/, "das load-Ereignis bleibt der Zweitweg");
  assert.match(ENGINE, /setTimeout\(\s*\n?\s*\(\)\s*=>\s*reject/, "ohne Frist bliebe ein toter Ladezustand stehen");
});

test("3 — Shopnamen kommen nie in einen HTML-Parser", () => {
  // Das JWT liegt bewusst im localStorage; unsanitiertes innerHTML wäre damit
  // ein direkter XSS-Pfad. Marker bauen ihren Text über textContent, das Popup
  // rendert React in einen von der Karte gehaltenen Knoten (Portal).
  // Auf die VERWENDUNG prüfen, nicht auf das Wort: beide Dateien erklären in
  // ihren Kommentaren ausdrücklich, warum sie kein innerHTML benutzen — ein
  // Wortfilter schlüge genau dort an und nirgends sonst.
  for (const [name, quelle] of [["mapEngine.js", ENGINE], ["AccessPointMap.jsx", KARTE]]) {
    assert.doesNotMatch(quelle, /\.innerHTML\s*=|dangerouslySetInnerHTML\s*=|\.insertAdjacentHTML\(/,
      `${name}: HTML-Injektionspfad`);
  }
  assert.match(ENGINE, /textContent = String\(marker\.number\)/, "Markertext muss über textContent laufen");
  assert.match(KARTE, /createPortal/, "das Popup muss echtes React sein, keine HTML-Zeichenkette");
});

test("4 — kein Token im Quelltext, kein Token im Log", () => {
  // Der Schlüssel steht ausschließlich in einer Umgebungsvariablen und wird nur
  // an die Stil-URL gehängt.
  assert.match(CONFIG, /VITE_MAPBOX_ACCESS_TOKEN/);
  for (const [name, quelle] of [["map.js", CONFIG], ["mapEngine.js", ENGINE], ["AccessPointMap.jsx", KARTE]]) {
    assert.doesNotMatch(quelle, /console\.(log|warn|error|info|debug)/, `${name}: Ausgabe im Kartenpfad`);
    // Ein echter Mapbox-/MapTiler-Schlüssel im Quelltext (pk./sk.-Präfix).
    assert.doesNotMatch(quelle, /["'](pk|sk)\.[A-Za-z0-9._-]{20,}["']/, `${name}: eingebetteter Schlüssel`);
  }
});

test("5 — die Konfiguration ist die EINZIGE Stelle mit Provider-Wissen", () => {
  // Stil-URL und Token stehen nur in config/map.js; Adapter und Komponente
  // kennen den Anbieter nicht.
  for (const [name, quelle] of [["mapEngine.js", ENGINE], ["AccessPointMap.jsx", KARTE]]) {
    assert.doesNotMatch(quelle, /tile\.openstreetmap\.org|api\.maptiler\.com|api\.mapbox\.com/,
      `${name}: Anbieter-URL außerhalb der Konfiguration`);
  }
  assert.match(CONFIG, /tile\.openstreetmap\.org/, "der Standardstil gehört in die Konfiguration");
});

test("6 — ohne Konfiguration braucht die Karte keine Zugangsdaten", () => {
  // Damit läuft sie in Entwicklung und Vorschau sofort. Der Stil ist ein
  // eingebettetes Objekt — es gibt also keinen zusätzlichen Fehlerpfad
  // „Stil nicht ladbar“ im Standardfall.
  assert.match(CONFIG, /export const OSM_RASTER_STYLE = \{/);
  assert.match(CONFIG, /if \(!url\) return OSM_RASTER_STYLE;/);
});

test("7 — es gibt genau einen Kartenadapter und einen Testeinstieg", () => {
  // Der Testeinstieg ist eine reine Abfrage — es liegt KEIN Testcode im
  // Anwendungsbündel.
  assert.match(ENGINE, /window\.__CE_MAP_TEST_ENGINE__/);
  assert.match(ENGINE, /export async function loadMapEngine/);
  // Und die Komponente baut die Karte ausschließlich über den Adapter.
  assert.match(KARTE, /loadMapEngine\(\)/);
  assert.doesNotMatch(KARTE, /new\s+\w*\.?Map\(/, "die Komponente darf die Bibliothek nicht selbst instanziieren");
});
