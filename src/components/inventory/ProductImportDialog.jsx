import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InventoryDialog, InlineError } from "./InventoryShared";
import { Werte } from "../ui/Werte";
import {
  analyzeInventoryImport, getOpenInventoryImport, getInventoryImport, getInventoryImportRows,
  applyInventoryImport, recheckInventoryImport, discardInventoryImport, createWarehouse, getWarehouses,
} from "../../api/inventoryApi";
import { isApiTimeout } from "../../api/client";
import { inventoryErrorText } from "../../utils/inventoryView.mjs";
import { formatUnits } from "../../utils/inventoryFormat.mjs";
import { decodeText, detectDelimiter, parseCsv, ImportReadError } from "../../utils/inventoryImportCsv.mjs";
import { readXlsx, defaultSheetIndex } from "../../utils/inventoryImportXlsx.mjs";
import {
  IMPORT_FIELDS, DIMENSION_FIELDS, suggestMapping, headerUnit, dimensionUnitsDiffer, mappingProblems, numberFormatEvidence,
} from "../../utils/inventoryImportMapping.mjs";
import { buildImportDocument, toCsv, templateCsv } from "../../utils/inventoryImportDocument.mjs";
import {
  issueText, applyCodeText, targetText, beforeAfterText, roundingNote, stockText, datumText, FIELD_LABELS, ACTION_LABELS,
  APPLY_STATUS_LABELS, readErrorText,
} from "../../utils/inventoryImportText.mjs";

/* ── Artikel importieren ─────────────────────────────────────────────────────
   Vier Schritte in EINEM Dialog: Datei auswählen → Spalten prüfen → Vorschau →
   Übernahme und Ergebnis. Die Datei wird im Browser gelesen; der Server prüft jede
   Zeile, zeigt die Vorschau, ohne etwas zu ändern, und übernimmt erst nach der
   Bestätigung — in Abschnitten, wiederholbar ohne Doppelbuchung (Backend
   lib/inventoryImport.js). Bestand ändert sich nur über Wareneingang oder
   Zählbestand-Korrektur; „Lager“ meint den eigenen Bestand des Kunden.

   Ein offener Vorgang (Vorschau oder unterbrochene Übernahme) wird beim Öffnen
   geladen und kann fortgesetzt oder abgeschlossen werden. */

const STOCK_MODES = Object.freeze([
  { value: "counted", title: "Bestand übernehmen", text: "Ihr gezählter Bestand ersetzt den Bestand im Lager. Die Differenz wird als Inventurkorrektur gebucht." },
  { value: "receipt", title: "Wareneingang buchen", text: "Die Menge aus der Datei wird zum vorhandenen Bestand addiert." },
  { value: "none", title: "Bestand nicht ändern", text: "Es werden nur Artikeldaten angelegt oder aktualisiert." },
]);

const PROBLEM_TEXTS = Object.freeze({
  SKU_UNMAPPED: "Bitte ordnen Sie die Spalte mit der Artikelnummer zu.",
  COLUMN_TWICE: "Eine Spalte ist mehreren Feldern zugeordnet.",
  WEIGHT_UNIT_MISSING: "Bitte wählen Sie die Einheit des Gewichts.",
  LENGTH_UNIT_MISSING: "Bitte wählen Sie die Einheit der Maße.",
  STOCK_UNMAPPED: "Bitte ordnen Sie die Bestandsspalte zu oder wählen Sie „Bestand nicht ändern“.",
  NUMBER_FORMAT_MISSING: "Bitte wählen Sie das Zahlformat der Datei.",
  WAREHOUSE_MISSING: "Für Bestände brauchen Sie ein Lager.",
  WAREHOUSES_LOADING: "Die Lager werden noch geladen.",
  WAREHOUSES_FAILED: "Die Lager konnten nicht geladen werden.",
});
const WAREHOUSE_LIMIT = 100;

const PAGE = 100;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
// Obergrenze des Servers für das Importdokument (routes/inventoryImports.js, DOCUMENT_MAX_BYTES).
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
// So viele betroffene Artikel nennt die Warnung zur möglichen Doppelbuchung selbst; alle zeigt der Filter.
const REPEAT_PREVIEW = 5;
const LANGE_BESCHREIBUNG = 140;
const WEIGHT_UNIT_OPTIONS = [["kg", "Kilogramm (kg)"], ["g", "Gramm (g)"]];
const LENGTH_UNIT_OPTIONS = [["cm", "Zentimeter (cm)"], ["mm", "Millimeter (mm)"], ["m", "Meter (m)"]];
const STEPS = { file: 1, mapping: 2, preview: 3, apply: 4, result: 4 };
const STEP_TITLES = { file: "Datei auswählen", mapping: "Spalten prüfen", preview: "Vorschau", apply: "Übernahme", result: "Ergebnis" };

// Zahl mit Einzahl oder Mehrzahl: „1 Zeile“, „2 Zeilen“.
const anzahl = (n, eins, mehr) => `${formatUnits(n)} ${n === 1 ? eins : mehr}`;

function speichereCsv(text, dateiname) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = dateiname;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

const heute = () => new Date().toISOString().slice(0, 10);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function zellText(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toLocaleDateString("de-DE");
  if (typeof v === "number") return v.toLocaleString("de-DE", { maximumFractionDigits: 6, useGrouping: false });
  return String(v);
}

function ersteZeileMitInhalt(rows) {
  return rows.findIndex((r) => Array.isArray(r) && r.some((v) => zellText(v).trim() !== ""));
}

function beispiele(rows, headerIndex, col) {
  const out = [];
  for (let i = headerIndex + 1; i < rows.length && out.length < 2; i++) {
    const t = zellText((rows[i] || [])[col]).trim();
    if (t) out.push(t.length > 40 ? `${t.slice(0, 37)}…` : t);
  }
  return out;
}

// „3 von 10 Zeilen haben dieselbe Artikelnummer und Menge wie …“ — mit dem Anteil der letzten 7 Tage.
function wiederholSatz(n, total, jung) {
  const kopf = `${formatUnits(n)} von ${anzahl(total, "Zeile", "Zeilen")} ${n === 1 ? "hat" : "haben"} dieselbe Artikelnummer und Menge wie`;
  if (jung > 0 && jung >= n) return `${kopf} ein Wareneingang, der in den letzten 7 Tagen in dieses Lager gebucht wurde.`;
  if (jung > 0) return `${kopf} ein früherer Wareneingang in diesem Lager, ${formatUnits(jung)} davon aus den letzten 7 Tagen.`;
  return `${kopf} ein früherer Wareneingang in diesem Lager.`;
}

// Textanfang bis zur letzten Wortgrenze vor `max` Zeichen.
function anfang(text, max) {
  const kurz = text.slice(0, max);
  const grenze = kurz.lastIndexOf(" ");
  return (grenze > max * 0.6 ? kurz.slice(0, grenze) : kurz).replace(/[\s.,;:–-]+$/, "");
}

// Geplante Werte einer Zeile als Raster: neue Artikel mit jedem Zielwert, aktualisierte mit
// Vorher → Nachher. Die Werte kommen unverändert vom Server (genau die zu speichernden).
function ZeilenWerte({ row }) {
  const changes = Array.isArray(row.changes) ? row.changes : [];
  if (changes.length === 0 || (row.action !== "create" && row.action !== "update")) return null;
  const neu = row.action === "create";
  return (
    <dl className="inv-import-values" aria-label={neu ? "Werte des neuen Artikels" : "Geänderte Werte"}>
      {changes.map((c) => {
        // Der Wert selbst; eine Rundung durch die Spaltengenauigkeit steht als eigene Zeile darunter.
        const ohneRundung = { ...c, fileValue: undefined };
        const text = neu ? targetText(ohneRundung) : beforeAfterText(ohneRundung);
        const rundung = roundingNote(c);
        const breit = c.field === "name" || c.field === "description";
        // Eine lange Beschreibung eines neuen Artikels klappt auf, statt die Zeile zu sprengen.
        const lang = neu && c.field === "description" && typeof c.after === "string" && c.after.length > LANGE_BESCHREIBUNG;
        return (
          <div key={c.field} className={`inv-import-value${breit ? " inv-import-value--wide" : ""}`}>
            <dt>{FIELD_LABELS[c.field] || c.field}</dt>
            <dd>
              {lang ? (
                <details className="inv-import-value-more">
                  <summary>{`${anfang(c.after, LANGE_BESCHREIBUNG - 20)}… `}<span className="inv-import-value-toggle">ganz anzeigen</span></summary>
                  <p>{c.after}</p>
                </details>
              ) : text}
              {rundung && <span className="inv-import-value-note">{rundung}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function badgeOf(row) {
  if (row.applyStatus === "applied") return ["badge--success", "Übernommen"];
  if (row.applyStatus === "failed") return ["badge--error", APPLY_STATUS_LABELS.failed];
  if (row.applyStatus === "stale" || row.applyStatus === "cancelled") return ["badge--warning", APPLY_STATUS_LABELS[row.applyStatus]];
  if (row.action === "error") return ["badge--error", "Fehler"];
  if (row.action === "create") return ["badge--success", ACTION_LABELS.create];
  if (row.action === "update") return ["badge--info", ACTION_LABELS.update];
  return ["badge--neutral", ACTION_LABELS[row.action] || ""];
}

export function ProductImportDialog({ open, onClose, onImported }) {
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [interrupted, setInterrupted] = useState(false);

  const [file, setFile] = useState(null);
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState({});
  const [status, setStatus] = useState({});
  // Einheit je Gewichts- und Maßfeld (weightKg, lengthCm, widthCm, heightCm).
  const [units, setUnits] = useState({});
  const [numberFormat, setNumberFormat] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [stockMode, setStockMode] = useState("counted");
  const [stockModeTouched, setStockModeTouched] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [lager, setLager] = useState([]);
  // "loading" | "ready" | "error" — „Hauptlager anlegen“ nur bei belegt leerer Liste, nie nach einem Ladefehler.
  const [lagerStatus, setLagerStatus] = useState("loading");
  const [warehouseId, setWarehouseId] = useState(null);
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);

  const [imp, setImp] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [nextAfter, setNextAfter] = useState(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [confirmRepeat, setConfirmRepeat] = useState(false);
  const [repeatRows, setRepeatRows] = useState([]);
  const [leereZeilen, setLeereZeilen] = useState(null);
  const [exporting, setExporting] = useState(false);

  const inputRef = useRef(null);
  const headingRef = useRef(null);
  const rowSeq = useRef(0);
  const repeatSeq = useRef(0);

  const busy = reading || analyzing || applying || creatingWarehouse;

  // Fokus auf die Überschrift jedes Schritts — Tastatur und Screenreader folgen dem Ablauf.
  useEffect(() => { if (open && phase !== "loading") headingRef.current?.focus(); }, [open, phase]);

  const ladeZeilen = useCallback(async (importId, f, after = null) => {
    const meins = ++rowSeq.current;
    setLoadingRows(true);
    try {
      const res = await getInventoryImportRows(importId, { filter: f, after: after ?? undefined, limit: PAGE });
      const body = await res.json().catch(() => null);
      if (rowSeq.current !== meins) return;
      if (!res.ok) { setError(inventoryErrorText(body, "Die Zeilen konnten nicht geladen werden.")); return; }
      setRows((cur) => (after ? [...cur, ...(body.rows || [])] : body.rows || []));
      setNextAfter(body.nextAfter ?? null);
    } catch {
      if (rowSeq.current === meins) setError("Die Zeilen konnten nicht geladen werden.");
    } finally {
      if (rowSeq.current === meins) setLoadingRows(false);
    }
  }, []);

  // Die ersten Zeilen mit möglicher Doppelbuchung für die Warnung (unabhängig vom gewählten Filter).
  const ladeWiederholungen = useCallback(async (header) => {
    const meins = ++repeatSeq.current;
    const anzahlTreffer = (header.counts && header.counts.repeatRows) || 0;
    setRepeatRows([]);
    if (header.status !== "analyzed" || (!header.repeat && anzahlTreffer === 0)) return;
    try {
      const res = await getInventoryImportRows(header.id, { filter: "repeat", limit: REPEAT_PREVIEW });
      const body = await res.json().catch(() => null);
      // Eine späte Antwort einer früheren Analyse überschreibt die Liste nicht.
      if (repeatSeq.current === meins && res.ok && body && Array.isArray(body.rows)) setRepeatRows(body.rows);
    } catch { /* die Warnung bleibt ohne Liste verständlich; die Zeilen tragen ihre Hinweise */ }
  }, []);

  const zeigeVorschau = useCallback(async (header, f) => {
    setImp(header);
    setFilter(f);
    setRows([]);
    setNextAfter(null);
    setPhase(header.status === "applying" || header.status === "completed" ? "result" : "preview");
    ladeWiederholungen(header);
    await ladeZeilen(header.id, f);
  }, [ladeZeilen, ladeWiederholungen]);

  // Lager selbst laden: Die Liste der Seite kann beim Öffnen noch fehlen, und ein stiller
  // Ladefehler darf nicht wie „kein Lager“ aussehen (sonst entstünde ein zweites Hauptlager).
  const ladeLager = useCallback(async (istAktiv = () => true) => {
    setLagerStatus("loading");
    try {
      const res = await getWarehouses({ limit: WAREHOUSE_LIMIT });
      const body = await res.json().catch(() => null);
      if (!istAktiv()) return;
      if (!res.ok || !body || !Array.isArray(body.warehouses)) { setLagerStatus("error"); return; }
      const aktive = body.warehouses.filter((w) => w.status !== "inactive");
      setLager(aktive);
      setWarehouseId((aktive.find((w) => w.isDefault) || aktive[0] || {}).id || null);
      setLagerStatus("ready");
    } catch {
      if (istAktiv()) setLagerStatus("error");
    }
  }, []);

  // Beim Öffnen: Zustand zurücksetzen, Lager und offenen Vorgang laden.
  useEffect(() => {
    if (!open) return undefined;
    let aktiv = true;
    setPhase("loading"); setError(""); setFile(null); setTable(null); setImp(null); setRows([]);
    setSkipInvalid(false); setConfirmRepeat(false); setInterrupted(false); setStockModeTouched(false);
    setRepeatRows([]); setLeereZeilen(null);
    setLager([]); setWarehouseId(null);
    ladeLager(() => aktiv);
    getOpenInventoryImport().then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!aktiv) return;
      if (res.ok && body && body.import) {
        const h = body.import;
        await zeigeVorschau(h, h.status === "applying" ? "problems" : (h.counts && h.counts.error > 0 ? "error" : "all"));
        if (h.status === "applying") setInterrupted(true);
      } else setPhase("file");
    }).catch(() => { if (aktiv) setPhase("file"); });
    return () => { aktiv = false; };
  }, [open, zeigeVorschau, ladeLager]);

  // ── Schritt 1: Datei lesen ────────────────────────────────────────────────
  const vorbereiten = (tabelle, formulas, meta, errors = new Map()) => {
    const headerIndex = ersteZeileMitInhalt(tabelle);
    if (headerIndex < 0 || headerIndex >= tabelle.length - 1) throw new ImportReadError("NO_DATA");
    const headers = (tabelle[headerIndex] || []).map((v) => zellText(v).trim());
    const s = suggestMapping(headers);
    setTable({ rows: tabelle, formulas, errors, headerIndex, headers });
    setMapping(s.mapping);
    setStatus(s.status);
    setUnits(s.units);
    if (!stockModeTouched) setStockMode(s.mapping.stock !== undefined ? "counted" : "none");
    const ev = numberFormatEvidence(tabelle.slice(headerIndex + 1), s.mapping);
    setEvidence(ev);
    setNumberFormat(ev.needsChoice ? null : ev.suggested || (meta.type === "csv" && meta.delimiter === "," ? "intl" : "de"));
  };

  const dateiGewaehlt = async (f) => {
    if (!f) return;
    setError("");
    const name = f.name || "";
    const endung = name.toLowerCase().split(".").pop();
    if (endung !== "csv" && endung !== "xlsx") { setError(readErrorText("FILE_TYPE")); return; }
    if (f.size === 0) { setError(readErrorText("FILE_EMPTY")); return; }
    if (f.size > MAX_FILE_BYTES) { setError(readErrorText("FILE_TOO_LARGE")); return; }
    setReading(true);
    try {
      const buffer = await f.arrayBuffer();
      if (endung === "csv") {
        const { text, encoding } = decodeText(new Uint8Array(buffer));
        const erkannt = detectDelimiter(text);
        const delimiter = erkannt || ";";
        const tabelle = parseCsv(text, delimiter);
        setFile({ name, type: "csv", encoding, delimiter, delimiterDetected: Boolean(erkannt), text, sheets: null, sheetIndex: 0 });
        vorbereiten(tabelle, new Set(), { type: "csv", delimiter });
      } else {
        const sheets = await readXlsx(buffer);
        // Vorwahl: erstes sichtbares Blatt mit Daten; ein ausgeblendetes nur, wenn sonst keines Daten hat.
        const idx = defaultSheetIndex(sheets, (rows) => ersteZeileMitInhalt(rows) >= 0);
        if (idx < 0) throw new ImportReadError(sheets.some((s) => s.blocked) ? sheets.find((s) => s.blocked).blocked : "NO_DATA");
        setFile({ name, type: "xlsx", encoding: null, delimiter: null, delimiterDetected: true, text: null, sheets, sheetIndex: idx });
        vorbereiten(sheets[idx].rows, sheets[idx].formulas, { type: "xlsx" }, sheets[idx].errors);
      }
      setPhase("mapping");
    } catch (e) {
      setError(e instanceof ImportReadError ? readErrorText(e.code, e.params) : readErrorText("XLSX_UNREADABLE"));
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const trennzeichenAendern = (delimiter) => {
    try {
      const tabelle = parseCsv(file.text, delimiter);
      setFile({ ...file, delimiter, delimiterDetected: true });
      vorbereiten(tabelle, new Set(), { type: "csv", delimiter });
      setError("");
    } catch (e) {
      setError(e instanceof ImportReadError ? readErrorText(e.code, e.params) : readErrorText("XLSX_UNREADABLE"));
    }
  };

  const blattAendern = (idx) => {
    const s = file.sheets[idx];
    if (!s || s.blocked) return;
    try {
      setFile({ ...file, sheetIndex: idx });
      vorbereiten(s.rows, s.formulas, { type: "xlsx" }, s.errors);
      setError("");
    } catch (e) {
      setError(e instanceof ImportReadError ? readErrorText(e.code, e.params) : readErrorText("XLSX_UNREADABLE"));
    }
  };

  // ── Schritt 2: Zuordnung ──────────────────────────────────────────────────
  const spalteZuordnen = (col, fieldKey) => {
    const next = { ...mapping };
    for (const [k, c] of Object.entries(next)) if (c === col) delete next[k];
    if (fieldKey) next[fieldKey] = col;
    const nextStatus = { ...status };
    for (const k of Object.keys(nextStatus)) if (next[k] === undefined) delete nextStatus[k];
    if (fieldKey) nextStatus[fieldKey] = "manual";
    setMapping(next);
    setStatus(nextStatus);
    // Einheit je Feld aus dem neuen Spaltennamen; sonst bleibt die für dieses Feld getroffene Wahl.
    setUnits((u) => {
      const neu = {};
      for (const key of ["weightKg", ...DIMENSION_FIELDS]) {
        if (next[key] !== undefined) neu[key] = headerUnit(table.headers, next, key) || u[key] || null;
      }
      return neu;
    });
    if (!stockModeTouched) setStockMode(next.stock !== undefined ? "counted" : "none");
    const ev = numberFormatEvidence(table.rows.slice(table.headerIndex + 1), next);
    setEvidence(ev);
    if (ev.needsChoice && numberFormat !== null && evidence && !evidence.needsChoice) setNumberFormat(null);
  };

  const problems = useMemo(() => {
    if (!table) return [];
    const p = mappingProblems(mapping, { stockMode, units });
    if (!numberFormat) p.push("NUMBER_FORMAT_MISSING");
    if (stockMode !== "none" && lagerStatus === "loading") p.push("WAREHOUSES_LOADING");
    else if (stockMode !== "none" && lagerStatus === "error") p.push("WAREHOUSES_FAILED");
    else if (stockMode !== "none" && (lager.length === 0 || !warehouseId)) p.push("WAREHOUSE_MISSING");
    return p;
  }, [table, mapping, stockMode, units, numberFormat, lager, lagerStatus, warehouseId]);

  const hauptlagerAnlegen = async () => {
    setCreatingWarehouse(true);
    setError("");
    try {
      const res = await createWarehouse({ name: "Hauptlager" });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(inventoryErrorText(body, "Das Lager konnte nicht angelegt werden.")); return; }
      setLager([body.warehouse]);
      setWarehouseId(body.warehouse.id);
      setLagerStatus("ready");
    } catch {
      setError("Das Lager konnte nicht angelegt werden.");
    } finally {
      setCreatingWarehouse(false);
    }
  };

  const pruefenLassen = async () => {
    if (problems.length) return;
    setError("");
    setAnalyzing(true);
    try {
      const labels = Object.fromEntries(Object.entries(mapping).map(([k, c]) => [k, table.headers[c]]));
      const { document, emptyRows } = buildImportDocument({
        rows: table.rows, headerIndex: table.headerIndex, mapping, labels, units, numberFormat,
        formulas: table.formulas, errors: table.errors,
        source: { type: file.type, name: file.name, sheet: file.type === "xlsx" ? file.sheets[file.sheetIndex].name : null },
        options: { stockMode, updateExisting, warehouseId },
      });
      if (document.rows.length === 0) { setError(readErrorText("NO_DATA")); return; }
      // Die Datei darf 15 MB groß sein, das übertragene Dokument 10 MB — eine klare Meldung statt eines 413.
      if (new Blob([JSON.stringify(document)]).size > MAX_DOCUMENT_BYTES) { setError(readErrorText("DOCUMENT_TOO_LARGE")); return; }
      const res = await analyzeInventoryImport(document);
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(inventoryErrorText(body, "Die Datei konnte nicht geprüft werden.")); return; }
      setSkipInvalid(false);
      setConfirmRepeat(false);
      setLeereZeilen(emptyRows);
      await zeigeVorschau(body.import, body.import.counts && body.import.counts.error > 0 ? "error" : "all");
    } catch (e) {
      if (e && e.code === "TOO_MANY_ROWS") setError(readErrorText("TOO_MANY_ROWS", e.params));
      else if (isApiTimeout(e)) setError("Die Prüfung dauert ungewöhnlich lange. Bitte versuchen Sie es erneut.");
      else setError("Die Datei konnte nicht geprüft werden.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Schritt 3/4: Übernahme ────────────────────────────────────────────────
  const aktualisiereImport = async (importId) => {
    try {
      const res = await getInventoryImport(importId);
      const body = await res.json().catch(() => null);
      if (res.ok && body && body.import) setImp(body.import);
    } catch { /* der zuletzt bekannte Stand bleibt sichtbar */ }
  };

  const uebernehmen = async () => {
    if (!imp) return;
    setPhase("apply");
    setApplying(true);
    setInterrupted(false);
    setError("");
    const flags = { confirm: true, skipInvalidRows: skipInvalid, confirmRepeat };
    let wiederholt = 0;
    try {
      for (let i = 0; i < 100; i++) {
        let res;
        try {
          res = await applyInventoryImport(imp.id, flags);
        } catch {
          // Netzabbruch oder Zeitlimit: der Ausgang dieses Abschnitts ist offen. Fortsetzen ist
          // sicher — der Server bucht keine Zeile doppelt.
          setInterrupted(true);
          await aktualisiereImport(imp.id);
          return;
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          if (body && body.code === "IMPORT_RETRY" && wiederholt < 3) { wiederholt++; await pause(400 * wiederholt); continue; }
          setError(inventoryErrorText(body, "Der Abschnitt konnte nicht übernommen werden. Es wurde nichts gebucht."));
          setInterrupted(true);
          await aktualisiereImport(imp.id);
          return;
        }
        wiederholt = 0;
        setImp(body.import);
        if (body.done) {
          setPhase("result");
          setFilter("problems");
          await ladeZeilen(body.import.id, "problems");
          return;
        }
      }
    } finally {
      setApplying(false);
    }
  };

  const neuPruefen = async () => {
    setError("");
    setApplying(true);
    try {
      const res = await recheckInventoryImport(imp.id);
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(inventoryErrorText(body, "Die Zeilen konnten nicht neu geprüft werden.")); return; }
      setInterrupted(false);
      setImp(body.import);
      setPhase("preview");
      setFilter("pending");
      setLeereZeilen(null);
      await ladeZeilen(body.import.id, "pending");
    } catch {
      setError("Die Zeilen konnten nicht neu geprüft werden.");
    } finally {
      setApplying(false);
    }
  };

  const verwerfen = async ({ danach }) => {
    if (!imp) { if (danach === "datei") setPhase("file"); else onClose(); return; }
    setError("");
    setApplying(true);
    try {
      const res = await discardInventoryImport(imp.id);
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(inventoryErrorText(body, "Der Import konnte nicht abgeschlossen werden.")); return; }
      if (body.import.status === "completed") {
        setImp(body.import);
        setPhase("result");
        setFilter("problems");
        await ladeZeilen(body.import.id, "problems");
        return;
      }
      setImp(null);
      if (danach === "datei") { setPhase(file ? "mapping" : "file"); } else onClose();
    } catch {
      setError("Der Import konnte nicht abgeschlossen werden.");
    } finally {
      setApplying(false);
    }
  };

  const fehlerlisteHerunterladen = async () => {
    if (!imp) return;
    setExporting(true);
    setError("");
    try {
      const zeilen = [["Zeile", "Artikelnummer", "Status", "Hinweis"]];
      let after = null;
      for (let i = 0; i < 40; i++) {
        const res = await getInventoryImportRows(imp.id, { filter: "problems", after: after ?? undefined, limit: 500 });
        const body = await res.json().catch(() => null);
        if (!res.ok) { setError(inventoryErrorText(body, "Die Fehlerliste konnte nicht erstellt werden.")); return; }
        for (const r of body.rows || []) {
          const texte = (r.issues || []).filter((i) => i.severity !== "info").map((i) => issueText(i, imp.columns));
          if (r.applyCode && !(r.issues || []).some((i) => i.code === r.applyCode)) texte.push(applyCodeText(r.applyCode, r.issues, imp.columns));
          zeilen.push([r.rowNo, r.sku || "", APPLY_STATUS_LABELS[r.applyStatus] || "", texte.join(" ")]);
        }
        if (!body.nextAfter) break;
        after = body.nextAfter;
      }
      speichereCsv(toCsv(zeilen), `Importhinweise-${heute()}.csv`);
    } catch {
      setError("Die Fehlerliste konnte nicht erstellt werden.");
    } finally {
      setExporting(false);
    }
  };

  const schliessen = () => {
    if (busy) return;
    const geaendert = imp && (imp.status === "completed" || (imp.progress && imp.progress.applied > 0));
    onClose();
    if (geaendert) onImported?.(imp);
  };

  // ── Darstellung ───────────────────────────────────────────────────────────
  const counts = (imp && imp.counts) || {};
  const progress = (imp && imp.progress) || {};
  const columns = (imp && imp.columns) || {};
  const fehlerAnzahl = progress.error || 0;
  const offen = progress.pending || 0;
  const problemZahl = (progress.error || 0) + (progress.stale || 0) + (progress.failed || 0) + (counts.warnings || 0);
  const kannUebernehmen = imp && imp.status === "analyzed" && (fehlerAnzahl === 0 || skipInvalid) && (!imp.repeat || confirmRepeat);
  const bearbeitet = (progress.applied || 0) + (progress.stale || 0) + (progress.failed || 0);
  const zuBearbeiten = bearbeitet + offen;
  const prozent = zuBearbeiten > 0 ? Math.round((bearbeitet / zuBearbeiten) * 100) : 100;
  const filterOptionen = imp ? [
    ["all", "Alle", imp.totalRows],
    ["create", "Neu", counts.create || 0],
    ["update", "Aktualisiert", counts.update || 0],
    ["unchanged", "Unverändert", counts.unchanged || 0],
    ["skipped", "Übersprungen", counts.skipped || 0],
    ["error", "Fehler", counts.error || 0],
    ["warnings", "Hinweise", counts.warnings || 0],
    ["repeat", "Mögliche Wiederholungen", counts.repeatRows || 0],
    ["stock", "Bestandsänderungen", counts.stockChanges || 0],
  ].filter(([key, , n]) => key === "all" || n > 0) : [];
  const filterWaehlen = (key) => { setFilter(key); ladeZeilen(imp.id, key); };
  // Mögliche Doppelbuchung (Wareneingang): Zeilen mit Treffer und davon die der letzten 7 Tage.
  const wiederholZeilen = counts.repeatRows ?? (imp && imp.repeat ? imp.repeat.matches : 0);
  const wiederholJung = counts.repeatRecentRows ?? 0;

  const kopf = phase === "loading" ? null : (
    <div className="inv-import-head">
      <p className="inv-import-step">Schritt {STEPS[phase]} von 4</p>
      <h3 className="inv-import-title" tabIndex={-1} ref={headingRef}>{STEP_TITLES[phase]}</h3>
    </div>
  );

  const zeilenListe = (
    <>
      {rows.length === 0 && !loadingRows && <p className="inv-import-note">In dieser Auswahl gibt es keine Zeilen.</p>}
      {rows.length > 0 && (
        <ul className="inv-import-rows">
          {rows.map((r) => {
            const [badge, label] = badgeOf(r);
            const hinweise = (r.issues || []).filter((i) => i.severity !== "info" && i.code !== r.applyCode);
            const info = (r.issues || []).find((i) => i.severity === "info");
            const bestand = stockText(r.stock, imp && imp.stockMode);
            return (
              <li key={r.rowNo} className="inv-import-row">
                <div className="inv-import-row-head">
                  <span className="inv-import-row-ref">Zeile {formatUnits(r.rowNo)}</span>
                  {r.sku && <span className="inv-cell-sku"><Werte>{r.sku}</Werte></span>}
                  <span className={`badge ${badge}`}>{label}</span>
                </div>
                {r.applyCode && <p className="inv-import-row-problem">{applyCodeText(r.applyCode, r.issues, columns)}</p>}
                {hinweise.map((i, n) => (i.severity === "error"
                  ? <p key={n} className="inv-import-row-problem">{issueText(i, columns)}</p>
                  : (
                    <p key={n} className={`inv-import-row-hint inv-import-row-hint--warning${i.code === "ROW_RECEIPT_REPEAT" && i.params && i.params.recent ? " inv-import-row-hint--strong" : ""}`}>
                      <span className="sr-only">Hinweis: </span>{issueText(i, columns)}
                    </p>
                  )))}
                {info && <p className="inv-import-row-hint">{issueText(info, columns)}</p>}
                <ZeilenWerte row={r} />
                {bestand && r.action !== "error" && <p className="inv-import-row-change">{bestand}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {nextAfter && (
        <div className="inv-more">
          <button type="button" className="btn btn-outline" disabled={loadingRows} onClick={() => ladeZeilen(imp.id, filter, nextAfter)}>
            {loadingRows ? "Wird geladen …" : "Weitere Zeilen laden"}
          </button>
        </div>
      )}
    </>
  );

  let inhalt = null;
  let footer = null;

  if (phase === "loading") {
    inhalt = <p className="inv-import-note" role="status">Wird geladen …</p>;
  } else if (phase === "file") {
    inhalt = (
      <>
        <p className="inv-import-lead">Übernehmen Sie Artikel und Bestände aus einer Excel- oder CSV-Datei. Sie sehen vor der Übernahme jede Änderung.</p>
        <div className="inv-import-file">
          <input ref={inputRef} type="file" className="sr-only" id="inv-import-file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                 onChange={(e) => dateiGewaehlt(e.target.files && e.target.files[0])} tabIndex={-1} aria-hidden="true" />
          <button type="button" className="btn btn-primary" disabled={reading} onClick={() => inputRef.current?.click()}>
            {reading ? "Datei wird gelesen …" : "Datei auswählen"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => speichereCsv(templateCsv(), "Artikelimport-Vorlage.csv")}>
            Vorlage herunterladen
          </button>
        </div>
        <p className="field-hint">Excel (.xlsx) oder CSV, höchstens 15 MB und 10.000 Artikel. Die erste Zeile enthält die Spaltennamen. Formeln werden nicht übernommen — speichern Sie solche Spalten als Werte.</p>
      </>
    );
  } else if (phase === "mapping" && table) {
    const optionenFuer = (col) => IMPORT_FIELDS.filter((f) => mapping[f.key] === undefined || mapping[f.key] === col);
    const feldVon = (col) => Object.keys(mapping).find((k) => mapping[k] === col) || "";
    // Maßspalten: eine gemeinsame Wahl, solange die Spaltennamen dieselbe (oder keine) Einheit nennen;
    // sonst je Spalte — „Länge (cm)“ und „Höhe (mm)“ werden nie mit einer Einheit gelesen.
    const masse = DIMENSION_FIELDS.filter((k) => mapping[k] !== undefined);
    const masseGetrennt = dimensionUnitsDiffer(table.headers, mapping);
    inhalt = (
      <>
        <p className="inv-import-lead">
          <strong>{file.name}</strong> · {anzahl(table.rows.length - table.headerIndex - 1, "Zeile", "Zeilen")} unter der Kopfzeile
          {file.type === "csv" && file.encoding === "windows-1252" ? " · Zeichensatz Windows-1252 erkannt" : ""}
        </p>
        {file.type === "xlsx" && file.sheets.length > 1 && (
          <div className="inv-import-field">
            <label className="field-label" htmlFor="inv-import-sheet">Tabellenblatt</label>
            <select id="inv-import-sheet" className="field-select" value={file.sheetIndex} onChange={(e) => blattAendern(Number(e.target.value))}
                    aria-describedby={file.sheets[file.sheetIndex].hidden ? "inv-import-sheet-hidden" : undefined}>
              {file.sheets.map((s, i) => (
                <option key={s.name} value={i} disabled={Boolean(s.blocked)}>
                  {s.name}{s.hidden ? " (ausgeblendet)" : ""}{s.blocked ? " (nicht lesbar)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {file.type === "xlsx" && file.sheets[file.sheetIndex].hidden && (
          <p className="inv-import-sheet-hidden" id="inv-import-sheet-hidden" role="note">
            Das Tabellenblatt „{file.sheets[file.sheetIndex].name}“ ist in Excel ausgeblendet. Prüfen Sie, ob es die aktuellen Artikeldaten enthält.
          </p>
        )}
        {file.type === "csv" && !file.delimiterDetected && (
          <fieldset className="inv-import-fieldset">
            <legend className="field-label">Trennzeichen</legend>
            <div className="ce-segment inv-import-segment">
              {[[";", "Semikolon"], [",", "Komma"], ["\t", "Tabulator"]].map(([d, l]) => (
                <label key={l} className="ce-segment-option inv-import-segment-option">
                  <input type="radio" name="inv-import-delimiter" checked={file.delimiter === d} onChange={() => trennzeichenAendern(d)} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <ul className="inv-import-columns" aria-label="Spalten der Datei">
          {table.headers.map((h, col) => {
            const feld = feldVon(col);
            const st = feld ? status[feld] : null;
            const bsp = beispiele(table.rows, table.headerIndex, col);
            return (
              <li key={col} className="inv-import-column">
                <div className="inv-import-column-source">
                  <span className="inv-import-column-head">
                    <span className="inv-import-column-name">{h || `Spalte ${col + 1}`}</span>
                    {st === "auto" && <span className="badge badge--success">erkannt</span>}
                    {st === "check" && <span className="badge badge--warning">bitte prüfen</span>}
                  </span>
                  {bsp.length > 0 && <span className="inv-import-column-examples">z. B. {bsp.join(" · ")}</span>}
                </div>
                <div className="inv-import-column-target">
                  <label className="sr-only" htmlFor={`inv-import-col-${col}`}>Übernehmen als (Spalte {h || col + 1})</label>
                  <select id={`inv-import-col-${col}`} className="field-select" value={feld} onChange={(e) => spalteZuordnen(col, e.target.value)}>
                    <option value="">Nicht übernehmen</option>
                    {optionenFuer(col).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>

        {mapping.weightKg !== undefined && (
          <fieldset className="inv-import-fieldset">
            <legend className="field-label">Einheit des Gewichts</legend>
            <div className="ce-segment inv-import-segment">
              {WEIGHT_UNIT_OPTIONS.map(([u, l]) => (
                <label key={u} className="ce-segment-option inv-import-segment-option">
                  <input type="radio" name="inv-import-weight-unit" checked={units.weightKg === u} onChange={() => setUnits({ ...units, weightKg: u })} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {masse.length > 0 && !masseGetrennt && (
          <fieldset className="inv-import-fieldset">
            <legend className="field-label">Einheit der Maße</legend>
            <div className="ce-segment inv-import-segment">
              {LENGTH_UNIT_OPTIONS.map(([u, l]) => (
                <label key={u} className="ce-segment-option inv-import-segment-option">
                  <input type="radio" name="inv-import-length-unit" checked={masse.every((k) => units[k] === u)}
                         onChange={() => setUnits({ ...units, ...Object.fromEntries(masse.map((k) => [k, u])) })} />
                  <span>{l}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {masse.length > 0 && masseGetrennt && (
          <fieldset className="inv-import-fieldset">
            <legend className="field-label">Einheiten der Maße</legend>
            <p className="field-hint">Die Maßspalten nennen unterschiedliche Einheiten. Jede Spalte wird mit ihrer eigenen Einheit in Zentimeter umgerechnet.</p>
            {masse.map((k) => (
              <fieldset key={k} className="inv-import-unit">
                <legend className="inv-import-unit-label">
                  {FIELD_LABELS[k]} <span className="inv-import-unit-column">aus „{table.headers[mapping[k]] || `Spalte ${mapping[k] + 1}`}“</span>
                </legend>
                {/* Je Spalte genügt das Kürzel — die Überschrift nennt Feld und Spalte; der ausgeschriebene
                    Name bleibt für Screenreader Teil der Bezeichnung. */}
                <div className="ce-segment inv-import-segment inv-import-segment--kurz">
                  {LENGTH_UNIT_OPTIONS.map(([u, l]) => (
                    <label key={u} className="ce-segment-option inv-import-segment-option">
                      <input type="radio" name={`inv-import-unit-${k}`} checked={units[k] === u} onChange={() => setUnits({ ...units, [k]: u })} />
                      <span>{u}<span className="sr-only">{` – ${l.replace(/ \(.*\)$/, "")}`}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </fieldset>
        )}
        <fieldset className="inv-import-fieldset">
          <legend className="field-label">Zahlformat der Datei</legend>
          <div className="ce-segment inv-import-segment">
            {[["de", "Deutsch (1.234,5)"], ["intl", "International (1,234.5)"]].map(([fmt, l]) => (
              <label key={fmt} className="ce-segment-option inv-import-segment-option">
                <input type="radio" name="inv-import-number-format" checked={numberFormat === fmt} onChange={() => setNumberFormat(fmt)} />
                <span>{l}</span>
              </label>
            ))}
          </div>
          {evidence && evidence.ambiguous.length > 0 && (
            <p className="field-hint">
              Mehrdeutige Werte wie „{evidence.ambiguous.join("“, „")}“ werden nach dem gewählten Zahlformat gelesen
              {numberFormat ? ` — hier als ${numberFormat === "de" ? "Deutsch" : "International"}.` : ". Bitte wählen Sie es aus."}
            </p>
          )}
          {evidence && evidence.contradictory && <p className="field-hint">Die Datei enthält Zahlen in beiden Schreibweisen. Zeilen, die nicht zum gewählten Format passen, werden als Fehler angezeigt.</p>}
        </fieldset>

        <fieldset className="inv-import-fieldset ci-mode inv-import-modes">
          <legend className="field-label">Bestand</legend>
          {STOCK_MODES.map((m) => (
              <label key={m.value} className="ci-mode-option ce-wahl" htmlFor={`inv-import-mode-${m.value}`}>
                <input type="radio" id={`inv-import-mode-${m.value}`} name="inv-import-stock-mode" className="ci-mode-radio" value={m.value}
                       checked={stockMode === m.value} aria-describedby={`inv-import-mode-${m.value}-hilfe`}
                       onChange={() => { setStockMode(m.value); setStockModeTouched(true); }} />
                <span className="ci-mode-option-text">
                  <span className="ci-mode-option-title">{m.title}</span>
                  <span id={`inv-import-mode-${m.value}-hilfe`} className="field-hint">{m.text}</span>
                </span>
              </label>
          ))}
          {stockMode !== "none" && (
            <p className="field-hint">Leere Bestandszellen ändern nichts. „0“ setzt den Bestand im Modus „Bestand übernehmen“ auf null. Reservierte und gesperrte Ware bleibt unberührt.</p>
          )}
        </fieldset>

        {stockMode !== "none" && lager.length > 1 && (
          <div className="inv-import-field">
            <label className="field-label" htmlFor="inv-import-warehouse">Lager</label>
            <select id="inv-import-warehouse" className="field-select" value={warehouseId || ""} onChange={(e) => setWarehouseId(e.target.value)}>
              {lager.map((w) => <option key={w.id} value={w.id}>{w.name}{w.isDefault ? " (Standard)" : ""}</option>)}
            </select>
          </div>
        )}
        {stockMode !== "none" && lagerStatus === "error" && (
          <div className="inv-import-field">
            <button type="button" className="btn btn-outline" onClick={() => ladeLager()}>Lager erneut laden</button>
          </div>
        )}
        {stockMode !== "none" && lagerStatus === "ready" && lager.length === 0 && (
          <div className="inv-import-field">
            <p className="field-hint">Für Bestände brauchen Sie ein Lager.</p>
            <button type="button" className="btn btn-outline" disabled={creatingWarehouse} onClick={hauptlagerAnlegen}>
              {creatingWarehouse ? "Wird angelegt …" : "Hauptlager anlegen"}
            </button>
          </div>
        )}

        <fieldset className="inv-import-fieldset">
          <legend className="field-label">Vorhandene Artikel</legend>
          <div className="ce-segment inv-import-segment">
            <label className="ce-segment-option inv-import-segment-option">
              <input type="radio" name="inv-import-existing" checked={updateExisting} onChange={() => setUpdateExisting(true)} />
              <span>Aktualisieren</span>
            </label>
            <label className="ce-segment-option inv-import-segment-option">
              <input type="radio" name="inv-import-existing" checked={!updateExisting} onChange={() => setUpdateExisting(false)} />
              <span>Nur neue Artikel anlegen</span>
            </label>
          </div>
          <p className="field-hint">Erkannt werden Artikel an der Artikelnummer. Leere Zellen ändern keinen vorhandenen Wert.</p>
        </fieldset>

        {problems.length > 0 && (
          <ul className="inv-import-problems">
            {problems.map((p) => <li key={p}>{PROBLEM_TEXTS[p]}</li>)}
          </ul>
        )}
      </>
    );
    footer = (
      <>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setPhase("file"); setError(""); }}>Andere Datei</button>
        <button type="button" className="btn btn-primary" disabled={busy || problems.length > 0} onClick={pruefenLassen}>
          {analyzing ? "Wird geprüft …" : "Datei prüfen lassen"}
        </button>
      </>
    );
  } else if (phase === "preview" && imp) {
    inhalt = (
      <>
        <p className="inv-import-lead">
          {imp.source && imp.source.name ? <><strong>{imp.source.name}</strong> · </> : null}
          {anzahl(imp.totalRows, "Zeile", "Zeilen")} geprüft
          {leereZeilen > 0 ? `, ${anzahl(leereZeilen, "leere Zeile", "leere Zeilen")} übersprungen` : ""}. Noch wurde nichts geändert.
        </p>
        {imp.repeat && (
          <section className="inv-import-repeat" aria-labelledby="inv-import-repeat-title">
            <h4 className="inv-import-repeat-title" id="inv-import-repeat-title">
              {imp.repeat.identical ? "Diese Wareneingänge wurden möglicherweise bereits gebucht." : "Einige Artikelmengen wurden möglicherweise bereits als Wareneingang gebucht."}
            </h4>
            <p>
              {imp.repeat.identical
                ? `Die Datei entspricht einem Wareneingang, der bereits in dieses Lager gebucht wurde${imp.repeat.createdAt ? ` (${datumText(imp.repeat.createdAt)}${imp.repeat.sourceName ? `, „${imp.repeat.sourceName}“` : ""})` : ""}.`
                : wiederholSatz(wiederholZeilen, imp.repeat.total, wiederholJung)}
              {" "}Eine erneute Buchung erhöht den Lagerbestand zusätzlich. Ist es eine neue Lieferung, bestätigen Sie das bitte — sonst korrigieren Sie die Datei oder verwerfen die Vorschau.
            </p>
            {repeatRows.length > 0 && (
              <ul className="inv-import-repeat-list" aria-label="Betroffene Artikel">
                {repeatRows.map((r) => {
                  const h = (r.issues || []).find((i) => i.code === "ROW_RECEIPT_REPEAT");
                  const p = (h && h.params) || {};
                  const menge = r.stock && typeof r.stock.delta === "number" ? r.stock.delta : null;
                  const datum = datumText(p.date);
                  return (
                    <li key={r.rowNo}>
                      <span className="inv-cell-sku"><Werte>{r.sku}</Werte></span>
                      <span className="inv-import-repeat-detail">
                        {menge !== null ? `${formatUnits(menge)} Stück` : "dieselbe Menge"}
                        {datum ? `, zuletzt gebucht am ${datum}` : ""}
                        {p.file ? `, „${p.file}“` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {wiederholZeilen > repeatRows.length && repeatRows.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm inv-import-repeat-all" onClick={() => filterWaehlen("repeat")}>
                Alle {formatUnits(wiederholZeilen)} betroffenen Zeilen anzeigen
              </button>
            )}
            <label className="inv-toolbar-check inv-import-repeat-confirm">
              <input type="checkbox" checked={confirmRepeat} onChange={(e) => setConfirmRepeat(e.target.checked)} />
              <span>Es ist eine neue Lieferung — diese Mengen erneut buchen</span>
            </label>
          </section>
        )}
        {!imp.repeat && wiederholZeilen > 0 && (
          <p className="inv-import-note">
            {wiederholZeilen === 1 ? "Bei 1 Zeile wurde" : `Bei ${formatUnits(wiederholZeilen)} Zeilen wurde`} dieselbe Menge vor mehr als 7 Tagen schon einmal als Wareneingang gebucht. Die Zeilen tragen einen Hinweis; eine Bestätigung ist nicht nötig.
          </p>
        )}
        <div className="ce-segment inv-import-filter" role="group" aria-label="Zeilen filtern">
          {filterOptionen.map(([key, label, n]) => (
            <button key={key} type="button" className="ce-segment-option inv-import-segment-option" aria-pressed={filter === key}
                    onClick={() => filterWaehlen(key)}>
              {label} {formatUnits(n)}
            </button>
          ))}
        </div>
        {zeilenListe}
        <div className="inv-import-confirm">
          {imp.stockMode === "counted" && counts.stockChanges > 0 && (
            <p className="field-hint">Der Bestand wird bei {anzahl(counts.stockChanges, "Artikel", "Artikeln")} auf den gezählten Wert korrigiert.</p>
          )}
          {imp.stockMode === "receipt" && counts.stockChanges > 0 && (
            <p className="field-hint">Für {formatUnits(counts.stockChanges)} Artikel wird ein Wareneingang gebucht.</p>
          )}
          {fehlerAnzahl > 0 && imp.status === "analyzed" && (
            <label className="inv-toolbar-check">
              <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} />
              <span>{anzahl(fehlerAnzahl, "fehlerhafte Zeile", "fehlerhafte Zeilen")} überspringen und die übrigen übernehmen</span>
            </label>
          )}
          {imp.repeat && imp.status === "analyzed" && !confirmRepeat && (
            <p className="field-hint">Die Übernahme wartet auf Ihre Bestätigung der möglichen Doppelbuchung (oben).</p>
          )}
        </div>
      </>
    );
    footer = (
      <>
        {problemZahl > 0 && (
          <button type="button" className="btn btn-ghost" disabled={busy || exporting} onClick={fehlerlisteHerunterladen}>
            {exporting ? "Wird erstellt …" : "Fehlerliste herunterladen"}
          </button>
        )}
        {imp.status === "analyzed" && (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => verwerfen({ danach: "datei" })}>Verwerfen</button>
        )}
        <button type="button" className="btn btn-primary" disabled={busy || (imp.status === "analyzed" && !kannUebernehmen)} onClick={uebernehmen}>
          {offen > 0 ? `${anzahl(offen, "Zeile", "Zeilen")} übernehmen` : "Abschließen"}
        </button>
      </>
    );
  } else if ((phase === "apply" || phase === "result") && imp) {
    const fertig = imp.status === "completed";
    inhalt = (
      <>
        <div className="inv-import-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prozent} aria-label="Fortschritt der Übernahme">
          <span className="inv-import-progress-bar" style={{ width: `${prozent}%` }} />
        </div>
        <p className="inv-import-lead" aria-live="polite">
          {applying ? `${formatUnits(bearbeitet)} von ${anzahl(zuBearbeiten, "Zeile", "Zeilen")} verarbeitet …`
            : fertig ? "Der Import ist abgeschlossen."
              : interrupted ? `Übernahme unterbrochen — ${formatUnits(progress.applied || 0)} von ${anzahl(zuBearbeiten, "Zeile", "Zeilen")} übernommen. Fortsetzen ist sicher: keine Zeile wird doppelt gebucht.`
                : `${formatUnits(bearbeitet)} von ${anzahl(zuBearbeiten, "Zeile", "Zeilen")} verarbeitet.`}
        </p>
        <dl className="inv-import-result">
          <div><dt>Neu angelegt</dt><dd>{formatUnits(progress.appliedCreated || 0)}</dd></div>
          <div><dt>Aktualisiert</dt><dd>{formatUnits(progress.appliedUpdated || 0)}</dd></div>
          <div><dt>Unverändert</dt><dd>{formatUnits(progress.noop || 0)}</dd></div>
          <div><dt>Übersprungen</dt><dd>{formatUnits((progress.skipped || 0) + (progress.cancelled || 0))}</dd></div>
          <div><dt>Fehlerhaft</dt><dd>{formatUnits((progress.error || 0) + (progress.failed || 0))}</dd></div>
          {(progress.stale || 0) > 0 && <div><dt>Seit der Vorschau geändert</dt><dd>{formatUnits(progress.stale)}</dd></div>}
        </dl>
        {(progress.stale || 0) > 0 && !applying && (
          <p className="field-hint">{progress.stale === 1 ? "1 Zeile wurde" : `${formatUnits(progress.stale)} Zeilen wurden`} seit der Vorschau an anderer Stelle geändert und deshalb nicht überschrieben. Prüfen Sie sie neu oder schließen Sie den Import ohne sie ab.</p>
        )}
        {phase === "result" && !applying && zeilenListe}
      </>
    );
    footer = applying ? null : (
      <>
        {problemZahl > 0 && (
          <button type="button" className="btn btn-ghost" disabled={busy || exporting} onClick={fehlerlisteHerunterladen}>
            {exporting ? "Wird erstellt …" : "Fehlerliste herunterladen"}
          </button>
        )}
        {!fertig && (progress.stale || 0) > 0 && offen === 0 && (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={neuPruefen}>Geänderte Zeilen neu prüfen</button>
        )}
        {!fertig && (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => verwerfen({ danach: "schliessen" })}>
            {offen > 0 ? "Ohne die offenen Zeilen abschließen" : "Ohne diese Zeilen abschließen"}
          </button>
        )}
        {!fertig && offen > 0 && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={uebernehmen}>Übernahme fortsetzen</button>
        )}
        {fertig && <button type="button" className="btn btn-primary" onClick={schliessen}>Fertig</button>}
      </>
    );
  }

  return (
    <InventoryDialog open={open} onClose={schliessen} title="Artikel importieren" size="xl" busy={busy} scrollBody footer={footer}>
      <div className="inv-import">
        {kopf}
        <InlineError text={error} />
        {inhalt}
      </div>
    </InventoryDialog>
  );
}

