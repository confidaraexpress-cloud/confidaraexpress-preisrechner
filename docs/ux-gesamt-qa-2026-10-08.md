# ConfidaraExpress — Gesamt-QA der UX-Modernisierung (Pakete 1–6)

**Prüfung:** 2026-10-08/09 · **Dokumentiert:** 2026-10-09 · **Prüfer:** Claude Code (lokal und isoliert, kein Produktivsystem)
**Geprüfte Stände:** Frontend `origin/main` `c1bc6f942650f0b15d9ffb73217f4770488cf302` · Backend `origin/main` `99f8a20c3fec2febe18d03047326b1283de86846`
**Auftrag:** Masterauftrag „UX-/UI-Modernisierung“, Abschnitt 11 (übergreifende Qualitätssicherung), Abschnitt 12 (bekannte Risiken), Abschnitt 17 (Abschlussbericht A–J)
**Ablage:** byte-gleich in beiden Repositories — Frontend `docs/ux-gesamt-qa-2026-10-08.md`, Backend `confidaraexpress-api/docs/ux-gesamt-qa-2026-10-08.md` (wie `go-live-audit-2026-07-09.md`)

Dieser Bericht ist ein datierter Prüfnachweis, keine kanonische Quelle. Die kanonische Zusammenfassung steht im Canonical Context (1A, 12A, 20.6, 21, Changelog v2.33). Backendpfade sind relativ zu `confidaraexpress-api/`, Frontendpfade relativ zur Repository-Wurzel. Zeilennummern beziehen sich auf die geprüften Stände.

---

## Kurzfazit

- **Abgeschlossen:** Die UX-Pakete 1–6 sind gemergt; die CI jeder Merge auf `main` ist grün (A, I).
- **Keine Regression** aus den Paketen 1–6 festgestellt — geprüft über die integrierten Abläufe A–F, Rollen- und Zugriffsschutz, mobile Ansichten und einen Barrierefreiheits-Vergleich gegen den Stand vor Paket 1 (B–H).
- **Offen:** die Go-Live-Risiken A (Buchungssicherheit) und B (Kontostatus vor der Passwortprüfung) sowie weitere Befunde im Register (R). **Grüne UX-CI bedeutet nicht, dass A und B behoben sind.**
- **Nicht verifiziert:** jeder Produktionszustand (`UNKNOWN_RUNTIME_STATE`, J).
- **Deployment wurde ausdrücklich NICHT durchgeführt.**

## Prüfumgebung und Abgrenzung

| Baustein | Umsetzung |
|---|---|
| Backend | `99f8a20` lokal (`NODE_ENV=development`); je Konfiguration eine eigene Wegwerf-Datenbank (PostgreSQL 16 im Docker-Container, nur `127.0.0.1`) |
| Konfiguration „Produktiv“ | Partner-Schalter für Registrierung, Referrals und Provisionen an, Vereinbarungsfassung 1.0 konfiguriert — es ist aber **keine** Fassung veröffentlicht |
| Konfiguration „Pre-Live“ | nur `SALES_PARTNER_PRELIVE_TEST_MODE` und `SALES_PARTNER_REFERRALS_ENABLED` |
| Netz | Netzsperre im Backendprozess (DNS, IP-Verbindungen und `fetch` nur zu localhost, jeder Versuch protokolliert); im Browser wurde jede nicht-lokale Anfrage abgebrochen und gezählt |
| Provider und Mail | keine Providerzugänge (JUMiNGO und Transglobal deaktiviert); Mailschlüssel nur als Platzhalter |
| Frontend | Produktions-Build von `c1bc6f9`, über einen lokalen Proxy mit dem Backend unter einer Origin ausgeliefert (die Entwicklungs-Origins waren von laufenden Prozessen belegt) |
| Browser | Chromium (Playwright); Smartphone und Tablet emuliert |

Begriffe:

- **integriert** — echter Browser gegen echtes Backend und echte (Wegwerf-)Datenbank.
- **Fixture** — Datensatz per SQL statt über die Oberfläche, ausdrücklich gekennzeichnet:
  - Admin-Konten (es gibt keine Oberfläche zur Anlage);
  - in der Produktivkonfiguration ein Partnerantrag, eingefügt wie bei der Registrierung — die öffentliche Registrierung ist dort ohne veröffentlichte Vereinbarung 1.0 fail-closed geschlossen.
- **nachgebildet** — die Browser-E2E-Suiten der CI beantworten Backendaufrufe über `page.route` (H).

Nicht geprüft: Produktion oder Staging, physische Geräte, Screenreader, echte Buchung, echte Gutschrift, echte E-Mail, Zahlung.

---

## A. Status

| Paket | Inhalt | PR | Merge-Commit | CI auf `main` |
|---|---|---|---|---|
| 1 | Verständlichkeit und Bedienfehler (Admin + Partnerportal) | FE #474, BE #403 | FE `0b57c6b637bd`, BE `99f8a20c3fec` | grün (37709503662, 37709492734) |
| 2 | Adminbereich: „Zu erledigen“, gruppierte Navigation, Teilnavigation, Rückwege | FE #475 | `70344974245c` | grün (37762806744) |
| 3 | Partner-Startseite: vier Kennzahlen, Werbelinks, Provisionsaufbau | FE #476 | `4648e3f42390` | grün (37770763060) |
| 4 | Admin-Partnerdetail: Antrag oben, Überblick, einklappbare Bereiche | FE #477 | `477eda64b6c9` | grün (37794058617) |
| 5 | Gutschriften, Versandnachweise, Pre-Live-Testablauf | FE #478 | `f7d2db5b22fd` | grün (37825659144) |
| 6 | Partnerbereiche, Registrierung, Admintexte | FE #479 | `c1bc6f942650` | grün (37845014949) |
| QA | diese Gesamtprüfung | — | keine Codeänderung | — |

## B. Adminpanel

**Umgesetzt (Pakete 1, 2, 4, 5, 6):**

- Kopieren meldet „Kopiert“ nur nach echtem Kopieren; jede Einzelausstellung einer Gutschrift braucht eine Bestätigung; Deaktivieren, Login-Sperre und Obergrenzen nennen ihre tatsächlichen Folgen; Login-Aktionen und neue Provisionssätze nur für freigegebene Partner; keine Rohwerte oder Schalternamen im sichtbaren Text.
- Testkunde im Admin-Kundendetail als TEST über das Lesefeld `user.prelive_test` (BE #403).
- Übersicht `/admin` mit „Zu erledigen“ aus Serverzählern (ein unbekannter Zähler erscheint nie als 0); Sidebar in vier Gruppen (Kunden und Partner · Versand und Rechnungen · Support und Bearbeitung · Verwaltung und Protokoll); Teilnavigation Vertriebspartner (Partner, Versandnachweise, Gutschriften, Einstellungen, Pre-Live-Test); Rückwege zur Herkunft.
- Partnerdetail nach Aufgaben: offener Antrag oben, Überblick mit nächstem Schritt, einklappbare Bereiche.
- Gutschriftslauf zählt die Vorschau je Serverstatus und nennt den nächsten Schritt; Versandnachweise mit Zusammenfassung vor dem Speichern und Serverfehlern am Feld; Pre-Live-Werkzeuge mobil als Karten.
- Admintexte einheitlich (Protokoll-Labels, Anrede „Sie“, technische Kennungen als „(intern)“).

**Geprüft (integriert):**

- Alle 15 Adminseiten per Direktaufruf ohne Seitenfehler und ohne 5xx (Produktivkonfiguration).
- Über die Oberfläche bedient:
  - Antragsfreigabe, für Testkonten mit rückdatiertem Wirkungstag
  - Bestätigung der Abrechnungsdaten
  - Kundenfreischaltung mit Aufschlagsbestätigung
  - globale Level-Regeln und Obergrenzen (Pre-Live, rückdatiert)
  - Provisionsberechnung (Testdaten)
  - Gutschriftslauf: Vorschau → Bestätigung → Ausstellung
  - Auszahlung erfassen
  - Bereinigung, nur als Trockenlauf
- Gegenüber dem Stand vor Paket 1 verbessert: die Einstellungsseite hat bei 390 px keinen seitlichen Überlauf mehr (vorher 151 px); die Übersicht hat 2 statt 5 Kennzahlkarten mit abweichendem Namen.

Vorbestehende Befunde (identisch vor Paket 1): R9.

## C. Freelancer-Dashboard (Partnerportal)

**Umgesetzt (Pakete 1, 3, 6):**

- Ehrliche Kopierrückmeldung; „Mein Team“ immer sichtbar mit Lade-, Fehler- und Leerzustand.
- Startseite mit vier Kennzahlen und ihrem Zeitraum aus der Serverantwort, „Kunden und Partner werben“ (Kunden- und Partnerlink) und „So setzt sich Ihre Provision zusammen“ — Werte des Servers, keine Addition im Browser.
- Bereiche als `?page=<Kennung>` (Direktlink, Rücksprung nach dem Login).
- Kunden: „Kundenkonto“ und „Zählt für Ihr Kunden-Level“ getrennt, Monatsspalten aus der Übersicht.
- Provisionen: Monatssumme zuerst, fünf statt acht Spalten.
- Team: Ebenen mit Erklärung, Platz statt Rang.
- „Gutschriften“ (vorher „Abrechnungen“) mit Hinweis auf noch nicht abgerechnete Beträge; Konto mit Abrechnungsdaten und Vereinbarung.

**Geprüft (integriert):**

- Alle sechs Bereiche per Direktlink (Produktiv- und Pre-Live-Konfiguration); Gast auf `/partner?page=commissions` → Login → zurück zu den Provisionen; Neuladen behält den Bereich.
- Beträge mit der Datenbank abgeglichen:
  - Provisionen September: 6,00 € (Eigene Kunden 4,00 €, Team Ebene 1 2,00 €, alles auszahlbar)
  - Team: „Ja – Platz 1 von 10“, Teamprovision gesamt 2,00 €
  - Testgutschrift: netto 6,00 €, Steuer 0,60 € (10,00 %), brutto 6,60 €
- Monatsbezüge: „Pakete im September – zählen für Ihr Paket-Level im Oktober“, „Ihr Satz im Oktober“, „Verdient im September 2026“; die Levelbewertung misst September und gilt im Oktober.
- Datenschutz: Teambuchungen nennen keinen Kundennamen; die IBAN erscheint nur maskiert („DE89 … 3000“); Testkonten tragen dauerhaft den Testhinweis und „TESTDOKUMENT“.
- Textscan aller Partner- und Kundenansichten: keine Providernamen, keine Rohcodes, keine Platzhalter (`undefined`, `NaN`), keine Beträge im englischen Format.

## D. Texte (Vorher → Nachher, Auswahl)

| Paket | Vorher | Nachher |
|---|---|---|
| 1 | „Kopiert“ auch ohne erfolgreiches Kopieren | „Kopiert“ nur nach echtem Kopieren, sonst Hinweis und markierter Text |
| 1 | Rohwerte wie „Failed to fetch“, `SALES_PARTNER_CREDIT_NOTES_ENABLED`, „Server“, „Provider“, „Technischer Grund“ | verständliche Meldungen ohne Technikbegriffe |
| 2 | „Audit-Logs“ · „Produktion & Backfill“ · „Abrechnungslauf“ | „Protokoll“ · „Interne Vorschau-PDFs“ · „Gutschriften“ |
| 2 | Zeilenaktion „Details“ in der Partnerliste | „Antrag prüfen“ |
| 2 | „Zurück zur Übersicht“ (führte zur Liste) | „Zurück zu den Stornierungsanfragen“ bzw. Rückweg zur Herkunft |
| 3 | Kennzahlen ohne Zeitraum | „Pakete im September – zählen für Ihr Paket-Level im Oktober“, „Ihr Satz im Oktober“ |
| 5 | „zulässig“ | „ausstellbar“ (wie der Serverstatus) |
| 5 | „Provisionslauf“ | „Provisionen jetzt berechnen (nur Testdaten)“ |
| 6 | Bereich „Abrechnungen“ | „Gutschriften“ |
| 6 | Status „Ja/Nein“ | „Auszahlbar“ / „Noch nicht auszahlbar“ |
| 6 | „Ebene 2 · 12 von 10“, „Rang“ | „12 Partner · 10 zählen für Ihre Teamprovision (höchstens 10)“, „Ja – Platz 2 von 10“ |
| 6 | „abrechnungsreif“ | „Noch nicht abgerechnet: auszahlbare Provisionen von … Sie werden mit der nächsten Gutschrift abgerechnet.“ |

## E. Mobile Bedienung

- **Viewports:** 390 × 844 (Touch, mobil), 768 × 1024 (Touch), 1440 × 1000 (Maus).
- **25 Seiten:**
  - öffentlich: Startseite (für Gäste → Login), Login, Kundenregistrierung, Partnerregistrierung
  - Partner: alle sechs Bereiche
  - Admin: Übersicht, Kunden, Kundendetail, Partner, Partnerdetail, Versandnachweise, Gutschriftslauf, Einstellungen, Pre-Live-Test, Protokoll
  - Kunde: fünf Bereiche
- **Messung vor dem Screenshot:** seitlicher Überlauf, Touch-Ziele unter 44 px, doppelte IDs, Textscan, axe-core 4.14 (WCAG 2.0/2.1/2.2 A und AA), Konsolen- und Seitenfehler, 5xx; Tastaturfokus auf sechs Seiten (Desktop).
- **Ergebnis:**
  - seitlicher Überlauf auf allen Seiten 0
  - Fokus in allen geprüften Tab-Folgen sichtbar
  - Touch-Emulation in allen Touch-Läufen aktiv
  - keine neuen axe-Verstöße gegenüber dem Stand vor Paket 1 (Vergleichsbuild aus `5b161a0` mit demselben Backend)
- **Touch-Ziele unter 44 px:** nur vorbestehend und identisch vor Paket 1 — Fußzeilenlinks (18–30 px hoch), „30 Tage angemeldet bleiben“ beim Login (18 px), Historienzeile in den Admin-Einstellungen (17 px). Siehe R9.
- **Hinweis:** Eine erste Messreihe löste das Admin-Rate-Limit aus (R5). Die betroffenen Adminseiten wurden nach einem Backend-Neustart gedrosselt wiederholt — ohne 429 und ohne Fehler.
- **Sichtprüfung:** Screenshots von Partnerübersicht, Provisionen, Gutschriften, Team, Partnerregistrierung, Admin-Übersicht, Admin-Partnerdetail und Gutschriftslauf (390 px) sowie der Desktopansichten.
- **Nicht geprüft:** physische Geräte, iOS Safari, Screenreader.

## F. Funktionalität

| Ablauf | Ergebnis | Art |
|---|---|---|
| **A** Partnerregistrierung | Produktivkonfiguration: Registrierung geschlossen (`registrationMode: closed`, kein Formular; `POST /api/sales-partner/register` → 404 `SALES_PARTNER_AGREEMENT_UNAVAILABLE`, kein Konto); Anmeldung vor der Freigabe gesperrt; Adminfreigabe (10,00 % · Ebene 1 5,00 % · Ebene 2 2,50 %) → Anmeldung → `/partner` „Aktiv“. Pre-Live: öffentliches Formular mit Testhinweis → Antrag als TEST (pending) → Freigabe mit Wirkungstag 01.09.2026 → Anmeldung → Portal mit Testhinweis | integriert; der Antrag in der Produktivkonfiguration als Fixture |
| **B** Kundenwerbung | `/register?ref=CODE`: `ref` aus der Adresse entfernt, Code im Registrierungsbody, Zuordnung serverseitig (Partner, Quelle `referral_link`, ab Registrierungstag); der Partner sieht den Kunden „In Prüfung“, nach der Adminfreischaltung „Aktiv“; das Admin-Kundendetail nennt Zuordnung und Herkunft | integriert (Produktivkonfiguration, echter Partner) |
| **C** Teamwerbung | Partnerlink eines aktiven Testpartners → Antrag mit Sponsor (Datenbank) → Freigabe → Team „Direkt geworben (Ebene 1)“, „Ja – Platz 1 von 10“ | integriert (Pre-Live); in der Produktivkonfiguration nicht möglich (Registrierung geschlossen) |
| **D** Provision | Testkunden (Empfehlungscode bzw. Auswahl, zugeordnet ab 01.09.2026) → Testsendungen 15./16.09.2026 (je 2 Pakete, Basis 40,00 €) mit Versandnachweis und Testzahlung → globale Level-Regeln und Obergrenzen (rückdatiert auf 01.08.2026) → Provisionsberechnung: 4 Monatsbewertungen, 2 Entscheidungen, 2 gutgeschrieben, 0 fehlgeschlagen → Ledger 4,00 € (eigener Kunde) und 2,00 € (Team Ebene 1) → Dashboard | integriert (Pre-Live, rückdatiert; dieselbe Entscheidungsfunktion mit Bereich „Test“) |
| **E** Gutschrift | Abrechnungsdaten → Adminbestätigung → Testlauf September: Vorschau (1 ausstellbar, 1 blockiert „Abrechnungsdaten fehlen“) → Bestätigung → `CE-TEST-PG26-00001` (netto 6,00 €, Steuer 0,60 €, brutto 6,60 €) → Partner lädt das PDF (Wasserzeichen „TESTDOKUMENT – NICHT STEUERLICH GÜLTIG“, Testaussteller) → Auszahlung getrennt erfasst → „Test – ausgezahlt“ | integriert (Pre-Live). Eine echte Ausstellung wurde nicht ausgeführt (verboten); in der Produktivkonfiguration zeigt der Lauf „abgeschaltet“, 0 Belege |
| **F** Pre-Live | alle Schritte oben; Bereinigung nur als Trockenlauf (Zählungen je Tabelle, nichts gelöscht) | integriert |

Weitere Prüfungen (integriert):

- **Zugriff (API):** ohne Token 401; Kunde auf Partner-API 403; Partner auf Kunden- und Admin-API 403; Kunde auf Admin-API 403.
- **Rollenwechsel in der Oberfläche:** Kunde auf `/partner` → `/dashboard`; Partner auf `/dashboard`, `/admin` und `/admin/partners` → `/partner`.
- **Hauptnavigation:** 15 Adminseiten, 6 Partnerbereiche und 10 Kundenbereiche ohne Seitenfehler und ohne 5xx.
- **E-Mail-Wechsel:** 404 (R3).

## G. Sicherheit

**Erhaltene Invarianten (geprüft):**

- Rollen und Mandantenbindung (F).
- PDF-Rechte der Gutschrift (alle 10 Kombinationen wie erwartet):

| Route | Admin | Eigentümer | anderer Partner | Kunde | ohne Token |
|---|---|---|---|---|---|
| `GET /admin/sales-partner-credit-notes/:id/pdf` | 200 (PDF) | 403 | 403 | 403 | 401 |
| `GET /api/sales-partner/me/credit-notes/:id/pdf` | 403 | 200 (dasselbe PDF) | 404 | 403 | 401 |

- **Test/Echt-Trennung:**
  - Ein echter Kunde, der sich über den Code eines Testpartners registriert, wird nicht zugeordnet (0 Zuordnungen).
  - Testkonten zählen nicht in den Admin-Kundensummen.
  - Die Testgutschrift trägt den Nummernkreis CE-TEST-PG, das Wasserzeichen und einen Testaussteller.
  - Die Kennzeichnung kommt ausschließlich aus Serverfeldern (`prelive_test`, `is_test`).
- **Geld:** alle Summen vom Server, keine Berechnung im Browser; Gutschrift und Auszahlung getrennt (die Auszahlung ist ein eigener Adminvermerk).
- **Fail-closed:** die produktive Partnerregistrierung bleibt ohne veröffentlichte Vereinbarung geschlossen.
- **Datenschutz:** IBAN maskiert; Teamansichten ohne Kunden der Teammitglieder; keine Provider- oder Rohwerte in Partner- und Kundenansichten.
- **Mails und Netz:**
  - Der Versandschutz unterdrückte 4 Mails an Testkonten.
  - 5 Sendeversuche des Backends aus Vorgängen echter (nicht als Test gekennzeichneter) QA-Konten blockierte die Netzsperre; die Empfänger wurden nicht protokolliert.
  - Aus Backend und Browser ging kein Request nach außen.

**Offene Befunde:** Register R1–R9.

## H. Tests

- **CI Frontend `c1bc6f9`** (Lauf 37845014949): Unit-Tests und Build ✓, Browser-E2E 4/4 Shards ✓, Sicherheitsprüfung der Laufzeitabhängigkeiten ✓. Die Browser-E2E arbeiten mit nachgebildeten API-Daten.
- **CI Backend `99f8a20`** (Lauf 37709492734): Suiten ohne Datenbank ✓, fünf PostgreSQL-Läufe ✓ — der Lauf „IDOR und Idempotenz“ enthält `book-outcome-safety-pg` und die drei Vertriebspartner-Suiten —, Abhängigkeitsprüfung ✓.
- **Lokal integriert (diese QA):**
  - Phase 1, Produktivkonfiguration: 13/16 Schritte. Die 3 Abweichungen waren Fehler des Prüfskripts (erwarteter Statuscode, Spaltenname, nur lesbares Feld); der Nachlauf mit korrigierten Erwartungen ergab 6/6.
  - Phase 2, Pre-Live: 16/16 Schritte.
  - PDF-Rechte: 10/10 Kombinationen.
  - Responsive und Barrierefreiheit: 122 Messungen (75 + 20 gedrosselte Wiederholungen + 27 im Vorher-Vergleich).
  - Produktions-Build von `c1bc6f9` ✓.
- **Nicht ausgeführt:** lokale Frontend-Unit- und E2E-Suiten sowie lokale Backend-Suiten in dieser Phase (Nachweis über CI); physische Geräte; Screenreader.
- **Sporadische Tests:** R1 (Backend), R7 (Frontend).

## I. GitHub

- Pull Requests der Pakete: FE #474–#479 und BE #403, alle gemergt; Merge-Commits und CI-Läufe in A, verifiziert gegen `origin/main`.
- Die Gesamt-QA selbst hat keinen Code geändert. Dieser Bericht und die Aktualisierung des Canonical Context kommen über eigene Dokumentations-PRs (Branch `docs/ux-gesamt-qa-2026-10` in beiden Repositories).

## J. Deployment und Übergabeplan

**Deployment wurde ausdrücklich NICHT durchgeführt.** Der folgende Plan ist ein Vorschlag zur Betreiberentscheidung; kein System wird ohne sie produktiv verändert.

1. **Laufenden Stand feststellen:** Welcher Commit in Backend und Frontend produktiv läuft, ist nicht verifiziert (`UNKNOWN_RUNTIME_STATE`). Liegt er vor dem Vertriebspartner-Programm, ergänzt `db/init.js` das Schema beim Start — vorher eine Datenbanksicherung anlegen.
2. **Zuerst das Backend:** `99f8a20c3fec2febe18d03047326b1283de86846`; danach `/health` und das Startprotokoll prüfen (keine Konfigurationsfehler; der Pre-Live-Hinweis nur, wenn bewusst gewollt).
3. **Dann das Frontend:** `c1bc6f942650f0b15d9ffb73217f4770488cf302` mit der produktiven `VITE_API_URL`. Grund für die Reihenfolge: Das Frontend liest ab Paket 1 `user.prelive_test` (BE #403); fehlt das Feld, fehlt die TEST-Kennzeichnung im Admin-Kundendetail.
4. **Laufzeitwerte bewusst setzen und prüfen** (Werte nie ins Repository):
   - `NODE_ENV=production`; `APP_BASE_URL` mit https (in Produktion Pflicht; die Partnerlinks bauen darauf auf)
   - `RESEND_API_KEY` (Startabhängigkeit, R6); `INVOICE_EMAIL_FROM` / `INVOICE_EMAIL_REPLY_TO`
   - jeder `SALES_PARTNER_*`-Schalter einzeln; `SALES_PARTNER_PRELIVE_TEST_MODE` und `SALES_PARTNER_PRELIVE_TEST_MAIL_ALLOWLIST` vor dem Livegang aus bzw. entfernt
   - Aussteller- und Steuerwerte der Gutschriften (`SALES_PARTNER_ISSUER_*`, `SALES_PARTNER_TAX_*`)
   - Anzahl der Proxys vor der API: `app.set("trust proxy", 1)` erwartet genau einen; sonst teilen sich Clients die IP-basierten Limits
5. **Danach nur lesende Prüfungen:** Login je Rolle; alle Hauptnavigationspunkte ohne 5xx; `GET /api/sales-partner/public-config` liefert den gewollten Modus; Partnerlinks beginnen mit https. Keine Buchung, keine echte Gutschrift und keine Testmail ohne Freigabe.
6. **Falls der Pre-Live-Modus in der Umgebung genutzt wurde:** Pre-Go-Live-Gate (Canonical Context 21) — Bereinigung, bis alle Zähler 0 sind und kein Blocker besteht; rückdatierte Regeln und Obergrenzen bestätigen oder ersetzen; Vereinbarung 1.0, Legal und Steuer.
7. **Offene Risiken R1–R9** vor dem Go-Live bewerten; R1 und R2 brauchen eine Betreiberentscheidung.

Ein Rollback-Pfad wurde nicht geprüft.

---

## R. Register offener Go-Live-Themen

### R1 — Risiko A: Buchungssicherheit bei fehlgeschlagener Datenbankpersistenz

**Status:** offen, **nicht** behoben; Betreiberentscheidung (eigene Backendaufgabe vor dem Go-Live). Vollständig: Backend `docs/booking-safety-finding-offer-reconciliation-order-2026-10.md`.

- Hat der Provider den Auftrag bestätigt und scheitert danach die lokale Transaktion, sendet `lib/booking/persistence.js` die Antwort `502 BOOKING_OUTCOME_UNKNOWN` (Z. 707), **bevor** `lib/booking/bookHandler.js` das Angebot als `reconciliation_required` markiert (Z. 1908).
- Ein erneuter Buchungsversuch für dieselbe Sendung bleibt durch den Sendungs-Claim gesperrt.
- Nicht garantiert sind der sekundäre Angebotsschutz und der zugesagte Zustand im Antwortmoment. Scheitert die Markierung, bleibt das Angebot dauerhaft unmarkiert.
- Beobachtet als sporadischer Fehler von Fall (N) in `tests/book-outcome-safety-pg.test.js`: CI-Läufe 35228468603 und 35401436725 (`main`) und 37702036929 (PR #403, Versuch 1). Ein grüner Wiederholungslauf ist kein Nachweis einer Behebung.

### R2 — Risiko B: Offenlegung des Kontostatus vor der Passwortprüfung

**Status:** offen, **nicht** geändert; Betreiberentscheidung. Vollständig: Backend `docs/security-finding-login-status-disclosure-2026-10.md`.

- `POST /login` prüft in `routes/auth.js` den Kontostatus (Z. 135–138) vor dem Passwort (Z. 139).
- Integriert bestätigt: ein Konto, das auf Freischaltung wartet, erhält mit **falschem** Passwort 403 `ACCOUNT_PENDING_APPROVAL`; eine unbekannte Adresse erhält 401 `INVALID_CREDENTIALS`.

### R3 — Defekter E-Mail-Wechsel (404)

**Status:** offen, vorbestehend (nicht durch die UX-Pakete verursacht); eigene Aufgabe mit Tests auf beiden Seiten.

- Das Frontend ruft ohne `/api`-Präfix auf (`src/api/client.js` Z. 434, 444, 449, 457): `POST` und `DELETE /kunde/email-change`, `POST /kunde/email-change/resend`, `POST /auth/confirm-email-change`.
- Das Backend bedient nur `/api/kunde/email-change` (`routes/emailChange.js` Z. 77, 230), `/api/kunde/email-change/resend` (Z. 160) und `/api/auth/confirm-email-change` (Z. 249); `server.js` schreibt keine Präfixe um.
- Integriert: `POST /kunde/email-change` → 404; die Oberfläche meldet „…konnte nicht gestartet werden“, das Konto bleibt angemeldet, es entsteht kein Antrag.
- Produktion nicht verifiziert. Gegen ein Umschreiben durch einen Proxy spricht: Das Frontend setzt `/api/…` sonst ausdrücklich, und das Backend bedient z. B. `/login` ohne Präfix.

### R4 — Mögliche Datenschutzfrage im Gutschrift-PDF

**Status:** offen; Produkt- bzw. Datenschutzentscheidung. Vorbestehend seit dem Gutschriften-Feature (2026-10-07).

- Die Positionen einer Gutschrift nennen als Referenz die Auftragsnummer der Sendung (`business_order_number`, bei Testsendungen `TEST-S<id>`; `lib/salesPartner/creditNotes.js` Z. 101). Das gilt auch für Teampositionen (Ebene 1 und 2) — dort ist es die Auftragsnummer einer Sendung eines Kunden des Teammitglieds.
- Das Portal nennt dieselbe Buchung neutral `VP-<id>` (`routes/salesPartner.js` Z. 424) und bei Teambuchungen nur das Teammitglied.
- Canonical Context 12A: „Partner sehen keine … Kunden ihrer Teammitglieder.“ Eine Auftragsnummer ist kein Kundenname; ob sie im Beleg eines anderen Partners stehen darf, ist offen.
- Zusätzlich lassen sich Portal- und Belegreferenz nicht abgleichen.
- Integriert gesehen: Position 2 der Testgutschrift „Provision – Team Ebene 1“ mit Referenz `TEST-S2`.

### R5 — Admin-Rate-Limit

**Status:** Hinweis; Betreiberentscheidung, ob das Limit angepasst wird. Kein Produktfehler nachgewiesen.

- Alle lesenden Endpunkte des Partner-Adminbereichs zählen gemeinsam auf `admin-sp-list:<Admin-ID>`: 120 Zugriffe je 15 Minuten (`routes/admin/shared.js` Z. 25–29), im Speicher je Prozess. Dazu gehören Liste, Detail, Abrechnungsdaten, Gutschriften, Provisionen, Level-Regeln, Obergrenzen, Kundenzuordnung, Versandnachweise und der Pre-Live-Status.
- Gemessen je Seitenaufruf: Partnerdetail 5 Adminanfragen, Partnerliste 3, Pre-Live-Test 4.
- Rechnerisch reicht das Budget für rund 24 Partnerdetailansichten je 15 Minuten. Bei vielen Partneranträgen an einem Tag kann ein Admin 429 erhalten.
- In der QA hat nur eine automatisierte Messreihe das Limit ausgelöst.

### R6 — Backend-Startabhängigkeit von `RESEND_API_KEY`

**Status:** Dokumentation korrigiert (`docs/BACKEND_ARCHITECTURE.md`, ENV-Tabelle); Verhalten unverändert.

- `emailService.js` Z. 30 erzeugt den Resend-Client beim Laden: `new Resend(process.env.RESEND_API_KEY)`. `resend` 6.12.3 wirft ohne Schlüssel „Missing API key …“.
- Das Modul wird beim Start über die Routen geladen (u. a. `routes/auth.js` Z. 6). Ohne Schlüssel startet das Backend deshalb nicht.
- Die Dokumentation nannte nur „alle E-Mails schlagen fehl“.
- Folge für Betrieb und Wiederanlauf: Der Schlüssel ist eine Startvoraussetzung. Die lokale QA startete mit einem Platzhalter; jeder Sendeversuch scheiterte an der Netzsperre.

### R7 — Bekannte sporadische Frontend-Tests

**Status:** offen; Testbefunde ohne nachgewiesenen Produktfehler, **nicht** behoben. Scheitert genau eine dieser Prüfungen, wird sie mit diesem Befund eingeordnet; ein grüner Wiederholungslauf belegt keine Behebung.

- **`tests/e2e/insuranceDraftReset.test.mjs`**, Fall (1), Z. 162 („die Buchung ist während der Rücksetzung freigegeben“):
  - Rot in CI-Läufen auf `main` nach #457, #464 und #473 sowie auf PR #476 und PR #479 (Stand 2026-10-08).
  - Mechanismus (lokale Sonde): `src/pages/BookingPage.jsx` setzt `entwurfRuecksetzung` erst im Effekt nach der Auswahl „keine“. „Kostenpflichtig buchen“ ist beim Rücksetz-Request noch frei und wird rund 15 ms später gesperrt; der Test prüft sofort.
  - Das Backend sichert ab (JUM-11, `lib/booking/bookHandler.js`).
  - Vorschlag (eigener PR, nur auf Auftrag): die Sperre synchron im Auswahl-Handler setzen, den Test nicht aufweichen.
- **`tests/e2e/multiProviderDebugMode.test.mjs`**, Fall 5, Z. 301 (Sortierung nach dem angezeigten Betrag):
  - Erstmals rot am 2026-10-08 auf PR #479 (Lauf 37836634563, Shard 3, Versuch 1).
  - Mechanismus (lokale Sonde, je 5/5 auf `main` `f7d2db5` und dem PR-Branch): Beim Umsortieren fügt React genau eine Karte neu ein. `.offer-card` trägt `content-visibility: auto`, die neue Karte ist im Prüfframe übersprungen — ihr Preis fehlt im `innerText`, steht aber im DOM.
  - Keine Produktfolge.
  - Vorschlag: in Fall 5 warten, bis jede Karte einen Preis zeigt.

### R8 — Grenze des echten Kundenlink-Tests im Pre-Live-Modus

**Status:** Testgrenze durch gewollte Test-/Echt-Trennung; dokumentiert.

- Die öffentliche Kundenregistrierung ordnet einem Pre-Live-Testpartner nie einen Kunden zu: `lib/salesPartner/referralRegistration.js` Z. 22 (nur `prelive_test = false`), Fremdschlüssel `fk_sp_attr_partner_prelive_test`. Integriert bestätigt: Ein echter Kunde über den Code eines Testpartners erhält 0 Zuordnungen.
- Im Pre-Live-Modus lässt sich der Weg „Kundenlink → Registrierung → Zuordnung“ deshalb mit Testpartnern nicht Ende-zu-Ende prüfen.
- Der Testweg legt Testkunden adminseitig mit dem Empfehlungscode an (Quelle „Empfehlungslink“, `createTestCustomer`). Er prüft weder die browserseitige Vormerkung (30 Tage, Entfernen von `ref`) noch die öffentliche Zuordnung bei `POST /register`.
- Der echte Weg wurde nur in der lokalen Produktivkonfiguration mit einem echten Partner geprüft (F, Ablauf B) — nie gegen Produktion.
- Ablauf D lässt sich für echte Kunden nicht am selben Tag prüfen: Der Versandtag muss abgelaufen sein, und Zuordnung, Freigabe und Sätze müssen schon am Versandtag gelten. Geprüft wurde dieselbe Entscheidungsfunktion mit rückdatierten Testdaten.

### R9 — Weitere vorbestehende UX- und Barrierefreiheitsbefunde

**Status:** offen, nicht durch die Pakete 1–6 verursacht (identisch auf dem Stand vor Paket 1).

- Kundenregistrierung `/register`: Postleitzahl und Ort ohne zugeordnetes Label, Länderauswahl ohne zugänglichen Namen (axe `label`, `select-name`, kritisch).
- Admin-Kundendetail: Chip `.adm-chip-muted` mit zu geringem Kontrast.
- Kundenprofil: Hinweistexte bei Lieferschein- und Abrechnungsart mit zu geringem Kontrast.
- Kundenbereich (Desktop): Nutzer-Chip `.pp-uchip` mit `aria-label` ohne den sichtbaren Text.
- Admin-Übersicht: zwei Kennzahlkarten mit `aria-label` ohne den sichtbaren Wert (vor Paket 2 fünf).
- Admin-Einstellungen bei 390 px: zwei scrollbare Tabellenbereiche nicht per Tastatur fokussierbar; Historienzeile (`<summary>`) 17 px hoch.
- Touch-Ziele unter 44 px: Fußzeilenlinks, „30 Tage angemeldet bleiben“ beim Login.
- Gutschriftslauf: „10,00 %“ kann zwischen Zahl und Prozentzeichen umbrechen (`formatPercent` in `src/utils/salesPartnerView.mjs` mit normalem Leerzeichen). Nach der Ausstellung zeigt die Zeile eines bereits abgerechneten Partners 0,00 € (offene Restbeträge) neben „Bereits ausgestellt“ statt des Gutschriftsbetrags.
- Admin-Übersicht: Die Kennzahl „Kunden – Alle angelegten Konten“ zählt auch Admin-Konten (alle Rollen außer Vertriebspartnern, ohne Testkonten).

## N. Nachweise

- Rohnachweise liegen nicht im Repository (die Prüfskripte enthalten Wegwerf-Zugangsdaten der lokalen Testkonten). Sie sind lokal beim Betreiber archiviert unter `%USERPROFILE%\.confidaraexpress\qa-nachweise\ux-gesamt-qa-2026-10-08\`:
  - Ergebnisdateien je Phase (JSON)
  - Screenshots (390, 768 und 1440 px, Vorher-Vergleich)
  - die Testgutschrift als PDF
  - Netzsperre- und Backendprotokolle
  - Prüfskripte
  - `SHA256SUMS.txt`
- CI-Läufe: A, R1, R7.

---

## Nachtrag 2026-10-09 — Umsetzungsstand R1–R9

**Dokumentiert:** 2026-10-09 · **Geprüfte Stände:** Backend `origin/main` `4c246df6708cdf19409046d8bf918aa6f515b402` · Frontend `origin/main` `1d0f57d62906ed91c9658695f286029f4b548918`

Dieser Nachtrag ergänzt den Bericht. Die Abschnitte oben beschreiben unverändert den Stand der Gesamt-QA vor der Umsetzung (Frontend `c1bc6f9`, Backend `99f8a20`). Die kanonische Zusammenfassung steht im Canonical Context 20.7 (v2.34).

### Statusbegriffe

- **implementiert:** Code und Tests stehen.
- **gemergt:** im jeweiligen `main`.
- **Main-CI:** der Push-Lauf auf dem Merge-Commit, gegen GitHub geprüft.
- **deployt / produktiv verifiziert:** in keinem Auftrag geschehen. Der Deploymentzustand außerhalb des Repository ist nicht verifiziert.

### Übersicht

| Punkt | Ergebnis | PR → Merge-Commit | Main-CI | Deployt | Produktiv verifiziert |
|---|---|---|---|---|---|
| R1 | Angebot vor der Antwort `reconciliation_required` verbraucht | Backend #405 → `1272b8a` | grün | nein | nein |
| R2 | Login prüft das Passwort vor dem Kontostatus | Backend #406 → `87862cc` | grün | nein | nein |
| R3 | E-Mail-Wechsel über `/api/...` | Frontend #482 → `d217958` | grün | nein | nein |
| R4 | `VP-<Ledger-ID>` in neuen Partnergutschriften (Betreiberentscheidung) | Backend #407 → `144ae30` | grün | nein | nein |
| R5 | geprüft, keine Codeänderung erforderlich | — | — | — | — |
| R6 | kein Codefix; Produktions-/Coolify-Prüfung offen | — | — | — | offen |
| R7 | Ursachen beider sporadischer Frontend-Tests behoben | Frontend #481 → `2a0cb8c` | grün | nein | — |
| R8 | gewollte Testgrenze; produktiver Rauchtest ausstehend | — | — | — | offen |
| R9 | Bedienungs- und Barrierefreiheitsbefunde behoben | Frontend #483 → `dcf0ba5` | grün | nein | nein |
| Kennzahl „Kunden“ | eigener Serverzähler (Betreiberentscheidung) | Backend #408 → `4c246df`, Frontend #484 → `1d0f57d` | grün | nein | nein |

### Nachweise je Punkt

- **R1** (Backend #405):
  - Der JUMiNGO-Aufruf von `persistBooking` setzt die vorhandene Fehlernaht `onTransactionFailure`: erst `angebotVerbrauchen(CONSUMED_RECONCILE)`, dann dieselbe 502. Claim bleibt `booking`, kein Retry, kein Providerkontakt.
  - `tests/book-outcome-safety-pg.test.js`:
    - (N2): Markierung verzögert; die Antwort kommt erst danach.
    - (N3): Markierung scheitert → weiterhin 502.
    - (N4): Totalausfall der Datenbank ab der Bestellbestätigung → 502, Retry ohne Providerkontakt.
  - Gegenprobe mit dem alten Handler: (N2) rot. Befund und Behebung: Backend `docs/booking-safety-finding-offer-reconciliation-order-2026-10.md`.
- **R2** (Backend #406):
  - Fail-closed-Passwortprüfung vor jeder Statusantwort. Ohne gültiges Passwort wortgleich 401 `INVALID_CREDENTIALS`; `NULL` und unbrauchbare Hashes ergeben 401 statt 500.
  - `tests/auth-status-codes.test.js` (Antwortmatrix, Quelltextanker) und `tests/sales-partner-program-pg.test.js` Fall 3b (PostgreSQL); Gegenprobe rot.
  - Laufzeitunterschiede zu unbekannten Adressen bewusst unverändert. Befund und Behebung: Backend `docs/security-finding-login-status-disclosure-2026-10.md`.
- **R3** (Frontend #482):
  - Die vier Aufrufe nutzen `/api/kunde/email-change`, `/api/kunde/email-change/resend` und `/api/auth/confirm-email-change`. Keine Alias-Routen.
  - Dauerhafter Vertragstest `src/api/emailChangeContract.test.mjs`: Methode, Pfad, Bearer; falsches Passwort meldet nicht ab, abgelaufene Sitzung schon.
  - Lokal integriert gegen ein Backend auf `origin/main` mit Wegwerf-PostgreSQL und Mail-Attrappe (keine E-Mail versendet). Das Backend antwortet auf den Start mit 202.
- **R4** (Backend #407):
  - Eine gemeinsame Funktion `commissionReference` für Portal und Gutschrift; die Abrechnungsquelle liest keine Auftragsnummer mehr.
  - Unverändert: historische Gutschriften, gespeicherte PDFs und Stornos (der Storno kopiert die Referenz des Originals), ebenso Nummernkreise, Abrechnungsregeln, Test- und Mandantentrennung.
  - PG-Fälle D2, F3 (Storno eines historischen Belegs behält CE-BS), F5 und P16; Gegenprobe rot außer F3.
  - Eine steuerliche oder rechtliche Freigabe ist nicht abgeleitet.
- **R7** (Frontend #481):
  - Die Buchungssperre beim Versicherungswechsel greift im selben Render wie die Auswahl.
  - Der Sortiertest wartet auf den fertig dargestellten Zustand. Gegenprobe deterministisch rot.
- **R9** (Frontend #483, Korrektur `4293b9b`):
  - Labels der Registrierung (auch beider Passwortfelder), Kontraste, zugängliche Namen von Nutzer-Chip und Kennzahlkarten, fokussierbare Tabellenbereiche, Touch-Ziele ≥ 44 px bei grober Zeigerführung.
  - Gutschriftslauf: Prozent ohne Umbruch; bei „Bereits ausgestellt“ nur ein Rest von exakt 0 als „—“, negative Reste bleiben sichtbar.
  - axe-core 4.14 lokal gegen acht Seiten: vorher 12 Verstöße und Ziele von 17–30 px, nachher 0 und 44 px.
  - Bewusst nicht geändert (damals ohne Entscheidung): die Kennzahl „Kunden“.
- **Kennzahl „Kunden“** (Backend #408, Frontend #484):
  - `GET /admin/metrics/customer-accounts` → `{ total }`: `role = 'customer'` und `prelive_test = false`, jeder Status.
  - Die Kontenliste `GET /admin/users` und ihre Pagination sind unverändert; Admin-Konten bleiben dort erreichbar.
  - `tests/admin-customer-metric-pg.test.js` (in `test:security-pg`); Gegenprobe mit der Listenregel rot.
  - Der erste Frontend-CI-Lauf von #484 war rot: Eine zweite E2E-Attrappe kannte den neuen Zähler nicht. Das war ein echter Fehler der Änderung, korrigiert in derselben PR.

### R5 — Admin-Rate-Limit: geprüft, keine Codeänderung erforderlich

- **Mechanik:** fester 15-Minuten-Zähler je Admin im Speicher des Prozesses; jede Anfrage zählt 1. Lesen und Schreiben haben getrennte Zähler (120 bzw. 60).
- **Last aus dem Code abgeleitet (geschätzt):**
  - Prüfung von zehn Partnern mit Rückweg zur Liste: etwa 83 Lesezugriffe; die Grenze erst bei etwa 15 Partnern in 15 Minuten.
  - Gutschriftslauf: drei Lesezugriffe, unabhängig von der Partnerzahl. Ausstellen begrenzt der Schreibzähler: bei mehr als etwa 55–60 ausstellbaren Partnern nach 15 Minuten fortsetzen, ohne Doppelausstellung.
- **Mehrfachanfragen:** keine StrictMode-Effekte, kein Polling, keine Retries. Nur der Pre-Live-Status wird je Unterseite neu geladen (etwa jeder achte Aufruf).
- **Auslöser des 429:** nur die automatisierte Messreihe der Gesamt-QA.
- **Empfehlung:** keine Änderung vor dem Go-Live. Falls je nötig, ein eigener Wert nur für diesen Zähler (240), keine pauschale Erhöhung auf 600; der Grund für das Limit (Schutz vor Abfluss von Abrechnungsdaten) bleibt bestehen.

### R6 — E-Mail-Betrieb: Read-only-Preflight für Coolify (offen)

Kein Codefix:

- **Pflichtwerte:** In Production bricht der Start ohne `RESEND_API_KEY`, `INVOICE_EMAIL_FROM` oder `INVOICE_EMAIL_REPLY_TO` ab.
- **`APP_BASE_URL`:** wird erst bei Benutzung geprüft:
  - E-Mail-Wechsel: kontrollierter Fehler.
  - Partnerlinks: entfallen.
  - Auftrags- und Sendungsmails: Rückfall auf `https://confidaraexpress.de`.
- **Absender:** Konto-, Partner- und Supportmails nutzen fest `noreply@confidaraexpress.de`.
- **Reset-Link:** Der feste Link `https://confidaraexpress.de/login?reset=` ist ein bewusster, per Test festgehaltener Vertrag (der Pfad `/login` erhält das Token).

Prüfschritte (Container-Terminal bzw. Coolify-Log, ohne Werte auszugeben, ohne Mail, ohne ENV-Änderung):

1. `NODE_ENV` ist `production`.
2. `test -n "$RESEND_API_KEY" && echo gesetzt`; ebenso `INVOICE_EMAIL_REPLY_TO`; von `INVOICE_EMAIL_FROM` nur die Domain ausgeben.
3. `APP_BASE_URL` entspricht genau der öffentlichen Frontend-URL (https, ohne Pfad und Schrägstrich am Ende).
4. `ADMIN_EMAIL` und `SUPPORT_NOTIFICATION_EMAIL` gesetzt, sonst existieren die festen Postfächer `admin@` und `support@confidaraexpress.de`.
5. `SALES_PARTNER_PRELIVE_TEST_MODE` und `SHIPMENT_EMAIL_WORKER_ENABLED` haben die beabsichtigten Werte.
6. Startlog ohne Pflichtvariablen-Abbruch und ohne Warnung zu `INVOICE_EMAIL_FROM`.
7. `GET /health` liefert `ok` (belegt nur die Datenbank, nicht den Mailversand).
8. Öffentliches DNS der Absenderdomain(s): SPF, DKIM (`resend._domainkey`) und DMARC vorhanden.
9. Resend-Dashboard: Absenderdomain(s) „Verified“.

Nebenbefunde (kein Blocker):

- Die ENV-Tabelle in Backend `docs/BACKEND_ARCHITECTURE.md` nennt nicht alle Mail-Variablen.
- `emailService.js` loggt an zwei Stellen die volle Empfängeradresse.
- Die Linkbildung folgt drei Mustern; für ein Staging zeigen einige Links auf die Produktion.

### R8 — Kundenlink: Testgrenze und Rauchtestplan (offen)

Kein Defekt.

- **Trennung:** Test- und Echtdaten sind in SQL, Datenbank-Fremdschlüsseln und Admin-Prüfungen getrennt; ein Testpartner-Code ordnet nie einen Kunden zu.
- **Lücke:** Nicht automatisiert geprüft sind
  - der durchgehende Weg mit echtem Browser gegen echtes Backend,
  - der Code eines inaktiven Partners,
  - die Kette Link → Registrierung → Sendung → Provision.
- **Zusatzbefund:** Ein Testpartner sieht im Portal seinen Kundenlink. In Production erzeugt dieser Link ein echtes, nicht zugeordnetes Konto; er darf dort nicht benutzt werden.

**Betreiberentscheidungen:** Referral-Schalter in Production; ein echter befreundeter Partner mit Vereinbarung 1.0 und ein echter befreundeter Kunde; Zeitpunkt nach dem Pre-Go-Live-Gate; Kundenfreischaltung; Provisionsschalter; Vorgehen bei Abbruch.

Ablauf:

1. Ausgangslage per Lese-SQL festhalten: Zuordnungen des Partners; die Kunden-E-Mail ist frei.
2. Der Partner kopiert den Kundenlink. Erwartet: `https://<Produktionsdomain>/register?ref=<8 Zeichen>`, Code wie im Admin-Partnerdetail.
3. Der Kunde öffnet ihn in einem frischen Browserprofil. Erwartet: `ref` aus der Adresse entfernt, Code lokal vorgemerkt.
4. Der Kunde registriert sich mit echten Daten. Erwartet: „Registrierung erfolgreich“, Konto `pending`, Vormerkung gelöscht.
5. Prüfen ohne Schreibzugriff: genau eine Zuordnung zum Partner, Quelle `referral_link`, Beginn heute, alle `prelive_test` = false; Kunde im Portal und im Admin-Partnerdetail sichtbar.
6. Reguläre Freischaltung (Geschäftsentscheidung).
7. Optional erst nach einer echten Sendung: Provisionsentscheidung und Ledger-Eintrag am Folgetag; auszahlbar erst nach bezahlter Rechnung.

Abbruch bei falscher Domain oder falschem Code, verbliebenem `ref`, fehlender oder falscher Zuordnung, 500 oder 409. Dann nichts löschen; eine Korrektur nur per auditierter Admin-Zuordnung nach Entscheidung.

Verboten: Fake-Echtkunden, Negativtests mit echten Konten, der Kundenlink eines Testpartners in Production, Datenlöschung, Schalteränderungen ohne Entscheidung.

### Weitere Entscheidungen und offene Punkte

- **Betreiberentscheidungen 2026-10-09:**
  - Gutschrift-Positionsreferenz `VP-<Ledger-ID>` (R4).
  - Kennzahl „Kunden“ nur echte Kundenkonten.
- **Nicht erforderlich:** die Anzeige des Betrags bereits ausgestellter Gutschriften im Gutschriftslauf (Betrag und PDF stehen im Partnerdetail).
- **Offen, kein Blocker:** eigener Text für abgelehnte Partneranträge (UX-Befund F18).
- **Bis zum Go-Live:**
  - Deployment (Backend vor Frontend) als eigene Freigabe;
  - R6-Preflight;
  - R8-Rauchtest nach Entscheidung;
  - Produktionsprüfung der umgesetzten Punkte.
