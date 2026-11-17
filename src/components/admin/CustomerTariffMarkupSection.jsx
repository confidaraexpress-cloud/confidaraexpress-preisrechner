import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAdminCustomerTariffMarkups, updateAdminCustomerTariffMarkups,
  refreshAdminTariffComparison, previewAdminTariffComparison, listAuditLogs,
} from "../../api/adminApi";
import { countries } from "../../utils/countries";
import { AdminDisclosureCard, AdminSubDisclosure } from "./AdminDisclosureCard";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  TARIFF_TEXTS as T, STATUS_VIEW, PROVIDER_LABELS, TARIFF_PROVIDERS, WEIGHT_CLASS_ALL, SAMPLE_REASON_TEXTS, RELATION_VIEW, VERDICT_TEXTS,
  selectTariffMarkups, countOverrides, savedOverride, savedEffective, draftKey, draftValue, tariffKey, tariffInputValue,
  tariffDraftChanges, buildTariffEntriesBody, parseTariffInput, sourceText, fieldHint, weightTabLabel,
  formatCents, formatPercent, formatSignedCents, distanceText, kgText, packageLabel, formatStand, formatDay,
  selectComparison, comparisonBaseStatus, projectionClass, hasSameDay, sampleById, statusText,
  classMetrics, classWarnings, profitRow, tariffSummary, rangeText, changeWarnings,
  tariffAreas, areaCandidates, extraComparedWith, commonScenarioId, pairLink, verdictOf, chanceLine, chanceText, advantageText, scenarioOf, bestChanceCents,
  selectTariffHistory, historyRevert, historyValue, customRows, destinationOptions, parseCustomPackageInput,
  tariffSaveError, comparisonError, WARNING_VIEW,
} from "../../utils/adminTariffMarkupView.mjs";

/* ── Versandpreise optimieren (Admin-Kundendetail; finale Vereinfachung 2026-11-17) ─────────────────────
   Eine Tarifübersicht statt zweier Anbieterlisten: je Transglobal-Produkt ein Bereich (sieben), Transglobal links,
   das JUMiNGO-Registerpaar rechts (schmal untereinander). JUMiNGO-Preisgruppen ohne festes Gegenstück stehen unter
   „Weitere JUMiNGO-Tarife“ (eingeklappt, voll bedienbar); vergleicht der Server eine von ihnen mit einem
   Transglobal-Produkt, ist sie dort zusätzlich als „Ähnlicher Tarif“ wählbar. Ablauf: Tarif → Gewicht (vier Reiter)
   → Aufschlag → Prüfen → Speichern. Je Gewichtsklasse eine Kernaussage (wer günstiger einkauft — nur, wenn der
   Server die beiden Angebote vergleicht), „Möglich: +X € pro Sendung“ (nur mit belastbarer Empfehlung) und je
   Anbieter vier Zahlen: Unser Einkauf, Kunde zahlt, Unser Verdienst, Ihr Aufschlag — alle vom Server, für beide
   Seiten dasselbe Beispielpaket. Aufschläge je Anbieter getrennt: „Empfehlung übernehmen“ füllt nur das Feld,
   „Selbst festlegen“ öffnet es. Beispielpaket, Bedingungen, Vergleichsangebote, Begründung und Datenbasis stehen
   unter „Details anzeigen“.

   Datenwege — bewusst getrennt:
     • GET/PUT tariff-markups      Sätze lesen und speichern. Speichern NUR nach dem Bestätigungsdialog, genau ein
                                   PUT mit den geänderten Einträgen; nie beim Öffnen, Tippen, Reiter-, Tarif- oder
                                   Kandidatenwechsel oder „Empfehlung übernehmen“. Speichern ruft nie einen Provider.
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
const hatEintrag = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fokussiere = (id) => {
  if (typeof window !== "undefined") window.requestAnimationFrame(() => { const el = document.getElementById(id); if (el) el.focus(); });
};

function StatusBadge({ status }) {
  const v = STATUS_VIEW[status] || WARNING_VIEW[status] || STATUS_VIEW.not_compared;
  return (
    <span className={`badge badge--${v.tone} adm-po-badge`} data-status={status}>
      <span className="adm-po-dot" aria-hidden="true" />{v.label}
    </span>
  );
}

// Vergleichsbeziehung: Marke mit Wortlaut; „Kein direkter Vergleich möglich“ als ruhiger Text ohne Marke.
function Beziehung({ relation }) {
  const v = RELATION_VIEW[relation] || RELATION_VIEW.none;
  return v.tone
    ? <span className={`badge badge--${v.tone} adm-po-rel`} data-relation={relation}>{v.label}</span>
    : <span className="adm-po-rel adm-po-rel--none" data-relation="none">{v.label}</span>;
}

export function CustomerTariffMarkupSection({ userId, pricing, customerLabel = "" }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [drafts, setDrafts] = useState({});
  const [touched, setTouched] = useState({});
  const [editing, setEditing] = useState({});
  const [selected, setSelected] = useState(null); // offener Bereich (Transglobal-ID) oder Gruppe aus „Weitere JUMiNGO-Tarife“
  const [kandidaten, setKandidaten] = useState({}); // { Bereich: gewählte JUMiNGO-Gruppe }
  const [weitereOffen, setWeitereOffen] = useState(false);
  const [klasse, setKlasse] = useState(1);
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
  const meldungRef = useRef(null);
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
  const changes = useMemo(() => tariffDraftChanges(tariffs, drafts), [tariffs, drafts]);
  const invalidKeys = Object.keys(changes.invalid);
  const baseStatus = comparisonBaseStatus({ base, userId, destination });
  const baseOk = baseStatus === "ok";
  const basis = baseOk ? base : null;
  const ziele = useMemo(() => destinationOptions(data ? data.comparison.destinations : [], LAENDERNAMEN), [data]);
  const tariffById = useMemo(() => Object.fromEntries(tariffs.map((t) => [t.id, t])), [tariffs]);
  const entriesKey = JSON.stringify(changes.entries);
  const vorschau = preview && base && preview.key === entriesKey && preview.projection && preview.projection.runId === base.runId ? preview.projection : null;
  const sdFuer = (t) => sameDay && baseOk && hasSameDay(base, t.provider, t.productKey);

  // Bereiche (je Transglobal-Produkt) und „Weitere JUMiNGO-Tarife“; Kandidaten nur aus Vergleichsurteilen des Servers.
  const { areas, extra } = useMemo(() => tariffAreas(tariffs), [tariffs]);
  const tgTarife = useMemo(() => tariffs.filter((t) => t.provider === "transglobal"), [tariffs]);
  const kandidatenJe = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, areaCandidates(a, extra, basis)])), [areas, extra, basis]);
  const gewaehlt = (area) => {
    const liste = kandidatenJe[area.id] || [];
    return liste.find((c) => c.tariff.id === kandidaten[area.id]) || liste[0] || null;
  };
  // Alle Tarife eines Bereichs (Transglobal und jeder JUMiNGO-Kandidat): ein Entwurf auf einem gerade nicht gewählten
  // Kandidaten bleibt so in Zeile und Reiter sichtbar — gespeichert würde er mit dem nächsten bestätigten Speichern.
  const bereichsTarife = (area) => [area.transglobal, ...(kandidatenJe[area.id] || []).map((c) => c.tariff)];
  // Beispielpaket wie in der Fläche: das gemeinsame Paket des Bereichs mit dem gewählten Vergleich, für einen nicht
  // gewählten weiteren JUMiNGO-Tarif sein eigenes Beispiel. Nur Auswahl unter Serverzeilen — der Dialog zeigt so
  // dieselben Zahlen wie die Spalten davor.
  const paketFuer = (t, wc) => {
    if (!baseOk) return null;
    const area = t.provider === "transglobal"
      ? areas.find((a) => a.transglobal.id === t.id)
      : areas.find((a) => { const k = gewaehlt(a); return !!k && k.tariff.id === t.id; });
    if (!area) return commonScenarioId(null, projectionClass(base, t.provider, t.productKey, wc));
    const tg = area.transglobal;
    const k = gewaehlt(area);
    return commonScenarioId(
      projectionClass(base, tg.provider, tg.productKey, wc, { sameDay: sdFuer(tg) }),
      k ? projectionClass(base, k.tariff.provider, k.tariff.productKey, wc) : null,
    );
  };

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

  // Nach dem Speichern verschwindet der Dialog; der Fokus geht auf die Erfolgsmeldung statt ins Leere.
  useEffect(() => {
    if (saveMsg && saveMsg.type === "success" && typeof window !== "undefined") {
      window.requestAnimationFrame(() => { if (meldungRef.current) meldungRef.current.focus(); });
    }
  }, [saveMsg]);

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
    fokussiere(inputId);
  };
  const selbstFestlegen = (key, inputId) => {
    setEditing((x) => ({ ...x, [key]: true }));
    fokussiere(inputId);
  };
  // Ein Schlüssel „provider:produkt:klasse“ öffnet den Bereich, der ihn zeigt, und — außer „alle Gewichte“ — seinen
  // Reiter: Transglobal und Registerpaare im eigenen Bereich, eine weitere JUMiNGO-Gruppe in der offenen Fläche, wenn
  // sie dort gewählt ist, sonst unter „Weitere JUMiNGO-Tarife“.
  const zeigeSchluessel = (key) => {
    const [provider, productKey, wc] = key.split(":");
    const id = tariffKey(provider, Number(productKey));
    if (Number(wc) !== WEIGHT_CLASS_ALL) setKlasse(Number(wc));
    if (provider === "transglobal") { setSelected(id); return; }
    const paar = areas.find((a) => a.pair && a.pair.id === id);
    if (paar) { setSelected(paar.id); setKandidaten((k) => ({ ...k, [paar.id]: id })); return; }
    const offen = areas.find((a) => a.id === selected);
    const gezeigt = offen ? gewaehlt(offen) : null;
    if (gezeigt && gezeigt.tariff.id === id) return;
    setSelected(id);
    setWeitereOffen(true);
  };
  const verwerfen = () => { setDrafts({}); setTouched({}); setEditing({}); setServerErrors({}); setSaveMsg(null); };
  const pruefen = () => {
    if (saveBusy || changes.count === 0) return;
    if (invalidKeys.length > 0) {
      setTouched((x) => ({ ...x, ...Object.fromEntries(invalidKeys.map((k) => [k, true])) }));
      zeigeSchluessel(invalidKeys[0]);
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
        const err = tariffSaveError(r.status, body);
        if (!mounted.current) return;
        setDialogOpen(false);
        if (err) {
          setSaveMsg({ type: "error", text: err.text });
          if (err.key) { setServerErrors({ [err.key]: err.text }); zeigeSchluessel(err.key); }
        }
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      const next = selectTariffMarkups(d);
      if (!mounted.current) return;
      if (next) setState({ loading: false, error: "", data: next });
      else await laden({ quiet: true });
      setDrafts({}); setTouched({}); setEditing({}); setPreview(null); setDialogOpen(false);
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
  const zuruecksetzen = (rv) => {
    setzeEntwurf(rv.key, rv.value);
    setTouched((x) => ({ ...x, [rv.key]: true }));
    zeigeSchluessel(rv.key);
    setSaveMsg({ type: "info", text: T.revertDone });
    fokussiere(`adm-tarif-input-${slug(rv.key)}`);
  };

  // ── Ableitungen für die Anzeige ────────────────────────────────────────────
  const summaries = useMemo(() => Object.fromEntries(tariffs.map((t) => [
    t.id, tariffSummary(t, basis, { sameDay: sameDay && !!basis && hasSameDay(basis, t.provider, t.productKey) }),
  ])), [tariffs, basis, sameDay]);
  const geaenderteJeTarif = useMemo(() => {
    const out = {};
    for (const e of changes.entries) { const k = tariffKey(e.provider, e.productKey); out[k] = (out[k] || 0) + 1; }
    return out;
  }, [changes.entries]);
  const fehlerFuer = (key) => (touched[key] && changes.invalid[key]) || serverErrors[key] || "";
  const geaendert = (key) => changes.entries.some((e) => draftKey(e.provider, e.productKey, e.weightClass) === key);
  const feldSichtbar = (key) => hatEintrag(drafts, key) || !!editing[key] || !!serverErrors[key];
  // „Bis 5 kg“, „5–10 kg“ … bzw. „Alle Gewichte“ — dieselbe Kurzform in Reitern, Dialog, Fehlern und Verlauf.
  const klassenKurz = (t, wc) => (wc === WEIGHT_CLASS_ALL ? T.allWeights : weightTabLabel((t.classes.find((c) => c.weightClass === wc) || {}).label || ""));
  const aktiveKlasse = (t) => (t.classes.some((c) => c.weightClass === klasse) ? klasse : t.classes[0].weightClass);
  const vergleichText = (x) => (Number.isInteger(x.comparisonNetCents)
    ? `${formatCents(x.comparisonNetCents)}${distanceText(x.differencePercent) ? ` · ${distanceText(x.differencePercent)}` : ""}`
    : SAMPLE_REASON_TEXTS.no_comparable);
  const markeKurz = (status) => (status === "at_risk" ? <span className="adm-po-flag" data-status="at_risk">{STATUS_VIEW.at_risk.label}</span> : null);

  // Werte eines Anbieters in einer Klasse — alles Serverwerte, für das gezeigte Beispielpaket.
  const auswertungFuer = (t, wc, sd, scenarioId) => {
    const bk = baseOk ? projectionClass(base, t.provider, t.productKey, wc, { sameDay: sd }) : null;
    const pk = vorschau ? projectionClass(vorschau, t.provider, t.productKey, wc, { sameDay: sd }) : null;
    const wartet = !!geaenderteJeTarif[t.id] && !vorschau;
    const m = classMetrics({ tariff: t, weightClass: wc, baseClass: bk, previewClass: pk, hasBase: baseOk, pending: wartet, previewFailed: !!previewError, sameDay: sd, scenarioId });
    return { t, wc, sd, bk, pk, wartet, m };
  };

  // ── Reiter: Pfeiltasten, Pos1 und Ende wechseln die Gewichtsklasse (WAI-ARIA Tabs) ──
  const reiterTaste = (e, t) => {
    const liste = t.classes.map((c) => c.weightClass);
    const i = liste.indexOf(aktiveKlasse(t));
    const ziel = e.key === "ArrowRight" ? liste[(i + 1) % liste.length]
      : e.key === "ArrowLeft" ? liste[(i - 1 + liste.length) % liste.length]
        : e.key === "Home" ? liste[0]
          : e.key === "End" ? liste[liste.length - 1] : null;
    if (ziel === null) return;
    e.preventDefault();
    setKlasse(ziel);
    const el = document.getElementById(`adm-po-tab-${slug(t.id)}-${ziel}`);
    if (el) el.focus();
  };
  // Die Reiter eines Bereichs; der Punkt markiert ungespeicherte Änderungen beider Spalten in dieser Klasse.
  const reiter = (t, wc, tarife) => {
    const s = slug(t.id);
    return (
      <div className="ce-tabs adm-po-tabs" role="tablist" aria-label={`${T.weightTabs}: ${t.label}`}>
        {t.classes.map((c) => {
          const aktiv = c.weightClass === wc;
          const offen = tarife.some((x) => x && geaendert(draftKey(x.provider, x.productKey, c.weightClass)));
          return (
            <button key={c.weightClass} type="button" role="tab" id={`adm-po-tab-${s}-${c.weightClass}`} className="ce-tab adm-po-tab"
              aria-selected={aktiv ? "true" : "false"} aria-controls={`adm-po-tabpanel-${s}`} tabIndex={aktiv ? 0 : -1} data-class={c.weightClass}
              onClick={() => setKlasse(c.weightClass)} onKeyDown={(e) => reiterTaste(e, t)}>
              {weightTabLabel(c.label)}
              {offen && <><span className="adm-po-tab-dot" aria-hidden="true" /><span className="sr-only"> ({T.draftPending})</span></>}
            </button>
          );
        })}
      </div>
    );
  };

  // ── Eingabefeld (eine Klasse oder alle Gewichte) — erscheint nach „Selbst festlegen“, „Ändern“ oder mit Entwurf ──
  const eingabe = (key, label) => {
    const id = `adm-tarif-input-${slug(key)}`;
    const [provider, productKey, wc] = key.split(":");
    const t = tariffById[tariffKey(provider, Number(productKey))];
    const fehler = fehlerFuer(key);
    const hinweisId = `${id}-hint`;
    const fehlerId = `${id}-error`;
    return (
      <div className="adm-po-edit">
        <label className="adm-po-edit-label" htmlFor={id}>{label}</label>
        <div className="adm-po-edit-row">
          <div className={`adm-markup-input-wrap adm-po-input-wrap${fehler ? " adm-markup-input-invalid" : ""}`}>
            <input id={id} className="adm-markup-input" type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
              placeholder="–" value={draftValue(drafts, t, Number(wc))} disabled={saveBusy}
              onChange={(e) => setzeEntwurf(key, e.target.value)}
              onBlur={() => setTouched((x) => ({ ...x, [key]: true }))}
              aria-invalid={fehler ? "true" : undefined}
              aria-describedby={fehler ? `${fehlerId} ${hinweisId}` : hinweisId} />
            <span className="adm-markup-suffix" aria-hidden="true">%</span>
          </div>
          {geaendert(key) && <span className="adm-po-pending">{T.draftPending}</span>}
        </div>
        <p className="adm-po-edit-hint" id={hinweisId}>{fieldHint()}</p>
        {fehler && <p id={fehlerId} className="field-error adm-po-error" role="alert">{fehler}</p>}
      </div>
    );
  };

  // ── Eine Spalte: Anbieter, vier Zahlen, Hinweise, Empfehlung, zwei Aktionen, „Alle Gewichte“ ──
  const spalte = (x, kopf) => {
    const { t, wc, m } = x;
    const titelId = `adm-po-col-${slug(t.id)}`;
    const key = draftKey(t.provider, t.productKey, wc);
    const inputId = `adm-tarif-input-${slug(key)}`;
    const kurz = klassenKurz(t, wc);
    const warnungen = classWarnings({ baseClass: x.bk, previewClass: x.wartet ? null : x.pk, provider: t.provider, hasBase: baseOk, numbers: m.numbers });
    const eingetragen = parseTariffInput(draftValue(drafts, t, wc));
    const uebernommen = m.adoptPercent !== null && eingetragen.ok && eingetragen.value === m.adoptPercent;
    const n = m.numbers;
    const neu = n.available ? n.draft : null;
    const luecke = baseOk && !n.available ? SAMPLE_REASON_TEXTS[n.reason] || T.noExample : null;
    const alleKey = draftKey(t.provider, t.productKey, WEIGHT_CLASS_ALL);
    const alle = savedEffective(t, WEIGHT_CLASS_ALL);
    const betrag = (cents) => (n.available ? formatCents(cents) : "—");
    const neuerWert = (wert) => (
      <dd className="adm-po-figure-new"><span className="sr-only">{T.withDraft}: </span><span aria-hidden="true">→ </span>{wert}</dd>
    );
    return (
      <section className="adm-po-col" data-provider={t.provider} data-tariff={t.id} aria-labelledby={titelId}>
        <div className="adm-po-col-head">
          <h3 className="adm-po-col-title" id={titelId}>{PROVIDER_LABELS[t.provider]}</h3>
          {kopf}
        </div>
        <dl className="adm-po-figures">
          <div className="adm-po-figure" data-figure="purchase">
            <dt>{T.purchase}</dt>
            <dd className="adm-po-figure-value">{betrag(n.purchaseCents)}</dd>
          </div>
          <div className="adm-po-figure" data-figure="customer">
            <dt>{T.customerPays}</dt>
            <dd className="adm-po-figure-value">{betrag(n.customerCents)}</dd>
            {neu && neuerWert(formatCents(neu.customerCents))}
          </div>
          <div className="adm-po-figure" data-figure="earnings">
            <dt>{T.earnings}</dt>
            <dd className="adm-po-figure-value">{betrag(n.contributionCents)}</dd>
            {neu && neuerWert(formatCents(neu.contributionCents))}
          </div>
          <div className="adm-po-figure" data-figure="markup">
            <dt>{T.current}</dt>
            <dd className="adm-po-figure-value">{formatPercent(m.current.percent)}</dd>
            {neu ? neuerWert(formatPercent(neu.percent)) : <dd className="adm-po-figure-note">{sourceText(m.current.source)}</dd>}
          </div>
        </dl>
        {luecke && <p className="adm-po-col-gap">{luecke}</p>}
        {baseOk && x.wartet && <p className="adm-po-col-pending">{previewError ? T.previewFailed : T.previewing}</p>}
        {warnungen.length > 0 && (
          <ul className="adm-po-warnings">
            {warnungen.map((w) => (
              <li key={w.status} className="adm-po-warning" data-status={w.status}>
                <StatusBadge status={w.status} />
                <span className="adm-po-warning-text">{w.draft ? `${T.draftWarning} ` : ""}{w.text}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="adm-po-reco" data-recommendation={m.recommended.percent !== null ? "yes" : "no"}>
          <span className="adm-po-reco-label">{T.recommended}</span>{" "}
          {m.recommended.percent !== null
            ? <strong className="adm-po-reco-value">{formatPercent(m.recommended.percent)}</strong>
            : <strong className="adm-po-reco-none">{T.noRecommendation}</strong>}
          {m.recommended.note && <>{" "}<span className="adm-po-src">{m.recommended.note}</span></>}
        </p>
        <div className="adm-po-actions">
          {m.adoptPercent !== null && (uebernommen
            ? <span className="adm-po-adopted">{T.adopted}</span>
            : (
              <button type="button" className="btn btn-primary btn-sm adm-po-adopt" disabled={saveBusy}
                aria-label={`${T.adopt}: ${t.label}, ${PROVIDER_LABELS[t.provider]}, ${kurz}, ${formatPercent(m.adoptPercent)}`}
                onClick={() => uebernehmen(key, m.adoptPercent, inputId)}>
                {T.adopt}
              </button>
            ))}
          <button type="button" className="btn btn-outline btn-sm adm-po-custom" disabled={saveBusy}
            aria-label={`${T.custom}: ${t.label}, ${PROVIDER_LABELS[t.provider]}, ${kurz}`} onClick={() => selbstFestlegen(key, inputId)}>
            {T.custom}
          </button>
        </div>
        {feldSichtbar(key) && eingabe(key, `${T.newValue} · ${kurz}`)}
        <div className="adm-po-all" data-class={WEIGHT_CLASS_ALL} data-provider={t.provider}>
          <p className="adm-po-all-line">
            <span className="adm-po-all-label">{T.allWeights}</span>{" "}
            <strong className="adm-po-num">{formatPercent(alle.percent)}</strong>{" "}
            <span className="adm-po-src">{alle.source === "all_weights" ? T.ownRate : sourceText(alle.source)}. {T.allWeightsHint}</span>
          </p>
          {feldSichtbar(alleKey) ? eingabe(alleKey, `${T.newValue} · ${T.allWeights}`) : (
            <button type="button" className="btn btn-outline btn-sm adm-po-all-change" disabled={saveBusy}
              aria-label={`${T.allWeights}: ${T.change}, ${t.label}, ${PROVIDER_LABELS[t.provider]}`} onClick={() => selbstFestlegen(alleKey, `adm-tarif-input-${slug(alleKey)}`)}>
              {T.change}
            </button>
          )}
        </div>
      </section>
    );
  };

  // Grund, warum zwei Spalten im gezeigten Paket nicht direkt vergleichbar sind.
  const vergleichsGrund = (cols) => {
    for (const x of cols) {
      if (x && !x.m.numbers.available) return `${PROVIDER_LABELS[x.t.provider]}: ${SAMPLE_REASON_TEXTS[x.m.numbers.reason] || T.noExample}`;
    }
    return SAMPLE_REASON_TEXTS.no_comparable;
  };
  const paketText = (szenario) => (szenario && szenario.package ? `${T.detailExample} ${kgText(szenario.package.weightKg)}` : null);

  // „Möglich: +X € pro Sendung“ je Anbieter (belastbare Empfehlung) bzw. die Wirkung Ihrer Eingabe laut Vorschau.
  const chancen = (cols) => {
    if (!baseOk) return null;
    const liste = cols.filter(Boolean).map((x) => chanceLine(x.t.provider, x.m)).filter(Boolean).sort((p, q) => q.cents - p.cents);
    const wartend = cols.some((x) => x && x.wartet);
    const belastbar = cols.some((x) => x && x.m.recommended.percent !== null);
    if (liste.length === 0) {
      return (
        <div className="adm-po-chance" data-chance="no">
          <p className="adm-po-chance-line adm-po-chance-line--none">{wartend ? (previewError ? T.previewFailed : T.previewing) : belastbar ? T.noHigherRate : T.noRecommendation}</p>
        </div>
      );
    }
    return (
      <div className="adm-po-chance" data-chance="yes">
        <div className="adm-po-chance-lines">
          {liste.map((l) => {
            const x = chanceText(l);
            return (
              <p key={l.provider} className="adm-po-chance-line" data-provider={l.provider} data-art={l.art}>
                <strong className="adm-po-chance-lead">{x.lead}</strong>{" "}<span className="adm-po-chance-detail">{x.detail}</span>
              </p>
            );
          })}
        </div>
        <span className="adm-po-chance-tag">{T.exampleCalc}</span>
      </div>
    );
  };

  // JUMiNGO-Kopf: der Tarif, bei mehreren Kandidaten eine Auswahl (ändert nur die Anzeige, speichert nichts).
  const kandidatKopf = (area, kandidat) => {
    const liste = kandidatenJe[area.id] || [];
    const s = slug(area.id);
    if (liste.length <= 1) return <span className="adm-po-col-tariff">{kandidat.tariff.label}</span>;
    return (
      <fieldset className="adm-po-cands">
        <legend className="adm-po-cands-legend">{T.candidateLegend}</legend>
        {liste.map((c) => (
          <label key={c.tariff.id} className="adm-po-cand" data-tariff={c.tariff.id}>
            <input type="radio" name={`adm-po-cand-${s}`} value={c.tariff.id} checked={c.tariff.id === kandidat.tariff.id}
              onChange={() => setKandidaten((k) => ({ ...k, [area.id]: c.tariff.id }))} />
            <span className="adm-po-cand-name">{c.tariff.label}</span>
            <span className="adm-po-cand-rel">{RELATION_VIEW[c.relation].label}</span>
            {(geaenderteJeTarif[c.tariff.id] || 0) > 0 ? <span className="adm-tarif-dirty adm-po-cand-dirty">● {T.draftPending}</span> : null}
          </label>
        ))}
      </fieldset>
    );
  };

  // ── Details eines Anbieters: Preise, Abholtag, Vergleichsangebot, Einkaufsvorteil, Begründung, alle Pakete ──
  const anbieterDetails = (x, sz) => {
    const { t, wc, m } = x;
    const probe = sampleById(x.bk, sz);
    const v = probe && probe.comparison ? probe.comparison : null;
    const quelle = (!x.wartet && x.pk) || x.bk;
    const begrenzend = quelle ? sampleById(quelle, quelle.limitingScenarioId) : null;
    const proben = quelle && Array.isArray(quelle.samples) ? quelle.samples : [];
    const r = m.row;
    const neu = r.available && m.more.art ? r.neu : null;
    const pfeil = (heute, morgen) => (morgen === null || morgen === undefined ? formatCents(heute) : `${formatCents(heute)} → ${formatCents(morgen)} (${m.more.note})`);
    const grenze = (p, belowFloor) => (p === null || p === undefined ? "—" : belowFloor ? T.upperBoundNoneShort : formatPercent(p));
    const schwach = quelle ? changeWarnings(quelle).includes("weak") : false;
    const abholung = probe && probe.own && probe.own.pickupDate ? probe.own.pickupDate : null;
    const abweichend = !!abholung && !!base.collectionDate && abholung !== base.collectionDate;
    const fehlt = SAMPLE_REASON_TEXTS[probe && probe.reason] || T.noExample;
    return (
      <section key={t.id} className="adm-po-detail-block" data-provider={t.provider}>
        <h4 className="adm-po-detail-head">{PROVIDER_LABELS[t.provider]}: {t.label}</h4>
        <dl className="adm-po-detail-list">
          <div><dt>{T.detailPurchase}</dt><dd>{probe && probe.own ? formatCents(probe.own.purchaseNetCents) : fehlt}</dd></div>
          {r.available && <div><dt>{T.detailCustomer}</dt><dd>{pfeil(r.heute.customerNetCents, neu && neu.customerNetCents)}</dd></div>}
          {r.available && <div><dt>{T.detailContribution}</dt><dd>{pfeil(r.heute.contributionCents, neu && neu.contributionCents)}</dd></div>}
          {abholung && <div><dt>{T.detailPickup}</dt><dd>{formatDay(abholung)}{abweichend ? ` (${T.deviating})` : ""}</dd></div>}
          <div>
            <dt>{T.detailComparison}</dt>
            <dd>
              {v
                ? `${v.label} (${PROVIDER_LABELS[v.provider] || ""}), ${v.relation === "equivalent" ? T.equivalent : T.similar}, ${T.tariffId} ${v.tariffId}: ${T.dialogCustomer} ${formatCents(v.customerNetCents)}${distanceText(probe.differencePercent) ? ` · ${distanceText(probe.differencePercent)}` : ""}`
                : probe && probe.own ? SAMPLE_REASON_TEXTS[probe.reason] || SAMPLE_REASON_TEXTS.no_comparable : fehlt}
            </dd>
          </div>
          {v && <div><dt>{T.purchaseAdvantage}</dt><dd>{advantageText(t.provider, v) || "—"}</dd></div>}
        </dl>
        {quelle && (
          <>
            <p className="adm-po-detail-text"><strong>{T.detailReason}:</strong> {statusText(quelle, t.provider)}{schwach ? ` ${T.dialogWarnWeak}.` : ""}</p>
            <p className="adm-po-detail-text">
              {T.upperBound}: {quelle.upperBoundPercent === null || quelle.upperBoundPercent === undefined ? "—" : quelle.belowFloor ? T.upperBoundNone : formatPercent(quelle.upperBoundPercent)}
              {begrenzend && !quelle.belowFloor ? ` (${T.limitedBy} ${kgText(begrenzend.weightKg)})` : ""}
              {` · ${T.comparedSamples}: ${quelle.comparedSamples} ${T.of} ${quelle.totalSamples}`}
            </p>
          </>
        )}
        {proben.length > 0 && (
          <div className="adm-po-tablewrap">
            <table className="adm-tarif-table adm-po-samples">
              <caption className="sr-only">{T.samplesTitle}: {PROVIDER_LABELS[t.provider]}, {t.label}, {klassenKurz(t, wc)}</caption>
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
        )}
      </section>
    );
  };

  // ── Details einer Klasse: Abholzuschlag (UPS Standard), Beispielpaket und Bedingungen, je Anbieter, Datenbasis ──
  const details = ({ cols, sz, sd, tg }) => {
    const szenario = scenarioOf(base, sz);
    const pkg = szenario && szenario.package ? szenario.package : null;
    const c = base.conditions || {};
    const s = slug((tg || cols[0].t).id);
    return (
      <div className="adm-po-details">
        {tg && hasSameDay(base, tg.provider, tg.productKey) && (
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
        <section className="adm-po-detail-block">
          <h4 className="adm-po-detail-head">{T.detailExample}</h4>
          <dl className="adm-po-detail-list">
            <div>
              <dt>{T.detailPackage}</dt>
              <dd>{pkg ? packageLabel(pkg) : T.noExample}{szenario && szenario.chargeableKg !== null && szenario.chargeableKg !== undefined && pkg && szenario.chargeableKg !== pkg.weightKg ? ` (${kgText(szenario.chargeableKg)} ${T.chargeable})` : ""}</dd>
            </div>
            <div><dt>{T.detailDestination}</dt><dd>{LAENDERNAMEN[base.destinationCountry] || base.destinationCountry}</dd></div>
            <div><dt>{T.detailCollection}</dt><dd>{formatDay(base.collectionDate)}</dd></div>
            <div><dt>{T.detailSender}</dt><dd>{c.sender ? `${c.sender.street}, ${c.sender.postalCode} ${c.sender.city}` : "—"}</dd></div>
            <div><dt>{T.detailRecipient}</dt><dd>{c.recipient ? `${c.recipient.street}, ${c.recipient.postalCode} ${c.recipient.city}` : "—"}</dd></div>
            <div><dt>{T.detailConditions}</dt><dd>{T.detailConditionsText}</dd></div>
            {sd && (
              <div>
                <dt>{T.detailSurcharges}</dt>
                <dd>{T.sameDayWith} {formatCents(base.sameDayReference && base.sameDayReference.feeNetCents)} ({PROVIDER_LABELS.transglobal}, {tg.label})</dd>
              </div>
            )}
          </dl>
        </section>
        {cols.map((x) => anbieterDetails(x, sz))}
        <p className="adm-po-detail-text">{T.howRecommended}</p>
        <p className="adm-po-detail-text"><strong>{T.detailBasis}:</strong> {T.stand} {formatStand(base.createdAt)}, {T.validUntil} {formatStand(base.expiresAt)}.</p>
        <p className="adm-po-detail-text adm-po-detail-note">{T.contributionNote}</p>
      </div>
    );
  };

  // ── Ein geöffneter Bereich: Reiter, Kernaussage, „Möglich“, Transglobal | JUMiNGO, Details, Speichern ──
  const bereichPanel = (area) => {
    const tg = area.transglobal;
    const s = slug(area.id);
    const wc = aktiveKlasse(tg);
    const kandidat = gewaehlt(area);
    const ju = kandidat ? kandidat.tariff : null;
    const sd = sdFuer(tg);
    const tgBk = baseOk ? projectionClass(base, tg.provider, tg.productKey, wc, { sameDay: sd }) : null;
    const juBk = baseOk && ju ? projectionClass(base, ju.provider, ju.productKey, wc) : null;
    const sz = baseOk ? commonScenarioId(tgBk, juBk) : null;
    const a = auswertungFuer(tg, wc, sd, sz);
    const b = ju ? auswertungFuer(ju, wc, false, sz) : null;
    const link = baseOk && ju ? pairLink({ tgClass: tgBk, juClass: juBk, tgProductKey: tg.productKey, isPair: !!area.pair && ju.id === area.pair.id, scenarioId: sz }) : null;
    const urteil = verdictOf({
      hasBase: baseOk, link,
      tgPurchaseCents: a.m.numbers.available ? a.m.numbers.purchaseCents : null,
      juPurchaseCents: b && b.m.numbers.available ? b.m.numbers.purchaseCents : null,
    });
    const beziehung = !ju ? "none" : !baseOk ? kandidat.relation : link ? link.relation : "none";
    const paket = paketText(scenarioOf(base, sz));
    return (
      <>
        {reiter(tg, wc, bereichsTarife(area))}
        <div className="adm-po-tabpanel" role="tabpanel" id={`adm-po-tabpanel-${s}`} aria-labelledby={`adm-po-tab-${s}-${wc}`} data-class={wc}>
          <div className="adm-po-verdict" data-verdict={urteil} data-relation={beziehung}>
            <p className="adm-po-verdict-text">{VERDICT_TEXTS[urteil]}</p>
            <p className="adm-po-verdict-meta">
              {urteil === "not_compared" ? T.numbersAfterCompare : (
                <>
                  {urteil !== "none" && <Beziehung relation={beziehung} />}
                  {paket && <span className="adm-po-verdict-pkg">{paket}</span>}
                  {urteil === "none" && <span className="adm-po-verdict-why">{ju ? vergleichsGrund([a, b]) : T.noPartner}</span>}
                </>
              )}
            </p>
          </div>
          {chancen([a, b])}
          <div className="adm-po-cols">
            {spalte(a, <><span className="adm-po-col-tariff">{tg.label}</span>{sd && <span className="adm-po-src">{T.withSameDay}</span>}</>)}
            {b ? spalte(b, kandidatKopf(area, kandidat)) : (
              <section className="adm-po-col adm-po-col--empty" data-provider="jumingo" aria-labelledby={`adm-po-col-${s}-ju`}>
                <div className="adm-po-col-head"><h3 className="adm-po-col-title" id={`adm-po-col-${s}-ju`}>{PROVIDER_LABELS.jumingo}</h3></div>
                <p className="adm-po-col-gap">{T.noPartner}</p>
              </section>
            )}
          </div>
          {baseOk && <AdminSubDisclosure id={`adm-po-details-${s}`} title={T.details}>{details({ cols: [a, b].filter(Boolean), sz, sd, tg })}</AdminSubDisclosure>}
        </div>
        {speicherLeiste()}
      </>
    );
  };

  // ── Eine Gruppe aus „Weitere JUMiNGO-Tarife“: dieselbe Bedienung, eine Spalte ──
  const weiterePanel = (j) => {
    const s = slug(j.id);
    const wc = aktiveKlasse(j);
    const bk = baseOk ? projectionClass(base, j.provider, j.productKey, wc) : null;
    const sz = bk ? commonScenarioId(null, bk) : null;
    const x = auswertungFuer(j, wc, false, sz);
    const probe = sampleById(bk, sz);
    const gegen = probe && probe.own && probe.comparison && probe.comparison.provider === "transglobal"
      ? tgTarife.find((t) => String(t.productKey) === String(probe.comparison.tariffId)) || null : null;
    const urteil = !baseOk ? "not_compared" : gegen ? "similar" : "none";
    const paket = paketText(scenarioOf(base, sz));
    return (
      <>
        {j.note && <p className="adm-markup-help adm-po-note">{j.note}</p>}
        {reiter(j, wc, [j])}
        <div className="adm-po-tabpanel" role="tabpanel" id={`adm-po-tabpanel-${s}`} aria-labelledby={`adm-po-tab-${s}-${wc}`} data-class={wc}>
          <div className="adm-po-verdict" data-verdict={urteil}>
            <p className="adm-po-verdict-text">
              {urteil === "not_compared" ? VERDICT_TEXTS.not_compared
                : gegen ? `${T.similarTo} ${gegen.label} (${PROVIDER_LABELS.transglobal}).` : VERDICT_TEXTS.none}
            </p>
            <p className="adm-po-verdict-meta">
              {urteil === "not_compared" ? T.numbersAfterCompare : (
                <>
                  {gegen && <Beziehung relation={probe.comparison.relation === "equivalent" ? "equivalent" : "similar"} />}
                  {paket && <span className="adm-po-verdict-pkg">{paket}</span>}
                  {!gegen && <span className="adm-po-verdict-why">{vergleichsGrund([x])}</span>}
                </>
              )}
            </p>
          </div>
          {chancen([x])}
          <div className="adm-po-cols adm-po-cols--single">{spalte(x, <span className="adm-po-col-tariff">{j.label}</span>)}</div>
          {baseOk && <AdminSubDisclosure id={`adm-po-details-${s}`} title={T.details}>{details({ cols: [x], sz, sd: false, tg: null })}</AdminSubDisclosure>}
        </div>
        {speicherLeiste()}
      </>
    );
  };

  // ── Zeile der Übersicht: Tarif mit Beziehung | Transglobal | JUMiNGO — öffnet den Bereich. „Möglich bis“ (plus)
  //    kommt aus bestChanceCents: dieselben Beispielpakete wie in der geöffneten Fläche. ──
  // „Weitere JUMiNGO-Tarife (n)“ — auch eingeklappt mit Zähler, sobald dort ein ungespeicherter Entwurf liegt.
  const weitereTitel = () => {
    const n = extra.reduce((z, j) => z + (geaenderteJeTarif[j.id] || 0), 0);
    return (
      <>
        {`${T.moreTariffs} (${extra.length})`}
        {n > 0 ? <>{" "}<span className="adm-tarif-dirty adm-po-more-dirty">● {n} {n === 1 ? T.unsavedOne : T.unsaved}</span></> : null}
      </>
    );
  };

  const zeile = ({ id, label, relation, zellen, panel, plus, gezaehlt = zellen }) => {
    const offen = selected === id;
    const s = slug(id);
    const sums = zellen.map((t) => (t ? summaries[t.id] : null));
    const offenGezaehlt = gezaehlt.reduce((n, t) => n + (t ? geaenderteJeTarif[t.id] || 0 : 0), 0);
    return (
      <li key={id} className={`adm-po-tarif${offen ? " is-open" : ""}`} data-tariff={id}>
        <button type="button" className="adm-po-tarif-head" id={`adm-po-head-${s}`} aria-expanded={offen ? "true" : "false"} aria-controls={`adm-po-panel-${s}`}
          onClick={() => setSelected(offen ? null : id)}>
          <span className="adm-po-tarif-title"><span className="adm-po-tarif-name">{label}</span><Beziehung relation={relation} /></span>
          <span className="adm-po-cells">
            {TARIFF_PROVIDERS.map((p, i) => (zellen[i] ? (
              <span key={p} className="adm-po-cell" data-provider={p} data-tariff={zellen[i].id}>
                <span className="adm-po-cell-label">{PROVIDER_LABELS[p]}</span>{" "}
                <strong className="adm-po-num adm-po-cell-value">{rangeText(sums[i].today)}</strong>
                {markeKurz(sums[i].status)}
              </span>
            ) : <span key={p} className="adm-po-cell adm-po-cell--empty" data-provider={p} aria-hidden="true" />))}
          </span>
          {(plus > 0 || offenGezaehlt > 0) && (
            <span className="adm-po-tarif-meta">
              {plus > 0 && <span className="adm-po-plus">{T.possibleUpTo} {formatSignedCents(plus)} {T.perShipment}</span>}
              {offenGezaehlt > 0 && <span className="adm-tarif-dirty adm-po-tarif-dirty">● {offenGezaehlt} {offenGezaehlt === 1 ? T.unsavedOne : T.unsaved}</span>}
            </span>
          )}
          <span className="adm-tech-caret" aria-hidden="true" />
        </button>
        <div className="adm-po-panel" id={`adm-po-panel-${s}`} role="region" aria-labelledby={`adm-po-head-${s}`} hidden={!offen}>
          {offen ? panel() : null}
        </div>
      </li>
    );
  };
  const weitereBeziehung = (j) => {
    const liste = extraComparedWith(basis, j, tgTarife);
    return liste.length === 0 ? "none" : liste.some((x) => x.relation === "equivalent") ? "equivalent" : "similar";
  };

  // ── Speichern: ein Weg für alle Entwürfe; steht in der offenen Fläche, sonst unter der Übersicht ──
  const speicherLeiste = () => (
    <div className="adm-po-save">
      <div className="adm-tarif-savebar">
        <span className={changes.count > 0 ? "adm-tarif-dirty" : "adm-tarif-clean"} role="status" aria-live="polite" id="adm-tarif-dirty">
          {changes.count > 0 ? `● ${changes.count} ${changes.count === 1 ? T.unsavedOne : T.unsaved}` : T.noChanges}
        </span>
        <span className="adm-po-save-actions">
          {changes.count > 0 && (
            <button type="button" id="adm-tarif-discard" className="btn btn-outline btn-sm" onClick={verwerfen} disabled={saveBusy}>{T.discard}</button>
          )}
          <button type="button" id="adm-tarif-save" className="btn btn-primary btn-sm" onClick={pruefen} disabled={saveBusy || changes.count === 0}>
            {T.save}
          </button>
        </span>
      </div>
      {invalidKeys.length > 0 && Object.keys(touched).some((k) => changes.invalid[k]) && (
        <p className="field-error" role="alert">
          {invalidKeys.map((k) => {
            const [provider, productKey, wc] = k.split(":");
            const t = tariffById[tariffKey(provider, Number(productKey))];
            return t ? `${t.label} (${PROVIDER_LABELS[t.provider]}) · ${klassenKurz(t, Number(wc))}: ${changes.invalid[k]}` : changes.invalid[k];
          }).join(" ")}
        </p>
      )}
      {saveMsg && saveMsg.type === "success" && <div className="alert alert-success" role="status" tabIndex={-1} ref={meldungRef}>{saveMsg.text}</div>}
      {saveMsg && saveMsg.type === "info" && <div className="alert alert-info" role="status">{saveMsg.text}</div>}
      {saveMsg && saveMsg.type === "error" && <div className="alert alert-error" role="alert">{saveMsg.text}</div>}
    </div>
  );

  // ── Bestätigungsdialog: jede Änderung „Tarif · Anbieter · Gewicht“, Bisher → Neu, Wirkung, Datum der Basis, Hinweise ──
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
              const r = profitRow(projectionClass(base, t.provider, t.productKey, wc, { sameDay: sd }), pk, paketFuer(t, wc));
              if (r.available && r.art === "draft") {
                wirkungen.push({ wc, r });
                for (const w of changeWarnings(pk, r)) warnungen.add(w);
              }
            }
          }
          return (
            <li key={key} className="adm-po-change" data-key={key}>
              <span className="adm-po-change-name">{t.label} · {PROVIDER_LABELS[t.provider]} · {klassenKurz(t, e.weightClass)}</span>
              <span className="adm-po-change-values">
                {T.before}: <span className="adm-po-num">{bisher}</span>{" → "}{T.after}: <strong className="adm-po-num">{neu}</strong>
              </span>
              {wirkungen.map(({ wc, r }) => (
                <span key={wc} className="adm-po-change-impact">
                  {klassenKurz(t, wc)}, {T.dialogExample} {kgText(r.weightKg)}: {T.dialogCustomer} {formatCents(r.neu.customerNetCents)} {T.dialogInstead} {formatCents(r.heute.customerNetCents)}
                  {distanceText(r.neu.differencePercent) ? ` · ${distanceText(r.neu.differencePercent)}` : ""}
                </span>
              ))}
              {baseOk && !vorschau && <span className="adm-po-change-impact">{T.previewing}</span>}
              {warnungen.size > 0 && (
                <span className="adm-po-change-warn">
                  {[...warnungen].map((w) => (
                    <span key={w} className={`badge badge--${w === "at_risk" || w === "no_earnings" ? "warning" : "neutral"} adm-po-badge`} data-warning={w}>
                      <span className="adm-po-dot" aria-hidden="true" />
                      {w === "at_risk" ? T.dialogWarnAtRisk : w === "no_earnings" ? T.dialogWarnNoEarnings : w === "weak" ? T.dialogWarnWeak : T.dialogWarnNone}
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
  const revertGrund = (reason) => (reason === "current" ? T.revertCurrent : T.revertUnknown);
  const eigeneZeilen = customBase ? customRows(customBase) : [];
  const weitereOffenGezeigt = weitereOffen || extra.some((j) => j.id === selected);

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
          <div className="adm-po-compare">
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
                {baseOk ? `${T.stand}: ${formatStand(base.createdAt)}` : T.noBase}
                {previewBusy ? ` · ${T.previewing}` : ""}
              </span>
            </div>
            {refreshError && <div className="alert alert-error" role="alert">{refreshError.text}</div>}
            {previewError && !previewError.stale && <div className="alert alert-error" role="alert">{previewError.text}</div>}
            {(baseStatus === "stale" || baseStatus === "expired" || (baseStatus === "missing" && serverStale)) && (
              <p className="adm-tarif-note adm-tarif-note--warn" role="status"><strong>{T.refreshRequired}.</strong> {T.refreshRequiredDetail}</p>
            )}
          </div>

          <div className="adm-po-tariffs adm-po-tariffs--main">
            <div className="adm-po-ledger-head" aria-hidden="true">
              <span>{T.colTariff}</span><span>{PROVIDER_LABELS.transglobal}</span><span>{PROVIDER_LABELS.jumingo}</span><span />
            </div>
            <ul className="adm-po-list" aria-label={T.overview}>
              {areas.map((area) => {
                const kandidat = gewaehlt(area);
                return zeile({
                  id: area.id, label: area.label, relation: kandidat ? kandidat.relation : "none",
                  zellen: [area.transglobal, kandidat ? kandidat.tariff : null], gezaehlt: bereichsTarife(area), panel: () => bereichPanel(area),
                  plus: bestChanceCents({ base: basis, transglobal: area.transglobal, jumingo: kandidat ? kandidat.tariff : null, sameDay: sdFuer(area.transglobal) }),
                });
              })}
            </ul>
          </div>
          {(selected === null || !tariffById[selected]) && (changes.count > 0 || saveMsg) && speicherLeiste()}

          {extra.length > 0 && (
            <AdminSubDisclosure id="adm-po-more" title={weitereTitel()} open={weitereOffenGezeigt}
              onOpenChange={(o) => { setWeitereOffen(o); if (!o && extra.some((j) => j.id === selected)) setSelected(null); }}>
              <p className="adm-markup-help adm-po-more-hint">{T.moreTariffsHint}</p>
              <div className="adm-po-tariffs adm-po-tariffs--more">
                <ul className="adm-po-list" aria-label={T.moreTariffs}>
                  {extra.map((j) => zeile({ id: j.id, label: j.label, relation: weitereBeziehung(j), zellen: [null, j], panel: () => weiterePanel(j), plus: bestChanceCents({ base: basis, jumingo: j }) }))}
                </ul>
              </div>
            </AdminSubDisclosure>
          )}

          <AdminSubDisclosure id="adm-po-history" title={T.historyTitle} open={historyOpen}
            onOpenChange={(o) => { setHistoryOpen(o); if (o) verlaufLaden(); }}>
            {history.loading ? <p className="adm-tarif-note" role="status">{T.historyLoading}</p>
              : history.error ? <div className="alert alert-error" role="alert">{history.error}</div>
                : verlauf && verlauf.length === 0 ? <p className="adm-tarif-note">{T.historyEmpty}</p>
                  : verlauf ? (
                    <ul className="adm-po-history">
                      {verlauf.map((e) => {
                        const rv = historyRevert(e, tariffs);
                        return (
                          <li key={e.id} className="adm-po-history-item" data-entry={e.id}>
                            <span className="adm-po-history-when">{formatStand(e.at)} · {e.actorName}</span>
                            <span className="adm-po-history-what">
                              {e.tariffLabel} · {PROVIDER_LABELS[e.provider]} · {weightTabLabel(e.classLabel)}:{" "}
                              <span className="adm-po-num">{historyValue(e.before)}</span>{" → "}<span className="adm-po-num">{historyValue(e.after)}</span>
                            </span>
                            {rv.allowed
                              ? <button type="button" className="btn btn-outline btn-xs" onClick={() => zuruecksetzen(rv)} disabled={saveBusy}>{T.revert}</button>
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
