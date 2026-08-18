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
      <div className="inv-stat-value">{value}</div>
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
export function InventoryDialog({ open, onClose, title, children, footer, size = "md", busy = false, scrollBody = false }) {
  // useDialog LIEFERT die Ref (es nimmt keine entgegen) — Fokusfalle,
  // Fokusrückgabe und Escape kommen vollständig von dort. Während eines
  // laufenden Vorgangs ist Escape abgeschaltet, damit ein halb abgeschickter
  // Bestandsvorgang nicht versehentlich weggetippt wird.
  //
  // `scrollBody` ist eine OPT-IN-Variante für den einzigen wirklich langen
  // Dialog des Bereichs (Artikelformular): dort scrollt sonst der gesamte Dialog,
  // und Titel wie Speichern-Knopf laufen nach oben beziehungsweise unten aus dem
  // Bild. Bewusst opt-in statt global: jeder andere Dialog ist kurz genug und
  // soll sich nicht mitändern.
  const ref = useDialog({ open, onClose, closeOnEscape: !busy });
  if (!open) return null;
  return (
    <div className="ce-dialog-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className={`ce-dialog ce-dialog--${size}${scrollBody ? " inv-dialog-split" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
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

/* ── Einklappbarer Formularabschnitt ──
   Für optionale Feldgruppen: die Möglichkeiten bleiben vollständig erhalten,
   sichtbar ist zunächst nur, was der Nutzer gerade braucht.

   Der Kopf ist ein echtes <button> mit aria-expanded/aria-controls — Tastatur,
   Rollenzuordnung und Fokusring kommen sonst nicht von selbst. Eingeklappt
   verschwindet der Inhalt AUS DEM DOM: nur optisch verborgene Felder blieben
   für Tastatur und Screenreader erreichbar und würden beim Absenden trotzdem
   mitgeschickt.

   `filled` markiert einen Abschnitt, der bereits Daten trägt — er startet
   geöffnet (siehe ProductForm), damit vorhandene Angaben nie versteckt werden. */
export function CollapsibleSection({ id, title, hint, open, onToggle, filled, children, disabled }) {
  return (
    <div className={`inv-section${open ? " inv-section--open" : ""}`}>
      <button
        type="button"
        className="inv-section-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        disabled={disabled}
      >
        <span className="inv-section-label">{title}</span>
        {filled && !open && <span className="inv-section-filled">ausgefüllt</span>}
        <span className="inv-section-chevron" aria-hidden="true"><Icon n="chevron" s={16} /></span>
      </button>
      {open && (
        <div id={id} className="inv-section-body">
          {hint && <p className="inv-section-hint">{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Weitere Zeilenaktionen (Kebab) ──
   Dasselbe Muster wie AddressActionsMenu/DraftActionsMenu: Fokus auf den ersten
   Eintrag beim Öffnen, Klick nach außen und Escape schließen, und der Fokus geht
   ZUERST an den Auslöser zurück, DANN läuft die Aktion — sonst merkt sich ein
   Dialog beim Öffnen den gerade angeklickten Menüeintrag, der mit dem Menü
   verschwindet, und der Fokus landete nach „Abbrechen" auf <body>.

   Warum überhaupt ein Menü: die Bestandszeile trägt drei Aktionen, deren Knöpfe
   zusammen 336 px messen — die Aktionsspalte bekommt selbst auf 1920 px nur
   271 px. Nebeneinander brachen sie deshalb IMMER um, mit der dritten Aktion
   allein auf einer zweiten, rechtsbündigen Zeile. Sichtbar bleibt die häufigste
   Aktion; die selteneren stehen mit vollem Namen im Menü. */
export function RowActionsMenu({ items, label = "Weitere Aktionen", disabled }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const firstItemRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sichtbar = (items || []).filter(Boolean);
  if (sichtbar.length === 0) return null;

  const fuehreAus = (item) => {
    setOpen(false);
    triggerRef.current?.focus();
    item.onClick?.();
  };

  return (
    <div className="inv-actions" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="btn btn-sm btn-icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <Icon n="settings" s={16} />
      </button>
      {open && (
        <div className="inv-actions-menu" role="menu">
          {sichtbar.map((item, i) => (
            <button
              key={item.key || item.label}
              ref={i === 0 ? firstItemRef : undefined}
              type="button"
              role="menuitem"
              className="inv-actions-item"
              onClick={() => fuehreAus(item)}
              disabled={item.disabled}
            >
              {item.icon && <Icon n={item.icon} s={15} />}{item.label}
            </button>
          ))}
        </div>
      )}
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
