import React from "react";
import { APP_ADMIN } from "../utils/appHost.mjs";
import { KundenbereichLink } from "../components/common/KundenbereichLink";

/* Angemeldet, aber mit einem Konto, das in DIESER App keinen Zugang hat (Admin-/Partner-Apps, FE-2).
   Auf der Hauptdomain leiten AdminRoute und PartnerRoute ein solches Konto in den Kundenbereich weiter. In einer App gibt
   es den Kundenbereich nicht: die Hostweiche (App.jsx) brächte es sofort zurück zum Start der App — ein Kreis. Deshalb
   hier ein klarer Hinweis mit zwei Wegen: abmelden (danach die Anmeldung der App) oder den Kundenbereich auf
   confidaraexpress.de öffnen, mit dessen eigener Anmeldung. Selten: eine App meldet nur ihre eigene Rolle an; der Fall
   entsteht etwa, wenn sich die Rolle eines angemeldeten Kontos ändert. */
const TEXT = Object.freeze({
  admin: Object.freeze({
    titel: "Dieses Konto hat keinen Zugang zur Admin-App",
    text: "Sie sind mit einem Konto angemeldet, das kein Adminkonto ist. Melden Sie sich ab und mit Ihrem Adminkonto wieder an.",
  }),
  partner: Object.freeze({
    titel: "Dieses Konto hat keinen Zugang zur Partner-App",
    text: "Sie sind mit einem Konto angemeldet, das kein aktives Partnerkonto ist. Melden Sie sich ab und mit Ihrem Partnerkonto wieder an.",
  }),
});

// Beide Wege in Touch-Höhe (Foundation-Token, wie die übrigen Bedienelemente am Telefon).
const KNOPF = Object.freeze({ minHeight: "var(--ce-size-touch-target)" });

export function AppKontoHinweis({ app, onLogout }) {
  const t = app === APP_ADMIN ? TEXT.admin : TEXT.partner;
  return (
    <main className="app-konto-hinweis" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div role="alert" style={{ maxWidth: 460, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, marginBottom: 10 }}>{t.titel}</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
          {t.text} Ihren Kundenbereich erreichen Sie weiterhin auf confidaraexpress.de.
        </p>
        <button type="button" className="btn btn-primary" style={KNOPF} onClick={onLogout}>Abmelden</button>
        <KundenbereichLink to="/dashboard" className="btn btn-outline" style={{ ...KNOPF, marginLeft: 10 }}>Zum Kundenbereich</KundenbereichLink>
      </div>
    </main>
  );
}
