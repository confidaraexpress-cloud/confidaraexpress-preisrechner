import React from "react";
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
    </div>
  );
}

export default PartnerAccountPanel;
