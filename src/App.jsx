import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { ShippingFlowProvider } from "./context/ShippingFlowContext";
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
    <Suspense fallback={<LoadingScreen />}>
      <ScrollToTop />
      <Routes>
        <Route path="/login"    element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />

        {/* Öffentliche Bestätigung der Login-E-Mail-Änderung (E-Mail-Token, kein
            Login nötig; eigene Auth-Ästhetik, nicht im Dashboard). */}
        <Route path="/confirm-email-change" element={<EmailChangeConfirmPage />} />

        {/* Protected: calculator + booking inside dashboard layout (sidebar visible).
            Buchung lief bis Paket B unter dem öffentlichen NavbarLayout — Route und
            Buchungslogik sind unverändert, nur der umgebende Rahmen wechselt auf die
            App-Shell (siehe DashboardLayout.jsx). */}
        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/booking"    element={<BookingPage />} />
        </Route>

        {/* Public: tracking + legal pages. */}
        <Route element={<NavbarLayout />}>
          <Route path="/tracking"    element={<TrackingPage />} />
          <Route path="/impressum"   element={<ImpressumPage />} />
          <Route path="/datenschutz" element={<DatenschutzPage />} />
          <Route path="/agb"         element={<AGBPage />} />
          <Route path="/widerruf"    element={<WiderrufPage />} />
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
    </ShippingFlowProvider>
  );
}
