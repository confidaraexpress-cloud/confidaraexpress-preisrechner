# Design- und CSS-Architektur

Ausgelagert aus der Regeldatei (Stand origin/main, 2026-10-19). Wird nicht automatisch geladen. Lesen bei Arbeit an Stylesheets, Tokens, Primitives, Typografie, App-Shell oder Sidebar. Bei Widerspruch gewinnt der Canonical Context, danach der aktuelle Code.

### Premium-Redesign Etappe 1: Bereichs-Scope (Betreiberentscheidungen E1–E13, 2026-10-27)

- **Ein Attribut trennt die Welten:** `<html data-ce-bereich="kunde">` setzen `DashboardLayout` und `DashboardPage`, `"auth"` setzen `AuthPage` und `EmailChangeConfirmPage` (Hook `hooks/useCeBereich.js`, Aufräumen nur, wenn ihm das Attribut noch gehört). Der öffentliche Preisrechner trägt `"preisrechner"` statisch im Seitengerüst (`preisrechner/index.html`, `404.html`). Admin, Partnerportal und Partnerregistrierung setzen es **nie** — sie nutzen dieselben Klassen (`.app-shell`, `pp-side`, `auth-*`) und bleiben dadurch unverändert. Das Attribut sitzt am Wurzelelement, weil Portale (Dialoge, Paketshop-Karte, Ergebnisse) außerhalb der Shell rendern.
- **Werte:** genau ein Block `:root[data-ce-bereich="kunde"], …="auth"], …="preisrechner"]` am Ende von `variables.css` (designTokens.test.mjs, 1c). Er überschreibt nur vorhandene Tokens oder führt eigene `--ce-pr-*` ein: Navy des Logos (`--ce-pr-navy-*`), Signal `#004AFC` (`--ce-pr-signal*`, Fokus, Links, Markenstreifen `--ce-pr-stripe`), weiße Arbeitsfläche, Knopfschatten (`--ce-pr-btn-shadow*`), Radien (`--ce-pr-radius-*`), Schriftskala in rem (E13). Rahmen, Abstände und `--adm-*` bleiben unberührt.
- **Regeln:** `styles/premium-redesign.css`, als letzte Datei nach `patterns.css` importiert; jede Regel hängt am Bereichsattribut, keine Farbliterale außer den Alphamasken der Nachtkarte, Knöpfe ohne Bewegung, Verlauf und Deckkraft (premiumRedesign.test.mjs). Der Preisrechner bekommt dieselben Tokens über sein Attribut und bleibt in `public-calculator.css`.
- **Gestaltung:** Navy für Primäraktionen, Signal für Akzent und Fokus (E1); helle Kopfleiste, Navy-Seitenleiste mit Icons an den sechs Hauptpunkten (E3, E7); Statusmarke in zwei Stufen — ruhig als Kontur, hervorgehoben nur, was eine Handlung verlangt (E8); Tarifkarten hell mit Markenstreifen an der Unterkante bei Zeigen, Tastaturfokus und Auswahl (E9); kein Pulsieren (E11).
- **Werte halten zusammen:** `components/ui/Werte.jsx` (Logik `utils/keepValuesTogether.mjs`) markiert Uhrzeiten, Maße, Daten, Postleitzahlen mit Land und Vorgangsnummern als `.ce-wert` (kein Umbruch im Wert); der Text bleibt Zeichen für Zeichen gleich. Mit Werten liefert die Komponente genau ein Element (Flex-Träger). Layoutwächter: `tests/e2e/premiumLayoutGuard.test.mjs`.
- **Umbruch:** Überschriften ausgewogen, alle übrigen Texte ohne Einzelwort in der letzten Zeile, ausschließlich über die Langform `text-wrap-style`. Die Kurzform `text-wrap` setzt auch `text-wrap-mode` zurück und hebt damit jedes `white-space: nowrap` geringerer Spezifität auf (Tabellenspalten, Routen, Beträge; premiumRedesign.test.mjs, 7).
- **Nachtkarte (Konzept A):** `assets/illustrations/nachtkarte-eu.svg` (eigene Zeichnung, flächentreue Azimutalprojektion), auf der Anmeldung als Bühne, im Preisrechner mit der eingegebenen Strecke (`NachtkartenRoute.jsx`, `utils/nachtkarteRoute.mjs`, Orte `utils/nachtkarteOrte.mjs` im selben Ausschnitt). Ein Ortsname steht nur bei genau bekanntem Ort.

### Premium-Redesign Abschluss: Vorschau-Parität (Betreiberentscheidung 2026-10-27, Canonical v2.81)

- **Schrift:** Instrument Sans (SIL OFL 1.1, Lizenz `docs/lizenzen/OFL-InstrumentSans.txt`), variabel 400–700 und Breite 75–100, selbst gehostet (`assets/fonts/instrumentsans-var*.woff2`, `fonts.css`, latin-ext zuerst). Sie gilt nur über den Bereichsblock (`--ce-font-sans`, `--ce-pr-font-display`, `--ce-pr-display-stretch`); Admin, Partnerportal und Partnerregistrierung behalten DM Sans und Cormorant. In den Dateien des Bereichs (`premium-redesign.css`, `public-calculator.css`, `paketbuehne.css`, `nachtkarte.css`, `demo.css`) sind Gewichte bis 700 erlaubt, sonst höchstens 600 (typography.test.mjs 4, designSystemClosure.test.mjs 6).
- **Lichter der Nachtkarte:** `components/ui/NachtkartenLichter.jsx` mit `utils/nachtkarteLichter.mjs` (Hauptstädte und weitere Orte, fester Zufallsgenerator, je Licht eigene Dauer und eigener Einsatz) und `styles/nachtkarte.css`: eine Einstiegswelle (`.nk-welle`, Maske nur in den Keyframes, damit die Randmasken der Karte bleiben), danach funkelt jedes Licht für sich. Auf der Anmeldung, der E-Mail-Bestätigung und im Preisrechner (dort per Portal in die Karte des Seitengerüsts).
- **Lichtpunkt der Strecke:** 13 Stützpunkte je Strecke (Bogenlänge, Zeitverlauf der Linie) aus `lichtpunktStuetzen` als CSS-Variablen `--pc-l{i}x/y`; die Bewegung ist eine CSS-Animation in `public-calculator.css`. Läuft eine Strecke, treten Karte und Lichter leicht zurück.
- **Paketbühne:** `components/shipping/Paketbuehne.jsx`, Geometrie `utils/paketSzene.mjs` (isometrische Flächen als Matrix je Einheitsquadrat, gemeinsame Kanten bleiben bei jedem Übergang deckungsgleich), Stil `styles/paketbuehne.css`. Höchstens drei Größen, Anzahl als Stapel von höchstens zwei, Etikett mit Von/Nach. Rein darstellend (`aria-hidden`), „nicht maßstabsgetreu“. Im Preisrechner auf breiter Karte ein kompakter Streifen (Absenden bleibt auf 1366 × 768 ohne Scrollen erreichbar), im Kundenbereich neben den Paketfeldern (`.ce-paket-raster` ab 820 px). Das Seitengerüst des Preisrechners trägt eine statische Fassung (publicCalculatorIsland.test.mjs, 7).
- **Buchungsseite:** je Schritt ein Blatt (`.booking-blatt`) statt gestapelter Karten, Abschnitte durch Haarlinien getrennt, Aktionen in `.booking-blatt-fuss`. Ab 1440 px steht der Beleg als Seitenspalte neben dem Blatt (1440–1599 px 296 px, ab 1600 px 368 px), die Live-Zusammenfassung trägt dort den Markenstreifen.
- **Bewegung:** nur CSS. Bei reduzierter Bewegung keine Welle, keine Lichter, kein Lichtpunkt, keine Paketübergänge — jede Szene steht in ihrem Endzustand (tests/e2e/premiumParityPublic.test.mjs, V3).
- **Kundenbereich-Demo:** `styles/demo.css` hängt an `[data-ce-demo]` (setzt `demo/DemoApp.jsx`), Werte `--ce-demo-*` in `variables.css`. Vertrag: `docs/frontend-vertraege.md`, „Kundenbereich-Demo“.
- **Kopfsuche:** `.ce-suche` in `premium-redesign.css` (Abschnitt 14) — Feld im Utility-Cluster ab 1024 px, Trefferblatt mit `--ce-elevation-3`, Treffer in der Liste als `.ce-suche-fokus` (Signalkante, Signalfläche). Das Lupensymbol im Feld ist eine funktionale Ausnahme der Icon-Regel (es kennzeichnet das Feld, wie in der Vorschau). Vertrag: `docs/frontend-vertraege.md`, „Kopfsuche des Kundenbereichs“.

### Premium-Komplettabschluss (Betreiberentscheidungen G1–G7, 2026-10-27, Canonical v2.82)

- **Typografie im Bereich:** Fließtext 16 px, Tabellen 15 px, Tabellenköpfe und Status 13 px — alles in rem im Bereichsblock von `variables.css`, große Browserschrift skaliert mit. Rollenbezogen, keine pauschale Vergrößerung; die Skala der Foundation (unten) gilt für Admin und Partner unverändert.
- **Seitenleiste (G5):** „Neue Sendung“ und „Sendungen“ in der ersten Ebene (acht Punkte mit Icon), `.pp-nav-group--aktiv` markiert die Gruppe der aktuellen Seite getrennt von `.pp-nav-group--open`; die Gruppe öffnet sich beim Rendern (kein Effekt, kein Speicher). Einträge brechen um statt abzuschneiden; die Breite der Leiste folgt der Schrift. Der Ansprechpartner trägt seine Initialen in einem Ring in rem.
- **Tabellen:** Sendungen sechs Spalten mit festen Aktionsplätzen (`.stn-actions--plaetze`); die Trackingnummer ist ein eigener Block (`.shipment-id-nr`), der als Ganzes umbricht. Rechnungen fünf Spalten (`.inv-table--dokument`, Dokument mit Aktionen). Lagerlisten (`.inv-list-table`) unter 1360 px als Karten; Artikelnamen dürfen an Wortgrenzen umbrechen, Kennungen nie.
- **Übersicht (`overview.css`):** Modul „Lager und Aufträge“ (`.ov-lager-*`), „Ihre Versanddienstleister“ (`.ov-carrier-zeile`, seit der UX-Korrektur C als Navy-Fläche, siehe unten), Empfänger in den letzten Sendungen. Die frühere Familie `--ce-net-*` ist entfernt und kommt nicht zurück.
- **Versandkostenrechner:** Container `ce-rechner` an `.calc-page-wrap--calculator`; ab 1040 px Route und Paket nebeneinander, ab 1100 px die fünf Filter in einer Zeile.
- **Anmeldung:** statische Seitengerüste `login.html`/`register.html` mit denselben Klassen wie `AuthPage` (`.auth-kopf`, `.auth-hero`, `AuthKarte` als `.auth-map`, `.auth-card-bereich`); das Gerüstblatt trägt `.auth-geruest`. Zweispaltig ab 1024 px mit der Marke als Kopfzeile; das Blatt steht oben bündig mit dem Satz und wächst nur nach unten. Auf Touch-Geräten erreichen Rechtslinks und der Wechsel Anmelden/Registrieren 44 × 44 px.
- **Öffentlicher Preisrechner (`public-calculator.css`):** fünf Bereiche (Hero · Ergebnisse · `.pc-platform` mit Vorschau `.pc-vorschau`/`.pcv-*` · `.pc-ablauf` · Fragen). Die Miniatur misst in em auf einer Grundgröße in cqw (Container `pc-vorschau`), schmal unter 520 px eine reduzierte Fassung. Tarifkarte seit der UX-Korrektur B als Liste, eine Karte je Zeile (siehe unten). Logo `clamp(88px, 24vw, 128px)`, unter 340 px 80 px, nie gequetscht.
- **Demo-Leiste (`demo.css`):** ab 861 px schwebend neben der Seitenleiste; Höhe und Umschaltpunkt des Zusatztexts in rem/em, damit große Schrift sie nicht über den Inhalt wachsen lässt.
- **Paketbühne:** der Zustand `beispiel` zeigt das Kraftpapier-Paket mit Band; nur Etikett und Schatten fehlen (das Seitengerüst des Preisrechners zeichnet dasselbe Paket ohne Filter).

### UX-Korrekturen A–E (Betreiberentscheidung 2026-10-27, Canonical v2.83)

- **Preisrechner mobil (A):** Das Navy-Band (`.pc-hero-grid::before`, `grid-row: 1 / -1`) trägt in jeder Breite den ganzen Hero samt Rechnerkarte; sein unterer Überstand entspricht dem Innenrand des Heros je Stufe (vorher einspaltig fest 112 px in der Karte). Der Kopf bricht um, statt Logo oder Knöpfe abzuschneiden (`.pc-brand { flex: none }`, Navigation `flex-wrap`); unter 375 bzw. 340 px engere Knöpfe, Logo 80 px. Headline unter 360 px 1,75rem, auf dem Tablet (`min-width: 40em`) ohne Trennung. Karte ab 360 px 20 px Innenrand. Paket schmal im Dreierraster (Anzahl ⅓, Gewicht ⅔, Maße je ⅓), bei großer Schrift (Container `pc-form` unter 13rem) jedes Feld eine Zeile. „Gewicht und Maße je Paket.“ direkt unter „Paket“ (Insel und Skelett). Große Schrift ohne Querscrollen: kleine Raster mit `minmax(0, 1fr)` statt impliziter `auto`-Spalten, Notumbruch `break-word`, `anywhere` nur an der E-Mail-Adresse.
- **Tarifliste (B):** `.pc-offers` einspaltig; jede Karte ist ihr eigener Container `pc-karte` (am `.pc-offers-item`). Schmal gestapelt (Kopf · Ablauf · Hinweise · Abschluss, Preis und Knopf ab `pc-abschluss` 18rem in einer Zeile), ab 40rem Identität mit Hinweisen neben der Preisspalte (14,5rem) und der Ablauf darunter, ab 52rem eine Zeile: Identität · Ablauf (höchstens 28rem) · Preisspalte — Preise aller Karten in einer Spalte. Der Ablauf (`.pc-offer-ablauf`) trägt die ruhende Achse `.pc-offer-achse` wie die Kundenkarte (Start `--ce-color-brand`, Ziel `--ce-color-success-solid`); unter 17,5rem Kartenbreite (große Schrift) stehen Start und Zustellung untereinander. Kein `subgrid` mehr. Ohne Übernahme steht an der Stelle der Aktion immer ein Satz (`offerUnavailableText`, nie leer).
- **Carrier-Fläche (C):** `.ov-carrier-zeile` in `--ce-pr-stage` mit `.ov-carrier-linien` (SVG der früheren Routengeometrie, `vector-effect: non-scaling-stroke`, Farben `--ce-pr-on-navy-line`/`--ce-pr-signal-on-navy` mit Deckkraft), Radien und Tiefen aus `--ce-radius-*`/`--ce-elevation-*` (overview.css ist kein Bereichs-Stylesheet). Kacheln: ab vier Carriern `repeat(auto-fit, minmax(6.5rem, 1fr))`, bis drei feste Breite links, bis 720 px drei je Reihe mit mittiger letzter Reihe; Logos optisch angeglichen nur hier (`data-carrier` → `--ov-logo-optik`). Ohne Logodatei steht der Name als Kachel. Kein Hover auf Kacheln; die Aktion ist ein heller Knopf mit Fokusring `--ce-pr-signal-on-navy`.
- **Demo-Einstieg (D):** `.pc-demo` entfällt; `.pc-vorschau-oeffnen` in der Vorschau, schmal (Container `pc-vorschau` unter 520 px) drei statt vier Sendungszeilen und die Marke als Leiste unter der Miniatur — sie verdeckt keine Zeile.
- **Zustände (E):** Jede `:hover`-Regel des Preisrechners steht in `@media (hover: hover)` (außer Eingabefeldern; publicCalculatorIsland 8b); Fokus und Drücken bleiben außerhalb. Zweitknöpfe (`.pc-button--secondary`) in Navy-Kontur wie die Aktion der Tarifkarte.

### Getrennte Tokenfamilien — nicht vermischen

| Familie | Gilt für |
| --- | --- |
| `--ce-app-*`, `--ce-sidebar-*` | App-Chrome des eingeloggten Bereichs |
| `--surface*`, `--border-*`, `--text-*`, `--shadow-card*` | Inhaltsflächen im eingeloggten Bereich |
| `--ce-kpi-*` | ausschließlich das Kennzahlenband der Übersicht |
| `--auth-*` | ausschließlich Auth-Bereich |
| `--adm-*` / `.adm-*` | ausschließlich Adminbereich |
| Legacy (`--navy`, `--gray*`, `--blue*`) | Booking, Legal, Angebots-/Preisrechnerkarten |

Farbwerte, Radien und Tiefen kommen aus `variables.css` (`--ce-radius-*`, `--ce-elevation-*`). Bereichs-Stylesheets tragen keine Farbliterale. Arbeitsflächen (Karten, Tabellen, Kennzahlen, Module, Formular-/Filterflächen) tragen feine Kante plus `--ce-elevation-1` (sehr leichter Schatten); Hover/Auswahl bedienbarer Karten Stufe 2, Overlays Stufe 3/Dropdown — nie ein freier Schattenwert. Die Tarifkarte ist das Angebot der Seite: schon in Ruhe Stufe 2, Auswahlaktion gefüllt im Markenblau, Preis 28 px, Laufzeit 24 px, Preisbereich durch eine feine Linie abgesetzt; ihre zwei Ablaufpunkte (Start Blau, Ziel Grün) ruhen — kein Pulsieren (E11). Im Kundenbereich gilt zusätzlich der Bereichs-Scope oben (Kante, Streifen, Navy-Aktion).

Die Tarifkarte ist kompakt und richtet sich nach ihrer **eigenen** Breite (Container `offers` an `.offers-body`, nicht der Viewport — die Sidebar ist damit eingepreist): ab 950 px drei Spalten (Identität · Ablauf höchstens 400 px · Preis über CTA in fester 235-px-Spalte; die Identität bekommt den Rest), 640–949 px zweizeilig (Identität | dieselbe Preisspalte, darunter der Ablauf), darunter gestapelt, bis 320 px eine schmale Stufe. **Alle Karten einer Stufe sind gleich hoch** (Betreiberentscheidung 2026-10-04). Die Fläche trägt nur, was jedes Angebot trägt: Logo, Carrier mit Marke (Auszeichnung `.offer-badge` oder „Vorläufiger Preis" als `.offer-price-status` — keine Auszeichnung), Laufzeit, Servicename, Übergabeart, Ablauf mit je **einer** Zusatzzeile (Start: „frühester Abholtag" vor der Zeit; Ende: Uhrzeit oder Frühzeit-Hinweis — die Einordnung gegen eine Lieferfrist steht seit TG-L2 nicht auf der Karte, sondern als Gruppe der Liste: `.offers-group` mit Kopf, Zahl und Satz, `.offers-late-toggle` für „Zu spät"), Hauptpreis mit Steuerangabe, CTA, darunter nur „Paketshops suchen"/„Details anzeigen". Alles Übrige steht in „Details anzeigen" — dieselben Helfer, derselbe Wortlaut: Netto/MwSt./Brutto (**kein** zweiter Betrag unter dem Preis), Zuschlag für Abholung am selben Tag und Hinweis zur Art der Lieferadresse (Preisaufschlüsselung), Abholschluss heute, Zeit eines verschobenen Abholtags und Abgabestelle (Termin & Abholung/Abgabe), Handlungshinweis zu einem Sperrgrund sowie Drucker/Versandlabel neben einem Produktprofil (Zusatzhinweise), Sendungsverfolgung und Drucker (Hauptmerkmale bzw. Profil). Was variieren kann (Marke, zweizeiliger Sperrgrund im Knopf, umbrechende Titel), hat je Stufe einen festen Platz; unter einem gesetzten Lieferzeitfilter hält `.offers-body--frist` auf schmalen Karten die zweite Hinweiszeile frei. Kein `1fr` über die Liste (eine aufgeklappte Karte bliebe sonst nicht die einzige höhere). Die Platzhalter (`contain-intrinsic-size`) sind gemessen — nach jeder Layoutänderung neu messen.

Optionslisten (Filter-Dropdowns von „Neue Sendung"/Versandkostenrechner, Uhrzeitliste) teilen ein Muster: Panel Radius 12 mit 4 px Innenabstand, Zeilen Radius 8, gewählt Brand Soft + Brand Ink 600 ohne Kontur. Einfachauswahl trägt den Kreis, Mehrfachauswahl (`role="checkbox"`) ein quadratisches Feld (`--ce-radius-xs`).

### Importreihenfolge (`styles/index.css`) — tragend

`primitives.css` steht **nach** `buttons.css`/`forms.css` (der Fokusstandard soll dort greifen) und **vor** allen Bereichs-Stylesheets (deren höher spezifische Sonderfälle bleiben wirksam). `dashboard-premium.css` steht **nach** `dashboard.css`. `paketbuehne.css`, `nachtkarte.css` und `demo.css` folgen auf `comparison-loading.css`. `patterns.css` wird **nach** den Bereichs-Stylesheets importiert, `premium-redesign.css` als letzte Datei.

### Primitives und Muster zuerst benutzen

Buttons (`.btn` + Varianten), Eingaben (`.field-*`), `Switch`, Badges, Karten, `Icon.jsx`, `PageHeader`, `UserChip`, `StateView`, `useDialog`, `statusFallback` — vor jedem neuen Bauteil prüfen, ob das Muster bereits existiert.

**Eigenes Icon-System** (`components/ui/Icon.jsx`). Keine externe Icon-Bibliothek einführen; mehrere Tests verbieten das ausdrücklich. Außerhalb von Auth gilt: keine dekorativen Icons — Ausnahme seit E7 (2026-10-27): je ein Icon vor dem Text der sechs Hauptpunkte der Kunden-Sidebar; Handlungen stehen als Text („Schließen“, „Herunterladen“, „Weitere Aktionen“ …). Funktionale Ausnahmen: native Formularsteuerungen, Karte, Carrier-Logos, die Marke — und die mobilen Kopfleisten: links das Hamburger-Symbol, rechts die Glocke mit Zähler (Betreiberentscheidung 2026-10-17). Beide sind Symbolknöpfe mit unverändertem zugänglichem Namen („Menü – Navigation öffnen“ bzw. „Menü öffnen“, „Mitteilungen, N ungelesen“), `aria-expanded`/`aria-controls` und 44-px-Ziel; die Navigations-Drawer laufen über `useNavigationDrawer` (Fokus hinein, Escape, Fokus zurück) und sind geschlossen unsichtbar. Der Desktop behält Textnavigation und den Knopf „Mitteilungen“. Seit Gesamtauftrag E (2026-10-24) ist die Glocke auch auf dem Desktop neutral dunkel — Symbol in der Textfarbe auf neutraler Fläche mit neutraler Kante und neutralem Hover (`styles/notifications.css`); rot ist allein der Punkt bei ungelesenen Mitteilungen.

**Versandformulare** (Preisrechner und „Neue Sendung“, Betreiberentscheidung 2026-10-17): schwebende Beschriftungen (`Field labelMode="floating"`, `AddressSuggestInput floating`), keine Musterplatzhalter — ein Format, das hilft (PLZ), steht als Hinweiszeile. „Angebote vergleichen“ ist nur während Rechnen oder Speichern gesperrt. Sichtbar sind Fehler berührter Felder, nach einem Klick alle (`utils/fieldTouchState.mjs`); geprüft wird immer mit der einen Regel der Seite, der Fokus springt nach dem Rendern. Vorschlagsfelder für Straße und Ort tragen den zentralen Nicht-Standard-Autofill-Token aus `AddressSuggestInput` — kein Aufrufer übergibt `autoComplete`; Kontaktfelder behalten ihre Tokens.

### Typografie

Eine Skala aus `--ce-text-*` (Seitentitel 28/36, mobil 24/32 · Abschnitt 18/26 · Karte 16/24 · Fließtext 14/22 · klein 13/20 · Label 13/18 · Caption/Tabellenkopf 12/18 · Kennzahl 32/38). Die Kunden-Sidebar hat eine eigene Stufe (`--ce-sidebar-nav-*`: 15/22, Hauptpunkte 600, Unterpunkte und sekundäre Aktionen 500, jede Zeile 44 px); die allgemeine Navigationsrolle (`--ce-text-nav-*`, Admin, öffentlicher Drawer) bleibt 14/20, 500. DM Sans für alles außerhalb des Auth-Bereichs, auch für Seitentitel und alle Zahlen; Cormorant nur noch im Titel der Partnerregistrierung (`.auth-title`; typography.test.mjs). Keine Halbpixel, nichts unter 12 px außerhalb von Auth, höchstes Gewicht 600. Im Bereichs-Scope (Kunde, Kundenanmeldung, Preisrechner) gilt seit dem Premium-Redesign Instrument Sans mit eigener Skala aus dem Bereichsblock und Gewichten bis 700 (Abschnitt oben); Seitentitel, Headline und Abschnittstitel des Preisrechners stehen dort in Instrument Sans, nicht mehr in Cormorant. Zahlen tabellarisch und in Zahlenspalten rechtsbündig. Im Bereichs-Scope (Kunde, Auth, Preisrechner) stehen Schriftgrößen in rem (E13), damit sie der Schriftgröße des Browsers folgen; bei 16 px Grundgröße ergeben sie ganze Pixel auf der Skala (typography.test.mjs zählt rem mit ihrem Pixelwert). Admin bleibt in px.

### App-Shell und Sidebar

`.app-shell` ist der einzige Layoutrahmen des eingeloggten Bereichs — keine seitenabhängigen Theme-Klassen, keine zweite Hintergrundebene, keine Muster oder Formen im Hintergrund. Der Grund ist EINE gemeinsame Atmosphäre (`--ce-color-bg-atmosphere`, in der Shell über `--ce-app-bg`) für Admin und öffentliche Seiten (im Bereich `kunde` seit dem Premium-Redesign eine weiße Arbeitsfläche ohne Atmosphäre): kühle Rampe aus den Flächentönen der Farbwelt mit genau zwei Lichtflächen (Markenindigo, Markenviolett), deren Deckkraft so bemessen ist, dass Sekundärtext auch im Lichtzentrum WCAG AA hält. Die Navigation hat genau zwei Ebenen; höchstens eine Gruppe ist offen, und der Klappzustand ist ein Wert, keine Booleanmenge. Die Kunden-Sidebar trägt die Deep-Navy-Fläche der ConfidaraExpress-Farbwelt (im Bereich `kunde` flach in der Navy des Logos, `--ce-sidebar-*` aus dem Bereichsblock) mit Textnavigation und Icons an den Hauptpunkten (E7) und der Originalmarke (`BrandLogo variant="lockup" tone="reverse"`) samt Unterzeile „B2B Logistik- und Versandplattform"; die Admin-Sidebar ist hell (Standardfassung). Es gibt keine weitere Markenvariante.

„Ihre Versanddienstleister“ trägt seit der UX-Korrektur C (Betreiberentscheidung 2026-10-27) wieder eine Navy-Fläche mit feinen Linien — als Komponente, nicht als Seitenebene: die Linien liegen nur in der Sektion, statisch, hinter dem Inhalt und an der Rundung beschnitten; die Shell bleibt ohne zweite Hintergrundebene. Die frühere Familie `--ce-net-*` bleibt entfernt.

`min-height: 100dvh` statt `100vh` bei Vollbildlayouts.

`/booking` ist unter 1440 px **eine** zentrierte Arbeitsspalte (`--ce-size-booking`, `.booking-wrap`; bis 2026-10-27 unter 1600 px — seitdem steht der Beleg im Kundenbereich ab 1440 px als schmale Seitenspalte daneben, `--ce-pr-booking-seite`); Titel und Untertitel stehen über `.ce-page-header--booking` auf derselben Achse, die Utility-Zeile (Mitteilungen, Benutzerchip) bleibt am gemeinsamen Rahmen.

### Rahmenstufen und Seitenspalte (Gesamtauftrag D, 2026-10-24)

Wenige zentrale Regeln statt seitenweiser Sonderbreiten.

**Rahmen** (`styles/variables.css`, Stufen am Dateiende):

| Bereich | bis 1679 px | ab 1680 px | ab 2240 px |
|---|---|---|---|
| Kundenseiten (`--ce-size-content`) | 1200 px | 1440 px | 1680 px |
| Admin (`--ce-size-content-admin`) | 1440 px | 1680 px | 1920 px |

- Seitenkopf, Inhalt, Hinweisleiste, Fuß und Tracking folgen über denselben Token und stehen auf einer Kante.
- Formulare (`--ce-size-form`), Lesetext (`--ce-size-prose`) und die Buchungsspalte behalten ihre Maße.
- Weitere Stufen nur bewusst und dort; `designTokens` 1b schreibt sie fest.

**Angebotssektion** (`offers.css`):

- `min(calc(var(--ce-size-content) - 120px), 1280px)`.
- Im Grundrahmen sind das unverändert 1080 px (Karte 1022 px), ab 1680 px 1280 px. So wird der Vergleich nicht zerdehnt.

**Buchung ab 1600 px** (`calculator.css`, `.booking-side` in `BookingPage.jsx`):

- Die Arbeitsspalte bleibt 800 px und im normalen Fluss; die Abstände sind unverändert.
- Netto/Brutto-Umschalter und Live-Zusammenfassung stehen als Seitenspalte daneben (`--ce-size-booking-side` 368 px, Abstand `--ce-space-7`). Zusammen füllen sie genau den Grundrahmen von 1200 px.
- Die Seitenspalte liegt absolut neben der Arbeitsspalte und klebt innen (sticky). Die kompakte Leiste bleibt verborgen, weil die Zusammenfassung sichtbar bleibt.
- Der Titel wandert nur mit Seitenspalte mit: `.main-content:has(.booking-side)` in `patterns.css`.
- Unter 1600 px und in Schritt 3 sind die Wrapper reine Blöcke; die Seite ist pixelgleich mit dem Stand davor.
- **Kundenbereich ab 1440 px** (Premium-Redesign 2026-10-27, `premium-redesign.css`): dieselbe Seitenspalte schon zwischen 1440 und 1599 px, schmal mit `--ce-pr-booking-seite` (296 px) — Arbeitsspalte 800 px, Abstand `--ce-space-7`, Seitenspalte und Seitenränder füllen die Inhaltsbreite neben der Navigation genau. Darunter bleibt es bei einer Spalte (tests/e2e/responsiveFrameTiers.test.mjs, R3).

**Lesemaß:**

| Element | Maß |
|---|---|
| `.auth-sub-2` | 62ch, zentriert, `text-wrap: balance` |
| `.pwa-card-text`, `.adm-support-hint` | 72ch |
| `.adm-todo-line` | 64ch |

Gemessen bleiben alle bei höchstens 90 Zeichen je Zeile, vorher bis 163.

**Bedienziel:** `.auth-field-link` („Vergessen?“) hat mindestens 24 px Trefferhöhe (WCAG 2.5.8), ohne die Zeile höher zu machen.

**Nicht berührt:** die Lieferzeitfilter (Dropdowns, Uhrzeitliste). Sie sind abgenommen und bleiben unverändert.

**Browserprüfung:** `tests/e2e/responsiveFrameTiers.test.mjs` (R1–R6, darunter überlauffrei in zehn Breiten von 320 bis 2560 px).
