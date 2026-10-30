import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../context/AuthContext";
import { BrandLogo } from "../ui/BrandLogo";
import { Icon, ICON_SIZE } from "../ui/Icon";
import { getAccountManagerPhotoUrl } from "../../api/accountManagerApi";
import {
  ANSPRECH_TEXT, PLATZ_FUER_KARTE, ansprechpartnerAnsicht, karteEingeklappt, karteMerken, karteOffen,
  pulsAngehalten, pulsMerken,
} from "../../utils/accountManagerView.mjs";

/* Der persönliche ConfidaraExpress-Ansprechpartner als schwebende Karte unten rechts im Fenster
   (Betreiberentscheidungen 2026-10-30, Canonical 1A, v2.90 und v2.91 G3–G5).

   Einbindung: DashboardSidebar rendert die Karte EINMAL per Portal an <body>. Beide Shells (DashboardPage und
   DashboardLayout) rendern die Seitenleiste — so steht die Karte auf jeder Kundenseite genau einmal, und kein
   transformierter Vorfahr fängt position: fixed ein (die Seitenleiste ist mobil eine Schublade mit transform).

   Quelle ist ausschließlich das Serverfeld `accountManager` aus /kundenbereich (AuthContext). Ohne Zuordnung — auch
   Admin und öffentliche Demo — steht im selben Dock der allgemeine Kundenservice, ohne Person und ohne Kontaktdaten
   (G4). Nie eine erfundene Person.

   Zwei Formen (G3): die offene Karte und ein rundes Foto (ohne Zuordnung das Signet). Wo die volle Karte Platz hat,
   ist sie offen; Einklappen merkt sich das Gerät. Bei wenig Platz startet sie als Foto; ein Klick öffnet die Karte
   über dem Foto, Escape oder ein Klick daneben schließt sie (nie gemerkt).

   Der grüne Punkt (G5) steht nur in der offenen Karte — am Foto läse er sich als Online-Status. Er ist Schmuck und
   sagt nichts über Erreichbarkeit: kein Text, kein Tooltip mit Status. Er pulsiert ruhig und dauerhaft; der Punkt
   selbst ist der Schalter zum Anhalten (WCAG 2.2.2). Bei reduzierter Bewegung pulsiert nichts, ohne Schalter.

   Nichts bleibt dauerhaft verdeckt: die gemessene Höhe des Docks steht als --ce-ansprech-hoehe am Wurzelelement;
   premium-editorial.css (Abschnitt 25) gibt dem Seiteninhalt unten genau so viel Platz und dem Dokument das
   scroll-padding für Fokus und Sprungziele (WCAG 2.4.11). Menüs, Popover, Schublade und Dialoge liegen darüber. */

const BEWEGUNG_REDUZIERT = "(prefers-reduced-motion: reduce)";
const KARTE_ID = "ce-ansprechpartner-karte";

function medienAbo(query) {
  return (melden) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    const mql = window.matchMedia(query);
    if (typeof mql.addEventListener !== "function") return () => {};
    mql.addEventListener("change", melden);
    return () => mql.removeEventListener("change", melden);
  };
}
function medienStand(query) {
  return () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}
const abonniereBewegung = medienAbo(BEWEGUNG_REDUZIERT);
const bewegungReduziert = medienStand(BEWEGUNG_REDUZIERT);
const abonnierePlatz = medienAbo(PLATZ_FUER_KARTE);
const platzFuerKarte = medienStand(PLATZ_FUER_KARTE);

function geraetespeicher() {
  try { return window.localStorage; } catch { return null; }
}

function Punkt({ reduziert }) {
  const [angehalten, setAngehalten] = useState(() => pulsAngehalten(geraetespeicher()));
  if (reduziert) return <span className="pp-ansprech-punkt" aria-hidden="true" />;
  const name = angehalten ? ANSPRECH_TEXT.pulsFortsetzen : ANSPRECH_TEXT.pulsAnhalten;
  const umschalten = () => {
    const naechster = !angehalten;
    setAngehalten(naechster);
    pulsMerken(geraetespeicher(), naechster);
  };
  return (
    <button type="button" className="pp-ansprech-puls" data-puls={angehalten ? "aus" : "an"}
      aria-label={name} title={name} onClick={umschalten}>
      <span className="pp-ansprech-punkt" aria-hidden="true" />
    </button>
  );
}

// Foto je Version: bis es da ist (oder wenn es fehlt), stehen die Initialen DIESER Person — nie ein anderes Bild.
function useFoto(version) {
  const [foto, setFoto] = useState({ version: null, url: null, fehler: false });
  useEffect(() => {
    if (!version) return undefined;
    let aktiv = true;
    getAccountManagerPhotoUrl(version).then((url) => { if (aktiv) setFoto({ version, url, fehler: false }); });
    return () => { aktiv = false; };
  }, [version]);
  const url = version && foto.version === version && !foto.fehler ? foto.url : null;
  const fehlgeschlagen = () => setFoto({ version, url: null, fehler: true });
  return [url, fehlgeschlagen];
}

function Bild({ ansicht, fotoUrl, onFehler, klasse, groesse }) {
  if (ansicht.art !== "person") {
    return (
      <span className={`pp-ansprech-bild pp-ansprech-bild--marke ${klasse}`} aria-hidden="true">
        <BrandLogo variant="signet" tone="reverse" alt="" />
      </span>
    );
  }
  return (
    <span className={`pp-ansprech-bild ${klasse}`}>
      {fotoUrl ? (
        <img className="pp-ansprech-foto" src={fotoUrl} alt="" width={groesse} height={groesse} decoding="async"
          onError={onFehler} />
      ) : (
        <span className="pp-ansprech-initialen" aria-hidden="true">{ansicht.initialen}</span>
      )}
    </span>
  );
}

function Dock() {
  const { user } = useAuth();
  const ansicht = ansprechpartnerAnsicht(user ? user.accountManager : null);
  const person = ansicht.art === "person";
  const reduziert = useSyncExternalStore(abonniereBewegung, bewegungReduziert, () => false);
  const platz = useSyncExternalStore(abonnierePlatz, platzFuerKarte, () => true);
  const [eingeklappt, setEingeklappt] = useState(() => karteEingeklappt(geraetespeicher()));
  const [kurzGeoeffnet, setKurzGeoeffnet] = useState(false);
  const [durchHandlung, setDurchHandlung] = useState(false);
  const offen = karteOffen({ platz, eingeklappt, kurzGeoeffnet });
  const [fotoUrl, fotoFehler] = useFoto(ansicht.fotoVersion);

  const dockRef = useRef(null);
  const einklappenRef = useRef(null);
  const fotoRef = useRef(null);
  const fokusNach = useRef(null);

  // Wechselt der Platz (Fenster, Zoom, Schrift), beginnt die kompakte Form wieder als Foto.
  useEffect(() => { setKurzGeoeffnet(false); }, [platz]);

  const oeffnen = () => {
    fokusNach.current = "karte";
    setDurchHandlung(true);
    if (platz) { setEingeklappt(false); karteMerken(geraetespeicher(), false); }
    else setKurzGeoeffnet(true);
  };
  const schliessen = (fokusZurueck = true) => {
    fokusNach.current = fokusZurueck ? "foto" : null;
    if (platz) { setEingeklappt(true); karteMerken(geraetespeicher(), true); }
    else setKurzGeoeffnet(false);
  };

  // Der geklickte Knopf verschwindet oder ändert seine Rolle — der Fokus folgt der Handlung, nie beim Laden.
  useEffect(() => {
    const ziel = fokusNach.current;
    fokusNach.current = null;
    if (ziel === "karte" && einklappenRef.current) einklappenRef.current.focus();
    if (ziel === "foto" && fotoRef.current) fotoRef.current.focus();
  }, [offen]);

  // Kompakt geöffnet: ein Klick daneben schließt die Karte, der Fokus bleibt, wo geklickt wurde.
  useEffect(() => {
    if (platz || !kurzGeoeffnet) return undefined;
    const daneben = (e) => {
      if (dockRef.current && !dockRef.current.contains(e.target)) setKurzGeoeffnet(false);
    };
    document.addEventListener("pointerdown", daneben);
    return () => document.removeEventListener("pointerdown", daneben);
  }, [platz, kurzGeoeffnet]);

  // Belegte Höhe am Wurzelelement: daraus entstehen Freiraum unter dem Inhalt und scroll-padding (CSS Abschnitt 25).
  // Kompakt geöffnet liegt die Karte ÜBER dem Foto (absolut) — gemessen wird dann weiter nur das Foto.
  useLayoutEffect(() => {
    const el = dockRef.current;
    const wurzel = document.documentElement;
    if (!el) return undefined;
    const setzen = () => wurzel.style.setProperty("--ce-ansprech-hoehe", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    setzen();
    let ro = null;
    if (typeof ResizeObserver === "function") { ro = new ResizeObserver(setzen); ro.observe(el); }
    return () => { if (ro) ro.disconnect(); wurzel.style.removeProperty("--ce-ansprech-hoehe"); };
  }, []);

  const tastatur = (e) => {
    if (e.key === "Escape" && !platz && kurzGeoeffnet) { e.stopPropagation(); schliessen(true); }
  };

  const bereich = person ? ANSPRECH_TEXT.bereichPerson : ANSPRECH_TEXT.bereichService;
  const KartenTag = person ? "address" : "div";

  return (
    <aside ref={dockRef} className="pp-ansprech-dock" aria-label={bereich} onKeyDown={tastatur}
      data-form={platz ? "voll" : "kompakt"} data-offen={offen ? "ja" : "nein"}
      data-bewegung={durchHandlung ? "ja" : undefined} data-ansprechpartner={person ? ansicht.key : undefined}>
      <KartenTag id={KARTE_ID} className={`pp-ansprech pp-ansprech--${person ? "person" : "service"}`} hidden={!offen}>
        <div className="pp-ansprech-zeile">
          <p className="pp-ansprech-rolle">
            {person && <Punkt reduziert={reduziert} />}
            <span>{ansicht.rolle}</span>
          </p>
          <button ref={einklappenRef} type="button" className="pp-ansprech-einklappen" onClick={() => schliessen(true)}
            aria-expanded="true" aria-controls={KARTE_ID} aria-label={ANSPRECH_TEXT.einklappen} title={ANSPRECH_TEXT.einklappen}>
            <Icon n="chevron" s={ICON_SIZE.sm} />
          </button>
        </div>
        <div className="pp-ansprech-kopf">
          <Bild ansicht={ansicht} fotoUrl={fotoUrl} onFehler={fotoFehler} klasse="pp-ansprech-bild--karte" groesse={80} />
          <div className="pp-ansprech-text">
            <p className="pp-ansprech-name">{ansicht.name}</p>
            {person && (
              <p className="pp-ansprech-wege">
                <a className="pp-ansprech-link pp-ansprech-tel" href={ansicht.telefon.href}>
                  <Icon n="phone" s={ICON_SIZE.sm} />
                  <span><span className="sr-only">{ANSPRECH_TEXT.anrufen}</span>{ansicht.telefon.anzeige}</span>
                </a>
                <a className="pp-ansprech-link pp-ansprech-mail" href={ansicht.email.href}>
                  <Icon n="mail" s={ICON_SIZE.sm} />
                  <span><span className="sr-only">{ANSPRECH_TEXT.mailen}</span>{ansicht.email.lokal}<wbr />{ansicht.email.domain}</span>
                </a>
              </p>
            )}
          </div>
        </div>
      </KartenTag>
      {/* Name aus dem Inhalt (sr-only), kein aria-label: das Foto zeigt sonst Initialen, die als sichtbarer Text
          zählen (axe label-content-name-mismatch). Der Zustand steht in aria-expanded, die Handlung im Tooltip. */}
      <button ref={fotoRef} type="button" className="pp-ansprech-foto-knopf" hidden={platz && offen}
        aria-expanded={offen ? "true" : "false"} aria-controls={KARTE_ID}
        title={offen ? ANSPRECH_TEXT.einklappen : (person ? ANSPRECH_TEXT.oeffnenPerson : ANSPRECH_TEXT.oeffnenService)}
        onClick={() => (offen ? schliessen(true) : oeffnen())}>
        <Bild ansicht={ansicht} fotoUrl={fotoUrl} onFehler={fotoFehler} klasse="pp-ansprech-bild--foto" groesse={56} />
        <span className="sr-only">{person ? `${ANSPRECH_TEXT.bereichPerson}: ${ansicht.name}` : ANSPRECH_TEXT.bereichService}</span>
      </button>
    </aside>
  );
}

// Keine eigene Fehlergrenze: das Projekt hat genau eine (ContentErrorBoundary, errorBoundaryCoverage-Test 1). Die Karte
// rendert nur geprüfte Ansichtsdaten (ansprechpartnerAnsicht fällt bei allem Unvollständigen auf den Kundenservice zurück).
export function AccountManagerCard() {
  return <Dock />;
}
