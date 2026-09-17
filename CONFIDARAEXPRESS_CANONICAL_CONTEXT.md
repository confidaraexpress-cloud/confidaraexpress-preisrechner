# CONFIDARAEXPRESS — CANONICAL PROJECT CONTEXT

- **Schema-Version:** 2.1
- **Status:** CANONICAL PROJECT SOURCE
- **Last verified:** 2026-09-17 (DHL Foundation: TG84-Kuratierung, Art der Lieferadresse ohne Zuschlag, Transglobal-Fristen 1A, 6.4, 14, 15, 21); 2026-09-17 (TG26-Freigabe UPS Standard Multi und TG29-Buchungsbefund 1A, 6.4, 14, 15); 2026-09-16 (UPS-Vervollständigung TG29/TG26 1A, 6.4, 14, 15; TG22/TG23-Same-Day-Grundvertrag 1A, 6.4, 8.4, 15); 2026-09-15 (TG23-Abschnitte 1A, 6.4, 14, 15; TG23-Staging-Smoke-Evidenz 1A, 6.4, 14); 2026-09-14 (TG22-Package-B-Abschnitte 1A, 6.4, 14, 15; TG22-Package-A-Abschnitte 6.4, 14, 15; TG22-Same-Day-Abschnitte 1A, 5.1, 6.4, 8.1, 8.4, 9.4, 14, 15; TG22-Residential-Abschnitte 1A, 5.1, 5.4, 5.5, 6.4, 8.1, 8.4, 9.4, 14, 15); 2026-09-13 (TG22-Golden-Offer-Contract-Abschnitte 5.1, 5.12, 6.4, 8.4, 15; Package-C-Abschnitte 5.11, 5.14, 6.2, 6.4, 14); Transglobal-Abschnitte 2026-09-11; übrige Abschnitte Stand 2026-09-09
- **Verified against Frontend `origin/main`:** `ba8e44c` plus Paket TG-22 (Branch `claude/tg22-reference-enablement`, wirksam nach Merge); Package-C-Abschnitte gegen Branch `claude/package-c-operations-reconciliation` (wirksam nach Merge); TG22-Golden-Offer-Contract-Abschnitte gegen Branch `claude/tg22-golden-offer-contract` (wirksam nach Merge); TG22-Residential-Abschnitte gegen Branch `feature/tg22-residential-pricing` auf `f745cc9` (wirksam nach Merge); TG22-Same-Day-Abschnitte gegen Branch `feature/tg22-same-day-colfee` auf `986963b` (wirksam nach Merge); TG22-Package-A-Abschnitte gegen Branch `feature/tg22-product-details` auf Basis `44403de` (wirksam nach Merge); TG22-Package-B-Abschnitte gegen Branch `feature/tg22-delivery-projection` auf Basis `e424750` (wirksam nach Merge); TG23-Abschnitte gegen Branch `feature/tg23-express-saver` auf Basis `e66ed64` (wirksam nach Merge); TG22/TG23-Same-Day-Grundvertrag gegen Branch `feature/tg-same-day-reason-contract` auf Basis `9fb5549` (gemergt, #430); UPS-Vervollständigung gegen Branch `feature/complete-transglobal-ups-family` auf Basis `bab50f5` (wirksam nach Merge); TG26-Freigabe gegen denselben Branch auf Basis `1893e96` (wirksam nach Merge); DHL-Foundation-Abschnitte gegen Branch `feature/dhl-foundation-tg84` auf Basis `07d7b2c` (wirksam nach Merge)
- **Verified against Backend `origin/main`:** `6e67fad` plus Paket TG-22 (Branch `claude/tg22-reference-enablement`, wirksam nach Merge); Package-C-Abschnitte gegen Branch `claude/package-c-operations-reconciliation` (wirksam nach Merge); TG22-Golden-Offer-Contract-Abschnitte gegen Branch `claude/tg22-golden-offer-contract` (wirksam nach Merge); TG22-Residential-Abschnitte gegen Branch `feature/tg22-residential-pricing` auf `5b6dfb3` (wirksam nach Merge); TG22-Same-Day-Abschnitte gegen Branch `feature/tg22-same-day-colfee` auf `4d60a23` (wirksam nach Merge); TG22-Package-A-Abschnitte gegen Branch `feature/tg22-product-details` auf Basis `b04a171` (wirksam nach Merge); TG22-Package-B-Abschnitte gegen Branch `feature/tg22-delivery-projection` auf Basis `18c559f` (wirksam nach Merge); TG23-Abschnitte gegen `origin/main` `2c4ef35` (Merge #356); TG23-Staging-Smoke-Evidenz gegen die Staging-App auf `2c4ef35`; TG22/TG23-Same-Day-Grundvertrag gegen Branch `feature/tg-same-day-reason-contract` auf Basis `e6f4436` (gemergt, #360); UPS-Vervollständigung gegen Branch `feature/complete-transglobal-ups-family` auf Basis `82b67a8` (wirksam nach Merge); TG29-Quote-Evidenz gegen die Staging-Umgebung (ein Full GetQuote, 2026-09-16); TG29-Buchungsbefund gegen die Staging-Umgebung (ein Full GetQuote, ein BookShipment, 2026-09-16); TG26-Freigabe gegen denselben Branch auf Basis `e9b74d6` (wirksam nach Merge) und TG26-Buchungsevidenz gegen die Staging-Umgebung (ein Full GetQuote, ein BookShipment, 2026-09-17); DHL-Foundation-Abschnitte gegen Branch `feature/dhl-foundation-tg84` auf Basis `454d8ed` (wirksam nach Merge) und TG84-Evidenz gegen die Staging-Umgebung (Full GetQuotes 1274 und 1275, ein BookShipment DE0052580, 2026-09-17)
- **Verification basis:** forensischer Read-only-Repository-Audit vom 2026-09-09, re-verifiziert bei der Integration am 2026-09-09; Transglobal-Stand im Paket TG-22 am 2026-09-11 gegen den Code geprüft

---

## 0. Zweck und Autorität

Dieses Dokument ist die kanonische, kompakte Projektquelle für ConfidaraExpress.

Es soll einer KI oder einem Entwickler genügend Kontext geben, um neue Aufgaben im richtigen Systemmodell zu bearbeiten, ohne veraltete Architekturannahmen aus älteren Projektgedächtnissen, historischen Branches oder langen CLAUDE.md-Chroniken ungeprüft zu übernehmen.

### Autoritätsreihenfolge

Bei Widersprüchen gilt:

1. Explizite aktuelle Produkt-/Geschäftsentscheidung des Menschen
2. Tatsächlicher aktueller Stand von `origin/main`
3. Datenbankverträge, Tests, CI und technisch erzwungene Invarianten
4. Dieses Canonical Project Context
5. `CLAUDE.md`, ältere Projektnotizen, Auditberichte und historische Dokumentation

Wenn dieses Dokument einem aktuellen `origin/main` widerspricht:

- nicht still korrigieren,
- nicht blind diesem Dokument folgen,
- die Abweichung melden,
- den tatsächlichen aktuellen Codezustand verifizieren,
- die kanonische Quelle anschließend aktualisieren.

### Grundsatz

VERIFY, DO NOT TRUST gilt für volatile technische Details.

Dieses Dokument enthält bewusst keine dauerhaft zu glaubenden:

- Testanzahlen,
- aktiven Branch-Namen,
- LOC-Zahlen,
- Patch-Versionen von Paketen,
- einmaligen Auditbefunde,
- ungeprüften Production-ENV-Werte.

---

## 1. Statusmodell

Jedes wichtige System ist nach Möglichkeit einem Status zugeordnet.

**ACTIVE_CURRENT** — Aktuell implementiert und Bestandteil des normalen Produktpfads.

**IMPLEMENTED_CONDITIONALLY** — Implementiert, aber abhängig von Feature Flag, ENV, Rolle, Kunde, Land, Provider oder anderem Gate.

**IMPLEMENTED_DISABLED** — Code ist vorhanden, der aktuelle Produktpfad ist aber bewusst deaktiviert.

**EXPERIMENTAL_FOUNDATION** — Architektonisches Fundament oder Teilimplementierung vorhanden, aber noch kein vollständig produktiver End-to-End-Vertrag.

**LEGACY_COMPATIBILITY** — Nur oder primär für historische Daten bzw. Rückwärtskompatibilität vorhanden.

**DEAD_OR_UNREFERENCED** — Vorhanden, aber nach aktueller Evidenz nicht Teil des aktiven Systems.

**UNKNOWN_RUNTIME_STATE** — Implementierung ist bekannt; tatsächlicher Production-Zustand ist aus dem Repository allein nicht beweisbar.

**PRODUCT_DECISION** — Bewusste Produkt-/Geschäftsentscheidung, die nicht allein aus Code abgeleitet werden darf.

---

## 1A. Confirmed Product Decisions — 2026-09-09

Die folgenden Punkte wurden nach dem Repository-Audit ausdrücklich menschlich bestätigt und sind damit aktuelle Produktentscheidungen.

### Transglobal-Angebote

**Status: PRODUCT_DECISION**

Transglobal-Angebote dürfen Kunden sichtbar sein. Außer dem Referenzservice 22, dem Expressversand (Service 23) und dem Standardversand Mehrpaket (Service 26, siehe unten) sind sie quote_only und nicht buchbar — das gilt auch für UPS Express (Service 29), bis die Rechnungsposition aus seinem Buchungssmoke geklärt ist, und für DHL Domestic Express (Service 84), bis die DHL-Trackingereignisse und der Stagingbestandteil ISC geklärt sind (beides siehe unten).

Die UI muss diesen Zustand korrekt kommunizieren und darf Nicht-Buchbarkeit nicht verschleiern.

Ein Transglobal-Angebot erscheint nur mit belegter Kontowährung EUR (`TRANSGLOBAL_ACCOUNT_CURRENCY`); ein Betrag unbekannter Währung wird nie mit Euro-Zeichen angezeigt.

### Transglobal-Buchung

**Status: PRODUCT_DECISION** (bestätigt 2026-09-11)

- Referenzservice ist **Service 22 (UPS Standard Single)**. Öffentliche Buchbarkeit ist technisch vorbereitet, **ausschließlich DE→DE**, ein Paket, Abholung an einem Tag nach heute oder als Abholung am selben Tag (siehe unten).
- **Service 23 (UPS Express Saver, kundenseitig „UPS · Expressversand")** folgt dem Referenzservice 22 als Golden Reference Standard (bestätigt 2026-09-15, TG23): dieselbe Fähigkeitsstruktur — DE→DE öffentlich buchbar vorbereitet, DE→EU Preisauskunft, Preisklasse EXPRESS mit dem Expressaufschlag des Kontos (ohne gültigen Wert der Standardaufschlag), höchstens ein Packstück als CE-Launchgrenze, höchstens 70 kg je Packstück, Art der Lieferadresse nach der Auswahl, Abholung am selben Tag, Transportabsicherung nach Warenwert, voraussichtliche Lieferung (Laufzeit „1": ein Tag), Tracking, Label „PDF · DIN A4 / Thermodruck", Kurzbeschreibung „Schneller Expressversand für eilige Sendungen.". Keine Zustelluhrzeit, keine Garantie; Carrier UPS sichtbar, Einkaufsquelle nie. Status: implementiert (Backend gemergt); **Staging-Smoke bestanden, Buchungsevidenz des Anbieters bestätigt** (2026-09-15: ein GetQuote, ein BookShipment mit Abholung am selben Tag, Privatadresse und Absicherung — Anbieterrechnung netto = TotalCost + Same-Day-Gebühr + Absicherung auf den Cent, Absicherung steuerfrei, Labels A4 und Thermal mit derselben AWB).
- **UPS-Inventar** (bestätigt 2026-09-16, aktualisiert 2026-09-17): Transglobal führt für UPS genau die Services 22, 23, 26 und 29. **Service 22: DONE** (Referenzservice). **Service 23: DONE** (Staging-Buchungssmoke bestanden). **Service 26: DONE** (TG26 — Staging-Buchungssmoke bestanden, freigegeben für den belegten Umfang). **Service 29: quote_only** (Staging-Buchungssmoke nicht bestanden, siehe unten).
- **Service 29 (UPS Express, kundenseitig „UPS · Express") — Implementierung vollständig, Buchungsfreigabe evidenzgebunden** (bestätigt 2026-09-16): dieselbe Fähigkeitsstruktur wie Service 23 (Preisklasse EXPRESS mit dem Expressaufschlag des Kontos, Art der Lieferadresse nach der Auswahl, Abholung am selben Tag, Transportabsicherung nach Warenwert, Tracking, Label „PDF · DIN A4 / Thermodruck", Kurzbeschreibung „Schneller Expressversand für eilige Sendungen.", voraussichtliche Lieferung als Werktagsprognose ohne Uhrzeit), aber ausschließlich mit belegten Werten: höchstens ein Packstück als CE-Grenze; kein Höchstgewicht, kein Volumendivisor, keine Länge, kein Gurtmaß, keine Zeitzusage. Der Name „Express" ist neutral und innerhalb von UPS eindeutig (neben „Expressversand" der 23), ohne „10:30", „12:00", „vormittags" oder „garantiert", und entspricht dem CE-Tarifnamen des JUMiNGO-Pendants „EXPRESS ®". Service 29 bleibt quote_only, bis ein gezielter Staging-Buchungssmoke bestanden ist; die Freigabe ist danach allein der Wechsel `publicBookable`/`publicBookableScopes` (DE→DE) im Policy-Eintrag. **Befund 2026-09-16:** der freigegebene Staging-Buchungssmoke ist nicht bestanden — die Anbieterrechnung trug neben Fracht, Zuschlag Privatadresse und Absicherung eine Position „Collection" über 2,00 € netto, die der Full Quote nicht nannte; ihre Regel ist ungeklärt und beim Anbieter angefragt. Service 29 bleibt deshalb quote_only — keine Pauschale, kein Aufschlag, kein Puffer.
- **Service 26 (UPS Standard Multi, kundenseitig „UPS · Standardversand Mehrpaket") — DONE, öffentlich buchbar für genau den belegten Umfang** (bestätigt 2026-09-17, TG26): Staging-Buchungssmoke bestanden (Full Quote 1267, BookShipment DE0052578 — zwei gleiche Packstücke, Privatadresse, Absicherung, späterer Abholtag; Anbieterrechnung = Fracht + einmal Zuschlag Privatadresse + Absicherung auf den Cent, keine weitere Position). Freigegeben: ausschließlich DE→DE, höchstens zwei Packstücke (CE-Launchgrenze aus der Evidenz — mehr ist nicht belegt), N gleiche Packstücke nach dem CE-Modell „Identische Pakete" in stabiler Reihenfolge (Angebotsidentität und Revalidierung binden Stückzahl, Maße und Gewicht), Preisklasse STANDARD, Art der Lieferadresse nach der Auswahl (der Zuschlag kommt aus dem frischen Full Quote; gemessen einmal je Sendung), Transportabsicherung nach Warenwert, Tracking und Druckpflicht. Belege wie gemessen: ein A4- und ein Thermodruck-PDF mit je einer Seite je Paket („Versandlabel (A4)", „Versandlabel (Thermodruck)"). Nicht freigegeben: Abholung am selben Tag, Höchstgewicht, Volumendivisor, Produktprofil, voraussichtliche Lieferung (die Karte zeigt die Laufzeit „1–5 Tage"), EU-Routen. Die Staging-Platzhalter-Sendungsnummer ist keine Aussage über Produktion: Belege, Tracking und Sendungsliste verarbeiten eine wie mehrere Sendungsnummern generisch („Versandlabel 1 von N (A4)" usw., nur echte Anbieterlabels, keine Dubletten), ohne ServiceID-Weiche und ohne Eingriff in Carrier-PDFs.
- **Service 84 (DHL Domestic Express, kundenseitig „DHL Express · Domestic Express") — vollständig kuratiert, quote_only** (bestätigt 2026-09-17, DHL Foundation): Staging-Buchungssmoke bestanden (Full Quote 1275, BookShipment DE0052580, Anbieterrechnung INV-0040781 — zwei gleiche Packstücke je 2 kg, Geschäfts- an Privatadresse, Direktabholung am nächsten Werktag, Absicherung 500/20; Rechnung = Fracht + Absicherung + übriger Bestandteil ISC auf den Cent, keine Position „Collection", kein Zuschlag Privatadresse, Absicherung steuerfrei; ein A4- und ein Thermal-PDF mit je drei Seiten, zwei DHL-Stücknummern und eine gemeinsame Sendungsnummer, die die Trackingreferenz ist). Kuratiert ist genau das Belegte: Preisklasse EXPRESS, Abholung beim Absender, nur DE→DE, höchstens zwei Packstücke (CE-Launchgrenze), Tracking, Druckpflicht, Transportabsicherung und die Art der Lieferadresse als Frage OHNE Zuschlag (siehe nächster Punkt). Nicht kuratiert: Höchstgewicht, Maße, Volumendivisor, Produktprofil und Ausschlüsse, Abholung am selben Tag (trotz Abholschluss im Quote), Zeit- oder Lieferzusage, CE-Prognose, Stücknummern. ISC (im Staging als Testzuschlag bezeichnet, 50,50 € je Packstück) ist ein Stagingbefund: ein gewöhnlicher Preisbestandteil des frischen Quotes, ohne Sonderregel und ohne Betrag im Code; seine Produktionsbedeutung ist offen. Die Freigabe bleibt aus, bis die DHL-Trackingereignisse (die bekannte Ereigniszuordnung stammt aus UPS-Belegen) und ISC geklärt sind; sie ist danach allein der Wechsel der beiden Freigabefelder.
- **Art der Lieferadresse ohne Zuschlag** (bestätigt 2026-09-17, DHL Foundation): ein Service kann die Adressart erheben und dem Anbieter übermitteln, ohne dass ein Zuschlag Teil des belegten Anbietervertrags ist. Beide Szenarien tragen dann centgenau denselben Preis; kein Zuschlag wird angekündigt, berechnet oder gebucht. Taucht im frischen Quote dennoch ein Zuschlag oder eine andere Preisdifferenz zwischen Geschäfts- und Privatadresse auf, ist das ein Vertragswechsel: nicht bepreisen, nicht buchen, bis der Vertrag neu geprüft ist. Der Modus ist generisch (keine ServiceID-Weiche) und für jeden Carrier nutzbar; heute trägt ihn nur Service 84.
- **Transportabsicherung ist eine kuratierte Fähigkeit** (bestätigt 2026-09-16): das Absicherungsextra des Anbieters allein genügt nicht — angeboten, bepreist und gebucht wird sie nur für Services, deren Eintrag sie trägt (22, 23, 26, 29; seit der DHL Foundation auch 84, dort bis zur Freigabe weder angeboten noch bepreist).
- Alle anderen Transglobal-Services bleiben nicht öffentlich buchbar.
- **Art der Lieferadresse nach der Angebotsauswahl** (Service 22, bestätigt 2026-09-14): „Neue Sendung" fragt vor dem Vergleich keine Adressart. Das Angebot zeigt einen vorläufigen Geschäftspreis; erst nach der Auswahl fragt die Buchung genau „Art der Lieferadresse" mit „Geschäftsadresse + 0,00 €" und „Privatadresse + X,XX €". Eine Abholadressfrage gibt es nicht — die Abholadresse ist für die bindungsrelevanten Quotes serverseitig geschäftlich.
- X ist nie hartkodiert: zwei vollständige serverseitige Kundenszenarien (geschäftlich/privat) mit demselben Aufschlag, derselben MwSt. und demselben Sendungskontext; X = Privat − Geschäft in ganzen Cent. Aufschlag und MwSt. gelten auf den vollständigen Anbieterpreis einschließlich Zuschlag (kein 1:1-Durchreichen). Kundenbezeichnung ausschließlich „Zuschlag Privatadresse".
- **Abholung am selben Tag** (Service 22, bestätigt 2026-09-14): heute buchbar bis zum wirksamen Abholschluss = Abholschluss des frischen Anbieterquotes minus 15 Minuten (Europe/Berlin; keine feste Uhrzeit, keine feste Gebühr). Die Gebühr ist Einkauf und durchläuft Aufschlag und MwSt. mit dem übrigen Anbieterpreis; der Kartenpreis enthält den Zuschlag, darunter „Zuschlag für Abholung am selben Tag: +X,XX €" und „Abholung heute möglich bis HH:MM Uhr". Nach dem wirksamen Abholschluss bleibt das Angebot sichtbar, aber nicht auswählbar („Abholung heute nicht mehr möglich." / „Bitte wählen Sie einen späteren Abholtag."). Keine Checkbox, kein eigener Bindungsschritt; kombinierbar mit Privatadresse und Absicherung. Gilt für die Services 22 und (seit TG23) 23; Service 29 trägt dieselbe Fähigkeit, verkauft sie aber erst mit seiner Freigabe; Service 26 hat sie nicht (ein heutiger Abholtag ist dort nie buchbar); JUMiNGO bleibt unverändert. **Grundvertrag (bestätigt 2026-09-16):** Einzige Quelle des Abholschlusses ist der frische Full-Quote — der Anbieter nennt ihn nur mit Information und solange er nicht vorbei ist; es gibt keine zweite Quelle, keinen Ersatzwert (keine feste Uhrzeit, keine feste Gebühr) und keinen zusätzlichen Providerrequest. Fehlt er, bleibt die Abholung heute gesperrt („Abholung heute für dieses Angebot nicht verfügbar."); sind Abholschluss-, Gebühren- oder Preisdaten unbrauchbar, ebenso („Abholung heute kann derzeit nicht bestätigt werden."); der Hinweis lautet jeweils „Bitte wählen Sie einen späteren Abholtag.". Eine gesperrte Abholung heute zeigt den Abholtag, aber keine „bereit ab"-Zeit.
- **Voraussichtliche Lieferung** (Service 22, bestätigt 2026-09-14; seit TG23 auch Service 23; Service 29 zeigt sie bereits als Preisauskunft): Der Anbieter nennt nur eine Laufzeit. ConfidaraExpress rechnet daraus ab dem gewählten Abholtag eine eigene voraussichtliche Lieferung — gezählt werden Montag bis Freitag, Samstag und Sonntag werden übersprungen, Feiertage nicht berücksichtigt (die Oberfläche sagt das dazu); „1–2" ergibt einen Zeitraum, „1" einen Tag, „1+" nur „ab". Keine Uhrzeit, keine Anbieterzusage, keine Garantie; keine Wirkung auf Preis, Buchbarkeit, Sortierung, Buchung, Sendungs-ETA oder Kennzahlen. JUMiNGO-Zustelldaten bleiben getrennt und autoritativ.
- JUMiNGO bekommt keine Adressfrage, keinen neuen Providerweg und keine zusätzliche Providerlast.
- Die Transglobal-Konten (Staging und späteres Production-Konto) sind EUR-Konten; ConfidaraExpress unterstützt für Transglobal-Public-Booking zunächst ausschließlich EUR-Konten. Es gibt keine Währungsumrechnung.
- Production-Aktivierung erfolgt manuell und erst nach Operations-Minimum, Legal/Datenschutz und finaler Activation-Checklist.

### Customs / Zoll

**Status: PRODUCT_DECISION**

ConfidaraExpress startet vorerst ohne Zollabwicklung.

Customs bleibt deaktiviert. Drittland-/Customs-Flows dürfen nicht beiläufig reaktiviert werden.

Eine spätere Wiedereinführung ist eine eigenständige Produktentscheidung.

### White Label

**Status: PRODUCT_DECISION / CRITICAL UX RULE**

JUMiNGO, Transglobal und andere zugrunde liegende Versandprovider dürfen Kunden nicht als Provider-/Bezugsquelle angezeigt werden.

Der tatsächlich ausführende Carrier darf sichtbar sein, soweit dies für das Versandprodukt erforderlich ist.

### CE-BS

**Status: PRODUCT_DECISION**

CE-BS darf intern weiter existieren und technisch verwendet werden.

Sie soll in kundenorientierten Oberflächen, Dokumenten und Kommunikation nicht als sichtbare bzw. primäre Vorgangsnummer erscheinen.

### Teststrategie

**Status: PRODUCT_DECISION**

Lokal werden grundsätzlich die für eine Änderung relevanten gezielten Tests ausgeführt.

Die vollständige E2E-Suite wird lokal nur ausgeführt, wenn dies für Umfang/Risiko der Änderung sinnvoll ist.

CI darf und soll unabhängig davon die vollständige E2E-Suite als Merge-Gate erzwingen.

### Gemeinsame Kontextquelle

**Status: PRODUCT_DECISION**

Die fertige CANONICAL_PROJECT_CONTEXT soll als gemeinsame projektweite Kontextquelle sowohl für ChatGPT als auch für Claude verwendet werden.

Repo-spezifische CLAUDE.md-Dateien dürfen zusätzliche lokale Arbeitsregeln enthalten, aber dieser kanonischen projektweiten Quelle nicht widersprechen.

### Betriebsstatus

**Status: PRODUCT_DECISION / CURRENT BUSINESS STATE**

ConfidaraExpress befindet sich aktuell im Pre-Live-Zustand ohne echte Kunden.

Derzeit haben nur die beiden Betreiber/Geschäftspartner Zugriff; die Anwendung ist login-geschützt.

Dieser Zustand erlaubt eine risikobasierte Priorisierung von Sicherheitsmaßnahmen, hebt jedoch grundlegende Sicherheitsinvarianten nicht auf.

Mindestens Authentifizierung, Autorisierung, Tenant-Grenzen, Secret-Schutz, serverseitige Preis-/Buchungsvalidierung, Provider-Kill-Switches und Schutz vor unbeabsichtigten Produktivaktionen bleiben auch Pre-Live relevant.

---

## 2. Stable Product Identity

**Status: STABLE / PRODUCT_DECISION**

ConfidaraExpress ist eine B2B-Versandplattform für registrierte und freigeschaltete Geschäftskunden.

Kein Gastmodus.

Die Plattform verbindet insbesondere:

- Versandpreisberechnung
- Tarif-/Angebotsvergleich
- Buchung
- Versanddokumente
- Tracking
- Auftragsbestätigungen
- Rechnungen
- Adressbuch
- Lagerverwaltung
- Auftragsverwaltung
- Kundenbereich
- Administration

ConfidaraExpress ist inzwischen ein zusammenhängendes Produkt.

Änderungen niemals isoliert betrachten. Auswirkungen auf andere Systemteile sind aktiv zu prüfen.

---

## 3. Stable Architecture

### 3.1 Frontend

**Status: ACTIVE_CURRENT**

Frontend-Grundmodell:

- React-SPA
- Vite
- JavaScript
- kein TypeScript
- statische Auslieferung über nginx

Relevante logische Schichten liegen aktuell insbesondere unter:

- `src/api/`
- `src/components/`
- `src/config/`
- `src/context/`
- `src/hooks/`
- `src/pages/`
- `src/routes/`
- `src/styles/`
- `src/testing/`
- `src/utils/`
- `src/assets/`

#### Wichtige Regel

Keine parallele API-Schicht unter erfundenen Verzeichnissen wie `services/` oder `lib/` anlegen, solange die aktuelle Architektur nicht ausdrücklich geändert werden soll.

Backend-Kommunikation im bestehenden `src/api/`-Vertrag integrieren.

#### Frontend ist nicht Source of Truth für kritische Geschäftslogik

Insbesondere nicht für:

- endgültige Preise
- Provider-/Tarifauswahl
- Buchungsentscheidung
- Voucherprüfung
- Rechnungslogik
- Legal-Gültigkeit
- Lagerbestand

### 3.2 Backend

**Status: ACTIVE_CURRENT**

Backend-Grundmodell:

- Node.js
- Express
- PostgreSQL

Das Backend ist zentrale Source of Truth für:

- Benutzer
- Rollen und Berechtigungen
- Preisberechnung
- Kundenaufschläge
- Providerkommunikation
- Offers
- Buchungen
- Voucher
- Versicherung
- Sendungen
- Rechnungen
- Dokumente
- Legal
- Lager
- Aufträge
- E-Mail-Zustellung
- Audit-/Statusinformationen

#### Schemaevolution

Aktuell existiert kein separates Migrationsframework.

Die Schemaevolution erfolgt über das idempotente `db/init.js`, unter anderem mit:

- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- gezielten Backfills

`db/init.js` wird vor `app.listen` ausgeführt.

Keine neue parallele Migrationsarchitektur einführen, ohne dies ausdrücklich als Architekturänderung zu behandeln.

#### Dokumentpersistenz

Kunden- und Geschäftsdokumente werden aktuell als BYTEA in PostgreSQL persistiert.

Nicht ohne Analyse von einem Dateisystem- oder Objektspeicher-Modell ausgehen.

---

## 4. Repository-Topologie

**Status: CURRENT VERIFIED STATE**

ConfidaraExpress besteht aus getrennten Frontend- und Backend-Repositories.

Der Backend-Repository-Wrapper enthält zusätzlich einen alten Gitlink auf `confidaraexpress-preisrechner`, ohne passende `.gitmodules`-Konfiguration.

Dieser Zeiger ist aktuell:

**DEAD_OR_UNREFERENCED**

Er darf nicht als Beweis für eine funktionierende Monorepo-/Submodule-Architektur interpretiert werden.

---

## 5. Critical System Invariants

Diese Regeln sind besonders wichtig. Änderungen dürfen sie nicht unbeabsichtigt verletzen.

### 5.1 Server bestimmt Preis, Provider und Tarif

**Status: ACTIVE_CURRENT**

Der Client darf Angebotswerte darstellen und vergleichen, aber niemals den finalen Provider oder Tarif autoritativ bestimmen.

Die Buchung wird serverseitig gegen den gespeicherten Angebotszustand validiert.

Auf der Buchungsseite gibt es genau **eine** Preisprojektion: Serverantwort → Price-View-Model → alle Preisflächen (ausgewähltes Angebot, Live- und Sticky-Leiste, Preiszusammenfassung, Absicherungskarten, Buchungsgate). Keine Fläche hält eine eigene Preiswahrheit; der Client addiert, rundet und rekonstruiert keine Beträge. Mit Absicherung stammen Netto- **und** Bruttogesamtbetrag aus der Neubepreisung (`customerTotalNet`, `customerTotalGross`, serverseitig centgenau gebildet); fehlt `customerTotalNet`, zeigt der Client keinen Nettogesamtbetrag. Nach der Buchung gilt ausschließlich `booking.amount` (TG22 Golden Offer Contract, wirksam nach Merge).

Preisbestandteile (Versand, gegebenenfalls „Zuschlag für Abholung am selben Tag", gegebenenfalls „Zuschlag Privatadresse", gegebenenfalls die steuerfreie Absicherung) sind serverseitig eingefrorene Darstellungen derselben autoritativen Summen (`lib/priceComponents.js`). Sie ändern nie einen Gesamtbetrag; der Client zeigt sie und addiert sie nicht (TG22 Residential und TG22 Same-Day, wirksam nach Merge).

Evidence anchors:

- `lib/booking/offerRouting.js`
- `lib/booking/bookHandler.js`
- `lib/providers/transglobal/revalidateBeforeBooking.js`

### 5.2 offerId ist der Buchungsbezug

**Status: ACTIVE_CURRENT**

Die opake servergenerierte `offerId` ist der zentrale Buchungsbezug.

Keine neue Logik soll Provider oder Tarif aus sichtbaren Clientfeldern ableiten.

### 5.3 Kein stiller Fallback bei preisrelevanten Angaben

**Status: ACTIVE_CURRENT**

Fehlende oder unklare preisrelevante Sendungsangaben dürfen nicht durch erfundene Ersatzwerte vervollständigt werden.

Fail-closed ist bei kritischer Geschäftslogik zu bevorzugen.

### 5.4 Dreiwertigkeit preisrelevanter Antworten erhalten

**Status: ACTIVE_CURRENT**

Bei booleschen Fragen gilt:

- `true`
- `false`
- unbeantwortet

`false` ist eine gültige Antwort und darf niemals mit „fehlt" gleichgesetzt werden.

Die Abholadresse des Transglobal-Referenzservices ist keine unbeantwortete Frage, sondern eine serverseitige Produktfestlegung (`false`) für die bindungsrelevanten Quotes. Eine nicht gewählte Zustelladressart wird nie zu `false`: ohne gebundene Wahl wird nicht gebucht (TG22 Residential).

### 5.5 Preisrelevante Buchungsdaten werden eingefroren

**Status: ACTIVE_CURRENT**

Preisbestimmende bzw. buchungsrelevante Angaben werden vor bzw. im Buchungsprozess serverseitig persistiert und für die Buchungsentscheidung aus dem gespeicherten Zustand gelesen.

Client-Abweichungen dürfen den gespeicherten Vertrag nicht still überschreiben.

Die Art der Lieferadresse des Transglobal-Referenzservices wird am Angebot gebunden (`shipment_offers`, Compare-and-Swap auf die Preisrevision), nicht an der Sendung; die Buchung liest sie ausschließlich von dort (TG22 Residential).

### 5.6 Historische Dokumente bleiben historisch korrekt

**Status: ACTIVE_CURRENT**

Bestehende Rechnungen, Auftragsbestätigungen und andere historische Belege werden durch spätere Änderungen nicht rückwirkend verändert.

Relevante Kunden-, Aussteller-, Zahlungs- und Legalinformationen werden als historische Snapshots bzw. Versionsreferenzen erhalten.

### 5.7 Legal Freeze

**Status: ACTIVE_CURRENT**

Die bei einem Vorgang gültigen Legal-Versionen bleiben diesem Vorgang dauerhaft zugeordnet.

Retry, Resend oder späterer Download dürfen nicht auf die heute aktuelle Legal-Version wechseln.

Kein Current-Fallback für historische Vorgänge.

Kein stiller Backfill alter Vorgänge auf neue Legal-Texte.

### 5.8 Mandantentrennung

**Status: ACTIVE_CURRENT**

Mandanten-/Nutzertrennung soll in der eigentlichen Datenbankabfrage erzwungen werden.

Beispielprinzip:

```
WHERE id = ... AND user_id = ...
```

Nicht: erst global laden und anschließend im Anwendungscode prüfen.

### 5.9 Authentifizierung und Autorisierung

**Status: ACTIVE_CURRENT**

JWT allein ist nicht die vollständige Autoritätsquelle.

Der Backend-Auth-Pfad prüft Benutzerstatus und Rolle pro Request erneut gegen die Datenbank.

Ein gesperrter Benutzer darf nicht bis zum Ablauf eines alten JWT weiter autorisiert bleiben.

Evidence anchor: `middleware/auth.js`

### 5.10 Bestandsatomik

**Status: ACTIVE_CURRENT**

Bestandsänderungen verwenden Transaktionen, `SELECT ... FOR UPDATE` und atomare bedingte Updates.

Keine Bestandslogik implementieren, die konkurrierende Änderungen nur im Anwendungsspeicher koordiniert.

Evidence anchor: `lib/inventory.js`

### 5.11 Unklarer Provider-Buchungsausgang darf nicht als Fehlbuchung gelten

**Status: ACTIVE_CURRENT**

Wenn der externe Provider-Ausgang nach einem Buchungsaufruf nicht eindeutig bekannt ist, darf das System nicht so tun, als sei sicher nichts gebucht worden.

Ein zweiter unkontrollierter Buchungsversuch könnte eine Doppelbuchung erzeugen.

Unsichere Ergebnisse sind entsprechend als Pending/Unknown zu behandeln.

Package C (wirksam nach Merge): Jeder mutierende Providercall schreibt vorher einen Buchungsversuch. Bleibt der Ausgang unklar, bleibt die Sendung gesperrt (`booking`), bis ein Admin in der Buchungsklärung entscheidet — providerneutral für JUMiNGO und Transglobal:

- „gebucht" schließt aus dem eingefrorenen Stand über denselben Abschluss wie eine normale Buchung ab, ohne Anbieterkontakt,
- „nicht gebucht" gibt die Sendung als Entwurf frei (ein neues Angebot ist nötig) und informiert den Kunden neutral,
- entscheidbar ist nur der neueste Versuch einer Sendung und erst nach einem Mindestalter,
- kein automatischer Retry, keine automatische Providerstornierung, keine automatische Erstattung.

Kunden sehen eine gesperrte Sendung neutral als „Buchungsstatus wird geprüft", ohne Aktion und ohne Anbieterangaben.

Evidence anchors: `lib/booking/reconciliationActions.js`, `lib/booking/reconciliationPolicy.js`, `docs/runbook-buchungsklaerung.md`

### 5.12 White-Label-Grenze

**Status: ACTIVE_CURRENT / PRODUCT_DECISION**

Providername und interne Providerreferenzen sollen nicht in kundenorientierten Oberflächen oder Kundentexten erscheinen.

Der tatsächliche Carrier darf sichtbar sein, soweit dies für das Versandprodukt erforderlich ist.

**Produktentscheidung 2026-09-13 — Tarif-ID:** Die bestehende numerische Tarif-ID eines JUMiNGO-Angebots (etwa „Tarif-ID 3708") darf in den Angebotsdetails sichtbar bleiben — ohne Providernamen daneben. Das ist keine allgemeine Freigabe interner Providerreferenzen: Transglobal-ServiceID, Quote-, Buchungs- und Fehlerreferenzen, Einkaufspreise, interner Aufschlag und Rohdaten erscheinen nie kundenseitig, und ein technischer Feldname (`shipper_tariff_id`) steht nie als Text in der Oberfläche.

### 5.13 Rohwerte nicht ungefiltert in die UI

**Status: ACTIVE_CURRENT**

Interne Backendstatuswerte, Fehlercodes und Providerrohmeldungen werden nicht ungefiltert als Kundentext ausgegeben.

Frontendseitige Normalisierungs-/Darstellungslogik respektieren.

### 5.14 Anonymisierte Konten werden nicht beliefert

**Status: ACTIVE_CURRENT** (Package C, wirksam nach Merge)

Die Kontoanonymisierung ersetzt personenbezogene Daten in place durch Tombstones; Rechnungen, Rechnungssnapshots, Rechnungszustellungen, Providerbelege und Labelbytes bleiben als Belege unverändert.

Sie umfasst auch die Zusatzempfänger der Sendungen, die Empfängeradressen der Zustellhistorien und die Freitexte von Stornierungsanfragen. Ein erneutes Anonymisieren zieht das für früher anonymisierte Konten idempotent nach.

An eine anonymisierte Adresse wird nie eine E-Mail gesendet — weder Zusatzbenachrichtigung noch Auftragsbestätigung noch Rechnung.

Evidence anchors: `lib/anonymizeContactTraces.js`, `lib/anonymize.js`

---

## 6. Multi-Provider Architecture

### 6.1 Grundmodell

**Status: ACTIVE_CURRENT**

ConfidaraExpress ist kein Single-Provider-System mehr.

Aktuell registrierte Versandprovider:

- `jumingo`
- `transglobal`

Evidence anchor: `lib/shipmentProvider.js`

Neue Geschäftslogik muss grundsätzlich providerneutral gedacht werden, sofern sie nicht ausdrücklich providerbezogen ist.

#### Verbotene Annahme

Nie `provider || "jumingo"` oder semantisch vergleichbare stille Ableitungen verwenden.

Ein fehlender Provider ist heute kein sicherer Beweis für JUMiNGO.

Unklare Legacy-Zuordnung wird fail-closed behandelt.

### 6.2 JUMiNGO

**Status: ACTIVE_CURRENT**

JUMiNGO ist aktuell der produktiv buchbare Providerpfad.

Providerpreise kommen serverseitig.

ConfidaraExpress wendet serverseitige Preislogik an und bestätigt den endgültig buchbaren Preis erneut.

Produktive Providerbuchungen dürfen nicht für normale Tests verwendet werden.

Bestehende Sandbox-/Testmechanismen respektieren.

Ein unklarer JUMiNGO-Bestellausgang wird über die providerneutrale Buchungsklärung aufgelöst (5.11), nicht durch einen manuellen Statusrückschritt (Package C, wirksam nach Merge).

### 6.3 Transglobal Quotes

**Status: ACTIVE_CURRENT / UNKNOWN_RUNTIME_STATE**

Transglobal-Quote-Unterstützung ist implementiert.

Transglobal-Angebote können in die gemeinsame Angebotsliste integriert werden.

Ob sie in Production tatsächlich erscheinen, hängt unter anderem von der produktiven Konfiguration/Credentials ab.

Dieser Runtime-Zustand ist aus dem Repository allein nicht beweisbar.

### 6.4 Transglobal Booking

**Status: IMPLEMENTED_CONDITIONALLY / DEFAULT DISABLED**

Der Transglobal-Buchungspfad ist implementiert und für Service 22 real gegen die deutsche Staging-Umgebung belegt (zwei Buchungen, mit und ohne Zusatzabsicherung, Labels A4 und Thermal, TrackOrder).

Öffentliche Buchbarkeit ist eine Konjunktion; alle Bedingungen müssen zutreffen:

- Service `publicBookable` **und** Routenbereich in `publicBookableScopes` (heute die Services 22, 23 und 26, nur DE→DE),
- `TRANSGLOBAL_PUBLIC_BOOKING_ENABLED` (Produktschalter, default aus),
- belegte Kontowährung `TRANSGLOBAL_ACCOUNT_CURRENCY=EUR` (default nicht gesetzt ⇒ kein TG-Angebot),
- Full Quote mit Buchungsreferenz, kuratierte Übergabeart und Preisklasse, gebundene Art der Lieferadresse (Services 22, 23 und 26: nach der Angebotsauswahl; ohne Bindung nicht buchbar), Packstückgrenzen der Service-Policy (22 und 23 höchstens eins, 26 höchstens zwei),
- bei Abholung ein Abholtag nach heute; heute nur als Abholung am selben Tag eines Services mit dieser Fähigkeit (Services 22 und 23) vor dem wirksamen Abholschluss.

Angebotsvertrag des Referenzservices (TG22 Golden Offer Contract): Leistungsname „Standardversand" (CE-Klassifikation wie ein Standardangebot der anderen Einkaufsquelle; eingefroren an Angebot, Sendung und Rechnung), Abholvertrag aus Abholtag und „bereit ab 09:00 Uhr" (kein Zeitfenster, kein „bis", keine Fensterwahl), Laufzeit „1–2 Tage" (Zustelldaten erscheinen nur, wo ein Anbieter sie liefert; dazu die voraussichtliche Lieferung als CE-Prognose, siehe unten), Labelformate „PDF · DIN A4 / Thermodruck" ohne Formatwahl, höchstens ein Packstück, zusätzliche Transportabsicherung nach Warenwert (bis 50 € Grundabsicherung ohne Aufpreis, oberhalb der Höchstdeckung kein Zusatz, sonst Preis ausschließlich über die Neubepreisung). Abholung am selben Tag siehe unten (TG22 Same-Day).

Die Bestellung braucht zusätzlich `TRANSGLOBAL_BOOKING_ENABLED` (technischer Kill-Switch, default aus). Angebot und Buchung prüfen dieselbe Quelle.

Art der Lieferadresse (TG22 Residential, wirksam nach Merge): Das Vergleichsangebot trägt den echten Geschäftspreis eines Full Quotes ohne Adressart (`priceCompleteness: "indicative"`, `requiredPriceInputs: ["deliveryIsResidential"]`, `unavailableReason: "price_inputs_required"` — auswählbar, nicht buchbar). Nach der Auswahl bepreist `POST /api/offers/price-input-options` genau zwei vollständige Full Quotes parallel (kein Retry, 15-Minuten-Snapshot am Angebot, fail closed bei jeder Inkonsistenz); `POST /api/offers/price-inputs` bindet ohne Providerkontakt aus diesem Snapshot (neue Preisrevision, eine gebundene Absicherung wird zurückgesetzt). `/book` verlangt Bindung und `offerRevision`, revalidiert mit der gebundenen Wahl und prüft Fracht, Zuschlag, Einkauf, Aufschlag und Kundenpreis gegen die Bindung; jede Abweichung verlangt eine neue Wahl.

Abholung am selben Tag (TG22 Same-Day, wirksam nach Merge): Für Service 22 — seit TG23 ebenso für Service 23 — ist ein heutiger Abholtag buchbar, solange die Berliner Uhrzeit vor dem wirksamen Abholschluss liegt (`SameDayCollectionCutOffTime` des frischen Quotes minus 15 Minuten). Die Gebühr (`COLFEE`, optionales Extra außerhalb von `TotalCost`) wird zum Einkauf addiert und durchläuft die zentrale Preisfunktion; der Anbieter berechnet sie bei einem heutigen `CollectionDate` automatisch, BookShipment sendet kein Accessory. ReadyFrom ist die Uhrzeit der Bestellung, aufgerundet auf die Viertelstunde, mindestens die gespeicherte Bereitzeit. Angebot, Optionen, Bindung, Neubepreisung und `/book` prüfen dasselbe Zeitfenster; eine letzte Schranke unmittelbar vor der Bestellung verhindert eine Bestellung nach dem wirksamen Abholschluss (`409 SAME_DAY_COLLECTION_UNAVAILABLE`). Kein Schalter, keine ENV-Änderung, keine Schemaänderung; alle anderen Services und JUMiNGO unverändert. Grundvertrag (wirksam nach Merge): Einzige Quelle des Abholschlusses ist `SameDayCollectionCutOffTime` des frischen Full-Quotes — Transglobal hat keine eigene Cutoff-Schnittstelle, und das Feld fehlt, wenn dem Anbieter die Information fehlt oder der Abholschluss zum Quote-Zeitpunkt vorbei ist. Kein Ersatzwert, keine zweite Quelle, kein zusätzlicher Providerrequest; ein Preisvergleich stellt weiterhin genau einen Quote. Öffentlich unterscheidet das Angebot `same_day_unavailable` (zeitlich abgelaufen), `same_day_unconfirmed` (kein Abholschluss im Quote) und `same_day_unverifiable` (unbrauchbare Abholschluss-, Gebühren-, Preis- oder Uhrdaten; ebenso jede unbekannte Ursache); jede 409 `SAME_DAY_COLLECTION_UNAVAILABLE` trägt dazu `sameDayUnavailableKind` (`expired` / `unconfirmed` / `unverifiable`) und den Text dieser Art, nie einen internen Grund. Ist die Abholung heute für ein Angebot nicht verkäuflich, trägt die Karte `collectionReadyFrom: null` und nur den Abholtag; der gespeicherte Abholvertrag bleibt unverändert.

Produktdetails (TG22 Package A, wirksam nach Merge): Service 22 trägt ein kuratiertes Produktprofil — wirtschaftlicher Standardversand für weniger eilige Sendungen, ein Packstück je Sendung, höchstens 70 kg je Packstück, Volumendivisor 5.000 ausschließlich zur Erklärung des Abrechnungsgewichts, Paletten und Koffer nicht zugelassen. Öffentlich erscheint es als `serviceDetails` (Codes und Zahlen, dazu die Absicherungsgrenzen 50 € / 2.500 €) und als Tarifgrenze `weight <= 70`; seit TG23 trägt Service 23 beides ebenso (Kurzbeschreibung „Schneller Expressversand für eilige Sendungen."). Die Service-Policy setzt die 70-kg-Grenze an denselben Stellen durch wie die Packstückzahl (Vergleich, Optionen, Revalidierung, `/book`): genau 70,0 kg ist erlaubt, darüber entsteht kein Angebot und keine Buchung, ohne belegtes Gewicht ist die 22 gesperrt. Das Abrechnungsgewicht bleibt der Anbieterwert, die Laufzeit „1–2 Tage" ohne Uhrzeit; ein Datum steht nur in der getrennten voraussichtlichen Lieferung (siehe unten). Nicht Teil des Profils: Access Point, Samstagszustellung, Länge und Gurtmaß, Zustellzusagen, statische Zuschläge oder Preise. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; JUMiNGO und alle anderen Services unverändert.

Voraussichtliche Lieferung (TG22 Package B, wirksam nach Merge): Transglobal nennt keine Zustelldaten, nur `TransitTimeEstimate`. Für Service 22 und seit TG23 für Service 23 rechnet ConfidaraExpress daraus eine eigene Prognose `deliveryProjection { kind: "estimated", dateMin, dateMax }`: Basis ist der Abholtag des Angebots (`requestedShippingDate`, Tag 0), gezählt werden Montag bis Freitag, Samstag und Sonntag werden übersprungen, Feiertage nicht berücksichtigt; `1-2` ergibt einen Zeitraum, `1` einen Tag, `1+` nur `dateMin`. Keine Prognose ohne gültigen Abholtag, bei unlesbarer Laufzeit oder wenn eine heutige Abholung nicht mehr möglich ist. Keine Uhrzeit, keine Anbieterzusage. Die Prognose steht nie in `deliveryDateMin/Max`, wird nicht gespeichert und hat keine Wirkung auf Preis, Buchbarkeit, Sortierung, Revalidierung, `/book`, Rechnung, Sendungs-ETA, Lieferdatumsfilter oder Kennzahlen. JUMiNGO-Zustelldaten und -uhrzeiten bleiben unverändert autoritativ. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; alle anderen Services unverändert.

Expressversand (TG23, Backend gemergt; Frontend wirksam nach Merge): Service 23 (UPS Express Saver) trägt dieselbe Kuratierung wie der Referenzservice 22 — Leistungsname „Expressversand" (CE-Klassenname des JUMiNGO-Pendants), Preisklasse EXPRESS (Expressaufschlag des Kontos, ohne gültigen Wert der Standardaufschlag; kein Satz im Code; die Absicherung bleibt 1:1 und steuerfrei), `publicBookableScopes` nur DE→DE, höchstens ein Packstück als CE-Launchgrenze und 70 kg je Packstück, Art der Lieferadresse nach der Auswahl, Abholung am selben Tag mit der Gebühr aus dem frischen Quote, Transportabsicherung nach Warenwert, Tracking, Label „PDF · DIN A4 / Thermodruck", Produktprofil `express_urgent` und die voraussichtliche Lieferung (Laufzeit „1": ein Tag). Keine Zustelluhrzeit, keine Garantie, keine Anbieterangaben beim Kunden. Kein neuer Produktionspfad, kein Schalter, keine ENV-Änderung, keine Schemaänderung; JUMiNGO und alle anderen Services unverändert. Die Aktivierung folgt derselben Konjunktion wie bei Service 22 — die Schalter gelten gemeinsam für beide Services. Status: staging smoke passed / provider booking evidence confirmed — ein Staging-GetQuote und ein Staging-BookShipment (2026-09-15) bestätigen die Buchung mit Abholung am selben Tag, Privatadresse und Absicherung: Same-Day-Gebühr automatisch ohne Accessory, Anbieterrechnung netto = TotalCost + COLFEE + INS (Delta 0,00, INS steuerfrei), Labels A4 und Thermal. Positionstexte der Anbieterrechnung nennen den Anbieter; verglichen wird ausschließlich an Beträgen.

UPS-Vervollständigung (wirksam nach Merge): Service 29 (UPS Express, „Express") trägt die Kuratierung der 23 mit ausschließlich belegten Werten — `maxPackages: 1` als CE-Grenze, kein Gewicht, Produktprofil `express_urgent` mit nicht belegtem Divisor (`volumetricDivisor: null`: Profil ja, Volumengewichtsformel nein), Paletten und Koffer, Tracking, Druckpflicht, Absicherung, Art der Lieferadresse, Abholung am selben Tag und Werktagsprognose — aber `publicBookable: false`: Preisauskunft ohne Adressfrage, ohne Abholung heute und ohne Absicherung; Optionen, Bindung, Neubepreisung und `/book` enden vor jedem Providerkontakt. Belegt ist ein Staging-Full-Quote (2026-09-16: Fracht 24,36, Privatzuschlag 2,65, Same-Day-Gebühr 2,52 mit Abholschluss 17:00, Absicherung 10,00 bei Warenwert 500, Labels A4 und Thermal). Der Staging-Buchungssmoke (Quote 1266, Buchung DE0052577) ist nicht bestanden: die Anbieterrechnung trug zusätzlich „Collection" 2,00 € netto, die der Full Quote nicht nannte (kein COL-Bestandteil, Preis mit = ohne Abholung) — Regel ungeklärt, beim Anbieter angefragt; die 29 bleibt quote_only, ohne Pauschale und ohne Puffer. Die Freigabe ist nach einem bestandenen Smoke nur der Wechsel der beiden Freigabefelder, und ein Test beweist die ganze Kette mit genau diesem Wechsel. Service 26 (UPS Standard Multi, „Standardversand Mehrpaket") ist seit TG26 öffentlich buchbar für genau den belegten Umfang: nur DE→DE, `maxPackages: 2` (CE-Launchgrenze, kein Höchstgewicht), Art der Lieferadresse nach der Auswahl (Szenarioprüfung: genau ein Zuschlag Privatadresse), Transportabsicherung, Tracking und Druckpflicht aus Kuration; ohne Abholung am selben Tag, ohne Produktprofil, ohne Prognose. Belegt durch einen Staging-Full-Quote und eine Staging-Buchung (2026-09-17, zwei gleiche Packstücke je 2 kg: Fracht 26,61, Privatzuschlag 2,65 einmal je Sendung, Absicherung 10,00, Rechnung 39,26 netto centgenau ohne weitere Position; ein A4- und ein Thermal-PDF mit je einer Seite je Paket). Das Full-Quote-Paketmodell fragt N gleiche Packstücke an, Revalidierung und Buchung lesen dieselbe Entwurfszeile; eine gemeinsame Sendungsnummer ergibt EIN logisches Versandlabel in zwei Formaten, mehrere Sendungsnummern generisch „Versandlabel k von N (Format)" und je eine Tracking-Etappe. Die Transportabsicherung entsteht nur für Services mit kuratierter Fähigkeit (`capabilities.transportInsurance`: 22, 23, 26, 29) — das Anbieterextra allein genügt nicht. Jede ausgewertete Transglobal-Antwort schreibt eine Bestandszeile (`[TG service-inventory]`: angebotene ServiceIDs, abgelehnte nur mit ServiceID, Carrier und Grund, unbekannte ServiceIDs kuratierter Carrier als Warnung) — ohne zusätzlichen Request. Nachträgliche Anbieterbelastungen bleiben Befund der bestehenden Rechnungsprüfung; die Stornierung ist unverändert. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; JUMiNGO funktional unverändert (das kuratierte Paar „EXPRESS ®" ↔ 29 bestand bereits; für die 26 gibt es kein Paar).

DHL Foundation (wirksam nach Merge): Service 84 (DHL Domestic Express, „Domestic Express") ist vollständig kuratiert — EXPRESS, Direktabholung, nur DE→DE, `maxPackages: 2` (CE-Launchgrenze), Tracking, Druckpflicht, Transportabsicherung und `priceInputs.deliveryIsResidential: "declared_no_surcharge"` —, aber `publicBookable: false` ohne Routenbereich: Preisauskunft; Optionen, Bindung, Neubepreisung und `/book` enden vor jedem Providerkontakt. Belegt durch die Staging-Quotes 1274/1275 und die Staging-Buchung DE0052580 (Rechnung INV-0040781 centgenau: Fracht 17,74 + ISC 101,00 + Absicherung 10,00, Steuer nur auf den Versand; kein `RES`, kein `COL`, keine Position „Collection"; Laufzeit „1", Abrechnungsgewicht 4; Abholschluss im Quote, aber keine Abholung am selben Tag). Die Aktivierungsprobe beweist die ganze Kette mit genau dem Wechsel der beiden Freigabefelder. Offen vor einer Freigabe: die Zuordnung der DHL-Trackingereignisse (keine erfundene Abbildung — ein nicht belegter Code bleibt „unbekannt") und die Produktionsbedeutung von ISC. **Art der Lieferadresse ohne Zuschlag** ist ein generischer Modus der Service-Policy (`PRICE_INPUT_MODE.DECLARED_NO_SURCHARGE`, nur für die Zustelladresse; die Abholadresse bleibt fest geschäftlich): die Adressart wird wie bei `surcharge_options` nach der Auswahl erfragt, gebunden und an den Anbieter übermittelt, beide Szenarien müssen aber centgenau gleich sein; die Bestandteile tragen nie „Zuschlag Privatadresse" und die Herleitung `scenario_difference_no_residential_surcharge` (bestehende Snapshots behalten `scenario_difference`). Das Angebot nennt die Angabe zusätzlich in `surchargeFreePriceInputs` (öffentlich, providerneutral, Teilmenge von `requiredPriceInputs`, sonst `[]`). Fail closed: ein `RES` oder eine andere Preisdifferenz der Szenarien sperrt die Optionen (`409 OFFER_NOT_BOOKABLE`, kein Snapshot, kein Wiederholungsangebot); ein Zuschlag bei der Revalidierung ergibt `PRICE_CHANGED` mit Neubestätigung, die dann an derselben Sperre endet; Snapshot, Bindung, Evidenz und Bestandteile werden gegen die aktuelle Kuratierung gelesen — wechselt sie, gilt keine alte Bindung. ISC und jeder andere Bestandteil außer Fracht und Zuschlag sind gewöhnliche Einkaufsbestandteile ohne Sonderregel. Belege: eine gemeinsame Sendungsnummer ergibt EIN logisches Versandlabel in zwei Formaten und genau eine Trackingreferenz; DHL-Stücknummern stehen nur im Carrier-PDF und werden nicht gespeichert (kein Datenmodell ohne Bedarf). Die Metadaten der gemessenen Carrier-PDFs nennen die Einkaufsquelle; Kundendownloads und Mailanhänge laufen durch die bestehende Metadaten-Neutralisierung, der Seiteninhalt bleibt unverändert (sichtbarer Text ohne Einkaufsquelle in den ausgewerteten Inhalten; eine Sichtprüfung der dritten Seite steht aus). Fristen: jede Full-Quote-Wiederholung nach der Auswahl (Optionen, Neubepreisung, Revalidierung vor dem Claim) nutzt `TRANSGLOBAL_BOOK_PRE_ORDER_TIMEOUT_MS`, jetzt mit Vorgabe 30 s wie `TRANSGLOBAL_QUOTE_TIMEOUT_MS` (vorher 20 s: ein Angebot mit 20–30 s Antwortzeit stand im Vergleich und war strukturell unbuchbar); `TRANSGLOBAL_ORDER_TIMEOUT_MS` bleibt 90 s. Gemessene Staging-Quotes 26,5–41,4 s: für Staging werden Vergleichs- und Vorbestellfrist gemeinsam per Umgebung angehoben (Empfehlung je 45000, nicht umgesetzt — Freigabe nötig), nie über die Browserfristen (Vergleich 60 s, Optionen und Neubepreisung 60 s, `/book` 150 s). Keine der drei Fristen ist in Staging oder Produktion per Umgebung gesetzt (Stand 2026-09-17, nur Schlüsselnamen geprüft) — die neue Vorgabe wirkt dort mit dem nächsten Deploy. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; 22, 23, 26, 29 und JUMiNGO unverändert.

Nicht daraus ableiten, dass Transglobal heute produktiv buchbar ist: alle Schalter sind im Repository aus, der Runtime-Zustand ist UNKNOWN_RUNTIME_STATE.

Unklare Transglobal-Ausgänge laufen durch dieselbe Buchungsklärung wie JUMiNGO (5.11); die bisherigen Transglobal-Adminpfade bleiben als Aliasse der providerneutralen Routen bestehen (Package C, wirksam nach Merge).

### 6.5 Cross-Provider Matching

**Status: ACTIVE_CURRENT**

Providerangebote können systemseitig auf Produktgleichheit geprüft und verglichen werden.

Die Angebotsschicht enthält Cross-Provider-Matching / Winner-Suppression.

Diese Architektur ist beim Ausbau weiterer Provider zu respektieren.

---

## 7. Versand-Scope und Customs

### 7.1 Launch-Scope

**Status: ACTIVE_CURRENT / PRODUCT_DECISION**

Aktueller Launch-Scope:

- Ursprung: Deutschland
- Ziele: EU-27
- keine normalen Drittland-Buchungen

Dieser Scope ist eine bewusste Schutzgrenze.

Nicht nur die UI, sondern die serverseitigen Providerpfade müssen ihn respektieren.

### 7.2 Customs / Zoll

**Status: IMPLEMENTED_DISABLED**

Zollcode ist weiterhin im Repository vorhanden.

Das bedeutet nicht, dass Zoll aktuell Produktbestandteil ist.

Der aktuelle Zustand enthält mindestens zwei unabhängige Sperren:

1. `CUSTOMS_ENABLED` ist opt-in und standardmäßig aus.
2. Der Launch-Scope schließt Drittlandrouten aus.

Frontendseitig sind Zolloberflächen ebenfalls deaktiviert.

#### Wichtige Konsequenz

**Code vorhanden != Feature aktiv**

Customs darf nicht beiläufig durch UI-, Provider- oder Validierungsänderungen reaktiviert werden.

Eine spätere Customs-Aktivierung ist eine bewusste Produkt-/Systementscheidung und erfordert eine erneute vollständige Prüfung.

---

## 8. Pricing

### 8.1 Preiskette

**Status: ACTIVE_CURRENT**

Grundprinzip:

```
Provider-Einkaufsnetto
→ ConfidaraExpress-Aufschlag
→ Kunden-Netto
→ MwSt.
→ Kunden-Brutto
```

Evidence anchor: `lib/pricing.js`

Zustelladressart des Transglobal-Referenzservices (TG22 Residential): der vollständige Anbieterpreis jedes Szenarios (Fracht plus gegebenenfalls Zuschlag) durchläuft dieselbe Kette. Der Kundenzuschlag ist die Differenz der beiden Kunden-Netto-, MwSt.- und Bruttobeträge in ganzen Cent — nie separat versteuert, nie lokal berechnet. Eine negative oder widersprüchliche Differenz ist ein Fehler (`PRICE_INPUT_OPTIONS_INCONSISTENT`), kein Ersatzwert.

Abholung am selben Tag (TG22 Same-Day): die Gebühr des Anbieters ist Teil des Einkaufs jedes Szenarios und durchläuft dieselbe Kette. Die Zuschläge sind Szenariodifferenzen in ganzen Cent entlang Basis → mit Abholung heute → zusätzlich Privatadresse — nie die separat bepreiste Gebühr.

### 8.2 Kundenaufschlag

**Status: ACTIVE_CURRENT**

Nicht als globales „jeder Kunde zahlt 20 %" modellieren.

Aktueller Mechanismus:

- kundenspezifischer Aufschlag liegt serverseitig vor,
- bestätigte Kundenwerte sind maßgeblich,
- bei noch nicht bestätigtem Aufschlag existiert ein globaler Fallbackmechanismus,
- Serviceklassen können zusätzliche Aufschlagslogik besitzen.

Ein ungültiger bestätigter Wert darf nicht still auf einen Fallback zurückfallen.

### 8.3 MwSt.

**Status: IMPLEMENTED_CONDITIONALLY / UNKNOWN_RUNTIME_STATE**

Der Code hat einen Default von 19 %.

Der Satz ist über `VAT_RATE` konfigurierbar und validiert.

Daher:

- 19 % ist der technische Default,
- der tatsächliche Production-Wert darf nicht ohne Runtime-Nachweis behauptet werden,
- neue Logik darf `0.19` nicht unabhängig vom zentralen VAT-Vertrag hartkodieren.

Evidence anchor: `config/vatConfig.js`

### 8.4 Preisdrift

**Status: ACTIVE_CURRENT**

Buchungen werden gegen den gespeicherten/aktuellen serverseitigen Preisvertrag revalidiert.

Preisabweichungen dürfen nicht still akzeptiert werden.

Eine gemeldete Preisänderung (`409 PRICE_CHANGED`) entwertet den zuletzt bestätigten Preis auf allen Kundenflächen und sperrt die Buchung, bis der Kunde entscheidet; das Schließen des Dialogs reaktiviert den alten Preis nicht (TG22 Golden Offer Contract, wirksam nach Merge):

- **Mit Neubindung** (Transglobal-Referenzservice mit Absicherung): der neue Gesamtbetrag wird ausschließlich über die Neubepreisung mit `acceptPriceChange: { expectedTotalGross }` übernommen (neue Preisrevision); danach bucht der Kunde ausdrücklich erneut. Der übernommene Versandpreis gilt auch in der Angebotsliste.
- **Ohne Neubindung** (JUMiNGO-Angebot mit `offerId`, mit oder ohne Absicherung): `/book` antwortet mit `recalculationRequired: true` und nur dem neuen Gesamtbetrag. Es gibt keinen Bestätigungsweg, nur „Angebote neu berechnen"; die gespeicherten Angebote werden dabei verworfen. Der Legacy-Weg ohne `offerId` bleibt unverändert.
- Ein vom Client gesendeter Preis (`price_final`) hat im Transglobal-Weg keine Wirkung; maßgeblich sind gebundene Preisrevision, bestätigter Gesamtbetrag und Absicherungsauswahl.
- **Gebundene Art der Lieferadresse** (Transglobal-Referenzservice): eine Abweichung bei Revalidierung oder Neubepreisung antwortet `409 PRICE_CHANGED` mit `priceInputsRebindRequired: true` und ohne Beträge; es gibt keinen Übernahmeweg. Der Optionen-Snapshot desselben Stands wird verworfen, der Kunde wählt die Art der Lieferadresse zu frisch bepreisten Szenarien erneut (TG22 Residential, wirksam nach Merge).
- **Abholung am selben Tag** (Transglobal-Referenzservice): eine abweichende Gebühr im frischen Quote ist eine solche Abweichung (`priceInputsRebindRequired: true`). Ein geschlossenes Zeitfenster ist keine Preisänderung, sondern `409 SAME_DAY_COLLECTION_UNAVAILABLE` („Abholung heute nicht mehr möglich. Bitte wählen Sie einen späteren Abholtag."), ohne Bestellung (TG22 Same-Day, wirksam nach Merge). Ebenso ein fehlender oder unbrauchbarer Abholschluss und unbrauchbare Same-Day-Daten — dann mit `sameDayUnavailableKind` `unconfirmed` bzw. `unverifiable` und deren Text (Grundvertrag, wirksam nach Merge).

---

## 9. Billing und Rechnungen

### 9.1 Single Billing

**Status: ACTIVE_CURRENT**

Standard-Zahlungsziel: 7 Tage

Zentrale technische Wahrheit: `PAYMENT_TERM_DAYS = 7`

Kein ENV-Override für diesen Basiskontrakt.

Retry, Resend oder erneuter Download verschieben das ursprüngliche Zahlungsziel nicht.

### 9.2 Consolidated Billing

**Status: IMPLEMENTED_CONDITIONALLY / DEFAULT DISABLED**

Es existiert ein zusätzlicher Abrechnungsmodus: `consolidated_7d`

Dieser Modus verwendet einen anderen Fälligkeitsvertrag; die zugehörigen Einzelbelege werden technisch als sofort fällig behandelt.

Nicht pauschal annehmen, dass jeder Rechnungsfall denselben 7-Tage-Flow verwendet.

Die Aktivierung hängt am entsprechenden Feature Gate.

### 9.3 Historische Zahlungsfelder

`users.payment_term`

**Status: LEGACY_COMPATIBILITY**

Nicht als aktuelle Source of Truth für das Zahlungsziel verwenden.

### 9.4 Preisbestandteile auf Belegen

**Status: IMPLEMENTED, wirksam nach Merge (TG22 Residential, TG22 Same-Day)**

Eine Buchung mit eingefrorenen Preisbestandteilen trägt sie auf der Einzelrechnung (Positionsliste im Rechnungssnapshot), der Sammelrechnung (Positionen je Sendung) und der Auftragsbestätigung (Dokumentversion 6): Versanddienstleistung, gegebenenfalls „Zuschlag für Abholung am selben Tag", gegebenenfalls „Zuschlag Privatadresse", MwSt., gegebenenfalls „Zusatzversicherung (steuerfrei)". Die Beträge kommen Cent für Cent aus dem Snapshot. Je Sendung gilt: Summe brutto = `price_final`, steuerpflichtig netto = `price_net`, MwSt. = `vat_amount`, steuerfrei = Absicherung — ein Widerspruch verhindert den Beleg. Sammelrechnungen mit Sendungen mit und ohne Bestandteile sind zulässig.

Belege ohne Bestandteile und Auftragsbestätigungen bis Version 5 bleiben unverändert. Ein Positionstext der Anbieterrechnung erscheint nie auf einem Kundenbeleg.

---

## 10. Business Numbers und Dokumente

Aktive bzw. relevante Geschäftsnummern umfassen:

- **CE-AB** — Auftragsbestätigung
- **CE-RE** — Rechnung
- **CE-LS** — Lieferschein
- **CE-AU** — Lager-/Auftragsreferenz
- **CE-SUP** — Supportreferenz
- **CE-K** — Kundennummer
- **CE-BS** — interne Bestell-/Sendungsreferenz

### CE-BS

**Status: ACTIVE_CURRENT, intern**

CE-BS wird weiterhin aktiv erzeugt.

Sie ist nicht bloß ein totes Legacyformat.

Sie soll jedoch nicht unnötig als primäre kundenorientierte Vorgangsnummer verwendet werden.

### Testnummernkreise

**Status: ACTIVE_CURRENT**

Produktiv- und Testnummernkreise sind getrennt.

Testbelege dürfen keine Produktivnummern verbrauchen.

---

## 11. Legal

### 11.1 Aktives Zielset

**Status: ACTIVE_CURRENT**

Für neue Vorgänge besteht das Pflichtset aus genau:

- `terms`
- `privacy`

`b2b_contract_information` bleibt unterstützt, ist für neue Sets aber nicht Pflicht.

Status von `b2b_contract_information`: **LEGACY_COMPATIBILITY**

### 11.2 Legal Set Contract

Es darf nicht mehrere gleichzeitig gültige aktive Sets geben.

Die Legal-Registry unterscheidet unter anderem zwischen:

- veröffentlicht/abrufbar
- aktiv/geltend
- historisch referenziert

Historische Vorgänge behalten ihre damalige Legal-Zuordnung.

### 11.3 Legal Booking Gate

**Status: IMPLEMENTED_CONDITIONALLY / DEFAULT DISABLED / UNKNOWN_RUNTIME_STATE**

`LEGAL_BOOKING_GATE_ENABLED` ist opt-in.

Das Gate darf erst nach vollständiger Legal-/Production-Readiness bewusst aktiviert werden.

Repository-Default ist nicht automatisch der Production-Zustand.

---

## 12. Lager und Aufträge

**Status: ACTIVE_CURRENT**

Aktive Domänen umfassen:

- Produkte
- Bestandsübersicht
- Lagerbewegungen
- Einbuchungen
- Bestandskorrekturen
- Bestandssperren / Blocks
- Bewegungs- und Sperrhistorie
- Aufträge
- Versandvorbereitung aus Aufträgen

Bestandslogik ist transaktional und nebenläufigkeitssensitiv.

Änderungen an Lager/Aufträgen immer auf Auswirkungen auf Versand, Benutzer/Mandant, Historie und Transaktionsgrenzen prüfen.

---

## 13. Auth, Security und Tenant Boundaries

### 13.1 Auth

**Status: ACTIVE_CURRENT**

- JWT-basierte Authentifizierung
- Rolle und Benutzerstatus werden serverseitig gegen DB-Zustand geprüft
- Standardrolle Kunde; Adminfunktionen benötigen explizite Adminprüfung

### 13.2 Tenant Isolation

**Status: CRITICAL INVARIANT**

Mandantentrennung direkt in DB-Abfragen erhalten.

Keine globalen Objektladungen mit nachgelagerter Tenant-Prüfung als Ersatz.

### 13.3 Secrets

**Status: PRODUCT / SECURITY RULE**

Keine Secrets, API Keys, Passwörter oder Zugangsdaten:

- im Anwendungscode
- in Prompts
- in Commits
- in Projektdokumentation

Das Frontend enthält aktuell eine getrackte `.env`, deren auditierter Inhalt nur eine öffentliche API-URL enthält.

Diese Datei darf niemals als Einladung verstanden werden, dort echte Secrets abzulegen.

Frontend-Buildvariablen sind grundsätzlich nicht geheim.

### 13.4 Feature Flags

**Status: ACTIVE CURRENT CONVENTION**

Bei sicherheits-/geschäftskritischen Flags wird strikt auf den erwarteten Wert geprüft, nicht mit lockerer truthy-Auswertung gearbeitet.

Bei jedem Flag dokumentieren:

- Name
- opt-in oder opt-out
- Default
- Runtime-Status, falls tatsächlich bekannt

Production-Zustände nicht aus Repository-Defaults erfinden.

---

## 14. Relevante Feature-/Worker-States

| System | Technischer Status | Default / Hinweis |
| --- | --- | --- |
| JUMiNGO Quote/Buchung | ACTIVE_CURRENT | produktiver Buchungspfad |
| Transglobal Quote | ACTIVE_CURRENT / UNKNOWN_RUNTIME_STATE | benötigt Runtime-Konfiguration |
| Transglobal Booking | IMPLEMENTED_CONDITIONALLY | default aus; öffentlich buchbar vorbereitet nur Service 22, Service 23 (TG23, Backend gemergt, Staging-Smoke bestanden) und Service 26 (TG26, Staging-Smoke bestanden, höchstens zwei Packstücke, ohne Abholung am selben Tag, wirksam nach Merge), DE→DE hinter Produktschalter, Buchungsschalter und Kontowährung; Art der Lieferadresse nach der Angebotsauswahl (TG22 Residential, wirksam nach Merge); Abholung am selben Tag bis zum wirksamen Abholschluss (TG22 Same-Day, wirksam nach Merge); Produktprofil und 70-kg-Grenze je Packstück (TG22 Package A, wirksam nach Merge); voraussichtliche Lieferung als CE-Prognose aus Abholtag und Laufzeit (TG22 Package B, wirksam nach Merge); UPS Express (29) implementiert, quote_only (Staging-Buchungssmoke nicht bestanden: ungeklärte Rechnungsposition „Collection" 2,00 €); Transportabsicherung nur für kuratierte Services; Bestandsdiagnose je Quote (UPS-Vervollständigung, wirksam nach Merge); DHL Domestic Express (84) vollständig kuratiert, quote_only (Staging-Buchungssmoke bestanden; offen: DHL-Trackingereignisse, ISC); Art der Lieferadresse ohne Zuschlag als generischer Modus; Vorbestellfrist 30 s (DHL Foundation, wirksam nach Merge) |
| Customs | IMPLEMENTED_DISABLED | opt-in aus + Launch-Scope blockiert Drittländer |
| Legal Booking Gate | IMPLEMENTED_CONDITIONALLY | default aus |
| Consolidated Invoicing | IMPLEMENTED_CONDITIONALLY | default aus |
| Tracking Sync Worker | IMPLEMENTED_CONDITIONALLY | default aus |
| Overdue Notification Worker | ACTIVE_CURRENT | default an / opt-out |
| Shipment Email Worker | ACTIVE_CURRENT | default an / opt-out |
| Buchungsklärung (Package C) | IMPLEMENTED, wirksam nach Merge | kein Schalter; Adminaktion mit Bestätigung, ruft keinen Anbieter |
| Betriebs-Queues (Package C) | IMPLEMENTED, wirksam nach Merge | kein Schalter; reiner Datenbankread |
| JUMiNGO Sandbox/Testmechanismus | IMPLEMENTED_CONDITIONALLY | bewusst gated |
| Multi-Provider Debug | IMPLEMENTED_CONDITIONALLY | Diagnosefunktion |

**Wichtig:** Diese Tabelle beschreibt Code-Defaults, nicht automatisch die produktive ENV-Belegung.

---

## 15. Frontend UX / Design Contracts

**Status: PRODUCT_DECISION**

Designrichtung:

- hochwertig
- professionell
- modern
- minimalistisch
- klare Hierarchie
- responsive
- konsistent
- bestehende ConfidaraExpress-Designsprache respektieren

Keine komplette Neugestaltung ohne ausdrücklichen Auftrag.

UX:

- unnötige Schritte vermeiden
- klare Fehlerzustände
- landesabhängige Validierung beachten
- bestehende funktionierende Abläufe schützen
- vorhandene Komponenten und Helper bevorzugen
- keine unnötigen Modals
- keine rohen internen Status-/Fehlermeldungen an Kunden

Gemeinsamer Anzeigevertrag der Angebots- und Buchungsflächen (TG22 Golden Offer Contract): jeder Preis trägt „Gesamt" oder „Versand"; die Zustellangabe heißt „Zustellung", solange Anbieterdaten vorliegen, mit einer Prognose des Servers „Voraussichtliche Lieferung" (TG22 Package B), bei reiner Laufzeit „Voraussichtliche Laufzeit"; Labelgrößen heißen „DIN A4", „DIN A6" und „Thermodruck", unbekannte Rohwerte erscheinen nicht; derselbe Abholvertrag (Zeitfenster oder „bereit ab") auf Karte und Buchung. Entschieden wird an den Feldern des Angebots, nie am Provider; die Layouts der Flächen bleiben eigenständig.

TG22 Residential (wirksam nach Merge): ein Angebot, das nur noch auf die Art der Lieferadresse wartet, zeigt „Vorläufiger Preis" und „Bei einer privaten Lieferadresse kann ein Zuschlag anfallen." — kein „ab"-Betrag, kein Anbieter. Die Wahl heißt „Art der Lieferadresse" mit „Geschäftsadresse + 0,00 €" und „Privatadresse + X,XX €" (Serverbetrag); die Bestandteilzeile heißt „Zuschlag Privatadresse". Bis zur Bindung ist die Absicherung nicht wählbar und die Buchung gesperrt.

TG22 Same-Day (wirksam nach Merge): ein Angebot mit Abholung heute zeigt den Preis einschließlich Zuschlag, darunter „Zuschlag für Abholung am selben Tag: +X,XX €" und „Abholung heute möglich bis HH:MM Uhr" (wirksamer Abholschluss vom Server). Nach dem wirksamen Abholschluss bleibt es sichtbar, ist nicht auswählbar und zeigt „Abholung heute nicht mehr möglich." und „Bitte wählen Sie einen späteren Abholtag.". Buchungsseite, Erfolg, Auftragsbestätigung und Rechnungen führen die Zeile „Zuschlag für Abholung am selben Tag"; keine Checkbox, keine Anbieteruhrzeit, kein Anbietername. Grundvertrag (wirksam nach Merge): Nennt der Server `same_day_unconfirmed` bzw. `same_day_unverifiable` (bei 409: `sameDayUnavailableKind` `unconfirmed` bzw. `unverifiable`), heißt es „Abholung heute für dieses Angebot nicht verfügbar." bzw. „Abholung heute kann derzeit nicht bestätigt werden." — jeweils mit „Bitte wählen Sie einen späteren Abholtag."; „nicht mehr möglich" steht nur beim zeitlichen Ablauf, ein unbekannter Grund ergibt den neutralen Satz. Eine gesperrte Abholung heute zeigt den Abholtag ohne „bereit ab"-Zeile; ein späterer Abholtag bleibt bei „bereit ab 09:00 Uhr".

TG22 Package A (wirksam nach Merge): trägt ein Angebot `serviceDetails`, zeigen seine Details fünf Abschnitte statt Hauptmerkmalen, Einschränkungen und Versicherung — „Hauptmerkmale" (Kurzbeschreibung, „Abholung an Ihrer Adresse", „Sendungsverfolgung inklusive", „Versandlabel zum Ausdrucken" mit den Formaten), „Laufzeit" (genau einmal: „Voraussichtliche Laufzeit" und „Die Laufzeit ist eine Schätzung des Versanddienstleisters und keine Zustellzusage."), „Größe & Gewicht" („Packstücke: 1 je Sendung", „Max. Gewicht: 70 kg", Abrechnungsgewicht, „Volumengewicht: L × B × H ÷ 5.000" — Formel und Abrechnungshinweis nur mit belegtem Divisor), „Transportabsicherung" („Grundabsicherung: bis 50 € Warenwert", „Zusätzliche Transportabsicherung: bis 2.500 € Warenwert", Selbstbeteiligung nur aus dem Serverwert) und „Einschränkungen" („Nicht zugelassen: Paletten, Koffer"). „Termin & Abholung" und „Preisaufschlüsselung" bleiben. Ohne gültiges Profil — jeder andere Service, JUMiNGO — bleibt der bisherige Detailbereich; entschieden wird am Feld, nie am Provider. Keine Uhrzeit, keine Zusage, kein externer Link; ein Datum nur als voraussichtliche Lieferung (TG22 Package B).

TG22 Package B (wirksam nach Merge): trägt ein Angebot `deliveryProjection`, heißt der Endknoten der Angebotskarte „Voraussichtliche Lieferung" mit „Di., 15.09. – Mi., 16.09.", „Di., 15.09." (ein Tag) oder „ab Di., 15.09." (offene Laufzeit) — ohne Uhrzeit; die Laufzeit „1–2 Tage" bleibt stehen. Im Detailabschnitt „Laufzeit" folgt auf „Voraussichtliche Laufzeit" genau eine Zeile „Voraussichtliche Lieferung" mit dem Hinweis „Aus Abholtag und Laufzeit berechnet; Wochenenden sind nicht mitgezählt. Feiertage können die Zustellung verschieben."; die Buchungsflächen zeigen „Voraussichtliche Lieferung" mit TT.MM.JJJJ. Die Oberfläche rechnet keine Versandtage und liest keine Uhr. Zustelldaten eines Anbieters haben immer Vorrang: JUMiNGO bleibt „Zustellung" mit Datum und „bis HH:MM Uhr". Filter, Auszeichnungen und Sortierung lesen die Prognose nicht. Kein Anbietername, keine Quelle, keine Zusage.

TG23 (wirksam nach Merge): der Expressversand erscheint als „UPS · Expressversand" in derselben Angebotskarte und denselben fünf Detailabschnitten (Kurzbeschreibung „Schneller Expressversand für eilige Sendungen.", „1 je Sendung", „70 kg", „L × B × H ÷ 5.000", Paletten und Koffer), mit Laufzeit „1 Tag" und „Voraussichtliche Lieferung" als einzelnem Tag, „Vorläufiger Preis" bis zur Bindung der Lieferadresse, gegebenenfalls dem Zuschlag für die Abholung am selben Tag und denselben Buchungs-, Erfolgs- und Belegflächen. Keine eigene Karte, keine eigene Seite, keine ServiceID-Prüfung im Frontend, keine Uhrzeit, keine Zusage; das JUMiNGO-Pendant bleibt unverändert daneben sichtbar.

UPS-Vervollständigung (wirksam nach Merge): „UPS · Express" erscheint als vollwertige Preisauskunft — Preis sichtbar, „Derzeit nicht direkt buchbar", keine Adressfrage, keine Abholung heute, keine Absicherung, keine Auszeichnung — mit den fünf Detailabschnitten, aber ohne Volumengewichtsformel, ohne Abrechnungshinweis und ohne Gewichtszeile; „Voraussichtliche Lieferung" als einzelner Tag. Nach einer Freigabe genügen dieselben Felder wie beim Expressversand, die Oberfläche ändert sich nicht. „UPS · Standardversand Mehrpaket" (TG26) ist mit zwei Packstücken auswählbar: „Vorläufiger Preis" und die Frage nach der Art der Lieferadresse wie beim Standardversand, danach Absicherung und Buchung; der Detailbereich bleibt der bisherige (kein Profil, keine Prognose — Laufzeit „1–5 Tage") mit Sendungsverfolgung, Drucker und der Einschränkung auf höchstens zwei Pakete aus den Serverfeldern; eine Abholung heute wird nie angeboten; vor der Bindung der Lieferadresse macht der Detailbereich keine Absicherungsaussage (kein „Keine Zusatzversicherung verfügbar.", generisch für jedes Angebot, das auf diese Angabe wartet). Mehrere Packstücke heißen überall „2 Pakete · je 2 kg · 30 × 20 × 15 cm" (Gewicht und Maße je Paket); die Versandbelege tragen die Servernamen in Serverreihenfolge — gemessen „Versandlabel (A4)" und „Versandlabel (Thermodruck)" mit je einer Seite je Paket, bei mehreren Sendungsnummern generisch „Versandlabel 1 von 2 (A4)" usw., ein Abholetikett zuletzt; mehrere Trackingnummern stehen in der Liste als „2 Trackingnummern", im Detail vollständig und je Etappe. Gesperrt ist bei einer Preisauskunft allein der Auswahlknopf; die Karte trägt kein `aria-disabled`, „Details anzeigen" bleibt bedienbar — auch für Screenreader. Kein Anbietername, keine ServiceID-Prüfung, keine Produktnamen im Frontendcode.

DHL Foundation (wirksam nach Merge): nennt ein Angebot die Art der Lieferadresse zusätzlich in `surchargeFreePriceInputs`, heißt der Kartenhinweis „Die Art der Lieferadresse wird vor der Buchung abgefragt." statt „Bei einer privaten Lieferadresse kann ein Zuschlag anfallen."; die Auswahl zeigt „Geschäftsadresse + 0,00 €" und „Privatadresse + 0,00 €", lädt mit „Preis wird geprüft …" und meldet einen vorübergehenden Fehler als „Der Preis konnte nicht geprüft werden."; Optionen mit Zuschlag oder zwei verschiedenen Preisen und eine Bindung mit „Zuschlag Privatadresse" werden verworfen. Entschieden wird allein am Feld — ohne Feld gilt der bisherige Vertrag. „DHL Express · Domestic Express" bleibt bis zur Freigabe Preisauskunft ohne Adressfrage. Die Neubepreisung der Absicherung wartet im Browser 60 s (wie die Zuschlagsoptionen).

### Icon-System

Aktuell existiert ein eigenes Frontend-Icon-System.

Keine externe Icon-Bibliothek ungeprüft neu einführen.

---

## 16. Infrastructure

**Status: PRODUCT / OPERATIONS CONTEXT**

Bekannter Ziel-/Betriebskontext:

- Hetzner
- Coolify
- Reverse Proxy über Coolify/Traefik-Kontext
- `confidaraexpress.de`
- `api.confidaraexpress.de`

Nicht jede Infrastrukturinformation ist vollständig Infrastructure-as-Code im Repository belegt.

Daher bei deploymentkritischen Änderungen Runtime-/Deployment-Zustand zusätzlich prüfen.

---

## 17. Testing und CI

### 17.1 Grundregel für Entwicklungsaufträge

**Status: PRODUCT WORKFLOW**

Standardmäßig:

- gezielte Unit-Tests
- gezielte Integrations-/Contract-Tests
- PostgreSQL-Tests bei DB-relevanten Änderungen
- Build
- gezielte Browser-/Smoke-Prüfung, wenn sinnvoll
- Diff Review

Eine vollständige lokale Browser-E2E-Suite soll nicht reflexartig nur „zur Sicherheit" gestartet werden.

### 17.2 CI ist davon getrennt

**Status: ACTIVE_CURRENT**

Die Frontend-CI kann bzw. soll die vollständige Browser-E2E-Suite als PR-Gate ausführen.

Das ist kein Widerspruch zum lokalen Arbeitsprinzip.

Unterscheide:

- lokale Verifikation für eine Änderung
- vollständige CI-Verifikation vor Merge

Backend und Frontend besitzen getrennte CI-Verträge und können unterschiedliche Node-Runtimes verwenden.

Die konkrete Runtime-Version immer aus aktueller Projektkonfiguration/CI lesen.

### 17.3 Keine Testzahlen kanonisieren

Keine Aussagen wie „es gibt X Tests" oder „Y Tests sind grün" dauerhaft in diese Quelle aufnehmen.

Testbestand über die aktuellen Scripts/CI ermitteln.

---

## 18. Git / PR Workflow

**Status: PRODUCT WORKFLOW**

Bei größeren Implementierungsaufträgen:

1. `git fetch`
2. aktuellen `origin/main` bestimmen
3. Working Tree / lokalen Branch prüfen
4. tatsächliche Architektur und Root Cause analysieren
5. bestehende Verträge verstehen
6. minimal-invasiv implementieren
7. gezielt testen
8. Build
9. Diff Review
10. Commit
11. Push
12. PR
13. tatsächlichen CI-Status prüfen
14. erst mit grünen erforderlichen Checks Merge empfehlen

Keine Änderungen direkt auf Verdacht.

Keine stillen Breaking Changes.

Historische Daten schützen.

Bei kritischen Aktivierungen Kontrollpunkt vor Live-Schaltung:

- Provider-Produktivbuchung
- Customs
- Legal Gate
- Zahlungs-/Billing-Aktivierungen
- sensible ENV-Änderungen

---

## 19. Legacy / Compatibility Map

**`b2b_contract_information`** — LEGACY_COMPATIBILITY. Noch unterstützt, aber kein Pflichtdokument für neue Legal Sets.

**`users.payment_term`** — LEGACY_COMPATIBILITY. Nicht aktuelle Source of Truth für Zahlungsziel.

**Alte Label-/Tracking-Routen** — LEGACY_COMPATIBILITY. Backend kann Legacyrouten behalten, auch wenn aktuelle Frontendpfade sie nicht verwenden.

**Customs-Code** — Nicht Legacy, sondern IMPLEMENTED_DISABLED. Der Code ist für eine mögliche spätere Customs-Version erhalten.

**Backend-Gitlink auf Frontend** — DEAD_OR_UNREFERENCED. Nicht als funktionierende Submodule-Architektur behandeln.

---

## 20. Known High-Level Risks

Diese Punkte sind keine automatischen Refactoring-Aufträge, aber für korrektes Systemverständnis relevant.

### 20.1 Code vorhanden ≠ Produkt aktiv

Besonders relevant bei:

- Customs
- Transglobal Booking
- Consolidated Invoicing
- Legal Booking Gate
- Tracking Sync

Immer Gate/Scope/Runtime prüfen.

### 20.2 Multi-Provider-Annahmen

Neue Funktionen dürfen nicht wieder implizit ein Single-Provider-Modell einführen.

### 20.3 Konkurrierende Dokumentationsschichten

Lange CLAUDE.md-Dateien und ältere Projektgedächtnisse können historische oder widersprüchliche Angaben enthalten.

Für Fakten gilt die Autoritätsreihenfolge aus Abschnitt 0.

### 20.4 ENV-Werte

Repository-Defaults sind nicht automatisch Production-Werte.

### 20.5 Preislogik

Keine Preiszahl oder Aufschlagsrate ohne den zentralen Pricing-Vertrag hartkodieren.

---

## 21. Runtime / Human Confirmation Required

Folgende Punkte dürfen ohne aktuelle Runtime-/Produktbestätigung nicht als Fakt behauptet werden:

- Welche Feature Flags aktuell in Production gesetzt sind.
- Ob Transglobal-Credentials in Production vorhanden sind.
- Ob Transglobal-Angebote technisch tatsächlich ausgespielt werden können; produktseitig ist ihre Sichtbarkeit bestätigt.
- Aktueller Zustand von `TRANSGLOBAL_ACCOUNT_CURRENCY`, `TRANSGLOBAL_PUBLIC_BOOKING_ENABLED` und `TRANSGLOBAL_BOOKING_ENABLED` je Umgebung.
- Aktueller Zustand der Transglobal-Fristen `TRANSGLOBAL_QUOTE_TIMEOUT_MS`, `TRANSGLOBAL_BOOK_PRE_ORDER_TIMEOUT_MS` und `TRANSGLOBAL_ORDER_TIMEOUT_MS` je Umgebung sowie die tatsächlichen Antwortzeiten des Anbieters dort.
- Aktueller `VAT_RATE` in Production.
- Aktueller globaler Fallback `CONFIDARA_MARGIN`.
- Aktueller Zustand von `LEGAL_BOOKING_GATE_ENABLED`.
- Aktueller Zustand von `CONSOLIDATED_INVOICING_ENABLED`.
- Aktueller Zustand von `TRACKING_SYNC_ENABLED`.
- Aktueller Sandbox-/Production-Modus der Provider.
- Tatsächlicher Deploymentzustand außerhalb des Repository.

Wenn eine Aufgabe davon abhängt: prüfen statt raten.

---

## 22. Re-Audit Trigger

Diese Quelle muss neu gegen `origin/main` geprüft werden, sobald mindestens eines davon eintritt:

- neuer Versandprovider
- Provider wird produktiv buchbar/gesperrt
- Multi-Provider-Routing ändert sich
- Launch-Scope wird erweitert
- Customs wird reaktiviert
- Pricing-/Markup-Vertrag ändert sich
- VAT-Konfiguration ändert sich
- Billing-Modi ändern sich
- Legal-Pflichtset oder Legal-Freeze ändert sich
- Legal Booking Gate wird produktiv aktiviert
- Auth-/Tenant-Modell ändert sich
- Lager-Transaktionsmodell ändert sich
- Datenbankschemaevolution wird auf echtes Migrationsframework umgestellt
- Dokumente verlassen BYTEA/PostgreSQL
- Major-Architekturwechsel im Frontend/Backend
- neue Deploymentarchitektur
- dieses Dokument und `origin/main` widersprechen sich
- eine `CLAUDE.md` und dieses Dokument widersprechen sich
- die beiden Kopien dieser Datei (Frontend-Root und Backend-Wrapper-Root) sind nicht byte-identisch

---

## 23. Re-Audit Checkliste

Bei späterer Aktualisierung nicht dieses Dokument gegen sich selbst prüfen.

Mindestens:

- `git fetch origin`
- Frontend-/Backend-`origin/main` SHA erfassen
- Provider-Registry prüfen
- Offer-Routing / Booking-Gates prüfen
- Launch-Scope + Customs-Gates prüfen
- Pricing + VAT prüfen
- Billing-Modi prüfen
- Legal Required Types + Gate prüfen
- Auth/Tenant-Invarianten prüfen
- Inventory-Transaktionen prüfen
- Feature-Flag-Defaults prüfen
- CI/Testscripts prüfen
- neue Module suchen, die hier noch nicht vorkommen
- aktiv nach Gegenbeweisen zu alten Aussagen suchen
- beide Kopien dieser Datei auf Byte-Identität prüfen

Danach aktualisieren:

- Last verified
- beide SHAs
- Current-State-Abschnitte
- Changelog

---

## 24. Verbotene Driftmuster

Eine KI oder ein Entwickler darf aus diesem Dokument insbesondere NICHT ableiten:

- JUMiNGO sei der einzige Provider.
- Transglobal sei heute automatisch produktiv buchbar.
- vorhandener Customs-Code bedeute aktive Zollunterstützung.
- 19 % dürfe beliebig hartkodiert werden.
- jeder Kunde habe pauschal 20 % Aufschlag.
- jede Rechnung habe ausnahmslos denselben Billing-Modus.
- ein fehlender Provider bedeute JUMiNGO.
- Clientwerte dürften Provider/Tarif/Endpreis autoritativ auswählen.
- `false` bedeute bei preisrelevanten Fragen „unbeantwortet".
- ein unsicherer Provider-Buchungsausgang bedeute sicher „nicht gebucht".
- Repository-Default eines Flags sei automatisch sein Production-Wert.
- alte CLAUDE.md-Angaben seien neuer als `origin/main`.
- Testanzahlen oder alte Branch-Namen seien kanonische Fakten.

---

## 25. Changelog

### v2.1 — 2026-09-17 (DHL Foundation: TG84 kuratiert, Art der Lieferadresse ohne Zuschlag, Transglobal-Fristen)

- 1A: Service 84 „DHL Express · Domestic Express" vollständig kuratiert, bleibt quote_only (offen: DHL-Trackingereignisse, Produktionsbedeutung von ISC); Evidenz: Staging-Quotes 1274/1275 und Staging-Buchung DE0052580 / INV-0040781 (zwei Packstücke, Direktabholung, Absicherung, A4/Thermal, eine gemeinsame Sendungsnummer, zwei Stücknummern im PDF, kein RES, kein COL, keine Abholung am selben Tag freigegeben; ISC nur als Stagingbefund). Neue Produktentscheidung „Art der Lieferadresse ohne Zuschlag" als generischer Modus mit Sperre bei jedem Vertragswechsel. Transportabsicherung kuratiert auch für 84.
- 6.4: Kuratierung und Vertrag der 84; Modus `declared_no_surcharge` mit Herleitung `scenario_difference_no_residential_surcharge` und öffentlichem Feld `surchargeFreePriceInputs`; fail-closed-Verhalten; Belege und Trackingreferenz; White-Label-Befund der Carrier-PDF-Metadaten; Fristenkette mit Vorbestellfrist 30 s und Staging-Empfehlung.
- 14: Transglobal Booking mit 84 (quote_only), Modus und Vorbestellfrist (wirksam nach Merge).
- 15: Kartenhinweis, Auswahltexte und Bindungsprüfung ohne Zuschlag, feldgesteuert; Browserfrist der Neubepreisung 60 s.
- 21: Transglobal-Fristen und Anbieterantwortzeiten je Umgebung sind Runtime-Fakten.
- 22, 23, 26, 29, JUMiNGO, Preisfunktion, MwSt., Belegversionen und Stornierung unverändert; keine Providerrequests in diesem Paket (die Evidenz stammt aus den zuvor ausdrücklich freigegebenen Staging-Läufen); keine ENV-, Schalter- oder Schemaänderung.
- Wirksam nach Merge der Branches `feature/dhl-foundation-tg84` (Frontend vor Backend: erst das Frontend liest `surchargeFreePriceInputs` und wartet bei der Neubepreisung 60 s — das alte Frontend verwürfe die Bindung eines zuschlagsfreien Angebots, und seine 30-s-Frist der Neubepreisung wäre gleich der neuen Vorbestellfrist).

### v2.1 — 2026-09-17 (TG26-Freigabe: UPS Standard Multi; TG29 bleibt quote_only)

- 1A: Service 26 „UPS · Standardversand Mehrpaket" DONE — öffentlich buchbar für genau den belegten Umfang (DE→DE, höchstens zwei Packstücke als CE-Launchgrenze, Art der Lieferadresse, Transportabsicherung, Tracking, Druckpflicht; keine Abholung am selben Tag, kein Höchstgewicht, kein Divisor, kein Profil, keine Prognose, keine EU); Evidenz: Staging-Full-Quote 1267 und Staging-Buchung DE0052578 (Rechnung centgenau, Zuschlag Privatadresse einmal je Sendung, ein A4- und ein Thermal-PDF mit je einer Seite je Paket); eine Staging-Platzhalter-Sendungsnummer ist keine Produktionsaussage. Service 29: Staging-Buchungssmoke (Quote 1266, DE0052577) nicht bestanden — ungeklärte Rechnungsposition „Collection" 2,00 €; bleibt quote_only ohne Pauschale und ohne Puffer. Transportabsicherung kuratiert für 22, 23, 26, 29.
- 6.4: Freigabekonjunktion mit 26 (Packstückgrenzen 1 bzw. 2), Kuratierung und Vertrag der 26, Befund der 29.
- 14: Transglobal Booking mit 26 (wirksam nach Merge); 29 quote_only mit Befund.
- 15: „UPS · Standardversand Mehrpaket" auswählbar mit zwei Packstücken, Belegnamen wie gemessen, generische Mehrfachnummern unverändert; vor der Bindung der Lieferadresse keine Absicherungsaussage im Detailbereich.
- 22, 23, JUMiNGO, Preisfunktion, MwSt., Bestandteile, Belegversionen und Stornierung unverändert; keine Providerrequests in diesem Paket (die Evidenz stammt aus den zuvor ausdrücklich freigegebenen Staging-Smokes).

### v2.1 — 2026-09-16 (UPS-Vervollständigung: TG29 UPS Express, TG26 UPS Standard Multi)

- 1A: UPS-Inventar 22/23/26/29; 22 DONE, 23 DONE; Produktentscheidung Service 29 „UPS · Express" — Implementierung vollständig, Buchungsfreigabe evidenzgebunden (quote_only bis zum bestandenen Staging-Buchungssmoke, danach nur der Wechsel der Freigabefelder); Namensentscheidung „Express" (neutral, eindeutig, ohne Zeit- oder Garantieaussage); Service 26 „UPS · Standardversand Mehrpaket" — Mehrpaketvertrag vollständig, Anbieterevidenz ausstehend; Transportabsicherung als kuratierte Fähigkeit.
- 6.4: Kuratierung von 29 (nur belegte Werte, `volumetricDivisor: null`, keine Gewichtsgrenze) und 26 (keine Fähigkeiten, keine Grenzen), Mehrpaketvertrag (N gleiche Packstücke, dieselbe Entwurfszeile für Revalidierung und Buchung, mehrere Labels und Sendungsnummern), Absicherung nur für kuratierte Services, Bestandsdiagnose je Quote ohne zusätzlichen Request; Nachbelastungen nur dokumentiert, Stornierung unverändert.
- 14, 15: Feature-State und Anzeigevertrag ergänzt (Preisauskunft mit bedienbaren Details, Paketzeile, Belegnamen „k von N", mehrere Trackingnummern); Profilformel nur mit belegtem Divisor.
- 22 und 23, JUMiNGO, Preisfunktion, MwSt., Bestandteile, Belegversionen und Stornierung unverändert; keine Providerrequests in diesem Paket (die TG29-Quote-Evidenz stammt aus einem zuvor freigegebenen Staging-GetQuote).
- Wirksam nach Merge der Branches `feature/complete-transglobal-ups-family` (Frontend vor Backend, korrigiert 2026-09-17: erst Frontend-PR #431 mergen und den Frontend-Deploy gesund abwarten, danach Backend-PR #361 mergen und den Backend-Deploy gesund abwarten — nur das neue Frontend verneint die Absicherung nicht, solange die Lieferadresse eines TG26-Angebots nicht gebunden ist); kein Schalter, keine ENV-Änderung, keine Schemaänderung.
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-16 (TG22/TG23 Same-Day: Grundvertrag)

- 1A, 6.4: einzige Quelle des Abholschlusses ist der frische Full-Quote (laut Anbieterdokumentation nur mit Information und solange er nicht vorbei ist; keine eigene Cutoff-Schnittstelle); kein Ersatzwert, keine zweite Quelle, kein zusätzlicher Providerrequest; ein fehlender Abholschluss bleibt gesperrt.
- 1A, 6.4, 8.4, 15: öffentlich drei Gründe — `same_day_unavailable` (zeitlich abgelaufen), `same_day_unconfirmed` (nicht bestätigt), `same_day_unverifiable` (nicht verifizierbar, auch für jede unbekannte Ursache) — mit je eigenem Kundentext und demselben Hinweis; 409 `SAME_DAY_COLLECTION_UNAVAILABLE` trägt `sameDayUnavailableKind`.
- 6.4, 15: eine gesperrte Abholung heute zeigt den Abholtag ohne „bereit ab"-Zeit; der gespeicherte Abholvertrag bleibt unverändert.
- Buchbarkeit, Zeitfenster, 15-Minuten-Abstand, Gebühr, Preis, Revalidierung, JUMiNGO und alle anderen Services unverändert.
- Wirksam nach Merge der Branches `feature/tg-same-day-reason-contract` (Backend vor Frontend); kein Schalter, keine ENV-Änderung, keine Schemaänderung.
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-15 (TG23 Evidence Closure: Staging-Smoke bestanden)

- 1A, 6.4, 14: TG23-Status von „Staging-Smoke ausstehend" auf „Staging-Smoke bestanden, Buchungsevidenz des Anbieters bestätigt" — ein GetQuote und ein BookShipment auf Staging; Anbieterrechnung netto = TotalCost + COLFEE + INS (Delta 0,00), INS steuerfrei, Labels A4 und Thermal.
- Backend-TG23-Abschnitte gegen `origin/main` `2c4ef35` (Merge #356); Frontend-Abschnitte weiterhin wirksam nach Merge von `feature/tg23-express-saver`.
- Reine Dokumentation: kein Code, kein Schalter, keine ENV-Änderung, keine Schemaänderung; Schema-Version bleibt 2.1.

### v2.1 — 2026-09-15 (TG23 UPS Express Saver: Expressversand)

- 1A: Produktentscheidung TG23 — Service 23 (UPS Express Saver) als „UPS · Expressversand" auf der Fähigkeitsstruktur des Referenzservices 22 (Golden Reference Standard): DE→DE öffentlich buchbar vorbereitet, DE→EU quote_only, EXPRESS mit Expressaufschlag, ein Packstück als CE-Launchgrenze, 70 kg je Packstück, Residential, Same-Day, Absicherung, voraussichtliche Lieferung; keine Zustelluhrzeit, keine Garantie; Staging-Smoke vor der Aktivierung ausstehend.
- 6.4: Konjunktion der öffentlichen Buchbarkeit, Adressart, Same-Day, Produktdetails und Prognose gelten für die Services 22 und 23; neuer Absatz „Expressversand (TG23)".
- 14, 15: Feature-State und Anzeigevertrag ergänzt.
- JUMiNGO, alle anderen Transglobal-Services, Preisfunktion, MwSt., Preisbestandteile und Belegversionen unverändert.
- Wirksam nach Merge der Branches `feature/tg23-express-saver` (Backend vor Frontend); kein Schalter, keine ENV-Änderung, keine Schemaänderung.
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-14 (TG22 Package B: voraussichtliche Lieferung)

- 1A: Produktentscheidung „Voraussichtliche Lieferung" (Service 22): CE-Prognose aus Abholtag und Laufzeit, Montag bis Freitag gezählt, Wochenenden übersprungen, Feiertage nicht berücksichtigt, keine Uhrzeit, keine Anbieterzusage.
- 6.4: `deliveryProjection { kind: "estimated", dateMin, dateMax }` getrennt von `deliveryDateMin/Max`; nicht gespeichert, keine Wirkung auf Preis, Buchbarkeit, Sortierung, Buchung, Sendungs-ETA, Filter oder Kennzahlen.
- 14, 15: Feature-State und Anzeigevertrag „Voraussichtliche Lieferung" ergänzt.
- JUMiNGO, alle anderen Services, Preise, Zuschläge und das Produktprofil (Package A) unverändert.
- Wirksam nach Merge der Branches `feature/tg22-delivery-projection` (Backend vor Frontend); kein Schalter, keine ENV-Änderung, keine Schemaänderung.
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-14 (TG22 Package A: Produktdetails)

- 6.4: kuratiertes Produktprofil des Referenzservices (Standardversand, ein Packstück, 70 kg je Packstück, Divisor 5.000 nur zur Erklärung, Paletten und Koffer nicht zugelassen) als `serviceDetails` und Tarifgrenze `weight <= 70`; die 70-kg-Grenze gilt in Vergleich, Optionen, Revalidierung und `/book`.
- 14, 15: Feature-State und Anzeigevertrag der fünf Detailabschnitte ergänzt.
- Keine Laufzeit- oder Datumsberechnung, keine Nachbelastung, keine Preis- oder Zuschlagsänderung; JUMiNGO und alle anderen Services unverändert.
- Wirksam nach Merge der Branches `feature/tg22-product-details` (Backend vor Frontend); kein Schalter, keine ENV-Änderung, keine Schemaänderung.
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-14 (TG22 Same-Day Collection)

- 1A: Produktentscheidung „Abholung am selben Tag" (Service 22): heute buchbar bis 15 Minuten vor dem Abholschluss des frischen Quotes (Europe/Berlin), Zuschlag im Kartenpreis und als eigene Zeile „Zuschlag für Abholung am selben Tag", nach dem wirksamen Abholschluss sichtbar und nicht auswählbar, keine Checkbox, kombinierbar mit Privatadresse und Absicherung; JUMiNGO unverändert.
- 5.1: Preisbestandteil „Zuschlag für Abholung am selben Tag" als Darstellung derselben Summen.
- 6.4: Buchbarkeit eines heutigen Abholtags über das Zeitfenster des frischen Quotes; Gebühr als Einkauf, BookShipment ohne Accessory, ReadyFrom zum Bestellzeitpunkt, letzte Schranke vor der Bestellung.
- 8.1, 8.4: Zuschläge als Szenariodifferenzen mit und ohne Gebühr; eine Gebührenabweichung verlangt eine neue Wahl, ein geschlossenes Zeitfenster ist ein eigener Ausgang ohne Bestellung.
- 9.4: neue Belegposition auf Einzelrechnung, Sammelrechnung und Auftragsbestätigung (Dokumentversion bleibt 6).
- 14, 15: Feature-State und Anzeigevertrag ergänzt.
- Wirksam nach Merge der Branches `feature/tg22-same-day-colfee` (Backend vor Frontend); kein Schalter, keine ENV-Änderung, keine Schemaänderung.
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-14 (TG22 Residential)

- 1A: Produktentscheidung „Art der Lieferadresse nach der Angebotsauswahl" (Service 22): keine Adressfrage vor dem Vergleich, keine Abholadressfrage, Zuschlag aus zwei vollständigen Serverszenarien, Kundenbezeichnung „Zuschlag Privatadresse", JUMiNGO unverändert.
- 5.1, 5.4, 5.5: Preisbestandteile als Darstellung derselben Summen; Abholadresse als serverseitige Festlegung; Bindung der Wahl am Angebot.
- 6.4: vorläufiges Vergleichsangebot, Optionen- und Bindungsendpunkt, Buchungsautorität mit Bindung und Preisrevision.
- 8.1, 8.4: Szenariodifferenz in ganzen Cent; eine Drift der gebundenen Adressart führt nur zu einer neuen Wahl.
- 9.4 neu: Preisbestandteile auf Einzelrechnung, Sammelrechnung und Auftragsbestätigung (Dokumentversion 6).
- 14, 15: Feature-State und Anzeigevertrag ergänzt.
- Wirksam nach Merge der Branches `feature/tg22-residential-pricing` (Backend vor Frontend); kein Schalter, keine ENV-Änderung; additive Schemaerweiterung über `db/init.js`.
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-13 (TG22 Golden Offer Contract)

- 5.1: eine serverautoritative Preisprojektion auf der Buchungsseite; Netto- und Bruttogesamtbetrag der Neubepreisung kommen vom Server (`customerTotalNet`), keine Clientaddition; nach der Buchung gilt `booking.amount`.
- 5.12: Produktentscheidung Tarif-ID — die numerische JUMiNGO-Tarif-ID darf ohne Providernamen sichtbar bleiben; keine allgemeine Freigabe interner Providerreferenzen, nie eine Transglobal-ServiceID.
- 6.4: Angebotsvertrag des Referenzservices (Standardversand, „bereit ab 09:00 Uhr", Laufzeit ohne berechnete Daten, Labelformate, Absicherung nach Warenwert); Same-Day/`COLFEE` weiterhin nicht freigegeben.
- 8.4: eine Preisänderung sperrt bis zur Entscheidung; Übernahme nur mit Neubindung über die Neubepreisung, ohne Neubindung nur Neuberechnung (`recalculationRequired`).
- 15: gemeinsamer Anzeigevertrag (Gesamt/Versand, Zustellung/Voraussichtliche Laufzeit, DIN A4/Thermodruck, ein Abholvertrag).
- Wirksam nach Merge der TG22-Golden-Offer-Contract-Branches (Backend vor Frontend); kein Schalter, keine ENV-Änderung.
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-13 (Package C: Buchungsklärung, Betrieb, Datenschutz)

- 5.11 um die providerneutrale Buchungsklärung ergänzt: Versuch vor dem Providercall, Entscheidung nur für den neuesten Versuch nach Mindestalter, kein automatischer Retry, keine automatische Providerstornierung oder Erstattung, neutrale Kundensicht („Buchungsstatus wird geprüft").
- 5.14 neu: anonymisierte Konten werden nicht beliefert; Kontaktspuren der Zustellwege und Stornierungen gehören zur Anonymisierung, Belege bleiben.
- 6.2 und 6.4 verweisen auf die gemeinsame Buchungsklärung; Feature-State-Tabelle um Buchungsklärung und Betriebs-Queues ergänzt.
- Wirksam nach Merge der Package-C-Branches (Backend vor Frontend); kein Schalter, keine ENV-Änderung.
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-11 (TG-22 Reference Enablement)

- Produktentscheidung aufgenommen: Service 22 (UPS Standard Single) ist der Transglobal-Referenzservice; öffentliche Buchbarkeit technisch vorbereitet ausschließlich DE→DE, alle übrigen Transglobal-Services bleiben quote_only.
- Währung als Kontoeigenschaft festgehalten: Transglobal-Antworten tragen kein Währungsfeld; belegte EUR-Konten, keine Umrechnung; ohne Kontozusicherung kein Transglobal-Angebot.
- 6.4 und Feature-State-Tabelle an die Gate-Konjunktion angepasst; Runtime-Liste um die drei Transglobal-Zusicherungen ergänzt.
- Production-Aktivierung bleibt manuell (Operations-Minimum, Legal/Datenschutz, Activation-Checklist).
- Schema-Version bleibt 2.1.

### v2.1 — 2026-09-09 (Integration / Reverification)

- Kanonische Quelle als `CONFIDARAEXPRESS_CANONICAL_CONTEXT.md` in Frontend- und Backend-Wrapper-Root aufgenommen (versionsloser Dateiname; die Version steht ausschließlich in diesem Dokument).
- Prüfstempel re-verifiziert: Frontend-`origin/main` von `b155c87…` auf `d65217b…` nachgezogen (zwischenzeitlicher Merge einer Buchungs-UX-Änderung und eines Dependency-Security-Fixes). Backend-`origin/main` unverändert.
- Es wurde geprüft, ob die Änderungen seit dem vorherigen Prüfstempel eine kanonische Aussage materiell verändern: nein. Sie berühren keine Provider-, Customs-, Pricing-, Billing-, Legal-, Auth- oder Scope-Aussage und stützen die Invarianten 5.3, 5.4, 5.5 und 5.13.
- Re-Audit-Trigger und Re-Audit-Checkliste um zwei Punkte ergänzt: Widerspruch zwischen einer `CLAUDE.md` und diesem Dokument sowie fehlende Byte-Identität der beiden Kopien.
- Schema-Version bleibt 2.1: Struktur und Vertrag des Dokuments sind unverändert.

### v2.1 — 2026-09-09

Produktentscheidungen nach dem Audit ausdrücklich bestätigt:

- Transglobal-Angebote dürfen sichtbar sein, bleiben aber quote-only.
- Transglobal-Buchung bleibt vorerst deaktiviert.
- Customs bleibt vorerst deaktiviert.
- Provider bleiben vollständig White Label.
- CE-BS bleibt intern und soll kundenorientiert nicht erscheinen.
- Lokale Teststrategie und vollständiges CI-E2E-Gate wurden getrennt bestätigt.
- Canonical Context wird gemeinsame projektweite Quelle für ChatGPT und Claude.
- Pre-Live-Status ohne echte Kunden wurde bestätigt; Sicherheitsmaßnahmen werden risikobasiert priorisiert, Kerninvarianten bleiben bestehen.

### v2.0 — 2026-09-09

Vollständige Neuerstellung nach forensischem Repository-Audit.

Wesentliche Korrekturen gegenüber der alten Projektquelle:

- Single-Provider-Modell durch Multi-Provider-Modell ersetzt.
- Transglobal-Quote und getrennten Buchungsstatus aufgenommen.
- Customs korrekt als implementiert, aber deaktiviert klassifiziert.
- Frontend-Struktur korrigiert.
- externe Icon-Bibliotheksannahme entfernt.
- Pricing als Mechanismus statt pauschaler Prozentzahl beschrieben.
- VAT als konfigurierbaren Vertrag markiert.
- Consolidated Billing aufgenommen.
- CE-BS als aktive interne Referenz statt bloßes Legacyformat eingeordnet.
- Runtime-ENV explizit von Repository-Defaults getrennt.
- technische Invarianten aufgenommen.
- CI und lokale Teststrategie getrennt.
- Autoritätsmodell und Drift-Erkennung eingeführt.
- volatile Fakten aus dem kanonischen Kontext entfernt.

---

## 26. Final Rule

ConfidaraExpress ist ein vernetztes System.

Vor jeder relevanten Änderung Auswirkungen prüfen auf:

Frontend · Backend · Datenbank · Provider · Offers · Pricing · Booking · Dokumente · Rechnungen · Legal · E-Mail · Tracking · Lager · Aufträge · Admin · Auth · Tenant Isolation · historische Daten · Feature Flags · Deployment · CI

Nicht implementieren, bevor der tatsächliche aktuelle Vertrag verstanden ist.
