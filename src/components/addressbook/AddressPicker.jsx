import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { getAddresses } from "../../api/addressBookApi";
import {
  TAB_SENDER, TAB_RECIPIENT,
  addressPickerLabel, addressPickerPerson, addressPickerMeta,
} from "../../utils/addressBookView.mjs";

/* ── Adresse aus dem Adressbuch auswählen ────────────────────────────────────
   EIN Auswahlbauteil für das ganze Portal. Es kennt weder „Neue Sendung" noch
   Aufträge, Entwürfe oder Buchung: es sucht, zeigt an und gibt die GEWÄHLTE
   ADRESSE zurück. Was mit ihr geschieht — welches Formular sie befüllt, welche
   Felder wie heißen —, entscheidet ausschließlich der Aufrufer über `onSelect`.
   Die Feldauslegung liegt weiterhin in addressBookView.mjs
   (mapAddressToShipmentFormPatch / mapAddressToOrderRecipient).

   Hervorgegangen aus `components/inventory/RecipientAddressPicker`, der genau
   dasselbe tat, aber auf `TAB_RECIPIENT` festverdrahtet war. Statt ihn für den
   Absender zu kopieren, trägt der Reiter jetzt eine Prop — Kopien driften.

   Kein zweites Adressbuch: die Liste kommt aus dem bestehenden Endpunkt
   `GET /api/kunde/addresses` über den vorhandenen Wrapper `getAddresses()` —
   samt dessen Query-Aufbau (buildAddressListParams, allowlisted) und dem
   zentralen 401/403-Handling. Gefiltert wird mit den bestehenden Reiterbegriffen:
   `TAB_SENDER` heißt serverseitig „sender ODER both", `TAB_RECIPIENT`
   „recipient ODER both" (ROLE_FILTER_EXPANSION) — eine „Beides"-Adresse fehlt
   also in keiner der beiden Ansichten.

   Bewusst NICHT übernommen sind die Bauteile der Adressbuchseite (Reiter,
   Favoritenfilter, Standardflags, Verwaltungsmenü). Sie tragen
   Verwaltungsaufgaben, die in einem Auswahlschritt nichts zu suchen haben.

   Die Auswahl ist eine VORBELEGUNG. Es entsteht keine Referenz auf die
   Adressbuchzeile, nichts wird später nachsynchronisiert und nichts wird ins
   Adressbuch zurückgeschrieben. */

const SEITENGROESSE = 20;
const LADEFEHLER = "Das Adressbuch konnte nicht geladen werden.";

// Anzeige-/ARIA-Texte je Reiter. Der Aufrufer übergibt nur den Reiter, nicht
// vier Textbausteine — sonst stünde derselbe Satz an mehreren Stellen.
const TEXTE = {
  [TAB_SENDER]: {
    listenname: "Absenderadressen",
    leer: "Im Adressbuch ist noch keine eigene Adresse hinterlegt. Sie können die Adresse direkt im Formular eingeben.",
  },
  [TAB_RECIPIENT]: {
    listenname: "Empfängeradressen",
    leer: "Im Adressbuch ist noch kein Empfänger hinterlegt. Sie können die Adresse direkt im Formular eingeben.",
  },
};

// Fokus auf die Option, die `schritt` Positionen von der aktuellen entfernt ist.
// Pfeiltasten sind eine Zugabe — Tab funktioniert unverändert, weil jede Option
// ein echtes <button> bleibt.
function bewegeFokus(wurzel, schritt) {
  const optionen = [...(wurzel?.querySelectorAll('[role="option"]') || [])];
  if (optionen.length === 0) return;
  const aktiv = document.activeElement;
  const jetzt = optionen.indexOf(aktiv);
  let ziel;
  if (schritt === "erste") ziel = 0;
  else if (schritt === "letzte") ziel = optionen.length - 1;
  else if (jetzt === -1) ziel = schritt > 0 ? 0 : optionen.length - 1;
  else ziel = Math.min(Math.max(jetzt + schritt, 0), optionen.length - 1);
  optionen[ziel]?.focus();
}

export function AddressPicker({ tab, onSelect, onClose, disabled }) {
  // Deterministische Normalisierung statt stiller Vorgabe: ein fehlender oder
  // unbekannter Reiter darf nie zu einer UNGEFILTERTEN Liste führen — im
  // Absenderfeld stünden sonst fremde Empfängeradressen.
  const reiter = tab === TAB_SENDER ? TAB_SENDER : TAB_RECIPIENT;
  const texte = TEXTE[reiter];

  const [term, setTerm] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const abbruchRef = useRef(null);
  const sucheRef = useRef(null);
  const wurzelRef = useRef(null);
  const feldId = useId();

  const laden = useCallback(async (q) => {
    // Zwei Schutzschichten gegen ein überholtes Ergebnis, weil sie
    // Unterschiedliches leisten: der AbortController bricht den noch laufenden
    // Request ab (spart die Antwort), der Sequenzzähler verwirft eine Antwort,
    // die bereits unterwegs war, als abgebrochen wurde. Ohne den Zähler könnte
    // ein früher gestarteter, schon aufgelöster Request die neuere Liste
    // überschreiben.
    const meins = ++seq.current;
    abbruchRef.current?.abort();
    const controller = new AbortController();
    abbruchRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const res = await getAddresses(
        { tab: reiter, q: q || undefined, limit: SEITENGROESSE },
        { signal: controller.signal }
      );
      if (seq.current !== meins) return;
      if (!res.ok) { setError(LADEFEHLER); setItems([]); return; }
      const data = await res.json();
      if (seq.current !== meins) return;
      setItems(data.items || []);
    } catch (e) {
      // Ein abgebrochener Request ist kein Fehler des Nutzers — er hat nur
      // weitergetippt. Ohne diese Unterscheidung blitzte bei jedem Tastendruck
      // kurz „konnte nicht geladen werden" auf.
      if (e?.name === "AbortError") return;
      if (seq.current === meins) { setError(LADEFEHLER); setItems([]); }
    } finally {
      if (seq.current === meins) setLoading(false);
    }
  }, [reiter]);

  // Entprellt (300 ms) — derselbe Takt wie die Artikelsuche. Serverseitige
  // Suche über `q`, keine clientseitige Vollbeladung des Adressbuchs.
  useEffect(() => {
    const t = setTimeout(() => laden(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term, laden]);

  // Beim Verlassen den letzten Request abbrechen — sonst schriebe seine Antwort
  // noch in einen abgehängten Baum.
  useEffect(() => () => abbruchRef.current?.abort(), []);

  // Der Fokus wandert beim Öffnen in das Suchfeld: wer die Auswahl per Tastatur
  // öffnet, steht sonst weiterhin auf dem Auslöser, der gerade verschwunden ist
  // beziehungsweise hinter der Auswahl liegt.
  useEffect(() => { sucheRef.current?.focus(); }, []);

  // Tastatur als NATIVER Listener am eigenen Knoten — nicht als React-onKeyDown.
  //
  // Gemessen: `useDialog` hängt sein Escape an den DOM-Knoten des Dialogs.
  // React 18 stellt Synthetic Events dagegen am Wurzelcontainer zu, also erst
  // NACH allen nativen Listenern dazwischen. Ein `stopPropagation()` im
  // React-Handler kam damit zu spät: Escape schloss im Auftragsdialog erst die
  // Auswahl und dann den ganzen Dialog samt eingetragener Positionen. Als
  // nativer Listener am eigenen (tiefer liegenden) Knoten läuft er VOR dem des
  // Dialogs, und das stopPropagation wirkt.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const knoten = wurzelRef.current;
    if (!knoten) return undefined;
    const beiTaste = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current?.(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); bewegeFokus(knoten, 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); bewegeFokus(knoten, -1); }
      else if (e.key === "Home" && e.target !== sucheRef.current) { e.preventDefault(); bewegeFokus(knoten, "erste"); }
      else if (e.key === "End" && e.target !== sucheRef.current) { e.preventDefault(); bewegeFokus(knoten, "letzte"); }
    };
    knoten.addEventListener("keydown", beiTaste);
    return () => knoten.removeEventListener("keydown", beiTaste);
  }, []);

  return (
    <div className="abk-pick-panel" ref={wurzelRef}>
      <div className="abk-pick-head">
        <label className="field-label" htmlFor={`${feldId}-suche`}>Adressbuch durchsuchen</label>
        <button type="button" className="btn btn-link btn-sm" onClick={onClose}>Abbrechen</button>
      </div>
      <input
        id={`${feldId}-suche`}
        ref={sucheRef}
        className="field-input"
        type="search"
        placeholder="Name, Firma oder Ort"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        aria-controls={`${feldId}-liste`}
      />
      <div className="abk-pick-list" id={`${feldId}-liste`} role="listbox" aria-label={texte.listenname} aria-busy={loading}>
        {loading && <div className="abk-pick-state">Adressen werden geladen …</div>}
        {!loading && error && <div className="abk-pick-state">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="abk-pick-state">
            {term.trim() ? "Keine passende Adresse gefunden." : texte.leer}
          </div>
        )}
        {!loading && !error && items.map((a) => {
          const person = addressPickerPerson(a);
          const anschrift = addressPickerMeta(a);
          return (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected="false"
              className="abk-pick-item"
              onClick={() => onSelect?.(a)}
              disabled={disabled}
            >
              <span className="abk-pick-name">{addressPickerLabel(a)}</span>
              {person && <span className="abk-pick-person">{person}</span>}
              {anschrift && <span className="abk-pick-meta">{anschrift}</span>}
            </button>
          );
        })}
      </div>
      <p className="abk-pick-hint">
        <Icon n="info" s={14} /> Die Adresse wird nur in dieses Formular übernommen. Änderungen hier
        wirken sich nicht auf das Adressbuch aus.
      </p>
    </div>
  );
}
