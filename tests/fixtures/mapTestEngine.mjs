/* ── Karten-Testengine ───────────────────────────────────────────────────────
   Wird per page.addInitScript() in die Seite gelegt, BEVOR die Anwendung lädt.
   AccessPointMap findet sie über window.__CE_MAP_TEST_ENGINE__ und benutzt
   dann sie statt maplibre-gl.

   Damit laden Tests:
     • keine Kartenkacheln aus dem Internet,
     • keine 970-kB-Bibliothek,
     • kein WebGL (im Headless-Browser oft gar nicht verfügbar).

   Sie bildet den Engine-Vertrag aus src/utils/mapEngine.js 1:1 als DOM ab —
   jeder Marker wird ein echtes Element mit denselben Klassen. Dadurch prüfen
   die Tests wirklich das Zusammenspiel von Liste, Auswahl und Markern und
   nicht eine Attrappe daneben.

   Die zuletzt gesetzten Aufrufe landen in window.__CE_MAP_CALLS__, damit Tests
   fitBounds/easeTo nachweisen können, ohne in die Bibliothek zu greifen. */

export const MAP_TEST_ENGINE_SCRIPT = `
window.__CE_MAP_CALLS__ = { fitBounds: [], easeTo: [], popups: 0, created: 0 };
window.__CE_MAP_TEST_ENGINE__ = {
  name: "test",
  createMap({ container }) {
    window.__CE_MAP_CALLS__.created += 1;
    const wurzel = document.createElement("div");
    wurzel.className = "ap-map-test";
    container.appendChild(wurzel);

    const markerSchicht = document.createElement("div");
    markerSchicht.className = "ap-map-test-markers";
    wurzel.appendChild(markerSchicht);

    const popupSchicht = document.createElement("div");
    popupSchicht.className = "ap-map-test-popup";
    popupSchicht.hidden = true;
    wurzel.appendChild(popupSchicht);

    return {
      whenReady: () => Promise.resolve(),
      setMarkers(liste, { onSelect } = {}) {
        markerSchicht.textContent = "";
        for (const m of liste) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "ap-map-marker" + (m.active ? " ap-map-marker--active" : "");
          el.tabIndex = -1;
          el.setAttribute("aria-label", m.label);
          el.dataset.markerKey = m.key;
          el.dataset.lat = String(m.lat);
          el.dataset.lng = String(m.lng);
          el.textContent = String(m.number);
          el.addEventListener("click", (e) => { e.stopPropagation(); onSelect && onSelect(m.key); });
          markerSchicht.appendChild(el);
        }
      },
      fitBounds(b, opts) { window.__CE_MAP_CALLS__.fitBounds.push({ bounds: b, opts: opts || null }); },
      easeTo(p) { window.__CE_MAP_CALLS__.easeTo.push(p); },
      showPopup({ element }) {
        window.__CE_MAP_CALLS__.popups += 1;
        popupSchicht.hidden = false;
        if (element.parentNode !== popupSchicht) popupSchicht.appendChild(element);
      },
      hidePopup() { popupSchicht.hidden = true; },
      resize() {},
      destroy() { wurzel.remove(); },
    };
  },
};
`;

/* Variante, die den Ausfall der Karte erzwingt (TEIL 24): die Liste muss
   vollständig funktionsfähig bleiben, und es darf nur ein ruhiger Hinweis
   erscheinen — keine technische Rohmeldung. */
export const MAP_TEST_ENGINE_BROKEN_SCRIPT = `
window.__CE_MAP_TEST_ENGINE__ = {
  name: "test-broken",
  createMap() { throw new Error("WebGL nicht verfügbar"); },
};
`;
