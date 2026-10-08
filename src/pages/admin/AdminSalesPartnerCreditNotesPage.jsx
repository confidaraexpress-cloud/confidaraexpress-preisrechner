import React, { useCallback, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { SalesPartnerAdminNav } from "../../components/admin/SalesPartnerAdminNav";
import { Switch } from "../../components/ui/Switch";
import { returnState } from "../../utils/adminBackLink.mjs";
import { issueAdminCreditNote, previewAdminCreditNotes } from "../../api/adminApi";
import { usePreliveStatus } from "../../hooks/usePreliveStatus";
import { preliveEnabled } from "../../utils/salesPartnerPrelive.mjs";
import { formatCents, formatCount, formatMonth, formatPercent } from "../../utils/salesPartnerView.mjs";
import { taxStatusLabel } from "../../utils/salesPartnerBilling.mjs";
import { formatTimestamp, localIsoDate } from "../../utils/adminSalesPartnerView.mjs";
import {
  RUN_TEXTS,
  blockerLabel,
  buildIssueBody,
  canIssueRow,
  closedMonthOptions,
  issuableRows,
  issuanceOpen,
  issueAmountText,
  issueOutcome,
  issueSuccessText,
  normalizePreview,
  previewErrorText,
  previewPartnerName,
  runScope,
  runStatusMeta,
} from "../../utils/adminSalesPartnerSettlementView.mjs";

const UNBEKANNT = blockerLabel(null);
const partnerPath = (id) => `/admin/partners/${encodeURIComponent(id)}`;

function Badge({ meta }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`}>{label}</span>;
}

// Partner: Firma bzw. Name als Link ins Detail, darunter Name und Steuerstatus.
// `from`: „Zurück" im Partnerdetail führt wieder zu den Gutschriften.
function PartnerCell({ row, from }) {
  const titel = previewPartnerName(row);
  return (
    <div className="adm-sp-partner">
      {row.partnerUserId !== null
        ? <Link className="adm-sp-name" to={partnerPath(row.partnerUserId)} state={from}>{titel}</Link>
        : <span className="adm-sp-name">{titel}</span>}
      {row.companyName && row.name && <span className="adm-sp-sub">{row.name}</span>}
      {row.taxStatus && (
        <span className="adm-sp-sub">
          {taxStatusLabel(row.taxStatus)}{row.taxRatePercent ? ` · ${formatPercent(row.taxRatePercent)}` : ""}
        </span>
      )}
    </div>
  );
}

// Blockiergründe als deutsche Labels; ein unbekannter Code nur im title.
function Blocker({ codes }) {
  if (!codes.length) return "—";
  return (
    <ul className="adm-cn-blockers">
      {codes.map((c) => {
        const label = blockerLabel(c);
        return <li key={c} title={label === UNBEKANNT ? `Serverwert: ${c}` : undefined}>{label}</li>;
      })}
    </ul>
  );
}

/* ── Admin · Vertriebspartner · Abrechnungslauf ──────────────────────────────
   Gutschriften für einen abgeschlossenen Monat: Monat wählen (Standard
   Vormonat), Vorschau laden, je Partner Positionen, Beträge, Status und
   Blockiergründe prüfen, dann je Partner „Ausstellen“ oder „Alle zulässigen
   ausstellen“. Ausgestellt wird immer einzeln je Partner mit dessen
   Fingerabdruck aus der Vorschau — nacheinander, nie parallel. Meldet der
   Server, dass die Vorschau veraltet ist (409 CREDIT_NOTE_PREVIEW_STALE),
   wird sie neu geladen und der Lauf angehalten; ein offener Ausgang
   (Netzabbruch, Serverfehler) hält ebenfalls an. Ist die Ausstellung
   abgeschaltet, bleibt die Vorschau sichtbar, ausgestellt wird nichts.
   Das Ergebnis steht je Partner in seiner Zeile.

   Pre-Live-Testlauf: nur wenn der Server den Testmodus meldet (`enabled:
   true`), erscheint der Schalter „Pre-Live-Testlauf"; er hängt scope=test an
   die Vorschau und `scope: "test"` an jedes Ausstellen — und zwar mit dem
   Bereich, mit dem die Vorschau geladen wurde. Ein Wechsel verwirft die
   Vorschau. Im Testlauf steht deutlich: Testgutschriften (CE-TEST-PG …),
   nicht steuerlich gültig, keine E-Mail, keine Auszahlung. */
export default function AdminSalesPartnerCreditNotesPage() {
  const [optionen] = useState(() => closedMonthOptions(localIsoDate(), 24));
  const [monat, setMonat] = useState(() => optionen[0]?.value || "");
  const [vorschau, setVorschau] = useState({ loading: false, error: "", data: null });
  const [ergebnisse, setErgebnisse] = useState({});       // partnerUserId → { type, text }
  const [aktiv, setAktiv] = useState(null);               // partnerUserId während des Ausstellens
  const [lauf, setLauf] = useState(false);                // „Alle zulässigen ausstellen“ läuft
  // Offene Bestätigung: { art: "alle" } (Sammellauf) oder { art: "einzeln", row } —
  // auch EINE Gutschrift wird erst nach bewusster Bestätigung ausgestellt.
  const [bestaetigen, setBestaetigen] = useState(null);
  const [message, setMessage] = useState(null);           // { type, text }
  const inFlight = useRef(false);
  const ladeLauf = useRef(0);
  // Pre-Live-Testlauf: der Schalter erscheint nur bei aktivem Testmodus.
  const prelive = usePreliveStatus();
  const from = returnState(useLocation());
  const testmodus = preliveEnabled(prelive.status);
  const [testlauf, setTestlauf] = useState(false);
  const scope = testmodus && testlauf ? "test" : null;
  const statusNeu = prelive.reload;

  const laden = useCallback(async (m, bereich) => {
    const meinLauf = ++ladeLauf.current;
    setVorschau((v) => ({ ...v, loading: true, error: "" }));
    try {
      const r = await previewAdminCreditNotes(m, { scope: runScope(bereich) });
      if (meinLauf !== ladeLauf.current) return;
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (meinLauf !== ladeLauf.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;   // zentraler Logout
        if (d && d.code === "PRELIVE_TEST_MODE_DISABLED") statusNeu();
        setVorschau({ loading: false, error: previewErrorText(r.status, d), data: null });
        return;
      }
      setVorschau({ loading: false, error: "", data: normalizePreview(d, { scope: bereich }) });
    } catch {
      if (meinLauf === ladeLauf.current) setVorschau({ loading: false, error: RUN_TEXTS.previewError, data: null });
    }
  }, [statusNeu]);

  const vorschauLaden = (e) => {
    e.preventDefault();
    if (!monat || inFlight.current) return;
    setErgebnisse({});
    setMessage(null);
    laden(monat, scope);
  };

  // Monat oder Bereich gewechselt: die alte Vorschau gilt nicht mehr.
  const verwerfen = () => {
    ladeLauf.current += 1;
    setVorschau({ loading: false, error: "", data: null });
    setErgebnisse({});
    setMessage(null);
  };
  const monatWaehlen = (v) => {
    if (inFlight.current) return;
    setMonat(v);
    verwerfen();
  };
  const testlaufSchalten = (an) => {
    if (inFlight.current) return;
    setTestlauf(an === true);
    verwerfen();
  };

  const ergebnis = (id, type, text) => setErgebnisse((e) => ({ ...e, [id]: { type, text } }));

  // Stellt GENAU eine Gutschrift aus und hält das Ergebnis in der Zeile fest.
  async function ausstellenZeile(preview, row) {
    const gebaut = buildIssueBody(preview, row);
    if (!gebaut.ok) return { ok: false, abort: false, reload: false };
    setAktiv(row.partnerUserId);
    try {
      const r = await issueAdminCreditNote(gebaut.body);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return { ok: false, auth: true };
        const folge = issueOutcome(r.status, d);
        ergebnis(row.partnerUserId, "error", folge.text);
        return { ok: false, ...folge };
      }
      ergebnis(row.partnerUserId, "success", issueSuccessText(d));
      return { ok: true, abort: false, reload: true };
    } catch {
      ergebnis(row.partnerUserId, "error", RUN_TEXTS.connection);
      return { ok: false, kind: "connection", text: RUN_TEXTS.connection, abort: true, reload: true };
    } finally {
      setAktiv(null);
    }
  }

  const einzeln = async (row) => {
    setBestaetigen(null);
    const preview = vorschau.data;
    if (!preview || inFlight.current) return;
    inFlight.current = true;
    setMessage(null);
    try {
      const folge = await ausstellenZeile(preview, row);
      if (folge.auth) return;
      if (folge.abort) setMessage({ type: "error", text: folge.text });
      if (folge.kind === "testModeDisabled") statusNeu();
      if (folge.reload) await laden(preview.month, preview.scope);
    } finally {
      inFlight.current = false;
    }
  };

  const alle = async () => {
    setBestaetigen(null);
    const preview = vorschau.data;
    if (!preview || inFlight.current) return;
    const zeilen = issuableRows(preview);
    if (zeilen.length === 0) return;
    inFlight.current = true;
    setLauf(true);
    setMessage(null);
    let ausgestellt = 0;
    let abbruch = null;
    try {
      for (let i = 0; i < zeilen.length; i += 1) {
        const folge = await ausstellenZeile(preview, zeilen[i]);
        if (folge.auth) return;
        if (folge.ok) { ausgestellt += 1; continue; }
        if (folge.abort) {
          abbruch = folge;
          for (const z of zeilen.slice(i + 1)) ergebnis(z.partnerUserId, "skipped", RUN_TEXTS.aborted);
          break;
        }
      }
      const summe = `${ausgestellt} von ${zeilen.length} Gutschriften ausgestellt.`;
      setMessage(abbruch
        ? { type: "error", text: `${abbruch.text} ${summe}` }
        : { type: ausgestellt === zeilen.length ? "success" : "error", text: summe });
      if (abbruch && abbruch.kind === "testModeDisabled") statusNeu();
      await laden(preview.month, preview.scope);
    } finally {
      inFlight.current = false;
      setLauf(false);
    }
  };

  const data = vorschau.data;
  const offen = issuanceOpen(data);
  const zulaessig = issuableRows(data);
  const beschaeftigt = lauf || aktiv !== null;
  // „issuance_disabled“ steht bereits im Hinweis zur abgeschalteten Ausstellung.
  const globale = data ? data.globalBlockers.filter((c) => !(c === "issuance_disabled" && !data.issuanceEnabled)) : [];
  // Der eine Bestätigungsdialog: Einzelausstellung (Partner, Monat, Betrag) oder Sammellauf.
  const einzelZeile = bestaetigen && bestaetigen.art === "einzeln" ? bestaetigen.row : null;
  const testlaufAktiv = data ? data.scope === "test" : false;
  const einzelBetrag = einzelZeile ? issueAmountText(einzelZeile) : null;

  const aktion = (row, { mitId }) => {
    const id = row.partnerUserId;
    const erg = id !== null ? ergebnisse[id] : null;
    const zeigeKnopf = row.status === "issuable";
    return (
      <>
        {zeigeKnopf && (
          <button type="button" className="btn btn-primary btn-sm" id={mitId && id !== null ? `adm-cn-issue-${id}` : undefined}
            disabled={!canIssueRow(data, row) || beschaeftigt || vorschau.loading}
            aria-describedby={!offen ? "adm-cn-closed" : undefined}
            onClick={() => { setMessage(null); setBestaetigen({ art: "einzeln", row }); }}>
            {aktiv !== null && aktiv === id ? "Wird ausgestellt…" : "Ausstellen"}
          </button>
        )}
        {erg && (
          <span className={`adm-cn-result adm-cn-result--${erg.type}`} id={mitId && id !== null ? `adm-cn-result-${id}` : undefined}>
            {erg.text}
          </span>
        )}
        {!zeigeKnopf && !erg && <span className="adm-muted">—</span>}
      </>
    );
  };

  let inhalt = null;
  if (vorschau.loading && !data) {
    inhalt = <div className="table-card"><ListSkeleton rows={4} label="Vorschau wird geladen …" /></div>;
  } else if (vorschau.error) {
    inhalt = (
      <div className="ce-card" id="adm-cn-error">
        <ErrorState title={vorschau.error}
          action={<button type="button" className="btn btn-primary btn-sm" onClick={() => laden(monat, scope)}>Erneut versuchen</button>} />
      </div>
    );
  } else if (!data) {
    inhalt = <p className="adm-support-hint" id="adm-cn-start">Wählen Sie einen abgeschlossenen Monat und laden Sie die Vorschau.</p>;
  } else {
    inhalt = (
      <>
        <div className="adm-card" id="adm-cn-summary">
          <div className="adm-card-head">Vorschau {formatMonth(data.month)}</div>
          <div className="adm-card-body">
            <dl className="adm-kv">
              <div className="adm-kv-item"><dt>Monat</dt><dd>{formatMonth(data.month)}</dd></div>
              {data.scope === "test" && (
                <div className="adm-kv-item"><dt>Bereich</dt><dd id="adm-cn-scope">{RUN_TEXTS.testScopeLabel}</dd></div>
              )}
              <div className="adm-kv-item"><dt>Stichtag</dt><dd>{formatTimestamp(data.cutoffAt, { withTime: true })}</dd></div>
              <div className="adm-kv-item"><dt>Ausstellung</dt><dd id="adm-cn-issuance">{data.issuanceEnabled ? "Aktiviert" : "Deaktiviert"}</dd></div>
              <div className="adm-kv-item"><dt>Zulässig</dt><dd>{formatCount(zulaessig.length)} von {formatCount(data.partners.length)}</dd></div>
            </dl>
            {!data.issuanceEnabled && (
              <div className="adm-note adm-note--warning adm-sp-note" role="note" id="adm-cn-disabled">
                {RUN_TEXTS.issuanceDisabled} Die Vorschau zeigt, was ausgestellt würde; ausgestellt wird nichts.
              </div>
            )}
            {globale.length > 0 && (
              <div className="adm-note adm-note--error adm-sp-note" role="note" id="adm-cn-global-blockers">
                <div>
                  <p className="adm-cn-note-title">{RUN_TEXTS.globalBlocked}</p>
                  <Blocker codes={globale} />
                </div>
              </div>
            )}
            {!offen && <span className="sr-only" id="adm-cn-closed">Ausstellen ist derzeit nicht möglich.</span>}
            <div className="adm-cn-run-actions">
              <button type="button" className="btn btn-primary btn-sm" id="adm-cn-issue-all"
                disabled={!offen || zulaessig.length === 0 || beschaeftigt || vorschau.loading}
                onClick={() => { setMessage(null); setBestaetigen({ art: "alle" }); }}>
                {lauf ? "Gutschriften werden ausgestellt…" : `Alle zulässigen ausstellen (${zulaessig.length})`}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => laden(data.month, data.scope)}
                disabled={beschaeftigt || vorschau.loading} id="adm-cn-reload">
                Vorschau aktualisieren
              </button>
            </div>
          </div>
        </div>

        {data.partners.length === 0 ? (
          <div className="table-card"><div className="empty"><div className="empty-title" id="adm-cn-empty">{RUN_TEXTS.empty}</div></div></div>
        ) : (
          <>
            <div className="table-card adm-cn-table" id="adm-cn-table" aria-busy={vorschau.loading ? "true" : undefined}>
              <table>
                <caption className="sr-only">
                  Abrechnungslauf {formatMonth(data.month)}: Partner, Positionen, Netto, Steuer, Brutto, Status, Blockiergründe, Aktion und Ergebnis.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Partner</th>
                    <th scope="col" className="adm-num">Positionen</th>
                    <th scope="col" className="adm-num">Netto</th>
                    <th scope="col" className="adm-num">Steuer</th>
                    <th scope="col" className="adm-num">Brutto</th>
                    <th scope="col">Status</th>
                    <th scope="col">Blockiergründe</th>
                    <th scope="col" className="adm-col-action">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.partners.map((row, i) => (
                    <tr key={row.partnerUserId ?? `p-${i}`} data-partner-id={row.partnerUserId ?? undefined}>
                      <td><PartnerCell row={row} from={from} /></td>
                      <td className="adm-num">{formatCount(row.entryCount)}</td>
                      <td className="adm-num">{formatCents(row.netCents)}</td>
                      <td className="adm-num">{formatCents(row.taxCents)}</td>
                      <td className="adm-num">{formatCents(row.grossCents)}</td>
                      <td>
                        <Badge meta={runStatusMeta(row.status)} />
                        {row.existingCreditNote?.number && <span className="adm-sp-sub adm-sp-block">{row.existingCreditNote.number}</span>}
                      </td>
                      <td><Blocker codes={row.blockers} /></td>
                      <td className="adm-col-action">{aktion(row, { mitId: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="adm-cn-cards">
              {data.partners.map((row, i) => (
                <li className="adm-scard" key={`c-${row.partnerUserId ?? i}`}>
                  <div className="adm-scard-head">
                    <PartnerCell row={row} from={from} />
                    <Badge meta={runStatusMeta(row.status)} />
                  </div>
                  <dl className="adm-scard-kv">
                    <div><dt>Positionen</dt><dd>{formatCount(row.entryCount)}</dd></div>
                    <div><dt>Netto</dt><dd>{formatCents(row.netCents)}</dd></div>
                    <div><dt>Steuer</dt><dd>{formatCents(row.taxCents)}</dd></div>
                    <div><dt>Brutto</dt><dd>{formatCents(row.grossCents)}</dd></div>
                    {row.existingCreditNote?.number && <div><dt>Gutschrift</dt><dd>{row.existingCreditNote.number}</dd></div>}
                    <div><dt>Blockiergründe</dt><dd><Blocker codes={row.blockers} /></dd></div>
                  </dl>
                  <div className="adm-scard-actions">{aktion(row, { mitId: false })}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Gutschriften</>}
        subtitle={<>Gutschriften für einen abgeschlossenen Monat prüfen und je Vertriebspartner ausstellen.</>}
      />
      <SalesPartnerAdminNav prelive={prelive} />

      <form className="adm-filters" onSubmit={vorschauLaden}>
        <div className="adm-filter-field">
          <label htmlFor="adm-cn-month">Monat (abgeschlossen)</label>
          <select id="adm-cn-month" value={monat} disabled={beschaeftigt || optionen.length === 0}
            onChange={(e) => monatWaehlen(e.target.value)}>
            {optionen.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {testmodus && (
          <div className="adm-cn-scope-switch">
            <Switch id="adm-cn-scope-test" checked={testlauf} onChange={testlaufSchalten} disabled={beschaeftigt}
              label={RUN_TEXTS.testScopeLabel} hint={RUN_TEXTS.testScopeHint} />
          </div>
        )}
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm" id="adm-cn-preview"
            disabled={!monat || beschaeftigt || vorschau.loading}>
            Vorschau laden
          </button>
        </div>
      </form>

      {scope === "test" && (
        <div className="adm-note adm-note--warning adm-cn-test-note" role="note" id="adm-cn-test-note">
          <span>{RUN_TEXTS.testScopeNote}</span>
        </div>
      )}

      {message && (
        <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
          role={message.type === "success" ? "status" : "alert"} id="adm-cn-message">
          {message.text}
        </div>
      )}

      {inhalt}

      {bestaetigen && data && (
        <ConfirmDialog
          title={einzelZeile
            ? (testlaufAktiv ? RUN_TEXTS.singleTitleTest : RUN_TEXTS.singleTitle)
            : (testlaufAktiv ? "Alle zulässigen Testgutschriften ausstellen" : "Alle zulässigen Gutschriften ausstellen")}
          subline={einzelZeile
            ? `${previewPartnerName(einzelZeile)} · ${formatMonth(data.month)}`
            : `${formatMonth(data.month)} · ${zulaessig.length} Vertriebspartner`}
          text={einzelZeile
            ? `${einzelBetrag ? `Betrag: ${einzelBetrag}. ` : ""}${testlaufAktiv ? `${RUN_TEXTS.testScopeNote}.` : RUN_TEXTS.singleText}`
            : (testlaufAktiv
              ? `Für jeden zulässigen Testpartner wird nacheinander eine Testgutschrift ausgestellt. ${RUN_TEXTS.testScopeNote}.`
              : "Für jeden zulässigen Vertriebspartner wird nacheinander eine Gutschrift ausgestellt. Ausgestellte Gutschriften lassen sich nur durch ein Storno korrigieren.")}
          confirmLabel={einzelZeile ? (testlaufAktiv ? RUN_TEXTS.singleConfirmTest : RUN_TEXTS.singleConfirm) : "Ausstellen"}
          irreversible
          confirmId={einzelZeile ? "adm-cn-issue-confirm" : "adm-cn-issue-all-confirm"}
          onCancel={() => setBestaetigen(null)}
          onConfirm={einzelZeile ? () => einzeln(einzelZeile) : alle}
        />
      )}
    </div>
  );
}
