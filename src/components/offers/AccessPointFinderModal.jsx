import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { useDialog } from "../../hooks/useDialog";
import { AccessPointList } from "./AccessPointList";
import { AccessPointMap } from "./AccessPointMap";
import {
  filterAccessPointsByOpening,
  accessPointMarkers,
  accessPointCountLabel,
  openingFilterCountLabel,
  openingFilterExcludedLabel,
  openingFilterEmptyText,
  mapCoverageLabel,
  OPENING_FILTER_ALL,
  OPENING_FILTER_OPTIONS,
} from "../../utils/accessPointView";

/* ── Großes Paketshop-Finder-Fenster ─────────────────────────────────────────
   Ein Arbeitsfenster, kein Bestätigungsdialog: links die vollständige,
   eigenständig scrollende Trefferliste, rechts die Karte. Such- und
   Filterfelder bleiben im Kopf bedienbar, damit Radius und Öffnungszeiten
   geändert werden können, ohne das Fenster zu schließen.

   BEWUSSTE GRENZEN
     • Es gibt keine verbindliche Shopauswahl — das ist nicht Teil des
       Buchungsflusses. Der Zustand heißt deshalb `focusedKey`: er steuert
       ausschließlich Kartenfokus und Hervorhebung. Kein „Buchen“, kein
       „Auswählen“, kein Feld im /book-Payload.
     • Die Liste ist autoritativ. Fällt die Karte aus, ändert sich an ihr nichts.
     • Der 5er-Anzeigeschnitt der früheren Inline-Liste entfällt hier: die
       Liste scrollt selbst, und JUMiNGO liefert höchstens ~20 Treffer. Ein
       „Weitere anzeigen“ wäre eine Hürde ohne Zweck.

   Fokus, Fokusrückgabe und Escape kommen aus dem gemeinsamen useDialog-Hook —
   kein zweites Dialogsystem. */

const MOBILE_BREAKPOINT = 860;

export function AccessPointFinderModal({
  open, onClose, titleId, returnFocusTo,
  // Suchzustand (im Elternteil gehalten, damit er das Schließen überlebt)
  postCode, city, street, radius, openingFilter,
  onPostCodeChange, onCityChange, onStreetChange, onRadiusChange, onOpeningFilterChange,
  radiusOptions, streetRequired, cityRequired,
  onSearch, canSearch,
  // Ergebniszustand
  loading, error, results, countryCode,
}) {
  // returnFocusTo zeigt auf den Suchknopf. Er wird beim Öffnen deaktiviert
  // (der Ladevorgang startet im selben Render), verliert dadurch den Fokus —
  // und wäre ohne diese Angabe als Rückgabeziel verloren.
  const dialogRef = useDialog({ open, onClose, returnFocusTo });
  const listRef = useRef(null);
  const [focusedKey, setFocusedKey] = useState(null);
  const [expandedKey, setExpandedKey] = useState(null);
  const [mobileView, setMobileView] = useState("list"); // list | map
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Öffnungszeitenfilter: einzige Auswahlstufe nach der Sortierung ─────────
  // `results` bleibt vollständig erhalten; bei „Alle Öffnungszeiten“ passiert
  // hier nichts. workState entscheidet an KEINER Stelle über Sichtbarkeit.
  const { matching: sichtbar, excluded: ausgeschlossen, filtered: filterAktiv } =
    filterAccessPointsByOpening(results || [], openingFilter);

  // Stabile Schlüssel und Listennummern. Die Nummer ist die Position in der
  // sichtbaren Liste — dieselbe Zahl trägt der Marker.
  const shops = useMemo(
    () => sichtbar.map((s, i) => ({ ...s, key: `ap-${i}-${s.name || s.address}`, number: i + 1 })),
    [sichtbar],
  );

  const markers = useMemo(
    () => accessPointMarkers(shops).map((m) => ({
      key: m.accessPoint.key,
      lat: m.lat,
      lng: m.lng,
      number: m.accessPoint.number,
      label: `${m.accessPoint.number}. ${m.accessPoint.name || m.accessPoint.address}`,
      shop: m.accessPoint,
    })),
    [shops],
  );

  // Ein Filterwechsel darf keinen Fokus auf einen nicht mehr sichtbaren Shop
  // stehen lassen — sonst zeigte die Karte ein Popup zu einem Eintrag, den die
  // Liste gar nicht mehr führt.
  useEffect(() => {
    if (focusedKey && !shops.some((s) => s.key === focusedKey)) setFocusedKey(null);
    if (expandedKey && !shops.some((s) => s.key === expandedKey)) setExpandedKey(null);
  }, [shops, focusedKey, expandedKey]);

  // Markerklick → Listeneintrag sichtbar scrollen. Der Fokus wandert dabei
  // NICHT ins DOM: das riss auf Mobil den Blick aus der Karte, die der Kunde
  // gerade bedient. Sichtbar machen genügt.
  const fokussiere = (key, { scroll } = {}) => {
    setFocusedKey((v) => (v === key ? null : key));
    if (!scroll) return;
    const el = listRef.current?.querySelector(`[data-ap-key="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  if (!open) return null;

  const hatAntwort = !loading && !error && results !== null;
  const zaehler = !hatAntwort
    ? null
    : filterAktiv
      ? openingFilterCountLabel(shops.length, shops.length)
      : accessPointCountLabel(shops.length, shops.length);
  const randnotiz = hatAntwort && filterAktiv ? openingFilterExcludedLabel(ausgeschlossen.length) : null;
  const kartenhinweis = hatAntwort ? mapCoverageLabel(markers.length, shops.length) : null;

  const suchkontext = [
    [street, [postCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    `Umkreis ${radius} km`,
  ].filter(Boolean).join(" · ");

  const karte = (
    <AccessPointMap
      markers={markers}
      activeKey={focusedKey}
      onSelect={(key) => fokussiere(key, { scroll: true })}
      searchLabel={kartenhinweis}
      countryCode={countryCode}
    />
  );

  return (
    <div className="ce-dialog-overlay ap-modal-overlay" onClick={onClose}>
      <div
        className="ap-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Kopf ── */}
        <header className="ap-modal-head">
          <div className="ap-modal-head-text">
            <p className="ap-modal-eyebrow">Paketshop Finder</p>
            <h2 className="ap-modal-title" id={titleId}>Paketshops in Ihrer Nähe</h2>
            <p className="ap-modal-sub">Finden Sie passende Abgabestellen für Ihren Versand.</p>
          </div>
          <button
            type="button"
            className="ap-modal-close"
            onClick={onClose}
            aria-label="Paketshop Finder schließen"
            title="Schließen"
          >
            <Icon n="close" s={18} c="currentColor" />
          </button>
        </header>

        {/* ── Such- und Filterbereich ── */}
        <form
          className="ap-modal-search"
          onSubmit={(e) => { e.preventDefault(); onSearch(); }}
        >
          <div className="ap-modal-field">
            <label className="ap-finder-label" htmlFor="apm-zip">PLZ</label>
            <input
              id="apm-zip" className="ap-finder-input" value={postCode}
              onChange={(e) => onPostCodeChange(e.target.value)}
              inputMode="numeric" autoComplete="off" maxLength={10}
            />
          </div>
          <div className="ap-modal-field">
            <label className="ap-finder-label" htmlFor="apm-city">
              Ort {cityRequired && <span className="ap-finder-required">(erforderlich)</span>}
            </label>
            <input
              id="apm-city" className="ap-finder-input" value={city}
              onChange={(e) => onCityChange(e.target.value)}
              autoComplete="off" maxLength={100}
            />
          </div>
          <div className="ap-modal-field ap-modal-field--street">
            <label className="ap-finder-label" htmlFor="apm-street">
              Straße {streetRequired
                ? <span className="ap-finder-required">(erforderlich)</span>
                : <span className="ap-finder-optional">(optional)</span>}
            </label>
            <input
              id="apm-street" className="ap-finder-input" value={street}
              onChange={(e) => onStreetChange(e.target.value)}
              autoComplete="off" maxLength={200}
            />
          </div>
          <div className="ap-modal-field">
            <label className="ap-finder-label" htmlFor="apm-radius">Umkreis</label>
            <select
              id="apm-radius" className="ap-finder-select" value={radius}
              onChange={(e) => onRadiusChange(Number(e.target.value))}
            >
              {radiusOptions.map((km) => <option key={km} value={km}>{km} km</option>)}
            </select>
          </div>
          <div className="ap-modal-field">
            <label className="ap-finder-label" htmlFor="apm-opening">Öffnungszeiten</label>
            <select
              id="apm-opening" className="ap-finder-select" value={openingFilter}
              onChange={(e) => onOpeningFilterChange(e.target.value)}
            >
              {OPENING_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="ap-modal-search-btn" disabled={!canSearch}>
            {loading
              ? <><span className="spinner" /> Suchen …</>
              : <><Icon n="search" s={15} c="currentColor" /> Suchen</>}
          </button>
        </form>

        {/* Fachliche Grenze — dieselbe Aussage wie auf der Hauptseite. */}
        <p className="ap-modal-note">
          <Icon n="info" s={14} c="currentColor" />
          <span>
            Die Paketshop-Suche dient der Orientierung – eine verbindliche Auswahl
            eines Shops ist nicht erforderlich.
          </span>
        </p>

        {/* ── Ergebniszeile + mobiler Umschalter ── */}
        <div className="ap-modal-bar">
          <div className="ap-modal-bar-text">
          {/* Suchkontext: der Radius gehört hierher, nicht an jeden Shop. Die
              Felder darüber sind zwar änderbar, aber diese Zeile fasst zusammen,
              worauf sich die gezeigte Menge bezieht. */}
          <p className="ap-modal-context-line">{suchkontext}</p>
          <p className="ap-modal-count" role="status">
            {loading ? "Paketshops werden gesucht …" : (
              <>
                {zaehler}
                {randnotiz && <span className="ap-modal-note-inline"> · {randnotiz}</span>}
              </>
            )}
          </p>
          </div>
          {isMobile && hatAntwort && shops.length > 0 && (
            <div className="ap-modal-toggle" role="group" aria-label="Darstellung">
              <button
                type="button"
                className={`ap-modal-toggle-btn${mobileView === "list" ? " ap-modal-toggle-btn--on" : ""}`}
                aria-pressed={mobileView === "list"}
                onClick={() => setMobileView("list")}
              >Liste</button>
              <button
                type="button"
                className={`ap-modal-toggle-btn${mobileView === "map" ? " ap-modal-toggle-btn--on" : ""}`}
                aria-pressed={mobileView === "map"}
                onClick={() => setMobileView("map")}
              >Karte</button>
            </div>
          )}
        </div>

        {/* ── Inhalt ── */}
        <div className="ap-modal-body">
          {error && (
            <div className="ap-modal-state ap-finder-error" role="alert">
              <Icon n="info" s={16} c="currentColor" />
              <span>{error}</span>
            </div>
          )}

          {loading && !error && (
            <div className="ap-modal-state ap-modal-skeleton" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => <div className="ap-skeleton-row" key={i} />)}
            </div>
          )}

          {hatAntwort && results.length === 0 && (
            <div className="ap-modal-state ap-finder-empty">
              Keine Paketshops gefunden. Passen Sie PLZ, Straße oder Umkreis an.
            </div>
          )}

          {hatAntwort && results.length > 0 && shops.length === 0 && (
            <div className="ap-modal-state ap-finder-empty">
              {openingFilterEmptyText(openingFilter)} Wählen Sie „Alle Öffnungszeiten“,
              um wieder alle {results.length} Paketshops zu sehen.
            </div>
          )}

          {hatAntwort && shops.length > 0 && (
            <div className={`ap-modal-split${isMobile ? ` ap-modal-split--${mobileView}` : ""}`}>
              <div className="ap-modal-listcol">
                <AccessPointList
                  shops={shops}
                  focusedKey={focusedKey}
                  onFocus={(key) => fokussiere(key)}
                  expandedKey={expandedKey}
                  onToggleExpand={(key) => setExpandedKey((v) => (v === key ? null : key))}
                  listRef={listRef}
                  countryCode={countryCode}
                />
              </div>
              <div className="ap-modal-mapcol">{karte}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
