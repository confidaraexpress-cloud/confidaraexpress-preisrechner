import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../../components/ui/StateView";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { SitzungenKarte } from "../../components/sicherheit/SitzungenKarte";
import { useAuth } from "../../context/AuthContext";
import {
  sicherheitLaden, passkeyOptionen, passkeyRegistrieren, passkeyUmbenennen, passkeyEntfernen, codesErneuern,
} from "../../api/sicherheitApi";
import {
  SICHERHEIT_TEXT as T, PASSKEY_NAME_MAX, passkeyZeile, passkeyNameEingabe, sicherheitsFehlertext, codesAlsText,
} from "../../utils/adminSicherheit.mjs";
import { passkeyErstellen, passkeyFehlertext, passkeysVerfuegbar, PASSKEY_TEXTE } from "../../utils/webauthn.mjs";
import { copyToClipboard } from "../../utils/clipboard.mjs";
import { ADMIN_LOGIN_PATH } from "../../utils/adminAnmeldung.mjs";

/* ── Adminbereich · Sicherheit (/admin/sicherheit, Betreiberauftrag 2026-11-22, D7) ─────────────────────────────────
   Passkeys einrichten und verwalten, Wiederherstellungscodes, angemeldete Geräte. Erreichbar auch bei eingeschaltetem
   Pflichtschalter (der Server prüft hier nur die Adminrolle).

   Ablauf der Ersteinrichtung: aktuelles Passwort → Optionen vom Server → Passkey auf dem Gerät erstellen → Server prüft
   und legt in EINER Transaktion Passkey, 10 Wiederherstellungscodes und eine neue Sitzung an; alle anderen Sitzungen
   enden. Das neue Token ersetzt sofort das alte (das alte ist serverseitig widerrufen). Die Codes stehen genau einmal da.

   Weitere Passkeys, Entfernen und neue Codes verlangen eine frische Bestätigung: der Server antwortet 428, apiFetch
   zeigt den Bestätigungsdialog des Adminrahmens und wiederholt danach genau einmal. */

async function jsonOderNull(r) {
  try { return await r.json(); } catch { return null; }
}

function CodesAnzeige({ codes, onFertig }) {
  const uid = useId();
  const [rueckmeldung, setRueckmeldung] = useState("");
  const kopieren = async () => {
    const ok = await copyToClipboard(codesAlsText(codes));
    setRueckmeldung(ok ? T.codesKopiert : "Kopieren nicht möglich. Bitte markieren Sie die Codes und kopieren Sie sie selbst.");
  };
  const speichern = () => {
    const blob = new Blob([codesAlsText(codes)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "confidaraexpress-wiederherstellungscodes.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="ce-card adm-sicherheit-codes" aria-labelledby={`${uid}-titel`} id="adm-codes-neu">
      <h2 className="adm-sicherheit-titel" id={`${uid}-titel`}>{T.codesZeigenTitel}</h2>
      <p className="adm-sicherheit-text">{T.codesZeigenText}</p>
      <ol className="adm-sicherheit-codeliste" aria-label={T.codesZeigenTitel}>
        {codes.map((c) => <li key={c} className="adm-sicherheit-code">{c}</li>)}
      </ol>
      <div className="adm-sicherheit-knoepfe">
        <button type="button" className="btn btn-outline btn-sm" onClick={kopieren}>{T.codesKopieren}</button>
        <button type="button" className="btn btn-outline btn-sm" onClick={speichern}>{T.codesSpeichern}</button>
        <button type="button" className="btn btn-primary btn-sm" id="adm-codes-fertig" onClick={onFertig}>{T.codesFertig}</button>
      </div>
      <p className="adm-sicherheit-text" role="status" aria-live="polite">{rueckmeldung}</p>
    </section>
  );
}

function PasskeyEintrag({ p, einzig, onUmbenannt, onEntfernen, gesperrt }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [name, setName] = useState(p.name);
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const feldRef = useRef(null);
  const uid = useId();
  useEffect(() => { if (bearbeiten) feldRef.current?.focus(); }, [bearbeiten]);

  const speichern = async (e) => {
    e.preventDefault();
    if (laeuft) return;
    const neu = passkeyNameEingabe(name);
    if (!neu) { setFehler(sicherheitsFehlertext(400, { code: "PASSKEY_NAME_INVALID" })); return; }
    setLaeuft(true); setFehler("");
    try {
      const r = await passkeyUmbenennen(p.id, neu);
      const d = await jsonOderNull(r);
      if (!r.ok) { setFehler(sicherheitsFehlertext(r.status, d)); return; }
      setBearbeiten(false);
      onUmbenannt();
    } catch {
      setFehler(sicherheitsFehlertext(0, null));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <li className="adm-passkey" data-passkey={p.id}>
      {bearbeiten ? (
        <form className="adm-passkey-form" onSubmit={speichern} noValidate>
          <label className="adm-sicherheit-label" htmlFor={`${uid}-name`}>{T.nameLabel}</label>
          <input id={`${uid}-name`} ref={feldRef} className="field-input adm-passkey-input" value={name} maxLength={PASSKEY_NAME_MAX}
            onChange={(e) => setName(e.target.value)} aria-describedby={fehler ? `${uid}-fehler` : undefined} />
          {fehler && <p className="adm-sicherheit-fehler" id={`${uid}-fehler`} role="alert">{fehler}</p>}
          <div className="adm-sicherheit-knoepfe">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setBearbeiten(false); setName(p.name); setFehler(""); }}
              disabled={laeuft}>{T.abbrechen}</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={laeuft} aria-busy={laeuft ? "true" : undefined}>{T.speichern}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="adm-passkey-text">
            <span className="adm-passkey-name">{p.name}</span>
            <span className="adm-passkey-meta">{p.art}</span>
            <span className="adm-passkey-meta">{p.erstellt} · {p.benutzt}</span>
          </div>
          <div className="adm-passkey-aktionen">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setBearbeiten(true)} disabled={gesperrt}
              aria-label={`${T.umbenennen}: ${p.name}`}>{T.umbenennen}</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onEntfernen(p)} disabled={gesperrt || einzig}
              aria-label={`${T.entfernen}: ${p.name}`} title={einzig ? T.letzter : undefined}>{T.entfernen}</button>
          </div>
        </>
      )}
    </li>
  );
}

export default function AdminSicherheitPage() {
  const location = useLocation();
  const { updateUser } = useAuth();
  const uid = useId();
  const [stand, setStand] = useState(null);       // Antwort von GET /auth/security
  const [ladefehler, setLadefehler] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState("");
  const [erfolg, setErfolg] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [offeneOptionen, setOffeneOptionen] = useState(null); // geholte Optionen für „Erneut versuchen“ ohne Wartezeit
  const [neueCodes, setNeueCodes] = useState(null);
  const [entfernen, setEntfernen] = useState(null);           // Passkey, dessen Entfernen bestätigt wird
  const [codesFrage, setCodesFrage] = useState(false);
  const [dialogLaeuft, setDialogLaeuft] = useState(false);
  const inFlight = useRef(false);
  const verfuegbar = passkeysVerfuegbar();

  const laden = useCallback(async () => {
    setLadefehler("");
    try {
      const r = await sicherheitLaden();
      const d = await jsonOderNull(r);
      if (!r.ok || !d) { setLadefehler(T.geladenFehler); return; }
      setStand(d);
    } catch {
      setLadefehler(T.geladenFehler);
    }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const passkeys = (stand?.passkeys || []).map(passkeyZeile).filter(Boolean);
  const erster = stand !== null && passkeys.length === 0;

  // Passkey auf dem Gerät erstellen und beim Server registrieren (Optionen liegen bereits vor).
  const erstellenMit = async (optionen) => {
    let antwort;
    try {
      antwort = await passkeyErstellen(optionen);
    } catch (e) {
      setOffeneOptionen(optionen);
      setFehler(passkeyFehlertext(e, { einrichtung: true }));
      return;
    }
    setOffeneOptionen(null);
    const r = await passkeyRegistrieren(antwort);
    const d = await jsonOderNull(r);
    if (!r.ok) { setFehler(sicherheitsFehlertext(r.status, d)); return; }
    if (d && typeof d.token === "string" && d.token) {
      // Erster Passkey: der Server hat die bisherige Sitzung beendet — das neue Token sofort übernehmen.
      localStorage.setItem("ce_token", d.token);
      updateUser({});
    }
    setPasswort("");
    if (d && Array.isArray(d.recoveryCodes) && d.recoveryCodes.length) setNeueCodes(d.recoveryCodes);
    setErfolg("Der Passkey ist eingerichtet.");
    await laden();
  };

  const einrichten = async (e) => {
    if (e) e.preventDefault();
    if (inFlight.current) return;
    setFehler(""); setErfolg("");
    if (erster && !passwort) { setFehler(sicherheitsFehlertext(400, { code: "CURRENT_PASSWORD_REQUIRED" })); return; }
    inFlight.current = true; setLaeuft(true);
    try {
      const r = await passkeyOptionen(erster ? passwort : null);
      const d = await jsonOderNull(r);
      if (!r.ok || !d || !d.options) { setFehler(sicherheitsFehlertext(r.status, d)); return; }
      await erstellenMit(d.options);
    } catch {
      setFehler(sicherheitsFehlertext(0, null));
    } finally {
      inFlight.current = false; setLaeuft(false);
    }
  };

  // „Erneut versuchen“ nutzt die schon geholten Optionen — der Klick fordert den Passkey ohne Wartezeit an.
  const erneutErstellen = async () => {
    if (inFlight.current || !offeneOptionen) return;
    inFlight.current = true; setLaeuft(true); setFehler("");
    try {
      await erstellenMit(offeneOptionen);
    } catch {
      setFehler(sicherheitsFehlertext(0, null));
    } finally {
      inFlight.current = false; setLaeuft(false);
    }
  };

  const entfernenBestaetigt = async () => {
    if (!entfernen || dialogLaeuft) return;
    setDialogLaeuft(true); setFehler(""); setErfolg("");
    try {
      const r = await passkeyEntfernen(entfernen.id);
      const d = await jsonOderNull(r);
      if (!r.ok) { setFehler(sicherheitsFehlertext(r.status, d)); return; }
      setErfolg(`Der Passkey „${entfernen.name}“ wurde entfernt.`);
    } catch {
      setFehler(sicherheitsFehlertext(0, null));
    } finally {
      setDialogLaeuft(false); setEntfernen(null);
      laden();
    }
  };

  const codesBestaetigt = async () => {
    if (dialogLaeuft) return;
    setDialogLaeuft(true); setFehler(""); setErfolg("");
    try {
      const r = await codesErneuern();
      const d = await jsonOderNull(r);
      if (!r.ok || !d || !Array.isArray(d.recoveryCodes)) { setFehler(sicherheitsFehlertext(r.status, d)); return; }
      setNeueCodes(d.recoveryCodes);
    } catch {
      setFehler(sicherheitsFehlertext(0, null));
    } finally {
      setDialogLaeuft(false); setCodesFrage(false);
      laden();
    }
  };

  const pflichtHinweis = stand?.passkeyRequired === true && stand?.session?.secondFactor !== true;
  const rest = Number.isInteger(stand?.recoveryCodesRemaining) ? stand.recoveryCodesRemaining : null;

  return (
    <div className="adm-page adm-sicherheit">
      <PageHeader variant="admin" title={T.titel} subtitle={T.untertitel} />

      {(pflichtHinweis || location.state?.einrichten) && erster && (
        <div className="adm-note adm-sicherheit-pflicht" role="status"><span>{T.pflicht}</span></div>
      )}
      {location.state?.sicherheitsHinweis && <div className="adm-note" role="status"><span>{location.state.sicherheitsHinweis}</span></div>}
      {erfolg && <p className="adm-sicherheit-erfolg" role="status">{erfolg}</p>}
      {fehler && !entfernen && !codesFrage && (
        <div className="adm-sicherheit-fehlerblock" role="alert">
          <p className="adm-sicherheit-fehler">{fehler}</p>
          {offeneOptionen && (
            <button type="button" className="btn btn-outline btn-sm" onClick={erneutErstellen} disabled={laeuft}>
              {T.erneut}
            </button>
          )}
        </div>
      )}

      {neueCodes && <CodesAnzeige codes={neueCodes} onFertig={() => { setNeueCodes(null); setErfolg(""); }} />}

      {stand === null && !ladefehler && <div className="ce-card"><LoadingState text="Sicherheit wird geladen …" /></div>}
      {ladefehler && (
        <div className="ce-card">
          <ErrorState title={ladefehler} text="Bitte versuchen Sie es erneut."
            action={<button type="button" className="btn btn-primary btn-sm" onClick={laden}>{T.erneut}</button>} />
        </div>
      )}

      {stand !== null && (
        <div className="adm-sicherheit-raster">
          <section className="ce-card adm-sicherheit-karte" aria-labelledby={`${uid}-pk`} id="adm-passkeys">
            <h2 className="adm-sicherheit-titel" id={`${uid}-pk`}>{erster ? T.einrichtenTitel : T.passkeysTitel}</h2>
            {!verfuegbar && <p className="adm-sicherheit-fehler">{PASSKEY_TEXTE.nichtUnterstuetzt}</p>}
            {erster ? (
              <form className="adm-sicherheit-form" onSubmit={einrichten} noValidate>
                <p className="adm-sicherheit-text">{T.einrichtenText}</p>
                <label className="adm-sicherheit-label" htmlFor={`${uid}-pw`}>{T.einrichtenPasswort}</label>
                <input id={`${uid}-pw`} className="field-input adm-sicherheit-input" type="password" autoComplete="current-password"
                  value={passwort} onChange={(e) => setPasswort(e.target.value)} aria-describedby={`${uid}-pw-hilfe`} />
                <p className="adm-sicherheit-hilfe" id={`${uid}-pw-hilfe`}>{T.einrichtenPasswortHilfe}</p>
                <button type="submit" className="btn btn-primary adm-sicherheit-haupt" id="adm-passkey-einrichten"
                  disabled={laeuft || !verfuegbar} aria-busy={laeuft ? "true" : undefined}>
                  {laeuft ? T.einrichtenLaeuft : T.einrichtenKnopf}
                </button>
              </form>
            ) : (
              <>
                <ul className="adm-passkey-liste">
                  {passkeys.map((p) => (
                    <PasskeyEintrag key={p.id} p={p} einzig={passkeys.length === 1} gesperrt={laeuft || dialogLaeuft}
                      onUmbenannt={laden} onEntfernen={setEntfernen} />
                  ))}
                </ul>
                <p className="adm-sicherheit-text">{T.weitererText}</p>
                <button type="button" className="btn btn-outline btn-sm" id="adm-passkey-weiterer" onClick={() => einrichten()}
                  disabled={laeuft || !verfuegbar} aria-busy={laeuft ? "true" : undefined}>
                  {laeuft ? T.einrichtenLaeuft : T.weitererKnopf}
                </button>
              </>
            )}
          </section>

          {!erster && (
            <section className="ce-card adm-sicherheit-karte" aria-labelledby={`${uid}-codes`} id="adm-codes">
              <h2 className="adm-sicherheit-titel" id={`${uid}-codes`}>{T.codesTitel}</h2>
              <p className="adm-sicherheit-text">{T.codesText}</p>
              {rest !== null && <p className="adm-sicherheit-wert" id="adm-codes-rest">{T.codesRest(rest)}</p>}
              {rest !== null && rest <= 3 && <p className="adm-sicherheit-hinweis">{T.codesKnapp}</p>}
              <button type="button" className="btn btn-outline btn-sm" id="adm-codes-erneuern" onClick={() => setCodesFrage(true)}
                disabled={laeuft || dialogLaeuft}>
                {T.codesNeuKnopf}
              </button>
            </section>
          )}

          <SitzungenKarte anmeldePfad={ADMIN_LOGIN_PATH} klasse="adm-sicherheit-karte" />
        </div>
      )}

      {entfernen && (
        <ConfirmDialog title={T.entfernen} text={T.entfernenFrage(entfernen.name)} confirmLabel={T.entfernen} danger
          busy={dialogLaeuft} busyLabel="Wird entfernt …" onCancel={() => setEntfernen(null)} onConfirm={entfernenBestaetigt}
          confirmId="adm-passkey-entfernen-bestaetigen" />
      )}
      {codesFrage && (
        <ConfirmDialog title={T.codesNeuKnopf} text={T.codesNeuFrage} confirmLabel={T.codesNeuKnopf} irreversible
          busy={dialogLaeuft} busyLabel="Wird erzeugt …" onCancel={() => setCodesFrage(false)} onConfirm={codesBestaetigt}
          confirmId="adm-codes-bestaetigen" />
      )}
    </div>
  );
}
