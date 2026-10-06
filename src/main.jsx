import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/index.css";
import { AuthProvider } from "./context/AuthContext";
import { ContentErrorBoundary } from "./components/common/ContentErrorBoundary";
import { startPwaInstallCapture } from "./utils/pwaInstallPrompt";
import { registerServiceWorker } from "./utils/serviceWorkerRegistration";
import { startReferralCapture } from "./utils/referralCapture.mjs";
import { loadSalesPartnerPublicConfig } from "./api/partnerApi";
import App from "./App";

/* ConfidaraExpress als App: das Installationsereignis des Browsers kann früh
   kommen — lange bevor die Kontoeinstellungen gerendert sind. Es wird deshalb
   hier, vor dem ersten Rendern, abgefangen und aufbewahrt (nie automatisch
   ausgelöst). Der Service Worker liefert ausschließlich die Offline-Seite und
   wird nur im Produktionsbuild registriert. */
startPwaInstallCapture();
registerServiceWorker();

/* Vertriebspartnerprogramm: ein Empfehlungscode aus /register?ref=… bzw.
   /partner-registrieren?ref=… wird HIER gelesen — vor dem ersten Rendern, damit
   ihn weder der Router noch eine Weiterleitung (etwa der zentrale 401-Handler
   bei abgelaufenem Token) verliert. Der Parameter verschwindet sofort aus der
   Adresse; gespeichert wird erst nach ausdrücklicher Freigabe durch die
   öffentliche Konfiguration (utils/referralCapture.mjs). */
startReferralCapture({ loadConfig: loadSalesPartnerPublicConfig });

/* Die äußerste Fehlergrenze. Sie liegt bewusst ÜBER Router und AuthProvider:
   die Bereichsgrenzen weiter innen hängen selbst am Router und können einen
   Fehler im Router, im AuthProvider oder in App selbst gar nicht sehen. Genau
   dort entstünde sonst der weiße Bildschirm, gegen den das ganze Muster
   gebaut ist.

   Sie ist die LETZTE Auffanglinie, nicht die erste: alles, was hier ankommt,
   hat schon eine Bereichsgrenze passiert (oder lag außerhalb aller). */
createRoot(document.getElementById("root")).render(
  <ContentErrorBoundary bereich="wurzel">
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </ContentErrorBoundary>
);
