import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { getAddresses } from "../../api/addressBookApi";
import { TAB_RECIPIENT, addressPickerLabel, addressPickerMeta } from "../../utils/addressBookView.mjs";

/* ── Empfänger aus dem Adressbuch übernehmen ─────────────────────────────────
   Kein zweites Adressbuch: die Liste kommt aus dem bestehenden Endpunkt
   `GET /api/kunde/addresses` über den vorhandenen Wrapper `getAddresses()` —
   samt dessen Query-Aufbau (buildAddressListParams, allowlisted) und dem
   zentralen 401/403-Handling. Gefiltert wird mit dem bestehenden Reiterbegriff
   `TAB_RECIPIENT`; serverseitig heißt das „recipient ODER both" (siehe
   ROLE_FILTER_EXPANSION), eine „Beides"-Adresse fehlt hier also nicht.

   Bewusst NICHT übernommen wurden die Bauteile der Adressbuchseite
   (AddressList/AddressCard/Toolbar mit Reitern, Favoritenfilter, Standardflags
   und Verwaltungsmenü). Sie tragen Verwaltungsaufgaben, die in einem
   Auswahlschritt nichts zu suchen haben — und sie liefen als zweites
   Listenmuster in einem Dialog, der direkt darunter bereits die Artikelauswahl
   (.inv-picker) zeigt. Übernommen ist, was Logik ist: API, Rollenbegriff und
   die Feldauslegung (mapAddressToOrderRecipient in addressBookView.mjs).

   Die Auswahl ist eine VORBELEGUNG. Der Auftrag speichert den Empfänger als
   Snapshot; es entsteht keine Referenz auf die Adressbuchzeile und nichts wird
   später nachsynchronisiert. */
export function RecipientAddressPicker({ onSelect, onClose, disabled }) {
  const [term, setTerm] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const sucheRef = useRef(null);

  const laden = useCallback(async (q) => {
    const meins = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const res = await getAddresses({ tab: TAB_RECIPIENT, q: q || undefined, limit: 20 });
      if (seq.current !== meins) return;
      if (!res.ok) { setError("Das Adressbuch konnte nicht geladen werden."); return; }
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      if (seq.current === meins) setError("Das Adressbuch konnte nicht geladen werden.");
    } finally {
      if (seq.current === meins) setLoading(false);
    }
  }, []);

  // Dieselbe Verzögerung wie in der Artikelsuche desselben Dialogs (300 ms) —
  // ein Takt für beide Suchen.
  useEffect(() => {
    const t = setTimeout(() => laden(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term, laden]);

  // Der Fokus wandert beim Öffnen in das Suchfeld: wer die Auswahl per Tastatur
  // öffnet, steht sonst weiterhin auf dem Auslöser, der gerade verschwunden ist.
  useEffect(() => { sucheRef.current?.focus(); }, []);

  return (
    <div className="inv-picker inv-addrpicker">
      <div className="inv-addrpicker-head">
        <label className="field-label" htmlFor="inv-addr-search">Adressbuch durchsuchen</label>
        <button type="button" className="btn btn-link btn-sm" onClick={onClose}>Abbrechen</button>
      </div>
      <input
        id="inv-addr-search"
        ref={sucheRef}
        className="field-input"
        type="search"
        placeholder="Name, Firma oder Ort"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        disabled={disabled}
      />
      <div className="inv-picker-list" role="listbox" aria-label="Empfängeradressen">
        {loading && <div className="inv-picker-empty">Adressen werden geladen …</div>}
        {!loading && error && <div className="inv-picker-empty">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="inv-picker-empty">
            {term.trim()
              ? "Keine passende Adresse gefunden."
              : "Im Adressbuch ist noch kein Empfänger hinterlegt. Sie können die Adresse unten direkt eingeben."}
          </div>
        )}
        {!loading && !error && items.map((a) => (
          <button
            key={a.id}
            type="button"
            role="option"
            aria-selected="false"
            className="inv-picker-item inv-addrpicker-item"
            onClick={() => onSelect(a)}
            disabled={disabled}
          >
            <span className="inv-addrpicker-name">{addressPickerLabel(a)}</span>
            <span className="inv-addrpicker-meta">{addressPickerMeta(a)}</span>
          </button>
        ))}
      </div>
      <p className="inv-field-hint">
        <Icon n="info" s={14} /> Die Adresse wird nur in dieses Formular übernommen. Änderungen hier
        wirken sich nicht auf das Adressbuch aus.
      </p>
    </div>
  );
}
