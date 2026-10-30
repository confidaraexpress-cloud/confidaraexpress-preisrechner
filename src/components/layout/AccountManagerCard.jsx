import React, { useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../context/AuthContext";
import { BrandLogo } from "../ui/BrandLogo";
import { getAccountManagerPhotoUrl } from "../../api/accountManagerApi";
import {
  ANSPRECH_TEXT, ansprechpartnerAnsicht, pulsAngehalten, pulsMerken,
} from "../../utils/accountManagerView.mjs";

/* Der persönliche ConfidaraExpress-Ansprechpartner in der Seitenleiste (Betreiberentscheidung 2026-10-30,
   Canonical 1A, v2.90). Eine eigene Komponente, damit die Seitenleiste ohne Effekt bleibt (mobileNavigationIcons 4):
   nur hier wird das Foto geladen.

   Quelle ist ausschließlich das Serverfeld `accountManager` aus /kundenbereich (AuthContext). Der Kunde sieht nur
   seinen eigenen Ansprechpartner; ohne Zuordnung (auch Admin und öffentliche Demo) steht der allgemeine
   ConfidaraExpress-Kundenservice da — ohne Person, ohne Kontaktdaten, ohne Postfachlink (Support läuft über
   „Support kontaktieren“ darunter).

   Der grüne Punkt ist Schmuck und sagt nichts über Erreichbarkeit: kein Text, kein Tooltip mit Status. Er pulsiert
   ruhig und dauerhaft; der Punkt selbst ist der Schalter zum Anhalten und Fortsetzen (WCAG 2.2.2, Vorliebe je Gerät).
   Bei reduzierter Bewegung pulsiert nichts und es gibt keinen Schalter. */

const BEWEGUNG_REDUZIERT = "(prefers-reduced-motion: reduce)";

function abonniereBewegung(melden) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(BEWEGUNG_REDUZIERT);
  if (typeof mql.addEventListener !== "function") return () => {};
  mql.addEventListener("change", melden);
  return () => mql.removeEventListener("change", melden);
}
const bewegungReduziert = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(BEWEGUNG_REDUZIERT).matches;

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

export function AccountManagerCard() {
  const { user } = useAuth();
  const ansicht = ansprechpartnerAnsicht(user ? user.accountManager : null);
  const reduziert = useSyncExternalStore(abonniereBewegung, bewegungReduziert, () => false);

  // Foto je Version: bis es da ist (oder wenn es fehlt), stehen die Initialen DIESER Person — nie ein anderes Bild.
  const version = ansicht.fotoVersion;
  const [foto, setFoto] = useState({ version: null, url: null, fehler: false });
  useEffect(() => {
    if (!version) return undefined;
    let aktiv = true;
    getAccountManagerPhotoUrl(version).then((url) => { if (aktiv) setFoto({ version, url, fehler: false }); });
    return () => { aktiv = false; };
  }, [version]);
  const fotoUrl = version && foto.version === version && !foto.fehler ? foto.url : null;

  if (ansicht.art !== "person") {
    return (
      <div className="pp-ansprech pp-ansprech--service">
        <div className="pp-ansprech-kopf">
          <span className="pp-ansprech-bild pp-ansprech-bild--marke" aria-hidden="true">
            <BrandLogo variant="signet" tone="reverse" alt="" />
          </span>
          <div className="pp-ansprech-text">
            <p className="pp-ansprech-name">{ansicht.name}</p>
            <p className="pp-ansprech-rolle"><span>{ansicht.rolle}</span></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <address className="pp-ansprech pp-ansprech--person" data-ansprechpartner={ansicht.key}>
      <div className="pp-ansprech-kopf">
        <span className="pp-ansprech-bild">
          {fotoUrl ? (
            <img className="pp-ansprech-foto" src={fotoUrl} alt="" width="48" height="48" decoding="async"
              onError={() => setFoto({ version, url: null, fehler: true })} />
          ) : (
            <span className="pp-ansprech-initialen" aria-hidden="true">{ansicht.initialen}</span>
          )}
        </span>
        <div className="pp-ansprech-text">
          <p className="pp-ansprech-name">{ansicht.name}</p>
          <p className="pp-ansprech-rolle">
            <Punkt reduziert={reduziert} />
            <span>{ansicht.rolle}</span>
          </p>
        </div>
      </div>
      <p className="pp-ansprech-wege">
        <a className="pp-ansprech-link pp-ansprech-tel" href={ansicht.telefon.href}>
          <span className="sr-only">{ANSPRECH_TEXT.anrufen}</span>{ansicht.telefon.anzeige}
        </a>
        <a className="pp-ansprech-link pp-ansprech-mail" href={ansicht.email.href}>
          <span className="sr-only">{ANSPRECH_TEXT.mailen}</span>{ansicht.email.lokal}<wbr />{ansicht.email.domain}
        </a>
      </p>
    </address>
  );
}
