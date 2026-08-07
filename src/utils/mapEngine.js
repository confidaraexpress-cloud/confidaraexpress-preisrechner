/* ── Kartenadapter — die einzige Stelle, die die Kartenbibliothek kennt ──────
   AccessPointMap.jsx spricht ausschließlich mit dem hier definierten, sehr
   kleinen Vertrag. Dadurch:
     • lässt sich die Bibliothek austauschen, ohne die Komponente anzufassen,
     • laden Tests niemals echte Kacheln aus dem Internet (eigene Engine),
     • bleibt ein Ausfall der Karte ein normaler Fehlerpfad statt eines Absturzes.

   Die Bibliothek wird BEWUSST dynamisch importiert: maplibre-gl ist groß und
   wird nur gebraucht, wenn der Kunde den Paketshop-Finder wirklich öffnet.
   Vite legt sie dadurch in einen eigenen Chunk, der die Buchungsseite nicht
   belastet.

   ENGINE-VERTRAG
     engine.createMap({ container, style, center, zoom }) → map
     map.setMarkers(marker[], { onSelect })   marker: { key, lat, lng, number, label, active }
     map.fitBounds(bounds, { padding, maxZoom })
     map.easeTo({ lat, lng, zoom })
     map.showPopup({ lat, lng, element }) / map.hidePopup()
     map.resize()
     map.destroy()
     map.whenReady() → Promise (erfüllt, sobald darstellbar; wirft bei Ausfall)

   TESTMODUS: Ist window.__CE_MAP_TEST_ENGINE__ gesetzt, wird genau diese
   Engine verwendet. Der Produktionspfad prüft nur auf ihre Existenz — es
   liegt KEIN Testcode im Anwendungsbündel. */

/* Wie lange die Karte höchstens braucht, um darstellbar zu werden. Danach gilt
   sie als ausgefallen und die Liste läuft allein weiter. Großzügig bemessen:
   auf langsamen Verbindungen darf der erste Aufbau dauern, ohne dass sofort
   eine Fehlerfläche erscheint. */
const MAP_READY_TIMEOUT_MS = 15000;

/** Marker-DOM sicher aufbauen: Text ausschließlich über textContent, nie innerHTML. */
function buildMarkerElement(marker, onSelect) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `ap-map-marker${marker.active ? " ap-map-marker--active" : ""}`;
  // Die Liste ist der zugängliche Weg durch die Ergebnisse (WCAG: gleichwertige
  // Alternative). 20 Marker zusätzlich in die Tabreihenfolge zu hängen würde sie
  // verdoppeln, ohne etwas hinzuzufügen — deshalb -1, aber mit echtem Label.
  el.tabIndex = -1;
  el.setAttribute("aria-label", marker.label);
  el.textContent = String(marker.number);
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect?.(marker.key);
  });
  return el;
}

function createMapLibreEngine(maplibregl) {
  return {
    name: "maplibre",
    createMap({ container, style, center, zoom }) {
      const map = new maplibregl.Map({
        container,
        style,
        center: [center.lng, center.lat],
        zoom,
        attributionControl: { compact: true },
        // Karten-Rotation kostet hier nur Orientierung — eine Shopsuche wird
        // nicht gedreht. Zoom/Pan bleiben selbstverständlich erhalten.
        pitchWithRotate: false,
        dragRotate: false,
        touchZoomRotate: true,
      });
      map.touchZoomRotate?.disableRotation?.();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      let marker = [];
      let popup = null;
      // BEREIT heißt hier ausdrücklich „der Stil steht“ — NICHT „alle Kacheln
      // sind da“. Zwei Dinge gehören dazu, beide gemessen:
      //
      //  1. Einzelne Kachelfehler dürfen die Karte NICHT abräumen. MapLibres
      //     „error“-Ereignis feuert auch für jedes einzelne fehlende Kachelbild
      //     (Netzaussetzer, Rate-Limit, blockierender Proxy). Eine frühere
      //     Fassung lehnte dieses Versprechen bei JEDEM error ab — ein einziges
      //     nicht geladenes Bild ersetzte damit die ganze Karte durch die
      //     Fehlerfläche, obwohl Marker und Bedienung funktioniert hätten.
      //  2. Auch „load“ taugt nicht als Signal: es wartet auf die Quellen und
      //     blieb bei gesperrtem Kachelserver nach 6 s noch aus. Marker sind
      //     DOM-Überlagerungen, fitBounds ist reine Rechnung — beides braucht
      //     kein Kachelbild. Deshalb löst „styledata“ die Bereitschaft aus und
      //     „load“ dient nur noch als Zweitweg.
      //
      // Fatale Fälle (kein WebGL, unlesbarer Stil) wirft entweder schon der
      // Konstruktor, oder es kommt gar kein Stil — dafür ist die Frist da.
      const bereit = new Promise((resolve, reject) => {
        const frist = setTimeout(
          () => reject(new Error("Karte wurde nicht rechtzeitig bereit")),
          MAP_READY_TIMEOUT_MS,
        );
        const fertig = () => { clearTimeout(frist); resolve(); };
        if (map.isStyleLoaded?.()) { fertig(); return; }
        map.once("styledata", fertig);
        map.once("load", fertig);
      });

      const clearMarkers = () => { for (const m of marker) m.remove(); marker = []; };

      return {
        whenReady: () => bereit,
        setMarkers(liste, { onSelect } = {}) {
          clearMarkers();
          for (const m of liste) {
            marker.push(
              new maplibregl.Marker({ element: buildMarkerElement(m, onSelect), anchor: "center" })
                .setLngLat([m.lng, m.lat])
                .addTo(map),
            );
          }
        },
        fitBounds(bounds, { padding, maxZoom } = {}) {
          map.fitBounds(
            [[bounds.west, bounds.south], [bounds.east, bounds.north]],
            { padding, maxZoom, duration: 0 },
          );
        },
        easeTo({ lat, lng, zoom }) {
          map.easeTo({ center: [lng, lat], zoom: zoom ?? map.getZoom(), duration: 320 });
        },
        showPopup({ lat, lng, element }) {
          if (!popup) {
            popup = new maplibregl.Popup({
              closeButton: false, closeOnClick: false, offset: 18, maxWidth: "300px",
              className: "ap-map-popup",
            });
          }
          popup.setLngLat([lng, lat]).setDOMContent(element).addTo(map);
        },
        hidePopup() { popup?.remove(); },
        resize() { map.resize(); },
        destroy() { clearMarkers(); popup?.remove(); map.remove(); },
      };
    },
  };
}

/**
 * Die zu verwendende Engine laden.
 *
 * Wirft, wenn die Bibliothek nicht geladen werden kann — der Aufrufer zeigt
 * dann den Kartenfehler und behält die Liste. Es gibt keinen stillen Fallback
 * auf „irgendeine andere Karte“.
 */
export async function loadMapEngine() {
  const test = typeof window !== "undefined" ? window.__CE_MAP_TEST_ENGINE__ : null;
  if (test) return test;
  // Stylesheet der Bibliothek liegt bewusst IM selben dynamischen Import: es
  // gehört zur Karte und soll die Buchungsseite nicht mitbelasten. Ohne es
  // säßen Bedienelemente und Popup-Spitze falsch.
  const [mod] = await Promise.all([
    import("maplibre-gl"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ]);
  const maplibregl = mod?.default ?? mod;
  if (!maplibregl?.Map) throw new Error("Kartenbibliothek unvollständig geladen");
  return createMapLibreEngine(maplibregl);
}
