import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DateField } from "./DateField";
import { runAdminPreliveScenario } from "../../api/adminApi";
import { monthOptions } from "../../utils/salesPartnerView.mjs";
import { currentLocalMonth } from "../../utils/adminSalesPartnerView.mjs";
import {
  THRESHOLD_OFFSETS,
  buildAbcScenarioBody,
  buildLevelsScenarioBody,
  buildTeamScenarioBody,
  preliveErrorOutcome,
  presetValue,
  scenarioResult,
  testAccountName,
} from "../../utils/salesPartnerPrelive.mjs";

const LEER = Object.freeze({
  levels: { partnerUserId: "", month: "", activeCustomers: "", packages: "", packagesPerShipment: "", inactiveCustomers: "" },
  abc: { activeSince: "", packagesPerCustomer: "" },
  team: { sponsorUserId: "", count: "", activeSince: "" },
});
const BAUER = Object.freeze({ levels: buildLevelsScenarioBody, abc: buildAbcScenarioBody, team: buildTeamScenarioBody });
// Vertragsfelder, die im Formular anders heißen (PARTNER_NOT_TEST beim Team-Szenario).
const FELDER = Object.freeze({ levels: {}, abc: {}, team: { partnerUserId: "sponsorUserId" } });

const startZustand = () => ({
  levels: { form: { ...LEER.levels, month: currentLocalMonth() }, errors: {}, message: null },
  abc: { form: { ...LEER.abc }, errors: {}, message: null },
  team: { form: { ...LEER.team }, errors: {}, message: null },
});

/* ── Pre-Live · Schnellszenarien ─────────────────────────────────────────────
   Legt in einem Schritt zusammenhängende Testdaten an:
     • Level-Szenario: aktive Kunden und Pakete eines Testpartners in einem
       Monat — mit Vorgaben für Level 1, 3 und 5 jeder Dimension, wahlweise
       knapp unter, genau auf oder knapp über der Schwelle. Die Schwellen
       kommen aus der aktuellen globalen Regelversion bzw. den Startwerten des
       Servers (`presets`); ohne sie gibt es nur die freie Eingabe.
     • A/B/C-Kette: drei Testpartner A, B und C für die Teamebenen (den
       Aufbau bestimmt der Server).
     • Team-Szenario: mehrere Testpartner unter einem Sponsor.
   Ob ein Szenario zulässig ist, entscheidet der Server (SCENARIO_INVALID mit
   Feld, PARTNER_NOT_TEST). */
export function PreliveScenariosCard({ accounts, presets = null, onChanged, onDisabled }) {
  const partner = accounts?.partners || [];
  const [z, setZ] = useState(startZustand);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(null);           // laufende Art
  const inFlight = useRef(false);
  const monate = monthOptions(currentLocalMonth(), 13);

  const setFeld = (art, k, v) => setZ((s) => ({
    ...s, [art]: { ...s[art], form: { ...s[art].form, [k]: v }, errors: { ...s[art].errors, [k]: undefined } },
  }));
  const setTeil = (art, teil) => setZ((s) => ({ ...s, [art]: { ...s[art], ...teil } }));

  const ausfuehren = async (art, e) => {
    e.preventDefault();
    if (inFlight.current) return;
    const gebaut = BAUER[art](z[art].form);
    if (!gebaut.ok) { setTeil(art, { errors: gebaut.errors, message: null }); return; }
    setTeil(art, { errors: {}, message: null });
    inFlight.current = true;
    setBusy(art);
    try {
      const r = await runAdminPreliveScenario(gebaut.body);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d, { fieldMap: FELDER[art] });
        setTeil(art, { errors: folge.field ? { [folge.field]: folge.text } : {}, message: { type: "error", text: folge.text } });
        if (folge.disabled) onDisabled?.();
        return;
      }
      const ergebnis = scenarioResult(art, d);
      setTeil(art, { message: { type: "success", text: ergebnis.text, links: ergebnis.links } });
      onChanged?.();
    } catch {
      setTeil(art, { message: { type: "error", text: "Die Verbindung wurde unterbrochen. Ob das Szenario angelegt wurde, zeigen die neu geladenen Testdaten." } });
      onChanged?.();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const fehler = (art, k) => (z[art].errors[k] ? <span className="field-error">{z[art].errors[k]}</span> : null);
  const ungueltig = (art, k) => (z[art].errors[k] ? "true" : undefined);
  const ergebnis = (art) => {
    const m = z[art].message;
    if (!m) return null;
    return (
      <div className={`alert ${m.type === "success" ? "alert-success" : "alert-error"}`}
        role={m.type === "success" ? "status" : "alert"} id={`adm-pl-${art}-result`}>
        <div className="adm-pl-result">
          <span>{m.text}</span>
          {Array.isArray(m.links) && m.links.length > 0 && (
            <ul className="adm-pl-links">
              {m.links.map((l) => (
                <li key={l.id}><Link to={`/admin/partners/${encodeURIComponent(l.id)}`}>{l.label}</Link></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };
  const zahlFeld = (art, k, id, label, hint) => (
    <div className="adm-edit-field">
      <label className="adm-edit-label" htmlFor={id}>{label}</label>
      <input id={id} className="field-input" type="text" inputMode="numeric" autoComplete="off"
        value={z[art].form[k]} onChange={(e) => setFeld(art, k, e.target.value)} disabled={busy !== null}
        aria-invalid={ungueltig(art, k)} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && <span className="adm-edit-hint" id={`${id}-hint`}>{hint}</span>}
      {fehler(art, k)}
    </div>
  );
  const partnerAuswahl = (art, k, id, label) => (
    <div className="adm-edit-field">
      <label className="adm-edit-label" htmlFor={id}>{label}</label>
      <select id={id} className="field-select adm-edit-select" value={z[art].form[k]}
        onChange={(e) => setFeld(art, k, e.target.value)} disabled={busy !== null} aria-invalid={ungueltig(art, k)}>
        <option value="">Bitte wählen</option>
        {partner.map((p) => <option key={p.id} value={String(p.id)}>{testAccountName(p, "Testpartner")}</option>)}
      </select>
      {fehler(art, k)}
    </div>
  );
  const vorgabe = (dim, s) => {
    const feld = dim === "customer" ? "activeCustomers" : "packages";
    const name = dim === "customer" ? "Kunden-Level" : "Paket-Level";
    return (
      <button type="button" key={`${dim}-${s.level}`} className="btn btn-outline btn-sm" id={`adm-pl-preset-${dim}-${s.level}`}
        disabled={busy !== null} onClick={() => setFeld("levels", feld, presetValue(s.threshold, offset))}
        aria-label={`${name} ${s.level}: ${dim === "customer" ? "aktive Kunden" : "Pakete"} ${presetValue(s.threshold, offset)} eintragen`}>
        {`${name} ${s.level}`}
      </button>
    );
  };

  return (
    <div className="adm-card" id="adm-pl-scenarios-card">
      <div className="adm-card-head">Schnellszenarien</div>
      <div className="adm-card-body">
        <h3 className="adm-sp-subtitle">Level-Szenario</h3>
        {ergebnis("levels")}
        <form className="adm-sp-form" onSubmit={(e) => ausfuehren("levels", e)} noValidate id="adm-pl-levels-form">
          {partnerAuswahl("levels", "partnerUserId", "adm-pl-levels-partner", "Testpartner (Pflicht)")}
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-levels-month">Monat</label>
            <select id="adm-pl-levels-month" className="field-select adm-edit-select" value={z.levels.form.month}
              onChange={(e) => setFeld("levels", "month", e.target.value)} disabled={busy !== null} aria-invalid={ungueltig("levels", "month")}>
              {monate.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            {fehler("levels", "month")}
          </div>
          {zahlFeld("levels", "activeCustomers", "adm-pl-levels-active", "Aktive Kunden")}
          {zahlFeld("levels", "packages", "adm-pl-levels-packages", "Pakete")}
          {zahlFeld("levels", "packagesPerShipment", "adm-pl-levels-pps", "Pakete je Sendung (optional)")}
          {zahlFeld("levels", "inactiveCustomers", "adm-pl-levels-inactive", "Inaktive Kunden (optional)", "Kunden unter der Mindestpaketzahl")}
          {presets ? (
            <fieldset className="adm-sp-fieldset adm-sp-form-wide" id="adm-pl-presets">
              <legend className="adm-edit-label">Vorgaben für Grenzfälle</legend>
              <div className="adm-pl-presets" role="radiogroup" aria-label="Lage zur Schwelle">
                {THRESHOLD_OFFSETS.map((o) => (
                  <label className="adm-sp-choice" key={o.value}>
                    <input type="radio" name="adm-pl-offset" id={`adm-pl-offset-${o.value < 0 ? "minus" : o.value > 0 ? "plus" : "exact"}`}
                      checked={offset === o.value} onChange={() => setOffset(o.value)} disabled={busy !== null} />
                    {o.label}
                  </label>
                ))}
              </div>
              <div className="adm-pl-presets">
                {presets.customer.map((s) => vorgabe("customer", s))}
                {presets.package.map((s) => vorgabe("package", s))}
              </div>
              <span className="adm-edit-hint">
                {`Schwellen laut Regeln: Kunden-Level ${presets.customer.map((s) => `${s.level} ab ${s.threshold}`).join(", ")}; Paket-Level ${presets.package.map((s) => `${s.level} ab ${s.threshold}`).join(", ")}.`}
              </span>
            </fieldset>
          ) : (
            <p className="adm-edit-hint adm-sp-form-wide" id="adm-pl-presets-none">Ohne Level-Regeln des Servers gibt es keine Vorgaben – bitte Werte frei eintragen.</p>
          )}
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-pl-levels-submit" disabled={busy !== null}>
              {busy === "levels" ? "Wird angelegt…" : "Level-Szenario anlegen"}
            </button>
          </div>
        </form>

        <h3 className="adm-sp-subtitle">A/B/C-Kette</h3>
        <p className="adm-support-hint">Legt die Testpartner A, B und C als Kette für die Teamebenen an; den Aufbau bestimmt der Server.</p>
        {ergebnis("abc")}
        <form className="adm-sp-form" onSubmit={(e) => ausfuehren("abc", e)} noValidate id="adm-pl-abc-form">
          <div className="adm-sp-datefield">
            <DateField id="adm-pl-abc-since" label="Aktiv seit (Pflicht, darf zurückliegen)" value={z.abc.form.activeSince}
              invalid={!!z.abc.errors.activeSince} disabled={busy !== null} onChange={(v) => setFeld("abc", "activeSince", v)} />
            {fehler("abc", "activeSince")}
          </div>
          {zahlFeld("abc", "packagesPerCustomer", "adm-pl-abc-ppc", "Pakete je Kunde (optional)")}
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-pl-abc-submit" disabled={busy !== null}>
              {busy === "abc" ? "Wird angelegt…" : "A/B/C-Kette anlegen"}
            </button>
          </div>
        </form>

        <h3 className="adm-sp-subtitle">Team-Szenario</h3>
        {ergebnis("team")}
        <form className="adm-sp-form" onSubmit={(e) => ausfuehren("team", e)} noValidate id="adm-pl-team-form">
          {partnerAuswahl("team", "sponsorUserId", "adm-pl-team-sponsor", "Sponsor (Testpartner, Pflicht)")}
          {zahlFeld("team", "count", "adm-pl-team-count", "Anzahl Teampartner (Pflicht)")}
          <div className="adm-sp-datefield">
            <DateField id="adm-pl-team-since" label="Aktiv seit (Pflicht, darf zurückliegen)" value={z.team.form.activeSince}
              invalid={!!z.team.errors.activeSince} disabled={busy !== null} onChange={(v) => setFeld("team", "activeSince", v)} />
            {fehler("team", "activeSince")}
          </div>
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-pl-team-submit" disabled={busy !== null}>
              {busy === "team" ? "Wird angelegt…" : "Team-Szenario anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PreliveScenariosCard;
