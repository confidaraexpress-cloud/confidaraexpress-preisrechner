import React, { Suspense } from "react";
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { ContentErrorBoundary } from "./components/common/ContentErrorBoundary";
import { useAuth } from "./context/AuthContext";
import { ShippingFlowProvider } from "./context/ShippingFlowContext";
import { ParcelShopFinderProvider } from "./context/ParcelShopFinderContext";
import { LoadingScreen } from "./components/common/LoadingScreen";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AdminRoute } from "./routes/AdminRoute";
import { NavbarLayout } from "./components/layout/NavbarLayout";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { AdminLayout } from "./components/layout/AdminLayout";

const AuthPage        = React.lazy(() => import("./pages/AuthPage"));
const EmailChangeConfirmPage = React.lazy(() => import("./pages/EmailChangeConfirmPage"));
const CalculatorPage  = React.lazy(() => import("./pages/CalculatorPage"));
const BookingPage     = React.lazy(() => import("./pages/BookingPage"));
const DashboardPage   = React.lazy(() => import("./pages/DashboardPage"));
const TrackingPage    = React.lazy(() => import("./pages/TrackingPage"));
const ImpressumPage   = React.lazy(() => import("./pages/ImpressumPage"));
const DatenschutzPage = React.lazy(() => import("./pages/DatenschutzPage"));
const AGBPage         = React.lazy(() => import("./pages/AGBPage"));
const WiderrufPage    = React.lazy(() => import("./pages/WiderrufPage"));
const InsuranceInfoPage = React.lazy(() => import("./pages/InsuranceInfoPage"));

// Lager & Aufträge: DETAILseiten mit echter Route. Die fünf Listenbereiche
// laufen als page-State in DashboardPage (unverändertes Navigationsmodell);
// eine Entitäts-ID gehört aber nicht in einen page-String — dafür gibt es hier
// zwei echte Routen, genau wie im Adminbereich (/admin/users/:id).
const ProductDetailPage = React.lazy(() => import("./pages/inventory/ProductDetailPage"));
const OrderDetailPage   = React.lazy(() => import("./pages/inventory/OrderDetailPage"));

// Admin (separater, URL-basierter Bereich — hinter AdminRoute-UX-Gate;
// serverseitig zusätzlich durch requireAdmin geschützt).
const AdminOverviewPage  = React.lazy(() => import("./pages/admin/AdminOverviewPage"));
const AuditLogPage       = React.lazy(() => import("./pages/admin/AuditLogPage"));
const AdminShipmentsPage = React.lazy(() => import("./pages/admin/AdminShipmentsPage"));
const AdminShipmentDetailPage = React.lazy(() => import("./pages/admin/AdminShipmentDetailPage"));
const AdminUsersPage = React.lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminUserDetailPage = React.lazy(() => import("./pages/admin/AdminUserDetailPage"));
const AdminInvoicesPage = React.lazy(() => import("./pages/admin/AdminInvoicesPage"));
const AdminBackfillPage = React.lazy(() => import("./pages/admin/AdminBackfillPage"));
const AdminInvoiceDetailPage = React.lazy(() => import("./pages/admin/AdminInvoiceDetailPage"));
const AdminCancellationRequestsPage = React.lazy(() => import("./pages/admin/AdminCancellationRequestsPage"));
const AdminCancellationRequestDetailPage = React.lazy(() => import("./pages/admin/AdminCancellationRequestDetailPage"));
const AdminSupportRequestsPage = React.lazy(() => import("./pages/admin/AdminSupportRequestsPage"));
const AdminSupportRequestDetailPage = React.lazy(() => import("./pages/admin/AdminSupportRequestDetailPage"));

/* Der Auth-Bereich hat als einziger Bereich KEIN Layout — Login, Registrierung
   und die E-Mail-Bestätigung hängen direkt an <Routes>. Damit auch dort ein
   Renderfehler oder ein nicht mehr ladbarer Codeabschnitt keine weiße Seite
   erzeugt, bekommen sie über eine pfadlose Layoutroute ihre eigene Grenze.
   Bewusst `.container` als Rahmen: die Glaswelt des Auth-Bereichs ist genau
   das, was in diesem Fall nicht gerendert werden konnte. */
function AuthAreaBoundary() {
  const { pathname } = useLocation();
  return (
    <ContentErrorBoundary key={pathname} bereich="auth" wrapperClassName="container">
      <Outlet />
    </ContentErrorBoundary>
  );
}

export default function App() {
  const { authed, loadingUser } = useAuth();
  if (loadingUser) return <LoadingScreen />;

  return (
    // ShippingFlowProvider steht bewusst AUSSERHALB von <Routes> und INNERHALB
    // des AuthProviders (main.jsx). Grund: „Neue Sendung"/Angebotsvergleich
    // laufen als page-State in DashboardPage (/dashboard), die Buchung als
    // eigene Route in DashboardLayout (/booking) — zwei getrennte Teilbäume.
    // Alles unterhalb von <Routes> wird beim Wechsel abgehängt; nur hier
    // überlebt der laufende Versandvorgang den Sprung in beide Richtungen.
    <ShippingFlowProvider>
    {/* Der Paketshop-Finder hat GENAU EIN Fenster für die ganze Anwendung.
        Er steht hier, weil sein Einstieg an zwei getrennten Routen-Teilbäumen
        sitzt: an der Angebotskarte (/dashboard) und an der Buchungsseite
        (/booking). Innerhalb von <Routes> montiert, wäre er beim Wechsel
        abgehängt — und Radius sowie Öffnungszeitenmerkmal, die als persönliche
        Suchpräferenz erhalten bleiben sollen, wären jedes Mal weg.
        Er hält KEINE Buchungsdaten und schreibt nichts in den Versandvorgang. */}
    <ParcelShopFinderProvider>
    <Suspense fallback={<LoadingScreen />}>
      <ScrollToTop />
      <Routes>
        <Route element={<AuthAreaBoundary />}>
          <Route path="/login"    element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />

          {/* Öffentliche Bestätigung der Login-E-Mail-Änderung (E-Mail-Token, kein
              Login nötig; eigene Auth-Ästhetik, nicht im Dashboard). */}
          <Route path="/confirm-email-change" element={<EmailChangeConfirmPage />} />
        </Route>

        {/* Protected: calculator + booking inside dashboard layout (sidebar visible).
            Buchung lief bis Paket B unter dem öffentlichen NavbarLayout — Route und
            Buchungslogik sind unverändert, nur der umgebende Rahmen wechselt auf die
            App-Shell (siehe DashboardLayout.jsx). */}
        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/booking"    element={<BookingPage />} />
          {/* Detailseiten des Lagermoduls — dieselbe App-Shell, dieselbe
              Sidebar, derselbe Seitenkopf-Mechanismus wie /calculator. */}
          <Route path="/inventory/products/:id" element={<ProductDetailPage />} />
          <Route path="/inventory/orders/:id"   element={<OrderDetailPage />} />
        </Route>

        {/* Public: tracking + legal pages. */}
        <Route element={<NavbarLayout />}>
          <Route path="/tracking"    element={<TrackingPage />} />
          <Route path="/impressum"   element={<ImpressumPage />} />
          <Route path="/datenschutz" element={<DatenschutzPage />} />
          <Route path="/agb"         element={<AGBPage />} />
          <Route path="/widerruf"    element={<WiderrufPage />} />
          {/* Informationen zur Transportversicherung — Leseseite neben den
              Rechtsseiten; verlinkt aus dem Versicherungsdetails-Dialog. */}
          <Route path="/versicherungsinformationen" element={<InsuranceInfoPage />} />
        </Route>

        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

        {/* Admin: eigenes Layout, URL-basiert, hinter AdminRoute (UX-Gate).
            requireAdmin schützt die /admin/*-Endpunkte serverseitig. */}
        <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route path="/admin"              element={<AdminOverviewPage />} />
          <Route path="/admin/users"        element={<AdminUsersPage />} />
          <Route path="/admin/users/:id"    element={<AdminUserDetailPage />} />
          <Route path="/admin/shipments"    element={<AdminShipmentsPage />} />
          <Route path="/admin/shipments/:id" element={<AdminShipmentDetailPage />} />
          <Route path="/admin/invoices"     element={<AdminInvoicesPage />} />
          {/* Statische Route vor '/:id' — React Router rankt statisch > dynamisch; Reihenfolge zusätzlich klar. */}
          <Route path="/admin/invoices/backfill" element={<AdminBackfillPage />} />
          <Route path="/admin/invoices/:id" element={<AdminInvoiceDetailPage />} />
          <Route path="/admin/cancellation-requests"     element={<AdminCancellationRequestsPage />} />
          <Route path="/admin/cancellation-requests/:id" element={<AdminCancellationRequestDetailPage />} />
          <Route path="/admin/support-requests"     element={<AdminSupportRequestsPage />} />
          <Route path="/admin/support-requests/:id" element={<AdminSupportRequestDetailPage />} />
          <Route path="/admin/audit-logs"   element={<AuditLogPage />} />
        </Route>

        <Route index element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </Suspense>
    </ParcelShopFinderProvider>
    </ShippingFlowProvider>
  );
}
