import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { useDialog } from "../../hooks/useDialog";
import { formatUnits, isLowStock, stockLevelView } from "../../utils/inventoryView.mjs";

/* ── Wiederverwendbare Bauteile des Lagerbereichs ────────────────────────────
   Bewusst wenige, dafür überall dieselben. Alle bauen auf den bestehenden
   Primitives auf (.ce-card, .badge, .btn, .field-input, .ce-dialog*) — es
   entsteht kein zweites Karten-, Badge-, Button- oder Dialogsystem. */

/* ── Kennzahlkarte ──
   Bewusst NICHT die KPI-Karten der Übersicht (.pp-kpi / --ce-kpi-*): jene
   Familie gilt laut CLAUDE.md ausschließlich für die vier Karten der
   Kundenübersicht und darf nicht ausgeweitet werden. Diese Karte ist eine
   gewöhnliche Base Card mit der bestehenden Zahlentypografie. */
export function InventoryStatCard({ icon, label, value, hint, tone = "", onClick, detailLabel }) {
  const inhalt = (
    <>
      <div className="inv-stat-head">
        <span className="inv-stat-ic"><Icon n={icon} s={18} /></span>
        <span className="inv-stat-label">{label}</span>
        {onClick && <span className="inv-stat-chevron" aria-hidden="true"><Icon n="chevronRight" s={16} /></span>}
      </div>
      <div className="inv-stat-value ce-num">{value}</div>
      {hint && <div className="inv-stat-hint">{hint}</div>}
    </>
  );
  const klassen = `ce-card inv-stat${tone ? ` inv-stat--${tone}` : ""}`;
  // Ein echtes <button>, kein <div onClick>: Tastaturbedienung (Enter/Space),
  // Rollenzuordnung und der Fokusring der Foundation kommen sonst nicht von
  // selbst. `detailLabel` sagt an, wohin der Klick führt — „128" allein wäre für
  // einen Screenreader keine Handlungsaufforderung.
  if (!onClick) return <div className={klassen}>{inhalt}</div>;
  // `.ce-card-interactive` ist das vorhandene Primitive für eine anklickbare
  // Karte: Hover, Kante, Tiefe und Fokusring kommen von dort, nicht aus einer
  // zweiten Eigenbaulösung.
  return (
    <button type="button" className={`${klassen} ce-card-interactive inv-stat--action`} onClick={onClick} aria-label={detailLabel}>
      {inhalt}
    </button>
  );
}

/* ── Vorschauliste einer Kennzahl ──
   Eine Zeilenform für alle sechs Aufklappungen: was es ist, die Einordnung, der
   Bezug (nur wenn vorhanden) und der Zahlenanteil. Die Zeilen kommen fertig aus
   overviewPreviewRows() — hier wird nichts abgeleitet und nichts gerechnet. */
export function InventoryPreviewList({ rows, emptyText }) {
  if (!rows || rows.length === 0) {
    return <p className="inv-preview-empty">{emptyText}</p>;
  }
  return (
    <ul className="inv-preview-list">
      {rows.map((r) => (
        <li key={r.id} className="inv-preview-item">
          <div className="inv-preview-main">
            <span className="inv-preview-primary">{r.primary}</span>
            {r.secondary && <span className="inv-preview-secondary">{r.secondary}</span>}
            {r.meta && <span className="inv-preview-meta">{r.meta}</span>}
          </div>
          <span className="inv-preview-value ce-num">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Bestandsanzeige einer Zeile ──
   Zeigt verfügbar/reserviert und markiert einen niedrigen Bestand. Der Wert
   `available` wird ausschließlich ANGEZEIGT — er wird nie berechnet und nie
   zurückgesendet; ob reserviert werden darf, entscheidet das Backend. */
export function StockBadge({ row }) {
  const level = stockLevelView(row);
  if (!level) return null;
  const [cls, text] = level;
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot" aria-hidden="true" />{text}
    </span>
  );
}

export function StockCells({ stock, minStock }) {
  const s = stock || {};
  const low = isLowStock({ available: s.available, minStock });
  return (
    <>
      <td className="ce-num">{formatUnits(s.onHand)}</td>
      <td className="ce-num">{formatUnits(s.reserved)}</td>
      <td className={`ce-num${low ? " inv-num-low" : ""}`}>{formatUnits(s.available)}</td>
    </>
  );
}

/* ── Fehlerstreifen ──
   Schmale Zeile über dem Inhalt statt eines flächigen Fehlerzustands: bereits
   geladene Daten bleiben stehen (dieselbe Regel wie im Benachrichtigungspanel). */
export function InlineError({ text, onRetry }) {
  if (!text) return null;
  return (
    <div className="inv-inline-error" role="alert">
      <Icon n="info" s={16} />
      <span>{text}</span>
      {onRetry && <button type="button" className="btn btn-link btn-sm" onClick={onRetry}>Erneut versuchen</button>}
    </div>
  );
}

export function InlineSuccess({ text }) {
  if (!text) return null;
  return (
    <div className="inv-inline-success" role="status">
      <Icon n="check" s={16} /><span>{text}</span>
    </div>
  );
}

/* ── Dialog ──
   Nutzt den globalen Dialogmechanismus (useDialog): Fokusfalle, Fokusrückgabe
   und Escape kommen von dort, nicht aus einer zweiten Eigenbaulösung. */
export function InventoryDialog({ open, onClose, title, children, footer, size = "md", busy = false }) {
  // useDialog LIEFERT die Ref (es nimmt keine entgegen) — Fokusfalle,
  // Fokusrückgabe und Escape kommen vollständig von dort. Während eines
  // laufenden Vorgangs ist Escape abgeschaltet, damit ein halb abgeschickter
  // Bestandsvorgang nicht versehentlich weggetippt wird.
  const ref = useDialog({ open, onClose, closeOnEscape: !busy });
  if (!open) return null;
  return (
    <div className="ce-dialog-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={`ce-dialog ce-dialog--${size}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="ce-dialog-head">
          <h2 className="ce-dialog-title">{title}</h2>
          <button type="button" className="btn btn-icon btn-sm" aria-label="Dialog schließen" onClick={onClose} disabled={busy}>
            <Icon n="close" s={18} />
          </button>
        </div>
        <div className="ce-dialog-body">{children}</div>
        {footer && <div className="ce-dialog-actions">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Artikelauswahl ──
   Serverseitige Suche mit Verzögerung; die Liste zeigt den VERFÜGBAREN Bestand
   als Orientierung. Die Auswahl schickt nur productId + Menge — der Server
   entscheidet über Verfügbarkeit. */
export function ProductPicker({ products, loading, value, onChange, onSearch, disabled }) {
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => onSearch(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="inv-picker">
      <label className="field-label" htmlFor="inv-picker-search">Artikel suchen</label>
      <input
        id="inv-picker-search"
        className="field-input"
        type="search"
        placeholder="SKU oder Bezeichnung"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        disabled={disabled}
      />
      <div className="inv-picker-list" role="listbox" aria-label="Artikel">
        {loading && <div className="inv-picker-empty">Artikel werden geladen …</div>}
        {!loading && products.length === 0 && <div className="inv-picker-empty">Keine Artikel gefunden.</div>}
        {!loading && products.map((p) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={value === p.id}
            className={`inv-picker-item${value === p.id ? " on" : ""}`}
            onClick={() => onChange(p)}
            disabled={disabled}
          >
            <span className="inv-cell-sku inv-picker-sku">{p.sku}</span>
            <span className="inv-picker-name">{p.name}</span>
            <span className="inv-picker-avail ce-num">{formatUnits(p.stock?.available)} verfügbar</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Mengenfeld ──
   Ganze Stückzahlen. Kein Rechnen im Client: der Wert wird unverändert
   gesendet, alle Grenzen prüft der Server erneut. */
export function QuantityField({ id, label, value, onChange, max, hint, disabled, autoFocus }) {
  return (
    <div className="inv-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="field-input"
        type="number"
        inputMode="numeric"
        min="1"
        step="1"
        max={max ?? undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      {hint && <p className="inv-field-hint">{hint}</p>}
    </div>
  );
}
