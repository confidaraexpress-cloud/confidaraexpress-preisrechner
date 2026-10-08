import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthAurora } from "../components/auth/AuthAurora";
import { BrandLogo } from "../components/ui/BrandLogo";
import { Icon } from "../components/ui/Icon";
import { PasswordField } from "../components/ui/PasswordField";
import { loadSalesPartnerPublicConfig, registerSalesPartner } from "../api/partnerApi";
import { FAIL_CLOSED_PUBLIC_CONFIG, partnerRegistrationMode } from "../utils/salesPartnerPublicConfig.mjs";
import { clearReferral, referralCodeFor } from "../utils/referralCapture.mjs";
import { mapAuthThrownError } from "../utils/authErrors.mjs";
import { PASSWORD_MIN_LEN } from "../utils/passwordPolicy.mjs";
import {
  PARTNER_REG_TEXTS,
  buildPartnerRegistrationPayload,
  getPartnerRegErrors,
  mapPartnerRegistrationError,
} from "../utils/registrationValidation.mjs";

// Pflichtfeld-Markierung wie im Kundenformular: rein visuell, die Pflicht
// steht semantisch an required/aria-required des Feldes.
const Req = () => <span className="auth-req" aria-hidden="true">*</span>;

const LEER = { name: "", email: "", password: "", companyName: "", phone: "", agreementAccepted: false };

// Fehlerschlüssel → Eingabe, in Formularreihenfolge (UX-Paket 6). Nach einem
// abgewiesenen Absenden — eigene Prüfung oder Feldfehler des Servers — springt
// der Fokus auf das erste markierte Feld; die Meldung hängt dort per
// aria-describedby (`<id>-error`).
const FELDER = [
  ["name", "sp-name"], ["email", "sp-email"], ["password", "sp-password"], ["passwordRepeat", "sp-password-repeat"],
  ["companyName", "sp-company"], ["phone", "sp-phone"], ["agreement", "sp-agreement"],
];
function fokussiereErstenFehler(errors) {
  const treffer = FELDER.find(([k]) => errors && errors[k]);
  // Nach dem nächsten Rendern: erst dann steht die Meldung am Feld.
  if (treffer) setTimeout(() => document.getElementById(treffer[1])?.focus(), 0);
}

/* Die Leselinks unter dem Formular nehmen dem Feld beim Drücken nicht den
   Fokus. Sonst meldete das (automatisch fokussierte, noch leere) Namensfeld
   beim Verlassen seinen Fehler, die neue Zeile schöbe den Link zwischen
   Drücken und Loslassen nach unten, und der erste Klick auf „Vertriebspartner-
   vereinbarung lesen" ginge ins Leere (im Browser gemessen). Tastatur und
   Screenreader sind davon unberührt; der Link öffnet unverändert im neuen Tab.
   UX-Paket 6: dasselbe gilt für „Antrag stellen" — seit der Knopf nicht mehr
   gesperrt ist, verschob die Meldung des verlassenen Felds ihn sonst zwischen
   Drücken und Loslassen, und der erste Klick ging verloren (bei 768 px im
   Browser gemessen). Den Fokus setzt danach das Absenden selbst. */
const fokusBehalten = (e) => e.preventDefault();

/* ── Öffentliche Registrierung für Vertriebspartner (/partner-registrieren) ──
   Ein EIGENER Flow, nicht die Kundenregistrierung: eigene Felder, eigener
   Endpunkt (POST /api/sales-partner/register), kein Login danach — der Antrag
   wird erst geprüft.

   Fail-closed: das Formular erscheint nur, wenn die öffentliche Konfiguration
   geladen ist, die Registrierung ausdrücklich geöffnet ist und genau die
   registrierte Fassung der Vereinbarung nennt (partnerRegistrationOpen). Der
   Link „Vertriebspartnervereinbarung lesen" führt auf die eigene Seite
   /partnervereinbarung (neuer Tab), die ausschließlich das registrierte
   Dokument verlinkt — kein erfundener Rechtstext, kein geratener Ort; die
   Zustimmung nennt die Fassung. Ein Partnercode aus /partner-registrieren?ref=…
   geht als sponsorCode mit (nur die Art „partner"); die Antwort verrät nie, ob
   er gültig war. Darstellung in der bestehenden Auth-Welt, ohne neue Regeln.

   Pre-Live-Testweg (registrationMode "prelive_test", nur solange die
   produktive Registrierung aus ist): DASSELBE Formular mit denselben Feldern
   und Regeln; einziger sichtbarer Unterschied ist der Testhinweis an der
   Stelle der Vertragsannahme. Es wird keine Fassung gesendet und keine
   Zustimmung vorgetäuscht — Testantrag ist der Antrag allein nach dem Urteil
   des Servers.

   UX-Paket 6: Pflichtfelder sind erklärt, der Knopf „Antrag stellen" ist nie
   ohne Begründung gesperrt — wer unvollständig absendet, sieht jeden Fehler am
   Feld, darüber einen Sammelhinweis, und der Fokus steht im ersten markierten
   Feld (gesendet wird dann nichts). Der Erfolg nennt den nächsten Schritt und
   bietet keine Anmeldung an: vor der Freigabe ist keine möglich. */
export default function PartnerRegisterPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState({ loading: true, ok: false, data: FAIL_CLOSED_PUBLIC_CONFIG });
  const [form, setForm] = useState(LEER);
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [errors, setErrors] = useState({});
  // Felder, die der Nutzer schon verlassen hat: dort erscheint der Fehler der
  // zentralen Prüfung sofort — sonst bliebe ein gesperrter Knopf unerklärt.
  const [touched, setTouched] = useState({});
  const [generalError, setGeneralError] = useState("");
  // Sammelhinweis nach einem abgewiesenen Absenden — steht, bis alles passt.
  const [pruefHinweis, setPruefHinweis] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverClosed, setServerClosed] = useState(false);
  const [done, setDone] = useState(false);

  const ladeKonfiguration = useCallback(async () => {
    setConfig((c) => ({ ...c, loading: true }));
    const ergebnis = await loadSalesPartnerPublicConfig();
    setConfig({ loading: false, ok: ergebnis.ok, data: ergebnis.config });
  }, []);

  useEffect(() => { ladeKonfiguration(); }, [ladeKonfiguration]);

  const modus = config.ok && !serverClosed ? partnerRegistrationMode(config.data) : "closed";
  const offen = modus !== "closed";
  const testweg = modus === "prelive_test";
  const regelOptionen = { requireAgreement: !testweg };
  const liveErrors = getPartnerRegErrors(form, passwordRepeat, regelOptionen);
  const valid = Object.keys(liveErrors).length === 0;
  // Sichtbar: ein Serverfehler bzw. Fehler des letzten Absendens, sonst der
  // Prüfbefund eines bereits verlassenen Feldes.
  const fehlerVon = (k) => errors[k] || (touched[k] ? liveErrors[k] : undefined);
  // Verweis eines Felds auf seine sichtbare Meldung (sonst nichts).
  const fehlerVerweis = (k, id) => (fehlerVon(k) ? `${id}-error` : undefined);
  const verlassen = (k) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  const setFeld = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      if (!e[k]) return e;
      const n = { ...e };
      delete n[k];
      return n;
    });
  };

  // Der Fehler der Zustimmung heißt `agreement`, das Feld `agreementAccepted` —
  // nach einem abgewiesenen Absenden verschwindet die Meldung mit dem Ankreuzen.
  const toggleAgreement = () => {
    setFeld("agreementAccepted", form.agreementAccepted !== true);
    setErrors((e) => {
      if (!e.agreement) return e;
      const n = { ...e };
      delete n.agreement;
      return n;
    });
  };

  const submit = async () => {
    if (submitting) return;
    const errs = getPartnerRegErrors(form, passwordRepeat, regelOptionen);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setGeneralError("");
      setPruefHinweis(true);
      fokussiereErstenFehler(errs);
      return;
    }
    setErrors({});
    setGeneralError("");
    setPruefHinweis(false);
    setSubmitting(true);
    try {
      const r = await registerSalesPartner(buildPartnerRegistrationPayload(form, {
        sponsorCode: referralCodeFor("partner"),
        agreementVersion: testweg ? null : config.data.agreementVersion,
      }));
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        const fehler = mapPartnerRegistrationError(r.status, d);
        if (fehler.disabled) setServerClosed(true);
        setErrors(fehler.fieldErrors);
        setGeneralError(fehler.generalError);
        fokussiereErstenFehler(fehler.fieldErrors);
        return;
      }
      clearReferral("partner");
      setDone(true);
    } catch (e) {
      setGeneralError(mapAuthThrownError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const zurAnmeldung = () => navigate("/login");

  // Zustandskarte (Laden, nicht erreichbar, geschlossen, Erfolg) — dieselbe
  // Kartenform wie die übrigen Auth-Zustände. `darunter`: eine Aktion oder
  // (beim Erfolg) der nächste Schritt.
  const zustand = (icon, titel, text, darunter, role = "status") => (
    <div className="auth-card auth-anim delay-3" id="sp-state">
      <div className="auth-card-top">
        <div className="auth-card-icon" aria-hidden="true">
          {icon ? <Icon n={icon} s={40} /> : <span className="spinner" />}
        </div>
        <h2 className="auth-card-title">{titel}</h2>
        <p className="auth-card-desc" role={role}>{text}</p>
      </div>
      {darunter}
    </div>
  );

  const anmeldeKnopf = (
    <button type="button" className="auth-cta" onClick={zurAnmeldung}>
      <span>Zur Anmeldung</span>
      <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
    </button>
  );

  let inhalt;
  if (config.loading) {
    inhalt = zustand(null, "Einen Moment bitte", "Die Partnerregistrierung wird geladen …");
  } else if (!config.ok) {
    inhalt = zustand("info", "Registrierung derzeit nicht erreichbar",
      "Die Angaben zur Partnerregistrierung konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
      (
        <button type="button" className="auth-cta" onClick={ladeKonfiguration}>
          <span>Erneut versuchen</span>
          <span className="auth-cta-arrow"><Icon n="refresh" s={18} /></span>
        </button>
      ), "alert");
  } else if (done) {
    // Kein Anmeldeknopf: vor der Freigabe ist keine Anmeldung möglich.
    inhalt = zustand("check", "Antrag eingegangen", PARTNER_REG_TEXTS.success, (
      <div className="auth-card-next" id="sp-next">
        <p>{PARTNER_REG_TEXTS.successNext}</p>
        {!testweg && <p>{PARTNER_REG_TEXTS.successMail}</p>}
      </div>
    ));
  } else if (!offen) {
    inhalt = zustand("info", "Partnerregistrierung", PARTNER_REG_TEXTS.disabled, anmeldeKnopf);
  } else {
    inhalt = (
      <div className="auth-card auth-anim delay-3">
        {generalError && <div className="auth-alert auth-alert-error" role="alert">{generalError}</div>}
        {!generalError && pruefHinweis && !valid && (
          <div className="auth-alert auth-alert-error" role="alert" id="sp-check">{PARTNER_REG_TEXTS.checkMarked}</div>
        )}
        <form noValidate id="sp-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <p className="auth-required-hint" id="sp-required-hint">{PARTNER_REG_TEXTS.requiredHint}</p>
          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label" htmlFor="sp-name">Name <Req /></label>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-ico"><Icon n="user" s={18} /></span>
              <input
                id="sp-name"
                className={`auth-input${fehlerVon("name") ? " auth-input-error" : ""}`}
                value={form.name}
                onChange={(e) => setFeld("name", e.target.value)}
                onBlur={() => verlassen("name")}
                autoComplete="name"
                required
                aria-required="true"
                aria-invalid={fehlerVon("name") ? "true" : undefined}
                aria-describedby={fehlerVerweis("name", "sp-name")}
                autoFocus
              />
            </div>
            {fehlerVon("name") && <span className="auth-field-error" id="sp-name-error">{fehlerVon("name")}</span>}
          </div>

          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label" htmlFor="sp-email">E-Mail <Req /></label>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-ico"><Icon n="mail" s={18} /></span>
              <input
                id="sp-email"
                className={`auth-input${fehlerVon("email") ? " auth-input-error" : ""}`}
                type="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => setFeld("email", e.target.value)}
                onBlur={() => verlassen("email")}
                autoComplete="email"
                required
                aria-required="true"
                aria-invalid={fehlerVon("email") ? "true" : undefined}
                aria-describedby={fehlerVerweis("email", "sp-email")}
              />
            </div>
            {fehlerVon("email") && <span className="auth-field-error" id="sp-email-error">{fehlerVon("email")}</span>}
          </div>

          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label" htmlFor="sp-password">Passwort (min. {PASSWORD_MIN_LEN} Zeichen) <Req /></label>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
              <PasswordField
                slim
                id="sp-password"
                value={form.password}
                onChange={(e) => setFeld("password", e.target.value)}
                onBlur={() => verlassen("password")}
                placeholder={`Mind. ${PASSWORD_MIN_LEN} Zeichen`}
                autoComplete="new-password"
                required
                invalid={!!fehlerVon("password")}
                describedBy={fehlerVerweis("password", "sp-password")}
              />
            </div>
            {fehlerVon("password") && <span className="auth-field-error" id="sp-password-error">{fehlerVon("password")}</span>}
          </div>

          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label" htmlFor="sp-password-repeat">Passwort wiederholen <Req /></label>
            </div>
            <div className="auth-input-wrap">
              <span className="auth-input-ico"><Icon n="lock" s={18} /></span>
              <PasswordField
                slim
                id="sp-password-repeat"
                value={passwordRepeat}
                onChange={(e) => { setPasswordRepeat(e.target.value); setErrors((x) => { const n = { ...x }; delete n.passwordRepeat; return n; }); }}
                onBlur={() => verlassen("passwordRepeat")}
                placeholder="Passwort erneut eingeben"
                autoComplete="new-password"
                required
                invalid={!!fehlerVon("passwordRepeat")}
                describedBy={fehlerVerweis("passwordRepeat", "sp-password-repeat")}
              />
            </div>
            {fehlerVon("passwordRepeat") && (
              <span className="auth-field-error" id="sp-password-repeat-error">{fehlerVon("passwordRepeat")}</span>
            )}
          </div>

          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label" htmlFor="sp-company">Firma <span className="auth-optional">(optional)</span></label>
            </div>
            <div className="auth-input-wrap">
              <input
                id="sp-company"
                className={`auth-input auth-input-no-icon${fehlerVon("companyName") ? " auth-input-error" : ""}`}
                value={form.companyName}
                onChange={(e) => setFeld("companyName", e.target.value)}
                onBlur={() => verlassen("companyName")}
                autoComplete="organization"
                aria-invalid={fehlerVon("companyName") ? "true" : undefined}
                aria-describedby={fehlerVerweis("companyName", "sp-company")}
              />
            </div>
            {fehlerVon("companyName") && <span className="auth-field-error" id="sp-company-error">{fehlerVon("companyName")}</span>}
          </div>

          <div className="auth-field">
            <div className="auth-field-row">
              <label className="auth-field-label" htmlFor="sp-phone">Telefon <span className="auth-optional">(optional)</span></label>
            </div>
            <div className="auth-input-wrap">
              <input
                id="sp-phone"
                className={`auth-input auth-input-no-icon${fehlerVon("phone") ? " auth-input-error" : ""}`}
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setFeld("phone", e.target.value)}
                onBlur={() => verlassen("phone")}
                autoComplete="tel"
                aria-invalid={fehlerVon("phone") ? "true" : undefined}
                aria-describedby={fehlerVerweis("phone", "sp-phone")}
              />
            </div>
            {fehlerVon("phone") && <span className="auth-field-error" id="sp-phone-error">{fehlerVon("phone")}</span>}
          </div>

          {testweg ? (
            <div className="auth-alert auth-alert-info" id="sp-prelive-notice" role="note">
              {PARTNER_REG_TEXTS.preliveNotice}
            </div>
          ) : (<>
            <div className="auth-row">
              <div
                id="sp-agreement"
                className={`auth-check ${form.agreementAccepted ? "checked" : ""}`}
                onClick={() => { verlassen("agreement"); toggleAgreement(); }}
                role="checkbox"
                aria-checked={form.agreementAccepted === true}
                aria-required="true"
                aria-invalid={fehlerVon("agreement") ? "true" : undefined}
                aria-describedby={fehlerVerweis("agreement", "sp-agreement")}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); verlassen("agreement"); toggleAgreement(); } }}
              >
                <span className="auth-checkbox" />
                <span>
                  Ich akzeptiere die Vertriebspartnervereinbarung in der Fassung {config.data.agreementVersion}. <Req />
                </span>
              </div>
            </div>
            {fehlerVon("agreement") && <span className="auth-field-error" id="sp-agreement-error">{fehlerVon("agreement")}</span>}
          </>)}

          {/* Nie ohne Begründung gesperrt: ein unvollständiger Antrag zeigt beim
              Absenden seine Fehler (UX-Paket 6). Gesperrt nur während des Sendens. */}
          <button type="submit" id="sp-submit" className="auth-cta" disabled={submitting} onMouseDown={fokusBehalten}>
            <span>{submitting ? "Wird gesendet…" : "Antrag stellen"}</span>
            <span className="auth-cta-arrow"><Icon n="arrowRight" s={18} /></span>
          </button>

          <p className="auth-form-legal">
            {!testweg && (<>
              <Link to="/partnervereinbarung" target="_blank" rel="noopener noreferrer" id="sp-agreement-link"
                onMouseDown={fokusBehalten}>
                Vertriebspartnervereinbarung lesen
              </Link>
              {" · "}
            </>)}
            <Link to="/datenschutz" target="_blank" rel="noopener noreferrer" onMouseDown={fokusBehalten}>Datenschutzerklärung</Link>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <AuthAurora />
      <div className="auth-shell">
        <div className="auth-hero">
          <BrandLogo variant="lockup" tone="reverse" className="auth-brand auth-anim" />
          <h1 className="auth-title auth-anim delay-1">Vertriebspartner werden</h1>
          <p className="auth-sub-2 auth-anim delay-2">
            Registrieren Sie sich als Vertriebspartner von ConfidaraExpress. Ihr Antrag wird vor der Freischaltung geprüft.
          </p>
        </div>

        {inhalt}

        <nav className="auth-legal" aria-label="Rechtliche Informationen">
          <Link to="/impressum"   target="_blank" rel="noopener noreferrer">Impressum</Link>
          <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</Link>
          <Link to="/agb"         target="_blank" rel="noopener noreferrer">AGB</Link>
          <Link to="/widerruf"    target="_blank" rel="noopener noreferrer">Widerruf</Link>
        </nav>
      </div>
    </div>
  );
}
