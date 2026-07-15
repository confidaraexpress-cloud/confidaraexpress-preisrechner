import React, { useState } from "react";
import { Icon } from "../ui/Icon";
import { searchAccessPoints } from "../../api/client";
import { toAccessPointSearchCode } from "../../utils/carrierMap";

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
//  • GLS verlangt zusätzlich eine Straße (Backend-400 ohne street) — daher ein
//    GLS-spezifisches Pflicht-Straßenfeld; andere Carrier bleiben unverändert.
//  • Keine Roh-Fehler/Secrets im UI — nur generische, sichere Meldungen.

const RADIUS_OPTIONS = [5, 10, 15, 25];

// Entfernung robust als Zahl lesen: number direkt; numerische Strings ("1.2"
// oder "1,2") werden geparst; alles andere → null (keine falschen Werte).
const toDistanceNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

// Entfernung formatiert (de-DE, max. 1 Nachkommastelle). Einheit aus dem
// Backend-Feld distanceCode, falls vorhanden (verbatim, KEINE Umrechnung),
// sonst sinnvoller Default "km".
const fmtDistance = (value, code) => {
  const unit = typeof code === "string" && code.trim() ? code.trim() : "km";
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${unit}`;
};

// Öffnungszeiten nur sicher renderbar machen: String direkt; Array reiner
// Strings sauber joinen; Objekte/komplexe Strukturen werden verworfen (keine
// Interpretation, kein blindes Rendern von Objekten).
const normalizeHours = (v) => {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) {
    const parts = v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim());
    return parts.length ? parts.join(" · ") : null;
  }
  return null;
};

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

  // Öffnungszeiten: hoursOfOperation (Backend) + bisherige Aliasse; nur sicher
  // renderbare Werte (String oder Array aus Strings), nie Objekte.
  const hours = normalizeHours(pick(raw, ["hoursOfOperation", "openingHours", "hours", "openingTimes"]));

  // Offen-Status: bestehendes Boolean-Verhalten erhalten (isOpen/open/openNow).
  const openRaw = pick(raw, ["isOpen", "open", "openNow"]);
  const isOpen = typeof openRaw === "boolean" ? openRaw : null;
  // workState ist laut Backend-Vertrag ein String mit (noch) unbewiesener
  // Semantik: NICHT als Geöffnet/Geschlossen interpretieren — nur neutral als
  // Rohtext anzeigen, ausschließlich wenn nicht-leerer String.
  const wsRaw = pick(raw, ["workState"]);
  const statusText = typeof wsRaw === "string" && wsRaw.trim() ? wsRaw.trim() : null;

  // Ländercode roh übernehmen; ob angezeigt wird, entscheidet der Renderer
  // kontextabhängig (nur wenn vom gesuchten Land abweichend → kein Clutter).
  const ccRaw = pick(raw, ["countryCode"]);
  const countryCode = typeof ccRaw === "string" && ccRaw.trim() ? ccRaw.trim().toUpperCase() : null;

  if (!name && !address) return null; // nichts Brauchbares → überspringen
  return { name, address, distance, distanceCode, hours, isOpen, statusText, countryCode };
}

function normalizeList(data) {
  const arr =
    Array.isArray(data)               ? data :
    Array.isArray(data?.accessPoints) ? data.accessPoints :
    Array.isArray(data?.results)      ? data.results :
    Array.isArray(data?.data)         ? data.data :
    Array.isArray(data?.items)        ? data.items : [];
  return arr.map(normalizeItem).filter(Boolean);
}

export function AccessPointFinder({ tariff, senderPrefill }) {
  // Die technische Suchbarkeit richtet sich AUSSCHLIESSLICH nach dem provider-
  // neutralen Capability-Vertrag: tariff.accessPoint.available === true UND ein
  // vom Adapter übersetzter, allowlisteter Provider-Code. KEINE Ableitung aus
  // carrier/tariffName/shopName/shopsName oder publicCarrierId — Unbekanntes
  // degradiert fail-closed (carrierCode === null → neutraler Hinweis, keine Suche).
  const carrierCode = tariff?.accessPoint?.available === true
    ? toAccessPointSearchCode(tariff.accessPoint.provider)
    : null;
  const countryCode = (senderPrefill?.country || "DE").toUpperCase();

  const [postCode, setPostCode] = useState(senderPrefill?.postCode || "");
  const [city, setCity]         = useState(senderPrefill?.city || "");
  const [street, setStreet]     = useState(senderPrefill?.street || "");
  const [radius, setRadius]     = useState(10);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [results, setResults]   = useState(null); // null = noch nicht gesucht
  // Reine Anzeige-Ausklappung der Ergebnisliste (max. 5 → alle). Lokal, NICHT
  // persistiert; jede neue Suche setzt wieder auf die kompakte Ansicht zurück.
  const [expanded, setExpanded] = useState(false);

  // Klicks im Finder nicht zur Karte durchreichen (Karte hat onClick=select).
  const stop = (e) => e.stopPropagation();

  // ── Nicht unterstützter Carrier: sauberer Hinweis, keine Suche ──
  if (!carrierCode) {
    return (
      <div className="ap-finder ap-finder--unsupported" onClick={stop}>
        <p className="ap-finder-note">
          Paketshop-Suche für diesen Anbieter wird noch vorbereitet.
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
  // street → 400. Die Pflicht gilt gezielt nur für GLS — UPS/DPD/DHL Express
  // bleiben unverändert (kein street-Zwang, kein zusätzliches Feld).
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
        street: streetRequired ? street.trim() : "",
        radius,
        onlyOpen,
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

  const streetField = streetRequired && (
    <div className="ap-finder-field ap-finder-field--street">
      <label className="ap-finder-label" htmlFor={`ap-street-${tariff?.id}`}>
        Straße <span className="ap-finder-required">(erforderlich)</span>
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

  // Kompakte Ergebnisanzeige: zunächst höchstens 5 Treffer (bereits vom Backend
  // sortiert — KEINE eigene Sortierung/Umordnung), der Rest auf Wunsch per
  // Button. Reiner Anzeigezustand (expanded), nicht persistiert.
  const MAX_COMPACT = 5;
  const hasResults  = !loading && !error && results !== null && results.length > 0;
  const shownResults = hasResults ? (expanded ? results : results.slice(0, MAX_COMPACT)) : [];
  const extraResults = hasResults ? results.length - MAX_COMPACT : 0;

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
        <div className={`ap-finder-fields${streetRequired ? " ap-finder-fields--gls" : ""}`}>
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
          {/* GLS verlangt zusätzlich eine Straße → volle Breite in Zeile 2
              (siehe .ap-finder-fields--gls), damit vier Felder nicht gedrängt in
              einer Zeile stehen. Andere Carrier zeigen dieses Feld nicht. */}
          {streetField}
        </div>

        <div className="ap-finder-controls">
          <label className="ap-finder-check">
            <input
              type="checkbox"
              checked={onlyOpen}
              onChange={(e) => setOnlyOpen(e.target.checked)}
            />
            Nur aktuell geöffnete Shops
          </label>
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
            ? (results.length === 0
                ? "Keine Paketshops gefunden."
                : `${results.length} Paketshop${results.length === 1 ? "" : "s"} gefunden.`)
            : ""}
      </p>

      {!loading && !error && results !== null && results.length === 0 && (
        <div className="ap-finder-empty">
          Keine Paketshops gefunden. Passen Sie PLZ oder Umkreis an.
        </div>
      )}

      {hasResults && (
        <ul className="ap-result-list">
          {shownResults.map((s, i) => {
            // Ländercode nur zeigen, wenn er vom gesuchten Land abweicht
            // (vermeidet redundantes "DE" bei inländischer Suche).
            const showCc = s.countryCode && s.countryCode !== countryCode;
            const hasMeta = s.distance != null || s.isOpen != null || s.statusText || showCc;
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
                  {hasMeta && (
                    <div className="ap-result-meta">
                      {s.distance != null && (
                        <span className="ap-result-dist">{fmtDistance(s.distance, s.distanceCode)}</span>
                      )}
                      {s.isOpen != null ? (
                        <span className={`ap-result-status ${s.isOpen ? "is-open" : "is-closed"}`}>
                          {s.isOpen ? "Geöffnet" : "Geschlossen"}
                        </span>
                      ) : s.statusText ? (
                        <span className="ap-result-status is-neutral">Status: {s.statusText}</span>
                      ) : null}
                      {showCc && <span className="ap-result-cc">{s.countryCode}</span>}
                    </div>
                  )}
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
          {expanded ? "Weniger anzeigen" : `Weitere Paketshops anzeigen (${extraResults})`}
        </button>
      )}
    </div>
  );
}
