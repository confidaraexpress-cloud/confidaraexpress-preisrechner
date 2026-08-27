import React, { useState } from "react";
import { apiFetch } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { eoriFieldError, normalizeEori, hasUsableEori, EORI_HINT } from "../../utils/eori.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// EORI-Erfassung im Zollabschnitt der Buchung.
//
// Warum das Feld HIER steht und nicht nur in den Kontoeinstellungen:
//   Die EORI ist ein Kontostammdatum, gebraucht wird sie aber erst beim Buchen einer
//   zollpflichtigen Sendung. Wer den Kunden an dieser Stelle in die Kontoeinstellungen
//   schickt, kostet ihn seinen laufenden Versandvorgang — Formular, Angebote und
//   Auswahl leben nur im Arbeitsspeicher. Deshalb wird sie an Ort und Stelle erfasst
//   und über DIESELBE Profil-API gespeichert wie in den Kontoeinstellungen.
//
// Es entsteht dabei ausdrücklich KEINE zweite EORI: gespeichert wird das Kontofeld,
// nicht ein Wert an dieser Sendung. Der Buchungspayload liest die Nummer unverändert
// serverseitig aus dem authentifizierten Konto — dieses Formular sendet sie nie mit.
// ─────────────────────────────────────────────────────────────────────────────

export const EORI_MISSING_TITLE = "EORI-Nummer erforderlich";
export const EORI_MISSING_TEXT =
  "Für diese zollpflichtige Sendung benötigen wir die EORI-Nummer Ihres Unternehmens.";
export const EORI_SAVE_LABEL = "EORI speichern";
export const EORI_LATER_NOTE = "Später unter Kontoeinstellungen änderbar.";
export const EORI_SAVED_TEXT = "EORI-Nummer gespeichert.";

export function CustomsEoriSection({ user, required = true, onSaved }) {
  const { updateUser } = useAuth();
  const gespeichert = user?.eori_number || "";
  const vorhanden = hasUsableEori(gespeichert);

  const [wert, setWert] = useState("");
  const [fehler, setFehler] = useState("");
  const [speichert, setSpeichert] = useState(false);
  const [quittung, setQuittung] = useState(false);

  // ── Die Reihenfolge ist tragend ────────────────────────────────────────────
  // `required` gewinnt über den lokal bekannten Kontowert. Grund: die Buchung wird
  // serverseitig entschieden. Lehnt `/book` mit EORI_REQUIRED ab, während das im
  // Browser gehaltene Konto noch eine Nummer trägt (zwischenzeitlich entfernt, oder
  // die Serverregel ist strenger als die Formatprüfung hier), dann ist die
  // Serverwahrheit maßgeblich — und der Kunde braucht das Eingabefeld, nicht eine
  // Bestätigungszeile, die seiner Ablehnung widerspricht.
  //
  // Umgekehrt: ohne Anforderung und ohne hinterlegte Nummer entsteht GAR KEINE
  // Fläche. Eine Aufforderung, die niemand erfüllen muss, wäre nur Lärm.
  if (!required) {
    if (!vorhanden) return null;
    return (
      <p className="customs-hint" data-testid="customs-eori-ok">
        EORI-Nummer: <strong>{gespeichert}</strong>
        {quittung ? ` — ${EORI_SAVED_TEXT}` : ""}
      </p>
    );
  }

  const speichern = async () => {
    const kanonisch = normalizeEori(wert);
    const formatFehler = kanonisch === ""
      ? "Bitte geben Sie Ihre EORI-Nummer ein."
      : eoriFieldError(kanonisch);
    if (formatFehler) { setFehler(formatFehler); return; }

    setSpeichert(true); setFehler("");
    try {
      // Derselbe Endpunkt wie die Kontoeinstellungen — keine zweite Speicherstrecke,
      // GENAU EIN Schlüssel im Body. `auth: true`, damit ein echter Session-401 den
      // globalen Abmeldeweg auslöst; ein 400 ist ein Feldfehler und meldet nur hier.
      const r = await apiFetch("/kunde/profil", {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ eori_number: kanonisch }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFehler(typeof d.error === "string" && d.error.trim()
          ? d.error.trim()
          : "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.");
        setSpeichert(false);
        return;
      }
      // Serverwahrheit übernehmen (RETURNING-Zeile des PATCH). Damit erkennt der
      // laufende Buchungsvorgang die Nummer sofort — ohne Neuladen, ohne Navigation
      // und ohne den Vorgang zu verlieren.
      if (d.user) updateUser(d.user);
      setQuittung(true);
      setSpeichert(false);
      if (typeof onSaved === "function") onSaved(d.user || null);
    } catch {
      setFehler("Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.");
      setSpeichert(false);
    }
  };

  return (
    <div className="customs-eori" data-testid="customs-eori-required">
      <p className="customs-hint">
        <strong>{EORI_MISSING_TITLE}</strong> — {EORI_MISSING_TEXT}
      </p>
      <div className="field">
        <label className="field-label" htmlFor="customs-eori">EORI-Nummer</label>
        <input
          id="customs-eori"
          className={`field-input${fehler ? " field-input-error" : ""}`}
          value={wert}
          onChange={(e) => { setWert(e.target.value); if (fehler) setFehler(""); }}
          placeholder="DE123456789012345"
          autoComplete="off"
          aria-describedby="customs-eori-hint"
        />
        <span className="field-hint" id="customs-eori-hint">{EORI_HINT} {EORI_LATER_NOTE}</span>
        {fehler && <span className="field-error" role="alert">{fehler}</span>}
      </div>
      <button type="button" className="btn btn-primary" onClick={speichern} disabled={speichert}>
        {speichert ? "Wird gespeichert …" : EORI_SAVE_LABEL}
      </button>
    </div>
  );
}
