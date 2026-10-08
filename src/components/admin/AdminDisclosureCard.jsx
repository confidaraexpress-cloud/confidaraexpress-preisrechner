import React, { useEffect, useState } from "react";

/* ── Einklappbare Adminkarte (UX-Paket 4) ────────────────────────────────────
   Natives <details> auf dem Kartenmuster — dieselbe Form wie „Technische
   Informationen" (.adm-card + .adm-card-head als <summary>, Klappmarke rein per
   CSS über .adm-tech-caret), ohne zusätzliches ARIA. Neben dem Titel trägt der
   Kopf eine Kurzfassung, damit ein eingeklappter Bereich das Wichtigste schon
   sagt. Der Inhalt bleibt im DOM: selbst ladende Bereiche laden auch
   eingeklappt, und ihre Kurzfassung stimmt.

   `attention`: wird er wahr (z. B. eingereichte Abrechnungsdaten), öffnet sich
   der Bereich von selbst; schließen kann der Admin ihn jederzeit. Der
   Klappzustand ist ein Wert dieser Komponente — Neuladen der Daten setzt ihn
   nicht zurück. */
export function AdminDisclosureCard({ id, title, summary = null, attention = false, children }) {
  const [open, setOpen] = useState(attention === true);
  useEffect(() => { if (attention === true) setOpen(true); }, [attention]);
  return (
    <details id={id} className="adm-card adm-disclosure" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="adm-card-head adm-disclosure-head">
        <span className="adm-disclosure-text">
          <span className="adm-disclosure-title">{title}</span>
          {summary && <span className="adm-disclosure-summary">{summary}</span>}
        </span>
        <span className="adm-tech-caret" aria-hidden="true" />
      </summary>
      <div className="adm-card-body">{children}</div>
    </details>
  );
}

/* ── Eingeklappter Teil innerhalb eines Bereichs ─────────────────────────────
   Für Versionsverläufe und Formulare („Neue Version anlegen"): dieselbe
   Klappform wie die Versionen der Level-Regeln (.adm-sp-history-item).
   Mit `open`/`onOpenChange` steuert der Aufrufer den Zustand (ein Formular
   wird beim Öffnen vorbelegt und schließt sich nach dem Speichern), sonst
   klappt der Teil frei. Gesteuert übernimmt der Klick auf den Kopf das
   Umschalten selbst: Klappzustand und Vorbelegung ändern sich im selben
   Render — nie blitzen beim Öffnen die Eingaben vom letzten Mal auf. Öffnet
   der Browser den Teil von sich aus (Suche auf der Seite), folgt der Zustand
   über das toggle-Ereignis. */
export function AdminSubDisclosure({ id, title, open, onOpenChange, children }) {
  const [eigen, setEigen] = useState(false);
  const gesteuert = typeof open === "boolean";
  const offen = gesteuert ? open : eigen;
  return (
    <details id={id} className="adm-sp-history-item adm-sp-fold" open={offen}
      onToggle={(e) => {
        const jetzt = e.currentTarget.open;
        if (gesteuert) { if (jetzt !== open) onOpenChange?.(jetzt); } else setEigen(jetzt);
      }}>
      <summary onClick={gesteuert ? (e) => { e.preventDefault(); onOpenChange?.(!open); } : undefined}>{title}</summary>
      <div className="adm-sp-fold-body">{children}</div>
    </details>
  );
}

/* ── Einen Bereich öffnen und dorthin springen ───────────────────────────────
   Für „Nächster Schritt", Sprunglinks (Router-State `bereich`) und die
   Schrittfolge des Pre-Live-Testbereichs: der Bereich und jeder umgebende
   eingeklappte Bereich gehen auf, die Seite springt hin, der Fokus steht auf
   seinem Kopf (bzw. dem Bereich selbst, wenn er fokussierbar ist). Das
   toggle-Ereignis der <details> hält den Klappzustand der Komponenten
   synchron. */
export function openAdminSection(id) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (!el) return false;
  for (let d = el.tagName === "DETAILS" ? el : el.closest("details"); d; d = d.parentElement ? d.parentElement.closest("details") : null) {
    if (!d.open) d.open = true;
  }
  el.scrollIntoView({ block: "start" });
  const kopf = el.tagName === "DETAILS" ? el.querySelector(":scope > summary") : null;
  if (kopf) kopf.focus({ preventScroll: true });
  else if (el.hasAttribute("tabindex")) el.focus({ preventScroll: true });
  return true;
}

export default AdminDisclosureCard;
