import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { SalesPartnerAdminNav } from "../../components/admin/SalesPartnerAdminNav";
import { AdminSubDisclosure, openAdminSection } from "../../components/admin/AdminDisclosureCard";
import { PreliveFlowCard } from "../../components/admin/PreliveFlowCard";
import { PreliveAccountsCard } from "../../components/admin/PreliveAccountsCard";
import { PreliveShipmentsCard } from "../../components/admin/PreliveShipmentsCard";
import { PreliveScenariosCard } from "../../components/admin/PreliveScenariosCard";
import { PreliveCommissionRunCard } from "../../components/admin/PreliveCommissionRunCard";
import { PreliveMailPreviewCard } from "../../components/admin/PreliveMailPreviewCard";
import { PreliveCleanupCard } from "../../components/admin/PreliveCleanupCard";
import { usePreliveStatus } from "../../hooks/usePreliveStatus";
import { getAdminSalesPartnerLevelRules, listAdminPreliveAccounts } from "../../api/adminApi";
import { loadSalesPartnerPublicConfig } from "../../api/partnerApi";
import { returnState } from "../../utils/adminBackLink.mjs";
import { levelRulesComplete, normalizeLevelRulesResponse } from "../../utils/adminSalesPartnerView.mjs";
import {
  PRELIVE_FLOW_TEXTS,
  PRELIVE_TEXTS,
  normalizePreliveAccounts,
  preliveCountRows,
  preliveEnabled,
  preliveErrorOutcome,
  scenarioPresets,
} from "../../utils/salesPartnerPrelive.mjs";

/* ── Admin · Vertriebspartner · Pre-Live-Testmodus ───────────────────────────
   Interne Tests des Vertriebspartnerprogramms vor dem Livegang. Oben der Stand
   der Testdaten und der Testablauf als Schrittfolge (UX-Paket 5): Hauptweg ist
   der echte öffentliche Ablauf — Registrierung, Freigabe, Anmeldung, Kunde über
   den Code des Testpartners, Testsendung mit Versandnachweis, Provisionen,
   Testgutschrift, Bereinigung. Darunter die Arbeitsbereiche in derselben
   Reihenfolge (Testkonten, Testsendungen, Provisionen, Bereinigung); ihre
   Formulare sind eingeklappt, bis ein Schritt oder der Admin sie öffnet.
   Schnellszenarien und E-Mail-Vorschau sind zusätzliche Testwerkzeuge und
   stehen eingeklappt am Ende; „Testpartner anlegen" ersetzt nie die
   öffentliche Registrierung.

   Der Server entscheidet alles: ohne `enabled: true` aus GET …/status zeigt
   die Seite nur den Hinweis, dass der Modus nicht aktiv ist — keine Formulare
   (jeder andere Endpunkt antwortete dann 404 PRELIVE_TEST_MODE_DISABLED).
   Meldet eine Aktion diesen Code, lädt die Seite ihren Stand neu. Ob die
   öffentliche Registrierung gerade Testanträge anlegt, sagt die öffentliche
   Konfiguration (einmal je Seite, fail-closed). Erreichbar über die
   Teilnavigation, deren Eintrag nur bei aktivem Modus erscheint. */
export default function AdminSalesPartnerPrelivePage() {
  const prelive = usePreliveStatus();
  const enabled = preliveEnabled(prelive.status);
  const from = returnState(useLocation());
  const [konten, setKonten] = useState({ loading: false, error: "", data: null });
  const [vorgaben, setVorgaben] = useState(null);
  const [registrierung, setRegistrierung] = useState(null);
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

  // Offener Registrierungsweg (öffentliche Konfiguration; liefert immer { ok, config }).
  useEffect(() => {
    if (!enabled) return undefined;
    let aktiv = true;
    loadSalesPartnerPublicConfig().then((r) => { if (aktiv) setRegistrierung(r); });
    return () => { aktiv = false; };
  }, [enabled]);

  // Nach einer Änderung: Zählung, Testkonten und Sendungsliste neu laden.
  const geaendert = useCallback(({ accounts = true } = {}) => {
    statusNeu();
    if (accounts) kontenLaden();
    setRefreshKey((k) => k + 1);
  }, [statusNeu, kontenLaden]);

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
        <div className="adm-note adm-note--warning" role="note" id="adm-pl-warning">
          <div className="adm-pl-warning-text">
            <span id="adm-pl-warning-title">{PRELIVE_TEXTS.pageWarning}</span>
            <span id="adm-pl-safety">{PRELIVE_TEXTS.pageSafety}</span>
          </div>
        </div>

        <div className="adm-card" id="adm-pl-status-card">
          <div className="adm-card-head">Stand der Testdaten</div>
          <div className="adm-card-body">
            <dl className="adm-kv adm-pl-counts">
              {preliveCountRows(status).map((row) => (
                <div className="adm-kv-item" key={row.key} data-count={row.key}><dt>{row.label}</dt><dd>{row.value}</dd></div>
              ))}
            </dl>
            <div className="adm-sp-folds">
              <AdminSubDisclosure id="adm-pl-tech" title="Technische Angaben">
                <dl className="adm-kv">
                  <div className="adm-kv-item"><dt>Modus</dt><dd id="adm-pl-mode">Aktiv</dd></div>
                  <div className="adm-kv-item"><dt>E-Mail-Ausnahmeliste</dt><dd id="adm-pl-allowlist">{status.mailAllowlistConfigured ? "Konfiguriert" : "Nicht konfiguriert"}</dd></div>
                  <div className="adm-kv-item"><dt>Rückdatierung (global)</dt><dd id="adm-pl-backdating">{status.backdatingGlobalAllowed ? "Erlaubt" : "Nicht erlaubt"}</dd></div>
                </dl>
                <p className="adm-edit-hint">
                  Die Ausnahmeliste nennt interne Adressen, an die Mails von Testkonten trotzdem gehen. Globale Level-Regeln und
                  Obergrenzen dürfen nur rückwirkend gelten, solange es keine echten Vertriebspartner gibt.
                </p>
              </AdminSubDisclosure>
            </div>
          </div>
        </div>

        <PreliveFlowCard accounts={konten.data} registration={registrierung} from={from} onOpen={openAdminSection} />

        <PreliveAccountsCard accounts={konten.data} loading={konten.loading} error={konten.error}
          onReload={kontenLaden} onChanged={geaendert} onDisabled={statusNeu} />
        <PreliveShipmentsCard accounts={konten.data} refreshKey={refreshKey} onChanged={geaendert} onDisabled={statusNeu} />
        <PreliveCommissionRunCard onChanged={geaendert} onDisabled={statusNeu} />
        <PreliveCleanupCard onChanged={geaendert} onDisabled={statusNeu} />

        <section className="adm-sp-group" id="adm-pl-tools" aria-labelledby="adm-pl-tools-title">
          <h2 className="adm-sp-group-title" id="adm-pl-tools-title">{PRELIVE_FLOW_TEXTS.toolsTitle}</h2>
          <p className="adm-support-hint adm-pl-tools-note">{PRELIVE_FLOW_TEXTS.toolsNote}</p>
          <PreliveScenariosCard accounts={konten.data} presets={vorgaben} onChanged={geaendert} onDisabled={statusNeu} />
          <PreliveMailPreviewCard accounts={konten.data} onDisabled={statusNeu} />
        </section>
      </div>
    );
  }

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>{PRELIVE_TEXTS.title}</>}
        subtitle={<>Das Partnerprogramm von der Registrierung bis zur Gutschrift testen – mit gekennzeichneten Testdaten.</>}
        actions={(
          <button type="button" className="btn btn-outline btn-sm" id="adm-pl-refresh"
            onClick={() => (enabled ? geaendert() : prelive.reload())} disabled={prelive.loading}>
            Aktualisieren
          </button>
        )}
      />
      <SalesPartnerAdminNav prelive={prelive} />
      {inhalt}
    </div>
  );
}
