import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAdminCustomerTariffMarkups, updateAdminCustomerTariffMarkups,
  refreshAdminTariffComparison, previewAdminTariffComparison,
} from "../../api/adminApi";
import { countries } from "../../utils/countries";
import { AdminSubDisclosure } from "./AdminDisclosureCard";
import {
  TARIFF_TEXTS as T, selectTariffMarkups, draftsFromProducts, tariffDraftChanges, buildTariffMarkupsBody,
  parseTariffInput, effectiveForRow, effectiveLine, tariffSaveError, selectComparison, comparisonBaseStatus,
  comparisonError, destinationOptions, parseCustomPackageInput, packageLabel, transglobalCellText,
  referenceCellText, differenceCellText, formatStand, formatDay, tariffInputValue,
} from "../../utils/adminTariffMarkupView.mjs";
import { formatMarkupPercent } from "../../utils/customerMarkup.mjs";

/* ── Individuelle Versandtarife (Admin-Kundendetail, Betreiberentscheidung 2026-11-10) ──────────
   Sieben Transglobal-Produkte, je ein Prozentfeld, ein Speichern-Button; je Zeile ein aufklappbarer
   Preisvergleich auf einer gemeinsamen Vergleichsbasis (Zielland + „Preise aktualisieren“).

   Datenwege — bewusst getrennt:
     • GET/PUT tariff-markups      Sätze lesen und speichern (Speichern ruft NIE einen Provider).
     • POST tariff-comparison      der EINZIGE Providerkontakt — nur über den Button „Preise aktualisieren“
                                   bzw. „Vergleichen“ (eigenes Paket); nie beim Öffnen, Aufklappen oder Tippen.
     • POST …/preview              Vorschau mit den Entwurfssätzen, serverseitig gerechnet, 0 Providercalls,
                                   300 ms entprellt. Es gibt hier keine Preisformel: alle Beträge kommen in Cent
                                   vom Server und werden nur formatiert.
   Eine Vergleichsbasis gilt nur für diesen Kunden, dieses Zielland und die Kontosätze zum Zeitpunkt der
   Aktualisierung; sonst zeigt die Karte „Aktualisierung erforderlich“ und rechnet nichts vor.
   Kundenwechsel: die Seite montiert die Karte mit neuem Schlüssel — Entwürfe und Basis beginnen leer. */

export const TARIFF_SECTION_ID = "adm-tariff-section";
const PREVIEW_DEBOUNCE_MS = 300;
const LAENDERNAMEN = Object.fromEntries(countries.map((c) => [c.code, c.name]));

export function CustomerTariffMarkupSection({ userId, pricing }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [drafts, setDrafts] = useState({});
  const [touched, setTouched] = useState({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // { type: "success"|"error", text, productKey? }
  const [destination, setDestination] = useState("DE");
  const [base, setBase] = useState(null);        // Standardbasis (fünf Pakete)
  const [customBase, setCustomBase] = useState(null);
  const [preview, setPreview] = useState({ standard: null, custom: null });
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  // Der Server hat eine Basis als veraltet oder abgelaufen zurückgewiesen (409/410): Hinweis statt alter Preise.
  const [serverStale, setServerStale] = useState(false);
  const [customDraft, setCustomDraft] = useState({ weight: "", length: "", width: "", height: "" });
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState("");
  const [openProduct, setOpenProduct] = useState(null);
  const mounted = useRef(true);
  const previewAbort = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (previewAbort.current) previewAbort.current.abort(); }; }, []);

  // ── Laden ──────────────────────────────────────────────────────────────────
  const laden = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await getAdminCustomerTariffMarkups(userId);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        if (mounted.current) setState({ loading: false, error: T.loadError, data: null });
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      const data = selectTariffMarkups(d);
      if (!mounted.current) return;
      setState({ loading: false, error: data ? "" : T.loadError, data });
      if (data) { setDrafts(draftsFromProducts(data.products)); setTouched({}); }
    } catch {
      if (mounted.current) setState({ loading: false, error: T.loadError, data: null });
    }
  }, [userId]);
  useEffect(() => { laden(); }, [laden]);

  const data = state.data;
  const products = data ? data.products : [];
  const account = useMemo(() => ({
    // Für die Veraltet-Erkennung gilt der frischeste Stand der Kontosätze: die Aufschlagskarte darüber (pricing)
    // oder, solange sie nicht geladen ist, die Werte aus dieser Antwort.
    standardPercent: pricing && pricing.priceMarkupPercent != null ? Number(pricing.priceMarkupPercent) : data ? data.account.standardPercent : null,
    expressPercent: pricing ? (pricing.expressPriceMarkupPercent == null ? null : Number(pricing.expressPriceMarkupPercent)) : data ? data.account.expressPercent : null,
  }), [pricing, data]);
  const aenderungen = useMemo(() => tariffDraftChanges(products, drafts), [products, drafts]);
  const individuell = products.filter((p) => p.overridePercent !== null).length;
  const ziele = useMemo(() => destinationOptions(data ? data.comparison.destinations : [], LAENDERNAMEN), [data]);
  const baseStatus = comparisonBaseStatus({ base, userId, destination, account });
  const customStatus = comparisonBaseStatus({ base: customBase, userId, destination, account });

  // ── Vorschau: Entwurf ändert sich → Server rechnet die Basis neu (entprellt, 0 Providercalls) ──
  const aenderungsSchluessel = JSON.stringify(aenderungen.changes);
  useEffect(() => {
    const ziele = [];
    if (baseStatus === "ok") ziele.push(["standard", base]);
    if (customStatus === "ok") ziele.push(["custom", customBase]);
    if (previewAbort.current) previewAbort.current.abort();
    if (ziele.length === 0 || aenderungen.count === 0) { setPreview({ standard: null, custom: null }); setPreviewBusy(false); return undefined; }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    previewAbort.current = ctrl;
    const timer = setTimeout(async () => {
      setPreviewBusy(true); setPreviewError(null);
      const next = { standard: null, custom: null };
      let fehler = null;
      for (const [kind, b] of ziele) {
        try {
          const r = await previewAdminTariffComparison(userId, b.runId, aenderungen.changes, { signal: ctrl ? ctrl.signal : undefined });
          if (!r.ok) {
            if (r.status === 401 || r.status === 403) return;
            let body = null; try { body = await r.json(); } catch { body = null; }
            fehler = comparisonError(r.status, body);
            if (fehler && fehler.stale) { setServerStale(true); if (kind === "standard") setBase(null); else setCustomBase(null); }
            continue;
          }
          let body = null; try { body = await r.json(); } catch { body = null; }
          next[kind] = selectComparison(body, userId);
        } catch (e) {
          if (e && e.name === "AbortError") return;
          fehler = { text: T.fetchFailed };
        }
      }
      if (!mounted.current || (ctrl && ctrl.signal.aborted)) return;
      setPreview(next); setPreviewError(fehler); setPreviewBusy(false);
    }, PREVIEW_DEBOUNCE_MS);
    return () => { clearTimeout(timer); if (ctrl) ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aenderungsSchluessel, base && base.runId, customBase && customBase.runId, baseStatus, customStatus, userId]);

  // ── Speichern: genau EIN PUT mit den geänderten Zeilen, kein Providerkontakt ──
  const speichern = async (e) => {
    e.preventDefault();
    setTouched(Object.fromEntries(products.map((p) => [String(p.productKey), true])));
    if (saveBusy || aenderungen.count === 0 || Object.keys(aenderungen.invalid).length > 0) return;
    setSaveBusy(true); setSaveMsg(null);
    try {
      const r = await updateAdminCustomerTariffMarkups(userId, buildTariffMarkupsBody(aenderungen.changes));
      if (!r.ok) {
        let body = null; try { body = await r.json(); } catch { body = null; }
        const err = tariffSaveError(r.status, body);
        if (err && mounted.current) setSaveMsg({ type: "error", text: err.text, productKey: err.productKey });
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      const next = selectTariffMarkups(d);
      if (!mounted.current) return;
      if (next) { setState({ loading: false, error: "", data: next }); setDrafts(draftsFromProducts(next.products)); setTouched({}); }
      else await laden();
      setSaveMsg({ type: "success", text: T.saved });
    } catch {
      if (mounted.current) setSaveMsg({ type: "error", text: tariffSaveError(500, null).text });
    } finally {
      if (mounted.current) setSaveBusy(false);
    }
  };

  // ── Preise aktualisieren: der einzige Providerkontakt (fünf Standardpakete) ──
  const aktualisieren = async () => {
    if (refreshBusy) return;
    setRefreshBusy(true); setRefreshError(null); setSaveMsg(null);
    try {
      const r = await refreshAdminTariffComparison(userId, { destinationCountry: destination });
      let body = null; try { body = await r.json(); } catch { body = null; }
      if (!mounted.current) return;
      if (!r.ok) { if (r.status === 401 || r.status === 403) return; setBase(null); setRefreshError(comparisonError(r.status, body)); return; }
      setBase(selectComparison(body, userId)); setPreview((p) => ({ ...p, standard: null })); setServerStale(false); setPreviewError(null);
      if (openProduct === null && products.length > 0) setOpenProduct(products[0].productKey);
    } catch {
      if (mounted.current) { setBase(null); setRefreshError(comparisonError(500, null)); }
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
      setCustomBase(selectComparison(body, userId)); setPreview((p) => ({ ...p, custom: null }));
    } catch {
      if (mounted.current) setCustomError(T.fetchFailed);
    } finally {
      if (mounted.current) setCustomBusy(false);
    }
  };

  const zielWechsel = (code) => {
    // Ein anderes Zielland macht jede Basis ungültig — nichts wird automatisch neu abgerufen.
    setDestination(code); setBase(null); setCustomBase(null); setPreview({ standard: null, custom: null }); setRefreshError(null); setCustomError(""); setServerStale(false); setPreviewError(null);
  };
  const aktualisierungNoetig = (
    <p className="adm-tarif-note adm-tarif-note--warn" role="status"><strong>{T.refreshRequired}.</strong> {T.refreshRequiredDetail}</p>
  );

  const zeileFuer = (p) => {
    const key = String(p.productKey);
    const draft = Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : tariffInputValue(p.overridePercent);
    const parsed = parseTariffInput(draft);
    const eff = effectiveForRow(p, draft);
    const geaendert = Object.prototype.hasOwnProperty.call(aenderungen.changes, key);
    const serverFehler = saveMsg && saveMsg.type === "error" && saveMsg.productKey === key ? saveMsg.text : "";
    const fehler = (touched[key] && !parsed.ok ? parsed.error : "") || serverFehler;
    return { key, draft, parsed, eff, geaendert, fehler };
  };

  // Die anzuzeigende Basis je Art: Vorschau (passend zum Entwurf) vor gespeicherter Basis.
  const anzeige = (kind) => {
    const b = kind === "standard" ? base : customBase;
    const pv = preview[kind];
    return pv && b && pv.runId === b.runId && aenderungen.count > 0 ? pv : b;
  };
  const status = (kind) => (kind === "standard" ? baseStatus : customStatus);

  const vergleichsTabelle = (kind, productKey) => {
    const st = status(kind);
    if (st === "missing") return serverStale ? aktualisierungNoetig : <p className="adm-tarif-note">{T.noBase}</p>;
    if (st !== "ok") return aktualisierungNoetig;
    const b = anzeige(kind);
    const produkte = productKey ? b.products.filter((p) => p.productKey === productKey) : b.products;
    const szenarien = b.scenarios;
    return (
      <>
        <table className="adm-tarif-table">
          <caption className="sr-only">{T.comparisonTitle}: {productKey ? `${produkte[0] ? produkte[0].label : ""} — ` : ""}Paket, CE-Preis über Transglobal, CE-Preis über JUMiNGO, Unterschied (netto).</caption>
          <thead>
            <tr>
              <th scope="col">{productKey ? T.rowProduct : T.colProduct}</th>
              <th scope="col" className="adm-num adm-tarif-num">{T.rowTg}</th>
              <th scope="col" className="adm-num adm-tarif-num">{T.rowJumingo}</th>
              <th scope="col">{T.rowDiff}</th>
            </tr>
          </thead>
          <tbody>
            {produkte.flatMap((p) => szenarien.map((s) => {
              const z = p.rows.find((r) => r.scenarioId === s.id) || null;
              const diff = z && z.difference;
              const cls = diff ? (diff.cents > 0 ? "adm-tarif-diff--cheaper" : diff.cents < 0 ? "adm-tarif-diff--more" : "") : "";
              return (
                <tr key={`${p.productKey}-${s.id}`} data-product={p.productKey} data-scenario={s.id}>
                  <td data-label={productKey ? T.rowProduct : T.colProduct}>{productKey ? packageLabel(s.package) : `${p.label} · ${packageLabel(s.package)}`}</td>
                  <td className="adm-num adm-tarif-num" data-label={T.rowTg}>{transglobalCellText(z && z.transglobal)}</td>
                  <td className="adm-num adm-tarif-num" data-label={T.rowJumingo}>{referenceCellText(z && z.reference)}</td>
                  <td className={cls} data-label={T.rowDiff}>{differenceCellText(z)}</td>
                </tr>
              );
            }))}
          </tbody>
        </table>
        {produkte.length === 1 && (
          <p className="adm-markup-help adm-tarif-table-note" role="status">
            {T.examplePrices}: {formatMarkupPercent(produkte[0].markup.percent)}{produkte[0].markup.draft ? ` — ${T.previewNote}` : ""}
            {b.scenarios.some((s) => s.status === "partial") ? ` ${T.scenarioPartial}` : ""}
            {b.scenarios.every((s) => s.status === "failed") ? ` ${T.scenarioFailed}` : ""}
          </p>
        )}
      </>
    );
  };

  const details = (b) => b ? (
    <dl className="adm-kv adm-tarif-details">
      <div className="adm-kv-item"><dt>{T.detailSender}</dt><dd>{b.conditions.sender.street}, {b.conditions.sender.postalCode} {b.conditions.sender.city}</dd></div>
      <div className="adm-kv-item"><dt>{T.detailRecipient}</dt><dd>{b.conditions.recipient ? `${b.conditions.recipient.street}, ${b.conditions.recipient.postalCode} ${b.conditions.recipient.city}` : "—"}</dd></div>
      <div className="adm-kv-item"><dt>{T.detailCollection}</dt><dd>{formatDay(b.collectionDate)}</dd></div>
      <div className="adm-kv-item"><dt>{T.detailHandover}</dt><dd>{T.detailHandoverPickup}</dd></div>
      <div className="adm-kv-item"><dt>{T.detailAddressType}</dt><dd>{T.detailAddressBusiness}</dd></div>
      <div className="adm-kv-item"><dt>{T.detailPackages}</dt><dd>1</dd></div>
      <div className="adm-kv-item"><dt>{T.detailExtras}</dt><dd>{T.detailExtrasNone}</dd></div>
      <div className="adm-kv-item"><dt>{T.detailPriceBasis}</dt><dd>{T.detailPriceBasisText}</dd></div>
    </dl>
  ) : <p className="adm-tarif-note">{T.noBase}</p>;

  return (
    <div className="adm-card adm-tarif" id={TARIFF_SECTION_ID}>
      <div className="adm-card-head">
        {T.sectionTitle}
        {data && <span className="badge adm-card-head-action adm-tarif-badge">{individuell} {T.individual}</span>}
      </div>
      <div className="adm-card-body">
        {state.loading ? (
          <div className="loading-center" role="status" aria-live="polite"><span className="spinner spinner-dark" /> {T.loading}</div>
        ) : state.error ? (
          <div className="adm-markup-loaderr">
            <div className="alert alert-error" role="alert">{state.error}</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={laden}>{T.reload}</button>
          </div>
        ) : (
          <>
            <p className="adm-markup-help adm-tarif-intro">{T.intro}</p>
            <form onSubmit={speichern} noValidate>
              <div className="adm-tarif-rows" role="table" aria-label={T.sectionTitle}>
                <div className="adm-tarif-head" role="row">
                  <span role="columnheader">{T.colProduct}</span>
                  <span role="columnheader">{T.colMarkup}</span>
                  <span role="columnheader">{T.colEffective}</span>
                </div>
                {products.map((p) => {
                  const z = zeileFuer(p);
                  return (
                    <div className={`adm-tarif-row${z.geaendert ? " adm-tarif-row--dirty" : ""}`} role="row" key={p.productKey} data-product={p.productKey}>
                      <div className="adm-tarif-name" role="cell">
                        <label htmlFor={`adm-tarif-input-${z.key}`} className="adm-tarif-label">{p.label}</label>
                        <span className="adm-tarif-key">({p.productKey})</span>
                      </div>
                      <div className="adm-tarif-field" role="cell">
                        <div className={`adm-markup-input-wrap adm-tarif-input-wrap${z.fehler ? " adm-markup-input-invalid" : ""}`}>
                          <input id={`adm-tarif-input-${z.key}`} className="adm-markup-input" type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
                            placeholder="Standard" value={z.draft} disabled={saveBusy}
                            onChange={(e) => { setDrafts((d) => ({ ...d, [z.key]: e.target.value })); setSaveMsg(null); }}
                            onBlur={() => setTouched((t) => ({ ...t, [z.key]: true }))}
                            aria-invalid={z.fehler ? "true" : undefined}
                            aria-describedby={z.fehler ? `adm-tarif-error-${z.key}` : `adm-tarif-eff-${z.key}`} />
                          <span className="adm-markup-suffix" aria-hidden="true">%</span>
                        </div>
                        <button type="button" id={`adm-tarif-reset-${z.key}`} className="btn btn-outline btn-xs" disabled={saveBusy || z.draft === ""}
                          onClick={() => { setDrafts((d) => ({ ...d, [z.key]: "" })); setTouched((t) => ({ ...t, [z.key]: true })); setSaveMsg(null); }}>
                          {T.useStandard}
                        </button>
                      </div>
                      <div className="adm-tarif-effective" role="cell" id={`adm-tarif-eff-${z.key}`}>
                        <span>{effectiveLine(z.eff)}</span>
                        {z.geaendert && <em className="adm-markup-effective-dirty"> — noch nicht gespeichert</em>}
                      </div>
                      {z.fehler && <p id={`adm-tarif-error-${z.key}`} className="field-error adm-tarif-error" role="alert">{z.fehler}</p>}
                      <div className="adm-tarif-cmp-row">
                        <AdminSubDisclosure id={`adm-tarif-cmp-${z.key}`} title={`${T.comparisonOf} ${p.label}`} open={openProduct === p.productKey}
                          onOpenChange={(offen) => setOpenProduct(offen ? p.productKey : null)}>
                          {vergleichsTabelle("standard", p.productKey)}
                        </AdminSubDisclosure>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="adm-tarif-savebar">
                <span className={aenderungen.count > 0 ? "adm-tarif-dirty" : "adm-tarif-clean"} role="status" aria-live="polite" id="adm-tarif-dirty">
                  {aenderungen.count > 0 ? `● ${aenderungen.count === 1 ? T.unsavedOne : T.unsaved} (${aenderungen.count})` : T.noChanges}
                </span>
                <button type="submit" id="adm-tarif-save" className="btn btn-primary btn-sm" aria-busy={saveBusy ? "true" : undefined}
                  disabled={saveBusy || aenderungen.count === 0 || Object.keys(aenderungen.invalid).length > 0}>
                  {saveBusy ? <><span className="spinner spinner-dark" /> {T.saving}</> : T.save}
                </button>
              </div>
              {saveMsg && saveMsg.type === "success" && <div className="alert alert-success" role="status">{saveMsg.text}</div>}
              {saveMsg && saveMsg.type === "error" && !saveMsg.productKey && <div className="alert alert-error" role="alert">{saveMsg.text}</div>}
              <p className="adm-support-hint">{T.effectHint}</p>
            </form>

            <section className="adm-tarif-cmp" aria-labelledby="adm-tarif-cmp-title">
              <h4 id="adm-tarif-cmp-title" className="adm-markup-group-title">{T.comparisonTitle}</h4>
              <p className="adm-markup-help">{T.comparisonIntro}</p>
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
                  {base && baseStatus === "ok" ? `${T.stand}: ${formatStand(base.createdAt)}` : T.refreshHint}
                  {previewBusy ? ` · ${T.previewing}` : ""}
                </span>
              </div>
              {refreshError && <div className="alert alert-error" role="alert">{refreshError.text}</div>}
              {previewError && !previewError.stale && <div className="alert alert-error" role="alert">{previewError.text}</div>}
              {baseStatus === "missing" && !refreshError && !serverStale && <p className="adm-tarif-note">{T.noBase}</p>}
              {(baseStatus === "stale" || baseStatus === "expired" || (baseStatus === "missing" && serverStale)) && aktualisierungNoetig}

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
                  {customBase && customStatus === "ok" && (
                    <div className="adm-tarif-custom-result">
                      <p className="adm-markup-help">{packageLabel(customBase.scenarios[0] && customBase.scenarios[0].package)} · {T.stand}: {formatStand(customBase.createdAt)}</p>
                      {vergleichsTabelle("custom", null)}
                    </div>
                  )}
                  {customBase && customStatus !== "ok" && <p className="adm-tarif-note adm-tarif-note--warn" role="status"><strong>{T.refreshRequired}.</strong> {T.refreshRequiredDetail}</p>}
                </form>
              </AdminSubDisclosure>

              <AdminSubDisclosure id="adm-tarif-details" title={T.detailsTitle}>
                {details(baseStatus === "ok" ? base : customStatus === "ok" ? customBase : null)}
              </AdminSubDisclosure>
              <p className="adm-markup-help adm-tarif-disclaimer">{T.disclaimer}</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default CustomerTariffMarkupSection;
