import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { LoadingScreen } from "./components/common/LoadingScreen";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AdminRoute } from "./routes/AdminRoute";
import { NavbarLayout } from "./components/layout/NavbarLayout";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { AdminLayout } from "./components/layout/AdminLayout";

const AuthPage        = React.lazy(() => import("./pages/AuthPage"));
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
const AdminInvoiceDetailPage = React.lazy(() => import("./pages/admin/AdminInvoiceDetailPage"));
const AdminCancellationRequestsPage = React.lazy(() => import("./pages/admin/AdminCancellationRequestsPage"));
const AdminCancellationRequestDetailPage = React.lazy(() => import("./pages/admin/AdminCancellationRequestDetailPage"));

export default function App() {
  const { authed, loadingUser } = useAuth();
  if (loadingUser) return <LoadingScreen />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <ScrollToTop />
      <Routes>
        <Route path="/login"    element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />

        {/* Protected: calculator inside dashboard layout (sidebar visible) */}
        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/calculator" element={<CalculatorPage />} />
        </Route>

        {/* Public: tracking + legal pages. Booking still requires auth. */}
        <Route element={<NavbarLayout />}>
          <Route path="/tracking"    element={<TrackingPage />} />
          <Route path="/booking"     element={<ProtectedRoute><BookingPage /></ProtectedRoute>} />
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
          <Route path="/admin/invoices/:id" element={<AdminInvoiceDetailPage />} />
          <Route path="/admin/cancellation-requests"     element={<AdminCancellationRequestsPage />} />
          <Route path="/admin/cancellation-requests/:id" element={<AdminCancellationRequestDetailPage />} />
          <Route path="/admin/audit-logs"   element={<AuditLogPage />} />
        </Route>

        <Route index element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </Suspense>
  );
}
