# CONFIDARAEXPRESS — CANONICAL PROJECT CONTEXT

- **Schema-Version:** 2.1
- **Status:** CANONICAL PROJECT SOURCE
- **Last verified:** 2026-09-13 (Package-C-Abschnitte 5.11, 5.14, 6.2, 6.4, 14; Transglobal-Abschnitte 2026-09-11; übrige Abschnitte Stand 2026-09-09)
- **Verified against Frontend `origin/main`:** `ba8e44c` plus Paket TG-22 (Branch `claude/tg22-reference-enablement`, wirksam nach Merge); Package-C-Abschnitte gegen Branch `claude/package-c-operations-reconciliation` (wirksam nach Merge)
- **Verified against Backend `origin/main`:** `6e67fad` plus Paket TG-22 (Branch `claude/tg22-reference-enablement`, wirksam nach Merge); Package-C-Abschnitte gegen Branch `claude/package-c-operations-reconciliation` (wirksam nach Merge)
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

Transglobal-Angebote dürfen Kunden sichtbar sein. Außer dem Referenzservice (siehe unten) sind sie quote_only und nicht buchbar.

Die UI muss diesen Zustand korrekt kommunizieren und darf Nicht-Buchbarkeit nicht verschleiern.

Ein Transglobal-Angebot erscheint nur mit belegter Kontowährung EUR (`TRANSGLOBAL_ACCOUNT_CURRENCY`); ein Betrag unbekannter Währung wird nie mit Euro-Zeichen angezeigt.

### Transglobal-Buchung

**Status: PRODUCT_DECISION** (bestätigt 2026-09-11)

- Referenzservice ist **Service 22 (UPS Standard Single)**. Öffentliche Buchbarkeit ist technisch vorbereitet, **ausschließlich DE→DE**, ein Paket, Abholung an einem Tag nach heute.
- Alle anderen Transglobal-Services bleiben nicht öffentlich buchbar.
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

### 5.5 Preisrelevante Buchungsdaten werden eingefroren

**Status: ACTIVE_CURRENT**

Preisbestimmende bzw. buchungsrelevante Angaben werden vor bzw. im Buchungsprozess serverseitig persistiert und für die Buchungsentscheidung aus dem gespeicherten Zustand gelesen.

Client-Abweichungen dürfen den gespeicherten Vertrag nicht still überschreiben.

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

- Service `publicBookable` **und** Routenbereich in `publicBookableScopes` (heute nur Service 22, nur DE→DE),
- `TRANSGLOBAL_PUBLIC_BOOKING_ENABLED` (Produktschalter, default aus),
- belegte Kontowährung `TRANSGLOBAL_ACCOUNT_CURRENCY=EUR` (default nicht gesetzt ⇒ kein TG-Angebot),
- Full Quote mit Buchungsreferenz, kuratierte Übergabeart und Preisklasse, beantwortete Adressarten,
- bei Abholung ein Abholtag nach heute (Same-Day ist nicht öffentlich buchbar).

Die Bestellung braucht zusätzlich `TRANSGLOBAL_BOOKING_ENABLED` (technischer Kill-Switch, default aus). Angebot und Buchung prüfen dieselbe Quelle.

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
| Transglobal Booking | IMPLEMENTED_CONDITIONALLY | default aus; öffentlich buchbar vorbereitet nur Service 22 DE→DE hinter Produktschalter, Buchungsschalter und Kontowährung |
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
