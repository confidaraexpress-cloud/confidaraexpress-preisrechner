import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoadingScreen } from "../components/common/LoadingScreen";

export function ProtectedRoute({ children }) {
  const { authed, loadingUser, sessionCheckFailed, retrySessionCheck, logout } = useAuth();
  if (loadingUser) return <LoadingScreen />;

  // Sitzungsprüfung an Netz-/Serverfehler gescheitert (Token vorhanden, aber
  // /kundenbereich nicht erreichbar): Vorher wurde das Token gelöscht und der
  // Kunde landete kommentarlos auf dem Login. Jetzt bleibt die Sitzung erhalten
  // und der Zustand wird erklärt — Wiederholung nur auf bewussten Klick, damit
  // keine Request-Schleife entsteht. „Zur Anmeldung" ist der bewusste Ausstieg.
  if (sessionCheckFailed) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
        <div role="alert" style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, marginBottom: 10 }}>Verbindung zum Kundenbereich fehlgeschlagen</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
            Ihre Sitzung ist nicht abgelaufen — der Kundenbereich konnte nur momentan
            nicht geladen werden. Bitte prüfen Sie Ihre Internetverbindung und
            versuchen Sie es erneut.
          </p>
          <button type="button" className="btn btn-primary" onClick={retrySessionCheck}>
            Erneut versuchen
          </button>
          <button type="button" className="btn btn-outline" style={{ marginLeft: 10 }} onClick={logout}>
            Zur Anmeldung
          </button>
        </div>
      </div>
    );
  }

  if (!authed) return <Navigate to="/login" replace />;
  return children;
}
