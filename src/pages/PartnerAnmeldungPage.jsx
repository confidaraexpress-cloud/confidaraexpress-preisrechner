import React, { useEffect, useId, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { KundenbereichLink } from "../components/common/KundenbereichLink";
import { useAuth } from "../context/AuthContext";
import { useCeBereich } from "../hooks/useCeBereich";
import { BrandLogo } from "../components/ui/BrandLogo";
import { passwortVergessen } from "../api/adminAnmeldungApi";
import { partnerAnmelden } from "../api/partnerAnmeldungApi";
import { isSalesPartner } from "../utils/roleLanding.mjs";
import { partnerReturnTarget } from "../utils/loginReturnTarget.mjs";
import { PARTNER_ANMELDE_TEXT as T, PARTNER_PORTAL_PATH, mapPartnerAnmeldeFehler, PARTNER_ANMELDE_FEHLER } from "../utils/partnerAnmeldung.mjs";
import { FORGOT_NEUTRAL_ERFOLG, mapForgotError, mapAuthThrownError, LOGIN_SERVERFEHLER } from "../utils/authErrors.mjs";

/* ── Partner-Anmeldung /partner/login (Betreiberauftrag 2026-11-22, Abschnitt 8) ────────────────────────────────────
   Eigener Eingang der Partner-App, dunkel wie das Partnerportal (styles/partner-nacht.css). Der Server entscheidet:
   nur ein Vertriebspartner erhält ein Token (POST /auth/partner-login). Die Seite zeigt nur dessen Antwort und führt ins
   Portal — auf ein geprüftes Rücksprungziel im Partnerportal (partnerReturnTarget), sonst auf /partner.
   Passwort vergessen: derselbe neutrale Weg wie überall (POST /auth/forgot-password). */

async function jsonOderNull(r) {
  try { return await r.json(); } catch { return null; }
}

export default function PartnerAnmeldungPage() {
  useCeBereich("partner");
  const { authed, user, login, logout, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const uid = useId();
  const [ziel] = useState(() => partnerReturnTarget(location.state?.from) || PARTNER_PORTAL_PATH);
  const [schritt, setSchritt] = useState("anmelden"); // anmelden | vergessen
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [bleiben, setBleiben] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  const [gesendet, setGesendet] = useState(false);
  const [abgelaufen] = useState(Boolean(sessionExpired));
  const inFlight = useRef(false);
  const emailRef = useRef(null);
  const passwortRef = useRef(null);
  const ersterFokus = useRef(true);

  useEffect(() => {
    const erstes = ersterFokus.current;
    ersterFokus.current = false;
    if (erstes && typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return;
    emailRef.current?.focus();
  }, [schritt]);

  if (authed && isSalesPartner(user)) return <Navigate to={ziel} replace />;

  const idFehler = `${uid}-fehler`;

  const anmelden = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setFehler("");
    const adresse = email.trim();
    if (!adresse || !passwort) { setFehler(T.fehltEingabe); (!adresse ? emailRef : passwortRef).current?.focus(); return; }
    inFlight.current = true; setLaeuft(true);
    try {
      const r = await partnerAnmelden({ email: adresse, password: passwort, rememberMe: bleiben });
      const d = await jsonOderNull(r);
      if (!r.ok) { setFehler(mapPartnerAnmeldeFehler(r.status, d)); return; }
      if (!d || typeof d.token !== "string" || d.token === "") { setFehler(LOGIN_SERVERFEHLER); return; }
      localStorage.setItem("ce_token", d.token);
      const angemeldet = await login(d.token);
      if (!angemeldet) { setFehler(T.nichtGeladen); return; }
      // Schutz in der Tiefe: der Server gibt hier nur Partnern ein Token. Weicht die Rolle dennoch ab, endet die Sitzung.
      if (!isSalesPartner(angemeldet)) { logout(); setFehler(PARTNER_ANMELDE_FEHLER.PARTNER_ACCESS_REQUIRED); return; }
      setPasswort("");
      navigate(ziel, { replace: true });
    } catch (err) {
      setFehler(mapAuthThrownError(err));
    } finally {
      inFlight.current = false; setLaeuft(false);
    }
  };

  const vergessenSenden = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setFehler("");
    const adresse = email.trim();
    if (!adresse) { setFehler(T.fehltEmail); emailRef.current?.focus(); return; }
    inFlight.current = true; setLaeuft(true);
    try {
      const r = await passwortVergessen(adresse);
      const d = await jsonOderNull(r);
      if (!r.ok) { setFehler(mapForgotError(r.status, d)); return; }
      setGesendet(true);
    } catch (err) {
      setFehler(mapAuthThrownError(err));
    } finally {
      inFlight.current = false; setLaeuft(false);
    }
  };

  return (
    <div className="spp-anmeldung">
      <main className="spp-anmeldung-mitte">
        <section className="spp-anmeldung-panel" aria-labelledby={`${uid}-titel`}>
          <BrandLogo variant="lockup" tone="reverse" className="spp-anmeldung-marke"
            sub={<span className="spp-brand-tag">{T.bereich}</span>} />
          {schritt === "anmelden" ? (
            <form className="spp-anmeldung-form" onSubmit={anmelden} noValidate>
              <h1 className="spp-anmeldung-titel" id={`${uid}-titel`}>{T.titel}</h1>
              <p className="spp-anmeldung-text">{T.text}</p>
              {abgelaufen && <p className="spp-anmeldung-hinweis" role="status">{T.sitzungAbgelaufen}</p>}
              {fehler && <p className="spp-anmeldung-fehler" id={idFehler} role="alert">{fehler}</p>}
              <label className="spp-anmeldung-label" htmlFor="spp-login-email">{T.email}</label>
              <input id="spp-login-email" ref={emailRef} className="spp-anmeldung-input" type="email" inputMode="email"
                autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} value={email}
                onChange={(e) => setEmail(e.target.value)} aria-describedby={fehler ? idFehler : undefined} />
              <label className="spp-anmeldung-label" htmlFor="spp-login-password">{T.passwort}</label>
              <input id="spp-login-password" ref={passwortRef} className="spp-anmeldung-input" type="password"
                autoComplete="current-password" maxLength={128} value={passwort} onChange={(e) => setPasswort(e.target.value)}
                aria-describedby={fehler ? idFehler : undefined} />
              <label className="spp-anmeldung-bleiben">
                <input type="checkbox" checked={bleiben} onChange={(e) => setBleiben(e.target.checked)} aria-describedby={`${uid}-bleiben`} />
                <span>{T.bleiben}</span>
              </label>
              <p className="spp-anmeldung-hilfe" id={`${uid}-bleiben`}>{T.bleibenHilfe}</p>
              <button type="submit" className="spp-anmeldung-cta" id="spp-login-submit" disabled={laeuft} aria-busy={laeuft ? "true" : undefined}>
                {laeuft ? T.anmeldenLaeuft : T.anmelden}
              </button>
              <button type="button" className="spp-anmeldung-link" onClick={() => { setFehler(""); setGesendet(false); setSchritt("vergessen"); }}>
                {T.vergessen}
              </button>
            </form>
          ) : (
            <form className="spp-anmeldung-form" onSubmit={vergessenSenden} noValidate>
              <h1 className="spp-anmeldung-titel" id={`${uid}-titel`}>{T.vergessenTitel}</h1>
              {gesendet ? (
                <p className="spp-anmeldung-hinweis" role="status">{FORGOT_NEUTRAL_ERFOLG}</p>
              ) : (
                <>
                  <p className="spp-anmeldung-text">{T.vergessenText}</p>
                  {fehler && <p className="spp-anmeldung-fehler" id={idFehler} role="alert">{fehler}</p>}
                  <label className="spp-anmeldung-label" htmlFor="spp-vergessen-email">{T.email}</label>
                  <input id="spp-vergessen-email" ref={emailRef} className="spp-anmeldung-input" type="email" inputMode="email"
                    autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} value={email}
                    onChange={(e) => setEmail(e.target.value)} aria-describedby={fehler ? idFehler : undefined} />
                  <button type="submit" className="spp-anmeldung-cta" disabled={laeuft} aria-busy={laeuft ? "true" : undefined}>
                    {laeuft ? T.vergessenLaeuft : T.vergessenSenden}
                  </button>
                </>
              )}
              <button type="button" className="spp-anmeldung-link" onClick={() => { setFehler(""); setSchritt("anmelden"); }}>
                {T.zurueck}
              </button>
            </form>
          )}
          <p className="spp-anmeldung-fuss">
            {T.partnerWerden} <KundenbereichLink to="/partner-registrieren">{T.partnerWerdenLink}</KundenbereichLink>
          </p>
        </section>
      </main>
      <nav className="spp-anmeldung-recht" aria-label="Rechtliches">
        <KundenbereichLink to="/impressum">Impressum</KundenbereichLink>
        <KundenbereichLink to="/datenschutz">Datenschutz</KundenbereichLink>
      </nav>
    </div>
  );
}
