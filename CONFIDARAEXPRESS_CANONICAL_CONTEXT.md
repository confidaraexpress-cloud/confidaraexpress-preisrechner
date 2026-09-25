# CONFIDARAEXPRESS — CANONICAL PROJECT CONTEXT

- **Schema-Version:** 2.1
- **Status:** CANONICAL PROJECT SOURCE
- **Last verified:** 2026-09-25 (Portal-Tarife 47/110/124: der gemeinsame Portalkern folgt der an echten Portalaufrufen belegten Reihenfolge, bezahlt nie einen fremden oder mehrteiligen Warenkorb und sendet keinen mutierenden Request zweimal; Zahlschritt (`ResponseGuid` aus der Warenkorbprüfung) und Adressschritt (Portalprüfung je Stufe, Rücklesung) am Staging-Portal belegt, je eine Staging-Buchung 124/110/47 centgenau, die 110 höchstens zwei Packstücke — öffentlich buchbar vorbereitet hinter den Portal- und Nachlaufschaltern 1A, 6.4, 14); 2026-09-25 (Same-Day End-to-End: die gebührenfreie Abholung am selben Tag — 84, 85, 87, 48, 49 — ist durch Optionen, Bindung, Neubepreisung und `/book` tatsächlich buchbar, der Nullunterschied ist kein Fehler, und die letzte Datumsschranke vor der Bestellung gilt für jede Abholung — Mitternacht 1A, 6.4, 14, 15); 2026-09-23 (TNT Express 9:00 (Service 47) DE→DE freigegeben — über einen eng begrenzten PORTALpfad statt über die V2-API, weil der Carrier genau für diese ServiceID den V2-Buchungsaufruf ablehnt, während derselbe Service im Portal zum centgleichen Preis buchbar ist; zwei Schalter, beide aus; Same-Day und kostenpflichtige Zusatzabsicherung bewusst nicht freigegeben; Portaletiketten können asynchron entstehen 1A, 6.4, 14, 15); 2026-09-23 (UPS Express TG29 DE→DE freigegeben: die frühere ungeklärte Rechnungsposition „Collection" 2,00 € netto ist durch vier eigene Stagingbuchungen als feste Buchungskostenposition je Sendung belegt und liegt seither als kuratierter Providerkostenvertrag an genau einer Stelle im Einkauf; die Abholung am selben Tag der 29 bleibt ausdrücklich ungemessen und ist entfernt 1A, 6.4, 14, 15); 2026-09-23 (TG Effective Collection: ein wirksamer Abholtag und ein Preis, der zu ihm passt; zweiter, gebührenfreier Same-Day-Vertragstyp staginggebucht — DHL 84 und TNT 49 —, gebührenpflichtiger für UPS 26 je Abholung statt je Packstück; neues öffentliches Feld `collectionDateAdjusted`; „heute" backendweit als Kalendertag der Geschäftszeitzone 1A, 6.4, 8.4, 14, 15); 2026-09-19 (DHL-Abschluss TG84/TG85/TG87/TG107: 84/85/87 DE→DE und 107 DE→EU öffentlich buchbar vorbereitet, 107 mit bei jeder Buchung gemessenem Adressartvertrag, Abholtag-Rückfall auch für DHL, Trackingbedeutung carriergebunden, „Ref No“ auf DHL-Belegen als externe White-Label-Entscheidung 1A, 5.12, 6.4, 14, 15); 2026-09-19 (TG UPS Effective Collection Date: das Versanddatum ist der früheste Abholtag, 22/23/26 verschieben einen allein am Abholtag gesperrten Wunschtag auf den nächsten Versandtag 1A, 6.4, 14, 15); 2026-09-18 (UPS-Abschluss TG22/TG23/TG26: Transglobal-Fristen nach gemessenen Antwortzeiten, konfigurierbare TrackOrder-Frist, Laufzeitzeile je Anbieteraufruf, faire Auswahl im Transglobal-Trackingtakt 6.4, 14, 15, 21); 2026-09-18 (Druckvertrag mehrseitiger Providerbelege: TG85-Sichtevidenz, `page_count`, generischer Kundenhinweis, keine Seitenregel 1A, 6.4, 14, 15); 2026-09-18 (TG107 DHL Economy Select: kuratiert, quote_only, erste EU-Buchungsevidenz, Adressart bewusst unkuratiert 1A, 6.4, 14, 15); 2026-09-17 (DHL Zeitfamilie: 85/87 kuratiert, 86 ohne Angebot, Produktidentität als Schranke, TG87-Buchungsevidenz und Familienevidenz aus TG84+TG87 1A, 6.4, 14, 15); 2026-09-17 (DHL Foundation: TG84-Kuratierung, Art der Lieferadresse ohne Zuschlag, offener Transglobal-Latenzbefund 1A, 6.4, 14, 15, 21); 2026-09-17 (TG26-Freigabe UPS Standard Multi und TG29-Buchungsbefund 1A, 6.4, 14, 15); 2026-09-16 (UPS-Vervollständigung TG29/TG26 1A, 6.4, 14, 15; TG22/TG23-Same-Day-Grundvertrag 1A, 6.4, 8.4, 15); 2026-09-15 (TG23-Abschnitte 1A, 6.4, 14, 15; TG23-Staging-Smoke-Evidenz 1A, 6.4, 14); 2026-09-14 (TG22-Package-B-Abschnitte 1A, 6.4, 14, 15; TG22-Package-A-Abschnitte 6.4, 14, 15; TG22-Same-Day-Abschnitte 1A, 5.1, 6.4, 8.1, 8.4, 9.4, 14, 15; TG22-Residential-Abschnitte 1A, 5.1, 5.4, 5.5, 6.4, 8.1, 8.4, 9.4, 14, 15); 2026-09-13 (TG22-Golden-Offer-Contract-Abschnitte 5.1, 5.12, 6.4, 8.4, 15; Package-C-Abschnitte 5.11, 5.14, 6.2, 6.4, 14); Transglobal-Abschnitte 2026-09-11; übrige Abschnitte Stand 2026-09-09
- **Verified against Frontend `origin/main`:** `ba8e44c` plus Paket TG-22 (Branch `claude/tg22-reference-enablement`, wirksam nach Merge); Package-C-Abschnitte gegen Branch `claude/package-c-operations-reconciliation` (wirksam nach Merge); TG22-Golden-Offer-Contract-Abschnitte gegen Branch `claude/tg22-golden-offer-contract` (wirksam nach Merge); TG22-Residential-Abschnitte gegen Branch `feature/tg22-residential-pricing` auf `f745cc9` (wirksam nach Merge); TG22-Same-Day-Abschnitte gegen Branch `feature/tg22-same-day-colfee` auf `986963b` (wirksam nach Merge); TG22-Package-A-Abschnitte gegen Branch `feature/tg22-product-details` auf Basis `44403de` (wirksam nach Merge); TG22-Package-B-Abschnitte gegen Branch `feature/tg22-delivery-projection` auf Basis `e424750` (wirksam nach Merge); TG23-Abschnitte gegen Branch `feature/tg23-express-saver` auf Basis `e66ed64` (wirksam nach Merge); TG22/TG23-Same-Day-Grundvertrag gegen Branch `feature/tg-same-day-reason-contract` auf Basis `9fb5549` (gemergt, #430); UPS-Vervollständigung gegen Branch `feature/complete-transglobal-ups-family` auf Basis `bab50f5` (wirksam nach Merge); TG26-Freigabe gegen denselben Branch auf Basis `1893e96` (wirksam nach Merge); DHL-Foundation-Abschnitte gegen Branch `feature/dhl-foundation-tg84` auf Basis `07d7b2c` (gemergt); DHL-Zeitfamilie-Abschnitte ohne Frontendänderung; TG107-Abschnitte ohne Frontendänderung; Druckvertrag-Abschnitte gegen Branch `feature/dhl-print-contract` auf Basis `23c44e7` (wirksam nach Merge); UPS-Abschluss-Abschnitte gegen Branch `fix/ups-tg22-tg23-tg26-final-readiness` auf Basis `72892ae` (wirksam nach Merge); TG-UPS-Effective-Collection-Date-Abschnitte ohne Frontend-Codeänderung gegen `origin/main` `5d62b45` (Karte und Buchungsflächen lesen den Abholtag bereits aus `collectionDate`; im Frontend nur die Synchronisation dieses Dokuments und der Frontend-`CLAUDE.md`); DHL-Abschluss-Abschnitte ohne Frontend-Codeänderung gegen `origin/main` `8d92e60` (Buchbarkeit, zuschlagsfreie Adressartfrage, Abholtag und Trackingstand kommen aus den bestehenden Serverfeldern; ein unbekannter Trackingstand wird bereits nicht benannt; im Frontend nur die Synchronisation dieses Dokuments); Same-Day-End-to-End-Abschnitte ohne Frontend-Codeänderung gegen `origin/main` `49fe34a` (die gebührenfreie Abholung heute läuft über die bestehenden Serverfelder; im Frontend nur Paritätstests mit den echten Serverantworten und die Synchronisation dieses Dokuments); Portal-Tarife-Abschnitte (47/110/124) ohne Frontend-Produktionscodeänderung gegen `origin/main` `62b9e91` (Buchbarkeit, Übergabeart und Stückgrenze kommen aus den bestehenden Serverfeldern — die Grenze der 110 ausschließlich aus `tariffLimits`; im Frontend nur ein Governance-Test gegen eine ServiceID- oder Grenzweiche und die Synchronisation dieses Dokuments)
- **Verified against Backend `origin/main`:** `6e67fad` plus Paket TG-22 (Branch `claude/tg22-reference-enablement`, wirksam nach Merge); Package-C-Abschnitte gegen Branch `claude/package-c-operations-reconciliation` (wirksam nach Merge); TG22-Golden-Offer-Contract-Abschnitte gegen Branch `claude/tg22-golden-offer-contract` (wirksam nach Merge); TG22-Residential-Abschnitte gegen Branch `feature/tg22-residential-pricing` auf `5b6dfb3` (wirksam nach Merge); TG22-Same-Day-Abschnitte gegen Branch `feature/tg22-same-day-colfee` auf `4d60a23` (wirksam nach Merge); TG22-Package-A-Abschnitte gegen Branch `feature/tg22-product-details` auf Basis `b04a171` (wirksam nach Merge); TG22-Package-B-Abschnitte gegen Branch `feature/tg22-delivery-projection` auf Basis `18c559f` (wirksam nach Merge); TG23-Abschnitte gegen `origin/main` `2c4ef35` (Merge #356); TG23-Staging-Smoke-Evidenz gegen die Staging-App auf `2c4ef35`; TG22/TG23-Same-Day-Grundvertrag gegen Branch `feature/tg-same-day-reason-contract` auf Basis `e6f4436` (gemergt, #360); UPS-Vervollständigung gegen Branch `feature/complete-transglobal-ups-family` auf Basis `82b67a8` (wirksam nach Merge); TG29-Quote-Evidenz gegen die Staging-Umgebung (ein Full GetQuote, 2026-09-16); TG29-Buchungsbefund gegen die Staging-Umgebung (ein Full GetQuote, ein BookShipment, 2026-09-16); TG26-Freigabe gegen denselben Branch auf Basis `e9b74d6` (wirksam nach Merge) und TG26-Buchungsevidenz gegen die Staging-Umgebung (ein Full GetQuote, ein BookShipment, 2026-09-17); DHL-Foundation-Abschnitte gegen `origin/main` `afb9d2b` (Merge #362) und TG84-Evidenz gegen die Staging-Umgebung (Full GetQuotes 1274 und 1275, ein BookShipment DE0052580, 2026-09-17); DHL-Zeitfamilie-Abschnitte gegen `origin/main` `e048d23` (Merge #363); deren Kuratierung stammt aus den bereits erhobenen Staging-Quotes 1265 und 1275, die TG87-Evidenz aus der Staging-Umgebung (ein Full GetQuote 1276, ein BookShipment DE0052581, 2026-09-17); TG107-Abschnitte gegen Branch `feature/dhl-economy-select-107` auf Basis `e048d23` (wirksam nach Merge) und TG107-Evidenz gegen die Staging-Umgebung (ein Full GetQuote 1277, ein BookShipment DE0052582, 2026-09-18); Druckvertrag-Abschnitte gegen Branch `feature/dhl-print-contract` auf Basis `a22fb24` (wirksam nach Merge) und die TG85-Sichtevidenz gegen die Staging-Umgebung (ein Full GetQuote 1282, ein BookShipment DE0052583, 2026-09-18; die Belege wurden lokal gesichert und offline gerendert, ohne weiteren Providerrequest); UPS-Abschluss-Abschnitte gegen Branch `fix/ups-tg22-tg23-tg26-final-readiness` auf Basis `2272672` (wirksam nach Merge; kein Providerrequest — die Fristen stützen sich auf die bereits erhobenen Staging-Messungen); TG-UPS-Effective-Collection-Date-Abschnitte gegen Branch `feature/tg-ups-effective-collection-date` auf Basis `ebdd6a0` (wirksam nach Merge; kein Providerrequest — die Regel stützt sich auf den datumslosen GetQuote und die bestehende Kalenderregel); DHL-Abschluss-Abschnitte gegen Branch `feature/dhl-84-85-87-107-live-booking` auf Basis `aeb7787` (wirksam nach Merge; kein Providerrequest — die Freigabe stützt sich auf die bereits erhobene Staging-Buchungsevidenz DE0052580, DE0052581, DE0052582 und DE0052583); Same-Day-End-to-End-Abschnitte gegen Branch `fix/effective-collection-same-day` auf Basis `4123b0e` (wirksam nach Merge; kein Providerrequest — die Korrektur stützt sich auf die bereits erhobene Staging-Evidenz DE0052637 und DE0052638); Portal-Tarife-Abschnitte (47/110/124) gegen Branch `fix/tg-portal-core-final` auf Basis `a844145` (wirksam nach Merge), gemessen an den gespeicherten Portalaufrufen der Oberfläche vom 2026-09-19 bis 2026-09-23 und am Staging-Portal (2026-09-25, ausdrücklich freigegeben): Erfassung des Zahlschritts ohne Zahlung, Trockenläufe bis zur Warenkorbprüfung, Negativkontrollen ohne Zahlung und genau drei Staging-Buchungen DE0052648 (124), DE0052649 (110, zwei Packstücke) und DE0052650 (47); Produktion unberührt
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

Transglobal-Angebote dürfen Kunden sichtbar sein. Außer dem Referenzservice 22, dem Expressversand (Service 23), dem Standardversand Mehrpaket (Service 26) und — seit dem DHL-Abschluss (2026-09-19, wirksam nach Merge) — DHL Domestic Express (Service 84) samt seiner Zeitvarianten 85 und 87 (DE→DE) sowie DHL Economy Select (Service 107, DE→EU, siehe unten) und — seit 2026-09-23 — UPS Express (Service 29, DE→DE) sowie — seit den Portal-Tarifen (2026-09-25, wirksam nach Merge, hinter eigenen Schaltern) — TNT Express 9:00 (47), GLS Pick&Ship (110, höchstens zwei Packstücke) und DPD PaketShop (124), alle DE→DE, sind sie quote_only und nicht buchbar. Ein Sonderfall ist Service 86: er ist **überhaupt nicht sichtbar**, weil unbelegt ist, welches Carrierprodukt er benennt.

Die UI muss diesen Zustand korrekt kommunizieren und darf Nicht-Buchbarkeit nicht verschleiern.

Ein Transglobal-Angebot erscheint nur mit belegter Kontowährung EUR (`TRANSGLOBAL_ACCOUNT_CURRENCY`); ein Betrag unbekannter Währung wird nie mit Euro-Zeichen angezeigt.

### Transglobal-Buchung

**Status: PRODUCT_DECISION** (bestätigt 2026-09-11)

- Referenzservice ist **Service 22 (UPS Standard Single)**. Öffentliche Buchbarkeit ist technisch vorbereitet, **ausschließlich DE→DE**, ein Paket, Abholung an einem Tag nach heute oder als Abholung am selben Tag (siehe unten).
- **Service 23 (UPS Express Saver, kundenseitig „UPS · Expressversand")** folgt dem Referenzservice 22 als Golden Reference Standard (bestätigt 2026-09-15, TG23): dieselbe Fähigkeitsstruktur — DE→DE öffentlich buchbar vorbereitet, DE→EU Preisauskunft, Preisklasse EXPRESS mit dem Expressaufschlag des Kontos (ohne gültigen Wert der Standardaufschlag), höchstens ein Packstück als CE-Launchgrenze, höchstens 70 kg je Packstück, Art der Lieferadresse nach der Auswahl, Abholung am selben Tag, Transportabsicherung nach Warenwert, voraussichtliche Lieferung (Laufzeit „1": ein Tag), Tracking, Label „PDF · DIN A4 / Thermodruck", Kurzbeschreibung „Schneller Expressversand für eilige Sendungen.". Keine Zustelluhrzeit, keine Garantie; Carrier UPS sichtbar, Einkaufsquelle nie. Status: implementiert (Backend gemergt); **Staging-Smoke bestanden, Buchungsevidenz des Anbieters bestätigt** (2026-09-15: ein GetQuote, ein BookShipment mit Abholung am selben Tag, Privatadresse und Absicherung — Anbieterrechnung netto = TotalCost + Same-Day-Gebühr + Absicherung auf den Cent, Absicherung steuerfrei, Labels A4 und Thermal mit derselben AWB).
- **UPS-Inventar** (bestätigt 2026-09-16, aktualisiert 2026-09-17): Transglobal führt für UPS genau die Services 22, 23, 26 und 29. **Service 22: DONE** (Referenzservice). **Service 23: DONE** (Staging-Buchungssmoke bestanden). **Service 26: DONE** (TG26 — Staging-Buchungssmoke bestanden, freigegeben für den belegten Umfang). **Service 29: DONE** (2026-09-23 — vier eigene Stagingbuchungen, freigegeben für DE→DE mit Folgetagsabholung, siehe unten).
- **Service 29 (UPS Express, kundenseitig „UPS · Express") — Implementierung vollständig, Buchungsfreigabe evidenzgebunden** (bestätigt 2026-09-16): dieselbe Fähigkeitsstruktur wie Service 23 (Preisklasse EXPRESS mit dem Expressaufschlag des Kontos, Art der Lieferadresse nach der Auswahl, Abholung am selben Tag, Transportabsicherung nach Warenwert, Tracking, Label „PDF · DIN A4 / Thermodruck", Kurzbeschreibung „Schneller Expressversand für eilige Sendungen.", voraussichtliche Lieferung als Werktagsprognose ohne Uhrzeit), aber ausschließlich mit belegten Werten: höchstens ein Packstück als CE-Grenze; kein Höchstgewicht, kein Volumendivisor, keine Länge, kein Gurtmaß, keine Zeitzusage. Der Name „Express" ist neutral und innerhalb von UPS eindeutig (neben „Expressversand" der 23), ohne „10:30", „12:00", „vormittags" oder „garantiert", und entspricht dem CE-Tarifnamen des JUMiNGO-Pendants „EXPRESS ®". **Freigegeben 2026-09-23 für DE→DE — der belegte Folgetagsumfang.** Vier weitere eigene Stagingbuchungen haben die früher ungeklärte Position „Collection" über 2,00 € netto isoliert: DE0052640 (privat, Absicherung 500/20, Rechnung 39,01), DE0052641 (privat, ohne Absicherung, 29,01), DE0052642 (geschäftlich, ohne Absicherung, 26,36) und DE0052644 (geschäftlich, ZWEITE Route 63741 → 20095, 26,36). Sie ist damit unabhängig von Adressart, Zusatzabsicherung, Zielzone und Rechnungshöhe: eine feste **Buchungskostenposition je SENDUNG** — nie je Packstück —, die der Anbieter vor der Bestellung in keiner Antwort ausweist (kein `COL` im Breakdown, Preis mit = ohne Abholung; im Webportal alle Abholgebührfelder 0, Steuerprobe in allen fünf Fällen 19 % auf die Basis einschliesslich der Position). Sie ist deshalb **kein Quote-Zuschlag, sondern eine gemessene Eigenschaft des EINKAUFS** und steht an genau einer Stelle (`config/transglobalProviderBookingFee.js`, deny by default, Fail-Fast beim Laden, ausschliesslich DE→DE). Von dort geht sie über dieselbe Funktion in den Einkauf ein, die auch eine Same-Day-Gebühr addiert — also vor Aufschlag, MwSt., gebundenem Kundenpreis und Rechnungserwartung, und in beide Richtungen: bleibt sie eines Tages aus, meldet die bestehende Rechnungsprüfung `provider_charged_less`, ohne die Buchung oder den bestätigten Kundenpreis anzutasten. Keine Pauschale, kein Puffer, keine zweite Zahl im Mapper, im Buchungsweg, in der Preisfunktion oder im Frontend; `lib/pricing.js` bleibt unverändert. **Nicht freigegeben: die Abholung am selben Tag.** Gemessen sind ausschliesslich Folgetagsabholungen; ob der Anbieter an einem heutigen Abholtag diese Position zusätzlich zur Same-Day-Gebühr stellt oder statt ihrer, ist offen — beide Varianten sind mit der Evidenz vereinbar. Der `sameDayCollection`-Vertrag der 29 ist deshalb **entfernt**: ein heutiger Wunschtag verschiebt sich über den Abholtag-Rückfall sichtbar auf den nächsten Versandtag (`collectionDateAdjusted`), „Abholung heute" erscheint für die 29 nicht, und der Preis ist an jedem Tag derselbe. Die Wiederaufnahme ist genau das Wiedereinsetzen dieses Blocks nach einem eigenen Same-Day-Staginglauf. Ebenfalls unverändert nicht freigegeben: DE→EU — dort ist nichts gebucht worden.
- **Service 26 (UPS Standard Multi, kundenseitig „UPS · Standardversand Mehrpaket") — DONE, öffentlich buchbar für genau den belegten Umfang** (bestätigt 2026-09-17, TG26): Staging-Buchungssmoke bestanden (Full Quote 1267, BookShipment DE0052578 — zwei gleiche Packstücke, Privatadresse, Absicherung, späterer Abholtag; Anbieterrechnung = Fracht + einmal Zuschlag Privatadresse + Absicherung auf den Cent, keine weitere Position). Freigegeben: ausschließlich DE→DE, höchstens zwei Packstücke (CE-Launchgrenze aus der Evidenz — mehr ist nicht belegt), N gleiche Packstücke nach dem CE-Modell „Identische Pakete" in stabiler Reihenfolge (Angebotsidentität und Revalidierung binden Stückzahl, Maße und Gewicht), Preisklasse STANDARD, Art der Lieferadresse nach der Auswahl (der Zuschlag kommt aus dem frischen Full Quote; gemessen einmal je Sendung), Transportabsicherung nach Warenwert, Tracking und Druckpflicht. Belege wie gemessen: ein A4- und ein Thermodruck-PDF mit je einer Seite je Paket („Versandlabel (A4)", „Versandlabel (Thermodruck)"). Nicht freigegeben: Höchstgewicht, Volumendivisor, Produktprofil, voraussichtliche Lieferung (die Karte zeigt die Laufzeit „1–5 Tage"), EU-Routen. **Abholung am selben Tag freigegeben (2026-09-23, TG Effective Collection, wirksam nach Merge):** eigene Staging-Buchung am Abholtag mit ZWEI Packstücken — die Anbieterrechnung ist das Quote-Netto plus genau der COLFEE-Satz dieses Quotes, **einmal je Abholung und nicht je Packstück**; die Gebühr wird deshalb nie mit der Stückzahl multipliziert. Die Staging-Platzhalter-Sendungsnummer ist keine Aussage über Produktion: Belege, Tracking und Sendungsliste verarbeiten eine wie mehrere Sendungsnummern generisch („Versandlabel 1 von N (A4)" usw., nur echte Anbieterlabels, keine Dubletten), ohne ServiceID-Weiche und ohne Eingriff in Carrier-PDFs.
- **Service 84 (DHL Domestic Express, kundenseitig „DHL Express · Domestic Express") — vollständig kuratiert, seit dem DHL-Abschluss DE→DE öffentlich buchbar vorbereitet** (bestätigt 2026-09-17, DHL Foundation; freigegeben 2026-09-19, wirksam nach Merge): Staging-Buchungssmoke bestanden (Full Quote 1275, BookShipment DE0052580, Anbieterrechnung INV-0040781 — zwei gleiche Packstücke je 2 kg, Geschäfts- an Privatadresse, Direktabholung am nächsten Werktag, Absicherung 500/20; Rechnung = Fracht + Absicherung + übriger Bestandteil ISC auf den Cent, keine Position „Collection", kein Zuschlag Privatadresse, Absicherung steuerfrei; ein A4- und ein Thermal-PDF mit je drei Seiten, zwei DHL-Stücknummern und eine gemeinsame Sendungsnummer, die die Trackingreferenz ist). Kuratiert ist genau das Belegte: Preisklasse EXPRESS, Abholung beim Absender, nur DE→DE, höchstens zwei Packstücke (CE-Launchgrenze), Tracking, Druckpflicht, Transportabsicherung und die Art der Lieferadresse als Frage OHNE Zuschlag (siehe nächster Punkt). Nicht kuratiert: Höchstgewicht, Maße, Volumendivisor, Produktprofil und Ausschlüsse, Zeit- oder Lieferzusage, CE-Prognose, Stücknummern. **Abholung am selben Tag freigegeben (2026-09-23, TG Effective Collection, wirksam nach Merge):** eigene Staging-Buchung am Abholtag — die Anbieterrechnung ist centgenau das Quote-Netto, ihre Positionen sind exakt der Quote-Breakdown, **ohne jede zusätzliche Abholposition**. Damit ist der zweite Vertragstyp belegt: Abholschluss ja, Gebühr nein (siehe „Abholung am selben Tag"). 85 und 87 leiten ihn aus derselben technischen Familie ab; 86 (kein Angebot) und 107 (DE→EU, eigener Abholvertrag) erben ihn nicht. ISC (im Staging als Testzuschlag bezeichnet, 50,50 € je Packstück) ist ein Stagingbefund: ein gewöhnlicher Preisbestandteil des frischen Quotes, ohne Sonderregel und ohne Betrag im Code; seine Produktionsbedeutung ist offen. **Freigabe (DHL-Abschluss 2026-09-19):** allein der Wechsel der beiden Freigabefelder (`publicBookable: true`, `publicBookableScopes: [DE_DOMESTIC]`); die beiden offenen Punkte sind ohne Sonderlogik aufgelöst — ISC bleibt Teil des Anbieterpreises (jeder frische Quote ist die Quelle; eine Abweichung ist eine gewöhnliche Preisdrift mit `PRICE_CHANGED`), und die an UPS gemessene Bedeutung der Trackingcodes gilt nicht mehr für DHL (siehe „Trackingbedeutung ist carriergebunden").
- **Services 85 und 87 (DHL Domestic Express 9am / 12pm, kundenseitig „DHL Express · Domestic Express 9:00" bzw. „… 12:00") — vollständig kuratiert, seit dem DHL-Abschluss DE→DE öffentlich buchbar vorbereitet** (bestätigt 2026-09-17, DHL Zeitfamilie; freigegeben 2026-09-19, wirksam nach Merge): dieselbe Kuratierung wie die 84 (EXPRESS, Direktabholung, nur DE→DE, höchstens zwei Packstücke, Tracking, Druckpflicht, Transportabsicherung, Art der Lieferadresse ohne Zuschlag), belegt aus denselben Staging-Quotes 1265 und 1275 — dort trägt jede der Zeitvarianten **nur Fracht** im Breakdown: kein Zuschlag Privatadresse trotz privater Zustelladresse, keine Abholposition, kein Sperrgut und **kein ISC** (das ISC ist damit ein Befund der 84 und keine Familienregel).
- **Service 87 — Staging-Buchungssmoke bestanden** (bestätigt 2026-09-17, TG87-Evidenz): Full Quote 1276, BookShipment DE0052581, Anbieterrechnung INV-0040782 — zwei gleiche Packstücke je 2 kg, Geschäfts- an Privatadresse, Direktabholung am nächsten Werktag, Absicherung 500/20. Quote: Fracht 22,54 als einziger Bestandteil, kein ISC, kein Zuschlag Privatadresse, keine Abholposition, kein Sperrgut, With = Without, Absicherung 10,00 als Extra. Rechnung: Fracht + Absicherung = 32,54 netto, Steuer 4,28 nur auf den Versand, brutto 36,82 — centgenau, ohne Position „Collection", ohne Zuschlag Privatadresse, ohne unbekannte Position, ohne Abweichung. Belege: ein A4- und ein Thermal-PDF mit je drei Seiten, **eine gemeinsame Sendungsnummer** und zwei DHL-Stücknummern (eine je Paket), eine Trackingreferenz.
- **Service 85 — Staging-Buchungssmoke bestanden** (bestätigt 2026-09-18, TG85-Evidenz aus dem Druckvertrag; die frühere Aussage „85 hat keine eigene Buchungsevidenz" ist damit überholt): Full Quote 1282, BookShipment DE0052583, Anbieterrechnung INV-0040784 — zwei gleiche Packstücke, Direktabholung, Absicherung 10,00. Quote: Fracht 49,74 als einziger Bestandteil (kein ISC, keine weitere Position). Rechnung: Fracht + Absicherung = 59,74 netto, Steuer 9,45 nur auf den Versand, brutto 69,19 — centgenau, ohne Abweichung. Belege: A4 und Thermal mit je drei Seiten (zwei Etiketten, ein Waybill Doc „[I] EXPRESS 9:00 (32)"), eine gemeinsame Sendungsnummer. **Seit dem DHL-Abschluss (2026-09-19) sind 85 und 87 wie die 84 DE→DE öffentlich buchbar vorbereitet** — allein durch den Wechsel der beiden Freigabefelder; die Namen bleiben „Domestic Express 9:00" / „… 12:00" (keine Namensänderung auf Vermutung), die Uhrzeit bleibt Identität, keine Zusage.
- **Die Zeitzusage existiert nicht — sie wurde gesucht und nicht gefunden** (bestätigt 2026-09-17, TG87-Evidenz): eine Prüfung der gesamten Anbieterantwort auf Zeit-, Liefer- und Zusagefelder ergab für die 87 **genau ein** Zeitfeld (die Laufzeitschätzung „1") und **keine einzige** strukturierte Zusage — kein Lieferdatum, keine Lieferzeit, keine Garantie, keine Geld-zurück-Aussage, keine Meldung. Die einzige weitere Uhrzeit der Antwort ist der Abholschluss, also Abholung statt Zustellung. Auf dem Carrier-Beleg steht dagegen sichtbar „12:00": der Carrier führt die Uhrzeit selbst als Produktbezeichnung. Beides zusammen ist der Beleg für die Produktentscheidung im nächsten Punkt.
- **Die Uhrzeit im Produktnamen ist eine Identität, keine Zusage** (Produktentscheidung 2026-09-17, DHL Zeitfamilie; durch die TG87-Buchungsevidenz bestätigt): weder Anbieterantwort noch Portaltext nennt für die Zeitvarianten eine Zustellzeit — belegt ist allein, **wie der Anbieter das Produkt nennt**. Kundennamen tragen die Uhrzeit deshalb als Teil des Produktnamens („Domestic Express 9:00"), niemals als Versprechen („Zustellung bis …"), und nie eine Garantie oder Geld-zurück-Aussage. Eine Uhrzeit darf nur erscheinen, wenn sie belegt ist: die Schreibweise folgt dem deutschen Katalog desselben Carriers, in dem dieselbe Zeit als kuratiertes Gegenstück geführt wird.
- **Service 86 (DHL Domestic Express 10am) — kuratierte Basis, aber KEIN Angebot** (Produktentscheidung 2026-09-17, DHL Zeitfamilie): der Anbieter nennt ihn „10am", der Katalog desselben Carriers kennt 9:00, **10:30** und 12:00 — eine 10:00 kommt darin nicht vor. Welches Produkt die 86 ist, ist damit offen; die Gleichsetzung mit der 10:30-Variante ist ausdrücklich abgelehnt. Ein Preis ohne kennbares Produkt wird nicht angeboten, und „bis 10 Uhr" darf nirgends erscheinen, solange nur 10:30 belegt ist. Der Eintrag bleibt in der Matrix (operativ ist er unverändert gemessen) und erscheint in der Bestandsdiagnose mit dem eigenen Grund `product_identity_unverified` — nicht als unbekannte ServiceID und nicht als stille Lücke. Auflösbar durch eine Anbieterauskunft zum Produkt oder eine Buchungsevidenz, die es benennt.
- **Art der Lieferadresse ohne Zuschlag** (bestätigt 2026-09-17, DHL Foundation): ein Service kann die Adressart erheben und dem Anbieter übermitteln, ohne dass ein Zuschlag Teil des belegten Anbietervertrags ist. Beide Szenarien tragen dann centgenau denselben Preis; kein Zuschlag wird angekündigt, berechnet oder gebucht. Taucht im frischen Quote dennoch ein Zuschlag oder eine andere Preisdifferenz zwischen Geschäfts- und Privatadresse auf, ist das ein Vertragswechsel: nicht bepreisen, nicht buchen, bis der Vertrag neu geprüft ist. Der Modus ist generisch (keine ServiceID-Weiche) und für jeden Carrier nutzbar; seit der DHL Zeitfamilie tragen ihn die Services 84, 85 und 87, seit dem DHL-Abschluss auch 107.
- **Service 47 (TNT Domestic Express 9am, kundenseitig „TNT · Express 9:00") — DE→DE freigegeben, aber über den PORTALpfad** (bestätigt 2026-09-23): Die 47 ist der einzige Service im Bestand, bei dem sich Quote und Bestellung widersprechen. Der V2-Quote bietet ihn an (netto 31,93); der V2-Buchungsaufruf endet mit `Status FAIL`, „Carrier Error: An invalid service has been entered" (FailReference 52633) — kein Auftrag, keine Rechnung, kein Label. Im Webportal ist derselbe Service buchbar: eigene Stagingbuchung DE0052643, netto 31,93 · MwSt. 6,07 · brutto 38,00 — **centgenau das Netto des V2-Quotes**. Der Grund ist gemessen und keine Vermutung: V2 und Portal wählen das Produkt über zwei verschiedene Schlüssel. Der Portalserver bildet je Warenkorbauftrag serverseitig ein `webBookingService` (47 → 8, 49 → 10); dieser Wert steht in keiner V2-Antwort, in keiner Zeile der V2-Dokumentation, und der Client sendet ihn nie — er ist Evidenz über den Portalserver, kein Requestparameter. Gebucht wird die 47 deshalb über denselben generischen Transglobal-PORTAL-Flow wie 110 und 124 (ein dritter Binder, kein zweiter Ablauf: dieselbe Gesamtfrist, dieselbe centgenaue Preisprüfung vor dem Point of no return, genau ein `CompleteOrder`, kein Retry, eigene Idempotenztabelle). **Zwei Schalter, beide standardmäßig aus:** ohne den Portaladapter gäbe es keinen Bestellweg, ohne den Label-Nachlauf könnte eine bezahlte Buchung ohne kundenverfügbares Etikett entstehen — das Portal erzeugt Etiketten nachweislich asynchron. Kuratiert ist genau das Gemessene: genau ein Packstück, Geschäftsempfänger (Firmenname, keine Adressart), Art der Lieferadresse erhoben und zuschlagsfrei, Tracking und Druckpflicht. **Nicht freigegeben und ausdrücklich nicht abgeleitet:** die Abholung am selben Tag (die 48/49 tragen sie gebührenfrei; die 47 hat einen eigenen Bestellweg, für den nichts am selben Tag gemessen ist — ein heutiger Wunschtag rückt über den Abholtag-Rückfall auf den nächsten Versandtag) und die kostenpflichtige Zusatzabsicherung (belegt ist sie in der TNT-Familie nur für die 44).
- **Der Portalpfad (47, 110, 124) — Zahl- und Adressschritt belegt, je eine Staging-Buchung** (Befund und Produktentscheidung 2026-09-25, Portal-Tarife, wirksam nach Merge): Der gemeinsame Portalkern war nie gegen das echte Portal gelaufen. An den gespeicherten Portalaufrufen der Oberfläche gemessen (2026-09-19 bis 2026-09-23), wichen seine Anfragen an mehreren Stellen ab — Rates-Formular, Serviceauswahl samt Stapelbarkeit (bei der 47 der Schalter eines Zuschlags von 80,00 €), Adressschritt, Packliste, Übersicht mit Warenprüfung, Abhol- und Absicherungsauswahl, Bestätigungskette; er folgt jetzt der belegten Reihenfolge, Zeichen für Zeichen gegen die erfassten Anfragen geprüft. **Harte Regel vor jeder Zahlung:** die Portalzahlung begleicht den GANZEN Warenkorb (belegt: eine Zahlung erfasste fünf Aufträge). Bezahlt wird deshalb nur, wenn der Warenkorb vor dem Aufbau leer war, danach genau den eigenen Auftrag dieses Versuchs enthält — Kennung, Service, Preis centgenau gleich dem revalidierten Einkauf, Warenkorbsummen gleich diesem einen Auftrag, keine Treuepunkte, kein Zusatzbetrag — und die Zahlungsseite danach genau diesen einen Auftrag nennt; eine Kontosperre lässt je Portalkonto nur einen Buchungsversuch zu. Fremde Aufträge werden nie bezahlt und nie entfernt; ein Abbruch vor der Zahlung entfernt ausschließlich den eigenen Auftrag und setzt den Versuch kontrolliert zurück. Kein mutierender Request geht zweimal hinaus — auch nicht über eine stille Neuanmeldung. Die Sendungsnummer des Carriers wird unabhängig vom Etikett festgehalten. **Zahlschritt belegt:** der Wert, der die Zahlung trägt (`ResponseGuid`), kommt aus der Antwort der Warenkorbprüfung (`isValid`/`responseGuid`, erfasst samt Seitencontroller); gezahlt wird nur bei ausdrücklichem `isValid` und GUID-förmigem Wert — nie geraten, nie erzeugt, nie aus einem früheren Lauf. **Adressschritt belegt:** das Portal prüft Abhol- und Zustelladresse vor dem Absenden, danach werden die gespeicherten Adressen bei jeder Buchung zurückgelesen und gegen die Sendung verglichen, einschließlich „keine Tracking-Mail des Anbieters an den Empfänger" (White Label); die Adressen kommen über dieselbe Zuordnung wie beim V2-Weg. Vor- und Nachname zusammen höchstens 21 Zeichen und die Feldlängen der Portalseite gelten vor jedem Providerkontakt — nie gekürzt; eine längere Angabe endet sicher als nicht gebucht (das Angebot bleibt im Vergleich sichtbar; eine Sperre schon im Vergleich ist offen). **Staging-Evidenz 2026-09-25 (ausdrücklich freigegeben):** je eine Buchung 124 (DE0052648, gebundener Paketshop), 110 (DE0052649, zwei Packstücke, Fenster 09–17) und 47 (DE0052650, Firmenempfänger, frühestes Fenster des gebundenen Tages) — Portalpreis = revalidierter Einkauf = Warenkorbsumme centgenau, das Prepaid-Guthaben sank je Buchung um genau den Warenkorbbruttobetrag (6,03 / 18,37 / 38,00 €), genau eine Zahlung und ein Abschluss je Buchung, Referenz der Bestätigung = erfasster Auftrag; dazu Negativkontrollen ohne Zahlung (Preis +0,01 €, abgelaufene Frist, unklarer Ausgang nach Zahlungsbeginn, paralleler zweiter Versuch, fremder Warenkorbeintrag). **Die 110 ist zentral auf höchstens zwei Packstücke begrenzt** (belegter Umfang des Bestellwegs; drei werden weder angeboten noch gebucht). 47, 110 und 124 sind DE→DE öffentlich buchbar vorbereitet hinter ihren Portalschaltern und `TG_PORTAL_LABEL_RECOVERY_ENABLED` (alle default aus); die Schranke B3d (`portal_payment_contract_unproven`) bleibt als Sicherung für den Fall, dass der Zahlvertrag entfällt. Etikett und Sendungsnummer können asynchron entstehen (124 sofort; 110 und 47 über den Nachlauf): für eine Buchung außerhalb der Geschäftszeiten nennt die Auftragsseite des Anbieters das Etikett — bei GLS/TNT auch die Sendungsnummer — erst für den nächsten Werktag (belegt DE0052649/DE0052650, gebucht Freitagabend). Der Nachlauf wartet deshalb bis zu 120 Stunden statt 48 (eine Freitagabendbuchung wäre sonst am Sonntagabend aufgegeben worden), und die 110 trägt seit diesem Befund wie 124 und 47 den Nachlaufschalter als Buchbarkeitsvoraussetzung. **Etikett und Sendungsnummer sind für 47 und 110 am Staging nicht belegt (extern):** für TNT-Portalaufträge erzeugt die Stagingumgebung des Anbieters kein Etikett und keine Sendungsnummer (DE0052643, gebucht 2026-09-23, zwei Tage später weiter „wird generiert", TrackOrder ohne AWB); die erste GLS-Portalbestellung DE0052649 ist erst ab dem nächsten Werktag beobachtbar. Belegt ist der Weg an der 124 (DE0052648: AWB sofort kanonisch, Etikett sofort).
- **Service 107 (DHL Economy Select, kundenseitig „DHL Express · Economy Select") — vollständig kuratiert, seit dem DHL-Abschluss DE→EU öffentlich buchbar vorbereitet** (bestätigt 2026-09-18, TG107; freigegeben 2026-09-19, wirksam nach Merge): der **erste EU-Block mit eigener Buchungsevidenz** — alle früheren Buchungssmokes liefen DE→DE. Staging-Buchungssmoke bestanden (Full Quote 1277, BookShipment DE0052582, Anbieterrechnung INV-0040783 — DE 63741 geschäftlich → FR 75001 privat, **ein** Packstück 2 kg, Direktabholung am nächsten Werktag, Absicherung 500/20; Quote mit Fracht 15,14 als einzigem Bestandteil, kein ISC, **kein Zuschlag Privatadresse trotz privater Zustelladresse**, keine Abholposition, kein Sperrgut, keine Fernzone, With = Without, Absicherung 10,00 als Extra, Abrechnungsgewicht 2 = Realgewicht, Laufzeit „5"; Rechnung = Fracht + Absicherung auf den Cent, Steuer nur auf den Versand, Absicherung steuerfrei, keine Abweichung; ein A4- und ein Thermal-PDF mit je zwei Seiten, eine gemeinsame Sendungsnummer, eine Stücknummer, eine Trackingreferenz). Kuratiert ist genau das Belegte: Preisklasse STANDARD, Abholung beim Absender, nur DE→EU, **höchstens ein Packstück**, Tracking, Druckpflicht, Transportabsicherung. Nicht kuratiert: Höchstgewicht, Maße, Volumendivisor, Produktprofil, Abholung am selben Tag, Zeit- oder Lieferzusage, CE-Prognose, Fernzonen- und PLZ-Regeln. **Freigabe (DHL-Abschluss 2026-09-19):** `publicBookable: true`, `publicBookableScopes: [DE_EU]`, genau ein Packstück (zwei und mehr sind gesperrt), dazu der bei jeder Buchung gemessene Adressartvertrag (nächster Punkt). Eine DE→DE-Route bleibt für die 107 gesperrt.
- **Ein einzelner Adressartbefund ist kein Adressartvertrag** (Produktentscheidung 2026-09-18, TG107): die 107 wurde an eine **private** Zustelladresse gebucht und trug trotzdem keinen Zuschlag. Daraus folgt **keine** Kuratierung: „Art der Lieferadresse ohne Zuschlag" behauptet, **beide** Adressarten trügen centgenau denselben Preis, und gemessen ist nur **eine**. Der Modus wird deshalb nicht von 84/85/87 übernommen; die 107 trägt gar keine Adressartkuratierung, bis beide Szenarien im selben Vertrag gemessen sind. Allgemein: eine Messung einer Adressart belegt nie den Vertrag beider. **Aufgelöst durch Messung statt Annahme (Produktentscheidung 2026-09-19, DHL-Abschluss):** die 107 trägt `deliveryIsResidential: "declared_no_surcharge"` und `collectionIsResidential: "fixed_false"` — nicht als übernommener Vertrag, sondern weil **jede** Buchung ihn neu misst: nach der Auswahl fragen die Optionen genau wie bei jeder Adressartwahl beide Szenarien (geschäftlich und privat) als zwei frische Full Quotes an, beide müssen centgenau gleich sein, und die gewählte Adressart geht als `IsAddressResidential` an den Anbieter. Jede Abweichung — ein Zuschlag, eine andere Preisdifferenz, eine fehlende Antwort — sperrt fail closed: kein Snapshot, keine Bindung, keine Buchung; bei der Revalidierung ergibt sie `PRICE_CHANGED` mit Neubestätigung. Keine dritte Quote, keine neue Preisarchitektur, keine pauschale Zuschlagsregel und keine erfundene DHL-Gebühr. Der Grundsatz bleibt gültig: ein einzelner Befund ist kein Vertrag — deshalb wird der Vertrag vor jeder Buchung gemessen.
- **Die Steuer auf einer EU-Strecke ist gemessen, nicht angenommen** (bestätigt 2026-09-18, TG107): die Anbieterrechnung der 107 ergab einen impliziten Satz von 19,02 % — also 19 % nach Centrundung. Der Wert wurde aus dem Quote gelesen und nur auf innere Konsistenz geprüft; **Preis- und Steuerhoheit bleibt der Anbieter**, und im Code steht kein Steuersatz je Service oder Route. Der CE-Kundenpreis rechnet unverändert mit dem konfigurierten Satz.
- **Trackingbedeutung ist carriergebunden** (Produktentscheidung 2026-09-19, DHL-Abschluss, wirksam nach Merge): die Zuordnung der Transglobal-Ereigniscodes (003 vorbereitet; 005, 021, 160, 167 unterwegs; 011 zugestellt) ist an einem **UPS**-Leg gemessen; für DHL gibt es keine Ereignisevidenz (die TrackOrder-Antwort zu DE0052580 trug keine Ereignisse). Die Bedeutung gilt deshalb nur für Legs eines Carriers, an dem sie gemessen ist (heute UPS). Ein DHL-Leg, ein fremder oder ein fehlender Carrier ergibt den Stand „unbekannt“ — die Ereignisse selbst (Code, Beschreibung, Ort, Zeit) und ein sicherer https-Carrierlink bleiben sichtbar, `delivered_at` wird für DHL nie gestempelt, `shipments.status` bleibt unberührt. Es gibt keine erfundene DHL-Ereignistabelle; eine DHL-Zuordnung kommt erst mit echter DHL-Ereignisevidenz. Unverändert: ERROR/FAIL oder eine fremde Auftragsreferenz schreiben nichts, ein unbekannter Code bleibt „unbekannt“.
- **„Ref No“ auf DHL-Belegen — EXTERNAL_WHITE_LABEL_DECISION_REQUIRED** (Befund 2026-09-19, DHL-Abschlussaudit; offen): Etikett und Waybill Doc der DHL-Belege drucken „Ref No: <Auftragsreferenz der Einkaufsquelle, DE00…> / <CE-Referenz>“ (Sichtprüfung der TG85-Seiten). Die Auftragsreferenz ist eine Buchungsreferenz der Einkaufsquelle, die nach 5.12 kundenseitig nicht erscheinen soll. ConfidaraExpress verändert Carrier-PDFs nicht — kein Neurendern, kein Schwärzen, die Bytes bleiben unverändert — und kann den Punkt deshalb **nicht** im Code schließen. Zu entscheiden ist er extern: eine Anbieterauskunft, ob das Referenzfeld nur die CE-Referenz tragen kann, oder eine ausdrückliche Produktentscheidung, den Aufdruck hinzunehmen. Bis dahin ist er nicht technisch geschlossen. Ob UPS-Belege dasselbe Muster tragen, ist unbekannt (nie gerendert). Das Feld „Payer Details … FRT“ mit der Kontonummer des Frachtzahlers ist ein Abrechnungsfeld des Carriers ohne Namen der Einkaufsquelle und zulässig; die frühere Aussage „kein Konto- oder Supplierhinweis“ (Druckvertrag) war unzutreffend.
- **Transportabsicherung ist eine kuratierte Fähigkeit** (bestätigt 2026-09-16): das Absicherungsextra des Anbieters allein genügt nicht — angeboten, bepreist und gebucht wird sie nur für Services, deren Eintrag sie trägt (22, 23, 26, 29; seit der DHL Foundation auch 84, seit der DHL Zeitfamilie auch 85 und 87, seit TG107 auch 107 — bei allen vieren seit dem DHL-Abschluss wie bei 22/23/26 erst nach der Bindung der Lieferadressart angeboten und bepreist; die 29 weiterhin nicht).
- Alle anderen Transglobal-Services bleiben nicht öffentlich buchbar.
- **Art der Lieferadresse nach der Angebotsauswahl** (Service 22, bestätigt 2026-09-14): „Neue Sendung" fragt vor dem Vergleich keine Adressart. Das Angebot zeigt einen vorläufigen Geschäftspreis; erst nach der Auswahl fragt die Buchung genau „Art der Lieferadresse" mit „Geschäftsadresse + 0,00 €" und „Privatadresse + X,XX €". Eine Abholadressfrage gibt es nicht — die Abholadresse ist für die bindungsrelevanten Quotes serverseitig geschäftlich.
- X ist nie hartkodiert: zwei vollständige serverseitige Kundenszenarien (geschäftlich/privat) mit demselben Aufschlag, derselben MwSt. und demselben Sendungskontext; X = Privat − Geschäft in ganzen Cent. Aufschlag und MwSt. gelten auf den vollständigen Anbieterpreis einschließlich Zuschlag (kein 1:1-Durchreichen). Kundenbezeichnung ausschließlich „Zuschlag Privatadresse".
- **Abholung am selben Tag** (Service 22, bestätigt 2026-09-14): heute buchbar bis zum wirksamen Abholschluss = Abholschluss des frischen Anbieterquotes minus 15 Minuten (Europe/Berlin; keine feste Uhrzeit, keine feste Gebühr). Die Gebühr ist Einkauf und durchläuft Aufschlag und MwSt. mit dem übrigen Anbieterpreis; der Kartenpreis enthält den Zuschlag, darunter „Zuschlag für Abholung am selben Tag: +X,XX €" und „Abholung heute möglich bis HH:MM Uhr". Nach dem wirksamen Abholschluss ist die Abholung heute nicht mehr verkäuflich; seit TG UPS Effective Collection Date trägt das Angebot der 22 und 23 dann den nächsten Versandtag (siehe „Das Versanddatum ist der früheste Abholtag"). Die Sätze „Abholung heute nicht mehr möglich." / „Bitte wählen Sie einen späteren Abholtag." erscheinen nur noch, wo nicht verschoben wird, und in den 409-Antworten der Buchungswege. Keine Checkbox, kein eigener Bindungsschritt; kombinierbar mit Privatadresse und Absicherung. **Zwei Vertragsarten, beide staginggebucht (2026-09-23, TG Effective Collection, wirksam nach Merge):** *gebührenpflichtig* — der Quote führt neben dem Abholschluss ein Gebührenextra, und die Anbieterrechnung ist Quote-Netto **plus genau dieser Satz** (22, 23, 26, 29; bei 26 mit zwei Packstücken gemessen: einmal je **Abholung**). *Gebührenfrei* — der Quote nennt einen Abholschluss, führt aber **kein** Gebührenextra, und die Rechnung ist centgenau das Quote-Netto (84 und 49 gebucht; 85, 87 und 48 aus derselben technischen Familie abgeleitet). Fehlt das Extra, gibt es nichts zu berechnen, nichts auszuweisen und nichts einzufrieren — die **zeitliche** Prüfung (Abholschluss, Sicherheitsabstand, „bereit ab") läuft für beide Arten gleich. 41/44 (DE→EU), 107 (DE→EU) und 86 (kein Angebot) tragen keine; JUMiNGO bleibt unverändert. Service 29 trägt den gebührenpflichtigen Vertrag, **verkauft** die Abholung heute aber erst mit seiner Freigabe — sein Preis nennt seit TG Effective Collection trotzdem den Betrag, der für den angezeigten Tag gilt (nächster Punkt). **„Abholung heute" ist eine Aussage über den TAG, nicht über den Zuschlag** (2026-09-23, wirksam nach Merge): `pickupToday`, der Abholschluss und der Filter „Abholung heute" folgen ausschließlich dem wirksamen Abholtag — Übergabeart Abholung, wirksamer Tag = heute, Abholung heute tatsächlich möglich. Nicht der Gebühr, nicht der Buchbarkeit, nicht einer ServiceID. Vorher hing beides an der Gebühr; die gebührenfreien Dienste fehlten deshalb im Filter, obwohl sie heute abgeholt werden. Der ZUSCHLAG bleibt an beides gebunden: er entsteht nur mit belegter Gebühr und nur, wo der Kunde die Abholung heute auch beauftragen kann — ein Angebot kann also „heute" sagen, ohne eine Zuschlagszeile zu tragen. **Grundvertrag (bestätigt 2026-09-16):** Einzige Quelle des Abholschlusses ist der frische Full-Quote — der Anbieter nennt ihn nur mit Information und solange er nicht vorbei ist; es gibt keine zweite Quelle, keinen Ersatzwert (keine feste Uhrzeit, keine feste Gebühr) und keinen zusätzlichen Providerrequest. Fehlt er, bleibt die Abholung heute gesperrt („Abholung heute für dieses Angebot nicht verfügbar."); sind Abholschluss-, Gebühren- oder Preisdaten unbrauchbar, ebenso („Abholung heute kann derzeit nicht bestätigt werden."); der Hinweis lautet jeweils „Bitte wählen Sie einen späteren Abholtag.". Eine gesperrte Abholung heute zeigt den Abholtag, aber keine „bereit ab"-Zeit. Für 22 und 23 gilt in all diesen Fällen seit TG UPS Effective Collection Date ebenfalls der nächste Versandtag (nächster Punkt); die Diagnose der Abholung heute bleibt unverändert.
- **Das Versanddatum ist der früheste Abholtag** (Produktentscheidung 2026-09-19, TG UPS Effective Collection Date, wirksam nach Merge; **neu gefasst 2026-09-23, TG Effective Collection, wirksam nach Merge — siehe den nächsten Punkt**): für die kuratierten UPS-Abholservices 22, 23 und 26 — und seit dem DHL-Abschluss (2026-09-19, wirksam nach Merge) ebenso für die DHL-Abholservices 84, 85, 87 und 107, über dasselbe kuratierte Feld und ohne neue Datumslogik — verschiebt ConfidaraExpress auf den nächsten nach der bestehenden Kalenderregel zulässigen Werktag (Montag bis Freitag, ohne Feiertage), wenn **ausschließlich** die Abholtag-/Same-Day-Schranke den Wunschtag blockiert — Samstag oder Sonntag, heute ohne Same-Day-Fähigkeit (26 und alle DHL-Dienste: heute → nächster Versandtag) oder heute ohne verkäufliche Abholung am selben Tag (Abholschluss fehlt oder ist erreicht, Sicherheitsabstand, Gebühr nicht bestätigt). Freitag nach dem Abholschluss, Samstag und Sonntag → Montag; ein heute nicht mehr möglicher Werktag → Folgetag; ein späterer Werktag bleibt. Genau so verhält sich JUMiNGO beim Anbieter (Abholtag je Tarif). Transglobal nennt keinen Abholtag und keine Alternative und hat keine Verfügbarkeitsauskunft für künftige Tage — der Tag entsteht deshalb aus derselben CE-Kalenderregel wie die Lieferprognose, aus demselben Quote und ohne weiteren Anbieteraufruf, nie aus einer erfundenen Anbieterantwort. Der wirksame Tag wird angezeigt, am Angebot gespeichert, für Optionen, Neubepreisung, Revalidierung und BookShipment verwendet und nach der Buchung als Versand- und Leistungstag in Sendung, Auftragsbestätigung, Rechnung und Belegen geführt. Jede andere Sperre (Schalter, Routenbereich, Währung, minimaler Quote, fehlende Freigabe) verschiebt nichts; TG29 und die 86 tragen die Regel nicht. Die vier DHL-Staging-Buchungen (DE0052580–DE0052583) liefen bereits mit genau diesem Tag — nächster Werktag, bereit ab 09:00, bei 85 und 107 Freitag → Montag. Einen Feiertag entscheidet — wie bei einem vom Kunden gewählten Tag — die Buchung beim Anbieter; zur Buchungszeit wird nie erneut verschoben (fail closed).
- **Ein wirksamer Abholtag und ein Preis, der zu ihm passt** (Produktentscheidung 2026-09-23, TG Effective Collection, wirksam nach Merge): Der gewählte Versandtag ist der gewünschte **früheste** Abholtag. Ist er für ein Angebot abholbar, bleibt er stehen; ist er es nicht, trägt das Angebot den frühesten, der es ist — nie einen Tag, den der Anbieter nicht erfüllen kann. Welcher Tag wirksam ist und welcher Einkaufsbetrag zu ihm gehört, beantwortet **eine** Stelle (`lib/offers/effectiveCollection.js`); die öffentliche Buchbarkeit **liest** das Ergebnis und bestimmt es nicht mehr. Zwei gemessene Widersprüche fallen damit weg: (1) der Versandkostenrechner zeigte für die 22 mit heutigem Abholtag 14,68 € und „Neue Sendung" für dieselbe Sendung 18,28 €, weil die Gebühr der Abholung am selben Tag nur eingerechnet wurde, wenn das Angebot bereits verkäuflich war — der Kundenpreis entsteht jetzt **genau einmal** aus dem Einkauf des wirksamen Tages, unabhängig davon, ob der Weg gerade verkauft; (2) ein heute möglicher Abholtag wurde verschoben, weil die Frage nach der kuratierten Fähigkeit **vor** der Frage stand, ob der Tag überhaupt möglich ist. Preisfunktion, Aufschlag und Steuersatz sind unverändert. Dass verschoben wurde, sagt das Angebot mit dem neuen öffentlichen Feld `collectionDateAdjusted` — ein **Ja/Nein ohne Grund und ohne Wunschtag**; die Oberfläche beschriftet den Tag daran als „Frühester Abholtag" und zeigt nie einen Grund (der wäre eine Providerinformation). „Heute" ist ab hier im gesamten Backend **ein** Begriff: der Kalendertag der Geschäftszeitzone (`toBusinessCalendarDate`) — die Datumsschranke der `calculate-price`-Route prüfte ihn bis dahin gegen UTC und hielt zwischen 00:00 und 02:00 Berliner Zeit den heutigen Tag für Zukunft. Die JUMiNGO-Providerlogik ist unberührt.
- **Die gebührenfreie Abholung am selben Tag ist durch alle Stufen buchbar — und die letzte Datumsschranke gilt für jede Abholung** (Korrektur 2026-09-25, Same-Day End-to-End, wirksam nach Merge): Seit TG Effective Collection zeigte der Vergleich für die gebührenfreien Dienste (84, 85, 87, 48, 49) bis zum Abholschluss „Abholung heute" — buchen ließ sich das Angebot trotzdem nicht. Optionen und Neubepreisung bepreisten auch für den gebührenfreien Vertrag eine Zuschlagsszenariokette, deren Differenz 0 ist, und werteten diesen Nullunterschied als „Abholung heute nicht verfügbar"; `/book` kannte vor dem Quote nur einen gebührenpflichtigen Same-Day-Befund, und die Abholtagsschranke sperrte den heutigen Tag, bevor ein frischer Quote ihn prüfen konnte; die Oberfläche bot daraufhin „Angebote neu berechnen" an und bekam dieselbe Karte zurück. Jetzt gilt der gebührenfreie Vertrag in jeder Stufe: ein Nullunterschied ist gültig und erzeugt weder Zuschlag noch Szenariokette; Snapshot, Bindung und Einkaufsevidenz sind die gewöhnlichen (nichts einzufrieren); vor dem Quote steht der Befund bei `/book` und der Neubepreisung aus, und der frische Quote entscheidet ihn — Abholschluss, Sicherheitsabstand, „bereit ab" — und unmittelbar vor der Bestellung ein zweites Mal. Optionen leben wie bei der Gebühr höchstens bis zum wirksamen Abholschluss. Kundenpreis und Einkauf sind heute centgenau dieselben wie an einem späteren Tag; BookShipment sendet den heutigen Abholtag ohne Accessory. Ein vor heute gebundenes gebührenfreies Angebot, dessen Tag inzwischen heute ist, bucht genau diesen Tag, wenn der frische Quote ihn bestätigt — es wird nichts verschoben und nichts hinzugefügt; eine gebührenpflichtige Bindung von vor heute bucht heute unverändert nicht. **Mitternacht:** die letzte Schranke vor der Bestellung prüfte den Abholtag bis dahin nur für Dienste mit kuratierter Abholung am selben Tag — bei allen anderen (etwa 29, 41, 44, 107 und die Portalabholungen 47/110) ging ein vor Mitternacht für MORGEN geprüfter Tag nach Mitternacht als HEUTE an den Anbieter, eine nie belegte Abholung am selben Tag. Jetzt verlangt sie für JEDE Abholung ohne verfügbare Abholung heute aus dem frischen Quote einen Abholtag nach heute (Europe/Berlin), sonst wird nicht bestellt. 85, 87 und 48 bleiben abgeleitet — ihre eigene Stagingbuchung am selben Tag steht aus. Die gebührenpflichtige Abholung (22, 23, 26), Portalcode, JUMiNGO, Preisfunktion und Feiertagsmodell (weiterhin keines) sind unverändert.
- **Voraussichtliche Lieferung** (Service 22, bestätigt 2026-09-14; seit TG23 auch Service 23; seit der Freigabe 2026-09-23 auch Service 29): Der Anbieter nennt nur eine Laufzeit. ConfidaraExpress rechnet daraus ab dem Abholtag des Angebots (nach einem Abholtag-Rückfall dem wirksamen) eine eigene voraussichtliche Lieferung — gezählt werden Montag bis Freitag, Samstag und Sonntag werden übersprungen, Feiertage nicht berücksichtigt (die Oberfläche sagt das dazu); „1–2" ergibt einen Zeitraum, „1" einen Tag, „1+" nur „ab". Keine Uhrzeit, keine Anbieterzusage, keine Garantie; keine Wirkung auf Preis, Buchbarkeit, Sortierung, Buchung, Sendungs-ETA oder Kennzahlen. JUMiNGO-Zustelldaten bleiben getrennt und autoritativ.
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

**Offener Punkt W1 — EXTERNAL_WHITE_LABEL_DECISION_REQUIRED (2026-09-19):** DHL-Etiketten und Waybill Docs drucken im Feld „Ref No“ neben der CE-Referenz die Auftragsreferenz der Einkaufsquelle. Das betrifft den Inhalt eines unveränderten Carrier-PDFs, nicht eine CE-Oberfläche; CE rendert und schwärzt keine Carrierbelege. Die Grenze dieses Abschnitts ist für diesen Aufdruck deshalb **nicht technisch geschlossen** — die Entscheidung liegt beim Anbieter (Referenzfeld nur mit CE-Referenz) oder bei einer ausdrücklichen Produktentscheidung (siehe 1A).

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

- Service `publicBookable` **und** Routenbereich in `publicBookableScopes` (heute die Services 22, 23 und 26 sowie seit dem DHL-Abschluss 84, 85 und 87 nur DE→DE, 107 nur DE→EU),
- `TRANSGLOBAL_PUBLIC_BOOKING_ENABLED` (Produktschalter, default aus),
- belegte Kontowährung `TRANSGLOBAL_ACCOUNT_CURRENCY=EUR` (default nicht gesetzt ⇒ kein TG-Angebot),
- Full Quote mit Buchungsreferenz, kuratierte Übergabeart und Preisklasse, gebundene Art der Lieferadresse (Services 22, 23, 26, 84, 85, 87 und 107: nach der Angebotsauswahl; ohne Bindung nicht buchbar), Packstückgrenzen der Service-Policy (22, 23 und 107 höchstens eins, 26, 84, 85 und 87 höchstens zwei),
- bei Abholung ein Abholtag nach heute; heute nur als Abholung am selben Tag eines Services mit dieser Fähigkeit (gebührenpflichtig 22, 23 und 26; gebührenfrei 84, 85, 87, 48 und 49 — siehe „Same-Day End-to-End" unten) vor dem wirksamen Abholschluss. Geprüft wird der Abholtag des Angebots — nach einem Abholtag-Rückfall der wirksame (siehe „Frühester Abholtag" unten).

Angebotsvertrag des Referenzservices (TG22 Golden Offer Contract): Leistungsname „Standardversand" (CE-Klassifikation wie ein Standardangebot der anderen Einkaufsquelle; eingefroren an Angebot, Sendung und Rechnung), Abholvertrag aus Abholtag und „bereit ab 09:00 Uhr" (kein Zeitfenster, kein „bis", keine Fensterwahl), Laufzeit „1–2 Tage" (Zustelldaten erscheinen nur, wo ein Anbieter sie liefert; dazu die voraussichtliche Lieferung als CE-Prognose, siehe unten), Labelformate „PDF · DIN A4 / Thermodruck" ohne Formatwahl, höchstens ein Packstück, zusätzliche Transportabsicherung nach Warenwert (bis 50 € Grundabsicherung ohne Aufpreis, oberhalb der Höchstdeckung kein Zusatz, sonst Preis ausschließlich über die Neubepreisung). Abholung am selben Tag siehe unten (TG22 Same-Day).

Die Bestellung braucht zusätzlich `TRANSGLOBAL_BOOKING_ENABLED` (technischer Kill-Switch, default aus). Angebot und Buchung prüfen dieselbe Quelle.

Art der Lieferadresse (TG22 Residential, wirksam nach Merge): Das Vergleichsangebot trägt den echten Geschäftspreis eines Full Quotes ohne Adressart (`priceCompleteness: "indicative"`, `requiredPriceInputs: ["deliveryIsResidential"]`, `unavailableReason: "price_inputs_required"` — auswählbar, nicht buchbar). Nach der Auswahl bepreist `POST /api/offers/price-input-options` genau zwei vollständige Full Quotes parallel (kein Retry, 15-Minuten-Snapshot am Angebot, fail closed bei jeder Inkonsistenz); `POST /api/offers/price-inputs` bindet ohne Providerkontakt aus diesem Snapshot (neue Preisrevision, eine gebundene Absicherung wird zurückgesetzt). `/book` verlangt Bindung und `offerRevision`, revalidiert mit der gebundenen Wahl und prüft Fracht, Zuschlag, Einkauf, Aufschlag und Kundenpreis gegen die Bindung; jede Abweichung verlangt eine neue Wahl.

Abholung am selben Tag (TG22 Same-Day, wirksam nach Merge): Für Service 22 — seit TG23 ebenso für Service 23 — ist ein heutiger Abholtag buchbar, solange die Berliner Uhrzeit vor dem wirksamen Abholschluss liegt (`SameDayCollectionCutOffTime` des frischen Quotes minus 15 Minuten). Die Gebühr (`COLFEE`, optionales Extra außerhalb von `TotalCost`) wird zum Einkauf addiert und durchläuft die zentrale Preisfunktion; der Anbieter berechnet sie bei einem heutigen `CollectionDate` automatisch, BookShipment sendet kein Accessory. ReadyFrom ist die Uhrzeit der Bestellung, aufgerundet auf die Viertelstunde, mindestens die gespeicherte Bereitzeit. Angebot, Optionen, Bindung, Neubepreisung und `/book` prüfen dasselbe Zeitfenster; eine letzte Schranke unmittelbar vor der Bestellung verhindert eine Bestellung nach dem wirksamen Abholschluss (`409 SAME_DAY_COLLECTION_UNAVAILABLE`). Kein Schalter, keine ENV-Änderung, keine Schemaänderung; alle anderen Services und JUMiNGO unverändert. Grundvertrag (wirksam nach Merge): Einzige Quelle des Abholschlusses ist `SameDayCollectionCutOffTime` des frischen Full-Quotes — Transglobal hat keine eigene Cutoff-Schnittstelle, und das Feld fehlt, wenn dem Anbieter die Information fehlt oder der Abholschluss zum Quote-Zeitpunkt vorbei ist. Kein Ersatzwert, keine zweite Quelle, kein zusätzlicher Providerrequest; ein Preisvergleich stellt weiterhin genau einen Quote. Öffentlich unterscheidet das Angebot `same_day_unavailable` (zeitlich abgelaufen), `same_day_unconfirmed` (kein Abholschluss im Quote) und `same_day_unverifiable` (unbrauchbare Abholschluss-, Gebühren-, Preis- oder Uhrdaten; ebenso jede unbekannte Ursache); jede 409 `SAME_DAY_COLLECTION_UNAVAILABLE` trägt dazu `sameDayUnavailableKind` (`expired` / `unconfirmed` / `unverifiable`) und den Text dieser Art, nie einen internen Grund. Ist die Abholung heute für ein Angebot nicht verkäuflich, trägt die Karte `collectionReadyFrom: null` und nur den Abholtag; der gespeicherte Abholvertrag bleibt unverändert. Seit TG UPS Effective Collection Date gilt beides nur noch für einen Service ohne kuratierten Abholtag-Rückfall — 22 und 23 tragen stattdessen den nächsten Versandtag (siehe „Frühester Abholtag" unten); die 409-Verträge der Buchungswege bleiben unverändert.

Produktdetails (TG22 Package A, wirksam nach Merge): Service 22 trägt ein kuratiertes Produktprofil — wirtschaftlicher Standardversand für weniger eilige Sendungen, ein Packstück je Sendung, höchstens 70 kg je Packstück, Volumendivisor 5.000 ausschließlich zur Erklärung des Abrechnungsgewichts, Paletten und Koffer nicht zugelassen. Öffentlich erscheint es als `serviceDetails` (Codes und Zahlen, dazu die Absicherungsgrenzen 50 € / 2.500 €) und als Tarifgrenze `weight <= 70`; seit TG23 trägt Service 23 beides ebenso (Kurzbeschreibung „Schneller Expressversand für eilige Sendungen."). Die Service-Policy setzt die 70-kg-Grenze an denselben Stellen durch wie die Packstückzahl (Vergleich, Optionen, Revalidierung, `/book`): genau 70,0 kg ist erlaubt, darüber entsteht kein Angebot und keine Buchung, ohne belegtes Gewicht ist die 22 gesperrt. Das Abrechnungsgewicht bleibt der Anbieterwert, die Laufzeit „1–2 Tage" ohne Uhrzeit; ein Datum steht nur in der getrennten voraussichtlichen Lieferung (siehe unten). Nicht Teil des Profils: Access Point, Samstagszustellung, Länge und Gurtmaß, Zustellzusagen, statische Zuschläge oder Preise. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; JUMiNGO und alle anderen Services unverändert.

Voraussichtliche Lieferung (TG22 Package B, wirksam nach Merge): Transglobal nennt keine Zustelldaten, nur `TransitTimeEstimate`. Für Service 22 und seit TG23 für Service 23 rechnet ConfidaraExpress daraus eine eigene Prognose `deliveryProjection { kind: "estimated", dateMin, dateMax }`: Basis ist der Abholtag des Angebots (`requestedShippingDate`, Tag 0), gezählt werden Montag bis Freitag, Samstag und Sonntag werden übersprungen, Feiertage nicht berücksichtigt; `1-2` ergibt einen Zeitraum, `1` einen Tag, `1+` nur `dateMin`. Keine Prognose ohne gültigen Abholtag, bei unlesbarer Laufzeit oder wenn eine heutige Abholung nicht mehr möglich ist und nicht verschoben wird; nach einem Abholtag-Rückfall beginnt sie am wirksamen Abholtag. Keine Uhrzeit, keine Anbieterzusage. Die Prognose steht nie in `deliveryDateMin/Max`, wird nicht gespeichert und hat keine Wirkung auf Preis, Buchbarkeit, Sortierung, Revalidierung, `/book`, Rechnung, Sendungs-ETA, Lieferdatumsfilter oder Kennzahlen. JUMiNGO-Zustelldaten und -uhrzeiten bleiben unverändert autoritativ. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; alle anderen Services unverändert.

Expressversand (TG23, Backend gemergt; Frontend wirksam nach Merge): Service 23 (UPS Express Saver) trägt dieselbe Kuratierung wie der Referenzservice 22 — Leistungsname „Expressversand" (CE-Klassenname des JUMiNGO-Pendants), Preisklasse EXPRESS (Expressaufschlag des Kontos, ohne gültigen Wert der Standardaufschlag; kein Satz im Code; die Absicherung bleibt 1:1 und steuerfrei), `publicBookableScopes` nur DE→DE, höchstens ein Packstück als CE-Launchgrenze und 70 kg je Packstück, Art der Lieferadresse nach der Auswahl, Abholung am selben Tag mit der Gebühr aus dem frischen Quote, Transportabsicherung nach Warenwert, Tracking, Label „PDF · DIN A4 / Thermodruck", Produktprofil `express_urgent` und die voraussichtliche Lieferung (Laufzeit „1": ein Tag). Keine Zustelluhrzeit, keine Garantie, keine Anbieterangaben beim Kunden. Kein neuer Produktionspfad, kein Schalter, keine ENV-Änderung, keine Schemaänderung; JUMiNGO und alle anderen Services unverändert. Die Aktivierung folgt derselben Konjunktion wie bei Service 22 — die Schalter gelten gemeinsam für beide Services. Status: staging smoke passed / provider booking evidence confirmed — ein Staging-GetQuote und ein Staging-BookShipment (2026-09-15) bestätigen die Buchung mit Abholung am selben Tag, Privatadresse und Absicherung: Same-Day-Gebühr automatisch ohne Accessory, Anbieterrechnung netto = TotalCost + COLFEE + INS (Delta 0,00, INS steuerfrei), Labels A4 und Thermal. Positionstexte der Anbieterrechnung nennen den Anbieter; verglichen wird ausschließlich an Beträgen.

UPS-Vervollständigung (wirksam nach Merge): Service 29 (UPS Express, „Express") trägt die Kuratierung der 23 mit ausschließlich belegten Werten — `maxPackages: 1` als CE-Grenze, kein Gewicht, Produktprofil `express_urgent` mit nicht belegtem Divisor (`volumetricDivisor: null`: Profil ja, Volumengewichtsformel nein), Paletten und Koffer, Tracking, Druckpflicht, Absicherung, Art der Lieferadresse, Abholung am selben Tag und Werktagsprognose — seit **2026-09-23 DE→DE öffentlich buchbar** (`publicBookable: true`, `publicBookableScopes: [DE_DOMESTIC]`); DE→EU bleibt Preisauskunft. Belegt ist ein Staging-Full-Quote (2026-09-16: Fracht 24,36, Privatzuschlag 2,65, Same-Day-Gebühr 2,52 mit Abholschluss 17:00, Absicherung 10,00 bei Warenwert 500, Labels A4 und Thermal) und fünf eigene Stagingbuchungen (DE0052577 sowie DE0052640/41/42/44). Der zunächst nicht bestandene Smoke (Quote 1266, Buchung DE0052577) ist durch die vier weiteren Buchungen aufgelöst: die Position „Collection" über 2,00 € netto ist eine feste Buchungskostenposition je SENDUNG, unabhängig von Adressart, Absicherung, Zielzone und Rechnungshöhe, und wird in keinem Vorabkanal ausgewiesen (kein COL-Bestandteil, Preis mit = ohne Abholung; im Webportal alle Abholgebührfelder 0). Sie lebt deshalb als **kuratierter Providerkostenvertrag** an genau einer Stelle (`config/transglobalProviderBookingFee.js`: deny by default, ganze Cent, Fail-Fast beim Laden, nur der gemessene Routenbereich) und geht über `resolveProviderPurchaseNet` in den Einkauf — dieselbe Funktion, die eine Same-Day-Gebühr addiert. Angebot, Optionen, Bindung, Neubepreisung, Revalidierung und Rechnungserwartung rechnen damit denselben Betrag; die Quote-Evidenz der Bindung (`providerNetCents`, `providerTotalCost`) bleibt ausdrücklich OHNE ihn, weil kein Quote sie nennt, und der effektive Einkauf entsteht in `boundPurchaseNetCents` an genau einer Stelle. Eine Angebotszeile, deren Einkauf sie nicht trägt, gilt als nicht gebunden und erreicht den Anbieter nicht. **Nicht freigegeben: die Abholung am selben Tag** — der `sameDayCollection`-Block der 29 ist entfernt, ein heutiger Wunschtag verschiebt sich über `collectionDateFallback` sichtbar auf den nächsten Versandtag, und der Preis ist an jedem Tag derselbe. Service 26 (UPS Standard Multi, „Standardversand Mehrpaket") ist seit TG26 öffentlich buchbar für genau den belegten Umfang: nur DE→DE, `maxPackages: 2` (CE-Launchgrenze, kein Höchstgewicht), Art der Lieferadresse nach der Auswahl (Szenarioprüfung: genau ein Zuschlag Privatadresse), Transportabsicherung, Tracking und Druckpflicht aus Kuration; ohne Abholung am selben Tag, ohne Produktprofil, ohne Prognose. Belegt durch einen Staging-Full-Quote und eine Staging-Buchung (2026-09-17, zwei gleiche Packstücke je 2 kg: Fracht 26,61, Privatzuschlag 2,65 einmal je Sendung, Absicherung 10,00, Rechnung 39,26 netto centgenau ohne weitere Position; ein A4- und ein Thermal-PDF mit je einer Seite je Paket). Das Full-Quote-Paketmodell fragt N gleiche Packstücke an, Revalidierung und Buchung lesen dieselbe Entwurfszeile; eine gemeinsame Sendungsnummer ergibt EIN logisches Versandlabel in zwei Formaten, mehrere Sendungsnummern generisch „Versandlabel k von N (Format)" und je eine Tracking-Etappe. Die Transportabsicherung entsteht nur für Services mit kuratierter Fähigkeit (`capabilities.transportInsurance`: 22, 23, 26, 29) — das Anbieterextra allein genügt nicht. Jede ausgewertete Transglobal-Antwort schreibt eine Bestandszeile (`[TG service-inventory]`: angebotene ServiceIDs, abgelehnte nur mit ServiceID, Carrier und Grund, unbekannte ServiceIDs kuratierter Carrier als Warnung) — ohne zusätzlichen Request. Nachträgliche Anbieterbelastungen bleiben Befund der bestehenden Rechnungsprüfung; die Stornierung ist unverändert. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; JUMiNGO funktional unverändert (das kuratierte Paar „EXPRESS ®" ↔ 29 bestand bereits; für die 26 gibt es kein Paar).

DHL Foundation (wirksam nach Merge): Service 84 (DHL Domestic Express, „Domestic Express") ist vollständig kuratiert — EXPRESS, Direktabholung, nur DE→DE, `maxPackages: 2` (CE-Launchgrenze), Tracking, Druckpflicht, Transportabsicherung und `priceInputs.deliveryIsResidential: "declared_no_surcharge"` —, aber `publicBookable: false` ohne Routenbereich: Preisauskunft; Optionen, Bindung, Neubepreisung und `/book` enden vor jedem Providerkontakt. Belegt durch die Staging-Quotes 1274/1275 und die Staging-Buchung DE0052580 (Rechnung INV-0040781 centgenau: Fracht 17,74 + ISC 101,00 + Absicherung 10,00, Steuer nur auf den Versand; kein `RES`, kein `COL`, keine Position „Collection"; Laufzeit „1", Abrechnungsgewicht 4; Abholschluss im Quote, aber keine Abholung am selben Tag). Die Aktivierungsprobe beweist die ganze Kette mit genau dem Wechsel der beiden Freigabefelder. Offen vor einer Freigabe: die Zuordnung der DHL-Trackingereignisse (keine erfundene Abbildung — ein nicht belegter Code bleibt „unbekannt") und die Produktionsbedeutung von ISC. **Art der Lieferadresse ohne Zuschlag** ist ein generischer Modus der Service-Policy (`PRICE_INPUT_MODE.DECLARED_NO_SURCHARGE`, nur für die Zustelladresse; die Abholadresse bleibt fest geschäftlich): die Adressart wird wie bei `surcharge_options` nach der Auswahl erfragt, gebunden und an den Anbieter übermittelt, beide Szenarien müssen aber centgenau gleich sein; die Bestandteile tragen nie „Zuschlag Privatadresse" und die Herleitung `scenario_difference_no_residential_surcharge` (bestehende Snapshots behalten `scenario_difference`). Das Angebot nennt die Angabe zusätzlich in `surchargeFreePriceInputs` (öffentlich, providerneutral, Teilmenge von `requiredPriceInputs`, sonst `[]`). Fail closed: ein `RES` oder eine andere Preisdifferenz der Szenarien sperrt die Optionen (`409 OFFER_NOT_BOOKABLE`, kein Snapshot, kein Wiederholungsangebot); ein Zuschlag bei der Revalidierung ergibt `PRICE_CHANGED` mit Neubestätigung, die dann an derselben Sperre endet; Snapshot, Bindung, Evidenz und Bestandteile werden gegen die aktuelle Kuratierung gelesen — wechselt sie, gilt keine alte Bindung. ISC und jeder andere Bestandteil außer Fracht und Zuschlag sind gewöhnliche Einkaufsbestandteile ohne Sonderregel. Belege: eine gemeinsame Sendungsnummer ergibt EIN logisches Versandlabel in zwei Formaten und genau eine Trackingreferenz; DHL-Stücknummern stehen nur im Carrier-PDF und werden nicht gespeichert (kein Datenmodell ohne Bedarf). Die Metadaten der gemessenen Carrier-PDFs nennen die Einkaufsquelle; Kundendownloads und Mailanhänge laufen durch die bestehende Metadaten-Neutralisierung, der Seiteninhalt bleibt unverändert (sichtbarer Text ohne Einkaufsquelle in den ausgewerteten Inhalten; eine Sichtprüfung der dritten Seite steht aus). Fristen: unverändert. Jede Full-Quote-Wiederholung nach der Auswahl (Optionen, Neubepreisung, Revalidierung vor dem Claim) nutzt weiterhin `TRANSGLOBAL_BOOK_PRE_ORDER_TIMEOUT_MS` mit 20 s, der Vergleich `TRANSGLOBAL_QUOTE_TIMEOUT_MS` mit 30 s, die Bestellung `TRANSGLOBAL_ORDER_TIMEOUT_MS` mit 90 s. **Offener Betriebsbefund, nicht Teil dieses Pakets:** die gemessenen Staging-Full-Quotes liegen bei etwa 26–41 s, sodass die heutigen Vorgaben dort zu Timeouts führen können; die Produktionslatenz ist nicht gemessen; keine Umgebung setzt einen der drei Schlüssel (Stand 2026-09-17, nur Schlüsselnamen gelesen). Die Lösung gehört in ein eigenes TG-weites Latenz-/Fristenpaket — die DHL Foundation ändert keine Frist. (Nachtrag: dieser Befund ist durch den UPS-Abschluss TG22/TG23/TG26 aufgelöst, die geltenden Fristen stehen dort.) Kein Schalter, keine ENV-Änderung, keine Schemaänderung; 22, 23, 26, 29 und JUMiNGO unverändert. (Nachtrag DHL-Abschluss 2026-09-19: die 84 ist DE→DE freigegeben, die beiden offenen Punkte — Trackingereignisse und ISC — sind dort aufgelöst.)

DHL Zeitfamilie (wirksam nach Merge): die Services 85 (9am) und 87 (12pm) tragen dieselbe Kuratierung wie die 84 und heißen kundenseitig „Domestic Express 9:00" bzw. „Domestic Express 12:00"; beide bleiben `publicBookable: false` ohne Routenbereich. Belegt **ohne einen einzigen neuen Providerrequest** aus den bereits erhobenen Staging-Quotes 1265 (ein Packstück) und 1275 (zwei Packstücke je 2 kg): Carrier DHL, kein Lagerservice, keine `CollectionOptions`, With = Without, `TransitTimeEstimate` „1", `INS` 10,00 als optionales Extra, kein `COLFEE`, Abholschluss 15:00, Primary-Label PDF A4/Thermal — und im Breakdown **ausschließlich Fracht**: kein `RES` trotz privater Zustelladresse, kein `COL`, kein `STK` und **kein `ISC`**. Damit ist von der anderen Seite belegt, dass `ISC` ein Befund der 84 ist und keine Familienregel. **Die 87 hat danach ihre eigene Buchungsevidenz** (Staging, ausdrücklich freigegeben, 2026-09-17: genau ein Full GetQuote und genau ein BookShipment, kein Retry, kein TrackOrder, kein Cancel): Quote 1276 mit Fracht 22,54 als einzigem Bestandteil — kein ISC, kein Zuschlag Privatadresse trotz privater Zustelladresse, keine Abholposition, kein Sperrgut, With = Without, Absicherung 10,00 als Extra, Laufzeit „1", Abrechnungsgewicht 4, keine CollectionOptions, kein Lagerservice. Buchung DE0052581, Rechnung INV-0040782 = Fracht + Absicherung = 32,54 netto, Steuer 4,28 nur auf den Versand, brutto 36,82, centgenau und ohne Abweichung; keine Position „Collection", kein Zuschlag Privatadresse, kein Sperrgut, keine unbekannte Position. Belege: ein A4- und ein Thermal-PDF mit je drei Seiten, eine gemeinsame Sendungsnummer, zwei DHL-Stücknummern (eine je Paket), eine Trackingreferenz. Aus derselben Antwort wurden 84, 85 und 86 ohne Zusatzanfrage mitprotokolliert; die 86 wurde dabei live mit `product_identity_unverified` gesperrt — die neue Schranke greift gegen echte Anbieterdaten. 85 und 86 haben **keine** eigene Buchungsevidenz; alle drei bleiben Preisauskunft. **Die Uhrzeit im Namen ist Produktidentität, keine Zusage:** weder Anbieterantwort noch Portaltext nennt eine Zustellzeit, deshalb steht die Uhrzeit als Teil des Produktnamens und nie als „Zustellung bis …", ohne Garantie und ohne Geld-zurück-Aussage; die Schreibweise folgt dem kuratierten Gegenstück desselben Carriers im anderen Einkaufsweg („EXPRESS DOMESTIC 9:00" / „… 12:00"), die Uhrzeit ist also doppelt belegt. **Service 86 (10am) erzeugt kein Angebot:** der Katalog desselben Carriers kennt 9:00, 10:30 und 12:00 — welches Produkt „10am" benennt, ist offen, und die Gleichsetzung mit der 10:30-Variante ist ausdrücklich abgelehnt. Umgesetzt ist das als allgemeine Schranke, nicht als ServiceID-Sonderfall: das neue Policy-Feld `productIdentityVerified` (Default `true`, damit kein künftiger Eintrag still unsichtbar wird) und der neue Grund `product_identity_unverified`, geprüft **vor** der Carrierprüfung; der Eintrag bleibt in der Matrix und erscheint mit diesem Grund in der Bestandsdiagnose. Bewusst **nicht** übernommen: die Portalbeschreibung der DHL-Expressfamilie (Maße, Gewichtsempfehlung, Palettenhinweis) ist ein Familientext für jedes Produkt und kein Vertrag je Service; sekundäre Grenzen aus dem DHL-Deutschland-Katalog gelten für einen anderen Vertragspartner; der im Portal sichtbare Sperrgutzuschlag (75,00 € für alle vier DHL-Inlandsservices) und `postcodeCheckRequired` stehen **nicht** in der V2-API — CE kann sie weder sehen noch weitergeben, deshalb steht keiner von beiden im Code, und die **Postleitzahl-Verfügbarkeit ist für CE nicht feststellbar**. Offener Befund außerhalb dieses Pakets: die TNT-Zeitprodukte 47/48/49 tragen aus einer früheren Kuratierung „Express — Zustellung bis 9/10/12 Uhr" — dieselbe Formulierung mit derselben offenen Zusagefrage; eigene TNT-Klärung. **Familienevidenz aus TG84 + TG87** (zwei Services desselben Carriers, dieselbe Route, derselbe Testfall, zweimal dieselbe Struktur): Direktabholung, Collection-Verhalten (With = Without, keine Abholposition in der Rechnung, kein Abholetikett), Art der Lieferadresse ohne Zuschlag, Transportabsicherung als eigene steuerfreie Rechnungsposition, Rechnung = frischer Quote + gewählte Absicherung, Steuer nur auf den Versand, Belegformate (Primary PDF in A4 und Thermal, je drei Seiten) und das Sendungsnummernmodell (eine gemeinsame Nummer, Stücknummern je Paket). **Nicht** als Familienvertrag übernommen: die genaue Uhrzeit, eine Garantie, die Postleitzahl-Verfügbarkeit, Gewichtsgrenzen, das ISC (Befund der 84) und die Produktidentität der 86. Weitere Providerevidenz ist für den heutigen Stand nicht nötig: die 85 braucht ihren eigenen Buchungssmoke erst für eine Freigabe, die 86 eine Anbieterauskunft. Kein Schalter, keine ENV-Änderung, keine Schemaänderung, keine Fristenänderung; 84, 22, 23, 26, 29 und JUMiNGO unverändert, 107 und 117/118 nicht angefasst. (Nachtrag DHL-Abschluss 2026-09-19: die 85 hat ihre Buchungsevidenz seit 2026-09-18 — Quote 1282, DE0052583, siehe Druckvertrag —; 85 und 87 sind DE→DE freigegeben, die 86 bleibt unverändert gesperrt.)

TG107 DHL Economy Select (wirksam nach Merge): Service 107 ist vollständig kuratiert — STANDARD, Direktabholung, nur DE→EU, `maxPackages: 1`, Tracking, Druckpflicht, Transportabsicherung —, aber `publicBookable: false` ohne Routenbereich: Preisauskunft. Er ist der **erste EU-Block mit eigener Buchungsevidenz**; alle früheren Buchungssmokes liefen DE→DE. Belegt durch Staging-Quote 1277 und Buchung DE0052582 / Rechnung INV-0040783 (DE 63741 geschäftlich → FR 75001 privat, EIN Packstück 2 kg, 30 × 20 × 15 cm, Warenwert 500, Absicherung 500/20; ausdrücklich freigegeben, genau ein Full GetQuote und genau ein BookShipment, kein Retry, kein TrackOrder, kein Cancel): Carrier DHL, `ServiceType` Air, kein Lagerservice, **keine `CollectionOptions`**, Abholschluss 14:30, **Fracht 15,14 als einziger Bestandteil** — kein `ISC`, kein `RES` trotz privater Zustelladresse, kein `COL`, kein `STK`, keine Fernzone, kein unbekannter Code —, With = Without, `INS` 10,00 als optionales Extra, kein `COLFEE`, **Abrechnungsgewicht 2 = Realgewicht (kein Volumengewicht)**, Laufzeit „5", Primary-Label PDF A4/Thermal, EUR. Rechnung = Fracht + Absicherung = 25,14 netto, Steuer 2,88 nur auf den Versand, brutto 28,02 — centgenau, ohne Position „Collection", ohne Zuschlag Privatadresse, ohne Sperrgut, ohne unbekannte Position, ohne Abweichung; die Absicherung ist eine eigene **steuerfreie** Position. Belege: ein A4- und ein Thermal-PDF mit je **zwei** Seiten (die DHL-Express-Inlandsbelege hatten drei), **eine gemeinsame Sendungsnummer**, eine DHL-Stücknummer, genau eine Trackingreferenz, keine `Documents`. **Die EU-Steuer wurde gemessen, nicht angenommen:** der Satz wird aus dem Quote gelesen (Brutto/Netto) und nur auf innere Konsistenz geprüft; Ergebnis 19,02 %, also 19 % nach Centrundung — im Code steht kein Steuersatz je Service oder Route, und Preis- wie Steuerhoheit bleibt der Anbieter. **Die Adressart bleibt bewusst unkuratiert:** die Zustelladresse war privat und trug keinen Zuschlag, aber das ist ein Befund über EINE Adressart und kein Vertrag über beide; „Art der Lieferadresse ohne Zuschlag" wird deshalb **nicht** von 84/85/87 übernommen, und die 107 trägt gar kein `priceInputs`. Ein unkuratierter Abholservice fällt providerweit auf „beide Adressarten" zurück — bestehendes Verhalten für jeden unkuratierten Transglobal-Service und folgenlos, solange die 107 `quote_only` ist; eine zuschlagsfreie Zusage gibt sie ausdrücklich nicht. Ebenfalls **nicht** kuratiert: Höchstgewicht, Maße, Volumendivisor (aus einer Sendung ohne Aufschlag ist kein Divisor rückrechenbar; der Portaltext 120 × 80 × 100 cm / 70 kg ist ein Familientext), Abholung am selben Tag, Produktprofil, CE-Prognose, Zeit- oder Lieferzusage (die Antwort trug genau ein Zeitfeld und **null** strukturierte Zusagen), Fernzonen- und PLZ-Regeln (die V2-API führt weder das eine noch das andere; der Portalwert des EU-Sperrgutzuschlags von 175,00 € steht nirgends im Code) sowie **DHL-Trackingereigniscodes** (die bekannte Tabelle stammt aus UPS-Belegen und bleibt unverändert). White Label wie bei 84/87: „Transglobal Express" nur in den PDF-Metadaten, die bestehende Neutralisierung genügt, der Seiteninhalt wird nie verändert. Offen vor einer Freigabe: der Adressartvertrag (zwei Szenarien statt einem), mehr als ein Packstück, weitere EU-Ziele (gemessen ist eine von 27 Strecken), die Zuordnung der DHL-Trackingereignisse, Fernzonen-/PLZ-Verfügbarkeit und Gewichts-/Maßgrenzen. Kein Schalter, keine ENV-Änderung, keine Schemaänderung, keine Fristenänderung; 84/85/86/87, 22, 23, 26, 29 und JUMiNGO unverändert, 117/118 nicht angefasst. (Nachtrag DHL-Abschluss 2026-09-19: die 107 ist DE→EU freigegeben — der Adressartvertrag wird bei jeder Buchung in beiden Szenarien gemessen, mehr als ein Packstück bleibt gesperrt, die Trackingbedeutung ist carriergebunden; weitere EU-Ziele, Fernzonen-/PLZ-Verfügbarkeit und Gewichts-/Maßgrenzen sind keine CE-Regel, sondern entscheidet der frische Quote jeder Sendung: ein Ziel, für das der Anbieter die 107 nicht nennt, erzeugt kein Angebot und keine Buchung.)

**Druckvertrag mehrseitiger Providerbelege** (wirksam nach Merge): Ein Anbieterbeleg ist nicht zwangsläufig nur ein Etikett. Die erste Sichtprüfung eines echten Belegs (TG85, Quote 1282, Auftrag DE0052583, Rechnung INV-0040784, zwei Packstücke) zeigt für A4 **und** Thermodruck je **drei Seiten**: zwei Versandetiketten, die der Carrier selbst mit „attach it to your parcel“ beschriftet, und danach ein **Waybill Doc** mit „**Not to be attached to package - Hand to Courier**“ und „Please print off and hand this Waybill Doc to the driver.“ ConfidaraExpress nannte die ganze Datei „Versandlabel“ und sagte zum Umgang mit den Seiten nichts — ein Kunde konnte den Frachtbrief aufkleben oder wegwerfen, obwohl ihn der Fahrer braucht. **Daraus wird ausdrücklich keine Seitenregel:** UPS Standard Multi (26) liefert für zwei Packstücke **zwei** Seiten, beide Etiketten, ohne Begleitdokument. „Seiten = Packstücke + 1“ ist ein Befund der DHL-Familie, keine Regel; es wird keine Seite klassifiziert, keine Seitennummer genannt und kein Anbieter unterschieden. Abgebildet wird allein die über alle Anbieter wahre Aussage: hat ein Beleg mehr als eine Seite, kann CE die Zuordnung nicht bestimmen — der Carrier kann es und druckt sie auf die Seite. Dafür trägt `shipment_provider_documents` die Spalte `page_count` (additiv, idempotent; `NULL` heißt „nicht erfasst“ und ergibt **keinen** Hinweis — der Satz behauptet „umfasst mehrere Seiten“, und das darf nicht über etwas gesagt werden, das niemand gemessen hat; bewusst **nicht** fail closed, weil eine unbelegte Aussage hier schlimmer wäre als eine fehlende. Für den auslösenden Fall folgenlos: die DHL-Familie war beim Druckvertrag `quote_only`, es existiert kein ausgelieferter DHL-Beleg im Altbestand, und jede künftige Buchung — seit dem DHL-Abschluss auch jede DHL-Buchung — trägt die Seitenzahl), gelesen mit `pdf-lib` einmal je Beleg direkt nach der Buchung; ein synchroner Byte-Scan wäre billiger und ist **nachweislich gescheitert**, weil die Anbieterbelege PDF 1.5 mit komprimierten Objektströmen sind. Die Seitenzahl ist beschreibend und steht **nicht** im Integritätsabgleich; die Prüfsumme deckt die Bytes. Die PDF-Bytes werden nur gelesen, nie verändert. **White Label ist damit für einen DHL-Beleg erstmals visuell belegt:** über sechs gerenderte Seiten kein sichtbarer Name der Einkaufsquelle und keine Anbieter-URL; das Absenderfeld nennt CEs eigenen Kontonamen, und die einzigen „Transglobal Express“-Vorkommen liegen in `Author` und `Creator` der PDF-Metadaten, die `sanitizeCustomerPdfMetadata` vollständig ersetzt. **Korrektur 2026-09-19 (DHL-Abschlussaudit):** die frühere Aussage „kein Konto- oder Supplierhinweis“ war unzutreffend — Etikett und Waybill Doc tragen „Ref No: <Auftragsreferenz der Einkaufsquelle> / <CE-Referenz>“ (offen als EXTERNAL_WHITE_LABEL_DECISION_REQUIRED, siehe 1A und 5.12; CE verändert den Seiteninhalt nicht) und „Payer Details … FRT“ mit der Kontonummer des Frachtzahlers (Abrechnungsfeld des Carriers ohne Namen der Einkaufsquelle, zulässig). Erlaubtes DHL-Branding ist reichlich vorhanden. Nebenbefund: die **Produktidentität der 85** ist vierfach belegt (Quote-Name, Labelkopf „EXPRESS 9:00“, Waybill Doc „[I] EXPRESS 9:00 (32)“ mit DHL-Servicecode, Rechnungsposition) — **ohne** dass daraus eine Zustellzusage folgt; der Quote trug genau ein Zeitfeld und null strukturierte Zusagen. Derselbe Weg über das Waybill Doc ist der aussichtsreichste, um die Produktidentität der 86 zu klären. Keine Freigabe-, Preis-, Policy-, ENV- oder Schalteränderung.

**UPS-Abschluss TG22/TG23/TG26** (wirksam nach Merge): Die Transglobal-Fristen folgen den gemessenen Antwortzeiten (Staging, 2026-09-16 bis -18: Full Quotes 26,5–46,4 s, BookShipment 12,6–14,2 s, TrackOrder 39,9 s in einer Messung; **die Produktionslatenz ist nicht gemessen**). Mit den früheren Fristen endete jede Full-Quote-Wiederholung nach der Auswahl (20 s) und die Mehrzahl der Vergleiche (30 s) als Abbruch — sicher, aber ohne Angebot bzw. ohne Buchung —, TrackOrder (fest 15 s) immer. Server: Vergleich `TRANSGLOBAL_QUOTE_TIMEOUT_MS` **55 s**; Optionen, Neubepreisung und Revalidierung vor dem Claim `TRANSGLOBAL_BOOK_PRE_ORDER_TIMEOUT_MS` **55 s**; Bestellung `TRANSGLOBAL_ORDER_TIMEOUT_MS` unverändert **90 s** (ein Abbruch dort ist mehrdeutig); TrackOrder neu über `TRANSGLOBAL_TRACKING_TIMEOUT_MS` mit **50 s** (Bereich 1000–60000, ein ungültiger Wert fällt auf die Vorgabe zurück — dieselbe Disziplin wie bei den übrigen Fristen). Jede Frist ist eine Notbremse, keine Wartezeit, liegt über dem gemessenen Höchstwert und unter der Browserfrist ihres Aufrufers; `/book` im Grenzfall 55 s + 90 s = 145 s unter 150 s. Jeder Transglobal-Anbieteraufruf schreibt genau eine Laufzeitzeile `[TG timing]` mit Methode, Transportart, HTTP-Status, Dauer und Frist — nie Körper, Zugangsdaten, Host, Auftragsreferenz oder Antwortinhalt. Der Transglobal-Trackingtakt stellt eine Sendung nach einem gescheiterten Abruf im Prozess zurück (mindestens die Freshness-Frist, verdoppelt je weiterem Fehlschlag, höchstens 6 h; ein Erfolg hebt sie auf) und zählt für den Circuit Breaker nur Transport- und Konfigurationsfehler: dauerhaft scheiternde Sendungen verdrängen die übrigen nicht mehr. Ein Fehlschlag schreibt weiterhin nichts, es gibt keinen Retry, der JUMiNGO-Takt ist unverändert. Kein Schalter, keine Freigabe-, Preis-, Policy- oder Schemaänderung; Same-Day-Normalizer (ohne Beleg für einen fehlerhaften Quellfall nicht angefasst), Kuratierung der 22/23/26 (26 höchstens zwei Packstücke), `MULTI_PROVIDER_DEBUG_MODE`, TG29, DHL und JUMiNGO unverändert. Ob Proxy und Containerlaufzeit diese Fristen tragen (Traefik-Fristen, Stop-Grace für `SHUTDOWN_GRACE_MS` 150 s), ist ein Runtime-Fakt (21).

**Frühester Abholtag — TG UPS Effective Collection Date** (wirksam nach Merge): Das Versanddatum des Kunden ist der früheste gewünschte Abholtag. Die Service-Policy führt die Regel als kuratiertes Feld `collectionDateFallback: "next_business_day_mon_fri"` — heute genau an 22, 23 und 26 sowie seit dem DHL-Abschluss an 84, 85, 87 und 107; kein Eintrag erbt es, keine ServiceID-Weiche im Code. Der Angebotsmapper bewertet zuerst den Wunschtag unverändert. Sperrt ausschließlich die Abholtagsschranke (`collection_date_not_bookable`: Wochenende, heute ohne Same-Day-Fähigkeit; `same_day_collection_unavailable`: Abholschluss fehlt oder erreicht, Sicherheitsabstand, Gebühr, Preis oder ReadyFrom unbrauchbar) und liegt der Wunschtag heute oder später, bewertet er denselben Service aus DEMSELBEN Quote für `addBusinessDaysMonFri(Wunschtag, 1)` vollständig neu — Abholvertrag mit ReadyFrom 09:00, Same-Day-Befund (künftiger Tag: keiner), Preis ohne Gebühr, Buchbarkeit, Lieferprognose — und übernimmt den Tag nur, wenn das Angebot dort buchbar ist oder ausschließlich die Szenariowahl aussteht. Jede andere Sperre verschiebt nichts (Schalter, Routenbereich, Kontowährung, minimaler Quote, fehlende Freigabe, Vergangenheit); die Paketregeln greifen vorher (26: zwei Packstücke ja, drei nein). `shipment_offers.collection_date` trägt den wirksamen Tag; Optionen, Bindung, Neubepreisung, Revalidierung und `/book` lesen ausschließlich ihn, BookShipment sendet `Collection.CollectionDate` = Angebotstag, kein Clientwert wird gelesen. Der Wunschtag bleibt bis zur Buchung an der Entwurfszeile; der Abschluss (`completeBookedShipment`), die Rechnungsprüfung vor der Bestellung und der Klärungsweg setzen den Versand- und Leistungstag über denselben Leser der Angebotszeile (`storedOfferCollectionContract`) — Sendung, Auftragsbestätigung, Rechnung und Folgebelege tragen den gebuchten Tag; ohne gespeicherten Abholvertrag (Paketshopabgabe, Altangebot) bleibt es beim Sendungstag. Zur Buchungszeit wird nie erneut verschoben: ist der Angebotstag inzwischen heute oder vorbei, endet `/book` vor dem Anbieter. Je verschobenem Angebot eine Protokollzeile `[TG collection-date] service=… requested=… effective=… reason=…` (nur ServiceID, Kalendertage, Grundcode); die `[TG same-day]`-Zeilen bleiben. Requests unverändert: ein Full GetQuote je Vergleich, keine Tag-für-Tag-Quotes. Kein Schalter, keine ENV-, Schema-, Preis- oder Freigabeänderung; Schranke L, Same-Day-Zeitfenster und -Preis, TG29, DHL und JUMiNGO unverändert. (Nachtrag DHL-Abschluss 2026-09-19: 84, 85, 87 und 107 tragen dasselbe Feld — siehe nächster Absatz.)

**DHL-Abschluss TG84/TG85/TG87/TG107** (wirksam nach Merge): Die vier kuratierten DHL-Dienste sind öffentlich buchbar vorbereitet — 84 („Domestic Express"), 85 („Domestic Express 9:00") und 87 („Domestic Express 12:00") nur DE→DE mit höchstens zwei Packstücken, 107 („Economy Select") nur DE→EU mit genau einem Packstück. Die Freigabe ist je Eintrag der Wechsel `publicBookable: true` mit `publicBookableScopes` (`DE_DOMESTIC` bzw. `DE_EU`) und `collectionDateFallback: "next_business_day_mon_fri"`; bei der 107 zusätzlich `priceInputs { deliveryIsResidential: "declared_no_surcharge", collectionIsResidential: "fixed_false" }`. Kein neuer Code im Buchungsweg: Angebot, Optionen (zwei parallele Full Quotes geschäftlich/privat, centgenau gleich, sonst `409 OFFER_NOT_BOOKABLE` ohne Snapshot), Bindung (`scenario_difference_no_residential_surcharge`), Neubepreisung der Absicherung, Revalidierung (frischer Full Quote aus der gespeicherten Sendung — fehlt der Service im frischen Quote, etwa weil der Anbieter ihn für die Postleitzahl nicht mehr nennt, endet `/book` mit `409 OFFER_NOT_BOOKABLE`; ein Transportfehler mit `503 PRICE_UNCONFIRMED`; keine zusätzliche Verfügbarkeitsanfrage), BookShipment (`QuoteSelection` + `BookDetails { ServiceID, Collection { CollectionDate, ReadyFrom }, Insurance }` aus der gespeicherten Angebotszeile; kein Clientfeld überschreibt ServiceID, Anbieter, Preis, Abholtag oder Adressartvertrag), der dreiwertige Ausgang (unklar ⇒ `202 BOOKING_PENDING`, Klärungsfall, kein Retry), die Rechnungsprüfung gegen die erwartete Anbieterrechnung (Mehr- oder Minderbelastung als Befund, der Kundenpreis bleibt), der Druckvertrag (Bytes unverändert, Metadaten neutralisiert, keine `DownloadURL`, Hinweis bei mehrseitigen Belegen) und die Trackingprojektion sind die bestehenden generischen Verträge — die neuen Suiten beweisen die volle Kette je Dienst mit der echten Matrix. **Preis:** der Anbieterpreis des frischen Quotes ist die Quelle; ISC (84) bleibt ein gewöhnlicher Bestandteil, es gibt keine hartkodierte Gebühr, keinen DHL-Sonderaufschlag, keine erfundene Fernzonengebühr und keinen Puffer; der Kundenpreis entsteht über die zentrale Preisfunktion mit dem konfigurierten Steuersatz. **Abholtag:** heute ist für DHL nie buchbar (keine Same-Day-Fähigkeit) — heute, Samstag und Sonntag tragen den nächsten Versandtag, ein späterer Werktag bleibt, und derselbe Tag steht in Angebot, Optionen, Neubepreisung, Revalidierung, BookShipment, Rechnungsprüfung, Abschluss und Belegen; kein Tag-für-Tag-Quote, keine eigene Feiertagslogik. **Tracking:** die Codebedeutung ist carriergebunden (nur UPS gemessen) — DHL-Legs zeigen ihre Ereignisse, ihr Stand bleibt „unbekannt“ (siehe 1A). **Cross-Provider:** die kuratierten Paare 84/85/87 ↔ „EXPRESS DOMESTIC“ / „… 9:00“ / „… 12:00“ bleiben, die 107 bekommt kein Paar, die 86 bleibt ungepaart; keine Paarung über ähnliche Namen. **Service 86 bleibt vollständig gesperrt** (`product_identity_unverified`, `publicBookable: false`, keine 10:00→10:30-Deutung, keine Gleichsetzung). Offen und nicht im Code lösbar: „Ref No“ auf DHL-Belegen (EXTERNAL_WHITE_LABEL_DECISION_REQUIRED, 1A/5.12). Kein Schalter, keine ENV-, Schema-, Fristen- oder Preisfunktionsänderung; 22, 23, 26, 29, 86, 117/118 und JUMiNGO unverändert. Providerrequests in diesem Paket: **0**.

**Same-Day End-to-End — gebührenfrei durch alle Stufen, Datumsschranke für jede Abholung** (2026-09-25, wirksam nach Merge): Die zentrale Wahrheit bleibt `lib/providers/transglobal/sameDayCollection.js` — Vertragsart (`feeCharging`), Gebühr (`none` → 0) und Zeitfenster für beide Arten; es entsteht keine zweite Same-Day-Definition. Korrigiert sind die Aufrufer, die „Abholung heute möglich" mit „Gebühr > 0" gleichsetzten: (1) die Revalidierung (`lib/offers/transglobalRevalidation.js`, dieselbe Funktion für Optionen, Neubepreisung und `/book`) bildet die Szenariokette (Basis ohne Gebühr, Zuschlag als Differenz) nur noch bei einer Gebühr — dieselbe Regel wie der Angebotsmapper —, meldet das Zeitfenster aber für beide Arten (`sameDayCollection` mit `feeCents: 0`); (2) Szenariopaar und Einkaufsevidenz (`residentialPriceOptions.js`) prüfen die Abholung heute in beiden Szenarien gleich, bauen Snapshot und Evidenz der Version 2 aber nur mit Gebühr — gebührenfrei entsteht der gewöhnliche Snapshot, dessen Lebensdauer derselbe wirksame Abholschluss begrenzt (`transglobalPriceInputs.js`); (3) `/book` und Neubepreisung (`transglobalBookingEntry.js`) tragen vor dem Quote für einen gebührenfreien heutigen Abholtag den ausstehenden Befund — derselbe, den Optionen und Bindung seit jeher tragen —, und der frische Quote entscheidet ihn; (4) der Ablauf (`bookShipmentFlow.js`) friert Einkaufsevidenz der Version 2 nur mit Gebühr ein. Die Mitternachtsschranke: der Einstieg reicht den gespeicherten Abholvertrag für JEDE Abholung an den Ablauf (vorher nur mit kuratierter Abholung heute); die bestehende letzte Schranke unmittelbar vor dem mutierenden Aufruf verlangt ohne verfügbares Zeitfenster aus dem frischen Quote einen Abholtag nach heute (Europe/Berlin) — sonst `409 SAME_DAY_COLLECTION_UNAVAILABLE` (Art `expired`), der Versuch endet bewiesen „nicht gebucht", nichts wird verbraucht. Ohne kuratierte Fähigkeit bewertet die Revalidierung keine Abholung heute (`NOT_SAME_DAY`) — der Preis dieser Dienste ist unverändert. Keine ServiceID- oder Carrierweiche, kein Schalter, keine ENV-, Schema-, Policy-, Preisfunktions- oder Fristenänderung; Portalcode (47/110/124) und JUMiNGO unberührt — die Portalabholungen 47/110 durchlaufen lediglich dieselbe generische Datumsschranke vor ihrem Adapter. Belegt durch `tests/tg-fee-free-same-day-chain.test.js` (volle Kette an der echten Matrix für 84/85/87/48/49 vor und nach dem Abholschluss, 22/26 unverändert, 29/41/44/107 nie still heute, Mitternacht, Wochenende) — zehn ihrer Fälle scheitern am Stand davor. Providerrequests in diesem Paket: **0**.

**Portal-Core-Final — ein Portalkern für 47, 110 und 124** (2026-09-25, wirksam nach Merge): Es gibt genau EINEN Portalablauf (`lib/providers/transglobal/portal/portalBookingCore.js`); die drei Services liefern nur dünne Binder (Vorbedingungen, Rate aus der Buchen-Schaltfläche des eigenen Service und MasterServiceType, belegter Stapelbarkeitswert, belegter Packstückumfang — 47 und 124 genau eines, 110 bis zwei —, Adressschritt, Auswahl im Abhol-ViewModel des Portals: 47 der gebundene Tag und sein frühestes Fenster, 110 der gebundene Tag mit dem belegten Fenster 09–17, 124 genau der gebundene Paketshop). Die Reihenfolge ist die an der Oberfläche gemessene: Warenkorb lesen (muss leer sein) → Rates → Serviceauswahl → Adresse → Packliste → Übersicht → Warenprüfung/Abholung (hier entsteht der Warenkorbauftrag; danach muss der Warenkorb genau ihn enthalten) → Abhol- und kostenlose Absicherungsauswahl als zurückgesendetes ViewModel → Warenkorb- und Preisprüfung (`verifyPortalCartIsolation`, centgenau, ohne Toleranz) → Bedingungen bestätigen → Zahlung (erste Mutation) → Zahlungsseite muss genau einen Auftrag nennen → `CompleteOrder` genau einmal → Bestätigung über ihre Weiterleitungskette, deren Referenz der erfasste Auftrag sein muss. Eine PostgreSQL-Advisory-Sperre mit festem Schlüssel serialisiert alle Portalbuchungen des Portalkontos (eines je Umgebung, aus `TG_PORTAL_USER`); ohne Sperre wird nicht gebucht, und der Versuch wird unter der Sperre neu gelesen. Vor der Zahlung endet jeder Abbruch als NOT_BOOKED mit Entfernen ausschließlich des eigenen, eindeutig bestimmten Auftrags und dem Zustandsübergang `cart_built → init` (neu, nur für diesen bewiesen folgenlosen Abbruch); ab dem Absenden der Zahlung ist jeder unklare Ausgang AMBIGUOUS mit Klärung, nie ein Retry. Die Sitzung meldet sich genau einmal an und sendet nie einen Request erneut (die frühere Regel „Weiterleitung auf eine Login-Seite = neu anmelden und wiederholen" traf belegt einen normalen Assistentenschritt). Der Idempotenz-Claim der drei Portaltabellen scheiterte seit der Store-Fabrik (TG110) an JEDER echten Datenbank (Parameterversatz im `INSERT`) — jede Portalbuchung wäre vor dem ersten Providerkontakt als AMBIGUOUS `attempt_claim_failed` geendet; die Offline-Suiten liefen gegen einen Fake-Store und sahen es nicht. Behoben und je Tabelle gegen PostgreSQL belegt (`tests/portal-label-recovery-pg.test.js`, P14/P15). Die Sendungsnummer geht unabhängig vom Etikett in Sendung und Trackingreferenzen; der Etikett-Nachlauf folgt der belegten Profilweiterleitung und meldet eine nicht auf der ersten Listenseite stehende Referenz als eigenen Befund, nie als fremde Zeile. **Zahlschritt (PD-01) und Schranke B3d:** die `ResponseGuid` stammt aus der Antwort von `POST /Cart/ValidateCartOverview` (`isValid`/`responseGuid`, `lib/providers/transglobal/portal/paymentContract.js`; belegt mit dem erfassten Seitencontroller und echten Staging-Antworten); ohne ausdrückliches `isValid` oder ohne GUID-förmigen Wert endet der Versuch vor der Zahlung, der eigene Auftrag wird entfernt. B3d ist damit offen und sperrt nur noch, falls dieser Vertrag entfällt — die Buchbarkeit hängt weiter an `TG47_PORTAL_ADAPTER_ENABLED`, `TG110_PORTAL_ADAPTER_ENABLED`, `TG124_PORTAL_ADAPTER_ENABLED` und `TG_PORTAL_LABEL_RECOVERY_ENABLED`. **Adressschritt:** eine belegte Feldfolge für alle drei Services (124 zusätzlich der Paketshopblock); der versteckte Kopf wird wie vom Browser aus dem Adressformular gelesen; Portalprüfung der Abholung, dann der Zustellung (`ValidateQuoteAddressViewModel`), Absenden, Rücklesung (`GetSessionQuoteAddressesAndContactDetails`) mit Feldvergleich und `SendTrackingEmail: false`; genau eine bewusste Abweichung von der Oberfläche (keine Tracking-Mail des Anbieters an den Empfänger). Die Adressen kommen über `toTransglobalAddressInput` — dieselbe Zuordnung wie der V2-Weg; vorher blieben Straße und PLZ jeder echten Sendung leer. **110:** `constraints.maxPackages: 2` zentral in der Matrix (gleich der Bindergrenze), am Angebot als `tariffLimits`; seit DE0052649 an `TG_PORTAL_LABEL_RECOVERY_ENABLED` gebunden wie 124 und 47. **Nachlauffenster des Portalwegs 120 Stunden** (`PORTAL_LABEL_RECOVERY_WINDOW_MINUTES`, `config/portalLabelRecovery.js`; die Label-Mail bleibt bei 48): der Anbieter erzeugt das Etikett einer Buchung außerhalb der Geschäftszeiten erst am nächsten Werktag. Keine ENV, kein Schema, keine Preisfunktion geändert; JUMiNGO, V2-Buchungsweg, Same-Day und Effective Collection unberührt. Belegt durch `tests/portal-core-final.test.js`, `tests/tg-portal-address-contract.test.js` (Feldidentität gegen die drei echten UI-POSTs) und die auf dieselben echten Erfassungen umgestellten Portalsuiten (`tests/helpers/portalFlowScript.js`); Staging-Evidenz siehe 1A. Providerrequests: ausschließlich Staging (Portal und V2), Produktion **0**.

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
| Transglobal Booking | IMPLEMENTED_CONDITIONALLY | default aus; öffentlich buchbar vorbereitet nur Service 22, Service 23 (TG23, Backend gemergt, Staging-Smoke bestanden) und Service 26 (TG26, Staging-Smoke bestanden, höchstens zwei Packstücke, ohne Abholung am selben Tag, wirksam nach Merge), DE→DE hinter Produktschalter, Buchungsschalter und Kontowährung; Art der Lieferadresse nach der Angebotsauswahl (TG22 Residential, wirksam nach Merge); Abholung am selben Tag bis zum wirksamen Abholschluss (TG22 Same-Day, wirksam nach Merge); Produktprofil und 70-kg-Grenze je Packstück (TG22 Package A, wirksam nach Merge); voraussichtliche Lieferung als CE-Prognose aus Abholtag und Laufzeit (TG22 Package B, wirksam nach Merge); UPS Express (29) DE→DE öffentlich buchbar vorbereitet (2026-09-23, fünf eigene Stagingbuchungen; die Rechnungsposition „Collection" 2,00 € netto je Sendung als kuratierter Providerkostenvertrag im Einkauf; OHNE Abholung am selben Tag, wirksam nach Merge); TNT Express 9:00 (47) DE→DE über den Portalpfad vorbereitet (2026-09-23; V2-Buchung vom Carrier abgelehnt, Portalbuchung DE0052643 zum centgleichen Preis; zwei Schalter TG47_PORTAL_ADAPTER_ENABLED und TG_PORTAL_LABEL_RECOVERY_ENABLED, beide default aus; ohne Abholung am selben Tag, ohne kostenpflichtige Zusatzabsicherung, wirksam nach Merge); Transportabsicherung nur für kuratierte Services; Bestandsdiagnose je Quote (UPS-Vervollständigung, wirksam nach Merge); DHL Domestic Express (84) vollständig kuratiert (Staging-Buchungssmoke 1275/DE0052580 bestanden); Art der Lieferadresse ohne Zuschlag als generischer Modus (DHL Foundation); DHL-Zeitvarianten 85 und 87 vollständig kuratiert (Staging-Buchungssmokes 1282/DE0052583 und 1276/DE0052581 bestanden), 86 gesperrt ohne Angebot (`product_identity_unverified`, DHL Zeitfamilie); DHL Economy Select (107) vollständig kuratiert, **erster EU-Block mit eigener Buchungsevidenz** (1277/DE0052582), höchstens ein Packstück (TG107); Transglobal-Fristen nach gemessenen Antwortzeiten (Vergleich und Vorbestellung 55 s, Bestellung 90 s, TrackOrder 50 s konfigurierbar), Laufzeitzeile je Anbieteraufruf, faire Auswahl im Trackingtakt (UPS-Abschluss, wirksam nach Merge); Versanddatum als frühester Abholtag — 22/23/26 verschieben einen allein am Abholtag gesperrten Wunschtag auf den nächsten Versandtag, Angebot, Buchung und Belege tragen denselben Tag (TG UPS Effective Collection Date, wirksam nach Merge); **DHL-Abschluss (wirksam nach Merge): 84, 85 und 87 DE→DE (höchstens zwei Packstücke) und 107 DE→EU (genau ein Packstück) öffentlich buchbar vorbereitet** — hinter denselben Schaltern und derselben Kontowährung, Adressart ohne Zuschlag (bei der 107 bei jeder Buchung in beiden Szenarien gemessen), frühester Abholtag, carriergebundene Trackingbedeutung (DHL-Stand „unbekannt“ bis zu echter Ereignisevidenz); die 86 bleibt gesperrt; „Ref No“ auf DHL-Belegen offen als EXTERNAL_WHITE_LABEL_DECISION_REQUIRED; **Same-Day End-to-End (2026-09-25, wirksam nach Merge):** die gebührenfreie Abholung am selben Tag (84, 85, 87, 48, 49) ist durch Optionen, Bindung, Neubepreisung und `/book` buchbar (Nullunterschied kein Fehler, kein Zuschlag, derselbe Preis), und die letzte Datumsschranke vor der Bestellung gilt für jede Abholung (Mitternacht); **Portal-Tarife (2026-09-25, wirksam nach Merge):** ein Portalkern für 47/110/124 nach der belegten Portalreihenfolge (leerer Warenkorb vorher, genau der eigene Auftrag vor der Zahlung, Kontosperre, kein zweites Absenden), Zahl- und Adressschritt belegt, je eine Staging-Buchung centgenau (DE0052648/DE0052649/DE0052650); **47, 110 (höchstens zwei Packstücke) und 124 DE→DE öffentlich buchbar vorbereitet** hinter ihren Portalschaltern und dem Nachlaufschalter (alle default aus) |
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

TG22 Same-Day (wirksam nach Merge): ein Angebot mit Abholung heute zeigt den Preis einschließlich Zuschlag, darunter „Zuschlag für Abholung am selben Tag: +X,XX €" und „Abholung heute möglich bis HH:MM Uhr" (wirksamer Abholschluss vom Server). Nach dem wirksamen Abholschluss bleibt es sichtbar, ist nicht auswählbar und zeigt „Abholung heute nicht mehr möglich." und „Bitte wählen Sie einen späteren Abholtag.". Buchungsseite, Erfolg, Auftragsbestätigung und Rechnungen führen die Zeile „Zuschlag für Abholung am selben Tag"; keine Checkbox, keine Anbieteruhrzeit, kein Anbietername. Grundvertrag (wirksam nach Merge): Nennt der Server `same_day_unconfirmed` bzw. `same_day_unverifiable` (bei 409: `sameDayUnavailableKind` `unconfirmed` bzw. `unverifiable`), heißt es „Abholung heute für dieses Angebot nicht verfügbar." bzw. „Abholung heute kann derzeit nicht bestätigt werden." — jeweils mit „Bitte wählen Sie einen späteren Abholtag."; „nicht mehr möglich" steht nur beim zeitlichen Ablauf, ein unbekannter Grund ergibt den neutralen Satz. Eine gesperrte Abholung heute zeigt den Abholtag ohne „bereit ab"-Zeile; ein späterer Abholtag bleibt bei „bereit ab 09:00 Uhr". Seit TG UPS Effective Collection Date erscheinen diese Sätze im Vergleich nur noch für ein Angebot ohne serverseitigen Abholtag-Rückfall; 22, 23 und 26 tragen stattdessen den nächsten Versandtag (siehe unten).

TG22 Package A (wirksam nach Merge): trägt ein Angebot `serviceDetails`, zeigen seine Details fünf Abschnitte statt Hauptmerkmalen, Einschränkungen und Versicherung — „Hauptmerkmale" (Kurzbeschreibung, „Abholung an Ihrer Adresse", „Sendungsverfolgung inklusive", „Versandlabel zum Ausdrucken" mit den Formaten), „Laufzeit" (genau einmal: „Voraussichtliche Laufzeit" und „Die Laufzeit ist eine Schätzung des Versanddienstleisters und keine Zustellzusage."), „Größe & Gewicht" („Packstücke: 1 je Sendung", „Max. Gewicht: 70 kg", Abrechnungsgewicht, „Volumengewicht: L × B × H ÷ 5.000" — Formel und Abrechnungshinweis nur mit belegtem Divisor), „Transportabsicherung" („Grundabsicherung: bis 50 € Warenwert", „Zusätzliche Transportabsicherung: bis 2.500 € Warenwert", Selbstbeteiligung nur aus dem Serverwert) und „Einschränkungen" („Nicht zugelassen: Paletten, Koffer"). „Termin & Abholung" und „Preisaufschlüsselung" bleiben. Ohne gültiges Profil — jeder andere Service, JUMiNGO — bleibt der bisherige Detailbereich; entschieden wird am Feld, nie am Provider. Keine Uhrzeit, keine Zusage, kein externer Link; ein Datum nur als voraussichtliche Lieferung (TG22 Package B).

TG22 Package B (wirksam nach Merge): trägt ein Angebot `deliveryProjection`, heißt der Endknoten der Angebotskarte „Voraussichtliche Lieferung" mit „Di., 15.09. – Mi., 16.09.", „Di., 15.09." (ein Tag) oder „ab Di., 15.09." (offene Laufzeit) — ohne Uhrzeit; die Laufzeit „1–2 Tage" bleibt stehen. Im Detailabschnitt „Laufzeit" folgt auf „Voraussichtliche Laufzeit" genau eine Zeile „Voraussichtliche Lieferung" mit dem Hinweis „Aus Abholtag und Laufzeit berechnet; Wochenenden sind nicht mitgezählt. Feiertage können die Zustellung verschieben."; die Buchungsflächen zeigen „Voraussichtliche Lieferung" mit TT.MM.JJJJ. Die Oberfläche rechnet keine Versandtage und liest keine Uhr. Zustelldaten eines Anbieters haben immer Vorrang: JUMiNGO bleibt „Zustellung" mit Datum und „bis HH:MM Uhr". Filter, Auszeichnungen und Sortierung lesen die Prognose nicht. Kein Anbietername, keine Quelle, keine Zusage.

TG23 (wirksam nach Merge): der Expressversand erscheint als „UPS · Expressversand" in derselben Angebotskarte und denselben fünf Detailabschnitten (Kurzbeschreibung „Schneller Expressversand für eilige Sendungen.", „1 je Sendung", „70 kg", „L × B × H ÷ 5.000", Paletten und Koffer), mit Laufzeit „1 Tag" und „Voraussichtliche Lieferung" als einzelnem Tag, „Vorläufiger Preis" bis zur Bindung der Lieferadresse, gegebenenfalls dem Zuschlag für die Abholung am selben Tag und denselben Buchungs-, Erfolgs- und Belegflächen. Keine eigene Karte, keine eigene Seite, keine ServiceID-Prüfung im Frontend, keine Uhrzeit, keine Zusage; das JUMiNGO-Pendant bleibt unverändert daneben sichtbar.

UPS-Vervollständigung (wirksam nach Merge): „UPS · Express" erscheint als vollwertige Preisauskunft — Preis sichtbar, „Derzeit nicht direkt buchbar", keine Adressfrage, keine Abholung heute, keine Absicherung, keine Auszeichnung — mit den fünf Detailabschnitten, aber ohne Volumengewichtsformel, ohne Abrechnungshinweis und ohne Gewichtszeile; „Voraussichtliche Lieferung" als einzelner Tag. Nach einer Freigabe genügen dieselben Felder wie beim Expressversand, die Oberfläche ändert sich nicht. „UPS · Standardversand Mehrpaket" (TG26) ist mit zwei Packstücken auswählbar: „Vorläufiger Preis" und die Frage nach der Art der Lieferadresse wie beim Standardversand, danach Absicherung und Buchung; der Detailbereich bleibt der bisherige (kein Profil, keine Prognose — Laufzeit „1–5 Tage") mit Sendungsverfolgung, Drucker und der Einschränkung auf höchstens zwei Pakete aus den Serverfeldern; eine Abholung heute wird nie angeboten (ein heutiger Wunschtag trägt serverseitig den nächsten Versandtag); vor der Bindung der Lieferadresse macht der Detailbereich keine Absicherungsaussage (kein „Keine Zusatzversicherung verfügbar.", generisch für jedes Angebot, das auf diese Angabe wartet). Mehrere Packstücke heißen überall „2 Pakete · je 2 kg · 30 × 20 × 15 cm" (Gewicht und Maße je Paket); die Versandbelege tragen die Servernamen in Serverreihenfolge — gemessen „Versandlabel (A4)" und „Versandlabel (Thermodruck)" mit je einer Seite je Paket, bei mehreren Sendungsnummern generisch „Versandlabel 1 von 2 (A4)" usw., ein Abholetikett zuletzt; mehrere Trackingnummern stehen in der Liste als „2 Trackingnummern", im Detail vollständig und je Etappe. Gesperrt ist bei einer Preisauskunft allein der Auswahlknopf; die Karte trägt kein `aria-disabled`, „Details anzeigen" bleibt bedienbar — auch für Screenreader. Kein Anbietername, keine ServiceID-Prüfung, keine Produktnamen im Frontendcode.

DHL Foundation (wirksam nach Merge): nennt ein Angebot die Art der Lieferadresse zusätzlich in `surchargeFreePriceInputs`, heißt der Kartenhinweis „Die Art der Lieferadresse wird vor der Buchung abgefragt." statt „Bei einer privaten Lieferadresse kann ein Zuschlag anfallen."; die Auswahl zeigt „Geschäftsadresse + 0,00 €" und „Privatadresse + 0,00 €", lädt mit „Preis wird geprüft …" und meldet einen vorübergehenden Fehler als „Der Preis konnte nicht geprüft werden."; Optionen mit Zuschlag oder zwei verschiedenen Preisen und eine Bindung mit „Zuschlag Privatadresse" werden verworfen. Entschieden wird allein am Feld — ohne Feld gilt der bisherige Vertrag. „DHL Express · Domestic Express" bleibt bis zur Freigabe Preisauskunft ohne Adressfrage (seit dem DHL-Abschluss freigegeben, siehe unten). Die Browserfristen sind unverändert.

DHL Zeitfamilie (wirksam nach Merge): **keine Frontendänderung.** Die Zeitvarianten „DHL Express · Domestic Express 9:00" und „… 12:00" erscheinen als gewöhnliche Preisauskunft — der Name kommt wie jeder andere aus dem Angebot, die Uhrzeit ist Teil des Produktnamens und **keine Zustellzusage**; es gibt keine ServiceID-abhängige Darstellung und keinen eigenen Hinweistext. Die 10-Uhr-Variante liefert kein Angebot und erscheint deshalb gar nicht; „bis 10 Uhr" darf nirgends angezeigt werden. Die TG87-Buchungsevidenz hat das bestätigt: der Anbieter liefert **kein** Zustellzeit-, Garantie- oder Geld-zurück-Feld, und dass auf dem Carrier-Beleg „12:00" steht, ist eine Produktbezeichnung des Carriers — daraus darf im Kundenweg keine zugesagte Uhrzeit werden.

TG107 DHL Economy Select (wirksam nach Merge): **keine Frontendänderung.** „DHL Express · Economy Select" erscheint als gewöhnliche Preisauskunft über die bestehende generische Darstellung; der Name kommt wie jeder andere aus dem Angebot, es gibt keine ServiceID-abhängige Darstellung und keinen eigenen Hinweistext. Die Laufzeit („5 Tage") ist die Schätzung des Anbieters und **keine Zustellzusage**. Die 107 trägt **keine** Adressartkuratierung: es gibt für sie keinen zuschlagsfreien Hinweis und keine „+ 0,00 €"-Auswahl — solange sie quote_only ist, erreicht ohnehin kein Buchungsweg den Kunden. (Seit dem DHL-Abschluss überholt, siehe nächster Absatz.)

DHL-Abschluss TG84/TG85/TG87/TG107 (wirksam nach Merge): **keine Frontendänderung.** Die vier DHL-Dienste laufen durch die bestehenden generischen Flächen, gesteuert allein von den Serverfeldern: das Angebot ist auswählbar („Vorläufiger Preis“), trägt `surchargeFreePriceInputs` und zeigt deshalb „Die Art der Lieferadresse wird vor der Buchung abgefragt.“, die Auswahl „Geschäftsadresse + 0,00 €“ / „Privatadresse + 0,00 €“ (die 107 jetzt ebenso), danach Absicherung und Buchung wie bei 22/23/26. Der Abholtag ist der Serverwert aus `collectionDate` (heute, Samstag und Sonntag bereits serverseitig auf den nächsten Versandtag verschoben). Mehrseitige Belege tragen den bestehenden Druckhinweis. Ein DHL-Trackingstand „unbekannt“ wird wie bisher nicht benannt — die Ereignisse und der Carrierlink bleiben sichtbar. Keine ServiceID-Prüfung, keine Produktnamen, kein Anbietername im Frontendcode; die 86 erscheint weiterhin nicht.

UPS-Abschluss TG22/TG23/TG26 (wirksam nach Merge): Die Browserfristen liegen über den Serverfristen ihres Aufrufs — Vergleich in „Neue Sendung" und im Preisrechner 75 s, Adressart-Optionen 75 s, Neubepreisung der Absicherung 75 s, Kunden- und Admin-Tracking 65 s, `/book` unverändert 150 s. Ein langsamer Anbieter endet damit als Serverantwort mit dem bestehenden Fehlertext statt als vorzeitiger Browserabbruch. Ladezustände, Texte und Design sind unverändert; es entsteht keine Preis- oder Buchungsautorität im Frontend, keine ServiceID-Prüfung und kein Anbietername.

TG UPS Effective Collection Date (wirksam nach Merge): **keine Frontendänderung.** Die Karte zeigt den Abholtag des Angebots aus `collectionDate` — nach einem serverseitigen Abholtag-Rückfall den wirksamen Tag mit „bereit ab 09:00 Uhr"; das Angebot ist wie jeder spätere Abholtag auswählbar (`price_inputs_required`), und ausgewähltes Angebot und Live-Leiste zeigen denselben Tag (`pickupSummaryOf`). Kein Hinweistext, kein Datumsvergleich im Client und keine Uhr — dieselbe Darstellung wie ein JUMiNGO-Tarif, dessen Abholtag der Anbieter nennt. Das Versanddatumsfeld bleibt der Wunschtag des Kunden. Die Sätze einer gesperrten Abholung heute bleiben für Angebote ohne Rückfall und für die 409-Antworten der Buchungswege.

Same-Day End-to-End (2026-09-25, wirksam nach Merge): **keine Frontendänderung.** Die gebührenfreie Abholung heute läuft über die bestehenden Serverfelder: die Karte trägt `pickupToday: true` ohne Zuschlagsfelder (keine Zuschlagszeile), Options- und Bindungsantwort tragen für sie **keinen** `sameDayCollection`-Block — ein solcher Block trägt immer einen Zuschlag > 0 und wird ohne ihn verworfen —, beide Optionen zeigen „+ 0,00 €", die Bindung nur den Versand, und der Buchungserfolg nennt die tatsächlich gesendete Abholung aus `booking.sameDayCollection`. Die Schleife „Angebote neu berechnen" → dieselbe Karte entfällt, weil der Server die heutige Karte jetzt bindet und bucht; nach dem Abholschluss liefert die Neuberechnung den nächsten Versandtag („Frühester Abholtag"). Paritätsbeleg mit den echten Serverantworten: `src/utils/feeFreeSameDayParity.test.mjs`.

Druckvertrag mehrseitiger Providerbelege (wirksam nach Merge): Enthält ein Versandbeleg mehr als eine Seite, erscheint **ein** Satz — wörtlich vom Server, an drei Stellen aus derselben Quelle: auf dem Buchungserfolg über den Downloadknöpfen, im Dokument-Drawer bei den Versandbelegen und in der Label-Mail angehängt an den bestehenden Formathinweis. Er lautet: „Dieses Dokument umfasst mehrere Seiten. Bitte folgen Sie den Hinweisen, die der Carrier auf den einzelnen Seiten abdruckt: Nicht jede Seite gehört auf ein Paket — manche Carrier legen ein Begleitdokument bei, das dem Fahrer bei der Abholung auszuhändigen ist.“ Er nennt **keine Seitennummer** (die Seitenzahl ist dynamisch), keinen Carrier, keinen Anbieter und keine ServiceID, und er behauptet nie, alle Seiten gehörten aufs Paket. Das Frontend formuliert ihn nicht und entscheidet nicht, wann er gilt — es zeigt, was der Server schickt; ein fehlender oder leerer Wert ergibt keine Zeile. **Die Belegnamen bleiben unverändert** („Versandlabel“, „Abholetikett“), ebenso Download- und Mailanhang-Dateinamen: eine Umbenennung in „Versandunterlagen“ wäre für die DHL-Familie treffender, für UPS und JUMiNGO aber falsch — deren Belege sind reine Etiketten —, und derselbe Name speist Anzeige, Downloadnamen und Mailanhang.

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
- Aktueller Zustand der Transglobal-Fristen `TRANSGLOBAL_QUOTE_TIMEOUT_MS`, `TRANSGLOBAL_BOOK_PRE_ORDER_TIMEOUT_MS`, `TRANSGLOBAL_ORDER_TIMEOUT_MS` und `TRANSGLOBAL_TRACKING_TIMEOUT_MS` je Umgebung sowie die tatsächlichen Antwortzeiten des Anbieters dort.
- Wirksame Proxyfristen vor der API (Traefik: `respondingTimeouts`, `forwardingTimeouts`) und die Stop-Grace des Containers — beide müssen die längste Browserfrist (`/book`, 150 s) bzw. `SHUTDOWN_GRACE_MS` tragen.
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

### v2.9 — 2026-09-25 (Portal-Tarife 47/110/124: belegte Portalreihenfolge, Warenkorb-Isolation vor jeder Zahlung, Zahl- und Adressschritt belegt, je eine Staging-Buchung, 110 höchstens zwei Packstücke)

- 1A: neuer Punkt „Der Portalpfad (47, 110, 124) — Zahl- und Adressschritt belegt, je eine Staging-Buchung": der Portalkern folgt der an echten Portalaufrufen gemessenen Reihenfolge; bezahlt wird nur ein Warenkorb, der genau den eigenen Auftrag enthält; fremde Aufträge werden nie bezahlt und nie entfernt; kein mutierender Request geht zweimal hinaus. Die `ResponseGuid` kommt aus der Warenkorbprüfung, der Adressschritt wird vom Portal geprüft und zurückgelesen; je eine Staging-Buchung 124/110/47 centgenau (DE0052648/DE0052649/DE0052650) und Negativkontrollen ohne Zahlung. 47, 110 (höchstens zwei Packstücke) und 124 sind DE→DE öffentlich buchbar vorbereitet hinter ihren Schaltern.
- 6.4: neuer Absatz „Portal-Core-Final — ein Portalkern für 47, 110 und 124" (Binderaufteilung, belegte Reihenfolge, Kontosperre, sauberer Abbruch mit `cart_built → init`, Sitzung ohne erneutes Absenden, behobener Idempotenz-Claim — er scheiterte seit der Store-Fabrik an jeder echten Datenbank —, Sendungsnummer unabhängig vom Etikett, Zahlschritt aus der Warenkorbprüfung, Adressschritt mit Portalprüfung und Rücklesung, kanonische Adresszuordnung, Schranke B3d als Sicherung, 110 `maxPackages: 2` und an den Nachlaufschalter gebunden, Nachlauffenster des Portalwegs 120 Stunden).
- 14: Transglobal Booking mit den Portal-Tarifen 47/110/124 (wirksam nach Merge).
- 15: keine Frontend-Produktionscodeänderung — Buchbarkeit und Stückgrenze kommen aus den Serverfeldern; ein Governance-Test hält fest, dass kein Modul an 47/110/124 verzweigt oder die Grenze kennt.
- Code: `lib/providers/transglobal/portal/` (Kern, drei Binder, Versuchsspeicher, Sitzung, Formular-/Seitenleser, Warenkorbvertrag, neu `accountLock.js` und `paymentContract.js`), `lib/providers/transglobal/publicBookability.js` (Schranke B3d), `lib/providers/transglobal/buildFullQuoteInput.js` (Adresszuordnung exportiert), `config/transglobalServicePolicy.js` (110 `maxPackages: 2`), `config/portalLabelRecovery.js` und `lib/shipmentEmailDelivery.js` (Portalfenster 120 h), `lib/offers/transglobalBookingOutcome.js`, `lib/booking/transglobalBookingEntry.js`, `lib/booking/portalLabelRecoveryStore.js`, `services/portalLabelRecovery.js`. Keine ENV-, Schalter-, Schema- oder Preisfunktionsänderung; JUMiNGO, V2-Buchungsweg, Same-Day und Effective Collection unberührt.
- Providerrequests: ausschließlich Staging (ausdrücklich freigegeben) — Portalnavigation, Quotes, Warenkorbaufbau und Entfernen eigener Testaufträge, Warenkorbprüfungen, genau drei Buchungen (124, 110, 47) mit je einer Zahlung und einem Abschluss, Etikettenabrufe lesend; Produktion **0**.
- Offen: Etikett und Sendungsnummer für 47 und 110 am Staging nicht belegt — extern (TNT-Portalaufträge erhalten dort keins, DE0052643; GLS DE0052649 ab dem nächsten Werktag beobachtbar); der Portal-Login mit ENV-Zugangsdaten ist am Staging nicht gelaufen (die Nachweise liefen über eine angemeldete Staging-Sitzung); eine Sperre schon im Vergleich für Adressen, die das Portal nicht annimmt (Namenslänge); der Link „Standard (A4)" liefert für die 124 ein Etikett im Format A6.
- Wirksam nach Merge des Branches `fix/tg-portal-core-final` (Backend; im Frontend ein Governance-Test und die Synchronisation dieses Dokuments).

### v2.8 — 2026-09-25 (Same-Day End-to-End: gebührenfreie Abholung am selben Tag durch alle Stufen, Datumsschranke für jede Abholung)

- 1A: Korrektur — die gebührenfreie Abholung am selben Tag (84, 85, 87, 48, 49) war im Vergleich sichtbar („Abholung heute"), aber nicht buchbar: Optionen und Neubepreisung werteten den Nullunterschied als „nicht verfügbar", `/book` sperrte den heutigen Tag vor dem Quote, die Oberfläche lief in „Angebote neu berechnen" → dieselbe Karte. Jetzt ist sie durch Optionen, Bindung, Neubepreisung und `/book` buchbar — zum selben Preis wie an einem späteren Tag, ohne Zuschlag und ohne Accessory; nach dem Abholschluss der nächste Versandtag. Mitternacht: die letzte Datumsschranke vor der Bestellung gilt für jede Abholung, nicht nur für Dienste mit Abholung am selben Tag. 85, 87 und 48 bleiben abgeleitet (eigene Stagingbuchung am selben Tag ausstehend).
- 6.4: Konjunktion nennt die Dienste mit Abholung am selben Tag (gebührenpflichtig 22/23/26, gebührenfrei 84/85/87/48/49); neuer Absatz „Same-Day End-to-End" (Revalidierung, Szenariopaar und Evidenz nur mit Gebühr als Szenariokette, ausstehender Befund bei `/book` und Neubepreisung, Lebensdauer der Optionen bis zum wirksamen Abholschluss für beide Vertragsarten, Abholvertrag für jede Abholung an die letzte Schranke).
- 14: Transglobal Booking mit Same-Day End-to-End (wirksam nach Merge).
- 15: keine Frontendänderung — gebührenfreie Options- und Bindungsantworten ohne Same-Day-Block; Paritätsbeleg `src/utils/feeFreeSameDayParity.test.mjs`.
- Code: `lib/offers/transglobalRevalidation.js`, `lib/providers/transglobal/residentialPriceOptions.js`, `lib/booking/transglobalPriceInputs.js`, `lib/booking/transglobalBookingEntry.js`, `lib/providers/transglobal/bookShipmentFlow.js`. Policy, Preisfunktion, MwSt., Fristen, Schema, Schalter, Portalcode (47/110/124) und JUMiNGO unverändert; kein Feiertagsmodell (weiterhin offen); keine produktive ENV-Änderung. Providerrequests in diesem Paket: **0**.
- Wirksam nach Merge des Branches `fix/effective-collection-same-day` (Backend; im Frontend Paritätstests und die Synchronisation dieses Dokuments).

### v2.7 — 2026-09-19 (DHL-Abschluss TG84/TG85/TG87/TG107: öffentlich buchbar vorbereitet)

- 1A: 84, 85 und 87 (DE→DE, höchstens zwei Packstücke) und 107 (DE→EU, genau ein Packstück) sind **öffentlich buchbar vorbereitet** — je Eintrag allein der Wechsel der Freigabefelder plus der kuratierte Abholtag-Rückfall. Die früheren Freigabehindernisse sind aufgelöst: ISC bleibt Teil des Anbieterpreises (keine Sonderregel), die UPS-gemessene Trackingbedeutung gilt nicht mehr für DHL, die 85 hat ihre Buchungsevidenz (1282/DE0052583/INV-0040784 — die Aussage „85 hat keine eigene Buchungsevidenz“ ist korrigiert). Neue Produktentscheidung zur 107: `declared_no_surcharge` / `fixed_false`, aber **bei jeder Buchung in beiden Szenarien gemessen** (zwei frische Full Quotes, centgenau gleich, sonst fail closed) — der Grundsatz „ein Befund ist kein Vertrag“ bleibt. Neue Produktentscheidung **„Trackingbedeutung ist carriergebunden“** und neuer offener Punkt **„Ref No“ auf DHL-Belegen — EXTERNAL_WHITE_LABEL_DECISION_REQUIRED**; die Aussage „kein Konto- oder Supplierhinweis“ ist korrigiert (Ref No mit Auftragsreferenz der Einkaufsquelle; „Payer Details … FRT“ als zulässiges Abrechnungsfeld). Der früheste Abholtag gilt auch für 84/85/87/107.
- 5.12: offener Punkt W1 (Ref No auf unveränderten Carrier-PDFs) — nicht technisch geschlossen, externe Entscheidung.
- 6.4: Konjunktion (Bereiche, Packstückgrenzen, Adressartbindung) um die DHL-Dienste ergänzt; Nachträge in DHL Foundation, Zeitfamilie, TG107, Druckvertrag (Korrektur des Konto-/Referenzhinweises) und Frühester Abholtag; neuer Absatz „DHL-Abschluss“ (volle Kette über die bestehenden generischen Verträge, Preis ohne Sonderregeln, derselbe Abholtag überall, carriergebundenes Tracking, Paare 84/85/87 unverändert, kein Paar für 107, 86 gesperrt).
- 14: Transglobal Booking mit den vier freigegebenen DHL-Diensten (wirksam nach Merge).
- 15: keine Frontendänderung — die generischen Flächen tragen die DHL-Dienste über die bestehenden Serverfelder (`surchargeFreePriceInputs`, `collectionDate`, Druckhinweis, nicht benannter Stand „unbekannt“).
- Code: `config/transglobalServicePolicy.js` (Freigabe 84/85/87/107, `priceInputs` und Abholtag-Rückfall der 107, Rückfall für 84/85/87), `services/trackingStatus.js` und `services/transglobalTracking.js` (carriergebundene Codebedeutung). 86, 22, 23, 26, 29, 117/118, JUMiNGO, Preisfunktion, MwSt., Fristen, Stornierung, Schema und Schalter unverändert; keine produktive ENV-Änderung. Providerrequests in diesem Paket: **0**.
- Wirksam nach Merge des Branches `feature/dhl-84-85-87-107-live-booking` (Backend; im Frontend nur die Synchronisation dieses Dokuments). Produktiv buchbar erst mit den bestehenden Schaltern und der Kontowährung im Runtime-Zustand (UNKNOWN_RUNTIME_STATE).

### v2.6 — 2026-09-19 (TG UPS Effective Collection Date: das Versanddatum ist der früheste Abholtag)

- 1A: Neue Produktentscheidung **„Das Versanddatum ist der früheste Abholtag"** für die kuratierten UPS-Abholservices 22, 23 und 26: sperrt ausschließlich die Abholtag-/Same-Day-Schranke den Wunschtag, trägt das Angebot den nächsten Versandtag nach der bestehenden Kalenderregel (Montag bis Freitag, ohne Feiertage) — Freitag nach dem Abholschluss, Samstag und Sonntag → Montag. Dasselbe Verhalten wie JUMiNGO beim Anbieter; der Tag entsteht aus der CE-Kalenderregel, nie aus einer erfundenen Anbieterantwort. Die Abschnitte zur Abholung am selben Tag und zur voraussichtlichen Lieferung nennen den verschobenen Tag.
- 6.4: Neuer Absatz „Frühester Abholtag": kuratiertes Policy-Feld `collectionDateFallback`, zweite Bewertung desselben Service aus demselben Quote, nur bei alleiniger Abholtagssperre, gespeicherter wirksamer Tag als einzige Quelle für Optionen, Bindung, Neubepreisung, Revalidierung und BookShipment, Versand- und Leistungstag der Belege aus demselben Leser der Angebotszeile (Abschluss, Rechnungsprüfung, Klärungsweg), später fail closed, Protokollzeile `[TG collection-date]`. Same-Day-Grundvertrag und Lieferprognose nennen die Ausnahme.
- 14: Transglobal Booking mit dem frühesten Abholtag (wirksam nach Merge).
- 15: keine Frontendänderung — Karte und Buchungsflächen zeigen den wirksamen Tag bereits über `collectionDate`; die Sätze einer gesperrten Abholung heute bleiben für Angebote ohne Rückfall und für 409-Antworten.
- 29, 84–87, 107, 117/118, JUMiNGO, Preisfunktion, MwSt., Freigaben, Schranke L, Same-Day-Zeitfenster und -Preis, Fristen und Stornierung unverändert; keine Schalter-, Schema- oder produktive ENV-Änderung. Providerrequests in diesem Paket: **0**.
- Wirksam nach Merge des Branches `feature/tg-ups-effective-collection-date` (Backend; im Frontend nur die Synchronisation dieses Dokuments und der Frontend-`CLAUDE.md`).

### v2.5 — 2026-09-18 (UPS-Abschluss TG22/TG23/TG26: Fristen, Laufzeitzeile, Trackingfairness)

- 6.4: Transglobal-Fristen nach den gemessenen Staging-Antwortzeiten — Vergleich 55 s (vorher 30 s), Optionen/Neubepreisung/Revalidierung 55 s (vorher 20 s), Bestellung unverändert 90 s, TrackOrder 50 s über den neuen Schlüssel `TRANSGLOBAL_TRACKING_TIMEOUT_MS` (vorher fest 15 s). Laufzeitzeile `[TG timing]` je Anbieteraufruf. Transglobal-Trackingtakt: Rückstellung nach Fehlschlag und Circuit Breaker nur für Transport-/Konfigurationsfehler — dauerhaft scheiternde Sendungen verdrängen die übrigen nicht mehr. Der offene Latenzbefund der DHL Foundation ist damit aufgelöst; die Produktionslatenz bleibt ungemessen.
- 14: Transglobal Booking mit den neuen Fristen, der Laufzeitzeile und der fairen Trackingauswahl (wirksam nach Merge).
- 15: Browserfristen 75 s (Vergleich, Optionen, Neubepreisung) und 65 s (Kunden- und Admin-Tracking); `/book` unverändert 150 s; keine Text- oder Designänderung.
- 21: `TRANSGLOBAL_TRACKING_TIMEOUT_MS`, die wirksamen Proxyfristen und die Container-Stop-Grace sind Runtime-Fakten.
- 22, 23, 26 (höchstens zwei Packstücke), 29, 84–87, 107, 117/118, JUMiNGO, Preisfunktion, MwSt., Freigaben, Same-Day-Normalizer, `MULTI_PROVIDER_DEBUG_MODE` und Stornierung unverändert; keine Schalter-, Schema- oder produktive ENV-Änderung. Providerrequests in diesem Paket: **0**.
- Wirksam nach Merge der Branches `fix/ups-tg22-tg23-tg26-final-readiness` (Frontend vor Backend: ein altes Frontend bräche Neubepreisung und Tracking nach 30 s ab, während das neue Backend bis 55 bzw. 50 s wartet — folgenlos, weil rein lesend, aber ein vermeidbarer Fehler beim Kunden; ein neues Frontend vor dem alten Backend wartet nur länger als nötig).

### v2.4 — 2026-09-18 (Druckvertrag mehrseitiger Providerbelege — was gehört aufs Paket?)

- 1A: Neue Produktentscheidung **„Welche Seite wohin gehört, sagt der Carrier — nicht ConfidaraExpress“**. Die erste Sichtprüfung eines echten Belegs (TG85, Quote 1282, Auftrag DE0052583, Rechnung INV-0040784, zwei Packstücke) zeigt: A4- und Thermodatei tragen je **drei Seiten** — zwei Versandetiketten („attach it to your parcel“) und ein **Waybill Doc** („Not to be attached to package - Hand to Courier“, dem Fahrer auszuhändigen). CE nannte die ganze Datei „Versandlabel“ und sagte zum Umgang mit den Seiten nichts. Daraus wird **keine Seitenregel**: UPS Standard Multi (26) liefert für zwei Packstücke zwei Seiten, beide Etiketten, ohne Begleitdokument. Zweiter Befund: **White Label ist für einen DHL-Beleg erstmals visuell belegt**. Dritter Befund: die **Produktidentität der 85 ist vierfach belegt** (Quote-Name, Labelkopf „EXPRESS 9:00“, Waybill Doc „[I] EXPRESS 9:00 (32)“ mit DHL-Servicecode, Rechnungsposition) — und begründet weiterhin **keine** Zustellzusage.
- 6.4: Der Druckvertrag als providerneutraler Vertrag: neue Spalte `shipment_provider_documents.page_count` (additiv, idempotent; `NULL` = „nicht erfasst“ und ergibt keinen Hinweis — bewusst nicht fail closed, weil der Satz mehrere Seiten behauptet), Seitenzahl gelesen mit `pdf-lib` (ein synchroner Byte-Scan scheitert nachweislich an PDF 1.5 mit komprimierten Objektströmen), ein Kundenhinweis für jeden nicht nachweislich einseitigen Beleg. Keine Seitenklassifikation, keine Seitennummer im Text, keine ServiceID-Weiche, keine Carrierunterscheidung.
- 14: Providerbelege tragen die Seitenzahl; die Buchungsantwort trägt `shippingPrintNotice`, die Dokumentübersicht `printNotice`.
- 15: Der Satz erscheint an drei Stellen aus **einer** Quelle — Buchungserfolg, Dokument-Drawer (bei den Versandbelegen) und Label-Mail (angehängt an den bestehenden Formathinweis). Belegnamen, Download- und Mailanhang-Dateinamen bleiben Zeichen für Zeichen die bisherigen: eine Umbenennung in „Versandunterlagen“ wäre für UPS und JUMiNGO falsch, deren Belege reine Etiketten sind.
- 84, 85, 86, 87, 107, 22, 23, 26, 29, 117/118, JUMiNGO, Preisfunktion, MwSt., Freigaben (`publicBookable` unverändert bei 22/23/26), Stornierung und alle Fristen unverändert; keine ENV- oder Schalteränderung. `sanitizeCustomerPdfMetadata` unverändert, die PDF-Bytes werden nur gelesen. Providerrequests in diesem Paket: **0** (die Evidenz stammt aus dem zuvor ausdrücklich freigegebenen TG85-Staging-Lauf).
- Wirksam nach Merge der Branches `feature/dhl-print-contract` (Backend und Frontend).

### v2.3 — 2026-09-18 (TG107 DHL Economy Select: kuratiert, quote_only — erster EU-Block)

- 1A: Service 107 „DHL Express · Economy Select" vollständig kuratiert, bleibt quote_only; **erste EU-Buchungsevidenz des Projekts** (Quote 1277, Buchung DE0052582, Rechnung INV-0040783). Neue Produktentscheidung „Ein einzelner Adressartbefund ist kein Adressartvertrag": die 107 wurde privat zugestellt und trug keinen Zuschlag — daraus folgt KEINE Adressartkuratierung, weil nur eine von zwei Adressarten gemessen ist. Neuer Befund: die Anbietersteuer auf einer EU-Strecke ist gemessen (19,02 %, also 19 % nach Centrundung) und wird aus dem Quote gelesen, nie hartkodiert. Transportabsicherung kuratiert auch für 107.
- 6.4: Kuratierung und Vertrag der 107 (STANDARD, Direktabholung, DE→EU, `maxPackages: 1`, Tracking/Druck/Absicherung, `publicBookable: false`); vollständige Evidenz aus Quote und Buchung; ausdrücklich nicht kuratiert: Adressart, Höchstgewicht, Maße, Volumendivisor, Same-Day, Produktprofil, Prognose, Zeit-/Lieferzusage, Fernzonen- und PLZ-Regeln, DHL-Trackingcodes; White-Label-Befund wie bei 84/87; offene Punkte vor einer Freigabe.
- 14: Transglobal Booking mit 107 (quote_only, erster EU-Block, höchstens ein Packstück, ohne Adressartkuratierung).
- 15: keine Frontendänderung — die 107 erscheint als gewöhnliche Preisauskunft über die bestehende generische Darstellung.
- 84, 85, 86, 87, 22, 23, 26, 29, 117/118, JUMiNGO, Preisfunktion, MwSt., Belegversionen, Stornierung und alle Fristen unverändert; keine ENV-, Schalter- oder Schemaänderung. Providerrequests in diesem Paket: **0** (die Evidenz stammt aus dem zuvor ausdrücklich freigegebenen Staging-Lauf).
- Wirksam nach Merge des Branches `feature/dhl-economy-select-107` (Backend; im Frontend nur die Synchronisation dieses Dokuments).

### v2.2 — 2026-09-17 (DHL Zeitfamilie: 85/87 kuratiert, 86 ohne Angebot)

- 1A: Services 85 und 87 vollständig kuratiert, beide quote_only ohne eigene Buchungsevidenz; Kundennamen „Domestic Express 9:00" und „Domestic Express 12:00". Neue Produktentscheidung „Die Uhrzeit im Produktnamen ist eine Identität, keine Zusage" — nie „Zustellung bis …", nie Garantie oder Geld-zurück, und eine Uhrzeit nur, wenn sie belegt ist. Service 86 erzeugt kein Angebot, weil unbelegt ist, welches Carrierprodukt „10am" benennt („bis 10 Uhr" darf nirgends erscheinen, solange nur 10:30 belegt ist). Transportabsicherung kuratiert auch für 85 und 87.
- 6.4: Evidenz der Zeitfamilie aus den bereits erhobenen Quotes 1265/1275 (nur Fracht, kein RES/COL/STK, kein ISC — damit ist ISC ein Befund der 84); neues Policy-Feld `productIdentityVerified` (Default `true`) und neuer Grund `product_identity_unverified` vor der Carrierprüfung; nicht übernommene Portal- und Katalogangaben (Familientext, Sperrgutzuschlag 75,00 €, `postcodeCheckRequired`) und die Folge, dass die Postleitzahl-Verfügbarkeit für CE nicht feststellbar ist; offener TNT-Befund 47/48/49; minimaler nächster Evidenzplan mit Referenzservice 87.
- 14: Transglobal Booking mit 85/87 (quote_only) und der Sperre der 86 (wirksam nach Merge).
- 15: keine Frontendänderung — die Zeitvarianten erscheinen als gewöhnliche Preisauskunft, ohne ServiceID-abhängige Darstellung.
- TG87-Evidenz (2026-09-17, ausdrücklich freigegeben, genau 1 Full GetQuote + 1 BookShipment): Quote 1276, Buchung DE0052581, Rechnung INV-0040782 — Fracht 22,54 als einziger Bestandteil, kein ISC, kein Zuschlag Privatadresse, keine Abholposition, kein Sperrgut, Rechnung centgenau Quote + Absicherung, Steuer nur auf den Versand, ein A4- und ein Thermal-PDF mit je drei Seiten, eine gemeinsame Sendungsnummer, zwei Stücknummern. Die Suche nach Zeit-, Liefer- und Zusagefeldern ergab genau ein Zeitfeld (Laufzeit „1") und **keine** strukturierte Zusage; auf dem Beleg steht sichtbar „12:00". Damit ist die zusagefreie Beschriftung belegt und nicht nur vorsichtig. Die 86 wurde im selben Quote live mit `product_identity_unverified` gesperrt.
- Familienevidenz aus TG84 + TG87 dokumentiert (Direktabholung, Collection-Verhalten, Adressart ohne Zuschlag, Absicherung, Rechnungsstruktur, Steuer nur auf den Versand, Belegformate, Sendungsnummernmodell); ausdrücklich nicht übertragen: Uhrzeit, Garantie, PLZ-Verfügbarkeit, Gewichtsgrenzen, ISC, Produktidentität der 86.
- 84, 22, 23, 26, 29, 107, 117/118, JUMiNGO, Preisfunktion, MwSt., Belegversionen, Stornierung und alle Fristen unverändert; keine ENV-, Schalter- oder Schemaänderung. Providerrequests: 1 GetQuote + 1 BookShipment (Staging, ausdrücklich freigegeben), 0 in Produktion.
- Wirksam nach Merge des Branches `feature/dhl-timed-family` (Backend; im Frontend nur die Synchronisation dieses Dokuments).

### v2.1 — 2026-09-17 (DHL Foundation: TG84 kuratiert, Art der Lieferadresse ohne Zuschlag)

- 1A: Service 84 „DHL Express · Domestic Express" vollständig kuratiert, bleibt quote_only (offen: DHL-Trackingereignisse, Produktionsbedeutung von ISC); Evidenz: Staging-Quotes 1274/1275 und Staging-Buchung DE0052580 / INV-0040781 (zwei Packstücke, Direktabholung, Absicherung, A4/Thermal, eine gemeinsame Sendungsnummer, zwei Stücknummern im PDF, kein RES, kein COL, keine Abholung am selben Tag freigegeben; ISC nur als Stagingbefund). Neue Produktentscheidung „Art der Lieferadresse ohne Zuschlag" als generischer Modus mit Sperre bei jedem Vertragswechsel. Transportabsicherung kuratiert auch für 84.
- 6.4: Kuratierung und Vertrag der 84; Modus `declared_no_surcharge` mit Herleitung `scenario_difference_no_residential_surcharge` und öffentlichem Feld `surchargeFreePriceInputs`; fail-closed-Verhalten; Belege und Trackingreferenz; White-Label-Befund der Carrier-PDF-Metadaten; Transglobal-Fristen ausdrücklich unverändert, dazu der offene Latenzbefund (Staging etwa 26–41 s, Produktion nicht gemessen) für ein eigenes Paket.
- 14: Transglobal Booking mit 84 (quote_only) und dem Modus (wirksam nach Merge); Fristen unverändert.
- 15: Kartenhinweis, Auswahltexte und Bindungsprüfung ohne Zuschlag, feldgesteuert.
- 21: Transglobal-Fristen und Anbieterantwortzeiten je Umgebung sind Runtime-Fakten.
- 22, 23, 26, 29, JUMiNGO, Preisfunktion, MwSt., Belegversionen und Stornierung unverändert; keine Providerrequests in diesem Paket (die Evidenz stammt aus den zuvor ausdrücklich freigegebenen Staging-Läufen); keine ENV-, Schalter- oder Schemaänderung.
- Wirksam nach Merge der Branches `feature/dhl-foundation-tg84` (Frontend vor Backend: nur das neue Frontend liest `surchargeFreePriceInputs` — ein altes Frontend verwürfe die Bindung eines zuschlagsfreien Angebots).

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
