import React from "react";
import { SettingsSection } from "../dashboard/ProfileCardHead";
import { EmailChangeSection } from "../dashboard/EmailChangeSection";
import { PasswordChangeSection } from "../dashboard/PasswordChangeSection";
import { PROFILE_TEXT } from "../../utils/profileView.mjs";
import { partnerAccountRows, partnerLoginEmailRow } from "../../utils/salesPartnerView.mjs";

// Datenzeilen im Muster der Kontoeinstellungen (.profile-row).
function Rows({ items }) {
  return items.map((it, i) => (
    <div key={it.key} className={`profile-row${i < items.length - 1 ? " profile-row-border" : ""}`}>
      <span className="profile-row-key">{it.k}</span>
      <span className={`profile-row-val${it.empty ? " profile-row-empty" : ""}`}>{it.v}</span>
    </div>
  ));
}

/* ── Partnerportal · Konto ───────────────────────────────────────────────────
   Dieselben Abschnitte und dieselben Bausteine wie die Kontoeinstellungen des
   Kundenbereichs — ohne Kundenfunktionen:
     • Kontodaten nur lesend (Name, Firma; keine Profilbearbeitung),
     • Login-E-Mail mit der unveränderten EmailChangeSection,
     • Passwortänderung über PasswordChangeSection.
   Der Backendvertrag gibt genau diese Endpunkte für Vertriebspartner frei
   (PATCH /kunde/password, E-Mail-Änderung, GET /kundenbereich); jede andere
   Kundenroute antwortet einem Partner mit 403 und wird hier nie aufgerufen. */
export function PartnerAccountPanel({ user }) {
  return (
    <div className="profile-sections" id="spp-account">
      <SettingsSection title="Kontodaten" subtitle="Ihre Angaben als Vertriebspartner">
        <div className="profile-section-body">
          <Rows items={partnerAccountRows(user)} />
        </div>
      </SettingsSection>

      <SettingsSection title="Sicherheit" subtitle="Schützen Sie Ihr Konto">
        <div className="profile-section-body">
          <Rows items={[partnerLoginEmailRow(user)]} />
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
