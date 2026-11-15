import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bewegeMarke, istWechsel, optionsIndex, startMarke } from "./auswahlLogik.mjs";

/* ─── Auswahlmenü des Kundenbereichs (Premium Control System 2.0, 2026-11-14) ─────────────────────────────────
 *
 * EIN Bauteil für jede Auswahl aus wenigen benannten Optionen, die bisher als große Auswahlkarten untereinander
 * stand: Transportabsicherung und Art der Lieferadresse (Buchung), Lieferscheine und Abrechnung (Konto).
 * Geschlossen ist es ein Feld mit dem gewählten Wert; geöffnet eine Liste mit Name, Zusatz (etwa ein Preis) und
 * einer kurzen Erklärung je Option.
 *
 * REINE BEDIENUNG. Das Bauteil kennt keine Fachregel: welche Optionen es gibt, welche gesperrt sind und was eine
 * Wahl auslöst (Neubepreisung, Speichern, Bindung), entscheidet der Aufrufer. Es meldet nur einen echten Wechsel —
 * die schon gewählte Option und gesperrte Optionen lösen nichts aus.
 *
 * MUSTER: „select-only combobox“ (WAI-ARIA 1.2), dasselbe wie die Uhrzeitauswahl (DeliveryTimeSelect). Der Fokus
 * bleibt auf dem Auslöser, die markierte Option steht in `aria-activedescendant`. Die Liste hängt im Portal an
 * `document.body`: so schneidet sie kein Vorfahr mit `overflow: hidden` ab und kein Vorfahr mit `transform`
 * verankert `position: fixed` neu (beide Fallen sind in DeliveryTimeSelect beschrieben).
 *
 * ÖFFNUNGSRICHTUNG IST FEST: IMMER NACH UNTEN, wie in DeliveryTimeSelect. Fehlt unter dem Auslöser Platz für die ganze
 * Liste, rückt die Seite vor dem ersten Zeichnen ohne Animation nach oben — höchstens so weit, dass der Auslöser unter
 * den festen Leisten am oberen Rand sichtbar bleibt — gemessen, nicht gespiegelt; Leisten, die erst beim Scrollen
 * erscheinen, melden sich mit `data-klebt-oben` an (angemeldeteOberkante). Reicht es dann noch nicht, scrollt die Liste
 * in sich; sie beginnt oben. Feste Leisten am unteren Rand (etwa die Leiste der Demo)
 * begrenzen die Liste ebenso — sie endet über ihnen statt darunter zu verschwinden. Gemessener Anlass: mobil (390 px)
 * stand die Liste der Transportabsicherung sonst so, dass die erste Option über dem sichtbaren Teil lag. Verlässt der Auslöser beim
 * Scrollen den Bildschirm, schließt die Liste — sie schwebt nie losgelöst über fremdem Inhalt.
 *
 * TASTATUR: Enter, Leertaste und Pfeiltasten öffnen; Pfeile, Pos1 und Ende bewegen die Markierung; Enter und
 * Leertaste wählen; Escape schließt ohne Wahl; Tab schließt ohne Wahl. Bewusst KEINE Wahl per Tab (abweichend vom
 * Vorschlag der APG): hier löst eine Wahl Speichern oder eine Neubepreisung aus — das darf nie beiläufig geschehen.
 */

const ABSTAND = 6;      // Luft zwischen Auslöser und Liste
const RAND = 12;        // Mindestabstand zum Bildrand bzw. zu festen Leisten
const MAX_HOEHE = 560;  // wenige Optionen mit Erklärung: mobil rund 520 px (Transportabsicherung, 390 px Breite)
const MIN_HOEHE = 150;  // darunter wäre eine Liste mit Erklärungen nicht mehr sinnvoll bedienbar
const NAMENSZEILE = 48; // Polster und Namenszeile einer Option — so viel muss von der gewählten beim Öffnen zu sehen sein

/** Feste Leiste unter einem Punkt: das Rechteck vom getroffenen Element bis zu seinem Vorfahren mit position
 *  fixed/sticky. Über die ganze Kette gemessen, weil der klebende Träger selbst die Höhe 0 haben kann und nur sein
 *  Inhalt herausragt (BookingStickySummary). null = der Punkt liegt auf mitscrollendem Inhalt. */
function leisteAn(el) {
  let oben = Infinity;
  let unten = -Infinity;
  for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const r = n.getBoundingClientRect();
    if (r.height > 0) { oben = Math.min(oben, r.top); unten = Math.max(unten, r.bottom); }
    const p = getComputedStyle(n).position;
    if (p === "fixed" || p === "sticky") return oben <= unten ? { oben, unten } : null;
  }
  return null;
}

/** Unterkante der am oberen Bildrand übereinanderliegenden festen Leisten an der Stelle x (0 = keine Leiste). */
function freieOberkante(x) {
  let y = 0;
  for (let i = 0; i < 4; i += 1) {
    const leiste = leisteAn(document.elementFromPoint(x, y + 1));
    if (!leiste || leiste.unten <= y + 1) break;
    y = leiste.unten;
  }
  return y;
}

/** Leisten, die erst beim Scrollen erscheinen, sind vorher nicht zu treffen: Die klebende Buchungszusammenfassung blendet
 *  sich ein, sobald die große Zusammenfassung aus dem Bild ist — gemessen lag sie danach über dem Auslöser (390 × 844).
 *  Solche Leisten melden sich mit `data-klebt-oben` an. Ihr Inhalt ist schon gesetzt (nur unsichtbar), also steht die
 *  Unterkante, die sie beim Kleben hätten, vorab fest: Klebeabstand (`top`) plus Inhaltshöhe. Nur Leisten über dem
 *  Auslöser zählen — eine darunter kann ihn beim Hochrücken nicht erreichen. */
function angemeldeteOberkante(ausloeserOben) {
  let y = 0;
  for (const el of document.querySelectorAll("[data-klebt-oben]")) {
    const r = el.getBoundingClientRect();
    if (r.top > ausloeserOben) continue;
    let hoehe = r.height;
    for (const kind of el.children) hoehe = Math.max(hoehe, kind.getBoundingClientRect().height);
    y = Math.max(y, (parseFloat(getComputedStyle(el).top) || 0) + hoehe);
  }
  return y;
}

/** Oberkante der am unteren Bildrand liegenden festen Leisten an der Stelle x (Bildhöhe = keine Leiste). Die offene
 *  Liste selbst ist auch fest positioniert — sie wird beim Abtasten übersprungen. */
function freieUnterkante(x, liste) {
  let y = window.innerHeight;
  for (let i = 0; i < 4; i += 1) {
    const treffer = document.elementsFromPoint(x, y - 1).find((el) => !liste || !liste.contains(el));
    const leiste = leisteAn(treffer);
    if (!leiste || leiste.oben >= y - 1) break;
    y = leiste.oben;
  }
  return y;
}

export function AuswahlMenue({
  name, id, labelId, value, options, onChange,
  placeholder = "Bitte wählen", disabled = false, busy = false, describedBy, className = "",
}) {
  const [offen, setOffen] = useState(false);
  const [markiert, setMarkiert] = useState(-1);
  const wrapRef = useRef(null);
  const ausloeserRef = useRef(null);
  const listeRef = useRef(null);
  const eigeneId = useId();

  const optionen = Array.isArray(options) ? options : [];
  const ausloeserId = id || `auswahl${eigeneId}`;
  const listeId = `${ausloeserId}-liste`;
  const optionId = (o, i) => o.id || `${listeId}-${i}`;
  const gewaehlt = optionen[optionsIndex(optionen, value)] || null;

  // Lage und Höhe der Liste werden DIREKT am Knoten gesetzt, nicht als React-State: Die Entscheidungen beim Öffnen
  // (Platz schaffen, Startscroll) brauchen die fertige Geometrie im selben Layoutschritt. Als State kam sie einen
  // Durchlauf später an — gemessen entschied der Startscroll dann mit Listenbreite 0 und scrollte die Liste weg.
  const platziere = useCallback(() => {
    const liste = listeRef.current;
    const t = ausloeserRef.current?.getBoundingClientRect();
    if (!liste || !t) return;
    // Auslöser außer Sicht (weggescrollt): schließen statt eine losgelöste Liste stehen zu lassen.
    if (t.bottom < 0 || t.top > window.innerHeight) { setOffen(false); return; }
    const top = t.bottom + ABSTAND;
    const bisLeiste = freieUnterkante(t.left + t.width / 2, liste) - top;
    liste.style.top = `${top}px`;
    liste.style.left = `${t.left}px`;
    liste.style.width = `${t.width}px`;
    // Bis RAND über der nächsten festen Leiste, höchstens MAX_HOEHE. Wird es knapp, fällt zuerst der Rand, dann die
    // Mindesthöhe: Die Liste endet nie unter einer festen Leiste (gemessen bei 200 % Zoom, 720 × 450 — sonst lag ihr Ende
    // unter der Demo-Leiste). Erst unter einer Namenszeile Platz ist eine Überdeckung unvermeidlich.
    liste.style.maxHeight = `${Math.max(Math.min(MIN_HOEHE, bisLeiste), Math.min(MAX_HOEHE, bisLeiste - RAND), NAMENSZEILE)}px`;
  }, []);

  // Beim Öffnen muss der Auslöser ganz im Bild stehen (zwischen den festen Leisten oben und unten). Per Tastatur
  // bleibt er fokussiert, auch wenn er weggescrollt ist, und der Fokus selbst scrollt mit `scroll-behavior: smooth`
  // erst noch hin — gemessen schloss die Liste sonst im selben Augenblick wieder, weil platziere() den Auslöser
  // außer Sicht fand (Enter direkt nach dem Fokus, tests/e2e/billingMode.test.mjs B12). Ohne Animation, wie unten.
  const insBild = useCallback(() => {
    const t = ausloeserRef.current?.getBoundingClientRect();
    if (!t) return;
    const x = t.left + t.width / 2;
    const oben = Math.max(freieOberkante(x), angemeldeteOberkante(t.top)) + RAND;
    const unten = freieUnterkante(x, listeRef.current) - RAND;
    const dy = t.top < oben ? t.top - oben : t.bottom > unten ? t.bottom - unten : 0;
    if (dy === 0) return;
    const wurzel = document.documentElement;
    const vorher = wurzel.style.scrollBehavior;
    wurzel.style.scrollBehavior = "auto";
    window.scrollBy(0, dy);
    wurzel.style.scrollBehavior = vorher;
  }, []);

  // Platz für die ganze Liste schaffen (siehe Kopf, ÖFFNUNGSRICHTUNG). Ohne Animation: globals.css setzt
  // `scroll-behavior: smooth`, ein animierter Sprung ließe die Liste sichtbar nachrutschen (DeliveryTimeSelect).
  const platzSchaffen = useCallback(() => {
    const liste = listeRef.current;
    const t = ausloeserRef.current?.getBoundingClientRect();
    if (!liste || !t) return;
    const x = t.left + t.width / 2;
    // Bedarf als Rahmenmaß wie max-height (border-box): Inhalt plus Rahmen — ohne den Rahmen fehlten 2 px (gemessen).
    const bedarf = liste.scrollHeight + (liste.offsetHeight - liste.clientHeight);
    const fehlt = Math.min(MAX_HOEHE, bedarf) - (freieUnterkante(x, liste) - t.bottom - ABSTAND - RAND);
    if (fehlt <= 0) return;
    const hoch = Math.min(fehlt, t.top - Math.max(freieOberkante(x), angemeldeteOberkante(t.top)) - RAND);
    if (hoch <= 0) return;
    const wurzel = document.documentElement;
    const vorher = wurzel.style.scrollBehavior;
    wurzel.style.scrollBehavior = "auto";
    window.scrollBy(0, hoch);
    wurzel.style.scrollBehavior = vorher;
    platziere();
  }, [platziere]);

  // Beim Öffnen beginnt die Liste oben: wenige Optionen mit Erklärung liest man von der ersten an, und eine unten
  // angeschnittene Option zeigt, dass es weitergeht — eine oben verschwundene zeigt nichts. Die gewählte wird nur
  // hereingeholt, wenn nicht einmal ihre Namenszeile zu sehen wäre, und dann nur bis zu dieser Zeile, nicht ganz: So
  // bleibt von den Optionen darüber so viel wie möglich stehen (gemessen bei 360 px: mit scrollIntoView verschwand
  // „Standardversicherung“ vollständig über dem Rand, wenn „Keine“ gewählt war).
  const startScroll = useCallback(() => {
    const liste = listeRef.current;
    const option = liste?.querySelector('[data-markiert="true"]');
    if (!option) return;
    const sichtbarBis = option.offsetTop + Math.min(option.offsetHeight, NAMENSZEILE);
    if (sichtbarBis > liste.clientHeight) liste.scrollTop = sichtbarBis - liste.clientHeight;
  }, []);

  // Messen vor dem Zeichnen; ein zweites Mal im nächsten Frame, falls sich der Auslöser noch bewegt.
  useLayoutEffect(() => {
    if (!offen) return undefined;
    insBild();
    platziere();
    platzSchaffen();
    startScroll();
    const frame = requestAnimationFrame(platziere);
    return () => cancelAnimationFrame(frame);
  }, [offen, insBild, platziere, platzSchaffen, startScroll]);

  useEffect(() => {
    if (!offen) return undefined;
    const nachfuehren = () => platziere();
    window.addEventListener("scroll", nachfuehren, true);
    window.addEventListener("resize", nachfuehren);
    return () => {
      window.removeEventListener("scroll", nachfuehren, true);
      window.removeEventListener("resize", nachfuehren);
    };
  }, [offen, platziere]);

  // Klick außerhalb schließt. Die Liste hängt im Portal — Umschlag und Liste werden einzeln geprüft.
  useEffect(() => {
    if (!offen) return undefined;
    const aussen = (e) => {
      if (!wrapRef.current?.contains(e.target) && !listeRef.current?.contains(e.target)) setOffen(false);
    };
    document.addEventListener("mousedown", aussen);
    return () => document.removeEventListener("mousedown", aussen);
  }, [offen]);

  // Die per Tastatur markierte Option im Sichtbereich der Liste halten. Nicht beim Öffnen (das regelt startScroll)
  // und nie beim Zeigen: Eine halb sichtbare Option unter dem Zeiger zöge die Liste sonst unter ihm weg.
  const geradeGeoeffnet = useRef(false);
  const durchZeiger = useRef(false);
  useEffect(() => {
    if (!offen || markiert < 0) return;
    if (geradeGeoeffnet.current) { geradeGeoeffnet.current = false; durchZeiger.current = false; return; }
    if (durchZeiger.current) { durchZeiger.current = false; return; }
    listeRef.current?.querySelector('[data-markiert="true"]')?.scrollIntoView({ block: "nearest" });
  }, [offen, markiert]);

  // Gesperrt während die Liste offen ist (etwa eine laufende Bindung): sofort zu.
  useEffect(() => { if (disabled && offen) setOffen(false); }, [disabled, offen]);

  const schliessen = useCallback(() => {
    setOffen(false);
    ausloeserRef.current?.focus();
  }, []);

  const oeffne = (marke) => {
    geradeGeoeffnet.current = true;
    setMarkiert(marke);
    setOffen(true);
  };

  const waehle = (index) => {
    const o = optionen[index];
    if (!o || o.disabled) return; // gesperrt: die Liste bleibt offen, der Grund steht an der Option
    const wechsel = istWechsel(optionen, index, value);
    setOffen(false);
    ausloeserRef.current?.focus();
    if (wechsel) onChange(o.value);
  };

  const beiTaste = (e) => {
    if (!offen) {
      if (["Enter", " ", "Spacebar", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        oeffne(startMarke(optionen, value));
      }
      return;
    }
    const naechste = bewegeMarke(markiert, e.key, optionen.length);
    if (naechste !== null) { e.preventDefault(); setMarkiert(naechste); return; }
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); waehle(markiert); return; }
    if (e.key === "Tab") setOffen(false);
  };

  // Escape NATIV am Umschlag (nicht als React-onKeyDown): React stellt Synthetic Events erst am Wurzelcontainer
  // zu, ein umgebender Dialog schlösse sonst zuerst. Dieselbe gemessene Falle wie in DeliveryTimeSelect.
  const schliessenRef = useRef(schliessen);
  schliessenRef.current = schliessen;
  useEffect(() => {
    if (!offen) return undefined;
    const knoten = wrapRef.current;
    if (!knoten) return undefined;
    const beiEscape = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      schliessenRef.current();
    };
    knoten.addEventListener("keydown", beiEscape);
    return () => knoten.removeEventListener("keydown", beiEscape);
  }, [offen]);

  // Ein eigener Name (aria-label, etwa Name plus Preis in Worten) verdrängt den Inhalt der Option — Abzeichen, Erklärung
  // und Hinweis bleiben dann als Beschreibung erreichbar. Ohne eigenen Namen stehen sie schon im Namen.
  const beschreibungVon = (o, i) => {
    if (!o.ariaLabel) return undefined;
    const ids = [o.badge && "abzeichen", o.description && "beschreibung", o.hint && "hinweis"]
      .filter(Boolean).map((teil) => `${optionId(o, i)}-${teil}`);
    return ids.length ? ids.join(" ") : undefined;
  };

  const zusatz = (o) => (o && o.aside ? (
    <span className="ce-auswahl-zusatz">
      <span className="ce-auswahl-zusatz-wert">{o.aside}</span>
      {o.asideSub && <span className="ce-auswahl-zusatz-unter">{o.asideSub}</span>}
    </span>
  ) : null);

  return (
    <div className={`ce-auswahl${className ? ` ${className}` : ""}`} ref={wrapRef} data-auswahl={name}>
      <button
        type="button"
        id={ausloeserId}
        ref={ausloeserRef}
        className={`field-select ce-auswahl-ausloeser${offen ? " is-open" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={offen}
        aria-controls={offen ? listeId : undefined}
        aria-activedescendant={offen && markiert >= 0 && optionen[markiert] ? optionId(optionen[markiert], markiert) : undefined}
        aria-labelledby={labelId ? `${labelId} ${ausloeserId}` : undefined}
        aria-describedby={describedBy || undefined}
        aria-busy={busy || undefined}
        data-wert={gewaehlt ? String(gewaehlt.value) : ""}
        disabled={disabled}
        onClick={() => (offen ? schliessen() : oeffne(startMarke(optionen, value)))}
        onKeyDown={beiTaste}
      >
        <span className="ce-auswahl-wert">
          <span className={`ce-auswahl-wert-text${gewaehlt ? "" : " is-platzhalter"}`}>{gewaehlt ? gewaehlt.label : placeholder}</span>
          {zusatz(gewaehlt)}
        </span>
        <span className="ce-auswahl-marke" aria-hidden="true" />
      </button>

      {offen && createPortal(
        <ul
          className="ce-auswahl-liste"
          id={listeId}
          ref={listeRef}
          role="listbox"
          data-auswahl={name}
          aria-labelledby={labelId || undefined}
          // Ein Klick in Rand oder Fuge (kein <li> getroffen) nähme sonst dem Auslöser den Fokus: die Liste stünde offen,
          // Pfeile und Escape gingen ins Leere. Rechts von clientWidth liegt die Bildlaufleiste — sie bleibt bedienbar.
          onMouseDown={(e) => { if (e.target === e.currentTarget && e.nativeEvent.offsetX < e.currentTarget.clientWidth) e.preventDefault(); }}
        >
          {optionen.map((o, i) => (
            <li
              key={String(o.value)}
              id={optionId(o, i)}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled ? true : undefined}
              aria-label={o.ariaLabel || undefined}
              aria-describedby={beschreibungVon(o, i)}
              data-wert={String(o.value)}
              data-markiert={i === markiert ? "true" : undefined}
              className={`ce-auswahl-option${i === markiert ? " is-marked" : ""}`}
              // mousedown verhindert nur den Fokuswechsel (der Fokus bleibt am Auslöser); gewählt wird mit dem Klick.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => waehle(i)}
              // Markiert wird erst bei echter Zeigerbewegung: Unter einem ruhenden Zeiger, über den die Liste aufgeht oder
              // per Tastatur weiterscrollt, feuert mouseenter auch ohne Bewegung und verschöbe die Tastaturmarkierung.
              onMouseMove={() => { if (i !== markiert) { durchZeiger.current = true; setMarkiert(i); } }}
            >
              <span className="ce-auswahl-haken" aria-hidden="true" />
              <span className="ce-auswahl-text">
                <span className="ce-auswahl-kopf">
                  <span className="ce-auswahl-name" lang="de">{o.label}</span>
                  {o.badge && <span className="ce-auswahl-abzeichen" id={`${optionId(o, i)}-abzeichen`}>{o.badge}</span>}
                </span>
                {o.description && <span className="ce-auswahl-beschreibung" id={`${optionId(o, i)}-beschreibung`}>{o.description}</span>}
                {o.hint && <span className="ce-auswahl-hinweis" id={`${optionId(o, i)}-hinweis`}>{o.hint}</span>}
              </span>
              {zusatz(o)}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
