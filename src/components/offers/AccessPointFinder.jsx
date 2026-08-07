import React, { useState } from "react";
import { Icon } from "../ui/Icon";
import { searchAccessPoints } from "../../api/client";
import { toAccessPointSearchCode, publicCarrierIdToAccessPointSearchCode } from "../../utils/carrierMap";
import {
  normalizeAccessPointWorkState,
  todayOpeningHoursText,
  sortAccessPointsByDistance,
  splitAccessPointsByEligibility,
  filterAccessPointsByOpening,
  OPENING_FILTER_ALL,
  OPENING_FILTER_OPTIONS,
  toDistanceNumber,
  formatDistance,
  accessPointCountLabel,
  moreAccessPointsLabel,
  unavailableAccessPointsLabel,
  openingFilterCountLabel,
  openingFilterExcludedLabel,
  openingFilterEmptyText,
} from "../../utils/accessPointView";

// ─── Read-only Paketshop-/Access-Point-Finder ────────────────────────────────
// Zeigt — ähnlich wie Jumingo — eine reine Orientierungssuche für Dropoff-/
// Shopabgabe-Tarife: PLZ/Ort/Radius → Liste verfügbarer Paketshops (Name,
// Adresse, Entfernung, Öffnungszeiten/Status, falls vorhanden).
//
// WICHTIG — bewusste Grenzen (Backend-Realität respektieren):
//  • KEINE Buchung: die Auswahl wird nirgends gespeichert und fließt NICHT in
//    den /book-Payload. Es gibt keine "Shop auswählen"-Aktion.
//  • Dropoff bleibt backendseitig blockiert — diese Anzeige umgeht das nicht.
//  • Nur Carrier mit serverseitig allowlistetem Code (UPS, DPD, DHL Express, GLS)
//    lösen eine echte Suche aus; sonst klarer "wird vorbereitet"-Hinweis.
//  • GLS verlangt zusätzlich eine Straße (Backend-400 ohne street) — daher ist
//    das Straßenfeld dort Pflicht; bei allen anderen Carriern ist es optional,
//    wird aber mitgesendet, sobald es ausgefüllt ist (siehe unten).
//  • Keine Roh-Fehler/Secrets im UI — nur generische, sichere Meldungen.
//
// JUMiNGO-Parität (siehe utils/accessPointView.mjs):
//  • Der Öffnungsstatus kommt AUSSCHLIESSLICH aus workState — hier wird nichts
//    aus der Uhrzeit hergeleitet.
//  • hoursOfOperation ist ein Objekt-Array; ausgewertet wird nur der heutige
//    Wochentag (Europe/Berlin) und nur zur Anzeige neben dem Status.
//  • Die Entfernung stammt von JUMiNGO; sortiert wird danach, gerechnet nicht.
//  • Angeboten werden nur NUTZBARE Access Points — dieselbe Menge, die auch
//    JUMiNGOs eigene Oberfläche zeigt (belegt: 20 Treffer, davon 10 mit
//    workState „Geschlossen“; JUMiNGO listet genau die übrigen 10). Die
//    Auswahlstufe ist explizit und getrennt: normalisieren → sortieren →
//    Eligibility → 5er-Schnitt. Nicht verfügbare Shops werden gezählt und
//    genannt, aber nicht als wählbar dargestellt.

const RADIUS_OPTIONS = [5, 10, 15, 25];

// Ersten vorhandenen, nicht-leeren Wert aus einer Liste möglicher Feldnamen.
const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && v !== "") return v;
  }
  return null;
};

// ── Defensive Normalisierung eines Ergebnis-Items ────────────────────────────
// Der Backend-Vertrag (access-points-search, commit 63baf58) normalisiert Access
// Points u. a. mit: name, type, street, postCode, city, countryCode, distance,
// distanceCode, workState, hoursOfOperation. Wir lesen diese Felder defensiv aus
// und rendern NUR sicher renderbare, vorhandene Werte — niemals erfundene Daten,
// niemals Objekte, keine fachliche Interpretation von Statuswerten. Zusätzliche
// konventionelle Aliasse bleiben als Fallback erhalten. Fehlt alles Brauchbare,
// wird das Item übersprungen (→ sauberer Empty-State).
function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;

  const nameRaw = pick(raw, ["name", "shopName", "locationName", "companyName", "label"]);
  const name = typeof nameRaw === "string" ? nameRaw : null;

  // Adresse: fertige Zeichenkette bevorzugen, sonst aus Einzelteilen bauen.
  let address = pick(raw, ["address", "fullAddress", "formattedAddress"]);
  if (typeof address !== "string") {
    const street  = pick(raw, ["street", "streetAndNumber", "addressLine1"]);
    const houseNo = pick(raw, ["houseNumber", "streetNumber"]);
    const zip     = pick(raw, ["postCode", "postalCode", "zip", "zipCode"]);
    const town    = pick(raw, ["city", "town", "locality"]);
    const isText  = (v) => typeof v === "string" || typeof v === "number";
    const line1 = [street, houseNo].filter(isText).join(" ").trim();
    const line2 = [zip, town].filter(isText).join(" ").trim();
    address = [line1, line2].filter(Boolean).join(", ") || null;
  }

  // Entfernung: number ODER numerischer String ("1.2"/"1,2"); sonst null.
  const distance = toDistanceNumber(pick(raw, ["distance", "distanceKm", "distanceInKm"]));
  // Einheit aus distanceCode (Backend) verbatim, falls nicht-leerer String.
  const distCodeRaw = pick(raw, ["distanceCode"]);
  const distanceCode = typeof distCodeRaw === "string" && distCodeRaw.trim() ? distCodeRaw.trim() : null;

  // Öffnungszeiten: hoursOfOperation ist bei JUMiNGO ein Array aus Objekten
  // ({ dayName, workingHours, lunchBreak, workingDay }). Die Normalisierung
  // liegt in accessPointView.mjs und liefert genau eine Zeile für HEUTE —
  // Alt-Formate (String / String-Array) bleiben unverändert lesbar.
  const hoursOfOperation = pick(raw, ["hoursOfOperation", "openingHours", "hours", "openingTimes"]);
  const hours = todayOpeningHoursText(hoursOfOperation);

  // Öffnungsstatus: allein aus workState. JUMiNGO bestimmt ihn selbst — hier
  // wird er nur in einen deutschen Text und eine Statusfarbe übersetzt. Kein
  // Rohwert wird sichtbar, und es gibt keine eigene Uhrzeitregel.
  const status = normalizeAccessPointWorkState(pick(raw, ["workState"]));

  // Ländercode roh übernehmen; ob angezeigt wird, entscheidet der Renderer
  // kontextabhängig (nur wenn vom gesuchten Land abweichend → kein Clutter).
  const ccRaw = pick(raw, ["countryCode"]);
  const countryCode = typeof ccRaw === "string" && ccRaw.trim() ? ccRaw.trim().toUpperCase() : null;

  if (!name && !address) return null; // nichts Brauchbares → überspringen
  // Zwei Rohwerte wandern bewusst mit, weil die nachgelagerten Stufen GENAU
  // sie lesen und nicht die Anzeigeform daneben:
  //   workState        → Eligibility (nutzbar ja/nein)
  //   hoursOfOperation → Öffnungszeitenfilter (Sonntag / vor 7:30 / nach 21:00)
  // Fehlt einer davon, fällt die betreffende Stufe still ins Leere: die Liste
  // sähe richtig aus und wäre es nicht. Genau das ist hier schon zweimal
  // passiert — beide Male hat erst der E2E-Test es aufgedeckt.
  return {
    name, address, distance, distanceCode, hours, status,
    workState: status.raw, hoursOfOperation, countryCode,
  };
}

// Normalisieren und Sortieren entfernen NICHTS: die vollständige Liste bleibt
// erhalten und ist die Grundlage aller Zahlen. Sortiert wird stabil nach der
// von JUMiNGO gelieferten Entfernung; Einträge ohne Entfernung bleiben erhalten
// und hängen in unveränderter Reihenfolge hinten an. Welche Shops angeboten
// werden, entscheidet erst die spätere, eigene Eligibility-Stufe.
function normalizeList(data) {
  const arr =
    Array.isArray(data)               ? data :
    Array.isArray(data?.accessPoints) ? data.accessPoints :
    Array.isArray(data?.results)      ? data.results :
    Array.isArray(data?.data)         ? data.data :
    Array.isArray(data?.items)        ? data.items : [];
  return sortAccessPointsByDistance(arr.map(normalizeItem).filter(Boolean));
}

export function AccessPointFinder({ tariff, senderPrefill }) {
  // Suchanbieter-Auflösung — kontrolliert & allowlisted (KEIN Rohfeld, KEIN Regex,
  // KEINE Ableitung aus carrier/tariffName/shopName/Logo/Servicebezeichnung/
  // shipper_tariff_id). Priorität:
  //   1) Capability-Provider (accessPoint.provider) via toAccessPointSearchCode
  //   2) Fallback über die kontrollierte, öffentliche publicCarrierId
  //      (ups/dpd/dhl/gls) — der öffentliche Carrier ist zuverlässig klassifiziert
  //      und der bestehende Backend-Suchendpunkt akzeptiert genau diese vier.
  // `accessPoint.available` ist BEWUSST KEIN Sichtbarkeits-Guard mehr — die
  // Sichtbarkeit der Paketshop-Karte steuert allein serviceType==="dropoff" im
  // Parent. Unbekannt/nicht unterstützt → null → ehrlicher Hinweis, KEINE Suche.
  const carrierCode =
    toAccessPointSearchCode(tariff?.accessPoint?.provider) ||
    publicCarrierIdToAccessPointSearchCode(tariff?.publicCarrierId);
  const countryCode = (senderPrefill?.country || "DE").toUpperCase();

  const [postCode, setPostCode] = useState(senderPrefill?.postCode || "");
  const [city, setCity]         = useState(senderPrefill?.city || "");
  const [street, setStreet]     = useState(senderPrefill?.street || "");
  const [radius, setRadius]     = useState(10);
  // Öffnungszeitenmerkmal wie in JUMiNGOs Finder. Reiner Anzeigefilter über
  // die bereits geladenen Ergebnisse — er löst KEINE neue Suche aus (der
  // Requestvertrag kennt dafür keinen Parameter, siehe accessPointView.mjs).
  const [openingFilter, setOpeningFilter] = useState(OPENING_FILTER_ALL);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [results, setResults]   = useState(null); // null = noch nicht gesucht
  // Reine Anzeige-Ausklappung der Ergebnisliste (max. 5 → alle). Lokal, NICHT
  // persistiert; jede neue Suche setzt wieder auf die kompakte Ansicht zurück.
  const [expanded, setExpanded] = useState(false);

  // Klicks im Finder nicht zur Karte durchreichen (Karte hat onClick=select).
  const stop = (e) => e.stopPropagation();

  // ── Nicht (noch) unterstützter Suchanbieter: Die Paketshop-Karte bleibt sicht-
  // bar (Titel + Orientierung liefert der Parent), aber statt des Formulars ein
  // ehrlicher Hinweis — KEIN API-Aufruf, keine vorgetäuschte Shopauswahl. ──
  if (!carrierCode) {
    return (
      <div className="ap-finder ap-finder--unsupported" onClick={stop}>
        <p className="ap-finder-note">
          Die direkte Paketshop-Suche ist für diesen Versanddienstleister derzeit
          noch nicht verfügbar.
        </p>
      </div>
    );
  }

  // Der Backend-Guard verlangt für die Access-Point-Suche zusätzlich zur PLZ die
  // Stadt; ohne city beantwortet das Backend die Suche mit 400. Die Anforderung
  // gilt für jeden allowlisteten Carrier — also immer, wenn ein echter
  // carrierCode vorliegt und dieses Formular überhaupt rendert. Für unsupported
  // Carrier (carrierCode === null) wird gar kein Formular gezeigt.
  const cityRequired = Boolean(carrierCode);
  const cityMissing  = cityRequired && city.trim().length < 2;
  // GLS verlangt backendseitig (commit 8d41251) ZUSÄTZLICH eine Straße; ohne
  // street → 400. Die PFLICHT gilt weiterhin gezielt nur für GLS.
  //
  // Gesendet wird die Straße aber für JEDEN unterstützten Carrier, sobald sie
  // vorliegt: JUMiNGO geokodiert den Suchmittelpunkt aus der übergebenen
  // Adresse. Ohne Straße ist das der PLZ-/Ortsmittelpunkt — dieselbe Suche
  // liefert dann andere Entfernungen und eine andere Reihenfolge als JUMiNGOs
  // eigene Oberfläche, die die Straße mitschickt. Erfunden wird nie etwas: ist
  // das Feld leer, geht ein leerer String raus (das Backend verwirft ihn) und
  // die Suche läuft wie bisher über PLZ + Ort.
  const streetRequired = carrierCode === "gls";
  const streetMissing  = streetRequired && street.trim().length < 1;
  const canSearch      = postCode.trim().length >= 3 && !cityMissing && !streetMissing && !loading;

  const doSearch = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (loading || postCode.trim().length < 3) return;
    // Defensive Zweitsicherung gegen den Submit-per-Enter-Pfad: ohne Stadt kein
    // Request an /access-points-search — stattdessen eine klare, fachliche
    // Meldung. So trifft kein Suchaufruf ohne city den Backend-Guard.
    if (cityMissing) {
      setResults(null);
      setError("Für die Paketshop-Suche wird zusätzlich zur PLZ die Stadt benötigt.");
      return;
    }
    // Defensive Zweitsicherung für GLS: ohne Straße kein Request an
    // /access-points-search — sonst träfe der Aufruf den Backend-400-Guard.
    if (streetMissing) {
      setResults(null);
      setError("Für die GLS-Paketshop-Suche wird zusätzlich zur PLZ eine Straße benötigt.");
      return;
    }
    setLoading(true);
    setError("");
    setExpanded(false); // neue Suche → wieder kompakte Liste (max. 5)
    try {
      const r = await searchAccessPoints({
        carrierCodes: [carrierCode],
        countryCode,
        postCode: postCode.trim(),
        city: city.trim(),
        street: street.trim(),
        radius,
        // Bewusst fest `false`: JUMiNGOs eigene Oberfläche sendet in JEDER
        // aufgezeichneten Anfrage onlyOpen: false und filtert Öffnungszeiten
        // rein clientseitig. Der frühere CE-Haken „Nur aktuell geöffnete Shops“
        // ist entfallen — sein `true` wird deshalb NICHT weitergeschleppt.
        onlyOpen: false,
      });
      // 401/403 hat der zentrale Auth-Handler (apiFetch) bereits übernommen.
      if (r.status === 401 || r.status === 403) { setLoading(false); return; }
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        setResults(null);
        setError("Die Paketshop-Suche ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.");
        setLoading(false);
        return;
      }
      setResults(normalizeList(d));
    } catch {
      setResults(null);
      setError("Die Paketshop-Suche ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.");
    }
    setLoading(false);
  };

  // Das Straßenfeld ist jetzt für jeden unterstützten Carrier sichtbar — nicht
  // um eine Pflicht einzuführen (die bleibt bei GLS), sondern damit der
  // Suchmittelpunkt sichtbar und korrigierbar ist. Eine vorbefüllte, aber
  // unsichtbare Straße würde die Ergebnisse still verschieben.
  const streetField = (
    <div className="ap-finder-field ap-finder-field--street">
      <label className="ap-finder-label" htmlFor={`ap-street-${tariff?.id}`}>
        Straße {streetRequired
          ? <span className="ap-finder-required">(erforderlich)</span>
          : <span className="ap-finder-optional">(optional, genauerer Umkreis)</span>}
      </label>
      <input
        id={`ap-street-${tariff?.id}`}
        className="ap-finder-input"
        value={street}
        onChange={(e) => setStreet(e.target.value)}
        placeholder="z. B. Weiherstraße 25"
        autoComplete="off"
        maxLength={200}
      />
    </div>
  );

  // ── Auswahlstufe (explizit, nach Normalisierung und Sortierung) ────────────
  // `results` bleibt unangetastet die vollständige Antwort. Angeboten wird
  // daraus nur, was JUMiNGO als nutzbar führt; der Rest wird gezählt und
  // benannt, aber nicht zur Auswahl gestellt.
  //
  // `carrierCode` ist DERSELBE Wert, der bereits oben den JUMiNGO-Request
  // bestimmt (`carrierCodes: [carrierCode]`) — keine zweite Carrier-Ermittlung.
  // Die Regel ist bisher nur für DPD durch einen echten Mitschnitt belegt;
  // für jeden anderen Carrier bleibt splitAccessPointsByEligibility fail-open
  // (siehe accessPointView.mjs).
  const { usable: usableResults, unavailable: unavailableResults } =
    splitAccessPointsByEligibility(results || [], carrierCode);

  // ── Öffnungszeitenfilter (dritte, wieder eigene Stufe) ─────────────────────
  // Zwei getrennte Fragen, bewusst nacheinander und nicht vermischt:
  //   Eligibility  → „Ist dieser Access Point laut JUMiNGO überhaupt nutzbar?“
  //   Öffnungszeit → „Passt er zu dem, was der Kunde ausgewählt hat?“
  // Gefiltert wird über die bereits geladene Antwort; `results` und
  // `usableResults` bleiben vollständig erhalten, damit „Alle Öffnungszeiten“
  // die volle Liste ohne neue Suche zurückbringt.
  const { matching: visibleResults, excluded: filteredOutResults, filtered: openingFilterActive } =
    filterAccessPointsByOpening(usableResults, openingFilter);

  // Kompakte Ergebnisanzeige: zunächst höchstens 5 Treffer, der Rest auf Wunsch
  // per Button. Reiner Anzeigezustand (expanded), nicht persistiert. Alle
  // Zahlen beziehen sich auf die tatsächlich angebotene Menge — „5 von 20“
  // hätte eine Auswahl versprochen, die es gar nicht gibt.
  const MAX_COMPACT = 5;
  const hasResults  = !loading && !error && results !== null && visibleResults.length > 0;
  const shownResults = hasResults ? (expanded ? visibleResults : visibleResults.slice(0, MAX_COMPACT)) : [];
  const extraResults = hasResults ? visibleResults.length - MAX_COMPACT : 0;
  // Ruhige Randnotiz, kein Fehler: ein nicht nutzbarer Paketshop ist ein
  // Betriebszustand. Nur sichtbar, wenn es tatsächlich welche gibt.
  //
  // Es steht immer HÖCHSTENS EINE Randnotiz da, und sie benennt genau eine
  // Ursache — bei aktivem Filter die Öffnungszeiten, sonst die Nutzbarkeit.
  // Beides gleichzeitig wäre auf schmalen Geräten eine dreiteilige Zeile und
  // würde die zwei Ursachen optisch doch wieder vermengen. Die Nutzbarkeits-
  // zahl bleibt über „Alle Öffnungszeiten“ jederzeit erreichbar.
  const hatAntwort = !loading && !error && results !== null;
  const resultNote = !hatAntwort ? null
    : openingFilterActive
      ? openingFilterExcludedLabel(filteredOutResults.length)
      : unavailableAccessPointsLabel(unavailableResults.length);

  return (
    <div className="ap-finder" onClick={stop} aria-busy={loading}>
      {/* Kompakter Orientierungshinweis (ersetzt die frühere Warn-Banner-Optik):
          hält die Backend-Realität fest — reine Orientierung, KEINE verbindliche
          Shopauswahl. Bewusst dezent statt alarmierend; gilt für beide Einsatz-
          orte (Buchungskarte & Angebots-Details), da geteilte Finder-Anzeige. */}
      <p className="ap-finder-hint">
        <Icon n="info" s={14} c="currentColor" />
        <span>
          Die Paketshop-Suche dient der Orientierung – eine verbindliche Auswahl
          eines Shops ist nicht erforderlich.
        </span>
      </p>

      <form className="ap-finder-form" onSubmit={doSearch}>
        <div className="ap-finder-fields">
          <div className="ap-finder-field">
            <label className="ap-finder-label" htmlFor={`ap-zip-${tariff?.id}`}>PLZ</label>
            <input
              id={`ap-zip-${tariff?.id}`}
              className="ap-finder-input"
              value={postCode}
              onChange={(e) => setPostCode(e.target.value)}
              placeholder="z. B. 70173"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
            />
          </div>
          <div className="ap-finder-field">
            <label className="ap-finder-label" htmlFor={`ap-city-${tariff?.id}`}>
              Ort {cityRequired
                ? <span className="ap-finder-required">(erforderlich)</span>
                : <span className="ap-finder-optional">(optional)</span>}
            </label>
            <input
              id={`ap-city-${tariff?.id}`}
              className="ap-finder-input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="z. B. Stuttgart"
              autoComplete="off"
              maxLength={100}
            />
          </div>
          <div className="ap-finder-field">
            <label className="ap-finder-label" htmlFor={`ap-radius-${tariff?.id}`}>Umkreis</label>
            <select
              id={`ap-radius-${tariff?.id}`}
              className="ap-finder-select"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {RADIUS_OPTIONS.map((km) => (
                <option key={km} value={km}>{km} km</option>
              ))}
            </select>
          </div>
          {/* Die Straße steht in voller Breite in Zeile 2, damit vier Felder
              nicht gedrängt in einer Zeile stehen (Raum für lange Adressen). */}
          {streetField}
        </div>

        <div className="ap-finder-controls">
          {/* Öffnungszeitenmerkmal — dieselben vier Optionen wie bei JUMiNGO.
              Steht bewusst NICHT im Feldraster oben: es ist kein Suchparameter,
              sondern wirkt sofort auf die bereits geladene Liste. Deshalb auch
              kein erneuter Request und kein Klick auf „Paketshops suchen“. */}
          <div className="ap-finder-field ap-finder-field--opening">
            <label className="ap-finder-label" htmlFor={`ap-opening-${tariff?.id}`}>Öffnungszeiten</label>
            <select
              id={`ap-opening-${tariff?.id}`}
              className="ap-finder-select"
              value={openingFilter}
              onChange={(e) => { setOpeningFilter(e.target.value); setExpanded(false); }}
            >
              {OPENING_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="ap-finder-search-btn"
            disabled={!canSearch}
          >
            {loading
              ? <><span className="spinner" /> Paketshops werden gesucht …</>
              : <><Icon n="search" s={15} c="currentColor" /> Paketshops suchen</>}
          </button>
        </div>
      </form>

      {/* ── Zustände ── */}
      {error && (
        <div className="ap-finder-error" role="alert">
          <Icon n="info" s={15} c="currentColor" />
          <span>{error}</span>
        </div>
      )}

      {/* Lade-/Ergebnis-Ankündigung NUR für Screenreader: die sichtbare Lade-
          Rückmeldung liefert bereits der Button-Text „Paketshops werden gesucht …"
          (genau EINE sichtbare Ladeanzeige). role="status" (polite) macht Ladephase
          und Trefferzahl dennoch zugänglich, ohne visuelle Dopplung. */}
      <p className="ap-finder-sr" role="status">
        {loading
          ? "Paketshops werden gesucht …"
          : results !== null
            ? [
                visibleResults.length === 0
                  ? (openingFilterActive
                      ? "Kein Paketshop entspricht dem gewählten Öffnungszeitenfilter."
                      : "Keine verfügbaren Paketshops gefunden.")
                  : (openingFilterActive
                      ? openingFilterCountLabel(visibleResults.length, visibleResults.length)
                      : accessPointCountLabel(visibleResults.length, visibleResults.length)),
                resultNote,
              ].filter(Boolean).join(" · ")
            : ""}
      </p>

      {/* Drei verschiedene Leerzustände, weil sie drei verschiedene Dinge
          bedeuten: gar kein Treffer im Umkreis — Treffer, die JUMiNGO derzeit
          nicht als nutzbar führt — oder nutzbare Treffer, von denen keiner zum
          gewählten Öffnungszeitenmerkmal passt. „Keine Paketshops gefunden“
          wäre in den letzten beiden Fällen schlicht falsch. */}
      {!loading && !error && results !== null && results.length === 0 && (
        <div className="ap-finder-empty">
          Keine Paketshops gefunden. Passen Sie PLZ oder Umkreis an.
        </div>
      )}
      {!loading && !error && results !== null && results.length > 0 && usableResults.length === 0 && (
        <div className="ap-finder-empty">
          Im gewählten Umkreis ist derzeit kein Paketshop verfügbar.
          {unavailableAccessPointsLabel(unavailableResults.length)
            ? ` ${unavailableAccessPointsLabel(unavailableResults.length)}.` : ""} Versuchen Sie es
          später erneut oder vergrößern Sie den Umkreis.
        </div>
      )}
      {!loading && !error && results !== null && usableResults.length > 0 && visibleResults.length === 0 && (
        <div className="ap-finder-empty">
          {openingFilterEmptyText(openingFilter)} Wählen Sie „Alle Öffnungszeiten“,
          um wieder alle {usableResults.length} verfügbaren Paketshops zu sehen.
        </div>
      )}

      {hasResults && (
        <p className="ap-result-count">
          {openingFilterActive
            ? openingFilterCountLabel(shownResults.length, visibleResults.length)
            : accessPointCountLabel(shownResults.length, visibleResults.length)}
          {resultNote && <span className="ap-result-unavailable"> · {resultNote}</span>}
        </p>
      )}

      {hasResults && (
        <ul className="ap-result-list">
          {shownResults.map((s, i) => {
            // Ländercode nur zeigen, wenn er vom gesuchten Land abweicht
            // (vermeidet redundantes "DE" bei inländischer Suche).
            const showCc = s.countryCode && s.countryCode !== countryCode;
            return (
              <li className="ap-result" key={i}>
                {/* Hierarchie: 1 Name · 2 Adresse · 3 Entfernung+Status (rechts) ·
                    4 Öffnungszeiten (sekundär, volle Breite darunter). Rein
                    informativ — KEINE Auswahl/kein Radio/keine gebundene Auswahl. */}
                <div className="ap-result-top">
                  <div className="ap-result-main">
                    <div className="ap-result-name">{s.name || s.address}</div>
                    {s.name && s.address && <div className="ap-result-addr">{s.address}</div>}
                  </div>
                  <div className="ap-result-meta">
                    {s.distance != null && (
                      <span className="ap-result-dist">{formatDistance(s.distance, s.distanceCode)}</span>
                    )}
                    {/* Öffnungsstatus von JUMiNGO. Punkt UND Text (Designsystem-
                        Badge) — der Zustand steht nie allein in der Farbe. Ein
                        unbekannter Serverwert bleibt unsichtbar und steht
                        höchstens im title für den Support. */}
                    <span
                      className={`ap-result-status ${s.status.badgeClass}`}
                      title={!s.status.known && s.status.raw ? `Serverwert: ${s.status.raw}` : undefined}
                    >
                      {s.status.label}
                    </span>
                    {showCc && <span className="ap-result-cc">{s.countryCode}</span>}
                  </div>
                </div>
                {s.hours && (
                  <div className="ap-result-hours">
                    <Icon n="clock" s={13} c="currentColor" />
                    <span>{s.hours}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {extraResults > 0 && (
        <button
          type="button"
          className="ap-more-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Weniger anzeigen" : moreAccessPointsLabel(extraResults)}
        </button>
      )}
    </div>
  );
}
