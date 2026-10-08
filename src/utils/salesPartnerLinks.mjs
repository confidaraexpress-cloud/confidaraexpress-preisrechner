// ── Empfehlungslinks der Partner-Startseite (UX-Paket 3) ─────────────────────
//
// Ein Link gilt nur als einsatzbereit, wenn er tatsächlich wirkt. Der Server
// ordnet einen Kunden nur über einen AKTIVEN, echten Partner zu und nur bei
// eingeschalteter Kundenzuordnung (`referralsEnabled` der öffentlichen
// Konfiguration); einen Bewerber nur bei geöffneter Partnerregistrierung im
// passenden Bereich (echt → produktiv, Testkonto → Pre-Live-Testweg). Ist die
// Konfiguration unbekannt (Laden, Fehler), bleibt der Link nutzbar, aber ohne
// Zusage — die Oberfläche behauptet nichts, was sie nicht weiß. Der technische
// Empfehlungscode erscheint auf der Startseite nicht (Betreiberentscheidung).
//
// Eigenes Modul: es liest die öffentliche Konfiguration (salesPartnerPublicConfig
// → salesPartnerAgreement → salesPartnerView); in salesPartnerView selbst wäre
// das ein Importkreis.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { normalizeOverview } from "./salesPartnerView.mjs";
import { partnerRegistrationMode } from "./salesPartnerPublicConfig.mjs";

export const LINK_TEXTS = Object.freeze({
  title: "Kunden und Partner werben",
  customerTitle: "Kunden werben",
  customerButton: "Kundenlink kopieren",
  customerHint: "Neue Geschäftskunden, die sich über diesen Link registrieren, werden Ihnen zugeordnet.",
  partnerTitle: "Partner werben",
  partnerButton: "Partnerlink kopieren",
  partnerHint: "Wer sich über diesen Link als Vertriebspartner bewirbt, gehört nach der Freigabe zu Ihrem Team.",
  inactive: "Ihre Empfehlungslinks gelten nur bei aktivem Partnerkonto.",
  unavailable: "Dieser Link ist derzeit nicht verfügbar.",
  referralsOff: "Die Zuordnung neuer Kunden über Empfehlungslinks ist derzeit nicht aktiv.",
  registrationClosed: "Die Registrierung für neue Vertriebspartner ist derzeit nicht geöffnet.",
  preliveCustomer: "Testkonto: Über den Kundenlink werden keine Kunden zugeordnet.",
  prelivePartner: "Testkonto: Der Partnerlink wirkt nur im Pre-Live-Testweg der Registrierung, und der ist derzeit nicht geöffnet.",
  firstVisit: "So starten Sie: Teilen Sie Ihren Kundenlink mit Geschäftskunden.",
});

/**
 * Zustand beider Links. `publicConfig` ist das Ergebnis von
 * loadSalesPartnerPublicConfig() ({ ok, config }) oder null, solange es lädt.
 * Ergebnis: { notice } für ein inaktives Konto, sonst { customer, partner } mit
 * je { ready, url, hint } bzw. { ready: false, notice }.
 */
export function partnerLinkStates(overview, publicConfig) {
  const o = overview || normalizeOverview(null);
  if (o.partner.status !== "active") return { notice: LINK_TEXTS.inactive, customer: null, partner: null };
  const cfg = publicConfig && publicConfig.ok === true && publicConfig.config ? publicConfig.config : null;
  const test = o.preliveTest === true;

  let customer;
  if (!o.links.customer) customer = { ready: false, notice: LINK_TEXTS.unavailable };
  else if (test) customer = { ready: false, notice: LINK_TEXTS.preliveCustomer };
  else if (cfg && cfg.referralsEnabled !== true) customer = { ready: false, notice: LINK_TEXTS.referralsOff };
  else customer = { ready: true, url: o.links.customer, hint: cfg ? LINK_TEXTS.customerHint : null };

  // Ein Bewerber kommt nur über einen Sponsor desselben Bereichs ins Team: ein
  // echter Partner im produktiven Weg, ein Testkonto im Pre-Live-Testweg.
  let partner;
  if (!o.links.partner) partner = { ready: false, notice: LINK_TEXTS.unavailable };
  else if (cfg && partnerRegistrationMode(cfg) !== (test ? "prelive_test" : "production")) {
    partner = { ready: false, notice: test ? LINK_TEXTS.prelivePartner : LINK_TEXTS.registrationClosed };
  } else partner = { ready: true, url: o.links.partner, hint: cfg ? LINK_TEXTS.partnerHint : null };

  return { notice: null, customer, partner };
}
