import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoadingScreen } from "../components/common/LoadingScreen";
import { isSalesPartner, PARTNER_HOME } from "../utils/roleLanding.mjs";

// Sitzungsprüfung an Netz-/Serverfehler gescheitert (Token vorhanden, aber
// /kundenbereich nicht erreichbar): Vorher wurde das Token gelöscht und der
// Kunde landete kommentarlos auf dem Login. Jetzt bleibt die Sitzung erhalten
// und der Zustand wird erklärt — Wiederholung nur auf bewussten Klick, damit
// keine Request-Schleife entsteht. „Zur Anmeldung" ist der bewusste Ausstieg.
// Eine Fläche für Kundenbereich und Partnerportal (PartnerRoute); nur
// Überschrift und Bereichsname wechseln, der Kundenwortlaut ist unverändert.
export function SessionCheckFailedView({
  title = "Verbindung zum Kundenbereich fehlgeschlagen",
  areaName = "der Kundenbereich",
  onRetry,
  onLogout,
}) {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div role="alert" style={{ maxWidth: 440, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, marginBottom: 10 }}>{title}</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
          Ihre Sitzung ist nicht abgelaufen — {areaName} konnte nur momentan
          nicht geladen werden. Bitte prüfen Sie Ihre Internetverbindung und
          versuchen Sie es erneut.
        </p>
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Erneut versuchen
        </button>
        <button type="button" className="btn btn-outline" style={{ marginLeft: 10 }} onClick={onLogout}>
          Zur Anmeldung
        </button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }) {
  const { authed, loadingUser, sessionCheckFailed, retrySessionCheck, logout, user } = useAuth();
  const location = useLocation();
  if (loadingUser) return <LoadingScreen />;

  if (sessionCheckFailed) {
    return <SessionCheckFailedView onRetry={retrySessionCheck} onLogout={logout} />;
  }

  // Die gewünschte Adresse wandert als Router-State mit zur Anmeldung. Ob sie
  // danach wirklich angesteuert wird, entscheidet AuthPage ausschließlich über
  // die Allowlist in utils/loginReturnTarget.mjs.
  if (!authed) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;

  // Ein Vertriebspartner hat keinen Kundenbereich: jede Kundenroute riefe
  // /kunde/* auf, der Server antwortete dort mit 403, und das zentrale apiFetch
  // meldete ab. Deshalb wird hier umgeleitet, BEVOR ein Kundenbaustein
  // (Layout, Mitteilungen, Seite) überhaupt montiert wird.
  if (isSalesPartner(user)) return <Navigate to={PARTNER_HOME} replace />;
  return children;
}
