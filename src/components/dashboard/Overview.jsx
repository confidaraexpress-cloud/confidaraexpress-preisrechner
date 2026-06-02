import React from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { money, dateDE } from "../../utils/formatters";
import dhlLogo    from "../../assets/carriers/dhl.svg";
import upsLogo    from "../../assets/carriers/ups.svg";
import fedexLogo  from "../../assets/carriers/fedex.svg";
import tntLogo    from "../../assets/carriers/tnt.svg";
import dpdLogo    from "../../assets/carriers/dpd.svg";
import glsLogo    from "../../assets/carriers/gls.svg";
import jumingoLogo from "../../assets/carriers/jumingo.svg";
import emonsLogo  from "../../assets/carriers/emons.svg";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}

const STEPS = [
  {
    icon: "invoice",
    title: "Preis berechnen",
    desc: "Geben Sie Ihre Paketdaten ein und erhalten Sie sofort Preise aller Carrier im Vergleich.",
  },
  {
    icon: "package",
    title: "Sendung buchen",
    desc: "Wählen Sie das beste Angebot und buchen Sie Ihre Sendung mit wenigen Klicks.",
  },
  {
    icon: "mapPin",
    title: "Sendung verfolgen",
    desc: "Verfolgen Sie Ihre Sendung in Echtzeit und behalten Sie den Überblick über alle Pakete.",
  },
];

const CARRIERS = [
  { name: "DHL",    logo: dhlLogo    },
  { name: "UPS",    logo: upsLogo    },
  { name: "FedEx",  logo: fedexLogo  },
  { name: "TNT",    logo: tntLogo    },
  { name: "DPD",    logo: dpdLogo    },
  { name: "GLS",    logo: glsLogo    },
  { name: "Jumingo",logo: jumingoLogo},
  { name: "Emons",  logo: emonsLogo  },
];

function DashboardFooter() {
  return (
    <footer className="ce-footer">
      <div className="ce-footer-grid">
        <div>
          <div className="ce-footer-brand">
            <div className="logo-mark" style={{ width: 34, height: 34, fontSize: 13 }}>CE</div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--ce-ink-1)" }}>
              Confidara<b style={{ color: "var(--ce-blue-3)" }}>Express</b>
            </span>
          </div>
          <p className="ce-footer-tag">
            B2B-Versandplattform für professionellen Paketversand. Transparente Preise, starke Carrier, alles an einem Ort.
          </p>
          <div className="ce-footer-social">
            <a href="#" aria-label="LinkedIn">
              <Icon n="linkedin" s={16} />
            </a>
            <a href="mailto:support@confidaraexpress.de" aria-label="E-Mail">
              <Icon n="mail" s={16} />
            </a>
          </div>
        </div>

        <div className="ce-footer-col">
          <h4>Rechtliches</h4>
          <Link to="/impressum">Impressum</Link>
          <Link to="/datenschutz">Datenschutz</Link>
          <Link to="/agb">AGB</Link>
          <Link to="/widerruf">Widerruf</Link>
        </div>

        <div className="ce-footer-col">
          <h4>Kontakt</h4>
          <div className="ce-footer-contact-row">
            <Icon n="mail" s={14} />
            support@confidaraexpress.de
          </div>
          <div className="ce-footer-contact-row">
            <Icon n="phone" s={14} />
            015118003775
          </div>
          <div className="ce-footer-contact-row">
            <Icon n="mapPin" s={14} />
            Deutschland
          </div>
        </div>
      </div>

      <div className="ce-footer-bottom">
        © 2026 Confidara Express GbR · Alle Rechte vorbehalten
      </div>
    </footer>
  );
}

export function Overview({ user, shipments, invoices, loading, onNewShipment, onAllShipments }) {
  const unpaid = invoices.filter((i) => i.status === "unpaid");
  const unpaidAmt = unpaid.reduce((sum, i) => sum + Number(i.amount), 0);
  const inTransit = shipments.filter((s) =>
    ["in_transit", "booked", "label_ready"].includes(s.status)
  ).length;

  return (
    <div className="ce-overview">
      <div className="ce-aurora" aria-hidden="true">
        <div className="ce-aurora-ray" />
        <div className="ce-aurora-glow" />
      </div>

      <div className="ce-page">
        {/* Topbar */}
        <div className="ce-topbar">
          <div className="ce-greeting">
            {getGreeting()}, {user?.company_name || user?.name}
          </div>
          <button className="ce-icon-btn" aria-label="Benachrichtigungen">
            <Icon n="bell" s={18} />
            <span className="ce-dot" />
          </button>
        </div>

        {/* Hero */}
        <div className="ce-hero">
          <div className="ce-hero-title">
            Ihr B2B-Versand
            <span className="ce-accent">auf einem Blick.</span>
          </div>
          <p className="ce-hero-sub">
            Verwalten Sie alle Ihre Sendungen, vergleichen Sie Carrier-Preise und behalten
            Sie Ihre Rechnungen im Überblick – alles an einem Ort.
          </p>
        </div>

        {loading ? (
          <div className="ce-loading">
            <div className="ce-spinner" />
          </div>
        ) : (
          <>
            {/* KPI Stats */}
            <div className="ce-kpi-grid">
              <div className="ce-stat ce-card">
                <div className="ce-stat-top">
                  <span className="ce-stat-label">Sendungen gesamt</span>
                  <div className="ce-stat-ico"><Icon n="package" s={18} /></div>
                </div>
                <div className="ce-stat-value">
                  {shipments.length}
                  <span className="ce-delta up">+12%</span>
                </div>
                <div className="ce-stat-foot">Sendungen insgesamt</div>
              </div>

              <div className="ce-stat ce-card">
                <div className="ce-stat-top">
                  <span className="ce-stat-label">Unterwegs</span>
                  <div className="ce-stat-ico"><Icon n="truck" s={18} /></div>
                </div>
                <div className="ce-stat-value">
                  {inTransit}
                  <span className="ce-delta up">+8%</span>
                </div>
                <div className="ce-stat-foot">Aktiv in Zustellung</div>
              </div>

              <div className="ce-stat ce-card">
                <div className="ce-stat-top">
                  <span className="ce-stat-label">Offene Rechnungen</span>
                  <div className="ce-stat-ico"><Icon n="invoice" s={18} /></div>
                </div>
                <div className="ce-stat-value">{unpaid.length}</div>
                <div className="ce-stat-foot">
                  {unpaid.length > 0 ? `${money(unpaidAmt)} ausstehend` : "Alle Rechnungen bezahlt"}
                </div>
              </div>

              <div className="ce-stat ce-card">
                <div className="ce-stat-top">
                  <span className="ce-stat-label">Ø Laufzeit</span>
                  <div className="ce-stat-ico"><Icon n="clock" s={18} /></div>
                </div>
                <div className="ce-stat-value">
                  2,4
                  <span style={{ fontSize: 16, fontWeight: 500, color: "var(--ce-ink-3)" }}>Tage</span>
                </div>
                <div className="ce-stat-foot">Durchschnittliche Zustellzeit</div>
              </div>
            </div>

            {/* Recent Shipments */}
            <div className="ce-section">
              <div className="ce-card ce-table-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span className="ce-section-title">Letzte Sendungen</span>
                  {shipments.length > 0 && (
                    <button className="ce-link-btn" onClick={onAllShipments}>
                      Alle anzeigen <Icon n="chevronRight" s={16} />
                    </button>
                  )}
                </div>

                <div className="ce-table-wrap">
                  {shipments.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "48px 0 32px", color: "var(--ce-ink-4)" }}>
                      <Icon n="package" s={40} c="var(--ce-ink-4)" />
                      <p style={{ marginTop: 16, fontSize: 15, color: "var(--ce-ink-3)" }}>Noch keine Sendungen vorhanden</p>
                      <button className="ce-link-btn" style={{ marginTop: 14, justifyContent: "center", width: "100%" }} onClick={onNewShipment}>
                        Erste Sendung erstellen <Icon n="chevronRight" s={16} />
                      </button>
                    </div>
                  ) : (
                    <table className="ce-table">
                      <thead>
                        <tr>
                          <th>Tracking-Nr.</th>
                          <th>Carrier</th>
                          <th>Preis</th>
                          <th>Status</th>
                          <th>Datum</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {shipments.slice(0, 5).map((s) => (
                          <tr key={s.id} onClick={onAllShipments}>
                            <td className="ce-track-id">{s.jumingo_shipment_id || s.id || "—"}</td>
                            <td className="ce-carrier">{s.selected_carrier || "—"}</td>
                            <td style={{ fontWeight: 600, color: "var(--ce-ink-1)" }}>{money(s.price_final)}</td>
                            <td><StatusBadge status={s.status} /></td>
                            <td className="ce-date">{dateDE(s.created_at)}</td>
                            <td className="ce-chev"><Icon n="chevronRight" s={16} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* 3-Step Guide */}
            <div className="ce-section">
              <div className="ce-card ce-steps-card">
                <div className="ce-section-title">So einfach geht's</div>
                <div className="ce-steps-grid">
                  {STEPS.map((step, i) => (
                    <div className="ce-step" key={i}>
                      {i < STEPS.length - 1 && <div className="ce-step-connector" />}
                      <div className="ce-step-num">{i + 1}</div>
                      <div className="ce-step-body">
                        <div className="ce-step-ico">
                          <Icon n={step.icon} s={24} />
                        </div>
                        <div className="ce-step-title">{step.title}</div>
                        <p className="ce-step-desc">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Carrier Network */}
            <div className="ce-section">
              <div className="ce-card ce-carriers-card">
                <div className="ce-section-title">Unser Carrier-Netzwerk</div>
                <div className="ce-carriers-grid">
                  {CARRIERS.map((c) => (
                    <div className="ce-carrier-tile" key={c.name}>
                      {c.logo
                        ? <img src={c.logo} alt={c.name} className="ce-carrier-logo-img" />
                        : <span className="ce-carrier-fallback" style={{ color: c.accentColor }}>{c.name}</span>
                      }
                    </div>
                  ))}
                </div>
                <p className="ce-carriers-note">
                  Vergleichen Sie automatisch Preise und Laufzeiten von {CARRIERS.length} führenden
                  Carriern und wählen Sie das beste Angebot für Ihre Sendung.
                </p>
              </div>
            </div>
          </>
        )}

        <DashboardFooter />
      </div>
    </div>
  );
}
