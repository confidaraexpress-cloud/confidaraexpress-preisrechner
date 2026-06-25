import React, { useState } from "react";
import { Icon } from "../ui/Icon";
import { searchAccessPoints } from "../../api/client";
import { accessPointCarrierCode } from "../../utils/carrierMap";

// ─── Read-only Paketshop-/Access-Point-Finder ────────────────────────────────
// Zeigt — ähnlich wie Jumingo — eine reine Orientierungssuche für Dropoff-/
// Shopabgabe-Tarife: PLZ/Ort/Radius → Liste verfügbarer Paketshops (Name,
// Adresse, Entfernung, Öffnungszeiten/Status, falls vorhanden).
//
// WICHTIG — bewusste Grenzen (Backend-Realität respektieren):
//  • KEINE Buchung: die Auswahl wird nirgends gespeichert und fließt NICHT in
//    den /book-Payload. Es gibt keine "Shop auswählen"-Aktion.
//  • Dropoff bleibt backendseitig blockiert — diese Anzeige umgeht das nicht.
//  • Nur Carrier mit serverseitig allowlistetem Code (aktuell nur UPS) lösen
//    eine echte Suche aus; sonst klarer "wird vorbereitet"-Hinweis.
//  • Keine Roh-Fehler/Secrets im UI — nur generische, sichere Meldungen.

const RADIUS_OPTIONS = [5, 10, 15, 25];

// Entfernung nur als belegte Zahl anzeigen (de-DE, max. 1 Nachkommastelle).
const fmtDistance = (km) =>
  `${km.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`;

// Ersten vorhandenen, nicht-leeren Wert aus einer Liste möglicher Feldnamen.
const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && v !== "") return v;
  }
  return null;
};

// ── Defensive Normalisierung eines Ergebnis-Items ────────────────────────────
// Das exakte Response-Schema von POST /api/jumingo/access-points-search ist im
// Frontend-Repo NICHT belegt (Backend ist ein separates Repo). Deshalb lesen
// wir ausschließlich konventionelle Feldnamen defensiv aus und rendern NUR real
// vorhandene, typgeprüfte Werte — niemals erfundene Daten, niemals Objekte.
// Fehlt alles Brauchbare, wird das Item übersprungen (→ sauberer Empty-State).
// Sobald das reale Schema bestätigt ist: ausschließlich hier anpassen.
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

  // Entfernung: nur echte, endliche Zahl.
  const distRaw = pick(raw, ["distance", "distanceKm", "distanceInKm"]);
  const distance = typeof distRaw === "number" && Number.isFinite(distRaw) ? distRaw : null;

  // Öffnungszeiten: nur reine Zeichenkette (nie Objekte/Arrays rendern).
  const hoursRaw = pick(raw, ["openingHours", "hours", "openingTimes"]);
  const hours = typeof hoursRaw === "string" ? hoursRaw : null;

  // Offen-Status: nur echter Boolean.
  const openRaw = pick(raw, ["isOpen", "open", "openNow"]);
  const isOpen = typeof openRaw === "boolean" ? openRaw : null;

  if (!name && !address) return null; // nichts Brauchbares → überspringen
  return { name, address, distance, hours, isOpen };
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
  // Nur belegter (allowlisteter) Carrier-Code löst eine echte Suche aus.
  const carrierCode = accessPointCarrierCode(tariff?.carrier);
  const countryCode = (senderPrefill?.country || "DE").toUpperCase();

  const [postCode, setPostCode] = useState(senderPrefill?.postCode || "");
  const [city, setCity]         = useState(senderPrefill?.city || "");
  const [radius, setRadius]     = useState(10);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [results, setResults]   = useState(null); // null = noch nicht gesucht

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

  const canSearch = postCode.trim().length >= 3 && !loading;

  const doSearch = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!canSearch) return;
    setLoading(true);
    setError("");
    try {
      const r = await searchAccessPoints({
        carrierCodes: [carrierCode],
        countryCode,
        postCode: postCode.trim(),
        city: city.trim(),
        street: "",
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

  return (
    <div className="ap-finder" onClick={stop}>
      {/* Klarer Hinweis: Orientierung, noch keine verbindliche Buchung. */}
      <div className="ap-finder-banner" role="note">
        <Icon n="info" s={15} c="currentColor" />
        <span className="ap-finder-banner-text">
          Dieser Shop dient aktuell zur Orientierung. Die verbindliche
          Paketshop-Buchung wird noch vorbereitet.
        </span>
      </div>

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
              Ort <span className="ap-finder-optional">(optional)</span>
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
              ? <><span className="spinner" /> Suche…</>
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

      {loading && (
        <div className="ap-finder-status">
          <span className="spinner spinner-dark" />
          <span>Paketshops werden gesucht…</span>
        </div>
      )}

      {!loading && !error && results !== null && results.length === 0 && (
        <div className="ap-finder-empty">
          Keine Paketshops gefunden. Passen Sie PLZ oder Umkreis an.
        </div>
      )}

      {!loading && !error && results !== null && results.length > 0 && (
        <ul className="ap-result-list">
          {results.map((s, i) => (
            <li className="ap-result" key={i}>
              <div className="ap-result-main">
                <div className="ap-result-name">{s.name || s.address}</div>
                {s.name && s.address && <div className="ap-result-addr">{s.address}</div>}
                {s.hours && (
                  <div className="ap-result-hours">
                    <Icon n="clock" s={13} c="currentColor" />
                    <span>{s.hours}</span>
                  </div>
                )}
              </div>
              {(s.distance != null || s.isOpen != null) && (
                <div className="ap-result-meta">
                  {s.distance != null && (
                    <span className="ap-result-dist">{fmtDistance(s.distance)}</span>
                  )}
                  {s.isOpen != null && (
                    <span className={`ap-result-status ${s.isOpen ? "is-open" : "is-closed"}`}>
                      {s.isOpen ? "Geöffnet" : "Geschlossen"}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
