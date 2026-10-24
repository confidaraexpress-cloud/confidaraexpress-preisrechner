import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "../../hooks/useDialog";
import { AccessPointList } from "./AccessPointList";
import { AccessPointMap } from "./AccessPointMap";
import { AddressAttribution } from "../address/AddressAttribution";
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
import { parcelShopSearchProfile } from "../../utils/parcelShopSearchProfile.mjs";

/* ── Großes Paketshop-Finder-Fenster ─────────────────────────────────────────
   Ein Arbeitsfenster, kein Bestätigungsdialog: links die vollständige,
   eigenständig scrollende Trefferliste, rechts die Karte. Such- und
   Filterfelder bleiben im Kopf bedienbar, damit Radius und Öffnungszeiten
   geändert werden können, ohne das Fenster zu schließen.

   ZWEI SUCHPROFILE (2026-10-24, utils/parcelShopSearchProfile.mjs) — dasselbe
   Fenster, dieselbe Liste, dieselbe Karte:
     • „Orientierung" (JUMiNGO): alle Felder und Filter, Karte, Öffnungszeiten,
       Status, der Hinweis „Orientierung“. Der Zustand `focusedKey` steuert
       ausschließlich Kartenfokus und Hervorhebung — kein Feld im /book-Payload.
     • „Verbindliche Auswahl" (TG124): nur die PLZ, der Pflichthinweis und je
       Zeile „Diesen Paketshop wählen“ — DIESE Wahl fließt in die Buchung. Ohne
       Kartenposition gibt es keine Karte und keinen Kartenumschalter: die
       Liste nimmt die Fläche ein, statt neben einer leeren Deutschlandkarte
       zu stehen. Öffnungszeiten und Status erscheinen nur, wenn die Quelle sie
       liefert.
   In beiden ist die Liste autoritativ. Fällt die Karte aus, ändert sich an ihr
   nichts. Der 5er-Anzeigeschnitt der früheren Inline-Liste entfällt: die Liste
   scrollt selbst.

   Fokus, Fokusrückgabe und Escape kommen aus dem gemeinsamen useDialog-Hook —
   kein zweites Dialogsystem.

   Redesign 2026-10: Text statt Symbolen — „Schließen" und „Suchen" sind
   beschriftete Knöpfe, Hinweise stehen ohne Infosymbol, der mobile Wechsel
   Liste/Karte ist ein Texttab-Paar. Kartenmarker und Kartensteuerung bleiben
   als funktionale Ausnahme (AccessPointMap). */

const MOBILE_BREAKPOINT = 860;
const ORIENTIERUNG = parcelShopSearchProfile(null, false);

export function AccessPointFinderModal({
  open, onClose, titleId, returnFocusTo,
  // Suchzustand (im Elternteil gehalten, damit er das Schließen überlebt)
  postCode, city, street, radius, openingFilter,
  onPostCodeChange, onCityChange, onStreetChange, onRadiusChange, onOpeningFilterChange,
  radiusOptions, streetRequired, cityRequired,
  onSearch, canSearch,
  // Ergebniszustand
  loading, error, results, countryCode,
  // Aus welchem Angebot heraus geöffnet wurde — nur zur Beschriftung.
  carrierName,
  // Das Suchprofil des Angebots; ohne Angabe „Orientierung“.
  profile = ORIENTIERUNG,
  // Verbindliche Auswahl: die PLZ, zu der die gezeigten Treffer gehören.
  searchedPostCode = "",
  // TG124: verbindliche Shopauswahl (nur bei der Portalsuche gesetzt). onSelectShop(key) | null.
  onSelectShop, selectedShopKey,
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
  const felder = profile.fields;

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Öffnungszeitenfilter: einzige Auswahlstufe nach der Sortierung ─────────
  // `results` bleibt vollständig erhalten; bei „Alle Öffnungszeiten“ passiert
  // hier nichts. workState entscheidet an KEINER Stelle über Sichtbarkeit. Im
  // Profil ohne Öffnungszeitenfilter wirkt eine früher gewählte Präferenz nicht
  // auf Treffer ohne Zeiten.
  const wirksamerFilter = felder.opening ? openingFilter : OPENING_FILTER_ALL;
  const { matching: sichtbar, excluded: ausgeschlossen, filtered: filterAktiv } =
    filterAccessPointsByOpening(results || [], wirksamerFilter);

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
  // Verbindliche Auswahl: eine Karte nur mit mindestens einer Shopposition. Orientierung: unverändert.
  const zeigeKarte = !profile.binding || markers.length > 0;
  // Status und Öffnungszeiten je Zeile nur, wenn die Quelle sie liefert (Orientierung: wie bisher immer).
  const zeigeZeiten = !profile.binding || shops.some((s) => s.status || s.hoursOfOperation);
  const zaehler = !hatAntwort
    ? null
    : filterAktiv
      ? openingFilterCountLabel(shops.length, shops.length)
      : accessPointCountLabel(shops.length, shops.length);
  const randnotiz = hatAntwort && filterAktiv ? openingFilterExcludedLabel(ausgeschlossen.length) : null;
  const kartenhinweis = hatAntwort && zeigeKarte ? mapCoverageLabel(markers.length, shops.length) : null;
  const ausAdresse = profile.binding && markers.some((m) => m.shop.positionSource === "address");

  const suchkontext = profile.binding
    ? [
      searchedPostCode ? `Paketshops zur PLZ ${searchedPostCode}` : null,
      hatAntwort && shops.some((s) => s.distance != null) ? "Entfernung jeweils zum Gebiet der PLZ" : null,
      ausAdresse ? "Kartenpositionen aus der Shopadresse ermittelt" : null,
    ].filter(Boolean).join(" · ")
    : [
      [street, [postCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      `Umkreis ${radius} km`,
    ].filter(Boolean).join(" · ");

  const unterzeile = profile.binding
    ? (carrierName
      ? `Abgabestellen von ${carrierName} zur gesuchten Postleitzahl.`
      : "Abgabestellen zur gesuchten Postleitzahl.")
    : (carrierName
      ? `Abgabestellen von ${carrierName} in der Nähe Ihrer Absenderadresse.`
      : "Finden Sie passende Abgabestellen für Ihren Versand.");

  const karte = zeigeKarte ? (
    <AccessPointMap
      markers={markers}
      activeKey={focusedKey}
      onSelect={(key) => fokussiere(key, { scroll: true })}
      searchLabel={kartenhinweis}
      countryCode={countryCode}
      onSelectShop={profile.binding ? onSelectShop : null}
      selectedShopKey={profile.binding ? selectedShopKey : null}
    />
  ) : null;

  const geteilt = zeigeKarte ? `ap-modal-split${isMobile ? ` ap-modal-split--${mobileView}` : ""}` : "ap-modal-split ap-modal-split--listonly";

  return (
    <div className="ce-dialog-overlay ap-modal-overlay" onClick={onClose}>
      <div
        className={`ap-modal${profile.binding ? " ap-modal--binding" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Kopf ── */}
        <header className="ap-modal-head">
          <div className="ap-modal-head-text">
            <h2 className="ap-modal-title" id={titleId}>Paketshops in Ihrer Nähe</h2>
            {/* Der Carrier gehört sichtbar hierher: Der Einstieg sitzt jetzt an
                der einzelnen Angebotskarte, und die Ergebnisse gelten nur für
                deren Versanddienstleister. Ohne diese Zeile wäre nach dem
                Wechsel von UPS zu DPD nicht erkennbar, wessen Shops man sieht. */}
            <p className="ap-modal-sub">{unterzeile}</p>
          </div>
          <button
            type="button"
            className="ap-modal-close"
            onClick={onClose}
            aria-label="Paketshop Finder schließen"
          >
            Schließen
          </button>
        </header>

        {/* ── Such- und Filterbereich: nur die Eingaben, die das Profil wirklich auswertet ── */}
        <form
          className={`ap-modal-search${profile.binding ? " ap-modal-search--postcode" : ""}`}
          onSubmit={(e) => { e.preventDefault(); onSearch(); }}
        >
          <div className="ap-modal-field">
            <label className="ap-finder-label" htmlFor="apm-zip">PLZ</label>
            <input
              id="apm-zip" className="ap-finder-input" value={postCode}
              onChange={(e) => onPostCodeChange(e.target.value)}
              inputMode="numeric" autoComplete="off" maxLength={profile.binding ? 5 : 10}
            />
          </div>
          {felder.city && (
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
          )}
          {felder.street && (
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
          )}
          {felder.radius && (
            <div className="ap-modal-field">
              <label className="ap-finder-label" htmlFor="apm-radius">Umkreis</label>
              <select
                id="apm-radius" className="ap-finder-select" value={radius}
                onChange={(e) => onRadiusChange(Number(e.target.value))}
              >
                {radiusOptions.map((km) => <option key={km} value={km}>{km} km</option>)}
              </select>
            </div>
          )}
          {felder.opening && (
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
          )}
          <button type="submit" className="ap-modal-search-btn" disabled={!canSearch}>
            {loading
              ? <><span className="spinner" /> Suchen …</>
              : "Suchen"}
          </button>
        </form>

        {/* Fachliche Grenze bzw. Pflicht — je Profil genau eine Aussage, nie beide. */}
        <p className={`ap-modal-note${profile.binding ? " ap-modal-note--binding" : ""}`}>
          <span>{profile.note}</span>
        </p>

        {/* ── Ergebniszeile + mobiler Umschalter ── */}
        <div className="ap-modal-bar">
          <div className="ap-modal-bar-text">
          {/* Suchkontext: worauf sich die gezeigte Menge bezieht — bei der
              Orientierung Adresse und Umkreis, bei der verbindlichen Auswahl die
              gesuchte Postleitzahl (dort gibt es keinen Umkreis). */}
          {suchkontext && <p className="ap-modal-context-line">{suchkontext}</p>}
          {/* Positionen aus dem Adressdienst (P3) tragen dessen Pflicht-Quellenangabe. */}
          {ausAdresse && <AddressAttribution className="ap-modal-attr" />}
          <p className="ap-modal-count" role="status">
            {loading ? (
              <>
                Paketshops werden gesucht …
                {profile.loadingNote && <span className="ap-modal-note-inline"> {profile.loadingNote}</span>}
              </>
            ) : (
              <>
                {zaehler}
                {randnotiz && <span className="ap-modal-note-inline"> · {randnotiz}</span>}
              </>
            )}
          </p>
          </div>
          {isMobile && zeigeKarte && hatAntwort && shops.length > 0 && (
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
              {profile.binding
                ? "Zu dieser Postleitzahl wurden keine Paketshops gefunden. Bitte prüfen Sie die Postleitzahl."
                : "Keine Paketshops gefunden. Passen Sie PLZ, Straße oder Umkreis an."}
            </div>
          )}

          {hatAntwort && results.length > 0 && shops.length === 0 && (
            <div className="ap-modal-state ap-finder-empty">
              {openingFilterEmptyText(wirksamerFilter)} Wählen Sie „Alle Öffnungszeiten“,
              um wieder alle {results.length} Paketshops zu sehen.
            </div>
          )}

          {hatAntwort && shops.length > 0 && (
            <div className={geteilt}>
              <div className="ap-modal-listcol">
                <AccessPointList
                  shops={shops}
                  focusedKey={focusedKey}
                  onFocus={(key) => fokussiere(key)}
                  expandedKey={expandedKey}
                  onToggleExpand={(key) => setExpandedKey((v) => (v === key ? null : key))}
                  listRef={listRef}
                  countryCode={countryCode}
                  onSelect={onSelectShop}
                  selectedShopKey={selectedShopKey}
                  showStatusAndHours={zeigeZeiten}
                  mapFocusable={zeigeKarte}
                />
              </div>
              {karte && <div className="ap-modal-mapcol">{karte}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
