import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Icon } from "./Icon";
import { PROFIL_MENUE_EINTRAEGE, PROFIL_MENUE_TEXT, profilMenueLage, profilMenueZiel } from "../../utils/profilMenueView.mjs";

/* ── Profilmenü (Betreiberentscheidung 2026-11-08) ───────────────────────────────────────────────────────────────
   Ein Klick auf den Benutzerchip öffnet dieses Menü direkt unter dem Chip, statt in die Kontoeinstellungen zu wechseln.
   Kopf: Firmenmarke, Name, Firma und „Geschäftskundenkonto“; darunter vier Aktionen über bestehende Wege der Shell (Inhalt
   und Lage: utils/profilMenueView.mjs). Der Chip (UserChip) hält den Zustand und führt die Aktionen aus — hier wird nur
   gerendert, gemessen und die Tastatur geführt.

   Muster „Menu Button“: der Chip trägt aria-haspopup="menu", aria-expanded und aria-controls; die Einträge sind
   menuitem mit tabIndex -1. Beim Öffnen liegt der Fokus auf dem ersten (Pfeil hoch am Chip: auf dem letzten) Eintrag,
   Pfeiltasten wandern im Kreis, Pos1/Ende springen an die Enden. Escape schließt und gibt den Fokus an den Chip; Tab
   schließt ebenso — die Taste wandert dann vom Chip aus weiter. Ein Klick daneben, ein Fokus außerhalb und jede
   Navigation schließen ohne Fokussprung.

   Form: Portal an <body>, absolut im Dokument — das Menü scrollt mit dem Chip. Die Seite liegt unter
   `container: ce-seite` (Layout-Containment): darin wäre es an die Seite gebunden und läge unter der Ansprechpartnerkarte.
   Ebene --ce-z-dropdown wie die Kennzahl-Detailfenster. Rechtsbündig unter dem Chip, höchstens bis zum unteren
   Fensterrand (über der Demo-Leiste); reicht die Höhe nicht, scrollt nur die Liste. Ein ausgeblendeter Chip (unter 861 px
   trägt die Topbar Menü, Marke und Glocke) schließt das Menü. */

// Sichtbare Fläche: Breite ohne Bildlaufleiste; unten die Demo-Leiste, die fest am unteren Rand steht.
function sichtbareFlaeche() {
  const hoehe = window.innerHeight;
  const demo = document.querySelector(".demo-leiste");
  const fuss = demo && demo.getClientRects().length ? demo.getBoundingClientRect() : null;
  return {
    breite: document.documentElement.clientWidth || window.innerWidth,
    hoehe,
    unten: fuss ? Math.max(0, hoehe - fuss.top) : 0,
  };
}

function gleicheLage(a, b) {
  return Boolean(a) && Boolean(b) && a.top === b.top && a.left === b.left && a.breite === b.breite
    && a.maxHoehe === b.maxHoehe && a.pfeil === b.pfeil;
}

export function ProfilMenue({ id, ankerRef, start = "erstes", marke, name, org, onSchliessen, onAuswahl }) {
  const boxRef = useRef(null);
  const eintragRefs = useRef([]);
  const [lage, setLage] = useState(null);
  const onSchliessenRef = useRef(onSchliessen);
  onSchliessenRef.current = onSchliessen;
  const location = useLocation();
  const startOrt = useRef(location.key);
  const kopfId = `${id}-kopf`;

  // ── Lage unter dem Chip, in Dokumentkoordinaten (das Menü hängt absolut an <body>) ──
  const messen = useCallback(() => {
    const box = boxRef.current;
    const anker = ankerRef.current;
    if (!box) return;
    if (!anker || !anker.isConnected || anker.getClientRects().length === 0) {
      onSchliessenRef.current?.({ fokus: false });
      return;
    }
    const neu = profilMenueLage({ anker: anker.getBoundingClientRect(), flaeche: sichtbareFlaeche() });
    if (!neu) return;
    const basis = (box.offsetParent || document.body).getBoundingClientRect();
    const imDokument = { ...neu, top: Math.round(neu.top - basis.top), left: Math.round(neu.left - basis.left) };
    setLage((alt) => (gleicheLage(alt, imDokument) ? alt : imDokument));
  }, [ankerRef]);

  useLayoutEffect(() => { messen(); }, [messen]);

  useEffect(() => {
    const nach = () => messen();
    window.addEventListener("resize", nach);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(nach) : null;
    if (ro) {
      if (ankerRef.current) ro.observe(ankerRef.current);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener("resize", nach);
      if (ro) ro.disconnect();
    };
  }, [messen, ankerRef]);

  // ── Fokus hinein, sobald das Menü sichtbar ist (vor der ersten Messung nimmt es keinen Fokus an) ──
  const bereit = lage !== null;
  useEffect(() => {
    if (!bereit) return;
    const liste = eintragRefs.current.filter(Boolean);
    const ziel = start === "letztes" ? liste[liste.length - 1] : liste[0];
    if (ziel) ziel.focus({ preventScroll: true });
  }, [bereit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Klick daneben schließt (der Chip schaltet selbst um); Escape schließt und gibt den Fokus an den Chip ──
  useEffect(() => {
    const daneben = (e) => {
      const ziel = e.target;
      if (!(ziel instanceof Node)) return;
      if (boxRef.current?.contains(ziel) || ankerRef.current?.contains(ziel)) return;
      onSchliessenRef.current?.({ fokus: false });
    };
    const taste = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onSchliessenRef.current?.({ fokus: true });
    };
    // Zurück/Vor des Browsers schließt sofort — auch während die Zielseite noch lädt (die alte Seite steht dann noch).
    const zurueck = () => onSchliessenRef.current?.({ fokus: false });
    document.addEventListener("pointerdown", daneben);
    document.addEventListener("keydown", taste);
    window.addEventListener("popstate", zurueck);
    return () => {
      document.removeEventListener("pointerdown", daneben);
      document.removeEventListener("keydown", taste);
      window.removeEventListener("popstate", zurueck);
    };
  }, [ankerRef]);

  // ── Jede Navigation schließt (auch eine, bei der der Chip stehen bleibt) ──
  useEffect(() => {
    if (location.key !== startOrt.current) onSchliessenRef.current?.({ fokus: false });
  }, [location.key]);

  const tasteImMenue = (e) => {
    const liste = eintragRefs.current.filter(Boolean);
    const ziel = profilMenueZiel(e.key, liste.indexOf(document.activeElement), liste.length);
    if (ziel !== null) {
      e.preventDefault();
      liste[ziel].focus();
      return;
    }
    // Tab verlässt das Menü: schließen und den Fokus an den Chip geben — die Taste wandert von dort weiter.
    if (e.key === "Tab") onSchliessenRef.current?.({ fokus: true });
  };

  // Fokus außerhalb von Menü und Chip (z. B. Lesemodus eines Screenreaders) schließt. Ohne neues Ziel hat das Fenster
  // den Fokus verloren (anderes Programm) — dann bleibt das Menü stehen.
  const fokusVerlassen = (e) => {
    const neu = e.relatedTarget;
    if (!(neu instanceof Node)) return;
    if (boxRef.current?.contains(neu) || ankerRef.current?.contains(neu)) return;
    onSchliessenRef.current?.({ fokus: false });
  };

  if (typeof document === "undefined") return null;
  const stil = lage
    ? { top: lage.top, left: lage.left, width: lage.breite, maxHeight: lage.maxHoehe, "--ce-pm-pfeil": `${lage.pfeil}px` }
    : { visibility: "hidden" };

  return createPortal(
    <div ref={boxRef} className="ce-pm" data-bereit={bereit ? "ja" : undefined} style={stil} onBlur={fokusVerlassen}>
      <div className="ce-pm-kopf">
        <span className="ce-pm-marke" aria-hidden="true">{marke}</span>
        <div className="ce-pm-identitaet" id={kopfId}>
          <span className="ce-pm-name">{name}</span>
          {org && <span className="ce-pm-firma">{org}</span>}
          <span className="ce-pm-kontoart">{PROFIL_MENUE_TEXT.kontoart}</span>
        </div>
      </div>
      <div className="ce-pm-liste" id={id} role="menu" aria-labelledby={kopfId} onKeyDown={tasteImMenue}>
        {PROFIL_MENUE_EINTRAEGE.map((eintrag, i) => (
          <React.Fragment key={eintrag.key}>
            {eintrag.trennerDavor && <div className="ce-pm-trenner" role="separator" />}
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              ref={(el) => { eintragRefs.current[i] = el; }}
              className={`ce-pm-eintrag${eintrag.abmelden ? " ce-pm-eintrag--abmelden" : ""}`}
              data-eintrag={eintrag.key}
              onClick={() => onAuswahl(eintrag)}
            >
              <span className="ce-pm-symbol" aria-hidden="true"><Icon n={eintrag.icon} s={18} /></span>
              <span className="ce-pm-text">
                <span className="ce-pm-titel">{eintrag.titel}</span>
                {eintrag.untertitel && <span className="ce-pm-untertitel">{eintrag.untertitel}</span>}
              </span>
              {!eintrag.abmelden && <span className="ce-pm-pfeil" aria-hidden="true"><Icon n="chevronRight" s={16} /></span>}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>,
    document.body,
  );
}
