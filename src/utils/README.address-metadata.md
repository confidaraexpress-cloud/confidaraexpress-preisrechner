# Address / Postal-Code Metadata (Paket 1 — Frontend)

Länderspezifische Postleitzahl-Validierung + Eingabehilfe für die Adressformulare
(NewShipmentPage). Spiegelt exakt die Backend-Regeln (autoritativ bleibt der Server).

## Quelle & Lizenz

- **Quelle:** Google **libaddressinput** (Chrome i18n Address Metadata), Apache-2.0.
  Übernommen: `zip`→`postalCodePattern`, `zipex`→`postalCodeExample`, `require⊃Z`→`postalCodeRequired`.
- **Snapshot-Version:** `2026-07-15.1` (identisch zum Backend-Snapshot).
- Live-Endpoint in der Build-Umgebung durch Egress-Policy gesperrt → Werte transkribiert
  (Details/Quelle/Attribution im JSON-Kopf von `address-metadata.json`).

## Kanonische Quelle + Generator

```
src/utils/address-metadata.json           ← EINZIGE Quelle der Wahrheit (= Backend-Kopie, gleiche version)
scripts/generate-postal-code-rules.mjs    ← deterministischer Generator
src/utils/generated/postalCodeRules.mjs   ← generiertes Artefakt (nicht von Hand editieren)
src/utils/postalCode.mjs                  ← Helfer + UI-Guidance (nur Interpretation)
```

```bash
node scripts/generate-postal-code-rules.mjs          # neu generieren
node scripts/generate-postal-code-rules.mjs --check  # Drift-Check (vor Commit)
npm test                                             # enthält postalCode.test.mjs (Matrix + Abdeckung)
```

## Verhalten

- **Validierung** (`validatePostalCode`) blockiert „Preise berechnen" bei hartem Formatfehler
  (fließt in `getErrors`). Backend re-validiert identisch — der Client kann nichts überspringen.
- **Eingabehilfe:** länderspezifischer Platzhalter/Beispiel, `inputMode` (numeric/text), `maxLength` (10).
- **Länderwechsel:** manueller Landwechsel mit vorhandenen Adressdaten öffnet einen
  Bestätigungsdialog; bei Bestätigung werden Straße/Zusatz/PLZ/Ort geleert (Firma/Kontakt bleiben).
- **Länder ohne PLZ-System** (z. B. AE, HK): Feld optional, kein künstlicher Zwang.

## Fachliche Grenze

Nur **Format** (Länge/Struktur/Pflicht). KEINE Existenz- oder PLZ-Ort-Prüfung.
`FR + 63743` bleibt formal gültig. Kein UI-Text darf das Gegenteil behaupten.
