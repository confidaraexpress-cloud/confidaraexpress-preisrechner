import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { AdminBackLink } from "../../components/admin/AdminBackLink";
import { returnState } from "../../utils/adminBackLink.mjs";
import { sectionFromState } from "../../utils/adminJumpState.mjs";
import { CopyableNumber } from "../../components/ui/CopyableNumber";
import { AdminDisclosureCard, openAdminSection } from "../../components/admin/AdminDisclosureCard";
import { SalesPartnerOverviewCard } from "../../components/admin/SalesPartnerOverviewCard";
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
  localIsoDate,
  loginStatusMeta,
  normalizeAdminPartnerDetail,
  partnerDisplayName,
} from "../../utils/adminSalesPartnerView.mjs";
import {
  DETAIL_TEXTS,
  agreementSummary,
  assessmentSummary,
  codesSummary,
  customersSummary,
  teamSummary,
} from "../../utils/adminPartnerDetailView.mjs";

const FEHLER = "Der Vertriebspartner konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

function Badge({ meta }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`}>{label}</span>;
}

function KV({ items, id, className = "adm-kv" }) {
  return (
    <dl className={className} id={id}>
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

// Einen Bereich öffnen und dorthin springen (Aktion „Nächster Schritt", Sprunglink).
const bereichOeffnen = (id) => { openAdminSection(id); };

/* Angaben eines Partners — im Antrag oben („Antrag prüfen"), sonst im Bereich
   „Stammdaten". Der Vertragsstand ist die zugestimmte Fassung mit dem
   registrierten Dokument; ein Testkonto steht als solches da (nur aus der
   Kennzeichnung des Servers). */
function PartnerFacts({ p, from, id }) {
  const dokument = agreementDocumentUrl(p.agreementDocumentPath);
  return (
    <KV id={id} className="adm-kv adm-sp-facts" items={[
      ["Name", p.name || "—"],
      ["Firma", p.companyName || "—"],
      ["E-Mail", p.email || "—"],
      ["Telefon", p.phone || "—"],
      ["Sponsor", p.sponsor?.id != null
        ? <Link to={`/admin/partners/${encodeURIComponent(p.sponsor.id)}`} state={from}>{p.sponsor.name || `Partner #${p.sponsor.id}`}</Link>
        : (p.sponsor?.name || "—")],
      ["Partnervereinbarung", p.agreementVersion ? (
        <>
          {`Fassung ${p.agreementVersion}`}
          {dokument && (
            <>
              {" · "}
              <a id="adm-sp-agreement-document" href={dokument} target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>
                {AGREEMENT_TEXTS.open}
                <span className="sr-only"> {AGREEMENT_TEXTS.opensInNewTab}</span>
              </a>
            </>
          )}
        </>
      ) : agreementSummary(p)],
      ["Zugestimmt am", formatTimestamp(p.agreementAcceptedAt, { withTime: true })],
      ["Registriert am", formatTimestamp(p.createdAt, { withTime: true })],
    ]} />
  );
}

function TeamTable({ level, members, from }) {
  if (members.length === 0) return <p className="adm-support-hint">Ebene {level}: keine Partner.</p>;
  return (
    <div className="table-scroll adm-sp-mini-table adm-sp-cardtable">
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
              <td data-label={`Ebene ${level}`}>{m.id != null ? <Link to={`/admin/partners/${encodeURIComponent(m.id)}`} state={from}>{m.name || `Partner #${m.id}`}</Link> : (m.name || "—")}</td>
              <td data-label="Status"><Badge meta={partnerStatusMeta(m.status)} /></td>
              <td data-label="Aktiv seit">{formatTimestamp(m.activeSince)}</td>
              <td data-label="Provisionsrelevant">{relevanceLabel(m)}</td>
              <td data-label="Monat" className="adm-num">{formatCents(m.commissionCurrentMonthCents)}</td>
              <td data-label="Gesamt" className="adm-num">{formatCents(m.commissionTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Gruppe zusammengehöriger Bereiche unter einer Zwischenüberschrift.
function Gruppe({ id, title, children }) {
  return (
    <section className="adm-sp-group" aria-labelledby={id}>
      <h2 className="adm-sp-group-title" id={id}>{title}</h2>
      <div className="adm-cards">{children}</div>
    </section>
  );
}

/* Inhalt der Detailseite eines Partners. Er hängt am Partner (key): ein
   Wechsel zu einem anderen Partner beginnt mit frischen Bereichen, ohne Stände
   des vorigen. Die Zustände von Obergrenze, Abrechnungsdaten und Gutschriften
   melden ihre Bereiche für den Überblick. */
function PartnerDetailBody({ detail, partnerId, from, refreshKey, onChanged, zielBereich = null }) {
  const p = detail.partner;
  const [caps, setCaps] = useState(null);
  const [billing, setBilling] = useState(null);
  const [creditNotes, setCreditNotes] = useState(null);
  // Sprunglink: den genannten Bereich einmal öffnen, sobald die Seite steht.
  useEffect(() => { if (zielBereich) bereichOeffnen(zielBereich); }, [zielBereich]);
  const antrag = p.status === "pending";
  const freigegeben = p.status === "active" || p.status === "inactive";
  const kundenLink = linkFuer("customer", p.referralCode);
  const partnerLink = linkFuer("partner", p.referralCode);
  const statusKarte = { partner: { ...p, id: partnerId }, statusHistory: detail.statusHistory, startDefaults: detail.startDefaults,
    datesBeforeTodayAllowed: detail.datesBeforeTodayAllowed, onChanged };

  return (
    <div className="adm-cards">
      {/* Oben: ein offener Antrag wird ohne Suchen geprüft; ein freigegebener
          Partner beginnt mit dem Überblick und dem nächsten Schritt. Die
          Statuskarte bleibt an derselben Stelle, damit ihre Meldung nach der
          Freigabe stehen bleibt. */}
      {freigegeben && (
        <SalesPartnerOverviewCard detail={detail} today={localIsoDate()} caps={caps} billing={billing} creditNotes={creditNotes}
          onOpenSection={bereichOeffnen} />
      )}
      {antrag ? (
        <SalesPartnerStatusCard key="status" {...statusKarte} title={DETAIL_TEXTS.applicationTitle}
          intro={<PartnerFacts p={p} from={from} id="adm-sp-application-facts" />} />
      ) : (
        <SalesPartnerStatusCard key="status" {...statusKarte} />
      )}

      <Gruppe id="adm-sp-group-billing" title={DETAIL_TEXTS.groupBilling}>
        <SalesPartnerBillingDetailsCard partnerId={partnerId} partnerName={partnerDisplayName(p)} refreshKey={refreshKey} onState={setBilling} />
        <SalesPartnerCommissionsCard partnerId={partnerId} refreshKey={refreshKey} />
        <SalesPartnerCreditNotesCard partnerId={partnerId} refreshKey={refreshKey} onState={setCreditNotes} />
      </Gruppe>

      {/* Zurückliegende Daten nur, wenn der Server sie für diesen Partner
          erlaubt (Testpartner im Pre-Live-Testmodus). */}
      <Gruppe id="adm-sp-group-conditions" title={DETAIL_TEXTS.groupConditions}>
        <SalesPartnerRatesCard partnerId={partnerId} rates={detail.rates} partnerStatus={p.status}
          allowPastDates={detail.datesBeforeTodayAllowed} onChanged={onChanged} />
        <SalesPartnerLevelRulesCard partnerId={partnerId} levelRules={detail.levelRules}
          startDefaults={detail.startDefaults} allowPastDates={detail.datesBeforeTodayAllowed} onChanged={onChanged} />
        <SalesPartnerCapCard partnerId={partnerId} allowPastDates={detail.datesBeforeTodayAllowed} refreshKey={refreshKey} onState={setCaps} />
      </Gruppe>

      <Gruppe id="adm-sp-group-network" title={DETAIL_TEXTS.groupNetwork}>
        <AdminDisclosureCard id="adm-sp-customers-card" title="Kunden" summary={customersSummary(detail.customers, localIsoDate())}>
          {detail.customers.length === 0 ? (
            <p className="adm-support-hint">Diesem Partner sind keine Kunden zugeordnet.</p>
          ) : (
            <div className="table-scroll adm-sp-mini-table adm-sp-cardtable">
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
                      <td data-label="Kunde">{c.customerId != null
                        ? <Link to={`/admin/users/${encodeURIComponent(c.customerId)}`} state={from}>{c.companyName || `Kunde #${c.customerId}`}</Link>
                        : (c.companyName || "—")}</td>
                      <td data-label="Seit">{formatTimestamp(c.assignedSince)}</td>
                      <td data-label="Bis">{formatTimestamp(c.assignedUntil)}</td>
                      <td data-label="Herkunft">{attributionSourceLabel(c.source)}</td>
                      <td data-label="Verwendeter Code">{c.referralCodeUsed ? <span className="adm-mono">{c.referralCodeUsed}</span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminDisclosureCard>

        <AdminDisclosureCard id="adm-sp-team-card" title="Team" summary={teamSummary(detail.team)}>
          <div className="adm-sp-stack">
            <TeamTable level={1} members={detail.team.level1} from={from} />
            <TeamTable level={2} members={detail.team.level2} from={from} />
          </div>
        </AdminDisclosureCard>

        <AdminDisclosureCard id="adm-sp-assessments-card" title="Monatsbewertungen" summary={assessmentSummary(detail.assessments)}>
          {detail.assessments.length === 0 ? (
            <p className="adm-support-hint">Noch keine Monatsbewertung.</p>
          ) : (
            <div className="table-scroll adm-sp-mini-table adm-sp-cardtable">
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
                      <td data-label="Monat">{formatMonth(a.month)}</td>
                      <td data-label="Bemessen">{formatMonth(a.measuredMonth)}</td>
                      <td data-label="Aktive Kunden" className="adm-num">{formatCount(a.activeCustomers)}</td>
                      <td data-label="Pakete" className="adm-num">{formatCount(a.shippedPackages)}</td>
                      <td data-label="Kunden-Level">{levelText(a.customerLevel)} · {formatBonusPercent(a.customerBonusPercent)}</td>
                      <td data-label="Paket-Level">{levelText(a.packageLevel)} · {formatBonusPercent(a.packageBonusPercent)}</td>
                      <td data-label="Mindestpakete" className="adm-num">{formatCount(a.minPackages)}</td>
                      <td data-label="Version" className="adm-num">{formatCount(a.version)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminDisclosureCard>
      </Gruppe>

      <Gruppe id="adm-sp-group-data" title={DETAIL_TEXTS.groupData}>
        {/* Im Antrag stehen die Angaben bereits oben — kein zweites Mal. */}
        {!antrag && (
          <AdminDisclosureCard id="adm-sp-master-card" title="Stammdaten" summary={agreementSummary(p)}>
            <PartnerFacts p={p} from={from} />
          </AdminDisclosureCard>
        )}
        <AdminDisclosureCard id="adm-sp-codes-card" title="Codes und Links" summary={codesSummary(p)}>
          <KV items={[
            ["Empfehlungscode", p.referralCode ? <CopyableNumber value={p.referralCode} label="Empfehlungscode" /> : "—"],
            ["Verwendeter Sponsorcode", p.sponsorCodeUsed ? <span className="adm-mono">{p.sponsorCodeUsed}</span> : "—"],
            ["Kundenlink", kundenLink ? <CopyableNumber value={kundenLink} label="Kundenlink" /> : "—"],
            ["Partnerlink", partnerLink ? <CopyableNumber value={partnerLink} label="Partnerlink" /> : "—"],
          ]} />
          {p.status !== "active" && <p className="adm-support-hint" id="adm-sp-links-inactive">{DETAIL_TEXTS.linksInactive}</p>}
        </AdminDisclosureCard>
      </Gruppe>
    </div>
  );
}

/* ── Admin · Vertriebspartner (Detail) ───────────────────────────────────────
   UX-Paket 4: nach Aufgaben geordnet. Ein offener Antrag steht oben als
   „Antrag prüfen" (Angaben, Freigeben, Ablehnen); ein freigegebener Partner
   beginnt mit dem Überblick (nächster Schritt, Status, Konditionen, Kunden und
   Team, Abrechnung) und „Status und Zugang". Darunter vier Gruppen —
   Abrechnung, Konditionen, Kunden und Team, Partnerdaten — mit einklappbaren
   Bereichen, deren Kopf das Wichtigste nennt; Formulare und Versionsverläufe
   sind darin noch einmal eingeklappt. Keine Angabe und keine Aktion entfällt.
   Vorbelegungen stammen aus den Werten des Servers (`startDefaults`, aktuelle
   Versionen). Jede Aktion läuft über den zentralen Bestätigungsdialog (das
   erneute Erzeugen eines Dokuments direkt); nach jeder Änderung wird der Stand
   des Servers neu geladen (kein optimistisches Raten). „Aktualisieren" lädt
   das Detail und jeden selbst ladenden Bereich neu. */
export default function AdminSalesPartnerDetailPage() {
  const { id } = useParams();
  // Herkunft für Links in andere Detailseiten: „Zurück" führt wieder hierher.
  const location = useLocation();
  const from = returnState(location);
  // Sprunglink (UX-Paket 5, z. B. aus den Gutschriften): ein Bereich aus der festen Liste.
  const zielBereich = sectionFromState(location.state);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [detail, setDetail] = useState(null);
  // Zähler für „Aktualisieren": jeder selbst ladende Bereich lädt bei Änderung neu.
  const [refreshKey, setRefreshKey] = useState(0);

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

  const aktualisieren = () => {
    load();
    setRefreshKey((k) => k + 1);
  };

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
        actions={<button type="button" className="btn btn-outline btn-sm" id="adm-sp-refresh" onClick={aktualisieren} disabled={loading}>Aktualisieren</button>}
      />

      <PartnerDetailBody key={partnerId} detail={detail} partnerId={partnerId} from={from} refreshKey={refreshKey} onChanged={load}
        zielBereich={zielBereich} />
    </div>
  );
}
