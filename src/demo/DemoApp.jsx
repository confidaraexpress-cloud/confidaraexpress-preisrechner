import React, { Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { ShippingFlowProvider } from "../context/ShippingFlowContext";
import { ParcelShopFinderProvider } from "../context/ParcelShopFinderContext";
import { ContentErrorBoundary } from "../components/common/ContentErrorBoundary";
import { LoadingScreen } from "../components/common/LoadingScreen";
import { ScrollToTop } from "../components/common/ScrollToTop";
import { ProtectedRoute } from "../routes/ProtectedRoute";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { BrandLogo } from "../components/ui/BrandLogo";
import { DEMO_BASIS, DEMO_TEXTE, DEMO_ZIELE, demoAusgangsziel } from "./demoModus.mjs";
import { DemoLeiste } from "./DemoLeiste.jsx";

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Die öffentliche Kundenbereich-Demo (Premium-Redesign, Betreiberentscheidung 2026-10-27).

   Dieselben Seiten wie der echte Kundenbereich — Übersicht, Neue Sendung, Versandkostenrechner,
   Buchung, Sendungen, Rechnungen, Adressbuch, Lager und Aufträge, Konto, Support — unter /demo,
   mit den Beispieldaten aus demoBackend.mjs. Die Routen entsprechen genau den Kundenrouten von
   App.jsx (demoRouten.test.mjs gleicht sie ab). Alles andere (Anmeldung, Rechtsseiten, Admin,
   Partner) gehört nicht zur Demo: Abmelden beendet die Demo, eine Rechtsseite öffnet die echte
   Seite mit einer neuen Seitenladung — die Demo-Welt endet damit vollständig.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

const CalculatorPage    = React.lazy(() => import("../pages/CalculatorPage"));
const BookingPage       = React.lazy(() => import("../pages/BookingPage"));
const DashboardPage     = React.lazy(() => import("../pages/DashboardPage"));
const ProductDetailPage = React.lazy(() => import("../pages/inventory/ProductDetailPage"));
const OrderDetailPage   = React.lazy(() => import("../pages/inventory/OrderDetailPage"));

/** Adressen außerhalb des Kundenbereichs: die echte Seite derselben Domain, in einer neuen Seitenladung. */
function DemoVerlassen() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    window.location.replace(demoAusgangsziel(pathname, search, hash, window.location.origin));
  }, [pathname, search, hash]);
  return <LoadingScreen />;
}

/** Nach „Abmelden": die Demo ist beendet — neu starten, registrieren oder zurück zum Preisrechner. */
function DemoEnde() {
  return (
    <main className="demo-ende" aria-labelledby="demo-ende-titel">
      <div className="demo-ende-blatt">
        <BrandLogo variant="lockup" tone="standard" className="demo-ende-marke" />
        <h1 className="demo-ende-titel" id="demo-ende-titel">Die Demo ist beendet</h1>
        <p className="demo-ende-text">
          Alles, was Sie ausprobiert haben, war simuliert und ist jetzt verworfen. Mit einem freigeschalteten
          Geschäftskonto buchen Sie echte Sendungen im selben Kundenbereich.
        </p>
        <div className="demo-ende-aktionen">
          <a className="btn btn-primary btn-lg" href={DEMO_ZIELE.registrieren}>{DEMO_TEXTE.registrieren}</a>
          <a className="btn btn-outline btn-lg" href={DEMO_BASIS}>Demo neu starten</a>
          <a className="btn btn-ghost btn-lg" href={DEMO_ZIELE.preisrechner}>Zum Preisrechner</a>
        </div>
      </div>
    </main>
  );
}

/** Seitentitel und Kennzeichnung der Demo-Welt am Dokument. */
function useDemoDokument() {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-ce-demo", "");
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    const titel = document.title;
    document.title = `Demo · ${titel}`;
    return () => { document.title = titel; robots.remove(); html.removeAttribute("data-ce-demo"); };
  }, []);
}

export default function DemoApp() {
  useDemoDokument();
  return (
    <BrowserRouter basename={DEMO_BASIS}>
      <AuthProvider>
        <ShippingFlowProvider>
          <ParcelShopFinderProvider>
            <Suspense fallback={<LoadingScreen />}>
              <ScrollToTop />
              <Routes>
                <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                  <Route path="/calculator" element={<CalculatorPage />} />
                  <Route path="/booking" element={<BookingPage />} />
                  <Route path="/inventory/products/:id" element={<ProductDetailPage />} />
                  <Route path="/inventory/orders/:id" element={<OrderDetailPage />} />
                </Route>
                <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/login" element={<ContentErrorBoundary bereich="demo"><DemoEnde /></ContentErrorBoundary>} />
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<DemoVerlassen />} />
              </Routes>
            </Suspense>
            <DemoLeiste />
          </ParcelShopFinderProvider>
        </ShippingFlowProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
