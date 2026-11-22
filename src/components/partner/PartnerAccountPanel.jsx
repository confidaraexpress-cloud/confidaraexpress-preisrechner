import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { SitzungenKarte } from "../sicherheit/SitzungenKarte";
import { PARTNER_LOGIN_PATH } from "../../utils/partnerAnmeldung.mjs";
import { SettingsSection } from "../dashboard/ProfileCardHead";
import { EmailChangeSection } from "../dashboard/EmailChangeSection";
import { PasswordChangeSection } from "../dashboard/PasswordChangeSection";
import { PartnerRows } from "./PartnerRows";
import { PartnerBillingDetailsSection } from "./PartnerBillingDetailsSection";
import { PartnerAgreementSection } from "./PartnerAgreementSection";
import { PROFILE_TEXT } from "../../utils/profileView.mjs";
import { partnerAccountRows, partnerLoginEmailRow } from "../../utils/salesPartnerView.mjs";

/* ── Partnerportal · Konto ───────────────────────────────────────────────────
   Dieselben Abschnitte und dieselben Bausteine wie die Kontoeinstellungen des
   Kundenbereichs — ohne Kundenfunktionen. UX-Paket 6: die Abrechnungsdaten
   stehen zuerst (ohne sie entsteht keine Gutschrift; „Gutschriften" verweist
   hierher), danach in eigenen Gruppen Vereinbarung, Kontodaten und Sicherheit:
     • Abrechnungsdaten für die Gutschriften (eigener Partnerendpunkt, eigene
       Abschnittskomponente; Steuer- und Bankdaten stehen nur dort, die IBAN
       nur maskiert),
     • Vereinbarung: die akzeptierte Fassung der Vertriebspartnervereinbarung,
     • Kontodaten nur lesend (Name, Firma; keine Profilbearbeitung),
     • Sicherheit: Login-E-Mail mit der unveränderten EmailChangeSection und die
       Passwortänderung über PasswordChangeSection.
   Der Backendvertrag gibt genau diese Endpunkte für Vertriebspartner frei
   (PATCH /kunde/password, E-Mail-Änderung, GET /kundenbereich und die
   /api/sales-partner/me/*-Endpunkte); jede andere Kundenroute antwortet einem
   Partner mit 403 und wird hier nie aufgerufen. */
export function PartnerAccountPanel({ user }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="profile-sections" id="spp-account">
      <PartnerBillingDetailsSection />

      <PartnerAgreementSection />

      <SettingsSection title="Kontodaten" subtitle="Ihre Angaben als Vertriebspartner">
        <div className="profile-section-body">
          <PartnerRows items={partnerAccountRows(user)} />
        </div>
      </SettingsSection>

      <SettingsSection title="Sicherheit" subtitle="Schützen Sie Ihr Konto">
        <div className="profile-section-body">
          <PartnerRows items={[partnerLoginEmailRow(user)]} />
          <EmailChangeSection user={user} />
          <div className="profile-hint">
            <div className="profile-hint-text"><p>{PROFILE_TEXT.securityHint}</p></div>
          </div>
        </div>

        <PasswordChangeSection />
      </SettingsSection>

      {/* Angemeldete Geräte und „Auf allen Geräten abmelden“ (Betreiberauftrag 2026-11-22, D7): dieselbe Karte wie im
          Adminbereich, mit dem Weg eines Partners bei Verlust — erst Passwort ändern, dann überall abmelden. */}
      <SitzungenKarte anmeldePfad={PARTNER_LOGIN_PATH} klasse="spp-geraete" verlorenText={VERLOREN_PARTNER} />

      {/* Am Telefon steht „Abmelden“ hier (am Desktop zusätzlich im Fuß der Seitenleiste; partner.css). */}
      <div className="spp-konto-abmelden">
        <button type="button" className="btn btn-outline" id="spp-logout-konto"
          onClick={() => { logout(); navigate(PARTNER_LOGIN_PATH); }}>
          Abmelden
        </button>
      </div>
    </div>
  );
}

const VERLOREN_PARTNER = "Ändern Sie zuerst oben Ihr Passwort und melden Sie sich danach auf allen Geräten ab.";

export default PartnerAccountPanel;
