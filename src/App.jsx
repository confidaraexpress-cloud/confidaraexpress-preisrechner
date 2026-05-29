import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { LoadingScreen } from "./components/common/LoadingScreen";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { NavbarLayout } from "./components/layout/NavbarLayout";
import { DashboardLayout } from "./components/layout/DashboardLayout";

const AuthPage       = React.lazy(() => import("./pages/AuthPage"));
const CalculatorPage = React.lazy(() => import("./pages/CalculatorPage"));
const BookingPage    = React.lazy(() => import("./pages/BookingPage"));
const DashboardPage  = React.lazy(() => import("./pages/DashboardPage"));
const TrackingPage   = React.lazy(() => import("./pages/TrackingPage"));

export default function App() {
  const { authed, loadingUser } = useAuth();
  if (loadingUser) return <LoadingScreen />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      <ScrollToTop />
      <Routes>
        <Route path="/login"    element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />

        {/* Authenticated users: calculator inside dashboard layout (sidebar visible) */}
        {authed && (
          <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route path="/calculator" element={<CalculatorPage />} />
          </Route>
        )}

        {/* Public routes: tracking + unauthenticated calculator under navbar */}
        <Route element={<NavbarLayout />}>
          {!authed && <Route path="/calculator" element={<CalculatorPage />} />}
          <Route path="/tracking" element={<TrackingPage />} />
          <Route path="/booking"  element={<ProtectedRoute><BookingPage /></ProtectedRoute>} />
        </Route>

        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route index element={<Navigate to={authed ? "/dashboard" : "/calculator"} replace />} />
        <Route path="*" element={<Navigate to={authed ? "/dashboard" : "/calculator"} replace />} />
      </Routes>
    </Suspense>
  );
}
