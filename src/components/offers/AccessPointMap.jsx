import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import { loadMapEngine } from "../../utils/mapEngine";
import {
  mapStyle, MAP_FALLBACK_CENTER, MAP_FALLBACK_ZOOM,
  MAP_SINGLE_MARKER_ZOOM, MAP_FIT_PADDING, MAP_FIT_MAX_ZOOM,
} from "../../config/map";
import { accessPointBounds, formatDistance } from "../../utils/accessPointView";

/* ── Karte des Paketshop-Finders ─────────────────────────────────────────────
   Ergänzende Visualisierung — NIE die autoritative Darstellung. Die Liste
   zeigt immer alle Treffer; die Karte zeigt die, für die JUMiNGO Koordinaten
   liefert. Fällt sie ganz aus (kein WebGL, Kacheln nicht erreichbar, Bibliothek
   nicht ladbar), bleibt die Liste unberührt und hier steht ein ruhiger Hinweis.

   Die Marker tragen die Nummer ihres Listeneintrags. Ein Shop ohne Koordinaten
   überspringt seine Nummer — die Nummerierung folgt der Liste, nicht den
   Markern (siehe accessPointMarkers in accessPointView.mjs).

   Das Popup wird als React-Portal in einen von der Karte verwalteten Knoten
   gerendert. Damit steht dort echtes JSX statt einer zusammengebauten HTML-
   Zeichenkette — kein innerHTML, kein Weg für Shopnamen in den Parser. */

export function AccessPointMap({
  markers, activeKey, onSelect, searchLabel,
  countryCode, // eslint-disable-line no-unused-vars -- Signaturteil, bewusst ungenutzt
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupHostRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [popupReady, setPopupReady] = useState(false);

  // Callbacks als Ref: die Karte wird EINMAL erzeugt und soll nicht bei jedem
  // Render des Elternteils neu aufgebaut werden (das setzte Zoom und Position
  // jedes Mal zurück und ließe die Kacheln flackern).
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // ── Karte einmalig aufbauen ────────────────────────────────────────────────
  useEffect(() => {
    let abgebrochen = false;
    let beobachter = null;
    const host = document.createElement("div");
    popupHostRef.current = host;

    (async () => {
      try {
        const engine = await loadMapEngine();
        if (abgebrochen || !containerRef.current) return;
        const map = engine.createMap({
          container: containerRef.current,
          style: mapStyle(),
          center: MAP_FALLBACK_CENTER,
          zoom: MAP_FALLBACK_ZOOM,
        });
        mapRef.current = map;
        await map.whenReady();
        if (abgebrochen) { map.destroy(); mapRef.current = null; return; }
        setStatus("ready");
        setPopupReady(true);
        // Die Karte entsteht, während das Fenster noch aufbaut: Liste, Kopf und
        // Zählerzeile bestimmen die endgültige Höhe der Kartenspalte erst danach.
        // Ohne dieses Nachziehen behält der Zeichenbereich seine Anfangsmaße —
        // gemessen: 768×300 in einer 768×542 großen Spalte, also ein Drittel der
        // Fläche leer und alle Marker im falschen Ausschnitt.
        //
        // Derselbe Beobachter trägt den mobilen Wechsel „Liste ↔ Karte": dort
        // geht die Spalte von display:none auf sichtbar. Neu aufbauen wäre der
        // teurere und sichtbar ruckelnde Weg — resize genügt.
        map.resize();
        beobachter = new ResizeObserver(() => { try { map.resize(); } catch { /* Karte ist fort */ } });
        if (containerRef.current) beobachter.observe(containerRef.current);
      } catch {
        // Bewusst ohne technische Details: der Kunde kann mit einem Stacktrace
        // nichts anfangen, und die Liste funktioniert ohnehin weiter.
        if (!abgebrochen) setStatus("error");
      }
    })();

    return () => {
      abgebrochen = true;
      beobachter?.disconnect();
      try { mapRef.current?.destroy(); } catch { /* Karte war nie bereit */ }
      mapRef.current = null;
    };
  }, []);

  // ── Marker setzen und Ausschnitt einpassen ─────────────────────────────────
  // Der Ausschnitt folgt der Markermenge, nicht der Auswahl: ein Filterwechsel
  // passt neu ein, ein Klick auf einen Shop nicht (das erledigt der Effekt
  // darunter gezielt). Sonst spränge die Karte bei jedem Listenklick.
  const markerSignatur = markers.map((m) => m.key).join("|");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    map.setMarkers(
      markers.map((m) => ({ ...m, active: m.key === activeKey })),
      { onSelect: (key) => onSelectRef.current?.(key) },
    );
    const bounds = accessPointBounds(markers);
    if (!bounds) return;
    if (markers.length === 1) {
      map.easeTo({ lat: bounds.south, lng: bounds.west, zoom: MAP_SINGLE_MARKER_ZOOM });
    } else {
      map.fitBounds(bounds, { padding: MAP_FIT_PADDING, maxZoom: MAP_FIT_MAX_ZOOM });
    }
    // activeKey bewusst NICHT in den Abhängigkeiten: sonst passte die Karte bei
    // jedem Listenklick den Ausschnitt neu ein.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerSignatur, status]);

  // ── Auswahl hervorheben, anfliegen, Popup zeigen ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    map.setMarkers(
      markers.map((m) => ({ ...m, active: m.key === activeKey })),
      { onSelect: (key) => onSelectRef.current?.(key) },
    );
    const aktiv = markers.find((m) => m.key === activeKey);
    if (!aktiv) { map.hidePopup(); return; }
    map.easeTo({ lat: aktiv.lat, lng: aktiv.lng });
    if (popupHostRef.current) map.showPopup({ lat: aktiv.lat, lng: aktiv.lng, element: popupHostRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, markerSignatur, status]);

  const aktiv = markers.find((m) => m.key === activeKey);

  if (status === "error") {
    return (
      <div className="ap-map ap-map--error" role="note">
        <div className="ap-map-fallback">
          <Icon n="info" s={24} c="currentColor" />
          <p className="ap-map-fallback-title">Karte konnte nicht geladen werden.</p>
          <p className="ap-map-fallback-text">
            Die Paketshops stehen vollständig in der Liste — nur die Kartenansicht
            fehlt.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ap-map">
      <div className="ap-map-canvas" ref={containerRef} aria-hidden="true" />

      {status === "loading" && (
        <div className="ap-map-loading"><span className="spinner" /> Karte wird geladen …</div>
      )}

      {status === "ready" && markers.length === 0 && (
        <div className="ap-map-empty">Keine Paketshops mit Kartenposition.</div>
      )}

      {searchLabel && status === "ready" && (
        <p className="ap-map-context">{searchLabel}</p>
      )}

      {/* Popup-Inhalt als echtes JSX in den von der Karte gehaltenen Knoten.
          Kein „Buchen“/„Auswählen“: eine verbindliche Shopauswahl ist nicht
          Teil des Buchungsflusses (siehe Hinweis im Modalkopf). */}
      {popupReady && aktiv && popupHostRef.current && createPortal(
        <div className="ap-map-popup-card">
          <p className="ap-map-popup-name">
            <span className="ap-map-popup-num">{aktiv.number}</span>
            {aktiv.shop.name || aktiv.shop.address}
          </p>
          {aktiv.shop.name && aktiv.shop.address && (
            <p className="ap-map-popup-addr">{aktiv.shop.address}</p>
          )}
          <p className="ap-map-popup-meta">
            {aktiv.shop.distance != null && (
              <span className="ap-map-popup-dist">
                {formatDistance(aktiv.shop.distance, aktiv.shop.distanceCode)}
              </span>
            )}
            <span className={aktiv.shop.status.badgeClass}>{aktiv.shop.status.label}</span>
          </p>
          {aktiv.shop.hours && <p className="ap-map-popup-hours">{aktiv.shop.hours}</p>}
        </div>,
        popupHostRef.current,
      )}
    </div>
  );
}
