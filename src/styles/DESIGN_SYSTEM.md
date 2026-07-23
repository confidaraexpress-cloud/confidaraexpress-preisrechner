# ConfidaraExpress — Design Foundation

Kleine, **additive** Design-Basis (PR 1). Sie führt ein konsolidiertes
Token-/Primitive-Fundament ein, **ohne** bestehende Seiten optisch zu migrieren.
Architektur: **gemeinsame Basis + seitentyp-spezifische Varianten** — die
Übersicht bleibt repräsentativer/atmosphärischer, Daten-/Formular-/Buchungs-/
Adminseiten erhalten später ruhigere Varianten derselben Designsprache.

## 1. Tokens (`src/styles/tokens.css`)

Ein einziges `--ce-*`-System auf `:root`, importiert nach `variables.css`, vor
den Komponentenstyles. Die Werte **aliasen** zunächst die bestehenden realen
Farben/Schatten/Radien (`var(--navy)`, `var(--blue2)`, `var(--border)` …) — es
entsteht **keine neue Markenpalette und keine sichtbare Änderung**.

- Flächen: `--ce-bg-page`, `--ce-bg-page-soft`, `--ce-surface(-raised/-muted)`
- Text: `--ce-text`, `--ce-text-muted`, `--ce-text-subtle`, `--ce-text-inverse`
- Rahmen: `--ce-border`, `--ce-border-strong`
- Primär: `--ce-primary(-hover/-soft)`
- Semantik: `--ce-success/-warning/-danger/-info` (+ `*-soft`)
- Fokus: `--ce-focus`
- Schatten: `--ce-shadow-sm/-md/-lg` · Radien: `--ce-radius-sm/-md/-lg`
- Abstände: `--ce-space-1..8` (4px-Skala)

## 2. Seitentyp-Varianten (Gerüst)

`.ce-theme-{overview|data|form|decision|confirmation|admin}` setzen nur
`--ce-page-background`. **In diesem PR nicht auf Seiten ausgerollt** — sie
definieren die spätere abgestufte Hintergrundstrategie an einer Stelle. Es wird
**keine zweite Background-Komponente** gebaut; `PremiumBackground`/
`VaporBackground` bleiben unverändert.

## 3. Surface-Tokens & -Utilities

Gemeinsames Oberflächenmodell: `--ce-card-*` und `--ce-panel-*`. Optionale
additive Klassen `.ce-surface`, `.ce-surface-raised`, `.ce-surface-muted` wirken
**nur auf Elemente, die sie explizit tragen** — keine globale `.card`-Regel wird
überschrieben, kein `!important`.

## 4. Buttons (`src/styles/buttons.css`, additiv)

Auf dem bestehenden `.btn`-System, ohne bestehende Varianten/Höhen/Farben/Texte
zu ändern:

- `.btn:focus-visible` — sichtbarer Tastaturfokus (vorher fehlend; einzige
  bewusste Sichtänderung, nur bei Tastaturfokus). Outline statt box-shadow →
  kein Konflikt mit den Schatten von `.btn-primary`.
- `.btn-danger` — zurückhaltendes Rot (`--ce-danger` #dc2626) inkl. Hover/Active/
  Fokus.
- `.btn-icon` — quadratische Touchfläche (40px, `.btn-sm` → 34px). Accessible
  Name muss vom Aufrufer via `aria-label` kommen.
- `.btn-loading` — stabile Breite (Label transparent), zentrierter `.spinner`,
  `pointer-events:none`.

React-Primitive `src/components/ui/Button.jsx` (Wrapper über diese Klassen) +
reine `buttonClasses.mjs` (getestet). **Keine Migration bestehender Buttons in
diesem PR.**

## 5. Status-Metadaten (`src/utils/statusMeta.mjs`)

`getStatusMeta(status, domain)` → `{ label, tone, iconKey }`, `tone` bildet 1:1
auf `.badge-<tone>` ab. Domänen: `account`, `shipment`, `invoice`,
`cancellation`, `draft`, `admin`.

**Regel:** Labels sind domänenspezifisch und werden **nicht** global
vereinheitlicht. `account` (Kunde) und `admin` verwenden für denselben Wert
bewusst unterschiedliche Labels; `cancellation` folgt der Kunden-Semantik
(`rejected` = grau), die rote Admin-Stornoanzeige bleibt in
`utils/adminCancellations.mjs`. In diesem PR **nicht** in gerenderte Komponenten
eingebunden — bestehende sichtbare Labels bleiben unverändert.

## 6. Migrationsregel

- **Additiv** — neue Tokens/Klassen/Primitives, nichts Bestehendes wird
  blind überschrieben.
- **Seite für Seite** — Migration erfolgt in separaten, kleinen Folge-PRs.
- **Keine globalen Blindüberschreibungen** — keine ungescopten
  `input`/`select`/`.card`/`.sidebar`-Regeln, kein `!important`, keine
  `body`-Änderung.

## Bewusst NICHT enthalten (Folge-PRs)

Dialog-Primitive, Field/Input-Primitive, DataTable/Pagination/Mobile-Karten,
sowie jede reale Seiten-/Dialog-/Formular-/Tabellen-Migration.
