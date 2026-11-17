import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAdminCustomerTariffMarkups, updateAdminCustomerTariffMarkups,
  refreshAdminTariffComparison, previewAdminTariffComparison, listAuditLogs,
} from "../../api/adminApi";
import { countries } from "../../utils/countries";
import { AdminDisclosureCard, AdminSubDisclosure } from "./AdminDisclosureCard";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "../ui/Icon";
import {
  TARIFF_TEXTS as T, TARIFF_STEPS, STATUS_VIEW, PROVIDER_LABELS, TARIFF_PROVIDERS, WEIGHT_CLASS_ALL, SAMPLE_REASON_TEXTS,
  selectTariffMarkups, countOverrides, savedOverride, savedEffective, draftKey, draftValue, tariffKey, tariffInputValue,
  tariffDraftChanges, buildTariffEntriesBody, parseTariffInput, sourceText,
  formatCents, formatSignedCents, formatPercent, distanceText, kgText, formatStand, formatDay,
  selectComparison, comparisonBaseStatus, projectionClass, hasSameDay, sampleById, statusOf, statusText,
  statusWithoutComparison, profitRow, tariffSummary, rangeText, sortTariffs, changeWarnings, flowStep,
  selectTariffHistory, historyRevert, historyValue, customRows, destinationOptions, parseCustomPackageInput,
  tariffSaveError, comparisonError,
} from "../../utils/adminTariffMarkupView.mjs";

/* ── Versandpreise optimieren (Admin-Kundendetail, Preisoptimierung 2026-11-17) ─────────────────
   Erweitert die Tarifkarte von 2026-11-10: je Tarif (sieben Transglobal-Produkte, neun JUMiNGO-Preisgruppen)
   ein Satz für alle Gewichte und je einer für vier Gewichtsklassen, mit Empfehlung, Zustand und Gewinnvorschau.
   Sechs Schritte: Kunde (diese Seite) → Tarif → Gewichtsklassen → Aufschlag → Gewinn prüfen → bestätigen.

   Datenwege — bewusst getrennt:
     • GET/PUT tariff-markups      Sätze lesen und speichern. Speichern NUR nach dem Bestätigungsdialog, genau ein
                                   PUT mit den geänderten Einträgen; nie beim Öffnen, Tippen, Tarifwechsel oder
                                   „Empfehlung übernehmen“. Speichern ruft nie einen Provider.
     • POST tariff-comparison      der EINZIGE Providerkontakt — nur über „Preise vergleichen“ bzw. „Vergleichen“.
     • POST …/preview              Projektion mit gespeicherten bzw. Entwurfssätzen, serverseitig, 0 Providercalls.
     • GET audit-logs              Verlauf (nur beim Aufklappen). „Auf alten Wert zurücksetzen“ trägt den alten Wert
                                   als Entwurf ein — gespeichert wird über denselben Dialog und denselben PUT.
   Alle Beträge kommen in Cent vom Server; diese Karte rechnet keinen Preis.
   Kundenwechsel: die Seite montiert die Karte mit neuem Schlüssel — Entwürfe und Basis beginnen leer. */

export const TARIFF_SECTION_ID = "adm-tariff-section";
const PREVIEW_DEBOUNCE_MS = 300;
const HISTORY_LIMIT = 20;
const LAENDERNAMEN = Object.fromEntries(countries.map((c) => [c.code, c.name]));
const slug = (id) => String(id).replace(/[^a-z0-9]+/gi, "-");

function StatusBadge({ status }) {
  const v = STATUS_VIEW[status] || STATUS_VIEW.not_compared;
  return (
    <span className={`badge badge--${v.tone} adm-po-badge`} data-status={status}>
      <span className="adm-po-dot" aria-hidden="true" />{v.label}
    </span>
  );
}

const zelleLabel = (text) => <span className="adm-po-cell-label">{text}</span>;

export function CustomerTariffMarkupSection({ userId, pricing, customerLabel = "" }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [drafts, setDrafts] = useState({});
  const [touched, setTouched] = useState({});
  const [selected, setSelected] = useState(null);
  const [sameDay, setSameDay] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // { type: "success"|"error"|"info", text }
  const [serverErrors, setServerErrors] = useState({});
  const [destination, setDestination] = useState("DE");
  const [base, setBase] = useState(null);
  const [baseVersion, setBaseVersion] = useState(0);
  const [preview, setPreview] = useState(null); // { key, projection }
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [serverStale, setServerStale] = useState(false);
  const [customDraft, setCustomDraft] = useState({ weight: "", length: "", width: "", height: "" });
  const [customBase, setCustomBase] = useState(null);
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState({ loading: false, error: "", payload: null });
  const mounted = useRef(true);
  const previewAbort = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (previewAbort.current) previewAbort.current.abort(); }; }, []);

  // ── Laden ──────────────────────────────────────────────────────────────────
  const laden = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await getAdminCustomerTariffMarkups(userId);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        if (mounted.current && !quiet) setState({ loading: false, error: T.loadError, data: null });
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      const data = selectTariffMarkups(d);
      if (!mounted.current) return;
      if (data) setState({ loading: false, error: "", data });
      else if (!quiet) setState({ loading: false, error: T.loadError, data: null });
    } catch {
      if (mounted.current && !quiet) setState({ loading: false, error: T.loadError, data: null });
    }
  }, [userId]);
  useEffect(() => { laden(); }, [laden]);

  const data = state.data;
  const tariffs = useMemo(() => (data ? data.tariffs : []), [data]);
  const minimum = data ? data.minimumMarkupPercent : null;
  const changes = useMemo(() => tariffDraftChanges(tariffs, drafts, minimum), [tariffs, drafts, minimum]);
  const invalidKeys = Object.keys(changes.invalid);
  const baseStatus = comparisonBaseStatus({ base, userId, destination });
  const baseOk = baseStatus === "ok";
  const ziele = useMemo(() => destinationOptions(data ? data.comparison.destinations : [], LAENDERNAMEN), [data]);
  const tariffById = useMemo(() => Object.fromEntries(tariffs.map((t) => [t.id, t])), [tariffs]);
  const entriesKey = JSON.stringify(changes.entries);
  const vorschau = preview && base && preview.key === entriesKey && preview.projection && preview.projection.runId === base.runId ? preview.projection : null;
  const sdFuer = (t) => sameDay && baseOk && hasSameDay(base, t.provider, t.productKey);

  // ── Basis mit den gespeicherten Sätzen neu rechnen (0 Providercalls): nach dem Speichern, nach einer Kontoänderung ──
  const basisNeuRechnen = useCallback(async (b) => {
    if (!b) return;
    try {
      const r = await previewAdminTariffComparison(userId, b.runId, []);
      let body = null; try { body = await r.json(); } catch { body = null; }
      if (!mounted.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const err = comparisonError(r.status, body);
        if (err && err.stale) { setBase(null); setServerStale(true); }
        return;
      }
      const next = selectComparison(body, userId);
      if (next) { setBase(next); setBaseVersion((v) => v + 1); }
    } catch { /* die bisherige Basis bleibt sichtbar */ }
  }, [userId]);

  // Kontosätze geändert (Karte „Kundenaufschlag“): gespeicherte Werte und Basis neu lesen, Entwürfe bleiben.
  const pricingKey = pricing ? `${pricing.priceMarkupPercent}|${pricing.expressPriceMarkupPercent}` : "";
  const letzterPricing = useRef(pricingKey);
  useEffect(() => {
    const vorher = letzterPricing.current;
    letzterPricing.current = pricingKey;
    if (vorher === pricingKey || vorher === "") return;
    laden({ quiet: true });
    if (base) basisNeuRechnen(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingKey]);

  // ── Vorschau: Entwurf ändert sich → Server rechnet die Projektion neu (entprellt, 0 Providercalls) ──
  useEffect(() => {
    if (previewAbort.current) previewAbort.current.abort();
    if (!baseOk || changes.entries.length === 0) { setPreview(null); setPreviewBusy(false); setPreviewError(null); return undefined; }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    previewAbort.current = ctrl;
    const b = base;
    const key = entriesKey;
    const eintraege = changes.entries;
    const timer = setTimeout(async () => {
      setPreviewBusy(true); setPreviewError(null);
      try {
        const r = await previewAdminTariffComparison(userId, b.runId, eintraege, { signal: ctrl ? ctrl.signal : undefined });
        let body = null; try { body = await r.json(); } catch { body = null; }
        if (!mounted.current || (ctrl && ctrl.signal.aborted)) return;
        if (!r.ok) {
          if (r.status === 401 || r.status === 403) return;
          const err = comparisonError(r.status, body);
          if (err && err.stale) { setServerStale(true); setBase(null); }
          setPreview(null); setPreviewError(err); setPreviewBusy(false);
          return;
        }
        setPreview({ key, projection: selectComparison(body, userId) }); setPreviewBusy(false);
      } catch (e) {
        if (e && e.name === "AbortError") return;
        if (mounted.current) { setPreviewError({ text: T.fetchFailed }); setPreviewBusy(false); }
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => { clearTimeout(timer); if (ctrl) ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entriesKey, base && base.runId, baseVersion, baseOk, userId]);

  // ── Entwürfe (speichern nie) ───────────────────────────────────────────────
  const setzeEntwurf = (key, value) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    setServerErrors((e) => { if (!e[key]) return e; const n = { ...e }; delete n[key]; return n; });
    setSaveMsg(null);
  };
  const uebernehmen = (key, percent, inputId) => {
    setzeEntwurf(key, tariffInputValue(percent));
    setTouched((x) => ({ ...x, [key]: true }));
    // Der Wert steht im Feld; der Fokus folgt ihm, damit er sofort angepasst werden kann.
    if (typeof window !== "undefined") window.requestAnimationFrame(() => { const el = document.getElementById(inputId); if (el) el.focus(); });
  };
  const verwerfen = () => { setDrafts({}); setTouched({}); setServerErrors({}); setSaveMsg(null); };
  const pruefen = () => {
    if (saveBusy || changes.count === 0) return;
    if (invalidKeys.length > 0) {
      setTouched((x) => ({ ...x, ...Object.fromEntries(invalidKeys.map((k) => [k, true])) }));
      const [provider, productKey] = invalidKeys[0].split(":");
      setSelected(tariffKey(provider, Number(productKey)));
      return;
    }
    setSaveMsg(null);
    setDialogOpen(true);
  };

  // ── Speichern: genau EIN PUT mit den bestätigten Einträgen, kein Providerkontakt ──
  const speichern = async () => {
    if (saveBusy || changes.count === 0 || invalidKeys.length > 0) return;
    setSaveBusy(true); setSaveMsg(null); setServerErrors({});
    try {
      const r = await updateAdminCustomerTariffMarkups(userId, buildTariffEntriesBody(changes.entries));
      if (!r.ok) {
        let body = null; try { body = await r.json(); } catch { body = null; }
        const err = tariffSaveError(r.status, body, minimum);
        if (!mounted.current) return;
        setDialogOpen(false);
        if (err) {
          setSaveMsg({ type: "error", text: err.text });
          if (err.key) {
            setServerErrors({ [err.key]: err.text });
            const [provider, productKey] = err.key.split(":");
            setSelected(tariffKey(provider, Number(productKey)));
          }
        }
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      const next = selectTariffMarkups(d);
      if (!mounted.current) return;
      if (next) setState({ loading: false, error: "", data: next });
      else await laden({ quiet: true });
      setDrafts({}); setTouched({}); setPreview(null); setDialogOpen(false);
      setSaveMsg({ type: "success", text: T.saved });
      if (baseOk) basisNeuRechnen(base);
      if (historyOpen) verlaufLaden();
    } catch {
      if (mounted.current) { setDialogOpen(false); setSaveMsg({ type: "error", text: tariffSaveError(500, null).text }); }
    } finally {
      if (mounted.current) setSaveBusy(false);
    }
  };

  // ── Preise vergleichen: der einzige Providerkontakt (zehn Beispielpakete) ──
  const aktualisieren = async () => {
    if (refreshBusy) return;
    setRefreshBusy(true); setRefreshError(null);
    try {
      const r = await refreshAdminTariffComparison(userId, { destinationCountry: destination });
      let body = null; try { body = await r.json(); } catch { body = null; }
      if (!mounted.current) return;
      if (!r.ok) { if (r.status === 401 || r.status === 403) return; setRefreshError(comparisonError(r.status, body)); return; }
      const next = selectComparison(body, userId);
      if (!next) { setRefreshError(comparisonError(500, null)); return; }
      setBase(next); setBaseVersion((v) => v + 1); setPreview(null); setServerStale(false); setPreviewError(null);
    } catch {
      if (mounted.current) setRefreshError(comparisonError(500, null));
    } finally {
      if (mounted.current) setRefreshBusy(false);
    }
  };

  // ── Eigenes Paket vergleichen: eine eigene Preisauskunft nur auf Klick ──
  const vergleichen = async (e) => {
    e.preventDefault();
    if (customBusy) return;
    const eingabe = parseCustomPackageInput(customDraft);
    if (!eingabe.ok) { setCustomError(eingabe.error); return; }
    setCustomBusy(true); setCustomError(""); setCustomBase(null);
    try {
      const r = await refreshAdminTariffComparison(userId, { destinationCountry: destination, custom: eingabe.value });
      let body = null; try { body = await r.json(); } catch { body = null; }
      if (!mounted.current) return;
      if (!r.ok) { if (r.status === 401 || r.status === 403) return; const err = comparisonError(r.status, body); setCustomError(err ? err.text : T.fetchFailed); return; }
      setCustomBase(selectComparison(body, userId));
    } catch {
      if (mounted.current) setCustomError(T.fetchFailed);
    } finally {
      if (mounted.current) setCustomBusy(false);
    }
  };

  const zielWechsel = (code) => {
    // Ein anderes Zielland macht jede Basis ungültig — nichts wird automatisch neu abgerufen.
    setDestination(code); setBase(null); setCustomBase(null); setPreview(null); setRefreshError(null); setCustomError(""); setServerStale(false); setPreviewError(null);
  };

  // ── Verlauf: nur beim Aufklappen laden ──
  const verlaufLaden = useCallback(async () => {
    setHistory((h) => ({ ...h, loading: true, error: "" }));
    try {
      const r = await listAuditLogs({ action: "user.tariff_markup_change", target_user_id: userId, pageSize: HISTORY_LIMIT });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        if (mounted.current) setHistory({ loading: false, error: T.historyError, payload: null });
        return;
      }
      let body = null; try { body = await r.json(); } catch { body = null; }
      if (mounted.current) setHistory({ loading: false, error: "", payload: body });
    } catch {
      if (mounted.current) setHistory({ loading: false, error: T.historyError, payload: null });
    }
  }, [userId]);
  const zuruecksetzen = (eintrag, rv) => {
    setzeEntwurf(rv.key, rv.value);
    setTouched((x) => ({ ...x, [rv.key]: true }));
    setSelected(tariffKey(eintrag.provider, eintrag.productKey));
    setSaveMsg({ type: "info", text: T.revertDone });
  };

  // ── Ableitungen für die Anzeige ────────────────────────────────────────────
  const summaries = useMemo(() => Object.fromEntries(tariffs.map((t) => [
    t.id, tariffSummary(t, baseOk ? base : null, { sameDay: sameDay && baseOk && hasSameDay(base, t.provider, t.productKey), minimumPercent: minimum }),
  ])), [tariffs, base, baseOk, sameDay, minimum]);
  const gruppen = useMemo(() => TARIFF_PROVIDERS.map((p) => ({
    provider: p, tariffs: sortTariffs(tariffs.filter((t) => t.provider === p), summaries),
  })), [tariffs, summaries]);
  const geaenderteJeTarif = useMemo(() => {
    const out = {};
    for (const e of changes.entries) { const k = tariffKey(e.provider, e.productKey); out[k] = (out[k] || 0) + 1; }
    return out;
  }, [changes.entries]);
  const schritt = flowStep({ tariffSelected: selected !== null, hasBase: baseOk, changeCount: changes.count, dialogOpen });
  const fehlerFuer = (key) => (touched[key] && changes.invalid[key]) || serverErrors[key] || "";
  const geaendert = (key) => changes.entries.some((e) => draftKey(e.provider, e.productKey, e.weightClass) === key);
  const klassenLabel = (t, wc) => (wc === WEIGHT_CLASS_ALL ? T.allWeights : (t.classes.find((c) => c.weightClass === wc) || {}).label || "");
  const vergleichText = (x) => (Number.isInteger(x.comparisonNetCents)
    ? `${formatCents(x.comparisonNetCents)}${distanceText(x.differencePercent) ? ` · ${distanceText(x.differencePercent)}` : ""}`
    : SAMPLE_REASON_TEXTS.no_comparable);

  // ── Eine Zeile: alle Gewichte oder eine Gewichtsklasse ──
  const klassenZeile = (t, wc, sd) => {
    const key = draftKey(t.provider, t.productKey, wc);
    const id = `adm-tarif-input-${slug(key)}`;
    const raw = draftValue(drafts, t, wc);
    const dirty = geaendert(key);
    const fehler = fehlerFuer(key);
    const eff = savedEffective(t, wc);
    const alle = wc === WEIGHT_CLASS_ALL;
    const label = klassenLabel(t, wc);
    const cls = alle || !baseOk ? null
      : (vorschau && projectionClass(vorschau, t.provider, t.productKey, wc, { sameDay: sd })) || projectionClass(base, t.provider, t.productKey, wc, { sameDay: sd });
    const status = alle ? null : cls ? statusOf(cls) : statusWithoutComparison(eff.percent, minimum);
    const parsed = parseTariffInput(raw);
    const uebernommen = !!cls && parsed.ok && parsed.value !== null && parsed.value === cls.recommendedPercent;
    const warumId = `${id}-why`;
    const fehlerId = `${id}-error`;
    return (
      <div key={key} className={`adm-po-row${dirty ? " adm-po-row--dirty" : ""}${alle ? " adm-po-row--all" : ""}`} role="group" aria-labelledby={`${id}-label`} data-class={wc}>
        <div className="adm-po-weight"><label id={`${id}-label`} htmlFor={id}>{label}</label></div>
        <div className="adm-po-field">
          <div className={`adm-markup-input-wrap adm-po-input-wrap${fehler ? " adm-markup-input-invalid" : ""}`}>
            <input id={id} className="adm-markup-input" type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
              placeholder="–" value={raw} disabled={saveBusy}
              onChange={(e) => setzeEntwurf(key, e.target.value)}
              onBlur={() => setTouched((x) => ({ ...x, [key]: true }))}
              aria-invalid={fehler ? "true" : undefined}
              aria-describedby={fehler ? `${fehlerId} ${warumId}` : warumId} />
            <span className="adm-markup-suffix" aria-hidden="true">%</span>
          </div>
        </div>
        <div className="adm-po-cell">
          {zelleLabel(T.colCurrent)}
          <span className="adm-po-num">{formatPercent(eff.percent)}</span>{" "}
          <span className="adm-po-src">{sourceText(eff.source)}</span>
          {dirty && <em className="adm-markup-effective-dirty adm-po-pending">{T.draftPending}</em>}
        </div>
        <div className="adm-po-cell adm-po-reco">
          {zelleLabel(T.colRecommendation)}
          {!cls ? <span className="adm-po-src">—</span> : (
            <>
              <span className="adm-po-num">{formatPercent(cls.recommendedPercent)}</span>
              {uebernommen ? <span className="adm-po-src">übernommen</span>
                : cls.suggestedPercent !== null && cls.suggestedPercent !== undefined
                  ? (
                    <button type="button" className="btn btn-outline btn-xs adm-po-adopt" disabled={saveBusy}
                      aria-label={`${T.adopt}: ${t.label}, ${label}, ${formatPercent(cls.suggestedPercent)}`}
                      onClick={() => uebernehmen(key, cls.suggestedPercent, id)}>
                      {T.adopt}
                    </button>
                  )
                  : <span className="adm-po-src">{T.noChangeNeeded}</span>}
            </>
          )}
        </div>
        <div className="adm-po-cell">
          {zelleLabel(T.colStatus)}
          {status ? <StatusBadge status={status} /> : <span className="adm-po-src">—</span>}
        </div>
        <p className="adm-po-why" id={warumId}>{alle ? T.allWeightsHint : cls ? statusText(cls, t.provider) : STATUS_VIEW[status].text}</p>
        {fehler && <p id={fehlerId} className="field-error adm-po-error" role="alert">{fehler}</p>}
      </div>
    );
  };

  // ── Schritt 5: Gewinn und Kundenpreis je Gewichtsklasse ──
  const gewinnTabelle = (t, sd) => {
    if (!baseOk) return <p className="adm-tarif-note">{T.noBase}</p>;
    const wartet = !!geaenderteJeTarif[t.id] && !vorschau;
    return (
      <>
        <p className="adm-markup-help">{T.profitIntro}</p>
        <div className="adm-po-tablewrap">
          <table className="adm-tarif-table adm-po-profit">
            <caption className="sr-only">{T.profitTitle}: {t.label} ({PROVIDER_LABELS[t.provider]})</caption>
            <thead>
              <tr>
                <th scope="col">{T.colWeight}</th>
                <th scope="col">{T.colExample}</th>
                <th scope="col" className="adm-tarif-num">{T.colRate}</th>
                <th scope="col" className="adm-tarif-num">{T.colProfit}</th>
                <th scope="col" className="adm-tarif-num">{T.colCustomer}</th>
                <th scope="col">{T.colCompare}</th>
              </tr>
            </thead>
            <tbody>
              {t.classes.map((c) => {
                const bk = projectionClass(base, t.provider, t.productKey, c.weightClass, { sameDay: sd });
                const pk = vorschau ? projectionClass(vorschau, t.provider, t.productKey, c.weightClass, { sameDay: sd }) : null;
                const r = profitRow(bk, pk);
                if (!r.available) {
                  return (
                    <tr key={c.weightClass} data-class={c.weightClass} data-art="none">
                      <td data-label={T.colWeight}>{c.label}</td>
                      <td colSpan={5} data-label={T.colExample}>{bk ? statusText(bk, t.provider) : T.profitUnavailable}</td>
                    </tr>
                  );
                }
                const neu = r.neu;
                const art = wartet ? T.previewing : r.art === "draft" ? T.profitDraft : r.art === "recommendation" ? T.profitRecommendation : T.profitNone;
                return (
                  <tr key={c.weightClass} data-class={c.weightClass} data-art={r.art || "none"}>
                    <td data-label={T.colWeight}>{c.label}</td>
                    <td data-label={T.colExample}>
                      {kgText(r.weightKg)}{r.chargeableKg !== null && r.chargeableKg !== r.weightKg ? ` (${kgText(r.chargeableKg)} ${T.chargeable})` : ""}
                    </td>
                    <td className="adm-tarif-num" data-label={T.colRate}>
                      {formatPercent(r.heute.percent)}{neu ? ` → ${formatPercent(neu.percent)}` : ""}
                      <span className="adm-po-art">{art}</span>
                    </td>
                    <td className="adm-tarif-num" data-label={T.colProfit}>
                      {formatCents(r.heute.contributionCents)}
                      {neu ? (
                        <>
                          {" → "}{formatCents(neu.contributionCents)}{" "}
                          <strong className={`adm-po-delta${r.plusCents > 0 ? " adm-po-delta--plus" : ""}`}>{formatSignedCents(r.plusCents)}</strong>
                        </>
                      ) : null}
                    </td>
                    <td className="adm-tarif-num" data-label={T.colCustomer}>
                      {neu ? `${formatCents(r.heute.customerNetCents)} → ${formatCents(neu.customerNetCents)}` : formatCents(r.heute.customerNetCents)}
                    </td>
                    <td data-label={T.colCompare}>{vergleichText(neu || r.heute)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  // ── Expertendetails: Einkaufspreise, Vergleichsangebote, Obergrenzen ──
  const expertenDetails = (t, sd) => {
    if (!baseOk) return <p className="adm-tarif-note">{T.noBase}</p>;
    const quelle = vorschau || base;
    const grenze = (p, belowFloor) => (p === null || p === undefined ? "—" : belowFloor ? `unter ${formatPercent(minimum)}` : formatPercent(p));
    return (
      <div className="adm-po-expert">
        <p className="adm-markup-help">{T.expertIntro}</p>
        {t.classes.map((c) => {
          const k = projectionClass(quelle, t.provider, t.productKey, c.weightClass, { sameDay: sd });
          if (!k) return null;
          const begrenzend = sampleById(k, k.limitingScenarioId);
          const proben = Array.isArray(k.samples) ? k.samples : [];
          return (
            <div key={c.weightClass} className="adm-po-expert-class" data-class={c.weightClass}>
              <h6 className="adm-po-expert-title">{c.label}</h6>
              <p className="adm-markup-help">
                {T.upperBound}: {k.upperBoundPercent === null || k.upperBoundPercent === undefined ? "—" : k.belowFloor ? T.upperBoundNone : formatPercent(k.upperBoundPercent)}
                {begrenzend && !k.belowFloor ? ` (${T.limitedBy} ${kgText(begrenzend.weightKg)})` : ""}
                {` · ${T.comparedSamples}: ${k.comparedSamples} ${T.of} ${k.totalSamples}`}
              </p>
              <div className="adm-po-tablewrap">
                <table className="adm-tarif-table adm-po-expert-table">
                  <caption className="sr-only">{T.expertTitle}: {t.label}, {c.label}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{T.colPackage}</th>
                      <th scope="col" className="adm-tarif-num">{T.colPurchase}</th>
                      <th scope="col">{T.colOffer}</th>
                      <th scope="col" className="adm-tarif-num">{T.colOfferPurchase}</th>
                      <th scope="col" className="adm-tarif-num">{T.colOfferRate}</th>
                      <th scope="col" className="adm-tarif-num">{T.colOfferCustomer}</th>
                      <th scope="col">{T.colDistance}</th>
                      <th scope="col" className="adm-tarif-num">{T.colBound}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proben.map((p) => (
                      <tr key={p.scenarioId} data-scenario={p.scenarioId}>
                        <td data-label={T.colPackage}>{kgText(p.weightKg)}{p.chargeableKg !== null && p.chargeableKg !== undefined && p.chargeableKg !== p.weightKg ? ` (${kgText(p.chargeableKg)} ${T.chargeable})` : ""}</td>
                        <td className="adm-tarif-num" data-label={T.colPurchase}>{p.own ? formatCents(p.own.purchaseNetCents) : "—"}</td>
                        <td data-label={T.colOffer}>
                          {p.comparison
                            ? `${p.comparison.label} · ${PROVIDER_LABELS[p.comparison.provider] || ""} · ${T.tariffId} ${p.comparison.tariffId} · ${p.comparison.relation === "equivalent" ? T.equivalent : T.similar}`
                            : SAMPLE_REASON_TEXTS[p.reason] || "—"}
                        </td>
                        <td className="adm-tarif-num" data-label={T.colOfferPurchase}>{p.comparison ? formatCents(p.comparison.purchaseNetCents) : "—"}</td>
                        <td className="adm-tarif-num" data-label={T.colOfferRate}>{p.comparison ? formatPercent(p.comparison.ratePercent) : "—"}</td>
                        <td className="adm-tarif-num" data-label={T.colOfferCustomer}>{p.comparison ? formatCents(p.comparison.customerNetCents) : "—"}</td>
                        <td data-label={T.colDistance}>{distanceText(p.differencePercent) || "—"}</td>
                        <td className="adm-tarif-num" data-label={T.colBound}>{grenze(p.upperBoundPercent, p.belowFloor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Ein geöffneter Tarif: Gewichtsklassen, Gewinnvorschau, Expertendetails ──
  const tarifPanel = (t) => {
    const s = slug(t.id);
    const mitSameDay = baseOk && hasSameDay(base, t.provider, t.productKey);
    const sd = sdFuer(t);
    const zeilen = [WEIGHT_CLASS_ALL, ...t.classes.map((c) => c.weightClass)];
    return (
      <>
        {t.note && <p className="adm-markup-help adm-po-note">{t.note}</p>}
        {mitSameDay && (
          <fieldset className="adm-po-sameday">
            <legend className="adm-edit-label">{T.sameDayLegend}</legend>
            <label className="adm-po-radio">
              <input type="radio" name={`adm-po-sameday-${s}`} checked={!sameDay} onChange={() => setSameDay(false)} /> {T.sameDayWithout}
            </label>
            <label className="adm-po-radio">
              <input type="radio" name={`adm-po-sameday-${s}`} checked={sameDay} onChange={() => setSameDay(true)} />
              {" "}{T.sameDayWith} ({formatCents(base.sameDayReference && base.sameDayReference.feeNetCents)})
            </label>
          </fieldset>
        )}
        <h5 className="adm-po-sub">{T.classesTitle}</h5>
        <div className="adm-po-rows">
          <div className="adm-po-head" aria-hidden="true">
            <span>{T.colWeight}</span><span>{T.colInput}</span><span>{T.colCurrent}</span><span>{T.colRecommendation}</span><span>{T.colStatus}</span>
          </div>
          {zeilen.map((wc) => klassenZeile(t, wc, sd))}
        </div>
        <h5 className="adm-po-sub">{T.profitTitle}</h5>
        {gewinnTabelle(t, sd)}
        <AdminSubDisclosure id={`adm-po-expert-${s}`} title={T.expertTitle}>{expertenDetails(t, sd)}</AdminSubDisclosure>
      </>
    );
  };

  // ── Bestätigungsdialog: jede Änderung bisher → neu, Wirkung, Datum der Basis, Hinweise ──
  const dialogInhalt = () => (
    <div className="adm-po-dialog">
      <p className="adm-markup-help">{baseOk ? `${T.dialogBasis} ${formatStand(base.createdAt)}.` : T.dialogNoBasis}</p>
      <ul className="adm-po-changes">
        {changes.entries.map((e) => {
          const t = tariffById[tariffKey(e.provider, e.productKey)];
          if (!t) return null;
          const key = draftKey(e.provider, e.productKey, e.weightClass);
          const gespeichert = savedOverride(t, e.weightClass);
          const eff = savedEffective(t, e.weightClass);
          const bisher = gespeichert !== null ? formatPercent(gespeichert) : `${T.noInput} (${formatPercent(eff.percent)})`;
          const neu = e.markupPercent === null ? T.noInput : formatPercent(e.markupPercent);
          const sd = sdFuer(t);
          const betroffen = e.weightClass === WEIGHT_CLASS_ALL ? t.classes.map((c) => c.weightClass) : [e.weightClass];
          const wirkungen = [];
          const warnungen = new Set();
          if (baseOk && vorschau) {
            for (const wc of betroffen) {
              const pk = projectionClass(vorschau, t.provider, t.productKey, wc, { sameDay: sd });
              const r = profitRow(projectionClass(base, t.provider, t.productKey, wc, { sameDay: sd }), pk);
              if (r.available && r.art === "draft") {
                wirkungen.push({ wc, r });
                for (const w of changeWarnings(pk)) warnungen.add(w);
              }
            }
          }
          return (
            <li key={key} className="adm-po-change" data-key={key}>
              <span className="adm-po-change-name">{t.label} · {PROVIDER_LABELS[t.provider]} · {klassenLabel(t, e.weightClass)}</span>
              <span className="adm-po-change-values"><span className="adm-po-num">{bisher}</span>{" → "}<strong className="adm-po-num">{neu}</strong></span>
              {wirkungen.map(({ wc, r }) => (
                <span key={wc} className="adm-po-change-impact">
                  {klassenLabel(t, wc)}, {T.dialogExample} {kgText(r.weightKg)}: {T.dialogCustomer} {formatCents(r.neu.customerNetCents)} {T.dialogInstead} {formatCents(r.heute.customerNetCents)}
                  {distanceText(r.neu.differencePercent) ? ` · ${distanceText(r.neu.differencePercent)}` : ""}
                </span>
              ))}
              {baseOk && !vorschau && <span className="adm-po-change-impact">{T.previewing}</span>}
              {warnungen.size > 0 && (
                <span className="adm-po-change-warn">
                  {[...warnungen].map((w) => (
                    <span key={w} className={`badge badge--${w === "at_risk" ? "warning" : "neutral"} adm-po-badge`}>
                      <span className="adm-po-dot" aria-hidden="true" />
                      {w === "at_risk" ? T.dialogWarnAtRisk : w === "weak" ? T.dialogWarnWeak : T.dialogWarnNone}
                    </span>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  const verlauf = history.payload ? selectTariffHistory(history.payload, tariffs) : null;
  const revertGrund = (reason) => (reason === "floor" ? T.revertFloor : reason === "current" ? T.revertCurrent : T.revertUnknown);
  const eigeneZeilen = customBase ? customRows(customBase) : [];

  return (
    <AdminDisclosureCard
      id={TARIFF_SECTION_ID}
      className="adm-tarif adm-po"
      title={T.sectionTitle}
      summary={data ? <span className="badge adm-tarif-badge">{countOverrides(tariffs)} {T.individual}</span> : null}
      attention={changes.count > 0}
    >
      {state.loading ? (
        <div className="loading-center" role="status" aria-live="polite"><span className="spinner spinner-dark" /> {T.loading}</div>
      ) : state.error ? (
        <div className="adm-markup-loaderr">
          <div className="alert alert-error" role="alert">{state.error}</div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => laden()}>{T.reload}</button>
        </div>
      ) : (
        <>
          <div className="adm-po-facts">
            <span className="adm-po-fact adm-po-fact--floor"><span>{T.floorFact}</span> <strong className="adm-po-num">{formatPercent(minimum)}</strong></span>
            <span className="adm-po-fact">{T.goalFact}</span>
          </div>
          <p className="adm-markup-help adm-po-intro">{T.intro}</p>

          <ol className="adm-po-steps" aria-label={T.stepsLabel}>
            {TARIFF_STEPS.map((label, i) => {
              const n = i + 1;
              const zustand = n < schritt ? "done" : n === schritt ? "current" : "next";
              return (
                <li key={n} className={`adm-po-step adm-po-step--${zustand}`} aria-current={zustand === "current" ? "step" : undefined}>
                  <span className="adm-po-step-num" aria-hidden="true">{zustand === "done" ? <Icon n="check" s={14} /> : n}</span>
                  <span className="adm-po-step-text">
                    <span className="adm-po-step-label">{label}</span>
                    {n === 1 && customerLabel ? <span className="adm-po-step-meta">{customerLabel}</span> : null}
                  </span>
                  {zustand === "done" && <span className="sr-only"> (erledigt)</span>}
                </li>
              );
            })}
          </ol>

          <section className="adm-po-compare" aria-labelledby="adm-po-compare-title">
            <h4 id="adm-po-compare-title" className="adm-markup-group-title">{T.comparisonTitle}</h4>
            <div className="adm-tarif-cmp-controls">
              <label className="adm-tarif-ziel">
                <span className="adm-edit-label">{T.destination}</span>
                <select id="adm-tarif-destination" className="field-select adm-edit-select" value={destination} onChange={(e) => zielWechsel(e.target.value)} disabled={refreshBusy || customBusy}>
                  {ziele.map((z) => <option key={z.code} value={z.code} disabled={!z.hasExampleAddress}>{z.name}{z.hasExampleAddress ? "" : " (Beispieladresse fehlt)"}</option>)}
                </select>
              </label>
              <button type="button" id="adm-tarif-refresh" className="btn btn-outline btn-sm" onClick={aktualisieren} disabled={refreshBusy || customBusy} aria-busy={refreshBusy ? "true" : undefined}>
                {refreshBusy ? <><span className="spinner spinner-dark" /> {T.refreshing}</> : T.refresh}
              </button>
              <span className="adm-markup-help adm-tarif-stand" role="status">
                {baseOk ? `${T.stand}: ${formatStand(base.createdAt)}` : T.comparisonHint}
                {previewBusy ? ` · ${T.previewing}` : ""}
              </span>
            </div>
            {refreshError && <div className="alert alert-error" role="alert">{refreshError.text}</div>}
            {previewError && !previewError.stale && <div className="alert alert-error" role="alert">{previewError.text}</div>}
            {baseStatus === "missing" && !refreshError && !serverStale && <p className="adm-tarif-note">{T.noBase}</p>}
            {(baseStatus === "stale" || baseStatus === "expired" || (baseStatus === "missing" && serverStale)) && (
              <p className="adm-tarif-note adm-tarif-note--warn" role="status"><strong>{T.refreshRequired}.</strong> {T.refreshRequiredDetail}</p>
            )}
          </section>

          <section className="adm-po-tariffs" aria-labelledby="adm-po-tariffs-title">
            <h4 id="adm-po-tariffs-title" className="adm-markup-group-title">{T.tariffsTitle}</h4>
            {baseOk && <p className="adm-markup-help">{T.tariffsHint}</p>}
            {gruppen.map((g) => (
              <div key={g.provider} className="adm-po-group" data-provider={g.provider}>
                <h5 className="adm-po-group-title">{PROVIDER_LABELS[g.provider]}</h5>
                <ul className="adm-po-list">
                  {g.tariffs.map((t) => {
                    const offen = selected === t.id;
                    const s = slug(t.id);
                    const sum = summaries[t.id];
                    const offenGezaehlt = geaenderteJeTarif[t.id] || 0;
                    return (
                      <li key={t.id} className={`adm-po-tarif${offen ? " is-open" : ""}`} data-tariff={t.id}>
                        <button type="button" className="adm-po-tarif-head" id={`adm-po-head-${s}`} aria-expanded={offen ? "true" : "false"} aria-controls={`adm-po-panel-${s}`}
                          onClick={() => setSelected(offen ? null : t.id)}>
                          <span className="adm-po-tarif-name">{t.label}</span>
                          <span className="adm-po-tarif-meta">
                            <span className="adm-po-nowrap">{T.today} {rangeText(sum.today)}</span>
                            {sum.recommended ? <>{" · "}<span className="adm-po-nowrap">{T.recommended} {rangeText(sum.recommended)}</span></> : null}
                          </span>
                          <span className="adm-po-tarif-side">
                            {Number.isInteger(sum.plusCents) && sum.plusCents > 0 && (
                              <span className="adm-po-plus">bis {formatSignedCents(sum.plusCents)} {T.plusPerShipment}</span>
                            )}
                            <StatusBadge status={sum.status} />
                            {offenGezaehlt > 0 && <span className="adm-tarif-dirty adm-po-tarif-dirty">● {offenGezaehlt} {offenGezaehlt === 1 ? T.unsavedOne : T.unsaved}</span>}
                          </span>
                          <span className="adm-tech-caret" aria-hidden="true" />
                        </button>
                        <div className="adm-po-panel" id={`adm-po-panel-${s}`} role="region" aria-labelledby={`adm-po-head-${s}`} hidden={!offen}>
                          {offen ? tarifPanel(t) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          <section className="adm-po-save" aria-labelledby="adm-po-save-title">
            <h4 id="adm-po-save-title" className="adm-markup-group-title">{T.saveTitle}</h4>
            <div className="adm-tarif-savebar">
              <span className={changes.count > 0 ? "adm-tarif-dirty" : "adm-tarif-clean"} role="status" aria-live="polite" id="adm-tarif-dirty">
                {changes.count > 0 ? `● ${changes.count} ${changes.count === 1 ? T.unsavedOne : T.unsaved}` : T.noChanges}
              </span>
              <span className="adm-po-save-actions">
                {changes.count > 0 && (
                  <button type="button" id="adm-tarif-discard" className="btn btn-outline btn-sm" onClick={verwerfen} disabled={saveBusy}>{T.discard}</button>
                )}
                <button type="button" id="adm-tarif-save" className="btn btn-primary btn-sm" onClick={pruefen}
                  disabled={saveBusy || changes.count === 0}>
                  {T.review}
                </button>
              </span>
            </div>
            {invalidKeys.length > 0 && Object.keys(touched).some((k) => changes.invalid[k]) && (
              <p className="field-error" role="alert">
                {invalidKeys.map((k) => {
                  const [provider, productKey, wc] = k.split(":");
                  const t = tariffById[tariffKey(provider, Number(productKey))];
                  return t ? `${t.label} (${PROVIDER_LABELS[t.provider]}) · ${klassenLabel(t, Number(wc))}: ${changes.invalid[k]}` : changes.invalid[k];
                }).join(" ")}
              </p>
            )}
            {saveMsg && saveMsg.type === "success" && <div className="alert alert-success" role="status">{saveMsg.text}</div>}
            {saveMsg && saveMsg.type === "info" && <div className="alert alert-info" role="status">{saveMsg.text}</div>}
            {saveMsg && saveMsg.type === "error" && <div className="alert alert-error" role="alert">{saveMsg.text}</div>}
          </section>

          <AdminSubDisclosure id="adm-po-history" title={T.historyTitle} open={historyOpen}
            onOpenChange={(o) => { setHistoryOpen(o); if (o) verlaufLaden(); }}>
            {history.loading ? <p className="adm-tarif-note" role="status">{T.historyLoading}</p>
              : history.error ? <div className="alert alert-error" role="alert">{history.error}</div>
                : verlauf && verlauf.length === 0 ? <p className="adm-tarif-note">{T.historyEmpty}</p>
                  : verlauf ? (
                    <ul className="adm-po-history">
                      {verlauf.map((e) => {
                        const rv = historyRevert(e, tariffs, minimum);
                        return (
                          <li key={e.id} className="adm-po-history-item" data-entry={e.id}>
                            <span className="adm-po-history-when">{formatStand(e.at)} · {e.actorName}</span>
                            <span className="adm-po-history-what">
                              {e.tariffLabel} · {PROVIDER_LABELS[e.provider]} · {e.classLabel}:{" "}
                              <span className="adm-po-num">{historyValue(e.before)}</span>{" → "}<span className="adm-po-num">{historyValue(e.after)}</span>
                            </span>
                            {rv.allowed
                              ? <button type="button" className="btn btn-outline btn-xs" onClick={() => zuruecksetzen(e, rv)} disabled={saveBusy}>{T.revert}</button>
                              : <span className="adm-po-src">{revertGrund(rv.reason)}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
          </AdminSubDisclosure>

          <AdminSubDisclosure id="adm-tarif-custom" title={T.customTitle}>
            <form className="adm-tarif-custom" onSubmit={vergleichen} noValidate>
              <p className="adm-markup-help">{T.customHint}</p>
              <div className="adm-tarif-custom-grid">
                {[["weight", T.customWeight, "kg"], ["length", T.customLength, "cm"], ["width", T.customWidth, "cm"], ["height", T.customHeight, "cm"]].map(([f, label, einheit]) => (
                  <label key={f} className="adm-tarif-custom-field">
                    <span className="adm-edit-label">{label}</span>
                    <div className="adm-markup-input-wrap">
                      <input id={`adm-tarif-custom-${f}`} className="adm-markup-input" type="text" inputMode="decimal" autoComplete="off" value={customDraft[f]}
                        onChange={(e) => { setCustomDraft((d) => ({ ...d, [f]: e.target.value })); setCustomError(""); }} disabled={customBusy} />
                      <span className="adm-markup-suffix" aria-hidden="true">{einheit}</span>
                    </div>
                  </label>
                ))}
                <button type="submit" id="adm-tarif-compare" className="btn btn-primary btn-sm" disabled={customBusy || refreshBusy} aria-busy={customBusy ? "true" : undefined}>
                  {customBusy ? <><span className="spinner spinner-dark" /> {T.comparing}</> : T.compare}
                </button>
              </div>
              {customError && <p className="field-error" role="alert">{customError}</p>}
              {customBase && (
                <div className="adm-tarif-custom-result">
                  <p className="adm-markup-help">{T.stand}: {formatStand(customBase.createdAt)}</p>
                  <div className="adm-po-tablewrap">
                    <table className="adm-tarif-table">
                      <caption className="sr-only">{T.customTitle}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{T.colTariff}</th>
                          <th scope="col" className="adm-tarif-num">{T.colCustomer}</th>
                          <th scope="col">{T.colCompare}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eigeneZeilen.map((z) => (
                          <tr key={z.id} data-tariff={z.id}>
                            <td data-label={T.colTariff}>{z.label} · {PROVIDER_LABELS[z.provider]}</td>
                            <td className="adm-tarif-num" data-label={T.colCustomer}>{formatCents(z.customerNetCents)}</td>
                            <td data-label={T.colCompare}>{vergleichText(z)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </form>
          </AdminSubDisclosure>

          <AdminSubDisclosure id="adm-tarif-details" title={T.detailsTitle}>
            {baseOk ? (
              <dl className="adm-kv adm-tarif-details">
                <div className="adm-kv-item"><dt>{T.detailSender}</dt><dd>{base.conditions.sender.street}, {base.conditions.sender.postalCode} {base.conditions.sender.city}</dd></div>
                <div className="adm-kv-item"><dt>{T.detailRecipient}</dt><dd>{base.conditions.recipient ? `${base.conditions.recipient.street}, ${base.conditions.recipient.postalCode} ${base.conditions.recipient.city}` : "—"}</dd></div>
                <div className="adm-kv-item"><dt>{T.detailCollection}</dt><dd>{formatDay(base.collectionDate)}</dd></div>
                <div className="adm-kv-item"><dt>{T.detailConditions}</dt><dd>{T.detailConditionsText}</dd></div>
              </dl>
            ) : <p className="adm-tarif-note">{T.noBase}</p>}
          </AdminSubDisclosure>
          <p className="adm-markup-help adm-tarif-disclaimer">{T.disclaimer}</p>

          {dialogOpen && (
            <ConfirmDialog
              title={T.dialogTitle}
              text={T.dialogText}
              subline={customerLabel || undefined}
              note={T.dialogNote}
              confirmLabel={T.dialogConfirm}
              busy={saveBusy}
              busyLabel={T.dialogBusy}
              confirmId="adm-tarif-confirm"
              onCancel={() => { if (!saveBusy) setDialogOpen(false); }}
              onConfirm={speichern}
            >
              {dialogInhalt()}
            </ConfirmDialog>
          )}
        </>
      )}
    </AdminDisclosureCard>
  );
}

export default CustomerTariffMarkupSection;
