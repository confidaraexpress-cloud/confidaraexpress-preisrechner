import React from "react";

const SECTION_STYLE = { marginBottom: 32 };
const H2_STYLE  = { fontSize: 16, fontWeight: 700, marginBottom: 10, marginTop: 0, color: "var(--text, #111827)", fontFamily: "'Syne', sans-serif" };
const P_STYLE   = { lineHeight: 1.75, margin: "0 0 10px 0", color: "var(--text-muted, #374151)", fontSize: 14 };
const P_LAST    = { lineHeight: 1.75, margin: 0, color: "var(--text-muted, #374151)", fontSize: 14 };
const HR_STYLE  = { border: "none", borderTop: "1px solid var(--border, #e5e7eb)", margin: "28px 0" };
const TOC_LINK  = { color: "var(--blue, #1D4ED8)", textDecoration: "none", fontSize: 14, lineHeight: 1.9, display: "block" };
const UL_STYLE  = { paddingLeft: 20, margin: "0 0 10px 0", color: "var(--text-muted, #374151)", fontSize: 14, lineHeight: 1.9 };
const UL_ALPHA  = { listStyleType: "lower-alpha", paddingLeft: 20, margin: "0 0 10px 0", color: "var(--text-muted, #374151)", fontSize: 14, lineHeight: 1.9 };
const UL_NESTED = { paddingLeft: 18, margin: "4px 0 6px 0", fontSize: 14, lineHeight: 1.9 };

const TOC = [
  [1,  "Geltungsbereich und Vertragspartner"],
  [2,  "Leistungsbeschreibung"],
  [3,  "Registrierung und Zugangsberechtigung"],
  [4,  "Vertragsschluss"],
  [5,  "Preise und Zahlungsbedingungen"],
  [6,  "Rechnungsstellung"],
  [7,  "Pflichten des Kunden"],
  [8,  "Verbotene Versandgüter"],
  [9,  "Internationaler Versand und Zoll"],
  [10, "Haftung"],
  [11, "Stornierung"],
  [12, "Reklamationen und Schadensersatz"],
  [13, "Laufzeit und Kündigung"],
  [14, "Kein Widerrufsrecht"],
  [15, "Datenschutz"],
  [16, "Änderungen der AGB"],
  [17, "Schlussbestimmungen"],
];

export default function AGBPage() {
  return (
    <div className="page-with-navbar">
      <div className="container" style={{ maxWidth: 720, padding: "40px 16px 80px" }}>
        <h1 className="heading mb-24">Allgemeine Geschäftsbedingungen</h1>
        <div className="calc-panel">
          <div className="calc-panel-body" style={{ lineHeight: 1.75 }}>

            {/* ── Stand ── */}
            <p style={{ ...P_STYLE, color: "var(--gray400, #94a3b8)", fontSize: 13, marginBottom: 24 }}>
              Stand: Mai 2026
            </p>

            {/* ── Inhaltsverzeichnis ── */}
            <div style={{ background: "var(--gray50, #f5f7fa)", borderRadius: 8, padding: "16px 20px", marginBottom: 32 }}>
              <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "var(--navy, #0B1F4D)" }}>
                Inhaltsverzeichnis
              </p>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {TOC.map(([n, label]) => (
                  <li key={n} style={{ lineHeight: 1.9 }}>
                    <a href={`#paragraf-${n}`} style={TOC_LINK}>§ {n} {label}</a>
                  </li>
                ))}
              </ol>
            </div>

            {/* ── § 1 ── */}
            <div id="paragraf-1" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 1 Geltungsbereich und Vertragspartner</h2>
              <p style={P_STYLE}>
                <strong>1.1</strong> Diese Allgemeinen Geschäftsbedingungen (nachfolgend „AGB") gelten für alle
                Geschäftsbeziehungen zwischen der <strong>Confidara Express GbR</strong>, vertreten durch die
                Gesellschafter Miguel Vance und Patrick Werner, Weiherstraße 25,
                73207 Plochingen, Deutschland (nachfolgend „Confidara Express" oder „CE") und ihren Kunden.
              </p>
              <p style={P_STYLE}>
                <strong>1.2</strong> Die Plattform von Confidara Express richtet sich ausschließlich an{" "}
                <strong>Unternehmer im Sinne des § 14 BGB</strong>, d.h. an natürliche oder juristische Personen
                oder rechtsfähige Personengesellschaften, die bei Abschluss eines Rechtsgeschäfts in Ausübung
                ihrer gewerblichen oder selbständigen beruflichen Tätigkeit handeln. Eine Nutzung durch
                Verbraucher im Sinne des § 13 BGB ist nicht gestattet.
              </p>
              <p style={P_STYLE}>
                <strong>1.3</strong> Mit der Registrierung auf der Plattform bestätigt der Kunde ausdrücklich,
                dass er als Unternehmer im Sinne des § 14 BGB handelt und die Plattform ausschließlich für
                gewerbliche Zwecke nutzt. Falsche Angaben zum unternehmerischen Status gehen vollständig zulasten
                des Kunden.
              </p>
              <p style={P_STYLE}>
                <strong>1.4</strong> Diese AGB gelten ausschließlich. Entgegenstehende oder von diesen AGB
                abweichende Bedingungen des Kunden erkennt Confidara Express nicht an, es sei denn, CE hat ihrer
                Geltung ausdrücklich schriftlich zugestimmt. Dies gilt auch dann, wenn CE in Kenntnis
                abweichender Bedingungen des Kunden die Leistung vorbehaltlos erbringt.
              </p>
              <p style={P_LAST}>
                <strong>1.5</strong> Diese AGB gelten auch für alle zukünftigen Geschäfte mit dem Kunden,
                soweit es sich um gleichartige Rechtsgeschäfte handelt, ohne dass es einer erneuten
                ausdrücklichen Einbeziehung bedarf.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 2 ── */}
            <div id="paragraf-2" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 2 Leistungsbeschreibung</h2>
              <p style={P_STYLE}>
                <strong>2.1</strong> Confidara Express betreibt eine digitale B2B-Plattform (nachfolgend
                „Plattform"), die es registrierten Unternehmenskunden ermöglicht, Versandpreise verschiedener
                Carrier in Echtzeit zu vergleichen, Versandaufträge zu buchen, Versandlabels abzurufen und den
                Status ihrer Sendungen zu verfolgen.
              </p>
              <p style={P_STYLE}>
                <strong>2.2</strong> Confidara Express handelt als <strong>Wiederverkäufer (Reseller)</strong>{" "}
                von Versanddienstleistungen. CE bezieht Versandtarife von Carriern über den
                Versanddienstleister Jumingo und verkauft diese mit einer eigenen Marge an den Kunden weiter.
                Der Vertragspartner des Kunden für den Versandvertrag ist Confidara Express; die tatsächliche
                Beförderungsleistung wird durch die jeweils angebundenen Carrier erbracht.
              </p>
              <p style={P_STYLE}>
                <strong>2.3</strong> Die über die Plattform verfügbaren Carrier werden durch Jumingo
                bereitgestellt. Confidara Express kann die Verfügbarkeit einzelner Carrier nicht garantieren
                und behält sich vor, Carrier ohne gesonderte Ankündigung hinzuzufügen oder zu entfernen,
                sofern dies durch Änderungen des Jumingo-Carrier-Portfolios bedingt ist.
              </p>
              <p style={P_STYLE}>
                <strong>2.4</strong> Die Plattform umfasst folgende Leistungen:
              </p>
              <ul style={UL_STYLE}>
                <li>Echtzeit-Preisabfrage bei verfügbaren Carriern auf Basis der vom Kunden eingegebenen Sendungsdaten</li>
                <li>Buchung von Versandaufträgen mit verbindlicher Preisbestätigung</li>
                <li>Bereitstellung von Versandlabels im PDF-Format nach erfolgreicher Buchung</li>
                <li>Sendungsverfolgung über die Tracking-Funktion der Plattform</li>
              </ul>
              <p style={P_STYLE}>
                <strong>2.5</strong> Confidara Express erbringt ausdrücklich keine eigene Transportleistung
                und ist kein Frachtführer, Spediteur oder Lagerhalter im Sinne der §§ 407 ff. HGB.
              </p>
              <p style={P_STYLE}>
                <strong>2.6</strong> Confidara Express kann Leistungsumfang, Funktionen und
                Benutzeroberfläche der Plattform jederzeit weiterentwickeln, anpassen oder einzelne
                Funktionen vorübergehend oder dauerhaft einstellen, sofern dies für den Kunden zumutbar
                ist und die vertraglich geschuldeten Kernleistungen (Buchung, Label, Tracking) nicht
                dauerhaft entfallen.
              </p>
              <p style={P_LAST}>
                <strong>2.7</strong> Eine Verfügbarkeit der Plattform von 100 % wird nicht garantiert.
                Geplante Wartungsarbeiten werden, soweit möglich, im Voraus angekündigt. Confidara Express
                haftet nicht für Ausfälle, die auf Ursachen außerhalb des eigenen Einflussbereichs
                zurückzuführen sind (höhere Gewalt, Carrier-API-Ausfälle, Jumingo-Ausfälle,
                Netzwerkstörungen Dritter).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 3 ── */}
            <div id="paragraf-3" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 3 Registrierung und Zugangsberechtigung</h2>
              <p style={P_STYLE}>
                <strong>3.1</strong> Die Nutzung der Plattform setzt eine erfolgreiche Registrierung und
                anschließende manuelle Freischaltung durch Confidara Express voraus. Mit der Einreichung
                der Registrierungsanfrage kommt noch kein Vertrag zustande.
              </p>
              <p style={P_STYLE}>
                <strong>3.2</strong> Confidara Express entscheidet nach eigenem Ermessen über die
                Freischaltung eines Kontos. Ein Anspruch auf Freischaltung besteht nicht. Die Ablehnung
                einer Registrierung bedarf keiner Begründung.
              </p>
              <p style={P_STYLE}>
                <strong>3.3</strong> Der Kunde ist verpflichtet, bei der Registrierung und im Rahmen der
                laufenden Geschäftsbeziehung vollständige und wahrheitsgemäße Angaben zu machen. Änderungen
                der bei der Registrierung angegebenen Daten (insbesondere Firmenanschrift, E-Mail-Adresse,
                Umsatzsteuer-ID) sind unverzüglich über die Profilfunktion der Plattform oder per E-Mail an
                Confidara Express zu melden.
              </p>
              <p style={P_STYLE}>
                <strong>3.4</strong> Zugangsdaten (E-Mail-Adresse und Passwort) sind vom Kunden vertraulich
                zu behandeln und dürfen nicht an Dritte weitergegeben werden. Der Kunde haftet für alle über
                sein Konto vorgenommenen Handlungen, es sei denn, er weist nach, dass er die Nutzung seines
                Kontos durch Dritte nicht zu vertreten hat.
              </p>
              <p style={P_STYLE}>
                <strong>3.5</strong> Bei Verdacht auf unbefugte Nutzung des Kontos hat der Kunde Confidara
                Express unverzüglich zu informieren und das Passwort zu ändern.
              </p>
              <p style={P_STYLE}>
                <strong>3.6</strong> Jeder Kunde darf nur ein Konto betreiben. Die Eröffnung mehrerer Konten
                für dasselbe Unternehmen ist ohne ausdrückliche Genehmigung von Confidara Express nicht
                gestattet.
              </p>
              <p style={P_LAST}>
                <strong>3.7</strong> Kundenkonten sind nicht übertragbar. Im Falle einer
                Unternehmensübernahme, Fusion oder sonstigen Übertragung ist Confidara Express vorab zu
                informieren; eine Kontoübertragung bedarf der schriftlichen Zustimmung von CE.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 4 ── */}
            <div id="paragraf-4" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 4 Vertragsschluss</h2>
              <p style={P_STYLE}>
                <strong>4.1</strong> Die auf der Plattform angezeigten Versandpreise stellen kein
                verbindliches Angebot, sondern eine unverbindliche Preisauskunft (invitatio ad offerendum)
                dar. Preise können sich bis zum Zeitpunkt der Buchungsbestätigung ändern.
              </p>
              <p style={P_STYLE}>
                <strong>4.2</strong> Durch das Absenden einer Buchung über die Plattform gibt der Kunde ein
                verbindliches Angebot zum Abschluss eines Versanddienstleistungsvertrags zu den angezeigten
                Konditionen ab.
              </p>
              <p style={P_STYLE}>
                <strong>4.3</strong> Der Vertrag kommt zustande mit der Buchungsbestätigung durch Confidara
                Express, die dem Kunden per E-Mail an die hinterlegte E-Mail-Adresse übermittelt wird. Bis
                zur Buchungsbestätigung ist Confidara Express nicht an die angezeigte Preisauskunft
                gebunden.
              </p>
              <p style={P_STYLE}>
                <strong>4.4</strong> Sollte zwischen dem Zeitpunkt der Preisabfrage und der
                Buchungsbestätigung eine preisrelevante Änderung eingetreten sein, ist Confidara Express
                berechtigt, die Buchung zu dem aktualisierten Preis anzunehmen oder dem Kunden die
                Preisänderung mitzuteilen und ihm die Möglichkeit zu geben, die Buchung zum aktualisierten
                Preis zu bestätigen oder zu stornieren.
              </p>
              <p style={P_LAST}>
                <strong>4.5</strong> Der Vertragstext wird nach Vertragsschluss nicht gesondert gespeichert
                und ist nach Abschluss des Buchungsvorgangs über die Buchungshistorie der Plattform
                zugänglich.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 5 ── */}
            <div id="paragraf-5" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 5 Preise und Zahlungsbedingungen</h2>
              <p style={P_STYLE}>
                <strong>5.1</strong> Alle auf der Plattform angezeigten Preise verstehen sich als{" "}
                <strong>Nettopreise in Euro, zuzüglich der gesetzlich gültigen Mehrwertsteuer</strong>. Die
                Mehrwertsteuer wird bei Rechnungsstellung gesondert ausgewiesen.
              </p>
              <p style={P_STYLE}>
                <strong>5.2</strong> Maßgeblich ist der zum Zeitpunkt der Buchungsbestätigung bestätigte
                Preis. Nachträgliche Preisänderungen berühren bereits abgeschlossene Buchungen nicht,
                soweit nicht Abs. 5.3 oder 5.4 einschlägig sind.
              </p>
              <p style={P_STYLE}>
                <strong>5.3</strong> Sofern der Kunde bei der Buchung fehlerhafte Angaben zu Gewicht,
                Maßen, Stückzahl oder Art des Sendungsinhalts gemacht hat und der Carrier aufgrund der
                tatsächlichen Sendungsdaten eine Nachgebühr erhebt, ist Confidara Express berechtigt, diese
                Nachgebühr vollständig an den Kunden weiterzuberechnen. Darüber hinaus ist CE berechtigt,
                eine pauschale Bearbeitungsgebühr von 5,00 EUR netto je Nachberechnung zu erheben. Der
                Nachweis eines geringeren Schadens bleibt dem Kunden vorbehalten.
              </p>
              <p style={P_STYLE}>
                <strong>5.4</strong> Bei Sendungen, bei denen tatsächliches Gewicht und volumetrisches
                Gewicht voneinander abweichen, gilt das jeweils höhere Gewicht als maßgeblich
                (Carrier-Standard). Weicht das vom Carrier ermittelte Abrechnungsgewicht von dem vom Kunden
                angegebenen Gewicht ab, gilt Abs. 5.3 entsprechend.
              </p>
              <p style={P_STYLE}>
                <strong>5.5</strong> Soweit keine abweichende individuelle Vereinbarung getroffen wurde,
                sind Rechnungen innerhalb von <strong>28 Tagen</strong> nach Rechnungsdatum ohne Abzug
                fällig. Individuell vereinbarte Zahlungsziele bleiben unberührt. Eine Skontogewährung
                findet nicht statt, sofern nicht schriftlich abweichend vereinbart.
              </p>
              <p style={P_STYLE}>
                <strong>5.6</strong> Bei Zahlungsverzug ist Confidara Express berechtigt, Verzugszinsen in
                Höhe von <strong>9 Prozentpunkten über dem jeweiligen Basiszinssatz</strong> gemäß § 288
                Abs. 2 BGB zu berechnen. Die Geltendmachung eines weitergehenden Verzugsschadens bleibt
                vorbehalten.
              </p>
              <p style={P_STYLE}>
                <strong>5.7</strong> Der Kunde ist nicht berechtigt, Zahlungen gegenüber Forderungen von
                Confidara Express aufzurechnen, es sei denn, die Gegenforderung ist rechtskräftig
                festgestellt, von Confidara Express anerkannt oder unbestritten. Ein Zurückbehaltungsrecht
                steht dem Kunden nur zu, wenn es auf demselben Vertragsverhältnis beruht.
              </p>
              <p style={P_STYLE}>
                <strong>5.8</strong> Confidara Express behält sich vor, bei begründetem Zweifel an der
                Zahlungsfähigkeit des Kunden Vorkasse oder Sicherheitsleistung zu verlangen sowie laufende
                Buchungen bis zur Begleichung ausstehender Forderungen zurückzuhalten.
              </p>
              <p style={P_LAST}>
                <strong>5.9</strong> Gerät der Kunde mit Zahlungen in Verzug, ist Confidara Express nach
                vorheriger Mahnung berechtigt, den Plattformzugang bis zur vollständigen Begleichung der
                ausstehenden Beträge zu sperren (vgl. § 13).
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 6 ── */}
            <div id="paragraf-6" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 6 Rechnungsstellung</h2>
              <p style={P_STYLE}>
                <strong>6.1</strong> Rechnungen werden von Confidara Express <strong>ausschließlich in
                elektronischer Form</strong> erstellt und dem Kunden über die Plattform bereitgestellt.
                Zusätzlich kann eine Benachrichtigung per E-Mail erfolgen. Ein Anspruch auf Übersendung
                einer Papierrechnung besteht nicht.
              </p>
              <p style={P_STYLE}>
                <strong>6.2</strong> Durch die Registrierung auf der Plattform erklärt der Kunde sein
                ausdrückliches Einverständnis mit der elektronischen Rechnungsstellung.
              </p>
              <p style={P_STYLE}>
                <strong>6.3</strong> Der Kunde ist verpflichtet, eingehende Rechnungen unverzüglich,
                spätestens jedoch <strong>innerhalb von 14 Tagen</strong> nach Bereitstellung auf der
                Plattform, auf Richtigkeit zu prüfen und eventuelle Beanstandungen schriftlich oder per
                E-Mail an Confidara Express zu melden. Nach Ablauf dieser Frist gilt die Rechnung als
                anerkannt, sofern der Kunde nicht nachweist, dass er die Frist trotz zumutbarer Sorgfalt
                nicht einhalten konnte.
              </p>
              <p style={P_STYLE}>
                <strong>6.4</strong> Rechnungen werden auf das bei der Registrierung angegebene Unternehmen
                ausgestellt. Der Kunde trägt die Verantwortung dafür, dass die hinterlegten
                Unternehmensdaten (Firmenname, Adresse, USt-ID) stets aktuell und korrekt sind.
                Nachträgliche Änderungen bereits ausgestellter Rechnungen sind nur in gesetzlich
                vorgeschriebenen Fällen möglich.
              </p>
              <p style={P_LAST}>
                <strong>6.5</strong> Alle Rechnungen werden für die gesetzliche Aufbewahrungsfrist von
                10 Jahren auf der Plattform gespeichert und sind über die Rechnungshistorie des
                Kundenkontos abrufbar.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 7 ── */}
            <div id="paragraf-7" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 7 Pflichten des Kunden</h2>
              <p style={P_STYLE}>
                <strong>7.1 Korrektheit der Sendungsdaten:</strong> Der Kunde ist allein verantwortlich
                dafür, dass alle bei der Preisabfrage und Buchung eingegebenen Daten vollständig und
                korrekt sind. Dies umfasst insbesondere:
              </p>
              <ul style={UL_STYLE}>
                <li>Gewicht und Maße der Sendung (Länge, Breite, Höhe)</li>
                <li>Stückzahl und Verpackungsart</li>
                <li>Art und Inhalt der Sendung</li>
                <li>Absender- und Empfängerdaten (Name, Adresse, Land)</li>
                <li>Sonderanforderungen (Zerbrechlich, Kühlkette etc., sofern vom Carrier unterstützt)</li>
              </ul>
              <p style={P_STYLE}>
                <strong>7.2</strong> Unrichtige Angaben, die zu Nachgebühren, Verzögerungen, Rücksendungen
                oder Schäden führen, gehen ausschließlich zulasten des Kunden.
              </p>
              <p style={P_STYLE}>
                <strong>7.3 Verpackung:</strong> Der Kunde trägt die Verantwortung für eine
                carrier-gerechte und für die Beförderungsart geeignete Verpackung der Sendung. Schäden,
                die auf unzureichende Verpackung zurückzuführen sind, begründen keinen Ersatzanspruch
                gegen Confidara Express.
              </p>
              <p style={P_STYLE}>
                <strong>7.4 Verantwortung für Empfängerdaten:</strong> Der Kunde ist allein verantwortlich
                dafür, dass die von ihm eingegebenen Empfängerdaten (Name, Anschrift, E-Mail, Telefon)
                korrekt und vollständig sind und dass er zur Übermittlung dieser Daten an Confidara Express
                und die nachgelagerten Dienstleister (Jumingo, Carrier) befugt ist. Dies schließt die
                Einhaltung der Datenschutz-Grundverordnung (DSGVO) im Verhältnis zu den genannten
                Empfängern ein.
              </p>
              <p style={P_STYLE}>
                <strong>7.5 Etikettierung und Label:</strong> Der Kunde ist verpflichtet, das nach der
                Buchung bereitgestellte Versandlabel vollständig und gut lesbar auf der Sendung
                anzubringen. Sendungen ohne korrektes Label können vom Carrier zurückgewiesen oder
                verzögert werden. Hieraus entstehende Kosten trägt der Kunde.
              </p>
              <p style={P_STYLE}>
                <strong>7.6 Bereitstellung der Sendung:</strong> Der Kunde stellt die Sendung zu den vom
                Carrier vorgegebenen Zeiten und am vereinbarten Ort für die Abholung bereit. Verpasste
                Abholtermine oder nicht bereitgestellte Sendungen können zu erneuten Kosten führen.
              </p>
              <p style={P_LAST}>
                <strong>7.7 Einhaltung gesetzlicher Vorschriften:</strong> Der Kunde trägt die
                Verantwortung für die Einhaltung aller geltenden gesetzlichen Vorschriften, insbesondere
                hinsichtlich der Versandfähigkeit des Sendungsinhalts, Export- und Importvorschriften,
                Zollvorschriften und etwaiger nationaler Versandverbote im Zielland.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 8 ── */}
            <div id="paragraf-8" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 8 Verbotene Versandgüter</h2>
              <p style={P_STYLE}>
                <strong>8.1</strong> Folgende Güter dürfen über die Plattform von Confidara Express unter
                keinen Umständen versendet werden:
              </p>
              <ul style={UL_ALPHA}>
                <li>
                  <strong>Gefahrgut und gefährliche Stoffe:</strong>
                  <ul style={UL_NESTED}>
                    <li>Gefahrgut im Sinne der ADR, IATA oder IMDG jeder Klasse</li>
                    <li>ADR-pflichtige Transporte jeder Art</li>
                    <li>Lithium-Batterien und Lithium-Akkumulatoren als Sonderversand</li>
                    <li>Explosivstoffe, Munition, Schusswaffen (ohne behördliche Genehmigung)</li>
                    <li>Brennbare Flüssigkeiten und Gase</li>
                    <li>Ätzende, giftige oder radioaktive Stoffe</li>
                    <li>Infektiöse Stoffe</li>
                  </ul>
                </li>
                <li>
                  <strong>Lebewesen:</strong>
                  <ul style={UL_NESTED}>
                    <li>Lebende Tiere jeder Art</li>
                    <li>Pflanzen ohne phytosanitäre Genehmigung in grenzüberschreitenden Sendungen</li>
                  </ul>
                </li>
                <li>
                  <strong>Verderbliche Waren:</strong>
                  <ul style={UL_NESTED}>
                    <li>Leicht verderbliche Lebensmittel ohne geeignete Spezialverpackung und Carrier-Sondergenehmigung für Kühlkettentransporte</li>
                  </ul>
                </li>
                <li>
                  <strong>Wertgegenstände:</strong>
                  <ul style={UL_NESTED}>
                    <li>Bargeld, Münzen, Briefmarken als Sammelobjekte</li>
                    <li>Edelmetalle und Edelsteine ohne Carrier-Sondervereinbarung</li>
                    <li>Kunstgegenstände oder Antiquitäten mit einem Einzelwert über 1.000 EUR ohne gesonderte Versicherung und Carrier-Freigabe</li>
                  </ul>
                </li>
                <li>
                  <strong>Rechtsverletzende und illegale Waren:</strong>
                  <ul style={UL_NESTED}>
                    <li>Gefälschte Waren, Produktpiraterie</li>
                    <li>Betäubungsmittel und psychoaktive Substanzen</li>
                    <li>Illegale Waren aller Art</li>
                    <li>Pornografisches Material, sofern nicht legal und ausdrücklich durch den Carrier genehmigt</li>
                  </ul>
                </li>
                <li>
                  <strong>Sonstige:</strong>
                  <ul style={UL_NESTED}>
                    <li>Menschliche Überreste, Organe oder Körperteile</li>
                    <li>Waren, die im Ursprungs- oder Zielland einem Einfuhr- oder Ausfuhrverbot unterliegen</li>
                  </ul>
                </li>
              </ul>
              <p style={P_STYLE}>
                <strong>8.2</strong> Der Kunde versichert mit jeder Buchung ausdrücklich, dass die
                aufgegebene Sendung keines der in Abs. 8.1 aufgeführten verbotenen Güter enthält.
              </p>
              <p style={P_STYLE}>
                <strong>8.3</strong> Bei einem Verstoß gegen Abs. 8.1 ist Confidara Express berechtigt:
              </p>
              <ul style={UL_STYLE}>
                <li>Die Sendung sofort zurückzuhalten oder an den Kunden zurückzusenden</li>
                <li>Das Kundenkonto mit sofortiger Wirkung dauerhaft zu sperren</li>
                <li>Den Vertrag außerordentlich fristlos zu kündigen</li>
                <li>Alle durch den Verstoß entstandenen Kosten, Bußgelder, Strafen oder Schadensersatzforderungen Dritter vollständig beim Kunden geltend zu machen</li>
              </ul>
              <p style={P_LAST}>
                <strong>8.4</strong> Im Falle eines begründeten Verdachts auf einen strafbewehrten Verstoß
                ist Confidara Express berechtigt, die zuständigen Behörden zu informieren.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 9 ── */}
            <div id="paragraf-9" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 9 Internationaler Versand und Zoll</h2>
              <p style={P_STYLE}>
                <strong>9.1</strong> Die Zollanmeldung und die Einhaltung aller Import- und
                Exportvorschriften des Ursprungs- und des Ziellandes liegen ausschließlich in der
                Verantwortung des Kunden. Confidara Express bietet keine Zollberatung und übernimmt keine
                Haftung für zollrechtliche Konsequenzen, die aus fehlerhaften oder unvollständigen Angaben
                des Kunden resultieren.
              </p>
              <p style={P_STYLE}>
                <strong>9.2</strong> Der Kunde ist verpflichtet, alle für den internationalen Versand
                erforderlichen Dokumente (Handelsrechnung, Ausfuhranmeldung, Ursprungszeugnis,
                Konformitätserklärungen etc.) vollständig und korrekt beizufügen.
              </p>
              <p style={P_STYLE}>
                <strong>9.3</strong> Einzuführende Zölle, Einfuhrumsatzsteuern, Abfertigungsgebühren oder
                sonstige behördliche Abgaben im Zielland werden <strong>nicht</strong> von Confidara
                Express vorfinanziert oder übernommen. Diese fallen beim Empfänger oder bei dem im
                Zollverfahren benannten Einführer an und sind nicht im Buchungspreis enthalten, sofern
                nicht ausdrücklich als DDP-Sendung (Delivered Duty Paid) gebucht.
              </p>
              <p style={P_STYLE}>
                <strong>9.4</strong> Der Kunde hat sicherzustellen, dass die zu versendenden Güter keinen
                Exportkontrollvorschriften (z.B. Dual-Use-Verordnung der EU, US-Exportkontrollrecht)
                unterliegen oder dass für exportkontrollpflichtige Güter alle erforderlichen Genehmigungen
                vorliegen. Confidara Express ist nicht verpflichtet, Exportkontrollprüfungen für den
                Kunden durchzuführen.
              </p>
              <p style={P_LAST}>
                <strong>9.5</strong> Sendungen, die im Zielland aufgrund fehlerhafter Angaben oder
                fehlender Genehmigungen von den Zollbehörden zurückgehalten, vernichtet oder mit
                Strafgebühren belegt werden, begründen keinen Ersatzanspruch gegen Confidara Express.
                Alle daraus entstehenden Kosten trägt der Kunde.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 10 ── */}
            <div id="paragraf-10" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 10 Haftung</h2>
              <p style={P_STYLE}>
                <strong>10.1 Haftungsgrundsatz:</strong> Confidara Express haftet unbegrenzt für Schäden,
                die durch Vorsatz oder grobe Fahrlässigkeit von Confidara Express, seiner gesetzlichen
                Vertreter oder Erfüllungsgehilfen verursacht werden sowie für Schäden aus der Verletzung
                des Lebens, des Körpers oder der Gesundheit.
              </p>
              <p style={P_STYLE}>
                <strong>10.2 Beschränkte Haftung:</strong> Bei leicht fahrlässiger Verletzung einer
                wesentlichen Vertragspflicht (Kardinalpflicht), deren Erfüllung die ordnungsgemäße
                Durchführung des Vertrags überhaupt erst ermöglicht und auf deren Einhaltung der Kunde
                regelmäßig vertrauen darf, ist die Haftung von Confidara Express auf den
                vertragstypischen, vorhersehbaren Schaden beschränkt.
              </p>
              <p style={P_STYLE}>
                <strong>10.3 Haftungsausschluss:</strong> Im Übrigen ist die Haftung von Confidara Express
                für leicht fahrlässige Pflichtverletzungen ausgeschlossen. Dies gilt insbesondere für:
              </p>
              <ul style={UL_STYLE}>
                <li>Entgangenen Gewinn, Umsatzausfälle und Folgeschäden</li>
                <li>Datenverluste, soweit der Kunde die erforderlichen Datensicherungsmaßnahmen getroffen hat</li>
                <li>Schäden durch Carrier-Ausfälle, API-Störungen oder Ausfälle von Jumingo</li>
              </ul>
              <p style={P_STYLE}>
                <strong>10.4 Carrier-Schäden:</strong> Für Schäden an oder Verlust von Sendungen während
                der Beförderung haftet der jeweilige Carrier nach Maßgabe der gesetzlichen Vorschriften
                (§§ 425 ff. HGB für Inlandstransporte, CMR-Übereinkommen für grenzüberschreitende
                Straßentransporte). Confidara Express vermittelt Reklamationen gegenüber dem Carrier
                (vgl. § 12), übernimmt jedoch keine eigene Schadensersatzpflicht für Carrier-Verschulden
                über die gesetzlichen Haftungsrahmen hinaus.
              </p>
              <p style={P_STYLE}>
                <strong>10.5 Lieferzeiten:</strong> Die auf der Plattform angezeigten Laufzeiten der
                Carrier sind Richtwerte, keine bindenden Zusagen. Confidara Express übernimmt keine
                Garantie für die Einhaltung von Lieferterminen. Eine Haftung für Verspätungen durch
                Carrier, höhere Gewalt, Zollverzögerungen oder sonstige außerhalb des Einflussbereichs
                von CE liegende Ursachen ist ausgeschlossen.
              </p>
              <p style={P_STYLE}>
                <strong>10.6 Falschinformationen des Kunden:</strong> Für Schäden, die durch unrichtige,
                unvollständige oder fehlende Angaben des Kunden bei der Buchung entstehen (insbesondere
                Falschdeklaration des Sendungsinhalts, falsches Gewicht, falsche Maße), haftet
                ausschließlich der Kunde.
              </p>
              <p style={P_STYLE}>
                <strong>10.7 Höhere Gewalt:</strong> Confidara Express haftet nicht für die
                Nichterfüllung oder Verzögerung von Leistungen, die auf Ereignisse höherer Gewalt
                zurückzuführen sind. Als höhere Gewalt gelten insbesondere: Naturkatastrophen, Pandemien,
                Kriegsereignisse, terroristische Anschläge, Streiks, behördliche Anordnungen,
                Netzausfälle Dritter sowie sonstige unvorhersehbare, außergewöhnliche Ereignisse, auf die
                Confidara Express keinen Einfluss hat.
              </p>
              <p style={P_LAST}>
                <strong>10.8 Haftungshöchstbetrag:</strong> Die Gesamthaftung von Confidara Express je
                Buchungsvorgang ist — soweit gesetzlich zulässig — auf den Nettobetrag der jeweiligen
                Buchung begrenzt, in jedem Fall jedoch auf maximal 5.000 EUR je Schadensfall.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 11 ── */}
            <div id="paragraf-11" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 11 Stornierung</h2>
              <p style={P_STYLE}>
                <strong>11.1</strong> Nach Eingang der Buchungsbestätigung ist eine kostenfreie Stornierung
                nicht mehr möglich. Da es sich um einen B2B-Vertrag handelt, besteht kein gesetzliches
                Widerrufsrecht (vgl. § 14).
              </p>
              <p style={P_STYLE}>
                <strong>11.2</strong> Eine Stornierung nach Buchungsbestätigung ist ausnahmsweise möglich,
                solange das Versandlabel vom Carrier noch nicht eingescannt bzw. die Sendung noch nicht
                abgeholt wurde. In diesem Fall ist der Stornierungsantrag unverzüglich per E-Mail an
                Confidara Express zu stellen.
              </p>
              <p style={P_STYLE}>
                <strong>11.3</strong> Im Falle einer Stornierung gemäß Abs. 11.2 werden anfallende
                Stornierungsgebühren des Carriers sowie eine pauschale Bearbeitungsgebühr von Confidara
                Express in Höhe von <strong>10,00 EUR netto</strong> an den Kunden weitergegeben. Der
                Nachweis eines geringeren Aufwands bleibt dem Kunden vorbehalten.
              </p>
              <p style={P_STYLE}>
                <strong>11.4</strong> Nach Abholung der Sendung durch den Carrier oder nach Einscannens
                des Labels ist eine Stornierung nicht mehr möglich. In diesem Fall verbleibt der volle
                Buchungspreis beim Kunden.
              </p>
              <p style={P_LAST}>
                <strong>11.5</strong> Confidara Express ist berechtigt, eine bereits bestätigte Buchung zu
                stornieren, wenn der Carrier die Sendung ablehnt (z.B. wegen verbotener Güter), ein
                technischer Fehler zu einer offensichtlich fehlerhaften Preisanzeige geführt hat, der
                Kundenaccount zum Zeitpunkt der Buchung gesperrt war oder ein begründeter Verdacht auf
                Missbrauch oder Betrug besteht. In diesen Fällen wird dem Kunden bereits geleistete
                Zahlung für die stornierte Buchung erstattet.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 12 ── */}
            <div id="paragraf-12" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 12 Reklamationen und Schadensersatz</h2>
              <p style={P_STYLE}>
                <strong>12.1</strong> Reklamationen wegen Beschädigung, Verlustes oder Fehllieferung einer
                Sendung sind unverzüglich, spätestens jedoch innerhalb der gesetzlichen Fristen gemäß
                §§ 438, 439 HGB (Inlandssendungen) bzw. Art. 30 CMR (internationale Straßentransporte)
                geltend zu machen:
              </p>
              <ul style={UL_STYLE}>
                <li><strong>Äußerlich erkennbare Schäden:</strong> Sofortige Anzeige bei Ablieferung; Anzeige gegenüber CE spätestens innerhalb von 24 Stunden</li>
                <li><strong>Verdeckte Schäden:</strong> Anzeige gegenüber CE spätestens innerhalb von 7 Werktagen nach Empfang der Sendung</li>
                <li><strong>Totalverlust:</strong> Anzeige gegenüber CE spätestens 21 Tage nach dem vertraglich vereinbarten Liefertermin</li>
              </ul>
              <p style={P_STYLE}>
                <strong>12.2</strong> Reklamationen sind per E-Mail an Confidara Express zu richten und
                müssen folgende Informationen enthalten:
              </p>
              <ul style={UL_STYLE}>
                <li>Buchungsnummer und Sendungs-ID</li>
                <li>Art des Schadens bzw. der Beanstandung</li>
                <li>Fotodokumentation bei Beschädigungen (Außen- und Innenverpackung sowie beschädigter Inhalt)</li>
                <li>Ursprüngliche Buchungsunterlagen und Warenrechnung (für Schadensnachweis)</li>
              </ul>
              <p style={P_STYLE}>
                <strong>12.3</strong> Confidara Express vermittelt fristgerecht eingegangene Reklamationen
                gegenüber dem Carrier. Der Ausgang des Carrier-Reklamationsverfahrens ist für den
                Anspruch des Kunden gegen Confidara Express nicht unmittelbar bindend; CE ist jedoch
                berechtigt, zunächst die Entscheidung des Carriers abzuwarten, bevor ein Ausgleich an den
                Kunden geleistet wird.
              </p>
              <p style={P_STYLE}>
                <strong>12.4</strong> Nicht fristgerecht gemeldete Schäden oder Verluste begründen keinen
                Ersatzanspruch gegenüber Confidara Express, es sei denn, der Schaden war für CE nicht
                erkennbar und CE wurde über den Schaden noch innerhalb zumutbarer Frist informiert.
              </p>
              <p style={P_STYLE}>
                <strong>12.5</strong> Carrier-spezifische Haftungsobergrenzen (insbesondere nach §§ 431 ff.
                HGB oder CMR) begrenzen den Erstattungsanspruch des Kunden. Eine Haftung von Confidara
                Express über diese gesetzlichen Rahmen hinaus besteht nicht, soweit CE kein eigenes
                Verschulden trifft.
              </p>
              <p style={P_LAST}>
                <strong>12.6</strong> Über die Haftungsgrenzen der Carrier hinausgehende Schäden können
                durch eine private Transportversicherung abgedeckt werden. Confidara Express bietet
                aktuell keine eigene Versicherungsvermittlung an; der Abschluss einer
                Transportversicherung liegt in der Eigenverantwortung des Kunden.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 13 ── */}
            <div id="paragraf-13" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 13 Laufzeit und Kündigung</h2>
              <p style={P_STYLE}>
                <strong>13.1</strong> Der Rahmenvertrag über die Plattformnutzung wird auf unbestimmte Zeit
                geschlossen. Er kann von beiden Seiten jederzeit mit einer Frist von{" "}
                <strong>30 Tagen zum Monatsende</strong> ordentlich gekündigt werden.
              </p>
              <p style={P_STYLE}>
                <strong>13.2</strong> Die Kündigung bedarf der Textform (E-Mail an Confidara Express oder
                Nutzung einer entsprechenden Funktion auf der Plattform, sofern verfügbar).
              </p>
              <p style={P_STYLE}>
                <strong>13.3</strong> Confidara Express ist berechtigt, das Konto des Kunden{" "}
                <strong>mit sofortiger Wirkung</strong> zu sperren und / oder den Vertrag außerordentlich
                fristlos zu kündigen, wenn:
              </p>
              <ul style={UL_STYLE}>
                <li>Der Kunde mit fälligen Zahlungen in Verzug ist und trotz Mahnung nicht innerhalb von 10 Werktagen zahlt</li>
                <li>Der Kunde gegen § 8 (verbotene Versandgüter) oder sonstige wesentliche Pflichten aus diesen AGB verstößt</li>
                <li>Begründeter Verdacht auf Betrug, Identitätsmissbrauch oder sonstige strafbare Handlungen im Zusammenhang mit der Plattformnutzung besteht</li>
                <li>Falsche Angaben bei der Registrierung festgestellt werden</li>
                <li>Über das Vermögen des Kunden ein Insolvenzverfahren eröffnet oder die Eröffnung mangels Masse abgelehnt wurde</li>
              </ul>
              <p style={P_STYLE}>
                <strong>13.4</strong> Die außerordentliche Kündigung oder Sperrung durch Confidara Express
                lässt bestehende Zahlungsansprüche unberührt. Bereits bestätigte, aber noch nicht
                durchgeführte Buchungen werden nach Maßgabe von § 11 abgewickelt.
              </p>
              <p style={P_LAST}>
                <strong>13.5</strong> Nach Vertragsbeendigung werden die Kundendaten gemäß der
                Datenschutzerklärung von Confidara Express für 12 Monate gespeichert und anschließend
                gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
                Rechnungsdaten unterliegen der gesetzlichen Aufbewahrungsfrist von 10 Jahren.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 14 ── */}
            <div id="paragraf-14" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 14 Kein Widerrufsrecht</h2>
              <p style={P_STYLE}>
                <strong>14.1</strong> Da die Plattform von Confidara Express ausschließlich für Unternehmer
                im Sinne des § 14 BGB zugänglich ist und alle Verträge im Rahmen der gewerblichen
                Tätigkeit des Kunden abgeschlossen werden, gelten die Vorschriften über
                Verbraucherverträge, Fernabsatzverträge und das Widerrufsrecht gemäß §§ 312 ff., 355 ff.
                BGB <strong>nicht</strong>.
              </p>
              <p style={P_STYLE}>
                <strong>14.2</strong> Der Kunde hat kein gesetzliches Widerrufsrecht gegenüber Confidara
                Express. Die Stornierungsmöglichkeit nach § 11 bleibt hiervon unberührt.
              </p>
              <p style={P_LAST}>
                <strong>14.3</strong> Sollte es sich im Einzelfall entgegen der Registrierungsangaben um
                einen Verbrauchervertrag handeln — was von Confidara Express ausdrücklich nicht beabsichtigt
                und durch die Plattformstruktur ausgeschlossen sein soll — übernimmt Confidara Express keine
                Verantwortung für die Nichtgewährung etwaiger Verbraucherrechte, da der Zugang durch
                Falschdeklaration des Kunden erschlichen wurde.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 15 ── */}
            <div id="paragraf-15" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 15 Datenschutz</h2>
              <p style={P_STYLE}>
                <strong>15.1</strong> Die Verarbeitung personenbezogener Daten im Rahmen der
                Plattformnutzung erfolgt gemäß der Datenschutzerklärung von Confidara Express, die unter
                /datenschutz auf der Plattform jederzeit abrufbar ist.
              </p>
              <p style={P_LAST}>
                <strong>15.2</strong> Der Kunde verpflichtet sich, die einschlägigen
                datenschutzrechtlichen Vorschriften, insbesondere die DSGVO, bei der Nutzung der Plattform
                einzuhalten. Dies betrifft insbesondere die Eingabe von Empfängerdaten, für die der Kunde
                als datenschutzrechtlich Verantwortlicher die Befugnis zur Verarbeitung und Übermittlung
                sicherstellen muss.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 16 ── */}
            <div id="paragraf-16" style={SECTION_STYLE}>
              <h2 style={H2_STYLE}>§ 16 Änderungen der AGB</h2>
              <p style={P_STYLE}>
                <strong>16.1</strong> Confidara Express behält sich vor, diese AGB jederzeit zu ändern
                oder zu ergänzen. Änderungen werden dem Kunden mindestens{" "}
                <strong>6 Wochen vor ihrem Inkrafttreten</strong> in Textform (per E-Mail an die
                hinterlegte E-Mail-Adresse) mitgeteilt.
              </p>
              <p style={P_STYLE}>
                <strong>16.2</strong> Widerspricht der Kunde den Änderungen nicht innerhalb von{" "}
                <strong>4 Wochen</strong> nach Zugang der Änderungsmitteilung, gelten die geänderten AGB
                als angenommen. Confidara Express wird den Kunden in der Änderungsmitteilung ausdrücklich
                auf diese Konsequenz hinweisen.
              </p>
              <p style={P_STYLE}>
                <strong>16.3</strong> Im Falle des Widerspruchs ist Confidara Express berechtigt, den
                Rahmenvertrag zum Zeitpunkt des Inkrafttretens der Änderungen ordentlich zu kündigen.
              </p>
              <p style={P_LAST}>
                <strong>16.4</strong> Änderungen dieser AGB, die lediglich redaktioneller Art sind (z.B.
                Tippfehlerkorrekturen, Klarstellungen ohne inhaltliche Änderung) oder die den Kunden
                ausschließlich begünstigen, können ohne gesonderte Ankündigungsfrist in Kraft treten.
              </p>
            </div>

            <hr style={HR_STYLE} />

            {/* ── § 17 ── */}
            <div id="paragraf-17" style={{ ...SECTION_STYLE, marginBottom: 0 }}>
              <h2 style={H2_STYLE}>§ 17 Schlussbestimmungen</h2>
              <p style={P_STYLE}>
                <strong>17.1 Anwendbares Recht:</strong> Es gilt das Recht der Bundesrepublik Deutschland
                unter Ausschluss des UN-Kaufrechts (CISG), auch wenn der Kunde seinen Sitz im Ausland hat.
              </p>
              <p style={P_STYLE}>
                <strong>17.2 Gerichtsstand:</strong> Für alle Streitigkeiten aus oder im Zusammenhang mit
                diesen AGB und den auf ihrer Grundlage abgeschlossenen Verträgen ist ausschließlicher
                Gerichtsstand <strong>Esslingen am Neckar</strong>, soweit der Kunde Kaufmann, juristische
                Person des öffentlichen Rechts oder ein öffentlich-rechtliches Sondervermögen ist.
                Confidara Express ist jedoch auch berechtigt, den Kunden an seinem allgemeinen
                Gerichtsstand zu verklagen.
              </p>
              <p style={P_STYLE}>
                <strong>17.3 Salvatorische Klausel:</strong> Sollten einzelne Bestimmungen dieser AGB
                unwirksam oder undurchführbar sein oder werden, berührt dies die Wirksamkeit der übrigen
                Bestimmungen nicht. Anstelle der unwirksamen oder undurchführbaren Bestimmung gilt
                diejenige wirksame und durchführbare Regelung als vereinbart, die dem wirtschaftlichen Sinn
                und Zweck der unwirksamen oder undurchführbaren Bestimmung am nächsten kommt.
              </p>
              <p style={P_STYLE}>
                <strong>17.4 Textform:</strong> Soweit in diesen AGB Textform vorgeschrieben ist, genügt
                die Übermittlung per E-Mail. Die Schriftform im Sinne des § 126 BGB ist nicht erforderlich,
                sofern nicht ausdrücklich anders vereinbart.
              </p>
              <p style={P_STYLE}>
                <strong>17.5 Abtretungsverbot:</strong> Der Kunde kann Rechte und Pflichten aus dem
                Vertragsverhältnis mit Confidara Express nicht ohne vorherige schriftliche Zustimmung von CE
                auf Dritte übertragen oder abtreten. Confidara Express ist berechtigt, Forderungen
                gegenüber dem Kunden an Dritte abzutreten.
              </p>
              <p style={P_STYLE}>
                <strong>17.6 Kein Verzicht:</strong> Das Unterlassen der Geltendmachung von Rechten aus
                diesen AGB durch Confidara Express in einem Einzelfall stellt keinen Verzicht auf diese
                Rechte für die Zukunft dar.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
