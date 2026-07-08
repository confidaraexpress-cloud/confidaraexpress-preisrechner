import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoadingScreen } from "../components/common/LoadingScreen";

// ── AdminRoute — reines UX-Gate ──────────────────────────────────────────────
// Versteckt den Adminbereich vor Nicht-Admins. Dies ist AUSDRÜCKLICH KEIN
// Sicherheitsersatz: Alle /admin/*-Endpunkte sind serverseitig durch
// requireAdmin geschützt und bleiben die autoritative Autorisierung. Ein
// manipulierter Client käme an dieser Route zwar „vorbei", erhielte von jedem
// Admin-Endpunkt aber 401/403 → zentraler Logout/Redirect via apiFetch.
//
// Die Rolle stammt aus GET /kundenbereich (user.role) über den AuthContext —
// kein clientseitiges JWT-Decoding, kein zusätzlicher Request. Kein Logging von
// Nutzerdaten.
export function AdminRoute({ children }) {
  const { authed, loadingUser, user } = useAuth();

  // Während der initiale /kundenbereich-Check läuft: neutraler Ladezustand —
  // verhindert ein Aufblitzen des Redirects, bevor die Rolle bekannt ist.
  if (loadingUser) return <LoadingScreen />;

  // Nicht eingeloggt → Login.
  if (!authed) return <Navigate to="/login" replace />;

  // Eingeloggt, aber keine Admin-Rolle → zurück in den Kundenbereich. Bewusst
  // ohne Hinweis, dass /admin existiert (keine Informationspreisgabe).
  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;

  return children;
}
