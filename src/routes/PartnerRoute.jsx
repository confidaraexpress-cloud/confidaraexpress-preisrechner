import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoadingScreen } from "../components/common/LoadingScreen";
import { SessionCheckFailedView } from "./ProtectedRoute";
import { CUSTOMER_HOME, isSalesPartner } from "../utils/roleLanding.mjs";

// ── PartnerRoute — UX-Gate des Partnerportals ────────────────────────────────
// Nach dem Muster von ProtectedRoute, aber umgekehrt: hier darf NUR die Rolle
// `sales_partner` hinein. Andere Angemeldete gehen auf den Kundenbereich,
// Gäste zur Anmeldung (die Adresse geht als Rücksprungwunsch mit; ob sie
// angesteuert wird, entscheidet AuthPage über die Allowlist).
//
// Ausdrücklich kein Sicherheitsersatz: /api/sales-partner/me/* prüft die Rolle
// serverseitig. Ohne dieses Gate riefe ein Kunde Partnerendpunkte auf, bekäme
// 403 und würde vom zentralen apiFetch abgemeldet — das verhindert die Weiche.
// Die Rolle stammt aus GET /kundenbereich (AuthContext), kein JWT-Decoding.
export function PartnerRoute({ children }) {
  const { authed, loadingUser, sessionCheckFailed, retrySessionCheck, logout, user } = useAuth();
  const location = useLocation();
  if (loadingUser) return <LoadingScreen />;

  if (sessionCheckFailed) {
    return (
      <SessionCheckFailedView
        title="Verbindung zum Partnerportal fehlgeschlagen"
        areaName="das Partnerportal"
        onRetry={retrySessionCheck}
        onLogout={logout}
      />
    );
  }

  if (!authed) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (!isSalesPartner(user)) return <Navigate to={CUSTOMER_HOME} replace />;
  return children;
}
