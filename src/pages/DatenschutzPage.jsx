import React from "react";

const SECTION_STYLE = { marginBottom: 32 };
const H2_STYLE = { fontSize: 16, fontWeight: 600, marginBottom: 10, marginTop: 0, color: "var(--text, #111827)", fontFamily: "var(--ce-font-sans)" };
const H3_STYLE = { fontSize: 14, fontWeight: 600, marginBottom: 6, marginTop: 16, color: "var(--text, #1f2937)" };
const P_STYLE  = { lineHeight: 1.75, margin: "0 0 10px 0", color: "var(--text-muted, #374151)", fontSize: 14 };
const P_LAST   = { lineHeight: 1.75, margin: 0, color: "var(--text-muted, #374151)", fontSize: 14 };
const HR_STYLE = { border: "none", borderTop: "1px solid var(--border, #e5e7eb)", margin: "28px 0" };
const TOC_LINK = { color: "var(--blue, #1D4ED8)", textDecoration: "none", fontSize: 14, lineHeight: 1.9, display: "block" };
// Literal statt App-Token (--ce-font-numeric): Legal-Seiten bleiben bewusst
// von den App-Token-Systemen isoliert (siehe CLAUDE.md). Generisches
// "monospace" ist browser-/betriebssystemabhängig und kann je nach
// aufgelöster Schrift eine abweichende Nullform zeigen; hier stehen ohnehin
// nur Bezeichner (sessionStorage, localStorage, ce_token), keine Ziffern —
// die bereits lokal geladene DM Sans ersetzt es trotzdem konsequent.
const CODE_STYLE = { fontFamily: "'DM Sans', sans-serif", fontSize: 13 };

const DL_STYLE = { margin: 0 };
const DT_STYLE = { fontWeight: 600, fontSize: 13, color: "var(--text, #111827)", paddingTop: 10, paddingBottom: 2 };
const DD_STYLE = { margin: "0 0 4px 0", fontSize: 13, color: "var(--text-muted, #374151)", lineHeight: 1.65, paddingBottom: 10, borderBottom: "1px solid var(--border, #e5e7eb)" };
const DD_LAST  = { margin: 0, fontSize: 13, color: "var(--text-muted, #374151)", lineHeight: 1.65, paddingBottom: 0 };

const TOC = [
  [1,  "Verantwortlicher"],
  [2,  "Allgemeine Hinweise zur Datenverarbeitung"],
  [3,  "Hosting und Infrastruktur (Hetzner)"],
  [4,  "Registrierung und Benutzerkonto"],
  [5,  "Login und Authentifizierung"],
  [6,  "Passwort-Reset"],
  [7,  "Preisabfrage und Versandangebote"],
  [8,  "Versandbuchungen über Jumingo"],
  [9,  "Sendungsverfolgung"],
  [10, "Rechnungs- und Geschäftsdaten"],
  [11, "E-Mail-Kommunikation (Resend)"],
  [12, "Cookies und lokale Speichertechnologien"],
  [13, "Schriftarten"],
  [14, "Auftragsverarbeiter"],
  [15, "Speicherdauern im Überblick"],
  [16, "Ihre Rechte als betroffene Person"],
  [17, "Beschwerderecht bei der Aufsichtsbehörde"],
  [18, "Änderungen dieser Datenschutzerklärung"],
];

export default function DatenschutzPage() {
  return (
    <div className="page-with-navbar">
      <div className="container" style={{ maxWidth: 720, padding: "40px 16px 80px" }}>
        <h1 className="heading mb-24">Datenschutzerklärung</h1>
        <div className="calc-panel">
          <div className="calc-panel-body" style={{ lineHeight: 1.75 }}>

            {/* ── Stand ── */}
            <p style={{ ...P_STYLE, color: "var(--gray400, #94a3b8)", fontSize: 13, marginBottom: 24 }}>
              Stand: Juli 2026
            </p>

            {/* ── Inhaltsverzeichnis ── */}
            <div style={{ background: "var(--gray50, #f5f7fa)", borderRadius: 8, padding: "16px 20px", marginBottom: 32 }}>
              <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--navy, #0B1F4D)" }}>
                Inhaltsverzeichnis
              </p>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {TOC.map(([n, label]) => (
                  <li key={n} style={{ lineHeight: 1.9 }}>
                    <a href={`#abschnitt-${n}`} style={TOC_LINK}>{n}. {label}</a>
                  </li>
                ))}
              </ol>
            </div>

            {/* ── 1. Verantwortlicher ── */}
            <div id="abschnitt-1" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>1. Verantwortlicher</h2>
              <p style={P_STYLE}>
                Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) und des
                Bundesdatenschutzgesetzes (BDSG) ist:
              </p>
              <p style={P_STYLE}>
                <strong>Confidara Express GbR</strong><br />
                Weiherstraße 25<br />
                73207 Plochingen<br />
                Deutschland
              </p>
              <p style={P_STYLE}>
                Vertreten durch die Gesellschafter: Miguel Vance und Patrick Werner
              </p>
              <p style={P_LAST}>
                <strong>Kontakt in Datenschutzangelegenheiten:</strong><br />
                E-Mail:{" "}
                <a href="mailto:support@confidaraexpress.de" style={{ color: "var(--blue, #1D4ED8)" }}>
                  support@confidaraexpress.de
                </a>
                <br />
                Telefon: 015118003775
              </p>
              <p style={{ ...P_LAST, marginTop: 10 }}>
                Wir haben keinen gesetzlich verpflichtenden Datenschutzbeauftragten bestellt. Für alle
                datenschutzbezogenen Anfragen wenden Sie sich bitte direkt an die oben genannte
                Kontaktadresse.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 2. Allgemeine Hinweise ── */}
            <div id="abschnitt-2" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>2. Allgemeine Hinweise zur Datenverarbeitung</h2>

              <h3 style={H3_STYLE}>2.1 Grundsätze</h3>
              <p style={P_STYLE}>
                Wir verarbeiten personenbezogene Daten ausschließlich auf Grundlage der geltenden
                datenschutzrechtlichen Vorschriften, insbesondere der Datenschutz-Grundverordnung (DSGVO)
                und des Bundesdatenschutzgesetzes (BDSG). Diese Datenschutzerklärung informiert Sie
                darüber, welche Daten wir erheben, zu welchem Zweck und auf welcher Rechtsgrundlage.
              </p>
              <p style={P_STYLE}>
                Confidara Express ist eine B2B-Plattform, die ausschließlich Unternehmen und deren
                bevollmächtigten Mitarbeitern zugänglich ist. Die Plattform dient dem Vergleich und der
                Buchung von Versanddienstleistungen.
              </p>

              <h3 style={H3_STYLE}>2.2 Technische Maßnahmen</h3>
              <p style={P_STYLE}>
                Die Übertragung aller Daten zwischen Ihrem Browser und unseren Systemen erfolgt
                ausschließlich verschlüsselt über HTTPS (TLS). Wir setzen keine Cookies ein. Eine
                Weitergabe personenbezogener Daten an Dritte erfolgt ausschließlich im Rahmen der in
                dieser Erklärung beschriebenen Verarbeitungszwecke.
              </p>

              <h3 style={H3_STYLE}>2.3 Kein Einsatz von Werbe- und Analyse-Tracking</h3>
              <p style={P_LAST}>
                Wir setzen keinerlei Werbe- oder Analyse-Tracking ein. Auf dieser Plattform findet keine
                Webanalyse statt; es kommen keine Marketing-Pixel, kein Session-Recording und keine
                Heatmaps zum Einsatz. Es sind weder Google Analytics, Google Ads, Meta Pixel, Matomo,
                Hotjar, Microsoft Clarity noch vergleichbare Tools oder externe Tracking-Skripte
                eingebunden.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 3. Hosting ── */}
            <div id="abschnitt-3" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>3. Hosting und Infrastruktur (Hetzner)</h2>
              <p style={P_STYLE}>
                Unsere Plattform und das Backend-System werden auf Servern der{" "}
                <strong>Hetzner Online GmbH</strong>, Industriestr. 25, 91710 Gunzenhausen,
                Deutschland, betrieben. Die Serverstandorte befinden sich in Deutschland bzw. der
                Europäischen Union. Eine Übertragung in Länder außerhalb der EU findet durch Hetzner
                nicht statt.
              </p>
              <p style={P_STYLE}>
                Hetzner verarbeitet als Auftragsverarbeiter im Sinne von Art. 28 DSGVO die auf unseren
                Servern gespeicherten Daten. Mit Hetzner besteht ein Auftragsverarbeitungsvertrag (AVV).
              </p>
              <p style={P_STYLE}>
                Bei jedem Zugriff auf unsere Plattform werden technisch bedingt folgende Daten
                automatisch in Server-Logfiles gespeichert:
              </p>
              <ul style={{ paddingLeft: 20, margin: "0 0 10px 0", color: "var(--text-muted, #374151)", fontSize: 14, lineHeight: 1.9 }}>
                <li>IP-Adresse des zugreifenden Geräts</li>
                <li>Datum und Uhrzeit des Zugriffs</li>
                <li>Aufgerufene URL</li>
                <li>HTTP-Statuscode</li>
                <li>Übertragene Datenmenge</li>
                <li>Browsertyp und Betriebssystem (User-Agent)</li>
              </ul>
              <p style={P_LAST}>
                Diese Daten werden ausschließlich zur Sicherstellung des Betriebs, zur Fehlerbehebung
                und zur Abwehr von Angriffen verarbeitet. Die Logfiles werden nach spätestens 30 Tagen
                gelöscht, sofern kein konkreter Sicherheitsvorfall eine längere Aufbewahrung erfordert.
                <br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung),
                Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an sicherem Plattformbetrieb),
                Art. 28 DSGVO (Auftragsverarbeitung).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 4. Registrierung ── */}
            <div id="abschnitt-4" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>4. Registrierung und Benutzerkonto</h2>

              <h3 style={H3_STYLE}>4.1 Erfasste Daten</h3>
              <p style={P_STYLE}>
                ConfidaraExpress richtet sich ausschließlich an Unternehmen und Geschäftskunden; eine
                Registrierung als Privatperson ist nicht vorgesehen. Zur Nutzung der Plattform ist eine
                Registrierung als Firmenkonto erforderlich. Dabei erheben wir:
              </p>
              <p style={P_STYLE}>
                <strong>Pflichtfelder:</strong> Firmenname, Vor- und Nachname der ansprechbaren Person
                im Unternehmen, geschäftliche E-Mail-Adresse sowie ein Passwort als Zugangsdaten
              </p>
              <p style={P_STYLE}>
                <strong>Optionale Felder:</strong> Umsatzsteuer-Identifikationsnummer, Straße und
                Hausnummer, Postleitzahl, Stadt, Land
              </p>

              <h3 style={H3_STYLE}>4.2 Zweck und Verfahren</h3>
              <p style={P_STYLE}>
                Nach Einreichung der Registrierung wird Ihr Firmenkonto manuell durch uns geprüft und
                freigeschaltet. Die Prüfung dient auch der Feststellung, dass die Registrierung für ein
                Unternehmen erfolgt. Sie erhalten nach erfolgreicher Freischaltung eine Benachrichtigung
                per E-Mail. Bis zur Freischaltung sind keine Plattformfunktionen nutzbar.
              </p>
              <p style={P_STYLE}>
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung und
                -erfüllung).
              </p>

              <h3 style={H3_STYLE}>4.3 Speicherdauer</h3>
              <p style={P_LAST}>
                Ihr Nutzerkonto und die zugehörigen Stammdaten werden nach Beendigung des
                Vertragsverhältnisses für <strong>12 Monate</strong> gespeichert und anschließend
                vollständig gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
                Abgelehnte oder nicht freigeschaltete Registrierungsanfragen werden nach{" "}
                <strong>6 Monaten</strong> gelöscht.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 5. Login ── */}
            <div id="abschnitt-5" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>5. Login und Authentifizierung</h2>

              <h3 style={H3_STYLE}>5.1 Anmeldevorgang</h3>
              <p style={P_STYLE}>
                Bei der Anmeldung an der Plattform übermitteln Sie Ihre E-Mail-Adresse und Ihr Passwort
                an unsere Server. Die Übertragung erfolgt ausschließlich verschlüsselt über HTTPS. Ihr
                Passwort wird auf unseren Servern nicht im Klartext gespeichert.
              </p>

              <h3 style={H3_STYLE}>5.2 Option „30 Tage angemeldet bleiben"</h3>
              <p style={P_LAST}>
                Die Plattform bietet die Option, die Sitzung für 30 Tage aktiv zu halten. Diese Auswahl
                wird im Rahmen des Anmeldevorgangs an unsere Server übermittelt und bestimmt die
                Gültigkeitsdauer des ausgestellten Authentifizierungstokens.
                <br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 6. Passwort-Reset ── */}
            <div id="abschnitt-6" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>6. Passwort-Reset</h2>
              <p style={P_LAST}>
                Wenn Sie Ihr Passwort vergessen haben, können Sie über die entsprechende Funktion einen
                Passwort-Reset beantragen. Hierzu wird Ihre E-Mail-Adresse an unsere Server übermittelt.
                Wir senden Ihnen anschließend einen individuellen, zeitlich begrenzten Reset-Link an die
                hinterlegte E-Mail-Adresse. Der Versand erfolgt über den E-Mail-Dienstleister Resend
                (siehe Abschnitt 11).
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung /
                Kontoabsicherung).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 7. Preisabfrage ── */}
            <div id="abschnitt-7" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>7. Preisabfrage und Versandangebote</h2>

              <h3 style={H3_STYLE}>7.1 Erfasste Daten</h3>
              <p style={P_STYLE}>
                Zur Berechnung von Versandpreisen erheben wir: Absender-Postleitzahl und Land,
                Empfänger-Postleitzahl und Land, Gewicht und Maße der Sendung sowie die gewünschte
                Versandart.
              </p>
              <p style={P_STYLE}>
                Im Bereich „Neue Sendung" können darüber hinaus vollständige Adressdaten von Absender
                und Empfänger (Name, Firma, Straße, Adresszusatz, PLZ, Stadt, Land, E-Mail, Telefon)
                eingegeben werden. Diese werden im Rahmen der Preisabfrage an unsere Backend-Systeme
                übermittelt.
              </p>

              <h3 style={H3_STYLE}>7.2 Weitergabe an Jumingo</h3>
              <p style={P_LAST}>
                Zur Ermittlung der Versandpreise werden die oben genannten Daten über unser Backend an
                den Versanddienstleister Jumingo weitergeleitet (siehe Abschnitt 8 und 14). Mit Jumingo
                besteht ein Auftragsverarbeitungsvertrag.
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 8. Versandbuchungen ── */}
            <div id="abschnitt-8" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>8. Versandbuchungen über Jumingo</h2>

              <h3 style={H3_STYLE}>8.1 Erfasste und übermittelte Daten</h3>
              <p style={P_STYLE}>
                Bei der Buchung einer Sendung werden folgende Daten verarbeitet:
              </p>
              <p style={P_STYLE}>
                <strong>Absenderdaten:</strong> Name, Firmenname (optional), Straße und Hausnummer,
                Adresszusatz (optional), Postleitzahl, Stadt, Land, E-Mail-Adresse (optional),
                Telefonnummer (optional)
              </p>
              <p style={P_STYLE}>
                <strong>Empfängerdaten:</strong> Dieselben Felder wie beim Absender
              </p>
              <p style={P_STYLE}>
                <strong>Sendungsdaten:</strong> Sendungsinhalt (optional), Gewicht, ausgewählter
                Carrier, Tarif, Netto- und Bruttopreis
              </p>

              <h3 style={H3_STYLE}>8.2 Verarbeitung von Drittdaten (Empfängerdaten)</h3>
              <p style={P_STYLE}>
                Die Empfängerdaten betreffen in der Regel Personen, die nicht selbst Nutzer dieser
                Plattform sind. Als Versender sind Sie dafür verantwortlich, sicherzustellen, dass die
                Übermittlung dieser Daten an uns und die nachgelagerten Dienstleister auf einer
                geeigneten Rechtsgrundlage beruht — beispielsweise auf der Einwilligung der betroffenen
                Person oder auf einem berechtigten Interesse im Rahmen der Geschäftsbeziehung.
              </p>

              <h3 style={H3_STYLE}>8.3 Weitergabe an Jumingo</h3>
              <p style={P_STYLE}>
                Alle buchungsrelevanten Daten werden über unser Backend an Jumingo übermittelt. Jumingo
                erstellt auf dieser Grundlage das Versanddokument (Label) und leitet den Auftrag an den
                jeweiligen Carrier weiter. Mit Jumingo besteht ein Auftragsverarbeitungsvertrag gemäß
                Art. 28 DSGVO.
              </p>

              <h3 style={H3_STYLE}>8.4 Buchungsbestätigung</h3>
              <p style={P_LAST}>
                Nach erfolgreicher Buchung erhalten Sie eine Bestätigungs-E-Mail an Ihre hinterlegte
                E-Mail-Adresse. Der Versand erfolgt über Resend (siehe Abschnitt 11).
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 9. Sendungsverfolgung ── */}
            <div id="abschnitt-9" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>9. Sendungsverfolgung</h2>

              <h3 style={H3_STYLE}>9.1 Sendungsverfolgung im Kundenkonto</h3>
              <p style={P_STYLE}>
                Innerhalb Ihres Kundenkontos können Sie den Status Ihrer gebuchten Sendungen verfolgen.
                Tracking-Daten werden von Jumingo über unsere Backend-Schnittstelle abgerufen.
                Verarbeitet werden Sendungs-ID, Tracking-Ereignisse (Zeitstempel, Standort,
                Statusmeldung) sowie Carrier-Informationen.
                <br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
              </p>

              <h3 style={H3_STYLE}>9.2 Öffentliche Sendungsverfolgung</h3>
              <p style={P_LAST}>
                Über den öffentlichen Bereich unserer Plattform können Sendungen anhand ihrer
                Sendungs-ID ohne Login abgerufen werden. Dies entspricht dem branchenüblichen Standard
                bei Versanddienstleistern. Jede Person, die im Besitz einer gültigen Sendungs-ID ist,
                kann die zugehörigen Tracking-Informationen einsehen.
                <br /><br />
                Wir weisen darauf hin, dass in diesem Bereich keinerlei Authentifizierung stattfindet.
                Bitte geben Sie Sendungs-IDs nur an berechtigte Personen weiter.
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung /
                berechtigtes Interesse).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 10. Rechnungsdaten ── */}
            <div id="abschnitt-10" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>10. Rechnungs- und Geschäftsdaten</h2>
              <p style={P_STYLE}>
                Im Rahmen der Buchungsabwicklung werden Rechnungen erstellt, die folgende Daten
                enthalten: Firmenname und Adresse des Auftraggebers, Umsatzsteuer-Identifikationsnummer
                (sofern angegeben), Rechnungsnummer, Rechnungsbetrag, Fälligkeitsdatum sowie
                Buchungsdetails (Carrier, Sendungsgewicht, Tarif).
              </p>
              <p style={P_LAST}>
                Diese Daten sind nach § 147 Abs. 1 AO (Abgabenordnung) für einen Zeitraum von{" "}
                <strong>10 Jahren</strong> aufzubewahren. Die Verarbeitung nach Beendigung des
                Vertragsverhältnisses erfolgt ausschließlich zur Erfüllung dieser gesetzlichen
                Aufbewahrungspflicht. Rechnungsdaten werden nach Ablauf der Aufbewahrungsfrist
                vollständig gelöscht.
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. c DSGVO (gesetzliche
                Verpflichtung).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 11. E-Mail / Resend ── */}
            <div id="abschnitt-11" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>11. E-Mail-Kommunikation (Resend)</h2>

              <h3 style={H3_STYLE}>11.1 Art der E-Mails</h3>
              <p style={P_STYLE}>
                Wir versenden ausschließlich transaktionale E-Mails, d.h. Nachrichten, die in direktem
                Zusammenhang mit Ihrer Nutzung der Plattform stehen:
              </p>
              <ul style={{ paddingLeft: 20, margin: "0 0 10px 0", color: "var(--text-muted, #374151)", fontSize: 14, lineHeight: 1.9 }}>
                <li>Buchungsbestätigungen</li>
                <li>Passwort-Reset-Links</li>
                <li>Systembenachrichtigungen (z.B. Kontofreischaltung)</li>
              </ul>
              <p style={P_STYLE}>Wir versenden keine Werbe-E-Mails und keinen Newsletter.</p>

              <h3 style={H3_STYLE}>11.2 Dienstleister Resend</h3>
              <p style={P_LAST}>
                Der E-Mail-Versand erfolgt über den Dienst <strong>Resend</strong> (Resend Inc.,
                San Francisco, CA, USA). Beim Versand werden Ihre E-Mail-Adresse sowie der E-Mail-Inhalt
                an Resend übertragen. Mit Resend besteht ein Datenverarbeitungsvertrag (DPA) gemäß
                Art. 28 DSGVO. Resend verarbeitet Daten auf Grundlage von Standardvertragsklauseln
                (SCCs) gemäß Art. 46 Abs. 2 lit. c DSGVO für den Datentransfer in die USA.
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung),
                Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an zuverlässiger
                Systemkommunikation).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 12. Cookies und lokale Speichertechnologien ── */}
            <div id="abschnitt-12" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>12. Cookies und lokale Speichertechnologien</h2>

              <h3 style={H3_STYLE}>12.1 Keine Cookies</h3>
              <p style={P_STYLE}>
                ConfidaraExpress setzt derzeit keine Cookies ein — weder technisch notwendige noch
                Analyse-, Marketing- oder Tracking-Cookies. Ebenso wird kein{" "}
                <code style={CODE_STYLE}>sessionStorage</code> verwendet.
                Da keine Cookies gesetzt werden, wird kein Cookie-Banner angezeigt.
              </p>

              <h3 style={H3_STYLE}>12.2 Technisch notwendige Speicherung im localStorage (Login)</h3>
              <p style={P_STYLE}>
                Für den Login wird eine technisch notwendige Speicherung im{" "}
                <code style={CODE_STYLE}>localStorage</code> Ihres
                Browsers verwendet. Nach erfolgreicher Anmeldung wird dort ein Authentifizierungstoken
                (JSON Web Token, kurz JWT) abgelegt.
              </p>
              <p style={P_STYLE}>
                <strong>Schlüssel:</strong>{" "}
                <code style={CODE_STYLE}>ce_token</code><br />
                <strong>Inhalt:</strong> JWT mit einer Konto-Kennung (ID), Ihrer E-Mail-Adresse und
                Ihrer Rolle<br />
                <strong>Zweck:</strong> Authentifizierung und Aufrechterhaltung der Login-Sitzung
              </p>
              <p style={P_STYLE}>
                Ohne diese Speicherung kann der Login bzw. der Kundenbereich nicht zuverlässig
                funktionieren. Der Token wird ausschließlich zur Authentifizierung gegenüber unseren
                Backend-Systemen verwendet; bei der Abmeldung wird er aus dem Browser entfernt.
              </p>
              <p style={P_LAST}>
                <code style={CODE_STYLE}>localStorage</code> ist kein
                Cookie im technischen Sinne und unterliegt nicht den Cookie-Regelungen der
                ePrivacy-Richtlinie. Eine Einwilligung ist für diese technisch notwendige Speicherung
                nicht erforderlich. Es werden keine Analyse-, Marketing- oder Tracking-Technologien in
                der lokalen Speicherung abgelegt.
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (technisch notwendig für
                die Vertragserfüllung).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 13. Schriftarten ── */}
            <div id="abschnitt-13" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>13. Schriftarten</h2>
              <p style={P_STYLE}>
                Die auf unserer Plattform verwendeten Schriftarten (u. a. <em>Cormorant Garamond</em>,{" "}
                <em>Libre Franklin</em> und <em>DM Sans</em>) werden lokal von unserem eigenen Server
                ausgeliefert. Die Schriftdateien sind Bestandteil unserer Anwendung und werden von
                derselben Domain geladen wie die übrige Plattform.
              </p>
              <p style={P_LAST}>
                Beim Aufruf der Plattform wird <strong>keine Verbindung zu Google Fonts oder anderen
                externen Anbietern</strong> hergestellt, um Schriftarten zu laden. Zu diesem Zweck
                werden keine Daten — insbesondere nicht Ihre IP-Adresse — an Dritte übertragen.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 14. Auftragsverarbeiter ── */}
            <div id="abschnitt-14" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>14. Auftragsverarbeiter</h2>
              <p style={P_STYLE}>
                Wir setzen folgende Auftragsverarbeiter ein, mit denen Verträge gemäß Art. 28 DSGVO
                geschlossen wurden oder werden:
              </p>
              <dl style={DL_STYLE}>
                <dt style={DT_STYLE}>Hetzner Online GmbH</dt>
                <dd style={DD_STYLE}>
                  Funktion: Hosting, Server-Infrastruktur · Standort: Deutschland (EU)
                </dd>
                <dt style={DT_STYLE}>Jumingo</dt>
                <dd style={DD_STYLE}>
                  Funktion: Versandabwicklung, Preisabfrage, Label-Erstellung, Tracking ·
                  Standort: gemäß Jumingo-Vertrag
                </dd>
                <dt style={DT_STYLE}>Resend Inc.</dt>
                <dd style={DD_LAST}>
                  Funktion: Transaktionaler E-Mail-Versand · Standort: USA (Standardvertragsklauseln
                  vorhanden)
                </dd>
              </dl>
              <p style={{ ...P_STYLE, marginTop: 12 }}>
                Alle genannten Auftragsverarbeiter sind vertraglich dazu verpflichtet, personenbezogene
                Daten ausschließlich nach unserer Weisung und gemäß den Anforderungen der DSGVO zu
                verarbeiten.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 15. Speicherdauern ── */}
            <div id="abschnitt-15" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>15. Speicherdauern im Überblick</h2>
              <dl style={DL_STYLE}>
                <dt style={DT_STYLE}>Nutzerkonto und Stammdaten</dt>
                <dd style={DD_STYLE}>
                  12 Monate nach Vertragsende · Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
                </dd>
                <dt style={DT_STYLE}>Abgelehnte / nicht freigeschaltete Registrierungen</dt>
                <dd style={DD_STYLE}>
                  6 Monate nach Ablehnung · Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO
                </dd>
                <dt style={DT_STYLE}>Rechnungsdaten und Buchungsbelege</dt>
                <dd style={DD_STYLE}>
                  10 Jahre (§ 147 AO) · Rechtsgrundlage: Art. 6 Abs. 1 lit. c DSGVO
                </dd>
                <dt style={DT_STYLE}>Versanddaten (gebuchte Sendungen)</dt>
                <dd style={DD_STYLE}>
                  Bis zu 6 Jahre nach Buchung (§ 257 HGB) oder 12 Monate nach Vertragsende ·
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. c / b DSGVO
                </dd>
                <dt style={DT_STYLE}>Server-Logfiles (Zugriffsdaten)</dt>
                <dd style={DD_STYLE}>
                  Max. 30 Tage · Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO
                </dd>
                <dt style={DT_STYLE}>Passwort-Reset-Token</dt>
                <dd style={DD_STYLE}>
                  Sofort nach Verwendung oder Ablauf der Gültigkeitsdauer ·
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
                </dd>
                <dt style={DT_STYLE}>JWT-Token (localStorage)</dt>
                <dd style={DD_LAST}>
                  Bis zur Abmeldung oder Ablauf der Token-Gültigkeit ·
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
                </dd>
              </dl>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 16. Betroffenenrechte ── */}
            <div id="abschnitt-16" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>16. Ihre Rechte als betroffene Person</h2>
              <p style={P_STYLE}>
                Sie haben gegenüber uns folgende Rechte hinsichtlich Ihrer personenbezogenen Daten:
              </p>

              <h3 style={H3_STYLE}>Recht auf Auskunft (Art. 15 DSGVO)</h3>
              <p style={P_STYLE}>
                Sie haben das Recht, Auskunft über die von uns verarbeiteten personenbezogenen Daten,
                deren Herkunft, Empfänger und den Zweck der Verarbeitung zu erhalten.
              </p>

              <h3 style={H3_STYLE}>Recht auf Berichtigung (Art. 16 DSGVO)</h3>
              <p style={P_STYLE}>
                Sie haben das Recht, die Berichtigung unrichtiger oder die Vervollständigung
                unvollständiger Daten zu verlangen. Viele Stammdaten können Sie direkt über die
                Profilverwaltung in Ihrem Kundenkonto aktualisieren.
              </p>

              <h3 style={H3_STYLE}>Recht auf Löschung (Art. 17 DSGVO)</h3>
              <p style={P_STYLE}>
                Sie haben das Recht, die Löschung Ihrer personenbezogenen Daten zu verlangen, sofern
                keine gesetzlichen Aufbewahrungspflichten oder sonstige Gründe der Löschung
                entgegenstehen.
              </p>

              <h3 style={H3_STYLE}>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</h3>
              <p style={P_STYLE}>
                Sie haben das Recht, die Einschränkung der Verarbeitung Ihrer personenbezogenen Daten
                zu verlangen, sofern die Voraussetzungen des Art. 18 DSGVO vorliegen.
              </p>

              <h3 style={H3_STYLE}>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</h3>
              <p style={P_STYLE}>
                Sie haben das Recht, die Sie betreffenden personenbezogenen Daten in einem
                strukturierten, gängigen und maschinenlesbaren Format zu erhalten, sofern die
                Verarbeitung auf einem Vertrag beruht und mithilfe automatisierter Verfahren erfolgt.
              </p>

              <h3 style={H3_STYLE}>Widerspruchsrecht (Art. 21 DSGVO)</h3>
              <p style={P_STYLE}>
                Soweit wir personenbezogene Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO
                (berechtigtes Interesse) verarbeiten, haben Sie das Recht, aus Gründen, die sich aus
                Ihrer besonderen Situation ergeben, jederzeit Widerspruch einzulegen.
              </p>

              <h3 style={H3_STYLE}>Recht auf Widerruf einer Einwilligung (Art. 7 Abs. 3 DSGVO)</h3>
              <p style={P_STYLE}>
                Soweit die Verarbeitung auf Ihrer Einwilligung beruht, können Sie diese jederzeit mit
                Wirkung für die Zukunft widerrufen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten
                Verarbeitung bleibt davon unberührt.
              </p>

              <p style={P_LAST}>
                Zur Ausübung Ihrer Rechte wenden Sie sich bitte an:{" "}
                <a href="mailto:support@confidaraexpress.de" style={{ color: "var(--blue, #1D4ED8)" }}>
                  support@confidaraexpress.de
                </a>
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 17. Beschwerderecht ── */}
            <div id="abschnitt-17" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>17. Beschwerderecht bei der Aufsichtsbehörde</h2>
              <p style={P_STYLE}>
                Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung
                Ihrer personenbezogenen Daten zu beschweren (Art. 77 DSGVO). Für Confidara Express GbR
                mit Sitz in Plochingen, Baden-Württemberg, ist die zuständige Aufsichtsbehörde:
              </p>
              <p style={P_LAST}>
                <strong>Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit
                Baden-Württemberg (LfDI BW)</strong><br />
                Lautenschlagerstraße 20<br />
                70173 Stuttgart<br />
                Telefon: +49 711 615541-0<br />
                E-Mail:{" "}
                <a href="mailto:poststelle@lfdi.bwl.de" style={{ color: "var(--blue, #1D4ED8)" }}>
                  poststelle@lfdi.bwl.de
                </a>
                <br />
                Website:{" "}
                <a href="https://www.baden-wuerttemberg.datenschutz.de" target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue, #1D4ED8)", wordBreak: "break-all" }}>
                  www.baden-wuerttemberg.datenschutz.de
                </a>
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── 18. Änderungen ── */}
            <div id="abschnitt-18" style={{ ...SECTION_STYLE, marginBottom: 0 }}>
              <h2 style={H2_STYLE}>18. Änderungen dieser Datenschutzerklärung</h2>
              <p style={P_LAST}>
                Wir behalten uns vor, diese Datenschutzerklärung zu aktualisieren, um sie an geänderte
                Rechtslagen, neue Funktionen der Plattform oder veränderte technische Gegebenheiten
                anzupassen. Die jeweils aktuelle Fassung ist jederzeit unter /datenschutz auf unserer
                Plattform abrufbar.
                <br /><br />
                Bei wesentlichen Änderungen werden registrierte Nutzer über ihre hinterlegte
                E-Mail-Adresse informiert.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
