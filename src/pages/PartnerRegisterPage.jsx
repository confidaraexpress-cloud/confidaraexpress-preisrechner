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

/* Die Leselinks unter dem Formular nehmen dem Feld beim Drücken nicht den
   Fokus. Sonst meldete das (automatisch fokussierte, noch leere) Namensfeld
   beim Verlassen seinen Fehler, die neue Zeile schöbe den Link zwischen
   Drücken und Loslassen nach unten, und der erste Klick auf „Vertriebspartner-
   vereinbarung lesen" ginge ins Leere (im Browser gemessen). Tastatur und
   Screenreader sind davon unberührt; der Link öffnet unverändert im neuen Tab. */
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
   des Servers. */
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

  const toggleAgreement = () => setFeld("agreementAccepted", form.agreementAccepted !== true);

  const submit = async () => {
    if (submitting) return;
    const errs = getPartnerRegErrors(form, passwordRepeat, regelOptionen);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setGeneralError("");
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
  // Kartenform wie die übrigen Auth-Zustände.
  const zustand = (icon, titel, text, aktion, role = "status") => (
    <div className="auth-card auth-anim delay-3" id="sp-state">
      <div className="auth-card-top">
        <div className="auth-card-icon" aria-hidden="true">
          {icon ? <Icon n={icon} s={40} /> : <span className="spinner" />}
        </div>
        <h2 className="auth-card-title">{titel}</h2>
        <p className="auth-card-desc" role={role}>{text}</p>
      </div>
      {aktion}
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
    inhalt = zustand("check", "Antrag eingegangen", PARTNER_REG_TEXTS.success, anmeldeKnopf);
  } else if (!offen) {
    inhalt = zustand("info", "Partnerregistrierung", PARTNER_REG_TEXTS.disabled, anmeldeKnopf);
  } else {
    inhalt = (
      <div className="auth-card auth-anim delay-3">
        {generalError && <div className="auth-alert auth-alert-error" role="alert">{generalError}</div>}
        <form noValidate id="sp-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
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
                autoFocus
              />
            </div>
            {fehlerVon("name") && <span className="auth-field-error">{fehlerVon("name")}</span>}
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
              />
            </div>
            {fehlerVon("email") && <span className="auth-field-error">{fehlerVon("email")}</span>}
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
              />
            </div>
            {fehlerVon("password") && <span className="auth-field-error">{fehlerVon("password")}</span>}
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
              />
            </div>
            {fehlerVon("passwordRepeat") && <span className="auth-field-error">{fehlerVon("passwordRepeat")}</span>}
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
              />
            </div>
            {fehlerVon("companyName") && <span className="auth-field-error">{fehlerVon("companyName")}</span>}
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
              />
            </div>
            {fehlerVon("phone") && <span className="auth-field-error">{fehlerVon("phone")}</span>}
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

          <button type="submit" id="sp-submit" className="auth-cta" disabled={submitting || !valid}>
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
