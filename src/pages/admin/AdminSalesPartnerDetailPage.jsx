import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { AdminBackLink } from "../../components/admin/AdminBackLink";
import { returnState } from "../../utils/adminBackLink.mjs";
import { CopyableNumber } from "../../components/ui/CopyableNumber";
import { SalesPartnerStatusCard } from "../../components/admin/SalesPartnerStatusCard";
import { SalesPartnerRatesCard } from "../../components/admin/SalesPartnerRatesCard";
import { SalesPartnerLevelRulesCard } from "../../components/admin/SalesPartnerLevelRulesCard";
import { SalesPartnerCapCard } from "../../components/admin/SalesPartnerCapCard";
import { PreliveTestBadge } from "../../components/admin/PreliveTestBadge";
import { SalesPartnerCommissionsCard } from "../../components/admin/SalesPartnerCommissionsCard";
import { SalesPartnerBillingDetailsCard } from "../../components/admin/SalesPartnerBillingDetailsCard";
import { SalesPartnerCreditNotesCard } from "../../components/admin/SalesPartnerCreditNotesCard";
import { getAdminSalesPartner } from "../../api/adminApi";
import { agreementDocumentUrl } from "../../api/partnerApi";
import { referralLinkPath } from "../../utils/referralCapture.mjs";
import { AGREEMENT_TEXTS } from "../../utils/salesPartnerAgreement.mjs";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";
import {
  formatBonusPercent,
  formatCents,
  formatCount,
  formatMonth,
  levelText,
  partnerStatusMeta,
  relevanceLabel,
} from "../../utils/salesPartnerView.mjs";
import {
  adminPartnerStatusMeta,
  attributionSourceLabel,
  formatTimestamp,
  loginStatusMeta,
  normalizeAdminPartnerDetail,
  partnerDisplayName,
} from "../../utils/adminSalesPartnerView.mjs";

const FEHLER = "Der Vertriebspartner konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

function Badge({ meta }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`}>{label}</span>;
}

function KV({ items }) {
  return (
    <dl className="adm-kv">
      {items.map(([k, v]) => (
        <div className="adm-kv-item" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// Teilen-Link eines Codes — aus den eigenen Routen des Frontends abgeleitet
// (utils/referralCapture.mjs), nie aus einer erfundenen Adresse.
function linkFuer(kind, code) {
  const pfad = referralLinkPath(kind, code);
  if (!pfad) return null;
  return typeof window !== "undefined" && window.location ? `${window.location.origin}${pfad}` : pfad;
}

function TeamTable({ level, members, from }) {
  if (members.length === 0) return <p className="adm-support-hint">Ebene {level}: keine Partner.</p>;
  return (
    <div className="table-scroll adm-sp-mini-table">
      <table>
        <caption className="sr-only">Team Ebene {level}: Name, Status, aktiv seit, provisionsrelevant, Teamprovision im Monat und gesamt.</caption>
        <thead>
          <tr>
            <th scope="col">Ebene {level}</th>
            <th scope="col">Status</th>
            <th scope="col">Aktiv seit</th>
            <th scope="col">Provisionsrelevant</th>
            <th scope="col" className="adm-num">Monat</th>
            <th scope="col" className="adm-num">Gesamt</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m, i) => (
            <tr key={m.id ?? i}>
              <td>{m.id != null ? <Link to={`/admin/partners/${encodeURIComponent(m.id)}`} state={from}>{m.name || `Partner #${m.id}`}</Link> : (m.name || "—")}</td>
              <td><Badge meta={partnerStatusMeta(m.status)} /></td>
              <td>{formatTimestamp(m.activeSince)}</td>
              <td>{relevanceLabel(m)}</td>
              <td className="adm-num">{formatCents(m.commissionCurrentMonthCents)}</td>
              <td className="adm-num">{formatCents(m.commissionTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Admin · Vertriebspartner (Detail) ───────────────────────────────────────
   Stammdaten, Codes und Links, Abrechnungsdaten (Prüfung), Status und Zugang
   (Aktionen), Sätze, Level-Regeln, individuelle Obergrenze, Team, Kunden,
   Monatsbewertungen, Provisionen und Gutschriften. Vorbelegungen (Freigabe,
   eigene Regeln) stammen aus den Startwerten des Servers (`startDefaults`).
   Jede Aktion läuft über den zentralen
   Bestätigungsdialog (das erneute Erzeugen eines Dokuments direkt); nach jeder
   Änderung wird der Stand des Servers neu geladen (kein optimistisches Raten). */
export default function AdminSalesPartnerDetailPage() {
  const { id } = useParams();
  // Herkunft für Links in andere Detailseiten: „Zurück" führt wieder hierher.
  const from = returnState(useLocation());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const r = await getAdminSalesPartner(id);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;   // zentraler Redirect
        if (r.status === 404) { setNotFound(true); setDetail(null); return; }
        setError(FEHLER);
        setDetail(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setDetail(normalizeAdminPartnerDetail(d));
    } catch {
      setError(FEHLER);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Rückweg zur Herkunft (UX-Paket 2), sonst zur Liste.
  const back = <AdminBackLink to="/admin/partners" label="Zurück zu den Vertriebspartnern" />;

  if (loading && !detail) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><div className="loading-center" role="status"><span className="spinner spinner-dark" /> Wird geladen…</div></div>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><div className="empty"><div className="empty-title">Vertriebspartner nicht gefunden</div></div></div>
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="adm-page">
        {back}
        <div className="alert alert-error" role="alert">{error || FEHLER}</div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Erneut versuchen</button>
      </div>
    );
  }

  const p = detail.partner;
  const partnerId = p.id ?? id;
  const kundenLink = linkFuer("customer", p.referralCode);
  const partnerLink = linkFuer("partner", p.referralCode);

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        backLink={back}
        title={partnerDisplayName(p)}
        subtitle={(
          <span className="adm-detail-sub">
            {p.companyName && p.name && <span>{p.name}</span>}
            {p.email && <span className="adm-detail-mail">{p.email}</span>}
          </span>
        )}
        meta={(
          <>
            {p.preliveTest && <PreliveTestBadge id="adm-sp-prelive-badge" />}
            <Badge meta={adminPartnerStatusMeta(p.status)} />
            <Badge meta={loginStatusMeta(p.loginStatus)} />
            <span className="adm-chip">Registriert {formatTimestamp(p.createdAt)}</span>
          </>
        )}
        actions={<button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>Aktualisieren</button>}
      />

      <div className="adm-cards">
        <SalesPartnerStatusCard partner={{ ...p, id: partnerId }} statusHistory={detail.statusHistory}
          startDefaults={detail.startDefaults} datesBeforeTodayAllowed={detail.datesBeforeTodayAllowed} onChanged={load} />

        <div className="adm-card" id="adm-sp-master-card">
          <div className="adm-card-head">Stammdaten</div>
          <div className="adm-card-body">
            <KV items={[
              ["Name", p.name || "—"],
              ["Firma", p.companyName || "—"],
              ["E-Mail", p.email || "—"],
              ["Telefon", p.phone || "—"],
              ["Registriert am", formatTimestamp(p.createdAt, { withTime: true })],
              ["Partnervereinbarung", p.agreementVersion ? (
                <>
                  {`Fassung ${p.agreementVersion}`}
                  {agreementDocumentUrl(p.agreementDocumentPath) && (
                    <>
                      {" · "}
                      <a id="adm-sp-agreement-document" href={agreementDocumentUrl(p.agreementDocumentPath)}
                        target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>
                        {AGREEMENT_TEXTS.open}
                        <span className="sr-only"> {AGREEMENT_TEXTS.opensInNewTab}</span>
                      </a>
                    </>
                  )}
                </>
              ) : "—"],
              ["Zugestimmt am", formatTimestamp(p.agreementAcceptedAt, { withTime: true })],
              ["Sponsor", p.sponsor?.id != null
                ? <Link to={`/admin/partners/${encodeURIComponent(p.sponsor.id)}`} state={from}>{p.sponsor.name || `Partner #${p.sponsor.id}`}</Link>
                : (p.sponsor?.name || "—")],
            ]} />
          </div>
        </div>

        <div className="adm-card" id="adm-sp-codes-card">
          <div className="adm-card-head">Codes und Links</div>
          <div className="adm-card-body">
            <KV items={[
              ["Empfehlungscode", p.referralCode ? <CopyableNumber value={p.referralCode} label="Empfehlungscode" /> : "—"],
              ["Verwendeter Sponsorcode", p.sponsorCodeUsed ? <span className="adm-mono">{p.sponsorCodeUsed}</span> : "—"],
              ["Kundenlink", kundenLink ? <CopyableNumber value={kundenLink} label="Kundenlink" /> : "—"],
              ["Partnerlink", partnerLink ? <CopyableNumber value={partnerLink} label="Partnerlink" /> : "—"],
            ]} />
          </div>
        </div>

        <SalesPartnerBillingDetailsCard partnerId={partnerId} partnerName={partnerDisplayName(p)} />

        {/* Zurückliegende Daten nur, wenn der Server sie für diesen Partner
            erlaubt (Testpartner im Pre-Live-Testmodus). */}
        <SalesPartnerRatesCard partnerId={partnerId} rates={detail.rates} partnerStatus={p.status}
          allowPastDates={detail.datesBeforeTodayAllowed} onChanged={load} />
        <SalesPartnerLevelRulesCard partnerId={partnerId} levelRules={detail.levelRules}
          startDefaults={detail.startDefaults} allowPastDates={detail.datesBeforeTodayAllowed} onChanged={load} />
        <SalesPartnerCapCard partnerId={partnerId} allowPastDates={detail.datesBeforeTodayAllowed} />

        <div className="adm-card" id="adm-sp-team-card">
          <div className="adm-card-head">Team</div>
          <div className="adm-card-body adm-sp-stack">
            <TeamTable level={1} members={detail.team.level1} from={from} />
            <TeamTable level={2} members={detail.team.level2} from={from} />
          </div>
        </div>

        <div className="adm-card" id="adm-sp-customers-card">
          <div className="adm-card-head">Kunden</div>
          <div className="adm-card-body">
            {detail.customers.length === 0 ? (
              <p className="adm-support-hint">Diesem Partner sind keine Kunden zugeordnet.</p>
            ) : (
              <div className="table-scroll adm-sp-mini-table">
                <table>
                  <caption className="sr-only">Zugeordnete Kunden: Firma, zugeordnet seit, bis, Herkunft, verwendeter Code.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Kunde</th>
                      <th scope="col">Seit</th>
                      <th scope="col">Bis</th>
                      <th scope="col">Herkunft</th>
                      <th scope="col">Verwendeter Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.customers.map((c, i) => (
                      <tr key={`${c.customerId ?? "k"}-${i}`}>
                        <td>{c.customerId != null
                          ? <Link to={`/admin/users/${encodeURIComponent(c.customerId)}`} state={from}>{c.companyName || `Kunde #${c.customerId}`}</Link>
                          : (c.companyName || "—")}</td>
                        <td>{formatTimestamp(c.assignedSince)}</td>
                        <td>{formatTimestamp(c.assignedUntil)}</td>
                        <td>{attributionSourceLabel(c.source)}</td>
                        <td>{c.referralCodeUsed ? <span className="adm-mono">{c.referralCodeUsed}</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="adm-card" id="adm-sp-assessments-card">
          <div className="adm-card-head">Monatsbewertungen</div>
          <div className="adm-card-body">
            {detail.assessments.length === 0 ? (
              <p className="adm-support-hint">Noch keine Monatsbewertung.</p>
            ) : (
              <div className="table-scroll adm-sp-mini-table">
                <table>
                  <caption className="sr-only">Monatsbewertungen: Monat, Bemessungsmonat, aktive Kunden, Pakete, Kunden-Level, Paket-Level, Mindestpakete, Version.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Monat</th>
                      <th scope="col">Bemessen</th>
                      <th scope="col" className="adm-num">Aktive Kunden</th>
                      <th scope="col" className="adm-num">Pakete</th>
                      <th scope="col">Kunden-Level</th>
                      <th scope="col">Paket-Level</th>
                      <th scope="col" className="adm-num">Mindestpakete</th>
                      <th scope="col" className="adm-num">Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.assessments.map((a, i) => (
                      <tr key={`${a.month ?? "m"}-${a.version ?? i}`}>
                        <td>{formatMonth(a.month)}</td>
                        <td>{formatMonth(a.measuredMonth)}</td>
                        <td className="adm-num">{formatCount(a.activeCustomers)}</td>
                        <td className="adm-num">{formatCount(a.shippedPackages)}</td>
                        <td>{levelText(a.customerLevel)} · {formatBonusPercent(a.customerBonusPercent)}</td>
                        <td>{levelText(a.packageLevel)} · {formatBonusPercent(a.packageBonusPercent)}</td>
                        <td className="adm-num">{formatCount(a.minPackages)}</td>
                        <td className="adm-num">{formatCount(a.version)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <SalesPartnerCommissionsCard partnerId={partnerId} />
        <SalesPartnerCreditNotesCard partnerId={partnerId} />
      </div>
    </div>
  );
}
