import React from "react";
import { formatCount, formatPercent } from "../../utils/salesPartnerView.mjs";
import { LEVEL_COUNT, formatTimestamp } from "../../utils/adminSalesPartnerView.mjs";

const stufenLabel = (i) => `Level ${i + 1}`;

// Geltungsbereich einer Version: global oder nur dieser Partner. Eine
// Partnerversion im Modus „inherit" trägt keine eigenen Stufen — sie sagt nur,
// dass ab ihrem Tag die globalen Regeln gelten.
const geltung = (rs) => {
  if (rs.mode === "inherit") return "Dieser Partner: globale Regeln übernommen";
  if (rs.scope === "global") return "Global";
  if (rs.scope === "partner") return "Dieser Partner: eigene Regeln";
  return "—";
};

/* ── Anzeige einer Regelversion (5 Kunden- und 5 Paketlevel) ─────────────────
   Reine Darstellung der Serverwerte; fehlende Werte als „—". */
export function RuleSetView({ ruleSet, caption }) {
  if (!ruleSet) return <p className="adm-support-hint">Keine Regelversion hinterlegt.</p>;
  const zeilen = Array.from({ length: LEVEL_COUNT }, (_, i) => ({
    kunde: ruleSet.customerLevels[i] || null,
    paket: ruleSet.packageLevels[i] || null,
  }));
  return (
    <div className="adm-sp-ruleset">
      <dl className="adm-kv">
        <div className="adm-kv-item"><dt>Gültig ab</dt><dd>{formatTimestamp(ruleSet.validFrom)}</dd></div>
        <div className="adm-kv-item"><dt>Geltungsbereich</dt><dd>{geltung(ruleSet)}</dd></div>
        {ruleSet.mode !== "inherit" && (
          <div className="adm-kv-item"><dt>Mindestpakete je aktivem Kunden</dt><dd>{formatCount(ruleSet.minPackagesForActiveCustomer)}</dd></div>
        )}
        <div className="adm-kv-item"><dt>Begründung</dt><dd>{ruleSet.reason || "—"}</dd></div>
        <div className="adm-kv-item"><dt>Angelegt</dt><dd>{formatTimestamp(ruleSet.createdAt, { withTime: true })}</dd></div>
      </dl>
      {(ruleSet.customerLevels.length > 0 || ruleSet.packageLevels.length > 0) && (
        // R9: bei schmaler Ansicht scrollt die Tabelle seitlich — der Bereich muss per Tastatur
        // erreichbar sein (axe scrollable-region-focusable) und trägt dafür einen Namen.
        <div className="table-scroll adm-sp-levels" tabIndex={0} role="region" aria-label={caption || "Level-Regeln"}>
          <table>
            <caption className="sr-only">{caption || "Level-Regeln"}: Schwellen und Boni je Level für aktive Kunden und versendete Pakete.</caption>
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col" className="adm-num">Aktive Kunden ab</th>
                <th scope="col" className="adm-num">Bonus</th>
                <th scope="col" className="adm-num">Versendete Pakete ab</th>
                <th scope="col" className="adm-num">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z, i) => (
                <tr key={i}>
                  <th scope="row">{stufenLabel(i)}</th>
                  <td className="adm-num">{formatCount(z.kunde?.threshold)}</td>
                  <td className="adm-num">{formatPercent(z.kunde?.bonusPercent)}</td>
                  <td className="adm-num">{formatCount(z.paket?.threshold)}</td>
                  <td className="adm-num">{formatPercent(z.paket?.bonusPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Historie von Regelversionen — je Version aufklappbar ──────────────────── */
export function RuleSetHistory({ history, caption }) {
  if (!history || history.length === 0) return <p className="adm-support-hint">Keine früheren Versionen.</p>;
  return (
    <ul className="adm-sp-history">
      {history.map((rs, i) => (
        <li key={rs.id ?? i}>
          <details className="adm-sp-history-item">
            <summary>
              Gültig ab {formatTimestamp(rs.validFrom)}
              {rs.mode === "inherit" ? " · Globale Regeln" : ""}
              {rs.reason ? ` · ${rs.reason}` : ""}
            </summary>
            <RuleSetView ruleSet={rs} caption={caption} />
          </details>
        </li>
      ))}
    </ul>
  );
}

/* ── Eingabe einer Regelversion: Mindestpakete und 5 + 5 Level ───────────────
   Vorbelegt wird ausschließlich vom Aufrufer mit Werten des Servers
   (Startwerte oder aktuelle Version — utils/adminSalesPartnerView.mjs:
   levelRulesFormFrom); ohne sie bleiben alle Felder leer und Pflicht.
   `prefillNote` sagt, woher eine Vorbelegung stammt. Geprüft wird beim
   Absenden über build…LevelRulesBody; hier steht nur die Darstellung samt
   Feldfehlern. */
export function LevelRulesEditor({ value, onChange, errors = {}, idPrefix, disabled = false, prefillNote = null }) {
  const setStufe = (dim, i, feld, wert) => {
    const liste = value[dim].map((s, k) => (k === i ? { ...s, [feld]: wert } : s));
    onChange({ ...value, [dim]: liste });
  };
  const fehler = (key) => errors[key] ? <span className="field-error">{errors[key]}</span> : null;
  const zelle = (dim, kurz, i, feld, label) => {
    const key = `${dim}.${i}.${feld}`;
    const id = `${idPrefix}-${kurz}-${i + 1}-${feld === "threshold" ? "threshold" : "bonus"}`;
    return (
      <td>
        <label className="sr-only" htmlFor={id}>{`${label} ${stufenLabel(i)}`}</label>
        <input
          id={id}
          className={`field-input adm-sp-level-input${errors[key] ? " field-input-error" : ""}`}
          type="text"
          inputMode={feld === "threshold" ? "numeric" : "decimal"}
          autoComplete="off"
          value={value[dim][i]?.[feld] ?? ""}
          onChange={(e) => setStufe(dim, i, feld, e.target.value)}
          disabled={disabled}
          aria-invalid={errors[key] ? "true" : undefined}
        />
        {fehler(key)}
      </td>
    );
  };

  return (
    <div className="adm-sp-editor">
      <div className="adm-edit-field adm-sp-field-narrow">
        <label className="adm-edit-label" htmlFor={`${idPrefix}-min-packages`}>Mindestpakete je aktivem Kunden</label>
        <input
          id={`${idPrefix}-min-packages`}
          className={`field-input${errors.minPackagesForActiveCustomer ? " field-input-error" : ""}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value.minPackagesForActiveCustomer}
          onChange={(e) => onChange({ ...value, minPackagesForActiveCustomer: e.target.value })}
          disabled={disabled}
          aria-invalid={errors.minPackagesForActiveCustomer ? "true" : undefined}
        />
        <span className="adm-edit-hint">Mindestzahl versendeter Pakete, ab der ein Kunde als aktiv zählt.</span>
        {fehler("minPackagesForActiveCustomer")}
      </div>
      {fehler("customerLevels")}
      {fehler("packageLevels")}
      <div className="table-scroll adm-sp-levels" tabIndex={0} role="region" aria-label="Neue Level-Regeln">
        <table>
          <caption className="sr-only">Neue Level-Regeln: Schwelle und Bonus je Level für aktive Kunden und versendete Pakete.</caption>
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Aktive Kunden ab</th>
              <th scope="col">Bonus in %</th>
              <th scope="col">Versendete Pakete ab</th>
              <th scope="col">Bonus in %</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: LEVEL_COUNT }, (_, i) => (
              <tr key={i}>
                <th scope="row">{stufenLabel(i)}</th>
                {zelle("customerLevels", "customer", i, "threshold", "Aktive Kunden ab")}
                {zelle("customerLevels", "customer", i, "bonusPercent", "Kundenbonus in Prozent")}
                {zelle("packageLevels", "package", i, "threshold", "Versendete Pakete ab")}
                {zelle("packageLevels", "package", i, "bonusPercent", "Paketbonus in Prozent")}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adm-edit-hint">
        Schwellen steigen von Level zu Level streng an; Boni liegen zwischen 0 und 100 %.
      </p>
      {prefillNote && <p className="adm-edit-hint" id={`${idPrefix}-prefill-note`}>{prefillNote}</p>}
    </div>
  );
}
