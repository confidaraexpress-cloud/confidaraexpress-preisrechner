import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { PreliveAccountsCard } from "../../components/admin/PreliveAccountsCard";
import { PreliveShipmentsCard } from "../../components/admin/PreliveShipmentsCard";
import { PreliveScenariosCard } from "../../components/admin/PreliveScenariosCard";
import { PreliveCommissionRunCard } from "../../components/admin/PreliveCommissionRunCard";
import { PreliveMailPreviewCard } from "../../components/admin/PreliveMailPreviewCard";
import { PreliveCleanupCard } from "../../components/admin/PreliveCleanupCard";
import { usePreliveStatus } from "../../hooks/usePreliveStatus";
import { getAdminSalesPartnerLevelRules, listAdminPreliveAccounts } from "../../api/adminApi";
import { levelRulesComplete, normalizeLevelRulesResponse } from "../../utils/adminSalesPartnerView.mjs";
import {
  PRELIVE_TEXTS,
  normalizePreliveAccounts,
  preliveCountRows,
  preliveEnabled,
  preliveErrorOutcome,
  scenarioPresets,
} from "../../utils/salesPartnerPrelive.mjs";

/* ── Admin · Vertriebspartner · Pre-Live-Testmodus ───────────────────────────
   Interne Tests des Vertriebspartnerprogramms vor dem Livegang: Testkonten
   (Partner, Kunden, Passwort-Link), Testsendungen (ohne Buchung, Provider und
   Label), Schnellszenarien, Provisionslauf nur über Testdaten,
   E-Mail-Vorschau ohne Versand und die Bereinigung aller Testdaten.

   Der Server entscheidet alles: ohne `enabled: true` aus GET …/status zeigt
   die Seite nur den Hinweis, dass der Modus nicht aktiv ist — keine Formulare
   (jeder andere Endpunkt antwortete dann 404 PRELIVE_TEST_MODE_DISABLED).
   Meldet eine Aktion diesen Code, lädt die Seite ihren Stand neu. Erreichbar
   aus der Partnerliste, deren Eintrag nur bei aktivem Modus erscheint. */
export default function AdminSalesPartnerPrelivePage() {
  const prelive = usePreliveStatus();
  const enabled = preliveEnabled(prelive.status);
  const [konten, setKonten] = useState({ loading: false, error: "", data: null });
  const [vorgaben, setVorgaben] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const kontenLauf = useRef(0);
  const statusNeu = prelive.reload;

  const kontenLaden = useCallback(async () => {
    const meinLauf = ++kontenLauf.current;
    setKonten((k) => ({ ...k, loading: true, error: "" }));
    try {
      const r = await listAdminPreliveAccounts();
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (meinLauf !== kontenLauf.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        if (preliveErrorOutcome(r.status, d).disabled) statusNeu();
        setKonten({ loading: false, error: PRELIVE_TEXTS.accountsError, data: null });
        return;
      }
      setKonten({ loading: false, error: "", data: normalizePreliveAccounts(d) });
    } catch {
      if (meinLauf === kontenLauf.current) setKonten({ loading: false, error: PRELIVE_TEXTS.accountsError, data: null });
    }
  }, [statusNeu]);

  // Vorgaben der Szenarien: Schwellen der aktuellen globalen Regeln, ohne sie
  // die Startwerte des Servers — ohne beides keine Vorgaben.
  const vorgabenLaden = useCallback(async () => {
    try {
      const r = await getAdminSalesPartnerLevelRules();
      if (!r.ok) { setVorgaben(null); return; }
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      const regeln = normalizeLevelRulesResponse(d);
      setVorgaben(scenarioPresets(levelRulesComplete(regeln.current) ? regeln.current : regeln.startDefaults?.rules));
    } catch {
      setVorgaben(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    kontenLaden();
    vorgabenLaden();
  }, [enabled, kontenLaden, vorgabenLaden]);

  // Nach einer Änderung: Zählung, Testkonten und Sendungsliste neu laden.
  const geaendert = useCallback(({ accounts = true } = {}) => {
    statusNeu();
    if (accounts) kontenLaden();
    setRefreshKey((k) => k + 1);
  }, [statusNeu, kontenLaden]);

  const back = <Link to="/admin/partners" className="adm-back">Zurück zu den Vertriebspartnern</Link>;
  const status = prelive.status;

  let inhalt;
  if (prelive.loading && !enabled) {
    inhalt = <div className="table-card"><div className="loading-center" role="status"><span className="spinner spinner-dark" /> Wird geladen…</div></div>;
  } else if (!enabled) {
    inhalt = (
      <div className="adm-cards">
        <div className={`adm-note ${prelive.error ? "adm-note--error" : "adm-note--info"}`} role="note" id="adm-pl-disabled">
          <span>{prelive.error ? PRELIVE_TEXTS.statusError : PRELIVE_TEXTS.disabled}</span>
        </div>
        {prelive.error && (
          <div><button type="button" className="btn btn-outline btn-sm" onClick={prelive.reload}>Erneut versuchen</button></div>
        )}
      </div>
    );
  } else {
    inhalt = (
      <div className="adm-cards">
        <div className="adm-note adm-note--warning" role="note" id="adm-pl-warning"><span>{PRELIVE_TEXTS.pageWarning}</span></div>

        <div className="adm-card" id="adm-pl-status-card">
          <div className="adm-card-head">Stand</div>
          <div className="adm-card-body">
            <dl className="adm-kv">
              <div className="adm-kv-item"><dt>Modus</dt><dd id="adm-pl-mode">Aktiv</dd></div>
              <div className="adm-kv-item"><dt>E-Mail-Allowlist</dt><dd id="adm-pl-allowlist">{status.mailAllowlistConfigured ? "Konfiguriert" : "Nicht konfiguriert"}</dd></div>
              <div className="adm-kv-item"><dt>Rückdatierung (global)</dt><dd id="adm-pl-backdating">{status.backdatingGlobalAllowed ? "Erlaubt" : "Nicht erlaubt"}</dd></div>
              {preliveCountRows(status).map((row) => (
                <div className="adm-kv-item" key={row.key} data-count={row.key}><dt>{row.label}</dt><dd>{row.value}</dd></div>
              ))}
            </dl>
          </div>
        </div>

        <PreliveAccountsCard accounts={konten.data} loading={konten.loading} error={konten.error}
          onReload={kontenLaden} onChanged={geaendert} onDisabled={statusNeu} />
        <PreliveShipmentsCard accounts={konten.data} refreshKey={refreshKey} onChanged={geaendert} onDisabled={statusNeu} />
        <PreliveScenariosCard accounts={konten.data} presets={vorgaben} onChanged={geaendert} onDisabled={statusNeu} />
        <PreliveCommissionRunCard onChanged={geaendert} onDisabled={statusNeu} />
        <PreliveMailPreviewCard accounts={konten.data} onDisabled={statusNeu} />
        <PreliveCleanupCard onChanged={geaendert} onDisabled={statusNeu} />
      </div>
    );
  }

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        backLink={back}
        title={<>{PRELIVE_TEXTS.title}</>}
        subtitle={<>Interne Tests des Vertriebspartnerprogramms mit gekennzeichneten Testdaten.</>}
        actions={(
          <button type="button" className="btn btn-outline btn-sm" id="adm-pl-refresh"
            onClick={() => (enabled ? geaendert() : prelive.reload())} disabled={prelive.loading}>
            Aktualisieren
          </button>
        )}
      />
      {inhalt}
    </div>
  );
}
