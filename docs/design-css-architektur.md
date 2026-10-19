# Design- und CSS-Architektur

Ausgelagert aus der Regeldatei (Stand origin/main, 2026-10-19). Wird nicht automatisch geladen. Lesen bei Arbeit an Stylesheets, Tokens, Primitives, Typografie, App-Shell oder Sidebar. Bei Widerspruch gewinnt der Canonical Context, danach der aktuelle Code.

### Getrennte Tokenfamilien — nicht vermischen

| Familie | Gilt für |
| --- | --- |
| `--ce-app-*`, `--ce-sidebar-*` | App-Chrome des eingeloggten Bereichs |
| `--surface*`, `--border-*`, `--text-*`, `--shadow-card*` | Inhaltsflächen im eingeloggten Bereich |
| `--ce-kpi-*` | ausschließlich das Kennzahlenband der Übersicht |
| `--ce-net-*` | ausschließlich der Carrier-Bereich der Übersicht |
| `--auth-*` | ausschließlich Auth-Bereich |
| `--adm-*` / `.adm-*` | ausschließlich Adminbereich |
| Legacy (`--navy`, `--gray*`, `--blue*`) | Booking, Legal, Angebots-/Preisrechnerkarten |

Farbwerte, Radien und Tiefen kommen aus `variables.css` (`--ce-radius-*`, `--ce-elevation-*`). Bereichs-Stylesheets tragen keine Farbliterale. Arbeitsflächen (Karten, Tabellen, Kennzahlen, Module, Formular-/Filterflächen) tragen feine Kante plus `--ce-elevation-1` (sehr leichter Schatten); Hover/Auswahl bedienbarer Karten Stufe 2, Overlays Stufe 3/Dropdown — nie ein freier Schattenwert. Die Tarifkarte ist das Angebot der Seite: schon in Ruhe Stufe 2, Auswahlaktion gefüllt im Markenblau, Preis 28 px, Laufzeit 24 px, Preisbereich durch eine feine Linie abgesetzt; ihre zwei Ablaufpunkte (Start Blau, Ziel Grün) pulsieren leicht — neben Ladeanzeigen die einzige Daueranimation außerhalb von Auth, bei reduzierter Bewegung aus.

Die Tarifkarte ist kompakt und richtet sich nach ihrer **eigenen** Breite (Container `offers` an `.offers-body`, nicht der Viewport — die Sidebar ist damit eingepreist): ab 950 px drei Spalten (Identität · Ablauf höchstens 400 px · Preis über CTA in fester 235-px-Spalte; die Identität bekommt den Rest), 640–949 px zweizeilig (Identität | dieselbe Preisspalte, darunter der Ablauf), darunter gestapelt, bis 320 px eine schmale Stufe. **Alle Karten einer Stufe sind gleich hoch** (Betreiberentscheidung 2026-10-04). Die Fläche trägt nur, was jedes Angebot trägt: Logo, Carrier mit Marke (Auszeichnung `.offer-badge` oder „Vorläufiger Preis" als `.offer-price-status` — keine Auszeichnung), Laufzeit, Servicename, Übergabeart, Ablauf mit je **einer** Zusatzzeile (Start: „frühester Abholtag" vor der Zeit; Ende: Uhrzeit, Frühzeit-Hinweis oder „Zustelltermin nicht bewertbar"), Hauptpreis mit Steuerangabe, CTA, darunter nur „Paketshops suchen"/„Details anzeigen". Alles Übrige steht in „Details anzeigen" — dieselben Helfer, derselbe Wortlaut: Netto/MwSt./Brutto (**kein** zweiter Betrag unter dem Preis), Zuschlag für Abholung am selben Tag und Hinweis zur Art der Lieferadresse (Preisaufschlüsselung), Abholschluss heute, Zeit eines verschobenen Abholtags und Abgabestelle (Termin & Abholung/Abgabe), Handlungshinweis zu einem Sperrgrund sowie Drucker/Versandlabel neben einem Produktprofil (Zusatzhinweise), Sendungsverfolgung und Drucker (Hauptmerkmale bzw. Profil). Was variieren kann (Marke, zweizeiliger Sperrgrund im Knopf, umbrechende Titel), hat je Stufe einen festen Platz; unter einem gesetzten Lieferzeitfilter hält `.offers-body--frist` auf schmalen Karten die zweite Hinweiszeile frei. Kein `1fr` über die Liste (eine aufgeklappte Karte bliebe sonst nicht die einzige höhere). Die Platzhalter (`contain-intrinsic-size`) sind gemessen — nach jeder Layoutänderung neu messen.

Optionslisten (Filter-Dropdowns von „Neue Sendung"/Versandkostenrechner, Uhrzeitliste) teilen ein Muster: Panel Radius 12 mit 4 px Innenabstand, Zeilen Radius 8, gewählt Brand Soft + Brand Ink 600 ohne Kontur. Einfachauswahl trägt den Kreis, Mehrfachauswahl (`role="checkbox"`) ein quadratisches Feld (`--ce-radius-xs`).

### Importreihenfolge (`styles/index.css`) — tragend

`primitives.css` steht **nach** `buttons.css`/`forms.css` (der Fokusstandard soll dort greifen) und **vor** allen Bereichs-Stylesheets (deren höher spezifische Sonderfälle bleiben wirksam). `dashboard-premium.css` steht **nach** `dashboard.css`. `patterns.css` wird als einzige Datei **nach** den Bereichs-Stylesheets importiert.

### Primitives und Muster zuerst benutzen

Buttons (`.btn` + Varianten), Eingaben (`.field-*`), `Switch`, Badges, Karten, `Icon.jsx`, `PageHeader`, `UserChip`, `StateView`, `useDialog`, `statusFallback` — vor jedem neuen Bauteil prüfen, ob das Muster bereits existiert.

**Eigenes Icon-System** (`components/ui/Icon.jsx`). Keine externe Icon-Bibliothek einführen; mehrere Tests verbieten das ausdrücklich. Außerhalb von Auth gilt: keine dekorativen Icons — Handlungen stehen als Text („Schließen“, „Herunterladen“, „Weitere Aktionen“ …). Funktionale Ausnahmen: native Formularsteuerungen, Karte, Carrier-Logos, die Marke — und die mobilen Kopfleisten: links das Hamburger-Symbol, rechts die Glocke mit Zähler (Betreiberentscheidung 2026-10-17). Beide sind Symbolknöpfe mit unverändertem zugänglichem Namen („Menü – Navigation öffnen“ bzw. „Menü öffnen“, „Mitteilungen, N ungelesen“), `aria-expanded`/`aria-controls` und 44-px-Ziel; die Navigations-Drawer laufen über `useNavigationDrawer` (Fokus hinein, Escape, Fokus zurück) und sind geschlossen unsichtbar. Der Desktop behält Textnavigation und den Knopf „Mitteilungen“.

**Versandformulare** (Preisrechner und „Neue Sendung“, Betreiberentscheidung 2026-10-17): schwebende Beschriftungen (`Field labelMode="floating"`, `AddressSuggestInput floating`), keine Musterplatzhalter — ein Format, das hilft (PLZ), steht als Hinweiszeile. „Angebote vergleichen“ ist nur während Rechnen oder Speichern gesperrt. Sichtbar sind Fehler berührter Felder, nach einem Klick alle (`utils/fieldTouchState.mjs`); geprüft wird immer mit der einen Regel der Seite, der Fokus springt nach dem Rendern. Vorschlagsfelder für Straße und Ort tragen den zentralen Nicht-Standard-Autofill-Token aus `AddressSuggestInput` — kein Aufrufer übergibt `autoComplete`; Kontaktfelder behalten ihre Tokens.

### Typografie

Eine Skala aus `--ce-text-*` (Seitentitel 28/36, mobil 24/32 · Abschnitt 18/26 · Karte 16/24 · Fließtext 14/22 · klein 13/20 · Label 13/18 · Caption/Tabellenkopf 12/18 · Kennzahl 32/38). Die Kunden-Sidebar hat eine eigene Stufe (`--ce-sidebar-nav-*`: 15/22, Hauptpunkte 600, Unterpunkte und sekundäre Aktionen 500, jede Zeile 44 px); die allgemeine Navigationsrolle (`--ce-text-nav-*`, Admin, öffentlicher Drawer) bleibt 14/20, 500. DM Sans für alles außerhalb des Auth-Bereichs, auch für Seitentitel und alle Zahlen; Cormorant nur noch im (unveränderten) Auth-Bereich — einzige Ausnahme (Betreiberentscheidung 2026-10-16): Headline und Abschnittstitel der eigenständigen Preisrechnerseite (`.pc-display`, `.pc-section-title`; typography.test.mjs). Keine Halbpixel, nichts unter 12 px außerhalb von Auth, höchstes Gewicht 600. Zahlen tabellarisch und in Zahlenspalten rechtsbündig.

### App-Shell und Sidebar

`.app-shell` ist der einzige Layoutrahmen des eingeloggten Bereichs — keine seitenabhängigen Theme-Klassen, keine zweite Hintergrundebene, keine Muster oder Formen im Hintergrund. Der Grund ist EINE gemeinsame Atmosphäre (`--ce-color-bg-atmosphere`, in der Shell über `--ce-app-bg`) für Kundenbereich, Admin und öffentliche Seiten: kühle Rampe aus den Flächentönen der Farbwelt mit genau zwei Lichtflächen (Markenindigo, Markenviolett), deren Deckkraft so bemessen ist, dass Sekundärtext auch im Lichtzentrum WCAG AA hält. Die Navigation hat genau zwei Ebenen; höchstens eine Gruppe ist offen, und der Klappzustand ist ein Wert, keine Booleanmenge. Die Kunden-Sidebar trägt die Deep-Navy-Fläche der ConfidaraExpress-Farbwelt (oben eine Lichtfläche hinter der Marke, unten ein Navy-Schleier, helle Innenkante und weicher Kantenschatten) mit reiner Textnavigation und der Originalmarke (`BrandLogo variant="lockup" tone="reverse"`) samt Unterzeile „B2B Logistik- und Versandplattform"; die Admin-Sidebar ist hell (Standardfassung). Es gibt keine weitere Markenvariante.

Einzige lokale Ausnahme (Betreiberentscheidung 2026-10-04): der Carrier-Bereich der Übersicht (`.ov-carriers`) trägt die Optik vor dem Redesign — Navy-Fläche, drei Routenlinien mit Knoten als `aria-hidden`-SVG hinter dem Inhalt, an der Karte beschnitten, weiße Logo-Kacheln, Schrift und Vergleichsaktion hell auf Navy (`--ce-net-*`). Das ist keine Seitenebene; kein anderes Modul übernimmt sie.

`min-height: 100dvh` statt `100vh` bei Vollbildlayouts.

`/booking` ist **eine** zentrierte Arbeitsspalte (`--ce-size-booking`, `.booking-wrap`); Titel und Untertitel stehen über `.ce-page-header--booking` auf derselben Achse, die Utility-Zeile (Mitteilungen, Benutzerchip) bleibt am gemeinsamen Rahmen.
