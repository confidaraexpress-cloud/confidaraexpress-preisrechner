# ConfidaraExpress Frontend — Arbeitsanweisung für Claude Code

> Steuert, wie Claude in diesem Frontend-Repository arbeitet.
> Ersetzt kein Code-Review. Im Zweifel: erst verifizieren oder fragen, nie raten.

---

## Mission & oberste Priorität

ConfidaraExpress ist eine Versandplattform mit Preisrechner und Buchung über
externe Carrier (Jumingo-Integration). Dieses Repo ist das **Frontend** (React + Vite).

**Höchste Priorität: zuverlässige, korrekte Buchungen über ConfidaraExpress.**
1. Buchungen funktionieren end-to-end — für **Abholung/Pickup** *und* **Paketshop/Dropoff**.
2. **Jumingo-Parität** ist kritisch: Felder, Werte und Abläufe müssen exakt dem
   entsprechen, was das Backend/Jumingo erwartet.
3. Auth-, Zahlungs- und Preisanzeige bleiben korrekt und konsistent.

Funktionierende Buchungen schlagen jede Eleganz und jeden Refactor.

## Arbeitsweise

- **Erst analysieren, dann ändern.** Relevante Komponenten/Styles/API-Aufrufe lesen
  und Datenfluss verstehen, bevor du etwas änderst.
- **Keine Annahmen** über bestehende Komponenten, CSS-Klassen oder API-Responses —
  im Code verifizieren oder fragen.
- **Kleine, kontrollierte Änderungen.** Eine Aufgabe = ein klar umrissener Eingriff.
- **Keine unnötigen Refactorings.** Funktionierende Logik/Optik nicht „nebenbei" umbauen.
- **Bestehende UI-/UX-Sprache fortführen**, nicht neu erfinden.
- **Abschlussbericht** am Ende jeder Aufgabe (Format unten).

## Kritische Guardrails (nicht verhandelbar)

- **Frontend ersetzt keine serverseitige Prüfung.** Preis-, Tarif-, Auth-, Zahlungs-
  und Buchungsvalidierung passieren im Backend — das Frontend prüft sie nie ersatzweise.
- **Preise/Tarife im Frontend nur anzeigen**, niemals als Quelle der Wahrheit behandeln.
- **Keine geratenen Jumingo-Daten:** Felder, Tarife, `serviceType`, `pickup`/`dropoff`,
  Access-Point-/Paketshop-Daten nicht erfinden — nur belegte Werte verwenden.
- **API nur über `src/api/client.js`** — keine verstreuten fetch/axios-Aufrufe.
- **Auth-State nur über `AuthContext`** — keine parallele Auth-Logik; bestehende
  Fehlerbehandlung für Auth/`sessionExpired` nicht beschädigen.
- **Secrets** bleiben in `.env` (nur `VITE_`-Variablen sind clientseitig sichtbar).

### Dropoff/Paketshop-Guardrail (zwingend)

Dropoff/Paketshop darf im UI **nicht** so dargestellt werden, als sei eine verbindliche
Buchung möglich, wenn der **Backend-Guard dies noch blockiert**. Wenn das Backend eine
Dropoff-Buchung blockiert, muss das Frontend diese Realität respektieren. **Keine
UI-Texte, die dem tatsächlichen Backend-Verhalten widersprechen.** Bei Unklarheit über
Felder/Übergabe: stoppen, Analyse liefern und nachfragen.

---

## Tech-Stack

- React + Vite (JavaScript)
- React Router (`react-router-dom`)
- Auth über `AuthContext` (Context API)
- API-Kommunikation **zentral** über `src/api/client.js`
- Styling: CSS (`src/styles/`)
- Icons: `lucide-react`

## Projektstruktur (`src/`)

- `api/`        — API-Client (`client.js`); alle Backend-Aufrufe laufen hierüber
- `components/` — wiederverwendbare UI (`auth/`, `common/`, `dashboard/`, `layout/`, `ui/`)
- `pages/`      — Seiten (Route-Ziele)
- `routes/`     — Routing-Bausteine (z. B. `ProtectedRoute`)
- `context/`    — React-Context (u. a. `AuthContext`)
- `styles/`     — CSS
- `utils/`      — Hilfsfunktionen (`formatters`, `countries`, …)
- `assets/`     — Bilder, Carrier-Logos, statische Dateien

## Frontend-Regeln

1. Erst analysieren, dann ändern.
2. Keine Annahmen über Komponenten, CSS-Klassen oder API-Responses.
3. Bestehende UI-/UX-Sprache fortführen, nicht neu erfinden.
4. Keine unnötigen Refactorings.
5. Kleine, kontrollierte Änderungen.
6. API-Aufrufe bevorzugt über `src/api/client.js`.
7. Auth-State über `AuthContext`, keine parallele Auth-Logik.
8. Preise/Tarife nur anzeigen, nie als Quelle der Wahrheit.
9. Bestehende Fehlerbehandlung für Auth/`sessionExpired` nicht beschädigen.
10. Responsive Verhalten immer mitdenken.
11. Mobile-first, Premium-Look, klare Struktur, viel Whitespace, professionelle Optik.
12. Keine visuellen Schnellschüsse, die Angebotskarten, Buchungsflow oder Dashboard
    inkonsistent machen.

## Verifikation bei Änderungen

1. Zuerst die `package.json`-Scripts dieses Repos prüfen.
2. Bei **Code-/CSS-/UI-Änderungen** mindestens `npm run build` ausführen (falls
   vorhanden) und Ergebnis berichten; vorhandene `lint`/`test`/`check`-Scripts passend
   mitlaufen lassen.
3. Sind keine passenden Tests vorhanden, das **im Abschlussbericht klar melden** —
   keine Test-Frameworks erfinden.
4. **Keine echten Buchungen/Jumingo-Orders** über die laufende UI auslösen; keine
   Produktionsdaten verändern ohne ausdrückliche Freigabe.
5. Bei **reiner Markdown-/Doku-Änderung** genügt `git diff --check` plus `git status`;
   kein Build nötig.

---

## Abschlussbericht (Pflicht am Ende jeder Aufgabe)

1. **Aktueller Branch**
2. **Git-Status vorher / nachher**
3. **Geänderte Dateien** (Liste)
4. **Genaue technische Änderungen** (was, warum)
5. **Bewusst nicht geänderte Bereiche**
6. **Auswirkungen** auf: Frontend · Backend · Jumingo · Auth · Zahlung · Sicherheit
   (jeweils „keine", falls zutreffend)
7. **Verifikation:** ausgeführte Tests/Build/Syntaxchecks **mit Ergebnis** (oder
   Hinweis, dass keine vorhanden sind)
8. **Risiken / offene Punkte / Annahmen**
9. **Commit-Hash** (falls ein Commit erstellt wurde)
10. **PR-Status** (falls relevant)
11. **Konkrete nächste Empfehlung**
