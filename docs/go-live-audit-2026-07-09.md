# ConfidaraExpress — Go-Live-Gesamtaudit (CTO-Audit)

**Datum:** 2026-07-09 · **Auditor:** Claude Code (read-only Audit, keine Code-Änderungen)
**Scope:** `confidaraexpress-preisrechner` (Frontend inkl. Adminpanel) + `confidaraexpress-api` (Backend/API/DB)
**Methode:** Vollständige statische Analyse der sicherheits-, buchungs- und DSGVO-kritischen Pfade, Endpunkt- und Feature-Inventar, Testlauf Backend (`npm test`), Testlauf + Produktions-Build Frontend, Git-Historien-Prüfung auf Secrets. Alle Befunde mit Datei:Zeile belegt. Keine Live-Requests gegen Produktion/JUMiNGO.

---

## 1. Executive Summary

ConfidaraExpress ist **deutlich reifer, als die eigene Projektdokumentation behauptet**. Der Buchungskern (`routes/jumingo.js`, 2 976 Zeilen) ist auf hohem Niveau abgesichert: serverseitige Preis-Reverifizierung, eindeutiges Tarif-Matching, Tarif-Limit- und PLZ/Land-Revalidierung, Preisdrift-Gates (409 `PRICE_CHANGED`), atomarer Idempotenz-Claim, Order-Readiness-Readback vor `POST /orders`, `success===true`-Prüfung, Orphan-Order-Alarm mit dauerhaftem Reconciliation-Signal, Rechnungserstellung in DB-Transaktion. Adminpanel und Audit-Logging sind sauber (Paginierung, per-Admin-Rate-Limits, idempotentes Mark-Paid mit `FOR UPDATE`, Delete-Guard, Anonymisierung mit Bestätigungsphrase, PII-arme Audit-Logs mit gehashter IP/UA). **Backend: 81/81 Testdateien grün. Frontend: 24/24 Tests grün, Produktions-Build fehlerfrei.**

Dem stehen **zwei Go-Live-Blocker** gegenüber:

1. **Das Kreditlimit wird bei der Buchung nicht mehr durchgesetzt** — die dokumentierte atomare Limit-Bedingung fehlt im Code, es gibt keinen DB-Constraint und keine Warn-E-Mail mehr. Jeder freigeschaltete Kunde kann unbegrenzt auf 7-Tage-Rechnung buchen; jede Buchung erzeugt eine echte, kostenpflichtige, irreversible JUMiNGO-Order.
2. **Der Passwort-Reset-Link aus der E-Mail ist funktional tot** — die Index-Route verwirft den `?reset=`-Query-Parameter beim Redirect, bevor die Login-Seite ihn lesen kann.

Dazu kommt ein **gravierender Doku-Drift**: Beide CLAUDE.md deklarieren den Dropoff-Guard und das fehlende Live-Buchungs-Gate als „nicht verhandelbar", während Code **und Tests** das Gegenteil erzwingen (Dropoff bucht scharf; `ALLOW_JUMINGO_LIVE_BOOKING` darf laut Test nicht existieren). Wer nach Doku arbeitet, „repariert" die Produktion kaputt.

**Fazit: Ich würde den Go-Live noch nicht freigeben.** Die Blocker sind klein (geschätzt 1–2 Personentage inkl. Verifikation), danach ist die Plattform go-live-fähig.

---

## 2. Gesamtbewertung (Ampel)

| Bereich | Ampel | Begründung (Kurzform) |
|---|---|---|
| Backend / Buchungskern | 🟡 | Exzellente Absicherung, aber P0 Kreditlimit-Durchsetzung fehlt |
| Frontend (Kundenportal) | 🟡 | Sehr sauber (kein console-Log, kein innerHTML, zentrale API-Schicht), aber P0 Reset-Link defekt |
| Adminpanel | 🟢 | Vollständig, paginiert, auditiert, defensiv; keine Blocker |
| API-Design | 🟢 | 34 Endpunkte, durchgehend Auth/Ownership/Validierung/Rate-Limits |
| Datenbank | 🟢 | Additive Migrationen, parametrisierte Queries, Cleanup-Jobs; Wachstum `label_url` mittelfristig |
| Deployment | 🟡 | `.dockerignore`/`npm ci`/Alpine ✓ (API); Frontend `npm install` + `latest`-Deps, nginx ohne Security-Header, kein Pool-Error-Handler |
| DSGVO (technisch) | 🟢🟡 | Starke Substanz (Anonymisierung, Cleanup, akkurate Datenschutzerklärung); Lücken dokumentiert (recipient/label bleiben) |
| DSGVO (organisatorisch) | ⚪ | Im Code nicht entscheidbar: AVV-Nachweise, VVT, Aufbewahrungskonzept, Audit-Log-Retention |
| Security | 🟢🟡 | Auth/AuthZ/SQLi/XSS/Brute-Force stark; Header-Lücken (static + nginx), Legacy-HTML-Dateien |
| Doku / Wartbarkeit | 🔴→🟡 | CLAUDE.md widerspricht Code bei zwei „nicht verhandelbaren" Guardrails — vor Go-Live korrigieren |
| **Gesamtprojekt** | **🟡** | **2 kleine P0-Blocker + Doku-Drift; danach freigabefähig** |

---

## 3. Feature-Inventory

### 3.1 Frontend-Routen (App.jsx)

| Route | Seite | Schutz | Lazy | Zustand |
|---|---|---|---|---|
| `/login`, `/register` | AuthPage (Login/Registrierung/Forgot/Reset) | öffentlich | ✓ | vollständig; Reset-Einstieg defekt (P0-2) |
| `/calculator` | CalculatorPage (im Dashboard-Layout) | JWT | ✓ | vollständig |
| `/tracking` | TrackingPage (öffentl. Tracking) | öffentlich | ✓ | vollständig |
| `/booking` | BookingPage | JWT | ✓ | vollständig; `PRICE_CHANGED`-Dialog vorhanden (BookingPage.jsx:376) |
| `/impressum` `/datenschutz` `/agb` `/widerruf` | Legal | öffentlich | ✓ | echte Inhalte, keine Platzhalter |
| `/dashboard` | DashboardPage (page-State: overview/new/shipments/invoices/profile/tracking) | JWT | ✓ | vollständig; Fehler-/Leer-/Ladezustände vorhanden |
| `/admin` + 7 Unterseiten | Adminpanel (Overview, Users, User-Detail, Shipments, Shipment-Detail, Invoices, Invoice-Detail, Audit-Logs) | JWT + AdminRoute (UX) + serverseitig `requireAdmin` | ✓ | vollständig |
| `/` und `*` | Redirect → `/dashboard` bzw. `/login` | — | — | **keine öffentliche Landingpage** (Feststellung, s. F-30) |

### 3.2 Backend-Endpunkte (34)

| Modul | Endpunkte | Auth | Rate-Limit | Validierung | Paginierung | Audit |
|---|---|---|---|---|---|---|
| `auth.js` | register, login, forgot-password, validate-reset-token, reset-password | öffentlich | ✓ alle, per `req.ip` | ✓ (E-Mail-Regex, PW 8–128, Feldlängen) | n/a | — |
| `kunde.js` | kundenbereich, shipments, invoices, PATCH profil, PATCH password | JWT | password: ✓ pro User | ✓ (Whitelist-Profilfelder, kein Mass-Assignment) | ✗ (F-11) | — |
| `admin.js` | 13 Endpunkte (Users/Status/Delete/Anonymize/Invoices/Paid/Audit-Logs/Shipments/Label/Tracking) | JWT+Admin | ✓ alle, pro Admin | ✓ (Whitelists, Kalender-Datumsprüfung) | ✓ (50/100) | ✓ (mutierend + PII-Zugriffe) |
| `jumingo.js` | calculate-price, book, reprice-insurance, label, tracking, tracking/public, carriers, access-points-search | JWT (außer tracking/public) | ✓ 6 von 8 (jumingo.js:1096,1485,2249,2467,2614,2940) | ✓ umfassend | n/a | — |
| `system.js` | /, /health, /health/detail | öffentlich / öffentlich / Admin | — | — | n/a | — |

### 3.3 Datenbank (db/init.js)

6 Tabellen: `users`, `shipments`, `invoices`, `password_resets`, `jumingo_delivery_date_stats`, `admin_audit_logs`. Nur additive Migrationen (`IF NOT EXISTS`), sinnvolle Indizes (Tracking-Sync partiell, Audit-Indizes), FK `ON DELETE SET NULL` für Audit-Nachweise, `payment_term`-Normalisierung auf 7. **Kein** CHECK/Trigger für `credit_used <= credit_limit` (→ P0-1).

### 3.4 Abgleich behaupteter Feature-Stand ↔ Code

| Behauptung | Befund |
|---|---|
| JUMiNGO, Label, Tracking, Rechnungen, 7-Tage-Rechnung, B2B, Versicherung, Referenznummer, Pickup | ✓ implementiert und getestet |
| **Dropoff** | ✓ bucht **scharf** über `buildShopRate` (jumingo.js:1722) — Guard wurde entfernt, Tests erzwingen die Entfernung (tests/book-dropoff-block.test.js:73–89). **Doku behauptet das Gegenteil** (→ P1-3) |
| Shopfinder | ✓ read-only Orientierungssuche (UI kommuniziert korrekt „keine verbindliche Shop-Auswahl") |
| Tracking-Mail | ⚠️ Es gibt **keine** separate Tracking-Mail; die Trackingnummer steht in der Buchungsbestätigung (emailService.js:114). Feature so nicht vorhanden — kein Defekt, aber Inventar-Korrektur |
| Adminpanel (alle 8 Seiten) | ✓ vollständig inkl. Audit, Anonymisierung, Delete-Guard, Mark-Paid |
| DSGVO-Anonymisierung | ✓ implementiert (admin.js:397–489, lib/anonymize.js) mit dokumentierten Restlücken (→ DSGVO) |
| Landingpage | ✗ existiert nicht — `/` leitet auf Login um; Sitemap führt `/login` als Hauptseite |

### 3.5 Toter Code / Altlasten

- `public/admin.html` (11,5 KB): **Legacy-Admin-UI**, wird produktiv via `express.static` ausgeliefert — parallel zum React-Adminpanel (F-6).
- `public/versand-test.html`: ruft `POST /api/jumingo/calculate-price` **ohne Token** auf (Zeile 366) — seit der Auth-Pflicht funktionslos; Dev-Relikt in Produktion (F-6).
- `sendTwoFactorEmail` (emailService.js:406): exportiert, von keiner Route aufgerufen — toter Code.
- `sendCreditLimitWarning`: existiert **nicht mehr** (Feature komplett entfernt, CLAUDE.md §6.4 überholt).
- Frontend-Repo-Wurzel: `prototype-*.png` (~1,7 MB), `prototype.html`, `screenshot-prototype.js`, `der-kurier.svg` (181 KB, nicht eingebunden) — Repo-Hygiene.
- `tariffId` im `/book`-Body: wird für eindeutiges Matching mitverwendet (jumingo.js:1602) — **kein** toter Parameter mehr (CLAUDE.md §7.3 überholt).

---

## 4. Workflow-Analyse (Phase 2)

| Workflow | Status | Befund |
|---|---|---|
| Registrierung → Freischaltung | ✓ | pending-Status, Eingangs- + Aktivierungsmail (nur bei echter Transition), klare UI-Meldungen |
| Login | ✓ | Status-Check, generische Fehlermeldungen, Remember-Me 30d; gesperrte Konten verlieren Zugriff **sofort** (auth.js prüft DB-Status pro Request) |
| **Passwort-Reset** | ✗ **P0-2** | Backend-Mail verlinkt `https://confidaraexpress.de?reset=TOKEN` (routes/auth.js:87). `App.jsx:74` leitet `/` per `<Navigate to="/login" replace/>` um und **verwirft den Query-String**; `AuthPage.jsx:57–66` liest `window.location.search` erst nach dem Mount auf `/login` → Reset-Formular erscheint nie. Statisch belegt; 5-Minuten-Live-Repro empfohlen. Fix: Reset-URL auf `/login?reset=` ändern (1 Zeile Backend) **oder** Index-Redirect den Query-String erhalten lassen |
| Preisrechner → Angebote | ✓ | Draft mit `user_id` persistiert, Filterkette intakt, `availableCarriers` vor Filtern berechnet |
| Buchung Pickup | ✓ | Ablauf s. §5; keine Sackgassen; Fehlerpfade geben Kredit + Claim frei |
| Buchung Dropoff | ✓ (scharf) | identischer Ablauf mit `buildShopRate`; UI kommuniziert Shopabgabe korrekt (DropoffNoticeModule.jsx:16–21) |
| Buchung ohne Router-State (Reload/Direktaufruf `/booking`) | ✓ | Fallback-Screen mit „Zum Preisrechner" (BookingPage.jsx:465–474) — keine Sackgasse |
| Doppelklick/Parallel-Buchung | ✓ | atomarer Claim `draft→booking` → 409 mit klarer Meldung (jumingo.js:1813–1820) |
| Tracking (privat/öffentlich) | ✓ | Ownership bzw. PII-armes öffentliches Subset; Lazy-Backfill der Tracking-Felder |
| Rechnungen (Kunde/Admin) | ✓ | 7 Tage aus `businessRules.js` (einzige Quelle), Mark-Paid idempotent+transaktional (admin.js:344–389) |
| Admin: Status/Anonymisierung/Delete | ✓ | idempotent, auditiert, Confirm-Phrase, Self-Delete/Self-Anonymize blockiert; **Self-Block möglich** (F-9) |
| Absturz zwischen Claim und Order | ⚠️ | `status='booking'` bleibt dauerhaft stehen (Kredit im none-Pfad ggf. reserviert); kein automatischer Ablauf/Job — Admin-Filter `status=booking` existiert, Runbook fehlt (F-7) |

---

## 5. Buchungskern `/book` — verifizierter Ist-Ablauf

Validierung (IDs, Referenznummer, Labelformat) → B2B-Gate Firmenprofil (jumingo.js:1530–1534) → **Ownership-Gate** Draft (1545–1551) → Adressauflösung Body→Draft + Validierung → Versanddatum ausschließlich aus Draft (1586–1591) → **Rates#1 = serverseitige Preisverifizierung** + eindeutiges Tarif-Matching (1594–1610) → Tarif-Limit-Revalidierung gegen Draft-Maße (1629–1649) → PLZ/Land-Revalidierung V1 (1679–1687) → Telefonpflicht → Zoll-Gate (serverseitig aus Ländercodes, 1705–1715) → Preisdrift-Gate 409 `PRICE_CHANGED` (1783–1790) → Kreditverbuchung (**ohne Limit-Prüfung — P0-1**, 1793–1801/1975–1984) → atomarer Claim (1813) → PUT mit vollem UpdateShipment-Payload, **Fehler wird geprüft** (1857–1863) → [Versicherungspfad: Claim früh, PUT, Rates#2, Split Variante C, Drift-Gate] → **Readback-GET + `evaluateOrderReadiness`** (1999–2027) → `POST /orders` dual-key `sammelrechnung`, `success===true`-Pflicht (2060–2077) → DB-Transaktion Shipment+Invoice (2107–2137) → bei DB-Fehler nach Order: **Orphan-Alert** + `status='booking'` als Signal (2128–2135) → Mails fire-and-forget.

Die „heilige" Preisformel `calculateCustomerPrice` ist unverändert (Margin→Rundung→MwSt→Rundung), wird an beiden Stellen genutzt, `pricing.test.js` grün; **kein** künstliches Tarif-Limit (kein slice/limit auf Tarif-Arrays); Versicherung: JUMiNGO ist alleinige Preisquelle, Client-Preise werden nie übernommen.

---

## 6. Findings (nummeriert, mit Beleg)

### P0 — Go-Live-Blocker

**F-1 · Kreditlimit wird bei Buchung nicht durchgesetzt** · Korrektheit/Finanzrisiko
`routes/jumingo.js:1793–1801` (none-Pfad) und `:1975–1984` (Versicherungspfad): `UPDATE users SET credit_used = credit_used + $1 WHERE id = $2` — die in CLAUDE.md §6.2/§15 als unantastbar dokumentierte Bedingung `AND (credit_limit - credit_used) >= $1` **fehlt**. `credit_limit` kommt in keiner Routen-Datei außer als Anzeige vor; `db/init.js` hat keinen CHECK/Trigger; `sendCreditLimitWarning` (80 %-Warnung) existiert nicht mehr im Code. Konsequenz: unbegrenztes Forderungsrisiko pro Kunde bei 7-Tage-Rechnungskauf, gedeckelt nur durch das Buchungs-Rate-Limit (10/15 min) — nicht durch Beträge. **Entscheidung nötig:** bewusste Betreiber-Entscheidung (dann dokumentieren + Forderungs-Monitoring) oder Wiederherstellung der WHERE-Bedingung (kleiner, gut testbarer Eingriff in die Zahlungslogik — nur mit expliziter Freigabe gemäß Guardrail).

**F-2 · Passwort-Reset-Link aus E-Mail funktioniert nicht** · Kern-Workflow
Beleg und Fix siehe §4 (Zeile „Passwort-Reset"). Betroffen: jeder Kunde, der sein Passwort vergisst — er landet kommentarlos auf dem Login. Fix-Aufwand: 1 Zeile (`routes/auth.js:87` → `/login?reset=`) oder Query-Erhalt im Index-Redirect (`App.jsx:74`).

### P1 — zwingend vor Go-Live

**F-3 · Doku widerspricht Code bei „nicht verhandelbaren" Guardrails** · Wartbarkeit/Betriebsrisiko
Beide CLAUDE.md (Repo-Root + `confidaraexpress-api/CLAUDE.md` §0/§7.0) fordern: Dropoff-Guard aktiv lassen, Live-Gate `ALLOW_JUMINGO_LIVE_BOOKING` fehlt noch (Paket C). Tatsächlich: Dropoff bucht scharf, das Gate-Konzept wurde **bewusst entfernt** und `tests/book-dropoff-block.test.js:73–89` sowie `book-dropoff-test-mode.test.js:89` **erzwingen die Abwesenheit** dieser Strings im Code. Auch der Kommentar `jumingo.js:252–257` („VORBEREITET, NICHT AKTIV … Guard lehnt weiterhin ab") ist falsch. Zusätzlich überholt: §6.2 (Kreditmuster), §6.3/6.4 (Mark-Paid-Idempotenz behoben, Warnung entfernt), §7.1/7.2 (PUT-Fehler wird geprüft, releaseCredit-Matrix), §8.5 (Rate-Limiter nutzt `req.ip` + trust proxy, Memory-Sweeper existiert), §9.3 (Draft-/Reset-Cleanup existiert: db/cleanup.js), §10 (Welcome-Mail/2FA/Kreditwarnung), §11 (.env.example existiert), §12 (.dockerignore existiert, npm ci, alpine), Frontend-CLAUDE.md („10 Routen", alte Branches). **Reines Doku-Update, kein Code** — aber vor Go-Live, sonst „repariert" die nächste Session die Produktion kaputt.

**F-4 · Kein `pool.on('error')`-Handler** · Betrieb/Recovery
`db.js:1–16`: Ein Fehler auf einer idle-Connection emittiert ein unbehandeltes `error`-Event auf dem pg-Pool → Prozess-Crash; einzige Recovery ist die Container-Restart-Policy. Eine Zeile Handler + Log genügt. (Empfehlung, kein Eigenmächtiger Eingriff.)

**F-5 · Betriebs-Runbook für `status='booking'`-Waisen fehlt** · Betrieb
Crash/Timeout zwischen Claim und Order-Antwort lässt Sendungen dauerhaft in `booking` (Kredit im none-Pfad reserviert). Orphan-Alert (emailService.js:368) deckt nur den DB-Fehler **nach** platzierter Order. Nötig: dokumentierter Check (Admin-Filter `status=booking` + Alter) und manuelle Auflösungs-Anweisung (Kredit freigeben/Claim zurücksetzen bzw. Order in JUMiNGO verifizieren). Reines Doku-/Betriebsartefakt.

### P2 — kurzfristig nach Go-Live (oder davor, wenn günstig)

**F-6 · Legacy-Dateien produktiv ausgeliefert** — `public/admin.html` (Parallel-Admin-UI) und `public/versand-test.html` (ruft auth-pflichtiges calculate-price ohne Token, Zeile 366 → funktionslos). Entfernen; reduziert Angriffs-/Verwirrungsfläche.
**F-7 · Security-Header-Lücken** — (a) `server.js:24–27`: `express.static` liegt **vor** der Security-Middleware → statische Dateien ohne `X-Frame-Options`/`nosniff`; (b) Frontend-`nginx.conf`: keinerlei Security-Header (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy) und kein gzip; (c) API-Header-Satz minimal (kein HSTS/Referrer-Policy; `X-XSS-Protection` deprecated). HSTS ggf. am TLS-Proxy — verifizieren.
**F-8 · E-Mail-HTML-Injection** — `emailService.js` interpoliert Nutzerdaten unescaped in HTML (z. B. `contactName`/`company` :244–246, :288–290; Adressen :127–131,155). Empfänger ist überwiegend der Verursacher selbst → begrenztes Risiko, aber vor Skalierung zentralen `escapeHtml`-Helper einziehen.
**F-9 · Admin-Self-Block möglich** — `admin.js:184–227` verhindert nur Self-Delete/-Anonymize; ein (einziger) Admin kann sich selbst auf `blocked` setzen und sperrt sich sofort aus (auth.js prüft Status pro Request); Recovery nur per DB.
**F-10 · Frontend-Build nicht reproduzierbar** — `package.json` nutzt `"latest"` für react/vite/etc. und das Dockerfile `npm install` (statt `npm ci`): jeder Image-Build kann andere Major-Versionen ziehen (Supply-Chain-/Stabilitätsrisiko). Lockfile existiert → auf `npm ci` + gepinnte Versionen umstellen.
**F-11 · Keine Paginierung auf Kundenrouten** — `kunde.js:21–46` liefert alle Sendungen/Rechnungen; wächst mit Buchungsvolumen (Admin ist paginiert).
**F-12 · `label_url` als Base64 in TEXT-Spalte** — 100–500 KB pro Buchung, kein Archiv/Objekt-Storage (dokumentiert); mittelfristig auslagern; DSGVO-relevant, da PDFs volle Adressen enthalten und von der Anonymisierung ausgenommen sind.
**F-13 · Kein externes Monitoring/Alerting definiert** — `/health` existiert (öffentlich, DB-Check), aber kein Uptime-Monitor/Alert dokumentiert; Logs unstrukturiert ohne Request-IDs (dokumentierte Architekturgrenze). Minimal: externen Monitor auf `/health` + Alarmkanal.
**F-14 · DSGVO-Restlücken der Anonymisierung dokumentieren/terminieren** — `admin.js:391–396` + `lib/anonymize.js:5–7`: `recipient_address`, `label_url` (PDF mit Klaradressen), Tracking-/Order-/JUMiNGO-IDs und `invoices` bleiben bewusst unangetastet („Aufbewahrungsfrist offen"). Steuerliche Aufbewahrung (invoices) ist vertretbar — aber ein schriftliches Aufbewahrungs-/Löschkonzept inkl. späterem Scrub-Job für Label/Empfängerdaten fehlt.

### P3 — Nice-to-have / Hygiene

**F-15** CORS-Allowlist enthält `http://localhost:5173/3000` in Produktion (`middleware/cors.js:4`) — mit Bearer-Auth risikoarm, dennoch entfernen. · **F-16** Registrierung enumeriert E-Mails (409 „bereits registriert", auth.js:48); Login verrät Freigabestatus (auth.js:63) — bewusster UX-Tradeoff, rate-limitiert. · **F-17** Kein per-Account-Lockout (nur IP-Limits). · **F-18** In-Memory-Rate-Limiter/Carrier-Cache = Single-Instance-Design (dokumentiert; bei Coolify-Single-Container ok). · **F-19** Hartkodierte Domains/Adressen (Reset-URL auth.js:87, Dashboard-Links, `info@confidaraexpress.de` in JUMiNGO-Payloads) → ENV-Konfiguration. · **F-20** `jumingo_shipment_id` ohne UNIQUE-Index (db/init.js:110, „nicht belegt") — Claim-Muster theoretisch mehrzeilig. · **F-21** Kein Index auf `shipments.user_id`/`invoices.user_id` (Kundenlisten = Seq-Scan). · **F-22** E-Mail-Empfängeradressen im Klartext in Server-Logs (`emailService.js:225,269,308,337,362`) — Datenminimierung. · **F-23** `.env.example` unvollständig (`JUMINGO_ORDER_PAYMENT_METHOD`, `TRACKING_SYNC_ENABLED`, `DEBUG_*` fehlen). · **F-24** Kundenkredit (Limit/Verbrauch) wird dem Kunden nirgends angezeigt (nur Admin) — relevant, sobald F-1 wieder durchgesetzt wird. · **F-25** Kunden sehen eigene 72h-Drafts in der Sendungsliste (kein Filter; Cleanup nach 72 h) — kleine UX-Unschärfe. · **F-26** `admin_audit_logs` ohne Retention-Regelung (unbegrenztes Wachstum; Speicherbegrenzungs-Grundsatz). · **F-27** `EU_COUNTRIES` ohne Sonderterritorien (XI, Kanaren …) — dokumentiert (businessRules.js:20–22). · **F-28** Formular-Labels: nur 1–3 `htmlFor`/`aria-label` in Booking-/NewShipment-Formularen (visuelle Labels ohne Zuordnung) — punktueller a11y-Nachbesserungsbedarf; sonst gute Basis (121 aria-Attribute, 0 `img` ohne `alt`). · **F-29** Prototype-Artefakte (~1,7 MB) + `der-kurier.svg` (181 KB) im Frontend-Repo. · **F-30** Keine öffentliche Landingpage — `/` → Login; Sitemap führt `/login` als Primärseite; „Tracking-Mail" existiert nicht als separates Feature (Trackingnummer in Buchungsmail). Beides ggf. bewusst — dann so dokumentieren. · **F-31** `sendTwoFactorEmail` toter Code. · **F-32** `content`-Feld im `/book` validiert, aber ungenutzt (dokumentierter Platzhalter).

---

## 7. DSGVO

### Technisch belegt (Code)

| Aspekt | Befund |
|---|---|
| PII-Speicherorte | `users` (Konto+Firmenadresse), `shipments.sender_address/recipient_address` (JSONB, Dritt-PII), `shipments.label_url` (PDF mit Klaradressen), `invoices` (Name via Join), `admin_audit_logs` (nur IDs + SHA-256-Hash von IP/UA — kein Klartext, lib/audit.js:42–46) |
| Datenminimierung | ✓ stark: Admin-Listen PII-arm mit maskierten IDs (lib/mask.js), Audit-Metadata-Whitelist (lib/audit.js:20–28), öffentliche Tracking-Route liefert nie Adressen (jumingo.js:2625–2636), Logs maskieren Tracking-Keys |
| Speicherbegrenzung | ✓ Drafts (inkl. Fremd-PII) nach 72 h gelöscht, Reset-Tokens bereinigt (db/cleanup.js, alle 6 h) · ✗ offen: label_url, Audit-Logs, recipient_address nach Anonymisierung |
| Löschung/Anonymisierung | ✓ Delete-Guard (409 bei abhängigen Daten) + In-place-Anonymisierung: Tombstones für users + sender_address + reference_number, password_resets gelöscht, unbrauchbarer PW-Hash, JWT-Invalidierung, idempotent, auditiert (admin.js:397–489) · Restlücken bewusst dokumentiert (F-14) |
| Auskunft (Art. 15) | kein Self-Service-Export; via Adminpanel manuell möglich (organisatorischer Prozess nötig) |
| Frontend-Speicher | ausschließlich `localStorage.ce_token`; **keine Cookies, keine Tracker, keine externen CDNs/Fonts** (Fonts lokal, index.html ohne Dritt-Ressourcen) → kein Cookie-Banner erforderlich; Datenschutzerklärung sagt exakt das (DatenschutzPage.jsx:118) |
| Datenschutzerklärung ↔ Code | konsistent: Hetzner (AVV), JUMiNGO (AVV), Resend, localStorage-JWT, HTTPS — keine Widersprüche gefunden |
| Drittempfänger | JUMiNGO (Adressen, Maße, Zoll-/Versicherungsdaten), Resend (Mailinhalte inkl. Adressen in Buchungsbestätigung), Hetzner (Hosting) |

### Organisatorisch zu klären (nicht im Code entscheidbar)

AVV-Nachweise Hetzner/JUMiNGO/Resend tatsächlich geschlossen? · Verarbeitungsverzeichnis (Art. 30) · Aufbewahrungs-/Löschkonzept (invoices 10 J., label_url/recipient_address nach Anonymisierung, Audit-Log-Retention) · Prozess für Auskunfts-/Löschersuchen (wer, wie schnell, über Adminpanel) · TOM-Dokumentation · Resend-Region/Drittlandtransfer verifizieren.

---

## 8. Security-Zusammenfassung

**Stark (belegt):** JWT + DB-Status-Recheck pro Request (Sperre wirkt sofort, middleware/auth.js:14–29) · Token-Invalidierung nach Passwortänderung (`password_changed_at` vs. `iat`) · bcrypt Cost 12 · Rollen-Guard serverseitig auf jeder Admin-Route · Ownership-Checks auf allen Kundenressourcen (Label jumingo.js:2470–2472, Tracking :2566, Book-Draft :1545, Reprice :2308) · SQL durchgehend parametrisiert, Spalten-Whitelists (kunde.js:54–111) · kein `dangerouslySetInnerHTML`/`eval`, kein console-Logging im Frontend · Rate-Limits auf allen Auth-, Buchungs- und teuren Endpunkten (korrekt über `req.ip` + `trust proxy 1`, Memory-Sweeper vorhanden) · CSRF-arm (Bearer-Header, keine Cookie-Auth) · keine Secrets im Code oder in der Git-Historie beider Repos · Enumeration-Schutz bei forgot-password · Reset-Tokens: 32-Byte-crypto, 15 min, Einmalverwendung.
**Lücken:** F-7 (Header static/nginx), F-6 (Legacy-HTML), F-8 (Mail-HTML-Escaping), F-15–F-17 (P3).

---

## 9. Codequalität & Architektur

Klare Modultrennung (Routes/Middleware/lib/services/config; Frontend: pages/components/api/utils) · zentrale Businessregeln (`businessRules.js`) · zentrale API-Schicht mit einheitlichem 401/403-Handling (client.js/adminApi.js, allowlisted Query-Params) · außergewöhnlich hochwertige, begründende Kommentare im Backend · Tests: 81 Backend-Dateien (Buchung, Preise, Filter, Admin, Anonymisierung, Rate-Limiter, Tracking) — Muster „Inline-Kopie der Logik + Source-Assertions gegen jumingo.js": pragmatisch, mit bekanntem Drift-Risiko, das durch die Source-String-Assertions teilweise selbst abgesichert wird · Schwächen: `jumingo.js` als 3 000-Zeilen-Monolith (bewusste Entscheidung, gut navigierbar), bewusste Read-only-Spiegelungen (`selectLabelDocument` etc. in admin.js — dokumentiert), CLAUDE.md-Drift (F-3), Frontend-Dependencies ungepinnt (F-10).

---

## 10. Go-Live-Readiness & priorisierte To-do-Liste

### Vor Go-Live (zwingend)
1. **F-1** Kreditlimit: Betreiber-Entscheidung + (empfohlen) atomare Limit-Bedingung wiederherstellen — mit Tests (P0)
2. **F-2** Passwort-Reset-Link reparieren (1-Zeilen-Fix + Repro-Test) (P0)
3. **F-3** CLAUDE.md/Kommentare auf den echten Stand bringen (Dropoff scharf, Gate entfernt, behobene Grenzen) (P1)
4. **F-5** Runbook „hängende `booking`-Sendungen" + Orphan-Prozess dokumentieren (P1)
5. **F-4** `pool.on('error')`-Handler (P1, eine Zeile)

### Kurz nach Go-Live
6. **F-6** `admin.html`/`versand-test.html` entfernen · 7. **F-7** Security-Header (nginx + static-Reihenfolge bzw. Header am Proxy) + gzip · 8. **F-10** Frontend-Deps pinnen + `npm ci` · 9. **F-13** Uptime-Monitoring auf `/health` + Alarmkanal · 10. **F-8** `escapeHtml` in Mail-Templates · 11. **F-9** Self-Block des letzten Admins verhindern · 12. **F-14** Aufbewahrungs-/Löschkonzept schriftlich; DSGVO-Organisationspunkte (§7)

### Nice-to-have
Paginierung Kundenrouten (F-11) · Label-Storage extern (F-12) · Indizes user_id (F-21) · Konfigurierbare URLs (F-19) · CORS localhost raus (F-15) · Kredit-Anzeige im Kundenportal (F-24) · Draft-Filter Sendungsliste (F-25) · Audit-Retention (F-26) · a11y-Labels (F-28) · Repo-Hygiene (F-29) · Landingpage-Entscheidung (F-30)

---

## 11. Verifikation

| Prüfung | Ergebnis |
|---|---|
| Backend `npm test` (tests/run.js) | **81 bestanden, 0 fehlgeschlagen** |
| Frontend `npm test` (node --test) | **24 bestanden, 0 fehlgeschlagen** |
| Frontend `npm run build` (Vite) | **erfolgreich**, größter Chunk 258 KB (82 KB gzip), alle Pages lazy |
| Git-Historie `.env` (beide Repos) | keine Secrets committet (Frontend-`.env` enthält bewusst nur `VITE_API_URL`) |
| Live-Verhalten (Reset-Link, Header am Proxy, HSTS) | **nicht** live verifiziert — statische Analyse; Repro empfohlen |

---

## 12. Abschlussurteil

> **„Ich würde den Go-Live noch nicht freigeben."**

Begründung: Zwei kleine, aber harte Blocker — (1) die Plattform bucht echte, kostenpflichtige, irreversible JUMiNGO-Orders auf 7-Tage-Rechnung, ohne das Kreditlimit der Kunden durchzusetzen (unbegrenztes Forderungsrisiko, keinerlei Warnung), und (2) der Passwort-Reset — ein Kern-Workflow für echte Geschäftskunden — ist über den einzigen ausgelieferten Weg (E-Mail-Link) funktional tot. Beides ist in Summe in 1–2 Personentagen inklusive Tests behebbar. Zusammen mit dem Doku-Drift-Fix (F-3) und einem minimalen Betriebs-Runbook (F-5) ist ConfidaraExpress danach aus technischer Sicht produktionsreif: Der Buchungskern, das Adminpanel, die Sicherheitsarchitektur und die DSGVO-technische Substanz sind überdurchschnittlich solide und vollständig getestet.

*Dieses Audit hat keinerlei Quellcode verändert. Alle Feststellungen sind mit Datei:Zeile belegt und gegen den Stand des Branches `claude/confidara-express-audit-05pov6` (identisch mit `main`, Arbeitsbaum sauber) erhoben.*

---

## Addendum — Zweiter Prüfdurchgang (gleicher Tag)

**Baseline-Verifikation:** Beide Repos seit dem ersten Durchgang unverändert (nur die Audit-Report-Commits obenauf; `main` unverändert; Arbeitsbäume sauber). Alle Befunde F-1 bis F-32 bleiben unverändert gültig.

**Zusätzlich vollständig gelesen (im ersten Durchgang nur pattern-geprüft):**

| Bereich | Ergebnis |
|---|---|
| `services/trackingSync.js` (komplett) | ✅ Vorbildlich: Advisory-Lock (Key 528491), Circuit-Breaker (5 Fehler in Folge), Batch-/Freshness-/MaxAge-Kappung, `ORDER BY last_tracked_at NULLS FIRST` (kein Verhungern), schreibt **nie** `shipments.status`, maskiertes Logging, wirft nie. Terminale Status (delivered/expired) werden nicht erneut gepollt |
| `AdminShipmentDetailPage.jsx` (komplett) | ✅ PII standardmäßig eingeklappt mit Protokollierungs-Hinweis (Z. 214, 425–447), Label-Download nur nach Bestätigungsdialog mit korrektem ARIA (`role="dialog"`, `aria-modal`, Z. 514–537), `isHttpUrl`-Guard gegen `javascript:`-Links (Z. 36), nur minimierte Tracking-Felder im State, maskierte IDs, saubere 404-/Fehler-/Ladezustände |
| `AdminUserDetailPage.jsx` (Kernpfade) | ✅ Type-to-confirm-Modals für Anonymisierung (exakte Eingabe `ANONYMIZE_USER`, Z. 196–206) **und** harte Löschung; Delete-Guard-409 wird als erwarteter Ausgang mit Handlungsanweisung („Anonymisierung verwenden") dargestellt |
| `OfferCard.jsx` / `OffersList.jsx` (Dropoff-Darstellung) | ✅ Dropoff = „Shopabgabe" (Z. 38, 155–156), Abgabestelle wird angezeigt, read-only „Paketshop finden" nur bei Dropoff (Z. 336–341) — keine irreführenden Texte, konsistent mit dem scharfen Backend-Verhalten |
| `AGBPage.jsx` / `WiderrufPage.jsx` (Inhalt) | ✅ Substanzielle B2B-Texte (AGB mit 52 §-Verweisen inkl. „Kein Widerrufsrecht"; Widerruf korrekt: kein gesetzliches Widerrufsrecht für Unternehmer i. S. d. § 14 BGB). Keine Platzhalter. Juristische Vollständigkeit = organisatorische Prüfung |
| `TrackingPage.jsx` | ✅ nutzt bewusst den öffentlichen Endpunkt (`/api/tracking/public/…`) — dokumentierte Architekturentscheidung |
| `public/admin.html` (Endpunkt-Inventar) | Bestätigt F-6: ruft nur `/login`, `/admin/users`, `/admin/invoices` — kennt die neueren Admin-Endpunkte nicht → veraltetes Legacy-Duplikat ohne Rechte-Umgehung (Server-Auth greift), aber entfernen |

**Ergänzung zu F-23:** Auch `TRACKING_SYNC_INTERVAL_MS` / `TRACKING_SYNC_BATCH_SIZE` / `TRACKING_SYNC_MIN_AGE_MS` / `TRACKING_SYNC_MAX_AGE_DAYS` fehlen in `.env.example`.

**Konsequenz:** Keine neuen P0/P1/P2-Befunde. Das Urteil des Hauptberichts — **„Go-Live noch nicht freigeben"** bis zur Erledigung von F-1, F-2, F-3, F-4, F-5 — bleibt unverändert bestehen; die Positivliste wird um die oben genannten Punkte erweitert.
