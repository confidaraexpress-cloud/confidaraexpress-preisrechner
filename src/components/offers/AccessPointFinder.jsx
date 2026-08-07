import React, { useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { searchAccessPoints } from "../../api/client";
import { toAccessPointSearchCode, publicCarrierIdToAccessPointSearchCode } from "../../utils/carrierMap";
import { AccessPointFinderModal } from "./AccessPointFinderModal";
import {
  normalizeAccessPointWorkState,
  todayOpeningHoursText,
  sortAccessPointsByDistance,
  accessPointCountLabel,
  toDistanceNumber,
  OPENING_FILTER_ALL,
  OPENING_FILTER_OPTIONS,
} from "../../utils/accessPointView";

// ─── Read-only Paketshop-/Access-Point-Finder ────────────────────────────────
// Zeigt — ähnlich wie Jumingo — eine reine Orientierungssuche für Dropoff-/
// Shopabgabe-Tarife: PLZ/Ort/Straße/Radius → großes Finder-Fenster mit Liste
// und Karte.
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
//    Wochentag (Europe/Berlin) für die Listenzeile und die ganze Woche für die
//    Detailausklappung — beides nur zur Anzeige.
//  • Die Entfernung stammt von JUMiNGO; sortiert wird danach, gerechnet nicht.
//  • workState ist AUSSCHLIESSLICH Darstellung (Text + Badge) und entscheidet
//    NIRGENDS, ob ein Access Point angezeigt wird — auch „Geschlossen“ bleibt
//    ein regulärer Treffer. Ein früherer Versuch, „Geschlossen“ generell
//    auszublenden, ist durch einen direkten 1:1-Vergleich mit JUMiNGOs eigener
//    Oberfläche widerlegt: bei „Alle Öffnungszeiten“ zeigt JUMiNGO dieselbe
//    Menge wie die Rohantwort, nicht die um „Geschlossen“ gekürzte. Die
//    Auswahlstufe ist deshalb nur noch der optionale Öffnungszeitenfilter:
//    normalisieren → sortieren → Öffnungszeitenfilter.
//
// DARSTELLUNG: Die Trefferliste steht NICHT mehr unter dem Formular, sondern im
// großen Finder-Fenster (AccessPointFinderModal) — Liste und Karte nebeneinander.
// Hier bleibt nur das Formular plus eine knappe Zeile mit dem letzten Ergebnis.

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
// distanceCode, latitude, longitude, workState, hoursOfOperation. Wir lesen diese
// Felder defensiv aus und rendern NUR sicher renderbare, vorhandene Werte —
// niemals erfundene Daten, niemals Objekte, keine fachliche Interpretation von
// Statuswerten. Zusätzliche konventionelle Aliasse bleiben als Fallback erhalten.
// Fehlt alles Brauchbare, wird das Item übersprungen (→ sauberer Empty-State).
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
  // hoursOfOperation UND latitude/longitude wandern als Rohwerte mit, weil
  // spätere Stufen GENAU diese Felder lesen: der Öffnungszeitenfilter und die
  // Wochenansicht das eine, die Kartenmarker das andere — nicht die
  // Anzeigeform (`hours`) daneben. Fehlte eines, liefe die betroffene Stufe
  // still ins Leere: die Liste sähe richtig aus und wäre es nicht (genau das
  // ist mit hoursOfOperation schon einmal passiert und wurde erst vom
  // E2E-Test aufgedeckt). Koordinaten werden NICHT erfunden — fehlen sie,
  // bleibt der Shop in der Liste und bekommt nur keinen Marker.
  return {
    name, address, distance, distanceCode, hours, status, hoursOfOperation, countryCode,
    latitude: pick(raw, ["latitude", "lat"]),
    longitude: pick(raw, ["longitude", "lng", "lon"]),
  };
}

// Normalisieren und Sortieren entfernen NICHTS: die vollständige Liste bleibt
// erhalten. Sortiert wird stabil nach der von JUMiNGO gelieferten Entfernung;
// Einträge ohne Entfernung bleiben erhalten und hängen in unveränderter
// Reihenfolge hinten an. Kein Eintrag wird wegen workState entfernt.
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
  const [modalOpen, setModalOpen] = useState(false);

  const titleId = useId();
  // Laufende Suchen durchnummerieren: im Fenster kann der Kunde Radius ändern
  // und sofort neu suchen, während die vorige Antwort noch unterwegs ist. Nur
  // die jüngste Anfrage darf schreiben — sonst überschriebe eine langsame alte
  // Antwort das frische Ergebnis. (Vor dem Fenster gab es genau einen
  // Suchknopf und damit diesen Fall nicht.)
  const laufRef = useRef(0);
  // Ziel der Fokusrückgabe beim Schließen des Fensters. Muss explizit sein:
  // der Knopf ist im Moment des Öffnens bereits deaktiviert (Suche läuft an)
  // und damit nicht mehr document.activeElement.
  const suchButtonRef = useRef(null);

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

  const doSearch = async () => {
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
    const lauf = ++laufRef.current;
    const aktuell = () => lauf === laufRef.current;
    setLoading(true);
    setError("");
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
      if (!aktuell()) return; // eine neuere Suche läuft — diese Antwort verfällt
      // 401/403 hat der zentrale Auth-Handler (apiFetch) bereits übernommen.
      if (r.status === 401 || r.status === 403) { setLoading(false); return; }
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!aktuell()) return;
      if (!r.ok) {
        setResults(null);
        setError("Die Paketshop-Suche ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.");
        setLoading(false);
        return;
      }
      setResults(normalizeList(d));
    } catch {
      if (!aktuell()) return;
      setResults(null);
      setError("Die Paketshop-Suche ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.");
    }
    if (aktuell()) setLoading(false);
  };

  // Der sichtbare Knopf öffnet das Fenster UND startet die Suche in einem Zug —
  // ohne Zwischenzustand auf der Hauptseite. Frisch gesucht wird bei jedem
  // Klick: der Kunde erwartet aktuelle Öffnungsstatus, keine Konserve.
  const oeffneUndSuche = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!canSearch) return;
    setModalOpen(true);
    doSearch();
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

  // Knappe Quittung der letzten Suche auf der Hauptseite — KEINE zweite Liste.
  // Sie erscheint erst, wenn das Fenster zu ist: solange es offen steht, steht
  // die Zahl dort und bräuchte hier keinen Platz.
  const quittung = !modalOpen && !loading && !error && results !== null
    ? accessPointCountLabel(results.length, results.length)
    : null;

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

      <form className="ap-finder-form" onSubmit={oeffneUndSuche}>
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
              sondern wirkt sofort auf die bereits geladene Liste. Im Fenster
              steht dasselbe Feld noch einmal und teilt denselben Zustand. */}
          <div className="ap-finder-field ap-finder-field--opening">
            <label className="ap-finder-label" htmlFor={`ap-opening-${tariff?.id}`}>Öffnungszeiten</label>
            <select
              id={`ap-opening-${tariff?.id}`}
              className="ap-finder-select"
              value={openingFilter}
              onChange={(e) => setOpeningFilter(e.target.value)}
            >
              {OPENING_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="ap-finder-search-btn"
            ref={suchButtonRef}
            disabled={!canSearch}
          >
            {loading
              ? <><span className="spinner" /> Paketshops werden gesucht …</>
              : <><Icon n="search" s={15} c="currentColor" /> Paketshops suchen</>}
          </button>
        </div>
      </form>

      {/* Fehler, die das Fenster gar nicht erst erreichen (fehlende Stadt/Straße)
          bleiben hier stehen — dort wäre kein Fenster zum Anzeigen offen. */}
      {error && !modalOpen && (
        <div className="ap-finder-error" role="alert">
          <Icon n="info" s={15} c="currentColor" />
          <span>{error}</span>
        </div>
      )}

      {quittung && (
        <p className="ap-finder-receipt" role="status">
          {quittung}
          <button type="button" className="ap-finder-reopen" onClick={() => setModalOpen(true)}>
            Ergebnisse anzeigen
          </button>
        </p>
      )}

      <AccessPointFinderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        titleId={titleId}
        returnFocusTo={suchButtonRef}
        postCode={postCode} city={city} street={street}
        radius={radius} openingFilter={openingFilter}
        onPostCodeChange={setPostCode}
        onCityChange={setCity}
        onStreetChange={setStreet}
        onRadiusChange={setRadius}
        onOpeningFilterChange={setOpeningFilter}
        radiusOptions={RADIUS_OPTIONS}
        streetRequired={streetRequired}
        cityRequired={cityRequired}
        onSearch={doSearch}
        canSearch={canSearch}
        loading={loading}
        error={error}
        results={results}
        countryCode={countryCode}
      />
    </div>
  );
}
