# Address / Postal-Code Metadata (Paket 1 — Frontend)

Länderspezifische PLZ-Validierung + Eingabehilfe (NewShipmentPage), **maschinell** aus
einem hash-gepinnten Roh-Snapshot der autoritativen Quelle abgeleitet — identisch zum
Backend (autoritativ bleibt der Server).

## Quelle & Lizenz

- **Upstream:** Google **Address Data Service metadata** (Felder `zip`/`zipex`/`require`/
  `upper` verbatim + `ZZ`-Fallback).
- **Bezogen über:** PyPI **`google-i18n-address==3.1.1`** (Release **2024-09-04**, Wheel-SHA-256
  `f66f4fd2…76fc23d`) — **Kopie**/Mirror der Metadaten, **kein Live-Abruf** (Endpoint
  egress-gesperrt). Das Paket ist nicht die primäre autoritative Quelle.
- **Lizenzmatrix (getrennt):** Metadaten (Adressdaten) = **CC-BY-4.0**; libaddressinput
  **Quellcode** = Apache-2.0; **google-i18n-address** Paketcode = BSD-3-Clause. Attribution:
  „Google LLC – Address Data Service metadata". **Keine** Apache-2.0-Aussage auf die Metadaten.
- **Snapshot-Version:** `2026-07-15.2` = **ConfidaraExpress-Snapshotversion** (nicht der
  Upstream-Datenstand), identisch zum Backend. Rohsnapshot-SHA-256 + semantischer
  `rulesSha256` sind in beiden Repos identisch.

## Pipeline

```
src/utils/libaddressinput-raw.json         ← ROH: unveränderte Country-Responses (74 + ZZ)
scripts/build-address-metadata.mjs         ← maschinelle Ableitung (ZZ require/upper-Fallback)
src/utils/address-metadata.json            ← kanonische Metadaten (generiert, rawSnapshotSha256)
scripts/generate-postal-code-rules.mjs     ← Regel-Generator
src/utils/generated/postalCodeRules.mjs    ← Laufzeitregeln (nicht von Hand editieren)
src/utils/postalCode.mjs                   ← Helfer + UI-Guidance
scripts/fetch-libaddressinput.mjs          ← offizieller Refresh direkt vom Endpoint (netzabhängig)
```

Ableitung je Land: `pattern = Country.zip`; `example = zipex[0]`;
`required = (Country.require ?? ZZ.require "AC").includes("Z")`;
`uppercase = (Country.upper ?? ZZ.upper).includes("Z")`. Der ZZ-Fallback bedeutet:
Länder ohne eigenes `require` erben "AC" → **keine** Pflicht-PLZ.

```bash
node scripts/build-address-metadata.mjs --check      # Drift-Check
node scripts/generate-postal-code-rules.mjs --check
npm test                                             # postalCode.test.mjs (Matrix + Abdeckung + Hash-Check)
node scripts/fetch-libaddressinput.mjs               # nur netz-freigegeben
```

## Verhalten

- **Validierung** blockiert „Preise berechnen" bei hartem Formatfehler; Backend
  re-validiert identisch (kein Client-Bypass).
- **Eingabehilfe:** landesspezifischer Platzhalter/Beispiel, `inputMode` (numeric/text),
  `maxLength` (10).
- **Länderwechsel:** Bestätigungsdialog → Straße/Zusatz/PLZ/Ort leeren, Firma/Kontakt behalten.
- **Länder ohne PLZ-System** (AE, HK): Feld optional.

## Grenze

Nur **Format** (Länge/Struktur/Pflicht). KEINE Existenz- oder PLZ-Ort-Prüfung.
`FR + 63743` bleibt formal gültig. Kein UI-Text darf das Gegenteil behaupten.
