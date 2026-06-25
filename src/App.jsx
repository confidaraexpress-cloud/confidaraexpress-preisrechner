import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { LoadingScreen } from "./components/common/LoadingScreen";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { NavbarLayout } from "./components/layout/NavbarLayout";
import { DashboardLayout } from "./components/layout/DashboardLayout";

const AuthPage        = React.lazy(() => import("./pages/AuthPage"));
const CalculatorPage  = React.lazy(() => import("./pages/CalculatorPage"));
const BookingPage     = React.lazy(() => import("./pages/BookingPage"));
const DashboardPage   = React.lazy(() => import("./pages/DashboardPage"));
const TrackingPage    = React.lazy(() => import("./pages/TrackingPage"));
const ImpressumPage   = React.lazy(() => import("./pages/ImpressumPage"));
const DatenschutzPage = React.lazy(() => import("./pages/DatenschutzPage"));
const AGBPage         = React.lazy(() => import("./pages/AGBPage"));
const WiderrufPage    = React.lazy(() => import("./pages/WiderrufPage"));

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
        <Route index element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={authed ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </Suspense>
  );
}
