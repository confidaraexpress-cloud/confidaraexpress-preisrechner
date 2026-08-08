import React, { createContext, Suspense, useCallback, useContext, useId, useRef, useState } from "react";
import { searchAccessPoints } from "../api/client";
import { normalizeAccessPointList } from "../utils/accessPointResponse.mjs";
import { resolveAccessPointCarrierCode } from "../utils/carrierMap";
import { OPENING_FILTER_ALL } from "../utils/accessPointView";

/* ── Ein Paketshop-Finder für die ganze Anwendung ────────────────────────────
   Der Einstieg sitzt seit diesem Paket direkt am Angebot („Paketshops suchen“),
   und zwar an JEDEM paketshopfähigen Angebot. Genau deshalb darf der Finder
   NICHT mehr pro Angebot existieren:

     • Ein Zustand je Angebotskarte hieße bei zwölf Angeboten zwölf Formulare,
       zwölf Ergebnismengen und — sobald zwei offen wären — mehrere Karten.
     • Radius und Öffnungszeitenfilter sind eine persönliche Suchpräferenz.
       Pro Karte gehalten wären sie beim Wechsel des Angebots jedes Mal weg.

   Also: EIN Provider, EIN Modal, EIN Zustand. Die Angebotskarte reicht beim
   Klick nur ihren Kontext herein (Tarif + Absenderadresse).

   BEWUSSTE GRENZEN — unverändert gegenüber den bisherigen Paketen:
     • Keine verbindliche Shopauswahl. Nichts hiervon fließt in /book.
     • workState ist reine Darstellung, kein Sichtbarkeits-Gate.
     • onlyOpen geht fest als false raus; die vier Öffnungszeitenmerkmale
       filtern rein lokal (der Requestvertrag kennt dafür keinen Parameter).
     • Es wird nichts geokodiert und nichts gerechnet. */

const RADIUS_OPTIONS = [5, 10, 15, 25];
const DEFAULT_RADIUS = 10;

/* Das Fenster wird erst geladen, wenn es gebraucht wird. Der Provider hängt
   an der Wurzel der Anwendung — ein statischer Import zöge Fenster, Liste und
   Kartenkomponente in das Hauptbündel, das JEDE Seite lädt, auch Login und
   Rechnungen (gemessen: +38 kB / +12 kB gzip). maplibre-gl selbst bleibt
   davon unberührt in seinem eigenen Chunk (siehe utils/mapEngine.js). */
const AccessPointFinderModal = React.lazy(() =>
  import("../components/offers/AccessPointFinderModal")
    .then((m) => ({ default: m.AccessPointFinderModal })));

const ParcelShopFinderContext = createContext(null);

/** Zugriff auf den Finder. Ohne Provider bewusst `null` statt Absturz. */
export function useParcelShopFinder() {
  return useContext(ParcelShopFinderContext);
}

/* Die Identität einer Suche. Der CARRIER gehört ausdrücklich dazu: Der Kunde
   kann den Finder bei UPS öffnen, schließen und sofort bei DPD öffnen. Ohne
   den Carrier in der Identität würde die verspätete UPS-Antwort als „passend“
   gelten und die DPD-Ergebnisse überschreiben. */
const sucheSchluessel = (p) =>
  [p.carrierCode, p.countryCode, p.postCode, p.city, p.street, p.radius].join("|");

export function ParcelShopFinderProvider({ children }) {
  const titleId = useId();

  // Kontext des Angebots, aus dem heraus geöffnet wurde.
  const [tariff, setTariff] = useState(null);
  const [open, setOpen] = useState(false);

  // Suchparameter. postCode/city/street kommen beim Öffnen aus der bereits
  // erfassten Absenderadresse — der Kunde tippt sie nicht erneut. Im Modal
  // bleiben sie änderbar.
  const [postCode, setPostCode] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [countryCode, setCountryCode] = useState("DE");

  // Radius und Öffnungszeitenmerkmal sind persönliche Suchpräferenz und
  // überleben deshalb bewusst das Schließen UND den Wechsel des Angebots.
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [openingFilter, setOpeningFilter] = useState(OPENING_FILTER_ALL);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState(null); // null = noch nicht gesucht

  // Laufende Suchen durchnummerieren: nur die jüngste darf schreiben. Sonst
  // überschriebe eine langsame ältere Antwort das frische Ergebnis.
  const laufRef = useRef(0);
  // Wozu die zuletzt geschriebenen Ergebnisse gehören. Passt der Schlüssel
  // beim Öffnen exakt, wird nicht erneut gesucht; passt er nicht, sind die
  // alten Ergebnisse SOFORT weg — es darf nie eine fremde Carrier-Liste
  // stehen bleiben, auch nicht für den Moment des Ladens.
  const schluesselRef = useRef(null);
  // Auslöser für die Fokusrückgabe beim Schließen.
  const triggerRef = useRef(null);

  const carrierCode = resolveAccessPointCarrierCode(tariff);
  // Der Backend-Guard verlangt zusätzlich zur PLZ die Stadt (sonst 400).
  const cityRequired = Boolean(carrierCode);
  const cityMissing = cityRequired && city.trim().length < 2;
  // GLS verlangt backendseitig ZUSÄTZLICH eine Straße; ohne street → 400.
  // Gesendet wird sie für JEDEN Carrier, sobald sie vorliegt: JUMiNGO
  // geokodiert den Suchmittelpunkt aus der übergebenen Adresse.
  const streetRequired = carrierCode === "gls";
  const streetMissing = streetRequired && street.trim().length < 1;
  const canSearch = postCode.trim().length >= 3 && !cityMissing && !streetMissing && !loading;

  /* Eine Suche ausführen. Die Parameter werden übergeben statt aus dem State
     gelesen, damit der Öffnungspfad mit der frisch übernommenen Adresse suchen
     kann, ohne auf den nächsten Render zu warten. */
  const sucheAus = useCallback(async (p) => {
    if (!p.carrierCode || p.postCode.trim().length < 3) return;
    if (p.city.trim().length < 2) {
      setResults(null);
      setError("Für die Paketshop-Suche wird zusätzlich zur PLZ die Stadt benötigt.");
      return;
    }
    if (p.carrierCode === "gls" && p.street.trim().length < 1) {
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
        carrierCodes: [p.carrierCode],
        countryCode: p.countryCode,
        postCode: p.postCode.trim(),
        city: p.city.trim(),
        street: p.street.trim(),
        radius: p.radius,
        // Bewusst fest `false`: JUMiNGOs eigene Oberfläche sendet in JEDER
        // aufgezeichneten Anfrage onlyOpen: false und filtert Öffnungszeiten
        // rein clientseitig.
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
      setResults(normalizeAccessPointList(d));
      schluesselRef.current = sucheSchluessel(p);
    } catch {
      if (!aktuell()) return;
      setResults(null);
      setError("Die Paketshop-Suche ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut.");
    }
    if (aktuell()) setLoading(false);
  }, []);

  /**
   * Den Finder aus einem Angebot heraus öffnen.
   *
   * Ablauf: Angebots-/Carrier-Kontext übernehmen → Adresse übernehmen →
   * Fenster öffnen → suchen. Der Kunde muss NICHT noch einmal auf „Suchen“
   * klicken. Ist exakt dieselbe Suche bereits geladen, wird sie wiederverwendet
   * statt sie zu wiederholen.
   */
  const openFinder = useCallback(({ tariff: t, senderPrefill, triggerEl }) => {
    const code = resolveAccessPointCarrierCode(t);
    if (!code) return; // ohne Suchcode gibt es nichts zu öffnen
    const land = (senderPrefill?.country || "DE").toUpperCase();
    const p = {
      carrierCode: code,
      countryCode: land,
      postCode: String(senderPrefill?.postCode || "").trim(),
      city: String(senderPrefill?.city || "").trim(),
      street: String(senderPrefill?.street || "").trim(),
      radius,
    };

    triggerRef.current = triggerEl || null;
    setTariff(t);
    setCountryCode(land);
    setPostCode(p.postCode);
    setCity(p.city);
    setStreet(p.street);
    setError("");
    setOpen(true);

    const schluessel = sucheSchluessel(p);
    if (schluesselRef.current === schluessel && results !== null) {
      // Exakt dieselbe Suche liegt bereits vor — kein zweiter Request.
      return;
    }
    // Andere Suche: alte Treffer SOFORT verwerfen. Sonst stünde für die Dauer
    // des Ladens die Liste des vorherigen Carriers im Fenster.
    setResults(null);
    laufRef.current++; // eine noch laufende ältere Suche darf nicht mehr schreiben
    schluesselRef.current = null;
    sucheAus(p);
  }, [radius, results, sucheAus]);

  const closeFinder = useCallback(() => setOpen(false), []);

  // „Suchen“ im Fenster — mit den dort ggf. geänderten Werten.
  const sucheAusFormular = useCallback(() => {
    if (!carrierCode) return;
    sucheAus({ carrierCode, countryCode, postCode, city, street, radius });
  }, [carrierCode, countryCode, postCode, city, street, radius, sucheAus]);

  const wert = { openFinder, isOpen: open, activeTariff: tariff };

  return (
    <ParcelShopFinderContext.Provider value={wert}>
      {children}
      {open && (
      <Suspense fallback={null}>
      <AccessPointFinderModal
        open={open}
        onClose={closeFinder}
        titleId={titleId}
        returnFocusTo={triggerRef}
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
        onSearch={sucheAusFormular}
        canSearch={canSearch}
        loading={loading}
        error={error}
        results={results}
        countryCode={countryCode}
        carrierName={tariff?.publicCarrierName || null}
      />
      </Suspense>
      )}
    </ParcelShopFinderContext.Provider>
  );
}
