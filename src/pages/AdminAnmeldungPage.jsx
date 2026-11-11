import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCeBereich } from "../hooks/useCeBereich";
import { BrandLogo } from "../components/ui/BrandLogo";
import { Icon } from "../components/ui/Icon";
import { AdminLichtstrom } from "../components/auth/AdminLichtstrom";
import { adminAnmelden, passwortVergessen, resetLinkPruefen, passwortSetzen } from "../api/adminAnmeldungApi";
import { isAdmin } from "../utils/roleLanding.mjs";
import {
  ADMIN_ANMELDUNG_TEXT as T, ADMIN_ANMELDE_FEHLER, ADMIN_VERGESSEN_ERFOLG, ADMIN_LOGIN_PATH,
  mapAdminAnmeldeFehler, mapAdminVergessenFehler, adminZielNachAnmeldung, resetTokenAus,
} from "../utils/adminAnmeldung.mjs";
import {
  classifyResetTokenCheck, mapResetError, mapAuthThrownError, LOGIN_SERVERFEHLER, RESET_PRUEFUNG_NETZFEHLER,
} from "../utils/authErrors.mjs";
import { passwordLengthError, PASSWORD_MIN_LEN, PASSWORD_MAX_LEN } from "../utils/passwordPolicy.mjs";

/* ── Admin-Anmeldung /admin/login (Canonical v2.130) ───────────────────────────────────────────────────────
   Der einzige Eingang in den Adminbereich: Anmelden über POST /auth/admin-login, „Passwort vergessen?“ und das
   Setzen des eigenen Passworts über den Einmallink (…/admin/login?reset=…). Wer Admin ist, entscheidet der Server;
   diese Seite zeigt nur, was er antwortet, und führt danach ins Adminpanel (geprüftes Rücksprungziel, sonst /admin).
   Gestaltung: styles/auth.css, Abschnitt „Admin-Anmeldung“; Bühne: components/auth/AdminLichtstrom.jsx. */

const PASSWORT_TEXTE = Object.freeze({
  tooShort: `Das Passwort muss mindestens ${PASSWORD_MIN_LEN} Zeichen haben.`,
  tooLong: `Das Passwort darf höchstens ${PASSWORD_MAX_LEN} Zeichen haben.`,
});
const ADMINBEREICH_NICHT_GELADEN =
  "Die Anmeldung war erfolgreich, der Adminbereich konnte aber nicht geladen werden. Bitte versuchen Sie es erneut.";

async function jsonOderNull(r) {
  try { return await r.json(); } catch { return null; }
}

function PasswortEingabe({ id, wert, onWert, autoComplete, beschreibung, ungueltig, feldRef }) {
  const [sichtbar, setSichtbar] = useState(false);
  return (
    <div className={`auth-admin-eingabe${ungueltig ? " auth-admin-eingabe--fehler" : ""}`}>
      <span className="auth-admin-eingabe-ico"><Icon n="lock" s={18} /></span>
      <input
        id={id}
        ref={feldRef}
        className="auth-admin-input"
        type={sichtbar ? "text" : "password"}
        value={wert}
        onChange={(e) => onWert(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        maxLength={PASSWORD_MAX_LEN}
        aria-invalid={ungueltig ? "true" : undefined}
        aria-describedby={beschreibung || undefined}
      />
      <button
        type="button"
        className="auth-admin-auge"
        onClick={() => setSichtbar((s) => !s)}
        aria-label={sichtbar ? T.passwortVerbergen : T.passwortZeigen}
        aria-pressed={sichtbar}
        aria-controls={id}
      >
        <Icon n={sichtbar ? "eyeOff" : "eye"} s={18} />
      </button>
    </div>
  );
}

function Meldung({ art, id, children }) {
  if (!children) return null;
  return (
    <div id={id} className={`auth-admin-meldung auth-admin-meldung--${art}`} role={art === "fehler" ? "alert" : "status"}>
      <span className="auth-admin-meldung-ico"><Icon n={art === "fehler" ? "info" : art === "erfolg" ? "check" : "info"} s={16} /></span>
      <span>{children}</span>
    </div>
  );
}

export default function AdminAnmeldungPage() {
  // Die Admin-Anmeldung gehört zum Auth-Bereich (Schrift und Grund des Bereichs „auth“), nicht zum Adminpanel.
  useCeBereich("auth");
  const { authed, user, login, logout, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const uid = useId();
  const idEmail = `${uid}-email`;
  const idPasswort = `${uid}-passwort`;
  const idFehler = `${uid}-fehler`;

  // Rücksprungziel und Einmallink werden EINMAL beim Öffnen gelesen und sofort geprüft.
  const [ziel] = useState(() => adminZielNachAnmeldung(location.state?.from));
  const [resetToken] = useState(() => resetTokenAus(location.search));
  const [schritt, setSchritt] = useState(() => (resetToken ? "reset" : "anmelden"));

  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  const [hinweis, setHinweis] = useState("");
  const [abgelaufenSichtbar, setAbgelaufenSichtbar] = useState(Boolean(sessionExpired));

  const [vergessenEmail, setVergessenEmail] = useState("");
  const [vergessenGesendet, setVergessenGesendet] = useState(false);

  const [linkZustand, setLinkZustand] = useState(resetToken ? "pruefen" : "keiner"); // pruefen | gueltig | netzfehler
  const [neu, setNeu] = useState("");
  const [neuWdh, setNeuWdh] = useState("");

  const inFlight = useRef(false);
  const emailRef = useRef(null);
  const passwortRef = useRef(null);
  const vergessenRef = useRef(null);
  const neuRef = useRef(null);
  const titelRef = useRef(null);

  // Den Einmallink nicht in der Adresszeile stehen lassen: er bleibt nur im Zustand dieser Seite.
  useEffect(() => {
    if (resetToken) navigate(ADMIN_LOGIN_PATH, { replace: true, state: location.state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkPruefen = useCallback(async () => {
    if (!resetToken) return;
    setLinkZustand("pruefen"); setFehler("");
    let r;
    try { r = await resetLinkPruefen(resetToken); } catch { setLinkZustand("netzfehler"); setFehler(RESET_PRUEFUNG_NETZFEHLER); return; }
    const d = await jsonOderNull(r);
    if (!r.ok || d === null) { setLinkZustand("netzfehler"); setFehler(RESET_PRUEFUNG_NETZFEHLER); return; }
    const k = classifyResetTokenCheck(d);
    if (k.state === "valid") { setLinkZustand("gueltig"); return; }
    // Ein sicher unbrauchbarer Link: erklären und direkt den Weg zu einem neuen anbieten.
    setLinkZustand("keiner"); setSchritt("vergessen"); setFehler(k.message);
  }, [resetToken]);

  useEffect(() => { linkPruefen(); }, [linkPruefen]);

  // Nach jedem Schrittwechsel liegt der Fokus im ersten Feld des Schritts (bzw. auf der Überschrift). Beim ersten
  // Öffnen auf Touch-Geräten nicht: dort öffnete der Fokus sofort die Bildschirmtastatur über der Seite.
  const ersterFokus = useRef(true);
  useEffect(() => {
    const erstes = ersterFokus.current;
    ersterFokus.current = false;
    if (erstes && typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return;
    const feld = schritt === "anmelden" ? emailRef.current : schritt === "vergessen" ? vergessenRef.current : neuRef.current;
    (feld || titelRef.current)?.focus?.();
  }, [schritt, linkZustand]);

  // Ein angemeldeter Admin landet im Adminpanel — außer die Seite wurde mit einem Einmallink geöffnet: der gehört
  // womöglich zu einem anderen Konto (Einrichtung: der gemeinsame Zugang ist in diesem Browser noch angemeldet, Patrick
  // öffnet seinen eigenen Link). Dann bleibt es beim Link-Schritt; nach dem Speichern endet die offene Sitzung.
  if (authed && isAdmin(user) && !resetToken) return <Navigate to={ziel} replace />;

  const zurAnmeldung = () => { setSchritt("anmelden"); setFehler(""); setVergessenGesendet(false); };

  const anmelden = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setFehler(""); setHinweis(""); setAbgelaufenSichtbar(false);
    const adresse = email.trim();
    if (!adresse || !passwort) {
      setFehler("Bitte geben Sie E-Mail-Adresse und Passwort ein.");
      (!adresse ? emailRef : passwortRef).current?.focus();
      return;
    }
    inFlight.current = true; setLaeuft(true);
    try {
      const r = await adminAnmelden({ email: adresse, password: passwort });
      const d = await jsonOderNull(r);
      if (!r.ok) { setFehler(mapAdminAnmeldeFehler(r.status, d)); return; }
      if (!d || typeof d.token !== "string" || d.token === "") { setFehler(LOGIN_SERVERFEHLER); return; }
      localStorage.setItem("ce_token", d.token);
      const angemeldet = await login(d.token);
      if (!angemeldet) { setFehler(ADMINBEREICH_NICHT_GELADEN); return; }
      // Schutz in der Tiefe: der Server gibt Nicht-Admins hier kein Token. Sollte die Rolle dennoch abweichen,
      // wird die Sitzung sofort beendet — die Seite öffnet nie einen Adminbereich ohne Adminrolle.
      if (!isAdmin(angemeldet)) { logout(); setFehler(ADMIN_ANMELDE_FEHLER.ADMIN_ACCESS_REQUIRED); return; }
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
    const adresse = vergessenEmail.trim();
    if (!adresse) { setFehler("Bitte geben Sie Ihre E-Mail-Adresse ein."); vergessenRef.current?.focus(); return; }
    inFlight.current = true; setLaeuft(true);
    try {
      const r = await passwortVergessen(adresse);
      if (!r.ok) { setFehler(mapAdminVergessenFehler(r.status)); return; }
      setVergessenGesendet(true);
    } catch (err) {
      setFehler(mapAuthThrownError(err));
    } finally {
      inFlight.current = false; setLaeuft(false);
    }
  };

  const passwortSpeichern = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setFehler("");
    const laenge = passwordLengthError(neu, PASSWORT_TEXTE);
    if (laenge) { setFehler(laenge); neuRef.current?.focus(); return; }
    if (neu !== neuWdh) { setFehler(T.ungleich); return; }
    inFlight.current = true; setLaeuft(true);
    try {
      const r = await passwortSetzen(resetToken, neu);
      const d = await jsonOderNull(r);
      if (!r.ok) { setFehler(mapResetError(r.status, d)); return; }
      setNeu(""); setNeuWdh("");
      // Eine in diesem Browser noch offene Sitzung endet jetzt, auch serverseitig: angemeldet wird mit dem eben
      // gesetzten Passwort, damit jede weitere Aktion im Protokoll dem richtigen Konto zugeordnet ist.
      if (authed) logout();
      setLinkZustand("keiner");
      setHinweis(T.gespeichert);
      setSchritt("anmelden");
    } catch (err) {
      setFehler(mapAuthThrownError(err));
    } finally {
      inFlight.current = false; setLaeuft(false);
    }
  };

  const knopf = (beschriftung, laeuftText) => (
    <button type="submit" className="auth-admin-cta" disabled={laeuft} aria-busy={laeuft ? "true" : undefined}>
      {laeuft && <span className="auth-admin-cta-lauf" aria-hidden="true" />}
      <span>{laeuft ? laeuftText : beschriftung}</span>
    </button>
  );

  return (
    <div className="auth-admin-seite">
      <AdminLichtstrom />
      <main className="auth-admin-mitte">
        <section className="auth-admin-panel" aria-labelledby={`${uid}-titel`}>
          <header className="auth-admin-kopf">
            <h1 className="auth-admin-titel" id={`${uid}-titel`} ref={titelRef} tabIndex={-1}>
              <BrandLogo variant="lockup" tone="reverse" className="auth-admin-marke" />
              <span className="auth-admin-titel-text">{T.titel}</span>
            </h1>
          </header>

          {schritt === "anmelden" && (
            <form className="auth-admin-formular" onSubmit={anmelden} noValidate>
              {abgelaufenSichtbar && <Meldung art="info">{T.sitzungAbgelaufen}</Meldung>}
              <Meldung art="erfolg">{hinweis}</Meldung>
              <Meldung art="fehler" id={idFehler}>{fehler}</Meldung>
              <div className="auth-admin-feld">
                <label className="auth-admin-label" htmlFor={idEmail}>{T.email}</label>
                <div className="auth-admin-eingabe">
                  <span className="auth-admin-eingabe-ico"><Icon n="mail" s={18} /></span>
                  <input
                    id={idEmail}
                    ref={emailRef}
                    className="auth-admin-input"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-describedby={fehler ? idFehler : undefined}
                  />
                </div>
              </div>
              <div className="auth-admin-feld">
                <label className="auth-admin-label" htmlFor={idPasswort}>{T.passwort}</label>
                <PasswortEingabe id={idPasswort} wert={passwort} onWert={setPasswort} autoComplete="current-password"
                  beschreibung={fehler ? idFehler : undefined} feldRef={passwortRef} />
                <div className="auth-admin-vergessen">
                  <button type="button" className="auth-admin-link" onClick={() => { setFehler(""); setHinweis(""); setVergessenEmail(email.trim()); setVergessenGesendet(false); setSchritt("vergessen"); }}>
                    {T.vergessen}
                  </button>
                </div>
              </div>
              {knopf(T.anmelden, T.anmeldenLaeuft)}
            </form>
          )}

          {schritt === "vergessen" && (
            <form className="auth-admin-formular" onSubmit={vergessenSenden} noValidate>
              <h2 className="auth-admin-schritt">{T.vergessenTitel}</h2>
              {!vergessenGesendet && <p className="auth-admin-text">{T.vergessenText}</p>}
              <Meldung art="fehler" id={idFehler}>{fehler}</Meldung>
              {vergessenGesendet ? (
                <Meldung art="erfolg">{ADMIN_VERGESSEN_ERFOLG}</Meldung>
              ) : (
                <>
                  <div className="auth-admin-feld">
                    <label className="auth-admin-label" htmlFor={`${uid}-vergessen`}>{T.email}</label>
                    <div className="auth-admin-eingabe">
                      <span className="auth-admin-eingabe-ico"><Icon n="mail" s={18} /></span>
                      <input
                        id={`${uid}-vergessen`}
                        ref={vergessenRef}
                        className="auth-admin-input"
                        type="email"
                        inputMode="email"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={254}
                        value={vergessenEmail}
                        onChange={(e) => setVergessenEmail(e.target.value)}
                        aria-describedby={fehler ? idFehler : undefined}
                      />
                    </div>
                  </div>
                  {knopf(T.vergessenSenden, T.vergessenSendenLaeuft)}
                </>
              )}
              <button type="button" className="auth-admin-zurueck" onClick={zurAnmeldung}>
                <Icon n="chevronLeft" s={16} />
                <span>{T.zurueck}</span>
              </button>
            </form>
          )}

          {schritt === "reset" && (
            <form className="auth-admin-formular" onSubmit={passwortSpeichern} noValidate>
              <h2 className="auth-admin-schritt">{T.neuesPasswortTitel}</h2>
              {linkZustand === "pruefen" && <p className="auth-admin-text" role="status">{T.linkPruefen}</p>}
              <Meldung art="fehler" id={idFehler}>{fehler}</Meldung>
              {linkZustand === "netzfehler" && (
                <button type="button" className="auth-admin-zurueck" onClick={linkPruefen}>
                  <span>{T.linkErneutPruefen}</span>
                </button>
              )}
              {linkZustand === "gueltig" && (
                <>
                  <p className="auth-admin-text" id={`${uid}-regel`}>{T.neuesPasswortText}</p>
                  <div className="auth-admin-feld">
                    <label className="auth-admin-label" htmlFor={`${uid}-neu`}>{T.neuesPasswort}</label>
                    <PasswortEingabe id={`${uid}-neu`} wert={neu} onWert={setNeu} autoComplete="new-password"
                      beschreibung={`${uid}-regel`} feldRef={neuRef} />
                  </div>
                  <div className="auth-admin-feld">
                    <label className="auth-admin-label" htmlFor={`${uid}-neu-wdh`}>{T.neuesPasswortWdh}</label>
                    <PasswortEingabe id={`${uid}-neu-wdh`} wert={neuWdh} onWert={setNeuWdh} autoComplete="new-password"
                      ungueltig={neuWdh !== "" && neu !== neuWdh} />
                  </div>
                  {knopf(T.speichern, T.speichernLaeuft)}
                </>
              )}
              <button type="button" className="auth-admin-zurueck" onClick={zurAnmeldung}>
                <Icon n="chevronLeft" s={16} />
                <span>{T.zurueck}</span>
              </button>
            </form>
          )}
        </section>
      </main>
      <nav className="auth-admin-recht" aria-label={T.recht}>
        <Link to="/impressum" target="_blank" rel="noopener noreferrer">Impressum</Link>
        <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</Link>
      </nav>
    </div>
  );
}
