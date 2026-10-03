import React from "react";

/* Rechtsseite im gemeinsamen Leselayout (Redesign 2026-10): Titel und Stand
   auf dem Canvas, der Text auf EINER ruhigen weißen Fläche (layout.css,
   .legal-*). Der Rechtstext selbst ist wortgleich; Anker unverändert. */

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
      <div className="legal-wrap">
        <header className="legal-head">
          <h1 className="legal-title">Datenschutzerklärung</h1>
          {/* ── Stand ── */}
          <p className="legal-stand">
            Stand: Juli 2026
          </p>
        </header>
        <article className="legal-sheet">

            {/* ── Inhaltsverzeichnis ── */}
            <nav className="legal-toc" aria-labelledby="legal-toc-title">
              <p className="legal-toc-title" id="legal-toc-title">
                Inhaltsverzeichnis
              </p>
              {/* Eine Nummerierungsquelle: die Linktexte tragen die Nummer
                  bereits — die Liste zählt nicht noch einmal mit (vorher „1. 1."). */}
              <ol className="legal-toc-list" role="list">
                {TOC.map(([n, label]) => (
                  <li key={n}>
                    <a href={`#abschnitt-${n}`} className="legal-toc-link">{n}. {label}</a>
                  </li>
                ))}
              </ol>
            </nav>

            {/* ── 1. Verantwortlicher ── */}
            <div id="abschnitt-1" className="legal-section">
              <h2 className="legal-h2">1. Verantwortlicher</h2>
              <p className="legal-p">
                Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) und des
                Bundesdatenschutzgesetzes (BDSG) ist:
              </p>
              <p className="legal-p">
                <strong>Confidara Express GbR</strong><br />
                Weiherstraße 25<br />
                73207 Plochingen<br />
                Deutschland
              </p>
              <p className="legal-p">
                Vertreten durch die Gesellschafter: Miguel Vance und Patrick Werner
              </p>
              <p className="legal-p legal-p--last">
                <strong>Kontakt in Datenschutzangelegenheiten:</strong><br />
                E-Mail:{" "}
                <a href="mailto:support@confidaraexpress.de">
                  support@confidaraexpress.de
                </a>
                <br />
                Telefon: 015118003775
              </p>
              <p className="legal-p legal-p--last legal-p--spaced">
                Wir haben keinen gesetzlich verpflichtenden Datenschutzbeauftragten bestellt. Für alle
                datenschutzbezogenen Anfragen wenden Sie sich bitte direkt an die oben genannte
                Kontaktadresse.
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 2. Allgemeine Hinweise ── */}
            <div id="abschnitt-2" className="legal-section">
              <h2 className="legal-h2">2. Allgemeine Hinweise zur Datenverarbeitung</h2>

              <h3 className="legal-h3">2.1 Grundsätze</h3>
              <p className="legal-p">
                Wir verarbeiten personenbezogene Daten ausschließlich auf Grundlage der geltenden
                datenschutzrechtlichen Vorschriften, insbesondere der Datenschutz-Grundverordnung (DSGVO)
                und des Bundesdatenschutzgesetzes (BDSG). Diese Datenschutzerklärung informiert Sie
                darüber, welche Daten wir erheben, zu welchem Zweck und auf welcher Rechtsgrundlage.
              </p>
              <p className="legal-p">
                Confidara Express ist eine B2B-Plattform, die ausschließlich Unternehmen und deren
                bevollmächtigten Mitarbeitern zugänglich ist. Die Plattform dient dem Vergleich und der
                Buchung von Versanddienstleistungen.
              </p>

              <h3 className="legal-h3">2.2 Technische Maßnahmen</h3>
              <p className="legal-p">
                Die Übertragung aller Daten zwischen Ihrem Browser und unseren Systemen erfolgt
                ausschließlich verschlüsselt über HTTPS (TLS). Wir setzen keine Cookies ein. Eine
                Weitergabe personenbezogener Daten an Dritte erfolgt ausschließlich im Rahmen der in
                dieser Erklärung beschriebenen Verarbeitungszwecke.
              </p>

              <h3 className="legal-h3">2.3 Kein Einsatz von Werbe- und Analyse-Tracking</h3>
              <p className="legal-p legal-p--last">
                Wir setzen keinerlei Werbe- oder Analyse-Tracking ein. Auf dieser Plattform findet keine
                Webanalyse statt; es kommen keine Marketing-Pixel, kein Session-Recording und keine
                Heatmaps zum Einsatz. Es sind weder Google Analytics, Google Ads, Meta Pixel, Matomo,
                Hotjar, Microsoft Clarity noch vergleichbare Tools oder externe Tracking-Skripte
                eingebunden.
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 3. Hosting ── */}
            <div id="abschnitt-3" className="legal-section">
              <h2 className="legal-h2">3. Hosting und Infrastruktur (Hetzner)</h2>
              <p className="legal-p">
                Unsere Plattform und das Backend-System werden auf Servern der{" "}
                <strong>Hetzner Online GmbH</strong>, Industriestr. 25, 91710 Gunzenhausen,
                Deutschland, betrieben. Die Serverstandorte befinden sich in Deutschland bzw. der
                Europäischen Union. Eine Übertragung in Länder außerhalb der EU findet durch Hetzner
                nicht statt.
              </p>
              <p className="legal-p">
                Hetzner verarbeitet als Auftragsverarbeiter im Sinne von Art. 28 DSGVO die auf unseren
                Servern gespeicherten Daten. Mit Hetzner besteht ein Auftragsverarbeitungsvertrag (AVV).
              </p>
              <p className="legal-p">
                Bei jedem Zugriff auf unsere Plattform werden technisch bedingt folgende Daten
                automatisch in Server-Logfiles gespeichert:
              </p>
              <ul className="legal-list">
                <li>IP-Adresse des zugreifenden Geräts</li>
                <li>Datum und Uhrzeit des Zugriffs</li>
                <li>Aufgerufene URL</li>
                <li>HTTP-Statuscode</li>
                <li>Übertragene Datenmenge</li>
                <li>Browsertyp und Betriebssystem (User-Agent)</li>
              </ul>
              <p className="legal-p legal-p--last">
                Diese Daten werden ausschließlich zur Sicherstellung des Betriebs, zur Fehlerbehebung
                und zur Abwehr von Angriffen verarbeitet. Die Logfiles werden nach spätestens 30 Tagen
                gelöscht, sofern kein konkreter Sicherheitsvorfall eine längere Aufbewahrung erfordert.
                <br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung),
                Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an sicherem Plattformbetrieb),
                Art. 28 DSGVO (Auftragsverarbeitung).
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 4. Registrierung ── */}
            <div id="abschnitt-4" className="legal-section">
              <h2 className="legal-h2">4. Registrierung und Benutzerkonto</h2>

              <h3 className="legal-h3">4.1 Erfasste Daten</h3>
              <p className="legal-p">
                ConfidaraExpress richtet sich ausschließlich an Unternehmen und Geschäftskunden; eine
                Registrierung als Privatperson ist nicht vorgesehen. Zur Nutzung der Plattform ist eine
                Registrierung als Firmenkonto erforderlich. Dabei erheben wir:
              </p>
              <p className="legal-p">
                <strong>Pflichtfelder:</strong> Firmenname, Vor- und Nachname der ansprechbaren Person
                im Unternehmen, geschäftliche E-Mail-Adresse sowie ein Passwort als Zugangsdaten
              </p>
              <p className="legal-p">
                <strong>Optionale Felder:</strong> Umsatzsteuer-Identifikationsnummer, Straße und
                Hausnummer, Postleitzahl, Stadt, Land
              </p>

              <h3 className="legal-h3">4.2 Zweck und Verfahren</h3>
              <p className="legal-p">
                Nach Einreichung der Registrierung wird Ihr Firmenkonto manuell durch uns geprüft und
                freigeschaltet. Die Prüfung dient auch der Feststellung, dass die Registrierung für ein
                Unternehmen erfolgt. Sie erhalten nach erfolgreicher Freischaltung eine Benachrichtigung
                per E-Mail. Bis zur Freischaltung sind keine Plattformfunktionen nutzbar.
              </p>
              <p className="legal-p">
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung und
                -erfüllung).
              </p>

              <h3 className="legal-h3">4.3 Speicherdauer</h3>
              <p className="legal-p legal-p--last">
                Ihr Nutzerkonto und die zugehörigen Stammdaten werden nach Beendigung des
                Vertragsverhältnisses für <strong>12 Monate</strong> gespeichert und anschließend
                vollständig gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
                Abgelehnte oder nicht freigeschaltete Registrierungsanfragen werden nach{" "}
                <strong>6 Monaten</strong> gelöscht.
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 5. Login ── */}
            <div id="abschnitt-5" className="legal-section">
              <h2 className="legal-h2">5. Login und Authentifizierung</h2>

              <h3 className="legal-h3">5.1 Anmeldevorgang</h3>
              <p className="legal-p">
                Bei der Anmeldung an der Plattform übermitteln Sie Ihre E-Mail-Adresse und Ihr Passwort
                an unsere Server. Die Übertragung erfolgt ausschließlich verschlüsselt über HTTPS. Ihr
                Passwort wird auf unseren Servern nicht im Klartext gespeichert.
              </p>

              <h3 className="legal-h3">5.2 Option „30 Tage angemeldet bleiben"</h3>
              <p className="legal-p legal-p--last">
                Die Plattform bietet die Option, die Sitzung für 30 Tage aktiv zu halten. Diese Auswahl
                wird im Rahmen des Anmeldevorgangs an unsere Server übermittelt und bestimmt die
                Gültigkeitsdauer des ausgestellten Authentifizierungstokens.
                <br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 6. Passwort-Reset ── */}
            <div id="abschnitt-6" className="legal-section">
              <h2 className="legal-h2">6. Passwort-Reset</h2>
              <p className="legal-p legal-p--last">
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

            <hr className="legal-rule" />

            {/* ── 7. Preisabfrage ── */}
            <div id="abschnitt-7" className="legal-section">
              <h2 className="legal-h2">7. Preisabfrage und Versandangebote</h2>

              <h3 className="legal-h3">7.1 Erfasste Daten</h3>
              <p className="legal-p">
                Zur Berechnung von Versandpreisen erheben wir: Absender-Postleitzahl und Land,
                Empfänger-Postleitzahl und Land, Gewicht und Maße der Sendung sowie die gewünschte
                Versandart.
              </p>
              <p className="legal-p">
                Im Bereich „Neue Sendung" können darüber hinaus vollständige Adressdaten von Absender
                und Empfänger (Name, Firma, Straße, Adresszusatz, PLZ, Stadt, Land, E-Mail, Telefon)
                eingegeben werden. Diese werden im Rahmen der Preisabfrage an unsere Backend-Systeme
                übermittelt.
              </p>

              <h3 className="legal-h3">7.2 Adressprüfung (OpenPLZ API)</h3>
              <p className="legal-p">
                Bei der Eingabe einer Adresse in Deutschland, Österreich, der Schweiz oder
                Liechtenstein prüfen wir Postleitzahl, Ort und Straßenname gegen das offene
                Verzeichnis der OpenPLZ API und schlagen passende Orte und Straßen vor. Die Abfrage
                erfolgt <strong>ausschließlich über unser eigenes Backend</strong> — Ihr Browser
                stellt keine Verbindung zu diesem Dienst her.
              </p>
              <p className="legal-p">
                Übermittelt werden dabei <strong>nur</strong> Land, Postleitzahl, Ortsname und
                Straßenname. <strong>Nicht übermittelt</strong> werden insbesondere: Name, Firma,
                Hausnummer, Adresszusatz, E-Mail-Adresse, Telefonnummer, Kontodaten sowie sämtliche
                Sendungs- und Rechnungsangaben. Ein Personenbezug entsteht dadurch nicht.
              </p>
              <p className="legal-p">
                Für Adressen außerhalb der genannten vier Länder findet keine solche Abfrage statt.
                Die Angaben werden nicht dauerhaft beim Anbieter gespeichert; wir halten Ergebnisse
                für kurze Zeit in einem Zwischenspeicher, um wiederholte Abfragen zu vermeiden.
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
                an korrekten Zustelladressen und der Vermeidung von Fehlsendungen).
              </p>

              <h3 className="legal-h3">7.3 Weitergabe an Jumingo</h3>
              <p className="legal-p legal-p--last">
                Zur Ermittlung der Versandpreise werden die oben genannten Daten über unser Backend an
                den Versanddienstleister Jumingo weitergeleitet (siehe Abschnitt 8 und 14). Mit Jumingo
                besteht ein Auftragsverarbeitungsvertrag.
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragsanbahnung).
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 8. Versandbuchungen ── */}
            <div id="abschnitt-8" className="legal-section">
              <h2 className="legal-h2">8. Versandbuchungen über Jumingo</h2>

              <h3 className="legal-h3">8.1 Erfasste und übermittelte Daten</h3>
              <p className="legal-p">
                Bei der Buchung einer Sendung werden folgende Daten verarbeitet:
              </p>
              <p className="legal-p">
                <strong>Absenderdaten:</strong> Name, Firmenname (optional), Straße und Hausnummer,
                Adresszusatz (optional), Postleitzahl, Stadt, Land, E-Mail-Adresse (optional),
                Telefonnummer (optional)
              </p>
              <p className="legal-p">
                <strong>Empfängerdaten:</strong> Dieselben Felder wie beim Absender
              </p>
              <p className="legal-p">
                <strong>Sendungsdaten:</strong> Sendungsinhalt (optional), Gewicht, ausgewählter
                Carrier, Tarif, Netto- und Bruttopreis
              </p>

              <h3 className="legal-h3">8.2 Verarbeitung von Drittdaten (Empfängerdaten)</h3>
              <p className="legal-p">
                Die Empfängerdaten betreffen in der Regel Personen, die nicht selbst Nutzer dieser
                Plattform sind. Als Versender sind Sie dafür verantwortlich, sicherzustellen, dass die
                Übermittlung dieser Daten an uns und die nachgelagerten Dienstleister auf einer
                geeigneten Rechtsgrundlage beruht — beispielsweise auf der Einwilligung der betroffenen
                Person oder auf einem berechtigten Interesse im Rahmen der Geschäftsbeziehung.
              </p>

              <h3 className="legal-h3">8.3 Weitergabe an Jumingo</h3>
              <p className="legal-p">
                Alle buchungsrelevanten Daten werden über unser Backend an Jumingo übermittelt. Jumingo
                erstellt auf dieser Grundlage das Versanddokument (Label) und leitet den Auftrag an den
                jeweiligen Carrier weiter. Mit Jumingo besteht ein Auftragsverarbeitungsvertrag gemäß
                Art. 28 DSGVO.
              </p>

              <h3 className="legal-h3">8.4 Buchungsbestätigung</h3>
              <p className="legal-p legal-p--last">
                Nach erfolgreicher Buchung erhalten Sie eine Bestätigungs-E-Mail an Ihre hinterlegte
                E-Mail-Adresse. Der Versand erfolgt über Resend (siehe Abschnitt 11).
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 9. Sendungsverfolgung ── */}
            <div id="abschnitt-9" className="legal-section">
              <h2 className="legal-h2">9. Sendungsverfolgung</h2>

              <h3 className="legal-h3">9.1 Sendungsverfolgung im Kundenkonto</h3>
              <p className="legal-p">
                Innerhalb Ihres Kundenkontos können Sie den Status Ihrer gebuchten Sendungen verfolgen.
                Tracking-Daten werden von Jumingo über unsere Backend-Schnittstelle abgerufen.
                Verarbeitet werden Sendungs-ID, Tracking-Ereignisse (Zeitstempel, Standort,
                Statusmeldung) sowie Carrier-Informationen.
                <br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
              </p>

              <h3 className="legal-h3">9.2 Öffentliche Sendungsverfolgung</h3>
              <p className="legal-p legal-p--last">
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

            <hr className="legal-rule" />

            {/* ── 10. Rechnungsdaten ── */}
            <div id="abschnitt-10" className="legal-section">
              <h2 className="legal-h2">10. Rechnungs- und Geschäftsdaten</h2>
              <p className="legal-p">
                Im Rahmen der Buchungsabwicklung werden Rechnungen erstellt, die folgende Daten
                enthalten: Firmenname und Adresse des Auftraggebers, Umsatzsteuer-Identifikationsnummer
                (sofern angegeben), Rechnungsnummer, Rechnungsbetrag, Fälligkeitsdatum sowie
                Buchungsdetails (Carrier, Sendungsgewicht, Tarif).
              </p>
              <p className="legal-p legal-p--last">
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

            <hr className="legal-rule" />

            {/* ── 11. E-Mail / Resend ── */}
            <div id="abschnitt-11" className="legal-section">
              <h2 className="legal-h2">11. E-Mail-Kommunikation (Resend)</h2>

              <h3 className="legal-h3">11.1 Art der E-Mails</h3>
              <p className="legal-p">
                Wir versenden ausschließlich transaktionale E-Mails, d.h. Nachrichten, die in direktem
                Zusammenhang mit Ihrer Nutzung der Plattform stehen:
              </p>
              <ul className="legal-list">
                <li>Buchungsbestätigungen</li>
                <li>Passwort-Reset-Links</li>
                <li>Systembenachrichtigungen (z.B. Kontofreischaltung)</li>
              </ul>
              <p className="legal-p">Wir versenden keine Werbe-E-Mails und keinen Newsletter.</p>

              <h3 className="legal-h3">11.2 Dienstleister Resend</h3>
              <p className="legal-p legal-p--last">
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

            <hr className="legal-rule" />

            {/* ── 12. Cookies und lokale Speichertechnologien ── */}
            <div id="abschnitt-12" className="legal-section">
              <h2 className="legal-h2">12. Cookies und lokale Speichertechnologien</h2>

              <h3 className="legal-h3">12.1 Keine Cookies</h3>
              <p className="legal-p">
                ConfidaraExpress setzt derzeit keine Cookies ein — weder technisch notwendige noch
                Analyse-, Marketing- oder Tracking-Cookies.
                Da keine Cookies gesetzt werden, wird kein Cookie-Banner angezeigt.
              </p>

              {/* Diese Angabe lautete bis zur Einführung der Vorgangserhaltung
                  „Ebenso wird kein sessionStorage verwendet." Seitdem trifft das
                  nicht mehr zu; die Aussage wurde deshalb durch die tatsächliche
                  Verarbeitung ersetzt. */}
              <h3 className="legal-h3">12.2 Technisch notwendige Speicherung im sessionStorage (laufender Versandvorgang)</h3>
              <p className="legal-p">
                Damit Ihnen beim Wechsel zwischen Angebotsvergleich und Buchung, beim Zurückgehen im
                Browser oder nach einem versehentlichen Neuladen keine Eingaben verloren gehen, wird
                der aktuell bearbeitete Versandvorgang vorübergehend im{" "}
                <code className="legal-code">sessionStorage</code> Ihres Browsers gespeichert. Enthalten
                sind ausschließlich die von Ihnen eingegebenen Sendungsdaten (Absender- und
                Empfängeranschrift, Kontaktangaben, Paketangaben, Versanddatum), die gewählten Filter
                und die angezeigten Versandangebote. Nicht gespeichert werden Zugangsdaten,
                Authentifizierungstoken, Zahlungsdaten oder hochgeladene Dokumente.
              </p>
              <p className="legal-p">
                Der <code className="legal-code">sessionStorage</code> ist auf den einzelnen Browser-Tab
                begrenzt und wird vom Browser automatisch geleert, sobald Sie den Tab schließen.
                Zusätzlich löschen wir den Vorgang, sobald Sie sich abmelden, die Buchung
                abgeschlossen ist, Sie einen neuen Vorgang beginnen oder Sie die Eingaben bewusst
                zurücksetzen. Nach 60 Minuten ohne Aktivität werden die berechneten Angebote
                verworfen. Eine Übermittlung dieser Daten an Dritte findet nicht statt; die
                Speicherung erfolgt ausschließlich lokal in Ihrem Browser.
              </p>
              <p className="legal-p">
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Durchführung
                vorvertraglicher Maßnahmen und Vertragserfüllung) sowie § 25 Abs. 2 Nr. 2 TDDDG
                (unbedingt erforderlich, um den von Ihnen ausdrücklich gewünschten Dienst
                bereitzustellen).
              </p>

              <h3 className="legal-h3">12.3 Technisch notwendige Speicherung im localStorage (Login)</h3>
              <p className="legal-p">
                Für den Login wird eine technisch notwendige Speicherung im{" "}
                <code className="legal-code">localStorage</code> Ihres
                Browsers verwendet. Nach erfolgreicher Anmeldung wird dort ein Authentifizierungstoken
                (JSON Web Token, kurz JWT) abgelegt.
              </p>
              <p className="legal-p">
                <strong>Schlüssel:</strong>{" "}
                <code className="legal-code">ce_token</code><br />
                <strong>Inhalt:</strong> JWT mit einer Konto-Kennung (ID), Ihrer E-Mail-Adresse und
                Ihrer Rolle<br />
                <strong>Zweck:</strong> Authentifizierung und Aufrechterhaltung der Login-Sitzung
              </p>
              <p className="legal-p">
                Ohne diese Speicherung kann der Login bzw. der Kundenbereich nicht zuverlässig
                funktionieren. Der Token wird ausschließlich zur Authentifizierung gegenüber unseren
                Backend-Systemen verwendet; bei der Abmeldung wird er aus dem Browser entfernt.
              </p>
              <p className="legal-p legal-p--last">
                <code className="legal-code">localStorage</code> ist kein
                Cookie im technischen Sinne und unterliegt nicht den Cookie-Regelungen der
                ePrivacy-Richtlinie. Eine Einwilligung ist für diese technisch notwendige Speicherung
                nicht erforderlich. Es werden keine Analyse-, Marketing- oder Tracking-Technologien in
                der lokalen Speicherung abgelegt.
                <br /><br />
                <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (technisch notwendig für
                die Vertragserfüllung).
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 13. Schriftarten ── */}
            <div id="abschnitt-13" className="legal-section">
              <h2 className="legal-h2">13. Schriftarten</h2>
              <p className="legal-p">
                Die auf unserer Plattform verwendeten Schriftarten (<em>Cormorant Garamond</em>{" "}
                und <em>DM Sans</em>) werden lokal von unserem eigenen Server
                ausgeliefert. Die Schriftdateien sind Bestandteil unserer Anwendung und werden von
                derselben Domain geladen wie die übrige Plattform.
              </p>
              <p className="legal-p legal-p--last">
                Beim Aufruf der Plattform wird <strong>keine Verbindung zu Google Fonts oder anderen
                externen Anbietern</strong> hergestellt, um Schriftarten zu laden. Zu diesem Zweck
                werden keine Daten — insbesondere nicht Ihre IP-Adresse — an Dritte übertragen.
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 14. Auftragsverarbeiter ── */}
            <div id="abschnitt-14" className="legal-section">
              <h2 className="legal-h2">14. Auftragsverarbeiter</h2>
              <p className="legal-p">
                Wir setzen folgende Auftragsverarbeiter ein, mit denen Verträge gemäß Art. 28 DSGVO
                geschlossen wurden oder werden:
              </p>
              <dl className="legal-dl">
                <dt className="legal-dt">Hetzner Online GmbH</dt>
                <dd className="legal-dd">
                  Funktion: Hosting, Server-Infrastruktur · Standort: Deutschland (EU)
                </dd>
                <dt className="legal-dt">Jumingo</dt>
                <dd className="legal-dd">
                  Funktion: Versandabwicklung, Preisabfrage, Label-Erstellung, Tracking ·
                  Standort: gemäß Jumingo-Vertrag
                </dd>
                <dt className="legal-dt">Resend Inc.</dt>
                <dd className="legal-dd legal-dd--last">
                  Funktion: Transaktionaler E-Mail-Versand · Standort: USA (Standardvertragsklauseln
                  vorhanden)
                </dd>
              </dl>
              <p className="legal-p legal-p--spaced">
                Alle genannten Auftragsverarbeiter sind vertraglich dazu verpflichtet, personenbezogene
                Daten ausschließlich nach unserer Weisung und gemäß den Anforderungen der DSGVO zu
                verarbeiten.
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 15. Speicherdauern ── */}
            <div id="abschnitt-15" className="legal-section">
              <h2 className="legal-h2">15. Speicherdauern im Überblick</h2>
              <dl className="legal-dl">
                <dt className="legal-dt">Nutzerkonto und Stammdaten</dt>
                <dd className="legal-dd">
                  12 Monate nach Vertragsende · Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
                </dd>
                <dt className="legal-dt">Abgelehnte / nicht freigeschaltete Registrierungen</dt>
                <dd className="legal-dd">
                  6 Monate nach Ablehnung · Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO
                </dd>
                <dt className="legal-dt">Rechnungsdaten und Buchungsbelege</dt>
                <dd className="legal-dd">
                  10 Jahre (§ 147 AO) · Rechtsgrundlage: Art. 6 Abs. 1 lit. c DSGVO
                </dd>
                <dt className="legal-dt">Versanddaten (gebuchte Sendungen)</dt>
                <dd className="legal-dd">
                  Bis zu 6 Jahre nach Buchung (§ 257 HGB) oder 12 Monate nach Vertragsende ·
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. c / b DSGVO
                </dd>
                <dt className="legal-dt">Server-Logfiles (Zugriffsdaten)</dt>
                <dd className="legal-dd">
                  Max. 30 Tage · Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO
                </dd>
                <dt className="legal-dt">Passwort-Reset-Token</dt>
                <dd className="legal-dd">
                  Sofort nach Verwendung oder Ablauf der Gültigkeitsdauer ·
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
                </dd>
                <dt className="legal-dt">JWT-Token (localStorage)</dt>
                <dd className="legal-dd legal-dd--last">
                  Bis zur Abmeldung oder Ablauf der Token-Gültigkeit ·
                  Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
                </dd>
              </dl>
            </div>

            <hr className="legal-rule" />

            {/* ── 16. Betroffenenrechte ── */}
            <div id="abschnitt-16" className="legal-section">
              <h2 className="legal-h2">16. Ihre Rechte als betroffene Person</h2>
              <p className="legal-p">
                Sie haben gegenüber uns folgende Rechte hinsichtlich Ihrer personenbezogenen Daten:
              </p>

              <h3 className="legal-h3">Recht auf Auskunft (Art. 15 DSGVO)</h3>
              <p className="legal-p">
                Sie haben das Recht, Auskunft über die von uns verarbeiteten personenbezogenen Daten,
                deren Herkunft, Empfänger und den Zweck der Verarbeitung zu erhalten.
              </p>

              <h3 className="legal-h3">Recht auf Berichtigung (Art. 16 DSGVO)</h3>
              <p className="legal-p">
                Sie haben das Recht, die Berichtigung unrichtiger oder die Vervollständigung
                unvollständiger Daten zu verlangen. Viele Stammdaten können Sie direkt über die
                Profilverwaltung in Ihrem Kundenkonto aktualisieren.
              </p>

              <h3 className="legal-h3">Recht auf Löschung (Art. 17 DSGVO)</h3>
              <p className="legal-p">
                Sie haben das Recht, die Löschung Ihrer personenbezogenen Daten zu verlangen, sofern
                keine gesetzlichen Aufbewahrungspflichten oder sonstige Gründe der Löschung
                entgegenstehen.
              </p>

              <h3 className="legal-h3">Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</h3>
              <p className="legal-p">
                Sie haben das Recht, die Einschränkung der Verarbeitung Ihrer personenbezogenen Daten
                zu verlangen, sofern die Voraussetzungen des Art. 18 DSGVO vorliegen.
              </p>

              <h3 className="legal-h3">Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</h3>
              <p className="legal-p">
                Sie haben das Recht, die Sie betreffenden personenbezogenen Daten in einem
                strukturierten, gängigen und maschinenlesbaren Format zu erhalten, sofern die
                Verarbeitung auf einem Vertrag beruht und mithilfe automatisierter Verfahren erfolgt.
              </p>

              <h3 className="legal-h3">Widerspruchsrecht (Art. 21 DSGVO)</h3>
              <p className="legal-p">
                Soweit wir personenbezogene Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO
                (berechtigtes Interesse) verarbeiten, haben Sie das Recht, aus Gründen, die sich aus
                Ihrer besonderen Situation ergeben, jederzeit Widerspruch einzulegen.
              </p>

              <h3 className="legal-h3">Recht auf Widerruf einer Einwilligung (Art. 7 Abs. 3 DSGVO)</h3>
              <p className="legal-p">
                Soweit die Verarbeitung auf Ihrer Einwilligung beruht, können Sie diese jederzeit mit
                Wirkung für die Zukunft widerrufen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten
                Verarbeitung bleibt davon unberührt.
              </p>

              <p className="legal-p legal-p--last">
                Zur Ausübung Ihrer Rechte wenden Sie sich bitte an:{" "}
                <a href="mailto:support@confidaraexpress.de">
                  support@confidaraexpress.de
                </a>
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 17. Beschwerderecht ── */}
            <div id="abschnitt-17" className="legal-section">
              <h2 className="legal-h2">17. Beschwerderecht bei der Aufsichtsbehörde</h2>
              <p className="legal-p">
                Sie haben das Recht, sich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung
                Ihrer personenbezogenen Daten zu beschweren (Art. 77 DSGVO). Für Confidara Express GbR
                mit Sitz in Plochingen, Baden-Württemberg, ist die zuständige Aufsichtsbehörde:
              </p>
              <p className="legal-p legal-p--last">
                <strong>Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit
                Baden-Württemberg (LfDI BW)</strong><br />
                Lautenschlagerstraße 20<br />
                70173 Stuttgart<br />
                Telefon: +49 711 615541-0<br />
                E-Mail:{" "}
                <a href="mailto:poststelle@lfdi.bwl.de">
                  poststelle@lfdi.bwl.de
                </a>
                <br />
                Website:{" "}
                <a href="https://www.baden-wuerttemberg.datenschutz.de" target="_blank" rel="noopener noreferrer">
                  www.baden-wuerttemberg.datenschutz.de
                </a>
              </p>
            </div>

            <hr className="legal-rule" />

            {/* ── 18. Änderungen ── */}
            <div id="abschnitt-18" className="legal-section">
              <h2 className="legal-h2">18. Änderungen dieser Datenschutzerklärung</h2>
              <p className="legal-p legal-p--last">
                Wir behalten uns vor, diese Datenschutzerklärung zu aktualisieren, um sie an geänderte
                Rechtslagen, neue Funktionen der Plattform oder veränderte technische Gegebenheiten
                anzupassen. Die jeweils aktuelle Fassung ist jederzeit unter /datenschutz auf unserer
                Plattform abrufbar.
                <br /><br />
                Bei wesentlichen Änderungen werden registrierte Nutzer über ihre hinterlegte
                E-Mail-Adresse informiert.
              </p>
            </div>

        </article>
      </div>
    </div>
  );
}
