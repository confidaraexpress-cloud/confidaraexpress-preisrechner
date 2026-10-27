// Öffentliche Kundenbereich-Demo: MUSS der erste Import bleiben. Unter /demo schirmt er Speicher und Netz ab, bevor
// irgendein anderes Modul sie berührt (demo/demoStart.mjs); sonst tut er nichts.
import { DEMO_ZUSTAND } from "./demo/demoStart.mjs";
import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/index.css";
import { AuthProvider } from "./context/AuthContext";
import { ContentErrorBoundary } from "./components/common/ContentErrorBoundary";
import { startPwaInstallCapture } from "./utils/pwaInstallPrompt";
import { registerServiceWorker } from "./utils/serviceWorkerRegistration";
import { startReferralCapture } from "./utils/referralCapture.mjs";
import { captureHandoffFromLocation } from "./utils/publicQuoteHandoffStore.mjs";
import { loadSalesPartnerPublicConfig } from "./api/partnerApi";
import App from "./App";
import { LoadingScreen } from "./components/common/LoadingScreen";
import { AuthSeite, EmailBestaetigungSeite } from "./pages/authSeite";
import { istKundenAuthPfad } from "./utils/kundenAuthPfad.mjs";

// Die Demo lädt ihren eigenen Teil nur unter /demo (eigener Chunk, keine Last für den Kundenbereich).
const DemoApp = React.lazy(() => import("./demo/DemoApp.jsx"));

/* Unter /demo, falls der Browser den Speicher nicht abschirmen lässt: ein ruhiger Hinweis statt einer Demo, die in
   die echte Sitzung schreiben könnte. */
function DemoNichtVerfuegbar() {
  return (
    <main className="demo-ende" aria-labelledby="demo-aus-titel">
      <div className="demo-ende-blatt">
        <h1 className="demo-ende-titel" id="demo-aus-titel">Die Demo ist in diesem Browser nicht verfügbar</h1>
        <p className="demo-ende-text">Bitte öffnen Sie sie in einem aktuellen Browser oder registrieren Sie direkt ein Geschäftskonto.</p>
        <div className="demo-ende-aktionen">
          <a className="btn btn-primary btn-lg" href="/register">Geschäftskonto registrieren</a>
          <a className="btn btn-outline btn-lg" href="https://preisrechner.confidaraexpress.de/">Zum Preisrechner</a>
        </div>
      </div>
    </main>
  );
}

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
if (!DEMO_ZUSTAND.aktiv) startReferralCapture({ loadConfig: loadSalesPartnerPublicConfig });

/* Öffentlicher Preisrechner: die Tarifwahl kommt als Übergabetoken im Fragment von
   /preisrechner-uebernahme. Es wird HIER gelesen — vor dem ersten Rendern, damit es weder der
   Router noch die Anmeldung verliert —, verschwindet sofort aus der Adresse und liegt danach
   nur im Modulspeicher (utils/publicQuoteHandoffStore.mjs), nie im Storage. */
if (!DEMO_ZUSTAND.aktiv) captureHandoffFromLocation();

/* Die äußerste Fehlergrenze. Sie liegt bewusst ÜBER Router und AuthProvider:
   die Bereichsgrenzen weiter innen hängen selbst am Router und können einen
   Fehler im Router, im AuthProvider oder in App selbst gar nicht sehen. Genau
   dort entstünde sonst der weiße Bildschirm, gegen den das ganze Muster
   gebaut ist.

   Sie ist die LETZTE Auffanglinie, nicht die erste: alles, was hier ankommt,
   hat schon eine Bereichsgrenze passiert (oder lag außerhalb aller). Unter /demo umschließt sie die Demo-Welt
   (eigener Router mit der Basis /demo, demo/DemoApp.jsx). */
function starten() {
createRoot(document.getElementById("root")).render(
  <ContentErrorBoundary bereich="wurzel">
    {DEMO_ZUSTAND.aktiv ? (
      <Suspense fallback={<LoadingScreen />}>
        {DEMO_ZUSTAND.abgeschirmt ? <DemoApp /> : <DemoNichtVerfuegbar />}
      </Suspense>
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    )}
  </ContentErrorBoundary>
);
}

/* Kunden-Anmeldung (Abschnitt 5, 2026-10-27): auf /login und /register steht das statische Seitengerüst schon im
   Bild (login.html, register.html). Damit React es OHNE Zwischenbild ersetzt, wird die Seite vor dem ersten Rendern
   geladen — sonst legte der Seitenwechsel seine Ladefläche zwischen Gerüst und Seite. Schlägt das Laden fehl, rendert
   die Anwendung trotzdem; die Fehlergrenze des Bereichs übernimmt. Alle anderen Pfade rendern sofort. */
const pfad = window.location.pathname;
if (!DEMO_ZUSTAND.aktiv && istKundenAuthPfad(pfad)) {
  const seite = pfad.startsWith("/confirm-email-change") ? EmailBestaetigungSeite : AuthSeite;
  seite.vorladen().then(starten, starten);
} else {
  starten();
}
