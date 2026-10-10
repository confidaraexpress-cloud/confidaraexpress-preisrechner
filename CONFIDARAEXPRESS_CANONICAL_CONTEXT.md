# CONFIDARAEXPRESS — CANONICAL PROJECT CONTEXT

- **Schema-Version:** 2.1
- **Status:** CANONICAL PROJECT SOURCE
- **Last verified:** 2026-10-10 (Transglobal-Servicekatalog: Produktidentität getrennt von der ServiceID der Umgebung — Live-Klärungstests belegen eine eigenständige Live-Nummerierung; Übersetzung nur an Quote-Eingang, V2-Bestellung und Portaladaptern; Live belegt 14 IDs — identisch 22, 23, 26, 29, 41, 137, dazu 49 ← 44, 44 ← 45, 85 ← 83, 87 ← 85, 84 ← 86, 107 ← 111, 110 ← 114, 124 ← 125 (Klärungstest 3: Anbietername, gleiche Produktstruktur auf identischer Route in beiden Umgebungen, Portal-Übergabevermerk); 47/48 im Live-Konto nicht angeboten; keine geratene ID; Pflichtangabe `TRANSGLOBAL_SERVICE_CATALOG` in Produktion; gegen Backend `origin/main` `657d167` plus Branch `feat/tg-service-catalog`, Frontend ohne Codeänderung; wirksam nach Merge 1A, 6.4, 13.4, 21); 2026-10-09 (Technischer Abschluss R1–R9 — R1, R2, R3, R4, R7, R9 und die Admin-Kennzahl „Kunden“ implementiert, gemergt und mit grüner Main-CI; R5 geprüft ohne erforderliche Codeänderung; R6 offene Produktions-/Coolify-Prüfung; R8 gewollte Testgrenze mit ausstehendem produktivem Rauchtest; Betreiberentscheidungen zur Gutschrift-Positionsreferenz und zur Kennzahl „Kunden“; nicht deployt; gegen Backend `origin/main` `4c246df` und Frontend `origin/main` `1d0f57d`, reine Dokumentation 1A, 12A, 13.1, 17.4, 20.6, 20.7, 21); 2026-10-09 (Gesamt-QA der UX-Pakete 1–6 dokumentiert — UX-Arbeiten abgeschlossen und gemergt (Frontend #474–#479, Backend #403), integrierte Prüfung ohne Regression; offene Go-Live-Risiken als eigener Abschnitt, nicht verifizierte Produktionszustände getrennt, bekannte sporadische Tests mit Einordnungsregel, Startabhängigkeit `RESEND_API_KEY` in der Backend-Dokumentation korrigiert; gegen Backend `origin/main` `99f8a20` und Frontend `origin/main` `c1bc6f9`, reine Dokumentation ohne Codeänderung 1A, 12A, 17.4, 20.6, 21); 2026-10-08 (UX-Paket 1 — Verständlichkeit und Bedienfehler im Adminbereich und Partnerportal: ehrliche Kopierrückmeldung, Bestätigung vor jeder Einzelausstellung einer Gutschrift, Folgen von Deaktivieren und Obergrenzen erklärt, Login-Aktionen und neue Provisionssätze nur für freigegebene Partner, „Mein Team“ immer sichtbar, Testkunde im Kundendetail als TEST über das Lesefeld `user.prelive_test`, keine Rohwerte und Schalternamen im sichtbaren Text; Betreiberentscheidungen zur Bedienoberfläche — gegen Backend `origin/main` `f414128` plus Branch `ux/p1-klarheit-fehler` und Frontend `origin/main` `5b161a0` plus Branch `ux/p1-klarheit-fehler`; wirksam nach Merge 1A, 12A); 2026-10-07 (Pre-Live-Partnerregistrierung über den echten öffentlichen Ablauf: im Pre-Live-Testmodus öffnet `/partner-registrieren` das normale Formular ohne Vertragsannahme, jeder Antrag wird serverseitig ein unveränderlich gekennzeichneter Testpartner (pending → Adminfreigabe → Anmeldung mit eigenem Passwort → `/partner`); der produktive Schalter hat Vorrang, ein echter Bewerber wird nie als Testpartner eingestuft; Partnerlink Test ↔ Test — gegen Backend `origin/main` `4938008` plus Branch `fix/prelive-public-partner-registration` und Frontend `origin/main` `5b7ac36` plus Branch `fix/prelive-public-partner-registration`; wirksam nach Merge 1A, 12A, 13.4, 14); 2026-10-07 (Pre-Live-Testmodus des Vertriebspartnerprogramms: kontrollierter interner Testbetrieb in der Produktionsanwendung hinter `SALES_PARTNER_PRELIVE_TEST_MODE` (opt-in, aus) — unveränderlich gekennzeichnete Testkonten, -zuordnungen, providerfreie Testsendungen (Status/Provider `prelive_test`), Testzahlung, Szenarien, manueller Test-Provisionslauf, Testgutschriften `CE-TEST-PG` mit Wasserzeichen, Versandschutz für Testkonten, Bereinigung mit Blockern; Startwerte 10 % / 5 % / 2,5 %, Level 3/6/10/15/25 und 100/250/500/1000/2000 serverseitig vorbelegt; Obergrenze optional und je Partner möglich — implementiert, Schalter aus, nicht aktiviert; gegen Backend `origin/main` `71abec5` plus Branch `feat/sales-partner-prelive-test-mode` und Frontend `origin/main` `3088ba1` plus Branch `feat/sales-partner-prelive-test-mode`; wirksam nach Merge 1A, 10, 12A, 13.4, 14, 21, 22, 24); 2026-10-07 (Vertriebspartnervereinbarung, Abrechnungsdaten und Gutschrift: Vereinbarung als eigener Legal-Registry-Typ `sales_partner_agreement` (Version `MAJOR.MINOR`, nie im Kunden-Set, Registrierung serverseitig an die veröffentlichte, gültige, hash-geprüfte Fassung gebunden — keine Fassung veröffentlicht, Registrierung damit geschlossen); Abrechnungsdaten mit Adminprüfung; monatliche Gutschrift als Selbstabrechnung (Modell C, Stichtag Europe/Berlin, Saldovortrag, Vorschau → Bestätigung, Nummernkreis CE-PG, eingefrorenes PDF, Storno mit Korrekturbeleg, „ausgezahlt" nur festgehalten) — implementiert, `SALES_PARTNER_CREDIT_NOTES_ENABLED` aus, nicht aktiviert; gegen Backend `origin/main` `68d4c17` plus Branch `feat/sales-partner-credit-notes` und Frontend `origin/main` `f9d540b` plus Branch `feat/sales-partner-credit-notes`; wirksam nach Merge 1A, 10, 11, 12A, 13.4, 14, 21, 22, 24); 2026-10-06 (Vertriebspartner-Programm: Rolle `sales_partner` mit serverseitiger Rollen-Allowlist, eigene Registrierung mit Adminfreigabe, Kunden- und Partnerlink, Kundenzuordnung als Historie, Versandnachweis als eigener Beleg, Monatsbewertung mit additiven Kunden- und Paketleveln, Provision zum Versandtag mit zwei Teamebenen und 10+10 Plätzen, Ledger nur anhängend, auszahlbar erst nach bezahlter Kundenrechnung — implementiert, alle vier Schalter aus, nicht aktiviert; gegen Backend `origin/main` `d300e8e` plus Branch `feat/sales-partner-program` und Frontend `origin/main` `a27de76` plus Branch `feat/sales-partner-program`; wirksam nach Merge 1A, 5.9, 12A, 13.1, 13.4, 14, 21, 22, 24); 2026-10-06 (Transglobal-Kaltstart: bedarfsgesteuertes Aufwärmen über `GetCountries` beim Betreten der Versandseiten, höchstens ein Ruf je 10-min-Ruhephase, begrenzte Wartekoordination des Vergleichs; gegen Backend `origin/main` `71a0c61` plus Branch `feat/tg-warmup-on-demand` und Frontend `origin/main` `2b0b6bb` plus Branch `feat/tg-warmup-on-demand`; wirksam nach Merge 14, 21); 2026-10-05 (Portfolio ≠ erste Live-Welle: TG86 und TG137 bleiben Portfolio, sind aber bis zu ihrer jeweiligen ausdrücklichen Freigabe weder sichtbar noch buchbar — je ein Produktfreigabeschalter `TG86_PUBLIC_RELEASE_ENABLED` / `TG137_PUBLIC_RELEASE_ENABLED`, getrennt vom technischen Adapterschalter der 137; erste Welle genau 22, 26, 29, 41, 44, 47, 48, 49, 84, 85, 87, 107, 110, 124; gegen Backend `origin/main` `93f8718` plus Branch `feat/tg-public-release-gate-86-137`, Frontend ohne Codeänderung gegen `origin/main` `adbc9ac`; wirksam nach Merge 1A, 6.4, 13.4, 14, 15, 21, 23); 2026-10-02 (Go-Live Block B — Tarifdarstellung und Filter: Economy ist eine eigene Versandart, unabhängig vom Standardaufschlag — TG107, TG41 und JUMiNGO 3144 „ECONOMY EXPRESS“ sind Economy und tragen den Standardaufschlag, 3144 heißt „Economy Express“; 3339 „EuroBusinessParcel“ ist STANDARD und heißt „Standard Business Europa“; JUMiNGO zeigt auch in der Kundenansicht die bestehenden kuratierten Tarifnamen (Cargo 3469 bleibt beim neutralen Namen); ohne vergleichbares Anbieterdatum bleibt ein Angebot unter dem Lieferzeitfilter sichtbar mit „Zustelltermin nicht bewertbar“; Samstagszustellung nur aus dem Providerflag; 3106 bleibt bis zum Carrier-Nachweis neutral; wirksam nach Merge 6.2, 6.4, 8.2, 15); 2026-10-02 (Cross-Provider-Sichtbarkeit: JUMiNGO- und Transglobal-Angebote bleiben beide kundensichtbar — ein Preisunterschied ist nie ein Grund, eines zu verbergen; die Route ruft keine Gewinnerauswahl mehr auf, die Oberfläche blendet die Kombination UPS · Expressversand · `quote_only` nicht mehr aus; das Matching bleibt für die Diagnose; wirksam nach Merge 6.5); 2026-10-01 (Betreiberentscheidung DPD Launch: Service 137 „DPD Classic“ gehört neben Service 124 „DPD PaketShop“ ausdrücklich zum Transglobal-Launchportfolio; 137 ist DE→DE, genau ein Packstück, Fahrerabholung über den Portalpfad, technisch belegt durch S137A und die Staging-Buchung DE0052658; kein Warehouse-/Zwischenumschlagmodell; Runtime-Aktivierung bleibt umgebungsabhängig 1A, 14, 21); 2026-10-01 (JUMiNGO-Paketshop-Regression: UPS, DHL, GLS und DPD sind als JUMiNGO-Abgabe wieder kuratiert und buchbar vorbereitet — die leere Liste der Final Bookability Closure war eine nachträgliche CE-Härtung, der gemeinsame Shop-Buchungspfad blieb erhalten; alle übrigen Buchungsschranken unverändert, G4_REQUIRED eingeschlossen; der Paketshop-Finder folgt wieder Abgabe + kontrolliertem Suchcode; kein neuer Providernachweis 1A, 6.2, 15, 21); 2026-10-01 (TG110 Final Closure: die Staging-Buchung DE0052660 — genau ein Paket, genau ein Submit, 14,53 € netto — bestätigt servicegenau „Ihr GLS-Fahrer wird bei der Abholung ein Versandetikett an Ihrem Paket anbringen.“; für die 110 gilt der providerneutrale Labelvertrag `labelHandling: "carrier_at_pickup"` (genau eine Kuration in der Servicematrix), `printerRequired: false`, kein Kundenlabel und kein Label-Nachlauf für NEUE Buchungen; der Portalkern hält den Vertrag beim Anlegen des Portalversuchs in der additiven Spalte `label_handling` fest (danach unveränderlich, auch wenn der Abschluss in der Klärung endet), und nur dieser gespeicherte Vertrag macht einen abgeschlossenen oder menschlich als gebucht bestätigten Vorgang zu `carrier_applied` — historische Vorgänge (DE0052649, `label_pending`) behalten ihren gespeicherten Stand; Tracking/AWB bleiben unabhängig vom Label 1A, 6.4, 14, 15); 2026-09-30 (TG110 Single-Package-Korrektur: die aktuelle Transglobal-Staging-Produktseite nennt fuer GLS Pick&Ship genau ein Paketstueck pro Sendung; ein frischer read-only Ein-Paket-Quote liefert Service 110 fuer DE 63741 → 10115, 2 kg, 30 × 20 × 15 cm, 14,53 netto; die frueheren Zwei-Paket-Portal-Captures bleiben historische Protokollevidenz, sind aber kein End-to-End-Beleg fuer einen vollstaendig verarbeiteten Zwei-Paket-Auftrag — DE0052649 blieb ohne nachgewiesenes Label/AWB; deshalb `maxPackages: 1` in Matrix und Binder, zwei Pakete fail-closed vor Providerkontakt; keine Aussage, dass die Paketanzahl die Label-Luecke verursacht hat; Label-/Trackingvertrag unveraendert offen 1A, 6.4, 14, 15); 2026-09-29 (Pre-Live Fix-Pack: die Sammelabrechnung ist NEU nur wählbar, wenn der Sammelrechnungslauf läuft — Profil und Admin antworten sonst 409 `BILLING_MODE_UNAVAILABLE`, `/kundenbereich` nennt `billingCapabilities.consolidated7dAvailable`, ein Bestandskonto behält seine Wahl 9.2; der Portal-Etikettnachlauf ist pagination-fest: der sitzungsstabile Detailpfad des Providerauftrags wird mit dem Abschluss am Versuch gesichert und direkt gelesen 1A; das Adressbuch speichert Vor- und Nachname 25); 2026-09-29 (TG Staging Final Closure: Service 86 ist als DHL-Produkt „EXPRESS 10:30“ belegt (Staging-Buchung DE0052654) und als „Domestic Express 10:30“ DE→DE öffentlich buchbar vorbereitet, gepaart mit dem JUMiNGO-Tarif „EXPRESS DOMESTIC 10:30“; Service 137 (DPD Classic) ist als Fahrerabholung belegt (Portalprobe S137A, Staging-Buchung DE0052658) und über den Portalpfad DE→DE vorbereitet hinter `TG137_PORTAL_ADAPTER_ENABLED`; die kostenpflichtige Transportabsicherung ist für 41, 48 und 49 je an einer eigenen versicherten Staging-Buchung belegt (DE0052655/56/57) und kuratiert — ohne sie bleiben allein die Portaltarife 47, 110, 124 und 137 1A, 6.4, 6.5, 14, 15); 2026-09-29 (TG Final Closure: die kaufbare Transportabsicherung ist genau für 22, 23, 26, 29, 44, 84, 85, 87 und 107 kuratiert — ohne sie 41, 48, 49 und die Portaltarife 47, 110, 124, deren buchbare Angebote keine Absicherung tragen („Keine Zusatzversicherung verfügbar.“), und der Portalkern beendet eine mitgeschickte Absicherung vor jedem Portalaufruf; nachgetragen: TNT 41/44 (DE→EU) und 48/49 (DE→DE) seit 2026-09-22 öffentlich buchbar vorbereitet, nur an Geschäftsempfänger; 86 und 137 unverändert ohne Angebot 1A, 6.4, 14); 2026-09-29 (Go-Live-Abschluss: ein JUMiNGO-Mehrfachsatz, der nicht vollständig in CE liegt, wird nie als Einzeletikett zwischengespeichert, und ohne direkten Schlüssel wird nie das Etikett einer fremden Sendung gewählt 6.2; die Tarifgrenze `second_length` gilt laut offizieller JUMiNGO-Spezifikation nur für die zweitlängste Seite 6.2; TG23 seit 2026-09-23 aus dem Kundenangebot zurückgezogen (`offerEnabled: false`) 14; Kartenkacheln des Paketshop-Finders ohne eigenen Stil von `tile.openstreetmap.org`, in den Rechtstexten nicht genannt 15, 21); 2026-09-28 (Final Bookability Closure: nachweislich nicht bestellte JUMiNGO-Buchungen antworten `BOOKING_FAILED` statt eines offenen Ausgangs; besitzerlose und fremde Entwürfe enden ohne Providerkontakt mit 404; der Multi-Provider-Debugmodus wirkt nur für Admins und nie in Produktion; eine JUMiNGO-Abgabe ist nur mit Bindungsbeleg buchbar (Liste leer); JUMiNGO bucht nur über das gespeicherte Angebot, das Tarif und gezeigten Abholtag bindet (`COLLECTION_DATE_CHANGED`); Gebietszuschlag und Warenkorbzuschläge fail-closed; Tarifgrenzen dreiwertig, Firmen-/Privatflags und Inhaltsangabe serverseitig; Providerstatus normalisiert, Tracking-Rückfall auf die gespeicherte Sendungsnummer; Labelstand in der Buchungsantwort, „abrufbar“ ist nicht „bereit“; JUMiNGO-Mehrfachetiketten; Trackingtakt mit Rückstellung; neun bundesweite Feiertage 1A, 5.1, 5.8, 5.11, 6.2, 6.4, 13.5, 14, 15, 21); 2026-09-27 (PWA Core: ConfidaraExpress als installierbare App — Manifest, CE-App-Icons, minimaler Service Worker ausschließlich für die Offline-Seite, Installationszugang erst nach dem Login, Offline-/Versionshinweis ohne automatisches Neuladen, Login-Rücksprung nur über Allowlist; wirksam nach Merge und Frontend-Deployment 3.1, 15, 16); 2026-09-27 (Zero-Open-Innenabschluss: `label_missing` zählt nur „kein Versandlabel in CE“ aus echten Abrufbefunden, nie einen außerhalb von CE zugestellten Fall; die Labelaussage der Auftragsbestätigung ist nie stärker als der Beleg („im Konto“ nur mit Label in CE, sonst „sobald verfügbar“, „gesondert bereitgestellt“ oder keine Aussage), das Kundenkonto zeigt ein in CE nie entstehendes Label als „Nicht im Kundenkonto verfügbar“ 1A, 6.4, 14, 15); 2026-09-26 (Go-Live-Innenabschluss: wirksamer Abholtag von 29/107/41/44 bis in Rechnung und Auftragsbestätigung belegt; JUMiNGO-Versicherung „keine" wird bei `/book` serverseitig zurückgesetzt und geprüft; Abgabe-Paketshop und Leistungsname aus EINER Quelle auf allen Flächen; Sendungsnummer in fünf belegten Zuständen statt Fehlalarm; späte Transglobal-AWB aus TrackOrder, Portal-Leser ohne fremde AWB; V2-Auftrag ohne Versandetikett nur mit ausdrücklicher Zustellaussage abschließbar 1A, 5.11, 6.2, 6.4, 14, 15); 2026-09-26 (Portal-Zusatzmail: wartet bei einer Portalbuchung so lange wie der Label-Nachlauf, genau einmal 1A, 6.4); 2026-09-25 (Portal-Final-Closure 47/110/124: Namens- und Adressgrenze schon im Vergleich, Aufräumreserve vor Fristende, Größenangabe „A4" nur mit gemessener Seite, read-only Login-Smoke; 47 am Staging extern, 110 zeitabhängig 1A, 6.4, 15); 2026-09-25 (Portal-Tarife 47/110/124: der gemeinsame Portalkern folgt der an echten Portalaufrufen belegten Reihenfolge, bezahlt nie einen fremden oder mehrteiligen Warenkorb und sendet keinen mutierenden Request zweimal; Zahlschritt (`ResponseGuid` aus der Warenkorbprüfung) und Adressschritt (Portalprüfung je Stufe, Rücklesung) am Staging-Portal belegt, je eine Staging-Buchung 124/110/47 centgenau, die 110 höchstens zwei Packstücke — öffentlich buchbar vorbereitet hinter den Portal- und Nachlaufschaltern 1A, 6.4, 14); 2026-09-25 (Same-Day End-to-End: die gebührenfreie Abholung am selben Tag — 84, 85, 87, 48, 49 — ist durch Optionen, Bindung, Neubepreisung und `/book` tatsächlich buchbar, der Nullunterschied ist kein Fehler, und die letzte Datumsschranke vor der Bestellung gilt für jede Abholung — Mitternacht 1A, 6.4, 14, 15); 2026-09-23 (TNT Express 9:00 (Service 47) DE→DE freigegeben — über einen eng begrenzten PORTALpfad statt über die V2-API, weil der Carrier genau für diese ServiceID den V2-Buchungsaufruf ablehnt, während derselbe Service im Portal zum centgleichen Preis buchbar ist; zwei Schalter, beide aus; Same-Day und kostenpflichtige Zusatzabsicherung bewusst nicht freigegeben; Portaletiketten können asynchron entstehen 1A, 6.4, 14, 15); 2026-09-23 (UPS Express TG29 DE→DE freigegeben: die frühere ungeklärte Rechnungsposition „Collection" 2,00 € netto ist durch vier eigene Stagingbuchungen als feste Buchungskostenposition je Sendung belegt und liegt seither als kuratierter Providerkostenvertrag an genau einer Stelle im Einkauf; die Abholung am selben Tag der 29 bleibt ausdrücklich ungemessen und ist entfernt 1A, 6.4, 14, 15); 2026-09-23 (TG Effective Collection: ein wirksamer Abholtag und ein Preis, der zu ihm passt; zweiter, gebührenfreier Same-Day-Vertragstyp staginggebucht — DHL 84 und TNT 49 —, gebührenpflichtiger für UPS 26 je Abholung statt je Packstück; neues öffentliches Feld `collectionDateAdjusted`; „heute" backendweit als Kalendertag der Geschäftszeitzone 1A, 6.4, 8.4, 14, 15); 2026-09-19 (DHL-Abschluss TG84/TG85/TG87/TG107: 84/85/87 DE→DE und 107 DE→EU öffentlich buchbar vorbereitet, 107 mit bei jeder Buchung gemessenem Adressartvertrag, Abholtag-Rückfall auch für DHL, Trackingbedeutung carriergebunden, „Ref No“ auf DHL-Belegen als externe White-Label-Entscheidung 1A, 5.12, 6.4, 14, 15); 2026-09-19 (TG UPS Effective Collection Date: das Versanddatum ist der früheste Abholtag, 22/23/26 verschieben einen allein am Abholtag gesperrten Wunschtag auf den nächsten Versandtag 1A, 6.4, 14, 15); 2026-09-18 (UPS-Abschluss TG22/TG23/TG26: Transglobal-Fristen nach gemessenen Antwortzeiten, konfigurierbare TrackOrder-Frist, Laufzeitzeile je Anbieteraufruf, faire Auswahl im Transglobal-Trackingtakt 6.4, 14, 15, 21); 2026-09-18 (Druckvertrag mehrseitiger Providerbelege: TG85-Sichtevidenz, `page_count`, generischer Kundenhinweis, keine Seitenregel 1A, 6.4, 14, 15); 2026-09-18 (TG107 DHL Economy Select: kuratiert, quote_only, erste EU-Buchungsevidenz, Adressart bewusst unkuratiert 1A, 6.4, 14, 15); 2026-09-17 (DHL Zeitfamilie: 85/87 kuratiert, 86 ohne Angebot, Produktidentität als Schranke, TG87-Buchungsevidenz und Familienevidenz aus TG84+TG87 1A, 6.4, 14, 15); 2026-09-17 (DHL Foundation: TG84-Kuratierung, Art der Lieferadresse ohne Zuschlag, offener Transglobal-Latenzbefund 1A, 6.4, 14, 15, 21); 2026-09-17 (TG26-Freigabe UPS Standard Multi und TG29-Buchungsbefund 1A, 6.4, 14, 15); 2026-09-16 (UPS-Vervollständigung TG29/TG26 1A, 6.4, 14, 15; TG22/TG23-Same-Day-Grundvertrag 1A, 6.4, 8.4, 15); 2026-09-15 (TG23-Abschnitte 1A, 6.4, 14, 15; TG23-Staging-Smoke-Evidenz 1A, 6.4, 14); 2026-09-14 (TG22-Package-B-Abschnitte 1A, 6.4, 14, 15; TG22-Package-A-Abschnitte 6.4, 14, 15; TG22-Same-Day-Abschnitte 1A, 5.1, 6.4, 8.1, 8.4, 9.4, 14, 15; TG22-Residential-Abschnitte 1A, 5.1, 5.4, 5.5, 6.4, 8.1, 8.4, 9.4, 14, 15); 2026-09-13 (TG22-Golden-Offer-Contract-Abschnitte 5.1, 5.12, 6.4, 8.4, 15; Package-C-Abschnitte 5.11, 5.14, 6.2, 6.4, 14); Transglobal-Abschnitte 2026-09-11; übrige Abschnitte Stand 2026-09-09
- **Verified against Frontend `origin/main`:** `ba8e44c` plus Paket TG-22 (Branch `claude/tg22-reference-enablement`, wirksam nach Merge); Package-C-Abschnitte gegen Branch `claude/package-c-operations-reconciliation` (wirksam nach Merge); TG22-Golden-Offer-Contract-Abschnitte gegen Branch `claude/tg22-golden-offer-contract` (wirksam nach Merge); TG22-Residential-Abschnitte gegen Branch `feature/tg22-residential-pricing` auf `f745cc9` (wirksam nach Merge); TG22-Same-Day-Abschnitte gegen Branch `feature/tg22-same-day-colfee` auf `986963b` (wirksam nach Merge); TG22-Package-A-Abschnitte gegen Branch `feature/tg22-product-details` auf Basis `44403de` (wirksam nach Merge); TG22-Package-B-Abschnitte gegen Branch `feature/tg22-delivery-projection` auf Basis `e424750` (wirksam nach Merge); TG23-Abschnitte gegen Branch `feature/tg23-express-saver` auf Basis `e66ed64` (wirksam nach Merge); TG22/TG23-Same-Day-Grundvertrag gegen Branch `feature/tg-same-day-reason-contract` auf Basis `9fb5549` (gemergt, #430); UPS-Vervollständigung gegen Branch `feature/complete-transglobal-ups-family` auf Basis `bab50f5` (wirksam nach Merge); TG26-Freigabe gegen denselben Branch auf Basis `1893e96` (wirksam nach Merge); DHL-Foundation-Abschnitte gegen Branch `feature/dhl-foundation-tg84` auf Basis `07d7b2c` (gemergt); DHL-Zeitfamilie-Abschnitte ohne Frontendänderung; TG107-Abschnitte ohne Frontendänderung; Druckvertrag-Abschnitte gegen Branch `feature/dhl-print-contract` auf Basis `23c44e7` (wirksam nach Merge); UPS-Abschluss-Abschnitte gegen Branch `fix/ups-tg22-tg23-tg26-final-readiness` auf Basis `72892ae` (wirksam nach Merge); TG-UPS-Effective-Collection-Date-Abschnitte ohne Frontend-Codeänderung gegen `origin/main` `5d62b45` (Karte und Buchungsflächen lesen den Abholtag bereits aus `collectionDate`; im Frontend nur die Synchronisation dieses Dokuments und der Frontend-`CLAUDE.md`); DHL-Abschluss-Abschnitte ohne Frontend-Codeänderung gegen `origin/main` `8d92e60` (Buchbarkeit, zuschlagsfreie Adressartfrage, Abholtag und Trackingstand kommen aus den bestehenden Serverfeldern; ein unbekannter Trackingstand wird bereits nicht benannt; im Frontend nur die Synchronisation dieses Dokuments); Same-Day-End-to-End-Abschnitte ohne Frontend-Codeänderung gegen `origin/main` `49fe34a` (die gebührenfreie Abholung heute läuft über die bestehenden Serverfelder; im Frontend nur Paritätstests mit den echten Serverantworten und die Synchronisation dieses Dokuments); Portal-Tarife-Abschnitte (47/110/124) ohne Frontend-Produktionscodeänderung gegen `origin/main` `62b9e91` (Buchbarkeit, Übergabeart und Stückgrenze kommen aus den bestehenden Serverfeldern — die Grenze der 110 ausschließlich aus `tariffLimits`; im Frontend nur ein Governance-Test gegen eine ServiceID- oder Grenzweiche und die Synchronisation dieses Dokuments); Portal-Final-Closure-Abschnitte gegen Branch `fix/tg-portal-core-final` auf Basis `632eb33` (wirksam nach Merge: ein neuer öffentlicher Grund `address_details_too_long` in `utils/offerIdentity.mjs`, Paritätstest gegen die echten Serverformen von 47/110/124, keine ServiceID-Logik); Final-Bookability-Closure-Abschnitte gegen Branch `fix/final-bookability-closure` auf Basis `85e07aa` (wirksam nach Merge: Fehlerklassen „nichts beauftragt“, Abholtagsatz, Labelstand der Buchungsantwort, ausdrücklicher Labelabruf, Paketshop-Finder nur mit Serverfähigkeit, vier neue Sperrgründe, Feiertagshinweis; keine Anbieter- oder ServiceID-Weiche); Go-Live-Abschluss-Abschnitte (2026-09-29) ohne Frontend-Codeänderung gegen `origin/main` `f670636` (Kartenquelle aus dem ausgelieferten Produktionsbündel gelesen); TG-Final-Closure-Abschnitte (2026-09-29) ohne Frontend-Codeänderung gegen `origin/main` `d521c12` (Absicherungsaussage der Angebotskarte und Absicherungsmodul der Buchungsseite kommen aus `insuranceAvailable`/`insuranceDetails`; im Frontend nur die Synchronisation dieses Dokuments)
- **Verified against Backend `origin/main`:** `6e67fad` plus Paket TG-22 (Branch `claude/tg22-reference-enablement`, wirksam nach Merge); Package-C-Abschnitte gegen Branch `claude/package-c-operations-reconciliation` (wirksam nach Merge); TG22-Golden-Offer-Contract-Abschnitte gegen Branch `claude/tg22-golden-offer-contract` (wirksam nach Merge); TG22-Residential-Abschnitte gegen Branch `feature/tg22-residential-pricing` auf `5b6dfb3` (wirksam nach Merge); TG22-Same-Day-Abschnitte gegen Branch `feature/tg22-same-day-colfee` auf `4d60a23` (wirksam nach Merge); TG22-Package-A-Abschnitte gegen Branch `feature/tg22-product-details` auf Basis `b04a171` (wirksam nach Merge); TG22-Package-B-Abschnitte gegen Branch `feature/tg22-delivery-projection` auf Basis `18c559f` (wirksam nach Merge); TG23-Abschnitte gegen `origin/main` `2c4ef35` (Merge #356); TG23-Staging-Smoke-Evidenz gegen die Staging-App auf `2c4ef35`; TG22/TG23-Same-Day-Grundvertrag gegen Branch `feature/tg-same-day-reason-contract` auf Basis `e6f4436` (gemergt, #360); UPS-Vervollständigung gegen Branch `feature/complete-transglobal-ups-family` auf Basis `82b67a8` (wirksam nach Merge); TG29-Quote-Evidenz gegen die Staging-Umgebung (ein Full GetQuote, 2026-09-16); TG29-Buchungsbefund gegen die Staging-Umgebung (ein Full GetQuote, ein BookShipment, 2026-09-16); TG26-Freigabe gegen denselben Branch auf Basis `e9b74d6` (wirksam nach Merge) und TG26-Buchungsevidenz gegen die Staging-Umgebung (ein Full GetQuote, ein BookShipment, 2026-09-17); DHL-Foundation-Abschnitte gegen `origin/main` `afb9d2b` (Merge #362) und TG84-Evidenz gegen die Staging-Umgebung (Full GetQuotes 1274 und 1275, ein BookShipment DE0052580, 2026-09-17); DHL-Zeitfamilie-Abschnitte gegen `origin/main` `e048d23` (Merge #363); deren Kuratierung stammt aus den bereits erhobenen Staging-Quotes 1265 und 1275, die TG87-Evidenz aus der Staging-Umgebung (ein Full GetQuote 1276, ein BookShipment DE0052581, 2026-09-17); TG107-Abschnitte gegen Branch `feature/dhl-economy-select-107` auf Basis `e048d23` (wirksam nach Merge) und TG107-Evidenz gegen die Staging-Umgebung (ein Full GetQuote 1277, ein BookShipment DE0052582, 2026-09-18); Druckvertrag-Abschnitte gegen Branch `feature/dhl-print-contract` auf Basis `a22fb24` (wirksam nach Merge) und die TG85-Sichtevidenz gegen die Staging-Umgebung (ein Full GetQuote 1282, ein BookShipment DE0052583, 2026-09-18; die Belege wurden lokal gesichert und offline gerendert, ohne weiteren Providerrequest); UPS-Abschluss-Abschnitte gegen Branch `fix/ups-tg22-tg23-tg26-final-readiness` auf Basis `2272672` (wirksam nach Merge; kein Providerrequest — die Fristen stützen sich auf die bereits erhobenen Staging-Messungen); TG-UPS-Effective-Collection-Date-Abschnitte gegen Branch `feature/tg-ups-effective-collection-date` auf Basis `ebdd6a0` (wirksam nach Merge; kein Providerrequest — die Regel stützt sich auf den datumslosen GetQuote und die bestehende Kalenderregel); DHL-Abschluss-Abschnitte gegen Branch `feature/dhl-84-85-87-107-live-booking` auf Basis `aeb7787` (wirksam nach Merge; kein Providerrequest — die Freigabe stützt sich auf die bereits erhobene Staging-Buchungsevidenz DE0052580, DE0052581, DE0052582 und DE0052583); Same-Day-End-to-End-Abschnitte gegen Branch `fix/effective-collection-same-day` auf Basis `4123b0e` (wirksam nach Merge; kein Providerrequest — die Korrektur stützt sich auf die bereits erhobene Staging-Evidenz DE0052637 und DE0052638); Portal-Tarife-Abschnitte (47/110/124) gegen Branch `fix/tg-portal-core-final` auf Basis `a844145` (wirksam nach Merge), gemessen an den gespeicherten Portalaufrufen der Oberfläche vom 2026-09-19 bis 2026-09-23 und am Staging-Portal (2026-09-25, ausdrücklich freigegeben): Erfassung des Zahlschritts ohne Zahlung, Trockenläufe bis zur Warenkorbprüfung, Negativkontrollen ohne Zahlung und genau drei Staging-Buchungen DE0052648 (124), DE0052649 (110, zwei Packstücke) und DE0052650 (47); Produktion unberührt; Portal-Final-Closure-Abschnitte gegen denselben Branch auf Basis `7979d39` (wirksam nach Merge; kein Providerrequest — Adressgrenze aus dem erfassten Portalbefund und den gelesenen Seitenskripten, Seitengrößen aus den gesicherten Etiketten, Laufzeiten aus den S4-Läufen); Final-Bookability-Closure-Abschnitte gegen Branch `fix/final-bookability-closure` auf Basis `37be9bd` (wirksam nach Merge; kein Providerrequest, keine Buchung — alle Nachweise über Attrappen, die echten Routen und eine lokale PostgreSQL-Wegwerfdatenbank); Go-Live-Abschluss-Abschnitte (2026-09-29) gegen Branch `fix/jumingo-label-set-integrity` auf Basis `108eb06` (wirksam nach Merge; kein Providerrequest — Negativkontrollen gegen den echten Resolver und PostgreSQL); TG-Final-Closure-Abschnitte (2026-09-29) gegen Branch `fix/tg-final-closure` auf Basis `60b588b` (wirksam nach Merge; kein Providerrequest, keine Buchung — Kuratierung, Kundensicht und Portalkern über `tests/tg-final-closure.test.js` mit Mutationsgegenprobe; die TNT-Angaben aus der Matrix auf `main` und der Stagingevidenz DE0052630/31/32/34 vom 2026-09-22)
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

**Betreiberentscheidung 2026-10-05 — Portfolio ist nicht Live-Welle (gilt vor der Entscheidung vom 2026-10-01 darunter):** Die Begriffe sind strikt getrennt. **TG-Kundenportfolio** = jeder kuratierte Service der Matrix, ausdrücklich einschließlich **86** und **137**. **Erste TG-Live-Aktivierungswelle** = genau die 14 Services UPS 22, 26, 29 · DPD 124 · GLS 110 · DHL 84, 85, 87, 107 · TNT 41, 44, 47, 48, 49. **Technisch integriert / vorbereitet** heißt nicht live aktiviert. **Live-Aktivierung** erfolgt nur nach ausreichender Verifikation und ausdrücklicher Betreiberentscheidung. 86 und 137 bleiben Teil des Portfolios — nicht entfernen, nicht zurückbauen, ihre Evidenz, Integration, Adapter und Tests bleiben erhalten —, sind aber nicht Teil der ersten Welle: **bis zu ihrer jeweiligen ausdrücklichen Freigabe sind sie weder sichtbar (kein Angebot, auch kein `quote_only`) noch buchbar.** Technisch trägt das je ein eigener Produktfreigabeschalter (`TG86_PUBLIC_RELEASE_ENABLED`, `TG137_PUBLIC_RELEASE_ENABLED`, opt-in, nur exakt `"true"`; 6.4, 13.4). Produktfreigabe und technischer Buchungsweg sind getrennte Verantwortlichkeiten: für 137 bleibt `TG137_PORTAL_ADAPTER_ENABLED` zusätzlich der technische Adapterschalter. In künftigen Audits ist das Vorhandensein oder die technische Buchbarkeit von 86/137 **kein Scope-Verstoß an sich**; zu prüfen ist, ob ihre Aktivierung kontrolliert ist und nicht unbeabsichtigt mit der ersten Welle geschieht.

**Betreiberentscheidung 2026-10-01 — DPD Launchportfolio (eingeordnet durch die Entscheidung vom 2026-10-05: „Launch“ heißt hier Portfolio, nicht erste Live-Welle):** Transglobal Service **137 (DPD Classic)** gehört neben Service **124 (DPD PaketShop)** ausdrücklich zum Launch. Für 137 gilt ausschließlich der belegte Umfang: **DE→DE, genau ein Packstück, Fahrerabholung, Portalbuchungsweg**. Die vorhandene Provider-Evidenz S137A und DE0052658 belegt Abholgruppe, Buchung, DPD-AWB und Versandlabel. Service 137 ist damit kein unerwünschtes Warehouse-/Zwischenumschlagmodell. Die tatsächliche Aktivierung der Runtime-Schalter bleibt eine volatile Betriebsinformation und ist bei Bedarf aktuell zu prüfen.

Transglobal-Angebote dürfen Kunden sichtbar sein. Außer dem Referenzservice 22, dem Standardversand Mehrpaket (Service 26) und — seit dem DHL-Abschluss (2026-09-19, wirksam nach Merge) — DHL Domestic Express (Service 84) samt seiner Zeitvarianten 85 und 87 (DE→DE) sowie DHL Economy Select (Service 107, DE→EU, siehe unten) und — seit der TNT-Freigabe (2026-09-22) — TNT Economy Express (41) und TNT Express (44), beide DE→EU, sowie TNT Express 10:00 (48, höchstens zwei Packstücke) und TNT Express 12:00 (49), beide DE→DE, alle vier nur an einen Geschäftsempfänger (Firmenname), und — seit 2026-09-23 — UPS Express (Service 29, DE→DE) sowie — seit den Portal-Tarifen (2026-09-25, wirksam nach Merge, hinter eigenen Schaltern) — TNT Express 9:00 (47), GLS Pick&Ship (110, genau ein Packstück) und DPD PaketShop (124), alle DE→DE, und — seit der TG Staging Final Closure (2026-09-29, wirksam nach Merge) — DHL Domestic Express 10:30 (86, DE→DE, höchstens zwei Packstücke) sowie DPD Classic (137, DE→DE, ein Packstück, über den Portalpfad hinter eigenem Schalter), sind sie quote_only und nicht buchbar. Der Expressversand (Service 23) ist seit 2026-09-23 aus dem Kundenangebot zurückgezogen (`offerEnabled: false`, kein Angebot). Service 86 war bis zur TG Staging Final Closure **überhaupt nicht sichtbar**, weil unbelegt war, welches Carrierprodukt er benennt; seit der Staging-Buchung DE0052654 ist das Produkt belegt (siehe unten). **Seit 2026-10-05** stehen 86 und 137 zusätzlich hinter ihrer Produktfreigabe (oben): ohne sie entsteht aus ihnen kein Angebot — auch kein `quote_only` — und keine Buchung, gleich welche übrigen Schalter gesetzt sind.

Die UI muss diesen Zustand korrekt kommunizieren und darf Nicht-Buchbarkeit nicht verschleiern.

Ein Transglobal-Angebot erscheint nur mit belegter Kontowährung EUR (`TRANSGLOBAL_ACCOUNT_CURRENCY`); ein Betrag unbekannter Währung wird nie mit Euro-Zeichen angezeigt. Seit 2026-10-10 (wirksam nach Merge) zusätzlich nur für eine Anbieter-ServiceID, die der Servicekatalog der Umgebung (`TRANSGLOBAL_SERVICE_CATALOG`, 6.4) einem kuratierten Produkt zuordnet — so erscheint kein Produkt unter dem Namen eines anderen, nur weil der Anbieter in Live und Staging dieselbe Nummer verschieden belegt.

### Transglobal-Buchung

**Status: PRODUCT_DECISION** (bestätigt 2026-09-11)

- Referenzservice ist **Service 22 (UPS Standard Single)**. Öffentliche Buchbarkeit ist technisch vorbereitet, **ausschließlich DE→DE**, ein Paket, Abholung an einem Tag nach heute oder als Abholung am selben Tag (siehe unten).
- **Service 23 (UPS Express Saver, kundenseitig „UPS · Expressversand")** folgt dem Referenzservice 22 als Golden Reference Standard (bestätigt 2026-09-15, TG23): dieselbe Fähigkeitsstruktur — DE→DE öffentlich buchbar vorbereitet, DE→EU Preisauskunft, Preisklasse EXPRESS mit dem Expressaufschlag des Kontos (ohne gültigen Wert der Standardaufschlag), höchstens ein Packstück als CE-Launchgrenze, höchstens 70 kg je Packstück, Art der Lieferadresse nach der Auswahl, Abholung am selben Tag, Transportabsicherung nach Warenwert, voraussichtliche Lieferung (Laufzeit „1": ein Tag), Tracking, Label „PDF · DIN A4 / Thermodruck", Kurzbeschreibung „Schneller Expressversand für eilige Sendungen.". Keine Zustelluhrzeit, keine Garantie; Carrier UPS sichtbar, Einkaufsquelle nie. Status: implementiert (Backend gemergt); **Staging-Smoke bestanden, Buchungsevidenz des Anbieters bestätigt** (2026-09-15: ein GetQuote, ein BookShipment mit Abholung am selben Tag, Privatadresse und Absicherung — Anbieterrechnung netto = TotalCost + Same-Day-Gebühr + Absicherung auf den Cent, Absicherung steuerfrei, Labels A4 und Thermal mit derselben AWB).
- **UPS-Inventar** (bestätigt 2026-09-16, aktualisiert 2026-09-17): Transglobal führt für UPS genau die Services 22, 23, 26 und 29. **Service 22: DONE** (Referenzservice). **Service 23: DONE** (Staging-Buchungssmoke bestanden). **Service 26: DONE** (TG26 — Staging-Buchungssmoke bestanden, freigegeben für den belegten Umfang). **Service 29: DONE** (2026-09-23 — vier eigene Stagingbuchungen, freigegeben für DE→DE mit Folgetagsabholung, siehe unten).
- **Service 29 (UPS Express, kundenseitig „UPS · Express") — Implementierung vollständig, Buchungsfreigabe evidenzgebunden** (bestätigt 2026-09-16): dieselbe Fähigkeitsstruktur wie Service 23 (Preisklasse EXPRESS mit dem Expressaufschlag des Kontos, Art der Lieferadresse nach der Auswahl, Abholung am selben Tag, Transportabsicherung nach Warenwert, Tracking, Label „PDF · DIN A4 / Thermodruck", Kurzbeschreibung „Schneller Expressversand für eilige Sendungen.", voraussichtliche Lieferung als Werktagsprognose ohne Uhrzeit), aber ausschließlich mit belegten Werten: höchstens ein Packstück als CE-Grenze; kein Höchstgewicht, kein Volumendivisor, keine Länge, kein Gurtmaß, keine Zeitzusage. Der Name „Express" ist neutral und innerhalb von UPS eindeutig (neben „Expressversand" der 23), ohne „10:30", „12:00", „vormittags" oder „garantiert", und entspricht dem CE-Tarifnamen des JUMiNGO-Pendants „EXPRESS ®". **Freigegeben 2026-09-23 für DE→DE — der belegte Folgetagsumfang.** Vier weitere eigene Stagingbuchungen haben die früher ungeklärte Position „Collection" über 2,00 € netto isoliert: DE0052640 (privat, Absicherung 500/20, Rechnung 39,01), DE0052641 (privat, ohne Absicherung, 29,01), DE0052642 (geschäftlich, ohne Absicherung, 26,36) und DE0052644 (geschäftlich, ZWEITE Route 63741 → 20095, 26,36). Sie ist damit unabhängig von Adressart, Zusatzabsicherung, Zielzone und Rechnungshöhe: eine feste **Buchungskostenposition je SENDUNG** — nie je Packstück —, die der Anbieter vor der Bestellung in keiner Antwort ausweist (kein `COL` im Breakdown, Preis mit = ohne Abholung; im Webportal alle Abholgebührfelder 0, Steuerprobe in allen fünf Fällen 19 % auf die Basis einschliesslich der Position). Sie ist deshalb **kein Quote-Zuschlag, sondern eine gemessene Eigenschaft des EINKAUFS** und steht an genau einer Stelle (`config/transglobalProviderBookingFee.js`, deny by default, Fail-Fast beim Laden, ausschliesslich DE→DE). Von dort geht sie über dieselbe Funktion in den Einkauf ein, die auch eine Same-Day-Gebühr addiert — also vor Aufschlag, MwSt., gebundenem Kundenpreis und Rechnungserwartung, und in beide Richtungen: bleibt sie eines Tages aus, meldet die bestehende Rechnungsprüfung `provider_charged_less`, ohne die Buchung oder den bestätigten Kundenpreis anzutasten. Keine Pauschale, kein Puffer, keine zweite Zahl im Mapper, im Buchungsweg, in der Preisfunktion oder im Frontend; `lib/pricing.js` bleibt unverändert. **Nicht freigegeben: die Abholung am selben Tag.** Gemessen sind ausschliesslich Folgetagsabholungen; ob der Anbieter an einem heutigen Abholtag diese Position zusätzlich zur Same-Day-Gebühr stellt oder statt ihrer, ist offen — beide Varianten sind mit der Evidenz vereinbar. Der `sameDayCollection`-Vertrag der 29 ist deshalb **entfernt**: ein heutiger Wunschtag verschiebt sich über den Abholtag-Rückfall sichtbar auf den nächsten Versandtag (`collectionDateAdjusted`), „Abholung heute" erscheint für die 29 nicht, und der Preis ist an jedem Tag derselbe. Die Wiederaufnahme ist genau das Wiedereinsetzen dieses Blocks nach einem eigenen Same-Day-Staginglauf. Ebenfalls unverändert nicht freigegeben: DE→EU — dort ist nichts gebucht worden.
- **Service 26 (UPS Standard Multi, kundenseitig „UPS · Standardversand Mehrpaket") — DONE, öffentlich buchbar für genau den belegten Umfang** (bestätigt 2026-09-17, TG26): Staging-Buchungssmoke bestanden (Full Quote 1267, BookShipment DE0052578 — zwei gleiche Packstücke, Privatadresse, Absicherung, späterer Abholtag; Anbieterrechnung = Fracht + einmal Zuschlag Privatadresse + Absicherung auf den Cent, keine weitere Position). Freigegeben: ausschließlich DE→DE, höchstens zwei Packstücke (CE-Launchgrenze aus der Evidenz — mehr ist nicht belegt), N gleiche Packstücke nach dem CE-Modell „Identische Pakete" in stabiler Reihenfolge (Angebotsidentität und Revalidierung binden Stückzahl, Maße und Gewicht), Preisklasse STANDARD, Art der Lieferadresse nach der Auswahl (der Zuschlag kommt aus dem frischen Full Quote; gemessen einmal je Sendung), Transportabsicherung nach Warenwert, Tracking und Druckpflicht. Belege wie gemessen: ein A4- und ein Thermodruck-PDF mit je einer Seite je Paket („Versandlabel (A4)", „Versandlabel (Thermodruck)"). Nicht freigegeben: Höchstgewicht, Volumendivisor, Produktprofil, voraussichtliche Lieferung (die Karte zeigt die Laufzeit „1–5 Tage"), EU-Routen. **Abholung am selben Tag freigegeben (2026-09-23, TG Effective Collection, wirksam nach Merge):** eigene Staging-Buchung am Abholtag mit ZWEI Packstücken — die Anbieterrechnung ist das Quote-Netto plus genau der COLFEE-Satz dieses Quotes, **einmal je Abholung und nicht je Packstück**; die Gebühr wird deshalb nie mit der Stückzahl multipliziert. Die Staging-Platzhalter-Sendungsnummer ist keine Aussage über Produktion: Belege, Tracking und Sendungsliste verarbeiten eine wie mehrere Sendungsnummern generisch („Versandlabel 1 von N (A4)" usw., nur echte Anbieterlabels, keine Dubletten), ohne ServiceID-Weiche und ohne Eingriff in Carrier-PDFs.
- **Service 84 (DHL Domestic Express, kundenseitig „DHL Express · Domestic Express") — vollständig kuratiert, seit dem DHL-Abschluss DE→DE öffentlich buchbar vorbereitet** (bestätigt 2026-09-17, DHL Foundation; freigegeben 2026-09-19, wirksam nach Merge): Staging-Buchungssmoke bestanden (Full Quote 1275, BookShipment DE0052580, Anbieterrechnung INV-0040781 — zwei gleiche Packstücke je 2 kg, Geschäfts- an Privatadresse, Direktabholung am nächsten Werktag, Absicherung 500/20; Rechnung = Fracht + Absicherung + übriger Bestandteil ISC auf den Cent, keine Position „Collection", kein Zuschlag Privatadresse, Absicherung steuerfrei; ein A4- und ein Thermal-PDF mit je drei Seiten, zwei DHL-Stücknummern und eine gemeinsame Sendungsnummer, die die Trackingreferenz ist). Kuratiert ist genau das Belegte: Preisklasse EXPRESS, Abholung beim Absender, nur DE→DE, höchstens zwei Packstücke (CE-Launchgrenze), Tracking, Druckpflicht, Transportabsicherung und die Art der Lieferadresse als Frage OHNE Zuschlag (siehe nächster Punkt). Nicht kuratiert: Höchstgewicht, Maße, Volumendivisor, Produktprofil und Ausschlüsse, Zeit- oder Lieferzusage, CE-Prognose, Stücknummern. **Abholung am selben Tag freigegeben (2026-09-23, TG Effective Collection, wirksam nach Merge):** eigene Staging-Buchung am Abholtag — die Anbieterrechnung ist centgenau das Quote-Netto, ihre Positionen sind exakt der Quote-Breakdown, **ohne jede zusätzliche Abholposition**. Damit ist der zweite Vertragstyp belegt: Abholschluss ja, Gebühr nein (siehe „Abholung am selben Tag"). 85 und 87 leiten ihn aus derselben technischen Familie ab; 86 (am selben Tag nicht gemessen) und 107 (DE→EU, eigener Abholvertrag) erben ihn nicht. ISC (im Staging als Testzuschlag bezeichnet, 50,50 € je Packstück) ist ein Stagingbefund: ein gewöhnlicher Preisbestandteil des frischen Quotes, ohne Sonderregel und ohne Betrag im Code; seine Produktionsbedeutung ist offen. **Freigabe (DHL-Abschluss 2026-09-19):** allein der Wechsel der beiden Freigabefelder (`publicBookable: true`, `publicBookableScopes: [DE_DOMESTIC]`); die beiden offenen Punkte sind ohne Sonderlogik aufgelöst — ISC bleibt Teil des Anbieterpreises (jeder frische Quote ist die Quelle; eine Abweichung ist eine gewöhnliche Preisdrift mit `PRICE_CHANGED`), und die an UPS gemessene Bedeutung der Trackingcodes gilt nicht mehr für DHL (siehe „Trackingbedeutung ist carriergebunden").
- **Services 85 und 87 (DHL Domestic Express 9am / 12pm, kundenseitig „DHL Express · Domestic Express 9:00" bzw. „… 12:00") — vollständig kuratiert, seit dem DHL-Abschluss DE→DE öffentlich buchbar vorbereitet** (bestätigt 2026-09-17, DHL Zeitfamilie; freigegeben 2026-09-19, wirksam nach Merge): dieselbe Kuratierung wie die 84 (EXPRESS, Direktabholung, nur DE→DE, höchstens zwei Packstücke, Tracking, Druckpflicht, Transportabsicherung, Art der Lieferadresse ohne Zuschlag), belegt aus denselben Staging-Quotes 1265 und 1275 — dort trägt jede der Zeitvarianten **nur Fracht** im Breakdown: kein Zuschlag Privatadresse trotz privater Zustelladresse, keine Abholposition, kein Sperrgut und **kein ISC** (das ISC ist damit ein Befund der 84 und keine Familienregel).
- **Service 87 — Staging-Buchungssmoke bestanden** (bestätigt 2026-09-17, TG87-Evidenz): Full Quote 1276, BookShipment DE0052581, Anbieterrechnung INV-0040782 — zwei gleiche Packstücke je 2 kg, Geschäfts- an Privatadresse, Direktabholung am nächsten Werktag, Absicherung 500/20. Quote: Fracht 22,54 als einziger Bestandteil, kein ISC, kein Zuschlag Privatadresse, keine Abholposition, kein Sperrgut, With = Without, Absicherung 10,00 als Extra. Rechnung: Fracht + Absicherung = 32,54 netto, Steuer 4,28 nur auf den Versand, brutto 36,82 — centgenau, ohne Position „Collection", ohne Zuschlag Privatadresse, ohne unbekannte Position, ohne Abweichung. Belege: ein A4- und ein Thermal-PDF mit je drei Seiten, **eine gemeinsame Sendungsnummer** und zwei DHL-Stücknummern (eine je Paket), eine Trackingreferenz.
- **Service 85 — Staging-Buchungssmoke bestanden** (bestätigt 2026-09-18, TG85-Evidenz aus dem Druckvertrag; die frühere Aussage „85 hat keine eigene Buchungsevidenz" ist damit überholt): Full Quote 1282, BookShipment DE0052583, Anbieterrechnung INV-0040784 — zwei gleiche Packstücke, Direktabholung, Absicherung 10,00. Quote: Fracht 49,74 als einziger Bestandteil (kein ISC, keine weitere Position). Rechnung: Fracht + Absicherung = 59,74 netto, Steuer 9,45 nur auf den Versand, brutto 69,19 — centgenau, ohne Abweichung. Belege: A4 und Thermal mit je drei Seiten (zwei Etiketten, ein Waybill Doc „[I] EXPRESS 9:00 (32)"), eine gemeinsame Sendungsnummer. **Seit dem DHL-Abschluss (2026-09-19) sind 85 und 87 wie die 84 DE→DE öffentlich buchbar vorbereitet** — allein durch den Wechsel der beiden Freigabefelder; die Namen bleiben „Domestic Express 9:00" / „… 12:00" (keine Namensänderung auf Vermutung), die Uhrzeit bleibt Identität, keine Zusage.
- **Die Zeitzusage existiert nicht — sie wurde gesucht und nicht gefunden** (bestätigt 2026-09-17, TG87-Evidenz): eine Prüfung der gesamten Anbieterantwort auf Zeit-, Liefer- und Zusagefelder ergab für die 87 **genau ein** Zeitfeld (die Laufzeitschätzung „1") und **keine einzige** strukturierte Zusage — kein Lieferdatum, keine Lieferzeit, keine Garantie, keine Geld-zurück-Aussage, keine Meldung. Die einzige weitere Uhrzeit der Antwort ist der Abholschluss, also Abholung statt Zustellung. Auf dem Carrier-Beleg steht dagegen sichtbar „12:00": der Carrier führt die Uhrzeit selbst als Produktbezeichnung. Beides zusammen ist der Beleg für die Produktentscheidung im nächsten Punkt.
- **Die Uhrzeit im Produktnamen ist eine Identität, keine Zusage** (Produktentscheidung 2026-09-17, DHL Zeitfamilie; durch die TG87-Buchungsevidenz bestätigt): weder Anbieterantwort noch Portaltext nennt für die Zeitvarianten eine Zustellzeit — belegt ist allein, **wie der Anbieter das Produkt nennt**. Kundennamen tragen die Uhrzeit deshalb als Teil des Produktnamens („Domestic Express 9:00"), niemals als Versprechen („Zustellung bis …"), und nie eine Garantie oder Geld-zurück-Aussage. Eine Uhrzeit darf nur erscheinen, wenn sie belegt ist: die Schreibweise folgt dem deutschen Katalog desselben Carriers, in dem dieselbe Zeit als kuratiertes Gegenstück geführt wird.
- **Service 86 (DHL Domestic Express 10am, kundenseitig „DHL Express · Domestic Express 10:30“) — Produkt belegt, seit der TG Staging Final Closure DE→DE öffentlich buchbar vorbereitet** (Produktentscheidung 2026-09-17, DHL Zeitfamilie; aufgelöst 2026-09-29, wirksam nach Merge): der Anbieter nennt ihn „10am“, der Katalog desselben Carriers kennt 9:00, **10:30** und 12:00 — eine 10:00 kommt darin nicht vor. Bis zum Beleg blieb die Gleichsetzung mit der 10:30-Variante ausdrücklich abgelehnt und die 86 ohne Angebot (Bestandsdiagnose `product_identity_unverified`). **Aufgelöst durch eine Buchungsevidenz, die das Produkt benennt** (ausdrücklich freigegeben, Staging, ein GetQuote, ein BookShipment): Quote 1513, Buchung DE0052654 — zwei gleiche Packstücke, Direktabholung am nächsten Werktag, Absicherung 500/20; Anbieterrechnung INV-0040819 = Fracht 33,74 + Absicherung 10,00 (eigene steuerfreie Position) = 43,74 netto, Steuer 6,41 nur auf die Fracht, centgenau ohne Abweichung; das DHL-Etikett druckt die Produktzeile „[O] EXPRESS 10:30 (33)“, A4 und Thermal mit derselben Sendungsnummer, die die Trackingreferenz ist. Die 86 ist damit das Carrierprodukt „EXPRESS 10:30“ und heißt kundenseitig „Domestic Express 10:30“ — die Uhrzeit als Identität, keine Zusage; „bis 10 Uhr“ erscheint nirgends. Kuratiert ist genau das Belegte: EXPRESS, Direktabholung, nur DE→DE, höchstens zwei Packstücke (CE-Launchgrenze wie 84/85/87), Tracking, Druckpflicht, Transportabsicherung, die Art der Lieferadresse ohne Zuschlag (14 Staging-Quotes: privat = geschäftlich, nur Fracht) und der früheste Abholtag. **Nicht** übernommen: die Abholung am selben Tag (für die 86 nicht gemessen und nicht aus 85/87 abgeleitet — ein heutiger Wunschtag rückt auf den nächsten Versandtag), Höchstgewicht, Maße, Zeit- oder Lieferzusage. Produktpaar mit dem JUMiNGO-Tarif „EXPRESS DOMESTIC 10:30“ aus demselben Carrierbeleg (6.5). Der Sperrgrund `product_identity_unverified` bleibt als Mechanismus der Service-Policy bestehen; kein Eintrag der Matrix trägt ihn mehr. **Portfolio, nicht erste Live-Welle (2026-10-05):** ohne `TG86_PUBLIC_RELEASE_ENABLED` weder Angebot noch Buchung; die globalen Transglobal-Schalter, die 84/85/87 freigeben, geben die 86 nicht frei.
- **Art der Lieferadresse ohne Zuschlag** (bestätigt 2026-09-17, DHL Foundation): ein Service kann die Adressart erheben und dem Anbieter übermitteln, ohne dass ein Zuschlag Teil des belegten Anbietervertrags ist. Beide Szenarien tragen dann centgenau denselben Preis; kein Zuschlag wird angekündigt, berechnet oder gebucht. Taucht im frischen Quote dennoch ein Zuschlag oder eine andere Preisdifferenz zwischen Geschäfts- und Privatadresse auf, ist das ein Vertragswechsel: nicht bepreisen, nicht buchen, bis der Vertrag neu geprüft ist. Der Modus ist generisch (keine ServiceID-Weiche) und für jeden Carrier nutzbar; seit der DHL Zeitfamilie tragen ihn die Services 84, 85 und 87, seit dem DHL-Abschluss auch 107, außerdem die TNT-Dienste 41, 44, 47, 48 und 49 und die 124 (Stand der Matrix 2026-09-29) und seit der TG Staging Final Closure die 86 (14 Staging-Quotes: privat = geschäftlich, nur Fracht).
- **Service 47 (TNT Domestic Express 9am, kundenseitig „TNT · Express 9:00") — DE→DE freigegeben, aber über den PORTALpfad** (bestätigt 2026-09-23): Die 47 ist der einzige Service im Bestand, bei dem sich Quote und Bestellung widersprechen. Der V2-Quote bietet ihn an (netto 31,93); der V2-Buchungsaufruf endet mit `Status FAIL`, „Carrier Error: An invalid service has been entered" (FailReference 52633) — kein Auftrag, keine Rechnung, kein Label. Im Webportal ist derselbe Service buchbar: eigene Stagingbuchung DE0052643, netto 31,93 · MwSt. 6,07 · brutto 38,00 — **centgenau das Netto des V2-Quotes**. Der Grund ist gemessen und keine Vermutung: V2 und Portal wählen das Produkt über zwei verschiedene Schlüssel. Der Portalserver bildet je Warenkorbauftrag serverseitig ein `webBookingService` (47 → 8, 49 → 10); dieser Wert steht in keiner V2-Antwort, in keiner Zeile der V2-Dokumentation, und der Client sendet ihn nie — er ist Evidenz über den Portalserver, kein Requestparameter. Gebucht wird die 47 deshalb über denselben generischen Transglobal-PORTAL-Flow wie 110 und 124 (ein dritter Binder, kein zweiter Ablauf: dieselbe Gesamtfrist, dieselbe centgenaue Preisprüfung vor dem Point of no return, genau ein `CompleteOrder`, kein Retry, eigene Idempotenztabelle). **Zwei Schalter, beide standardmäßig aus:** ohne den Portaladapter gäbe es keinen Bestellweg, ohne den Label-Nachlauf könnte eine bezahlte Buchung ohne kundenverfügbares Etikett entstehen — das Portal erzeugt Etiketten nachweislich asynchron. Kuratiert ist genau das Gemessene: genau ein Packstück, Geschäftsempfänger (Firmenname, keine Adressart), Art der Lieferadresse erhoben und zuschlagsfrei, Tracking und Druckpflicht. **Nicht freigegeben und ausdrücklich nicht abgeleitet:** die Abholung am selben Tag (die 48/49 tragen sie gebührenfrei; die 47 hat einen eigenen Bestellweg, für den nichts am selben Tag gemessen ist — ein heutiger Wunschtag rückt über den Abholtag-Rückfall auf den nächsten Versandtag) und die kostenpflichtige Zusatzabsicherung (in der TNT-Familie belegt für 41, 44, 48 und 49, je über den V2-Weg; der Portalweg der 47 kennt nur die kostenlose Standardabsicherung).
- **Der Portalpfad (47, 110, 124) — Zahl- und Adressschritt belegt, je eine Staging-Buchung** (Befund und Produktentscheidung 2026-09-25, Portal-Tarife, wirksam nach Merge): Der gemeinsame Portalkern war nie gegen das echte Portal gelaufen. An den gespeicherten Portalaufrufen der Oberfläche gemessen (2026-09-19 bis 2026-09-23), wichen seine Anfragen an mehreren Stellen ab — Rates-Formular, Serviceauswahl samt Stapelbarkeit (bei der 47 der Schalter eines Zuschlags von 80,00 €), Adressschritt, Packliste, Übersicht mit Warenprüfung, Abhol- und Absicherungsauswahl, Bestätigungskette; er folgt jetzt der belegten Reihenfolge, Zeichen für Zeichen gegen die erfassten Anfragen geprüft. **Harte Regel vor jeder Zahlung:** die Portalzahlung begleicht den GANZEN Warenkorb (belegt: eine Zahlung erfasste fünf Aufträge). Bezahlt wird deshalb nur, wenn der Warenkorb vor dem Aufbau leer war, danach genau den eigenen Auftrag dieses Versuchs enthält — Kennung, Service, Preis centgenau gleich dem revalidierten Einkauf, Warenkorbsummen gleich diesem einen Auftrag, keine Treuepunkte, kein Zusatzbetrag — und die Zahlungsseite danach genau diesen einen Auftrag nennt; eine Kontosperre lässt je Portalkonto nur einen Buchungsversuch zu. Fremde Aufträge werden nie bezahlt und nie entfernt; ein Abbruch vor der Zahlung entfernt ausschließlich den eigenen Auftrag und setzt den Versuch kontrolliert zurück — auch beim Fristablauf: der Aufbau endet 10 s vor der Gesamtfrist (Aufräumreserve), das Entfernen läuft noch innerhalb der Frist; nach dem Zahlungsschritt wird nie aufgeräumt. Kein mutierender Request geht zweimal hinaus — auch nicht über eine stille Neuanmeldung. Die Sendungsnummer des Carriers wird unabhängig vom Etikett festgehalten. **Zahlschritt belegt:** der Wert, der die Zahlung trägt (`ResponseGuid`), kommt aus der Antwort der Warenkorbprüfung (`isValid`/`responseGuid`, erfasst samt Seitencontroller); gezahlt wird nur bei ausdrücklichem `isValid` und GUID-förmigem Wert — nie geraten, nie erzeugt, nie aus einem früheren Lauf. **Adressschritt belegt:** das Portal prüft Abhol- und Zustelladresse vor dem Absenden, danach werden die gespeicherten Adressen bei jeder Buchung zurückgelesen und gegen die Sendung verglichen, einschließlich „keine Tracking-Mail des Anbieters an den Empfänger" (White Label); die Adressen kommen über dieselbe Zuordnung wie beim V2-Weg. Vor- und Nachname zusammen höchstens 21 Zeichen und die Feldlängen der Portalseite gelten **schon im Vergleich** — dieselbe Prüfung auf denselben gespeicherten Adressen, die der Portalkern vor jedem Providerkontakt rechnet (Schranke P, `portal/addressContract.js`), nie gekürzt: eine zu lange Angabe macht das Angebot sichtbar, aber nicht auswählbar (`address_details_too_long`, neutraler Kundentext mit Handlungshinweis, ohne Anbieter, ohne Zahl). Gezählt wird konservativ **mit** Leerzeichen: das Portal nennt die Grenze nur serverseitig, seine Zählweise ist nicht belegt (abgelehnt 23 Zeichen, angenommen 17) — es wird keine genauere Zahl behauptet. **Staging-Evidenz 2026-09-25 (ausdrücklich freigegeben):** je eine Buchung 124 (DE0052648, gebundener Paketshop), 110 (DE0052649, zwei Packstücke, Fenster 09–17) und 47 (DE0052650, Firmenempfänger, frühestes Fenster des gebundenen Tages) — Portalpreis = revalidierter Einkauf = Warenkorbsumme centgenau, das Prepaid-Guthaben sank je Buchung um genau den Warenkorbbruttobetrag (6,03 / 18,37 / 38,00 €), genau eine Zahlung und ein Abschluss je Buchung, Referenz der Bestätigung = erfasster Auftrag; dazu Negativkontrollen ohne Zahlung (Preis +0,01 €, abgelaufene Frist, unklarer Ausgang nach Zahlungsbeginn, paralleler zweiter Versuch, fremder Warenkorbeintrag). **Die 110 ist zentral auf genau ein Packstück begrenzt** (TG110 Single-Package-Korrektur 2026-09-30, Matrix und Binder; die frühere Zwei-Paket-Buchung DE0052649 bleibt historische Protokollevidenz). 47, 110 und 124 sind DE→DE öffentlich buchbar vorbereitet hinter ihren Portalschaltern und — 47 und 124 — `TG_PORTAL_LABEL_RECOVERY_ENABLED` (alle default aus; die 110 seit der TG110 Final Closure ohne Nachlaufschalter, siehe Labelvertrag unten); die Schranke B3d (`portal_payment_contract_unproven`) bleibt als Sicherung für den Fall, dass der Zahlvertrag entfällt. Etikett und Sendungsnummer können asynchron entstehen (124 sofort; 47 über den Nachlauf; für die 110 gilt seit der TG110 Final Closure der Labelvertrag `carrier_at_pickup` unten): für eine Buchung außerhalb der Geschäftszeiten nennt die Auftragsseite des Anbieters das Etikett — bei GLS/TNT auch die Sendungsnummer — erst für den nächsten Werktag (belegt DE0052649/DE0052650, gebucht Freitagabend). Der Nachlauf wartet deshalb bis zu 120 Stunden statt 48 (eine Freitagabendbuchung wäre sonst am Sonntagabend aufgegeben worden), und die 110 trug seit diesem Befund wie 124 und 47 den Nachlaufschalter als Buchbarkeitsvoraussetzung — für NEUE 110-Buchungen seit der TG110 Final Closure nicht mehr; die AWB wird vor und unabhängig vom Etikett gesichert. **Pagination-fest (Pre-Live Fix-Pack 2026-09-29, wirksam nach Merge):** die Auftragsliste des Portals zeigt 25 Aufträge je Seite (V2- und Portalaufträge gemeinsam), und der Nachlauf fand einen Auftrag bis dahin nur auf Seite 1 — ein spät erzeugtes Etikett wäre nach 25 neueren Aufträgen nicht mehr erreichbar gewesen. Der Detailpfad eines Auftrags ist sitzungsstabil (belegt über zwei Sitzungen) und wird jetzt mit dem Abschluss am Portalversuch gesichert (`order_detail_path`, additiv und nullable in allen vier Portaltabellen; nur nach bestätigter Identität der Detailseite und nur in der strengen Form `/profile/main/orders/view-order/<Token>/?orderType=DoorToDoor`). Der Nachlauf liest ihn direkt und prüft die Identität weiterhin auf der Detailseite; ein unbrauchbarer gespeicherter Wert endet fail closed ohne Portalaufruf. Altvorgänge ohne Pfad fallen unverändert auf Seite 1 zurück und erhalten den Pfad beim ersten identitätsgeprüften Treffer; ein Auftrag jenseits von Seite 1 ohne Pfad bleibt ein ehrlicher Fehler (`order_row_not_on_first_page`), nie „Etikett noch nicht erzeugt“. Es wird keine Blätterfunktion erfunden. Die vom Kunden bestellte Label-/Trackingmail einer Portalbuchung wartet genauso lange — erkannt am abgeschlossenen Portalversuch der Sendung, nie an einer ServiceID — und geht genau einmal hinaus, sobald die für ihre Art nötigen Artefakte da sind (Trackingmail: AWB; Label-Mail: AWB und Etikett); jede andere Sendung behält das gemeinsame 48-Stunden-Fenster. Ein verspätetes Anbieterartefakt ist kein Mailfehler: `failed` bleibt echten Mailproviderfehlern und dem Fensterende vorbehalten. **Größenangabe nur, wenn die Seite sie bestätigt:** der Portallink „Standard (A4)" liefert bei DPD ein A6-Etikett (297 × 421 pt, DE0052605/DE0052648); gespeichert wird „A4" deshalb nur, wenn jede PDF-Seite nachgemessen A4 ist — sonst heißt der Beleg neutral „Versandlabel" (Anzeige, Dateiname, Mail), für jeden Beleg gleich, ohne Anbieterweiche. Die Angebote 47/110/124 nennen nur das Format (PDF), keine Größe: die Größen des V2-Quotes beschreiben den V2-Bestellweg. **Anmeldeweg:** `scripts/portal-session-smoke-readonly.js` beweist in der Laufzeitumgebung mit `TG_PORTAL_*` genau einen Login, keine Neuanmeldung, lesbares Konto und einen gemeldeten Sitzungsverlust ohne erneutes Senden — nur Staging, nur lesend, höchstens drei Requests. **Etikett und Sendungsnummer sind für 47 am Staging nicht belegt (extern):** für TNT-Portalaufträge erzeugt die Stagingumgebung des Anbieters kein Etikett und keine Sendungsnummer (DE0052643, gebucht 2026-09-23 über die Anbieteroberfläche selbst, zwei Werktage später weiter „wird generiert", TrackOrder ohne AWB; ebenso DE0052650) — kein Abruffehler von ConfidaraExpress: dieselben Lesewege liefern DPD-Portal- und TNT-V2-Etiketten sofort. Die 47 ist damit am Staging nicht weiter belegbar; ihr Nachweis braucht eine Production-Bestellung nach `docs/portal-production-smoke-plan.md` (nicht ausgeführt, eigene Betreiberentscheidung). Die erste GLS-Portalbestellung DE0052649 (zwei Packstücke, historisch) blieb auch bei der letzten read-only Lesung (PA-04, 30.09.) ohne Etikett und Sendungsnummer; für die 110 gilt seit DE0052660 der Labelvertrag unten. Belegt ist der Weg an der 124 (DE0052648: AWB sofort kanonisch, Etikett sofort). **TG110 Final Closure — Labelvertrag `carrier_at_pickup` (2026-10-01, wirksam nach Merge):** Die Staging-Buchung DE0052660 (QT-007171; genau ein Paket 2 kg, 30 × 20 × 15 cm, Warenwert 100 €; DE 63741 → 10115; Abholung 01.10.2026 09–17 Uhr; 14,53 € netto + 2,76 € USt = 17,29 € brutto, INV-0040824 vollständig bezahlt, Guthaben exakt um 17,29 € gesunken; genau ein finaler Submit, kein Retry) bestätigt servicegenau: „Ihr GLS-Fahrer wird bei der Abholung ein Versandetikett an Ihrem Paket anbringen.“ Für die 110 gilt deshalb der providerneutrale Labelvertrag `labelHandling: "carrier_at_pickup"` — kuratiert genau einmal in der Servicematrix (`config/transglobalServicePolicy.js`), dazu `printerRequired: false`; das Angebot bewirbt weder Labelformat noch -größe, und das öffentliche Feld `labelHandling` trägt nur `null` oder `carrier_at_pickup`, ohne Provider- oder Servicebezug. Der Portalkern schließt eine bestätigte Buchung unter diesem Vertrag ohne Labelabruf und ohne `label_pending` ab; die AWB wird wie bisher unabhängig versucht. Der Vertrag steht **am Vorgang**: geschrieben einmalig beim Anlegen des Portalversuchs (`claimInit`, vor jedem Providerkontakt) in die additive Spalte `label_handling` aller vier Portaltabellen (nullable, ohne Default, ohne Backfill — ein Altvorgang bleibt NULL), danach von keinem Schreibweg mehr berührt; der Kern liest ihn aus dieser Zeile, nicht aus dem heutigen Binder. `error_reason` taugt dafür nicht, weil die Klärung dort den technischen Vorfall einträgt. **Nur dieser gespeicherte Vertrag** macht einen abgeschlossenen — oder in der Klärung stehenden und menschlich als gebucht bestätigten (`confirmed_booked` desselben Angebots) — Vorgang zu `carrier_applied`: Labelstand, Kundendokumente (keine Versandlabel-Zeile), Betriebssicht (geschlossen, nie `label_missing`), Kundenstatus `carrier_at_pickup` und Auftragsbestätigung („Das Versandlabel wird bei der Abholung am Paket angebracht. Sie müssen kein Versandlabel ausdrucken.“); ein solcher Vorgang ist kein Nachlaufkandidat, und der Etikettabruf fragt das Portal nicht. Historische Vorgänge werden nie aus ServiceID oder heutiger Matrix umgedeutet: DE0052649 (`label_pending`) bleibt offen und Nachlaufkandidat, ein abgelaufener bleibt `label_recovery_timeout`. Die öffentliche Buchbarkeit der 110 hängt am Portaladapter und am globalen Schalter, nicht mehr an `TG_PORTAL_LABEL_RECOVERY_ENABLED` (für 47/124/137 unverändert Pflicht). Eine „Versandlabel & Tracking“-Zusatzmail ist unter diesem Vertrag nicht verfügbar (Oberfläche) und wird serverseitig fail closed abgelehnt (`LABEL_EMAIL_NOT_AVAILABLE`); eine reine Tracking-Mail bleibt möglich. **AWB und Tracking sind davon getrennt:** bei DE0052660 waren sie unmittelbar nach der Buchung leer; der bestehende Transglobal-Tracking-Sync fragt TrackOrder über die Auftragsreferenz und trägt eine spätere Carrierreferenz nach (`trackingAvailable` bleibt `true`). Fehlerpfad: kommt nach bestätigtem `CompleteOrder` der Abschluss nicht durch, endet der Vorgang in `reconciliation_required` (Vorfall in `error_reason`) und behält seinen Vertrag; bestätigt ein Mensch ihn als gebucht, ist er `carrier_applied` und nie Nachlaufkandidat. Ein unter dem alten Vertrag angelegter Versuch (NULL) folgt auch bei einem erneuten Lauf dem bisherigen Nachlauf.
- **Service 137 (DPD Classic, kundenseitig „DPD · Classic“) — Fahrerabholung belegt, DE→DE über den Portalpfad öffentlich buchbar vorbereitet** (Befund und Produktentscheidung 2026-09-29, TG Staging Final Closure, wirksam nach Merge): Im V2-Vertrag ist die 137 von der 124 nicht zu unterscheiden (kein Erfüllungsfeld, beide ohne CollectionOptions), und die Quoteseite des Portals zeigt für beide denselben Markentext — deshalb blieb sie ohne Angebot, statt geraten zu werden. Entschieden hat die Portalantwort, die die Übergabe trägt: die Portalprobe S137A (produktiver Portalkern bis `GetCollectionGroups`, ohne Bestellung, eigener Warenkorbeintrag danach entfernt) zeigt für die 137 eine **Abholgruppe** — `showCollectionOption` und `showCollectionTimes` true, fünf Abholtage, das Fenster „09-17“, keine Paketshopgruppe —, während die 124 mit demselben MasterServiceType 700 eine Paketshopgruppe führt. Die Staging-Buchung S137B (ausdrücklich freigegeben; derselbe Kern über den Buchungseinstieg in einer isolierten lokalen Umgebung) hat den Weg zu Ende belegt: DE0052658, Abholung am nächsten Werktag 09–17 Uhr, Portalpreis 7,50 netto = revalidierter Einkauf centgenau, genau eine Zahlung und ein Abschluss, das DPD-Etikett **sofort** abrufbar (eine A6-Seite ohne Namen der Einkaufsquelle; der Beleg heißt deshalb neutral „Versandlabel“), die Sendungsnummer 09985052595031 als Trackingreferenz, der Warenkorb danach leer. Gebucht wird die 137 über denselben Portalkern wie 47, 110 und 124 — ein vierter Binder (Rate der Schaltfläche 137/700, Abholslot nur aus der belegten Abholgruppe, eigene Idempotenztabelle `tg137_booking_attempt`, ohne Slot `409 COLLECTION_SLOT_REQUIRED`) — hinter **zwei Schaltern**, beide default aus: `TG137_PORTAL_ADAPTER_ENABLED` und `TG_PORTAL_LABEL_RECOVERY_ENABLED` (Schranke B3e). Kuratiert ist genau das Gemessene: Preisklasse STANDARD, Direktabholung, nur DE→DE, **genau ein Packstück**, Tracking und Druckpflicht, beide Adressarten fest geschäftlich (der Adressschritt führt keine Wohnadressoption, `residentialSurcharge` 0 — der Kunde wird nicht gefragt) und der früheste Abholtag. **Nicht** kuratiert: die kostenpflichtige Zusatzabsicherung (Portalweg: nur die kostenlose Standardabsicherung), die Abholung am selben Tag, mehr als ein Packstück, Höchstgewicht und Maße (die Grenzen der Infoseite sind an der Quelle geprüft, aber nicht kuratiert). **Portfolio, nicht erste Live-Welle (2026-10-05):** ohne `TG137_PUBLIC_RELEASE_ENABLED` weder Angebot noch Buchung; mit Freigabe, aber ohne `TG137_PORTAL_ADAPTER_ENABLED` sichtbar und nicht direkt buchbar. Freigabe und Adapter bleiben zwei Bedeutungen.
- **Service 107 (DHL Economy Select, kundenseitig „DHL Express · Economy Select") — vollständig kuratiert, seit dem DHL-Abschluss DE→EU öffentlich buchbar vorbereitet** (bestätigt 2026-09-18, TG107; freigegeben 2026-09-19, wirksam nach Merge): der **erste EU-Block mit eigener Buchungsevidenz** — alle früheren Buchungssmokes liefen DE→DE. Staging-Buchungssmoke bestanden (Full Quote 1277, BookShipment DE0052582, Anbieterrechnung INV-0040783 — DE 63741 geschäftlich → FR 75001 privat, **ein** Packstück 2 kg, Direktabholung am nächsten Werktag, Absicherung 500/20; Quote mit Fracht 15,14 als einzigem Bestandteil, kein ISC, **kein Zuschlag Privatadresse trotz privater Zustelladresse**, keine Abholposition, kein Sperrgut, keine Fernzone, With = Without, Absicherung 10,00 als Extra, Abrechnungsgewicht 2 = Realgewicht, Laufzeit „5"; Rechnung = Fracht + Absicherung auf den Cent, Steuer nur auf den Versand, Absicherung steuerfrei, keine Abweichung; ein A4- und ein Thermal-PDF mit je zwei Seiten, eine gemeinsame Sendungsnummer, eine Stücknummer, eine Trackingreferenz). Kuratiert ist genau das Belegte: Preisklasse STANDARD, Abholung beim Absender, nur DE→EU, **höchstens ein Packstück**, Tracking, Druckpflicht, Transportabsicherung. Nicht kuratiert: Höchstgewicht, Maße, Volumendivisor, Produktprofil, Abholung am selben Tag, Zeit- oder Lieferzusage, CE-Prognose, Fernzonen- und PLZ-Regeln. **Freigabe (DHL-Abschluss 2026-09-19):** `publicBookable: true`, `publicBookableScopes: [DE_EU]`, genau ein Packstück (zwei und mehr sind gesperrt), dazu der bei jeder Buchung gemessene Adressartvertrag (nächster Punkt). Eine DE→DE-Route bleibt für die 107 gesperrt.
- **Ein einzelner Adressartbefund ist kein Adressartvertrag** (Produktentscheidung 2026-09-18, TG107): die 107 wurde an eine **private** Zustelladresse gebucht und trug trotzdem keinen Zuschlag. Daraus folgt **keine** Kuratierung: „Art der Lieferadresse ohne Zuschlag" behauptet, **beide** Adressarten trügen centgenau denselben Preis, und gemessen ist nur **eine**. Der Modus wird deshalb nicht von 84/85/87 übernommen; die 107 trägt gar keine Adressartkuratierung, bis beide Szenarien im selben Vertrag gemessen sind. Allgemein: eine Messung einer Adressart belegt nie den Vertrag beider. **Aufgelöst durch Messung statt Annahme (Produktentscheidung 2026-09-19, DHL-Abschluss):** die 107 trägt `deliveryIsResidential: "declared_no_surcharge"` und `collectionIsResidential: "fixed_false"` — nicht als übernommener Vertrag, sondern weil **jede** Buchung ihn neu misst: nach der Auswahl fragen die Optionen genau wie bei jeder Adressartwahl beide Szenarien (geschäftlich und privat) als zwei frische Full Quotes an, beide müssen centgenau gleich sein, und die gewählte Adressart geht als `IsAddressResidential` an den Anbieter. Jede Abweichung — ein Zuschlag, eine andere Preisdifferenz, eine fehlende Antwort — sperrt fail closed: kein Snapshot, keine Bindung, keine Buchung; bei der Revalidierung ergibt sie `PRICE_CHANGED` mit Neubestätigung. Keine dritte Quote, keine neue Preisarchitektur, keine pauschale Zuschlagsregel und keine erfundene DHL-Gebühr. Der Grundsatz bleibt gültig: ein einzelner Befund ist kein Vertrag — deshalb wird der Vertrag vor jeder Buchung gemessen.
- **Die Steuer auf einer EU-Strecke ist gemessen, nicht angenommen** (bestätigt 2026-09-18, TG107): die Anbieterrechnung der 107 ergab einen impliziten Satz von 19,02 % — also 19 % nach Centrundung. Der Wert wurde aus dem Quote gelesen und nur auf innere Konsistenz geprüft; **Preis- und Steuerhoheit bleibt der Anbieter**, und im Code steht kein Steuersatz je Service oder Route. Der CE-Kundenpreis rechnet unverändert mit dem konfigurierten Satz.
- **Trackingbedeutung ist carriergebunden** (Produktentscheidung 2026-09-19, DHL-Abschluss, wirksam nach Merge): die Zuordnung der Transglobal-Ereigniscodes (003 vorbereitet; 005, 021, 160, 167 unterwegs; 011 zugestellt) ist an einem **UPS**-Leg gemessen; für DHL gibt es keine Ereignisevidenz (die TrackOrder-Antwort zu DE0052580 trug keine Ereignisse). Die Bedeutung gilt deshalb nur für Legs eines Carriers, an dem sie gemessen ist (heute UPS). Ein DHL-Leg, ein fremder oder ein fehlender Carrier ergibt den Stand „unbekannt“ — die Ereignisse selbst (Code, Beschreibung, Ort, Zeit) und ein sicherer https-Carrierlink bleiben sichtbar, `delivered_at` wird für DHL nie gestempelt, `shipments.status` bleibt unberührt. Es gibt keine erfundene DHL-Ereignistabelle; eine DHL-Zuordnung kommt erst mit echter DHL-Ereignisevidenz. Unverändert: ERROR/FAIL oder eine fremde Auftragsreferenz schreiben nichts, ein unbekannter Code bleibt „unbekannt“.
- **„Ref No“ auf DHL-Belegen — EXTERNAL_WHITE_LABEL_DECISION_REQUIRED** (Befund 2026-09-19, DHL-Abschlussaudit; offen): Etikett und Waybill Doc der DHL-Belege drucken „Ref No: <Auftragsreferenz der Einkaufsquelle, DE00…> / <CE-Referenz>“ (Sichtprüfung der TG85-Seiten). Die Auftragsreferenz ist eine Buchungsreferenz der Einkaufsquelle, die nach 5.12 kundenseitig nicht erscheinen soll. ConfidaraExpress verändert Carrier-PDFs nicht — kein Neurendern, kein Schwärzen, die Bytes bleiben unverändert — und kann den Punkt deshalb **nicht** im Code schließen. Zu entscheiden ist er extern: eine Anbieterauskunft, ob das Referenzfeld nur die CE-Referenz tragen kann, oder eine ausdrückliche Produktentscheidung, den Aufdruck hinzunehmen. Bis dahin ist er nicht technisch geschlossen. Ob UPS-Belege dasselbe Muster tragen, ist unbekannt (nie gerendert). Das Feld „Payer Details … FRT“ mit der Kontonummer des Frachtzahlers ist ein Abrechnungsfeld des Carriers ohne Namen der Einkaufsquelle und zulässig; die frühere Aussage „kein Konto- oder Supplierhinweis“ (Druckvertrag) war unzutreffend.
- **Transportabsicherung ist eine kuratierte Fähigkeit** (bestätigt 2026-09-16): das Absicherungsextra des Anbieters allein genügt nicht — angeboten, bepreist und gebucht wird sie nur für Services, deren Eintrag sie trägt (22, 23, 26, 29; seit der DHL Foundation auch 84, seit der DHL Zeitfamilie auch 85 und 87, seit TG107 auch 107 — bei allen vieren seit dem DHL-Abschluss wie bei 22/23/26 erst nach der Bindung der Lieferadressart angeboten und bepreist; die 29 weiterhin nicht). Seit dem TNT-Abschluss trägt sie die 44, seit der TG Staging Final Closure (2026-09-29, wirksam nach Merge; Betreiberentscheidung: unterstützen, wenn Staging es belegt) auch 41, 48 und 49 — je eine eigene versicherte Staging-Buchung (DE0052655, DE0052656, DE0052657: Rechnung = Fracht + Absicherung 10,00 als eigene steuerfreie Position, Steuer nur auf die Fracht, Delta 0) — und die 86 (DE0052654), alle über dieselbe zentrale Absicherungslogik. Ohne sie bleiben allein die Portaltarife 47, 110, 124 und 137 (Betreiberentscheidung: der Portalweg bietet keine kostenpflichtige Absicherung).
- Alle anderen Transglobal-Services bleiben nicht öffentlich buchbar.
- **Art der Lieferadresse nach der Angebotsauswahl** (Service 22, bestätigt 2026-09-14): „Neue Sendung" fragt vor dem Vergleich keine Adressart. Das Angebot zeigt einen vorläufigen Geschäftspreis; erst nach der Auswahl fragt die Buchung genau „Art der Lieferadresse" mit „Geschäftsadresse + 0,00 €" und „Privatadresse + X,XX €". Eine Abholadressfrage gibt es nicht — die Abholadresse ist für die bindungsrelevanten Quotes serverseitig geschäftlich.
- X ist nie hartkodiert: zwei vollständige serverseitige Kundenszenarien (geschäftlich/privat) mit demselben Aufschlag, derselben MwSt. und demselben Sendungskontext; X = Privat − Geschäft in ganzen Cent. Aufschlag und MwSt. gelten auf den vollständigen Anbieterpreis einschließlich Zuschlag (kein 1:1-Durchreichen). Kundenbezeichnung ausschließlich „Zuschlag Privatadresse".
- **Abholung am selben Tag** (Service 22, bestätigt 2026-09-14): heute buchbar bis zum wirksamen Abholschluss = Abholschluss des frischen Anbieterquotes minus 15 Minuten (Europe/Berlin; keine feste Uhrzeit, keine feste Gebühr). Die Gebühr ist Einkauf und durchläuft Aufschlag und MwSt. mit dem übrigen Anbieterpreis; der Kartenpreis enthält den Zuschlag, darunter „Zuschlag für Abholung am selben Tag: +X,XX €" und „Abholung heute möglich bis HH:MM Uhr". Nach dem wirksamen Abholschluss ist die Abholung heute nicht mehr verkäuflich; seit TG UPS Effective Collection Date trägt das Angebot der 22 und 23 dann den nächsten Versandtag (siehe „Das Versanddatum ist der früheste Abholtag"). Die Sätze „Abholung heute nicht mehr möglich." / „Bitte wählen Sie einen späteren Abholtag." erscheinen nur noch, wo nicht verschoben wird, und in den 409-Antworten der Buchungswege. Keine Checkbox, kein eigener Bindungsschritt; kombinierbar mit Privatadresse und Absicherung. **Zwei Vertragsarten, beide staginggebucht (2026-09-23, TG Effective Collection, wirksam nach Merge):** *gebührenpflichtig* — der Quote führt neben dem Abholschluss ein Gebührenextra, und die Anbieterrechnung ist Quote-Netto **plus genau dieser Satz** (22, 23, 26, 29; bei 26 mit zwei Packstücken gemessen: einmal je **Abholung**). *Gebührenfrei* — der Quote nennt einen Abholschluss, führt aber **kein** Gebührenextra, und die Rechnung ist centgenau das Quote-Netto (84 und 49 gebucht; 85, 87 und 48 aus derselben technischen Familie abgeleitet). Fehlt das Extra, gibt es nichts zu berechnen, nichts auszuweisen und nichts einzufrieren — die **zeitliche** Prüfung (Abholschluss, Sicherheitsabstand, „bereit ab") läuft für beide Arten gleich. 41/44 (DE→EU), 107 (DE→EU) und 86 (am selben Tag nicht gemessen) tragen keine; JUMiNGO bleibt unverändert. Service 29 trägt den gebührenpflichtigen Vertrag, **verkauft** die Abholung heute aber erst mit seiner Freigabe — sein Preis nennt seit TG Effective Collection trotzdem den Betrag, der für den angezeigten Tag gilt (nächster Punkt). **„Abholung heute" ist eine Aussage über den TAG, nicht über den Zuschlag** (2026-09-23, wirksam nach Merge): `pickupToday`, der Abholschluss und der Filter „Abholung heute" folgen ausschließlich dem wirksamen Abholtag — Übergabeart Abholung, wirksamer Tag = heute, Abholung heute tatsächlich möglich. Nicht der Gebühr, nicht der Buchbarkeit, nicht einer ServiceID. Vorher hing beides an der Gebühr; die gebührenfreien Dienste fehlten deshalb im Filter, obwohl sie heute abgeholt werden. Der ZUSCHLAG bleibt an beides gebunden: er entsteht nur mit belegter Gebühr und nur, wo der Kunde die Abholung heute auch beauftragen kann — ein Angebot kann also „heute" sagen, ohne eine Zuschlagszeile zu tragen. **Grundvertrag (bestätigt 2026-09-16):** Einzige Quelle des Abholschlusses ist der frische Full-Quote — der Anbieter nennt ihn nur mit Information und solange er nicht vorbei ist; es gibt keine zweite Quelle, keinen Ersatzwert (keine feste Uhrzeit, keine feste Gebühr) und keinen zusätzlichen Providerrequest. Fehlt er, bleibt die Abholung heute gesperrt („Abholung heute für dieses Angebot nicht verfügbar."); sind Abholschluss-, Gebühren- oder Preisdaten unbrauchbar, ebenso („Abholung heute kann derzeit nicht bestätigt werden."); der Hinweis lautet jeweils „Bitte wählen Sie einen späteren Abholtag.". Eine gesperrte Abholung heute zeigt den Abholtag, aber keine „bereit ab"-Zeit. Für 22 und 23 gilt in all diesen Fällen seit TG UPS Effective Collection Date ebenfalls der nächste Versandtag (nächster Punkt); die Diagnose der Abholung heute bleibt unverändert.
- **Das Versanddatum ist der früheste Abholtag** (Produktentscheidung 2026-09-19, TG UPS Effective Collection Date, wirksam nach Merge; **neu gefasst 2026-09-23, TG Effective Collection, wirksam nach Merge — siehe den nächsten Punkt**): für die kuratierten UPS-Abholservices 22, 23 und 26 — und seit dem DHL-Abschluss (2026-09-19, wirksam nach Merge) ebenso für die DHL-Abholservices 84, 85, 87 und 107, über dasselbe kuratierte Feld und ohne neue Datumslogik — verschiebt ConfidaraExpress auf den nächsten nach der bestehenden Kalenderregel zulässigen Werktag (Montag bis Freitag ohne die neun bundesweiten Feiertage), wenn **ausschließlich** die Abholtag-/Same-Day-Schranke den Wunschtag blockiert — Samstag oder Sonntag, heute ohne Same-Day-Fähigkeit (26 und alle DHL-Dienste: heute → nächster Versandtag) oder heute ohne verkäufliche Abholung am selben Tag (Abholschluss fehlt oder ist erreicht, Sicherheitsabstand, Gebühr nicht bestätigt). Freitag nach dem Abholschluss, Samstag und Sonntag → Montag; ein heute nicht mehr möglicher Werktag → Folgetag; ein späterer Werktag bleibt. Genau so verhält sich JUMiNGO beim Anbieter (Abholtag je Tarif). Transglobal nennt keinen Abholtag und keine Alternative und hat keine Verfügbarkeitsauskunft für künftige Tage — der Tag entsteht deshalb aus derselben CE-Kalenderregel wie die Lieferprognose, aus demselben Quote und ohne weiteren Anbieteraufruf, nie aus einer erfundenen Anbieterantwort. Der wirksame Tag wird angezeigt, am Angebot gespeichert, für Optionen, Neubepreisung, Revalidierung und BookShipment verwendet und nach der Buchung als Versand- und Leistungstag in Sendung, Auftragsbestätigung, Rechnung und Belegen geführt. Jede andere Sperre (Schalter, Routenbereich, Währung, minimaler Quote, fehlende Freigabe) verschiebt nichts; Die 29 trägt die Regel seit ihrer Freigabe (2026-09-23, siehe dort), die 86 und die 137 seit der TG Staging Final Closure (2026-09-29, wirksam nach Merge); die Abgabe 124 trägt sie nicht. Die vier DHL-Staging-Buchungen (DE0052580–DE0052583) liefen bereits mit genau diesem Tag — nächster Werktag, bereit ab 09:00, bei 85 und 107 Freitag → Montag. Seit der Final Bookability Closure (2026-09-28, wirksam nach Merge) sind die neun bundesweiten deutschen Feiertage (Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, Tag der Deutschen Einheit, 1. und 2. Weihnachtstag; Kalendertage der Geschäftszeitzone Europe/Berlin) keine Versandtage: ein solcher Wunschtag verschiebt wie ein Wochenendtag (`shifted_holiday`; 25.12.2026 → Montag 28.12.; Karfreitag 26.03.2027 und Ostermontag 29.03.2027 → Dienstag 30.03.), eine Abholung am selben Tag gibt es an ihm nicht, und ein nicht verschiebender Transglobal-Dienst ist an ihm nicht buchbar (`COLLECTION_DATE_NOT_BOOKABLE`). Regionale Feiertage entscheidet weiterhin die Buchung beim Anbieter; zur Buchungszeit wird nie erneut verschoben (fail closed). Den JUMiNGO-Abholtag nennt weiterhin der Anbieter.
- **Ein wirksamer Abholtag und ein Preis, der zu ihm passt** (Produktentscheidung 2026-09-23, TG Effective Collection, wirksam nach Merge): Der gewählte Versandtag ist der gewünschte **früheste** Abholtag. Ist er für ein Angebot abholbar, bleibt er stehen; ist er es nicht, trägt das Angebot den frühesten, der es ist — nie einen Tag, den der Anbieter nicht erfüllen kann. Welcher Tag wirksam ist und welcher Einkaufsbetrag zu ihm gehört, beantwortet **eine** Stelle (`lib/offers/effectiveCollection.js`); die öffentliche Buchbarkeit **liest** das Ergebnis und bestimmt es nicht mehr. Zwei gemessene Widersprüche fallen damit weg: (1) der Versandkostenrechner zeigte für die 22 mit heutigem Abholtag 14,68 € und „Neue Sendung" für dieselbe Sendung 18,28 €, weil die Gebühr der Abholung am selben Tag nur eingerechnet wurde, wenn das Angebot bereits verkäuflich war — der Kundenpreis entsteht jetzt **genau einmal** aus dem Einkauf des wirksamen Tages, unabhängig davon, ob der Weg gerade verkauft; (2) ein heute möglicher Abholtag wurde verschoben, weil die Frage nach der kuratierten Fähigkeit **vor** der Frage stand, ob der Tag überhaupt möglich ist. Preisfunktion, Aufschlag und Steuersatz sind unverändert. Dass verschoben wurde, sagt das Angebot mit dem neuen öffentlichen Feld `collectionDateAdjusted` — ein **Ja/Nein ohne Grund und ohne Wunschtag**; die Oberfläche beschriftet den Tag daran als „Frühester Abholtag" und zeigt nie einen Grund (der wäre eine Providerinformation). „Heute" ist ab hier im gesamten Backend **ein** Begriff: der Kalendertag der Geschäftszeitzone (`toBusinessCalendarDate`) — die Datumsschranke der `calculate-price`-Route prüfte ihn bis dahin gegen UTC und hielt zwischen 00:00 und 02:00 Berliner Zeit den heutigen Tag für Zukunft. Die JUMiNGO-Providerlogik ist unberührt.
- **Die gebührenfreie Abholung am selben Tag ist durch alle Stufen buchbar — und die letzte Datumsschranke gilt für jede Abholung** (Korrektur 2026-09-25, Same-Day End-to-End, wirksam nach Merge): Seit TG Effective Collection zeigte der Vergleich für die gebührenfreien Dienste (84, 85, 87, 48, 49) bis zum Abholschluss „Abholung heute" — buchen ließ sich das Angebot trotzdem nicht. Optionen und Neubepreisung bepreisten auch für den gebührenfreien Vertrag eine Zuschlagsszenariokette, deren Differenz 0 ist, und werteten diesen Nullunterschied als „Abholung heute nicht verfügbar"; `/book` kannte vor dem Quote nur einen gebührenpflichtigen Same-Day-Befund, und die Abholtagsschranke sperrte den heutigen Tag, bevor ein frischer Quote ihn prüfen konnte; die Oberfläche bot daraufhin „Angebote neu berechnen" an und bekam dieselbe Karte zurück. Jetzt gilt der gebührenfreie Vertrag in jeder Stufe: ein Nullunterschied ist gültig und erzeugt weder Zuschlag noch Szenariokette; Snapshot, Bindung und Einkaufsevidenz sind die gewöhnlichen (nichts einzufrieren); vor dem Quote steht der Befund bei `/book` und der Neubepreisung aus, und der frische Quote entscheidet ihn — Abholschluss, Sicherheitsabstand, „bereit ab" — und unmittelbar vor der Bestellung ein zweites Mal. Optionen leben wie bei der Gebühr höchstens bis zum wirksamen Abholschluss. Kundenpreis und Einkauf sind heute centgenau dieselben wie an einem späteren Tag; BookShipment sendet den heutigen Abholtag ohne Accessory. Ein vor heute gebundenes gebührenfreies Angebot, dessen Tag inzwischen heute ist, bucht genau diesen Tag, wenn der frische Quote ihn bestätigt — es wird nichts verschoben und nichts hinzugefügt; eine gebührenpflichtige Bindung von vor heute bucht heute unverändert nicht. **Mitternacht:** die letzte Schranke vor der Bestellung prüfte den Abholtag bis dahin nur für Dienste mit kuratierter Abholung am selben Tag — bei allen anderen (etwa 29, 41, 44, 107 und die Portalabholungen 47/110) ging ein vor Mitternacht für MORGEN geprüfter Tag nach Mitternacht als HEUTE an den Anbieter, eine nie belegte Abholung am selben Tag. Jetzt verlangt sie für JEDE Abholung ohne verfügbare Abholung heute aus dem frischen Quote einen Abholtag nach heute (Europe/Berlin), sonst wird nicht bestellt. 85, 87 und 48 bleiben abgeleitet — ihre eigene Stagingbuchung am selben Tag steht aus. Die gebührenpflichtige Abholung (22, 23, 26), Portalcode, JUMiNGO, Preisfunktion und Feiertagsmodell (weiterhin keines) sind unverändert.
- **JUMiNGO bucht nur, was belegt ist** (Final Bookability Closure, 2026-09-28, wirksam nach Merge): gebucht wird ausschließlich über das gespeicherte Angebot — es bindet den Tarif (`provider_service_id`, `provider_tariff_ref`) und den gezeigten Abholtag (`offered_pickup_date`); eine abweichende Clientangabe endet vor jedem Providerkontakt mit 409 `OFFER_MISMATCH`, ein anderer frühester Abholtag des Anbieters mit 409 `COLLECTION_DATE_CHANGED` (`oldCollectionDate`/`newCollectionDate`, kein Claim, keine Mutation, keine Bestellung). Eine Abgabe im Paketshop ist nur für einen kuratierten Carrier buchbar (`config/jumingoDropoffCapability.js`): seit der Betreiberentscheidung 2026-10-01 wieder UPS, DHL, GLS und DPD (wirksam nach Merge), jeder andere Carrier bleibt sichtbar, aber `quote_only`. Die Liste war mit der Final Bookability Closure leer — eine nachträgliche CE-Härtung zusätzlich zu den Buchungsschranken; der gemeinsame Shop-Buchungspfad blieb dabei erhalten: Shoprate mit der vollen Tarif-ID des Tarifs (z. B. `s-2036`), danach vor der Bestellung das Readback-Gate (`evaluateOrderReadiness`, `lib/orderReadiness.js`) — es blockiert, wenn `rate` kein nicht-leeres persistiertes Objekt ist, wenn `status` oder `import_status` einen der bekannten Nicht-bereit-Werte `missing_data`, `draft`, `incomplete`, `error`, `invalid`, `new` trägt oder ein aktiver `shipper_tariff_id`-Leer-/Pflicht-Issue besteht (dann 409 ohne Bestellung); unbekannte Statuswerte blockieren bewusst nicht, `status: ready` wird nicht verlangt. Die Aufnahme erfindet keinen Providernachweis: eine echte Bestellung mit Etikett je Carrier kann weiter fehlen. Ein Tarif mit Gebietszuschlag (`hasAreaSurcharge`) ist nicht buchbar (`area_surcharge_unconfirmed`), ein Warenkorb mit Zuschlägen führt zu keiner Bestellung (409 `OFFER_NOT_BOOKABLE`) — die Höhe ist unbelegt (G4_REQUIRED). Tarifgrenzen gelten dreiwertig: nachweislich verletzt → nicht angezeigt, nicht sicher prüfbar (etwa ein Gurtmaß ohne belegte Formel) → sichtbar, nicht buchbar (`package_dimensions_unverified`); `first_length`/`second_length` sind laut offizieller JUMiNGO-Spezifikation (`ShipmentPackage`) die längste bzw. zweitlängste Seite und werden unabhängig von der Eingabereihenfolge nur so geprüft, während `girth` (keine Formel belegt) und `length`/`width`/`height` (Normalisierung der Ausrichtung unbelegt) nur bei Einigkeit aller Lesarten entscheiden (Go-Live-Abschluss D5, 2026-09-29, wirksam nach Merge); Geschäftsabsender/-empfänger, Privat-Flags und die tägliche Abholpflicht setzt der Server durch, die gespeicherte Inhaltsangabe ersetzt „Paket“, wo das Produkt sie verlangt. Ein Abbruch, für den bewiesen ist, dass nichts bestellt wurde, antwortet `BOOKING_FAILED`; der echte unklare Ausgang bleibt `BOOKING_OUTCOME_UNKNOWN`.
- **Voraussichtliche Lieferung** (Service 22, bestätigt 2026-09-14; seit TG23 auch Service 23; seit der Freigabe 2026-09-23 auch Service 29): Der Anbieter nennt nur eine Laufzeit. ConfidaraExpress rechnet daraus ab dem Abholtag des Angebots (nach einem Abholtag-Rückfall dem wirksamen) eine eigene voraussichtliche Lieferung — gezählt werden Montag bis Freitag, Samstag, Sonntag und seit 2026-09-28 die neun bundesweiten Feiertage werden übersprungen, regionale und ausländische Feiertage nicht (die Oberfläche sagt das dazu); „1–2" ergibt einen Zeitraum, „1" einen Tag, „1+" nur „ab". Keine Uhrzeit, keine Anbieterzusage, keine Garantie; keine Wirkung auf Preis, Buchbarkeit, Sortierung, Buchung, Sendungs-ETA oder Kennzahlen. JUMiNGO-Zustelldaten bleiben getrennt und autoritativ.
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

**Betreiberentscheidung 2026-10-10 — Pre-Live ohne echte Kunden/Partner, technische Abschlusspriorität:** Auf ConfidaraExpress arbeiten aktuell **keine echten Kunden und keine für den regulären Betrieb freigeschalteten echten Vertriebspartner/Freelancer**. Der echte Kunden- und Partnerbetrieb setzt die bewusste Freischaltung voraus; intern vorhandene Testkonten sind keine echten Kunden/Partner. **Zuerst die 14 bestätigten TG-Live-Tarife vollständig korrekt integrieren, danach die restliche Plattform.** Für die technische Fertigstellung **keine zusätzlichen TEST-Kennzeichnungen, künstlichen Zwischensperren für einzelne Tarife, neue Testkonstruktionen oder überflüssigen Härtungsprojekte allein wegen des Pre-Live-Zustands** einführen. Insbesondere ist eine neue TG-Tarifsperre **kein Ersatz** für die richtige Live-Service-ID-/Produktzuordnung: alle 14 Tarife bleiben Ziel des vollständigen Abschlusses; offene Beweise werden gezielt geklärt. Bereits bestehende technisch notwendige Freigaben, Isolierung von Testdaten und Sicherheitsinvarianten bleiben bestehen und werden weder pauschal entfernt noch umgangen. Falsche Produktzusagen und Preise dürfen nicht öffentlich buchbar werden; Live-Freigaben erfolgen erst nach Verifikation und Betreiberentscheidung. Authentifizierung, Berechtigungen/Mandantentrennung, Secret-Schutz, serverseitige Preis-/Buchungsprüfung, Provider-Kill-Switches und Doppelbuchungsschutz bleiben Pflicht. Rechtstexte sind derzeit **nicht Teil des technischen Fertigstellungsblocks**; ihre später notwendigen Freigaben werden dadurch nicht als erledigt behandelt. Diese Priorität gilt bis zur nächsten ausdrücklichen Betreiberentscheidung oder einer Änderung des tatsächlichen Geschäftszustands.

### Admin-Übersicht

**Status: PRODUCT_DECISION** (2026-10-09)

Die Kennzahl „Kunden“ zählt ausschließlich echte Kundenkonten: `role = 'customer'` und `prelive_test = false`, unabhängig vom Status (wartend, freigeschaltet, gesperrt, anonymisiert). Nicht gezählt werden Administratoren, Vertriebspartner, Pre-Live-Testkonten und Altkonten ohne bestätigte Kundenrolle (`role` NULL). Die Zahl kommt aus einem eigenen Serverzähler (`GET /admin/metrics/customer-accounts`, Backend #408, Frontend #484). Die Admin-Kontenliste `GET /admin/users` bleibt unverändert, einschließlich Pagination; dort bleiben auch Admin- und Altkonten erreichbar, ihr `total` ist deshalb bewusst nicht die Kennzahl.

### Vertriebspartner-Programm

**Status: PRODUCT_DECISION** (Betreiberentscheidungen 2026-10-05/06; technischer Stand 12A — implementiert, nicht aktiviert)

- Vertriebspartner (UI „Vertriebspartner“, Rolle `sales_partner`) sind keine Kunden: eigenes Konto, eigene Registrierung, Freigabe ausschließlich durch einen Admin, kein Zugriff auf Kundenfunktionen.
- Eigenprovision = Grundprovision + Kundenbonus + Paketbonus — die Boni werden **addiert**. Je 5 Kunden- und 5 Paketlevel; Standardbonus 2,5 / 5 / 7,5 / 10 / 12,5 Prozentpunkte; Schwellen und Boni sind global und je Partner konfigurierbar.
- Aktiver Kunde = mindestens 3 tatsächlich versendete Pakete im Bewertungsmonat (konfigurierbar). Das Paketvolumen zählt alle tatsächlich versendeten Pakete, auch von Kunden unter der Schwelle. Eine Mehrpaketsendung zählt mit ihrer vollen Paketanzahl, sobald ihr Versand belegt ist.
- Der abgeschlossene Vormonat bestimmt die Level des Folgemonats.
- **Stichtag ist der Versandtag.** Provisionsfähige Basis = Kundenversandnetto − Einkaufsversandnetto; nie mit der Paketanzahl multipliziert.
- Team: zwei Ebenen, Standard 5 % / 2,5 % auf dieselbe Basis, je Ebene höchstens 10 relevante Partner in Aktivierungsreihenfolge; keine dritte Ebene.
- Ein Kunde gehört höchstens einem Partner; „first valid click wins“, 30 Tage; ein bestehender Kunde wird nie automatisch umgehängt.
- Ausgezahlt wird erst nach Zahlung der Kundenrechnung.
- **Startwerte** (2026-10-07): jeder neue Partner startet mit Grundprovision 10 %, Team 5 % / 2,5 %, aktivem Kunden ab 3 Paketen, Kunden-Level ab 3 / 6 / 10 / 15 / 25 aktiven Kunden, Paket-Level ab 100 / 250 / 500 / 1000 / 2000 Paketen und Bonus 2,5 / 5 / 7,5 / 10 / 12,5 Prozentpunkten. Der Admin sieht sie vorbelegt (Freigabe, globale Level-Regel) und kann sie global oder je Partner ändern; ein ungültiger Partner-Override fällt nie still auf die globale Regel zurück.
- **Obergrenze optional** (2026-10-07): ohne Obergrenze gilt die normale Provision; eine gültige Obergrenze wird angewendet — global oder individuell je Partner (die individuelle vor der globalen, Standard: keine). Eine unbrauchbare Obergrenze stellt die Provision zurück (fail-closed für diese Grenze), ohne stillen Rückfall von der individuellen auf die globale. Es gibt kein „cap_missing" mehr; die Historie bleibt unverändert.
- **Pre-Live-Testmodus** (2026-10-07): das Programm wird vor dem Livegang in der echten Anwendung intern vollständig getestet — ohne Providerbuchung, Steuergutschrift, Partnervertrag, Auszahlung oder externe Testmail. Testdaten tragen ein technisches, unveränderliches Kennzeichen und beeinflussen keine echten Kennzahlen, Rechnungen, Forderungen, Sammelrechnungen, Mahnungen, Provideraktionen, operativen Queues, echten Gutschriften, CE-PG-Nummern oder Mails. Die PRODUKTIVE öffentliche Partnerregistrierung bleibt bis zur echten Vereinbarung 1.0 geschlossen; es wird keine Testvereinbarung erfunden. **Neu (2026-10-07, ersetzt die frühere Festlegung „bleibt geschlossen"):** im Pre-Live-Testmodus öffnet `/partner-registrieren` das echte Formular als Testweg — ohne Vertragsannahme, mit dem Hinweis „Pre-Live-Testbetrieb – diese Registrierung dient ausschließlich dem internen Funktionstest und begründet noch keine rechtsverbindliche Vertriebspartnervereinbarung."; jeder Antrag wird serverseitig ein Testpartner (pending, Adminfreigabe nötig). Kein Zugangscode davor. **Primärer Ende-zu-Ende-Test des Betreiberflows** ist diese öffentliche Registrierung (Registrieren → pending → Adminfreigabe → Login → Partnerdashboard); die Testpartner-Anlage im Adminbereich bleibt Hilfsmittel für Fixtures (A → B → C, 10 + 10, Level).
- **Vertriebspartnervereinbarung** (2026-10-07): versioniertes Rechtsdokument der Legal-Registry (`MAJOR.MINOR`, Start `1.0`), nie Teil der Kunden-Legal-Sets; jede Registrierung bindet die akzeptierte Fassung. Eine Fassung mit erfundenen Unternehmensdaten wird nicht veröffentlicht — bis zur freigegebenen Fassung bleibt die Registrierung geschlossen.
- **Abrechnung** (2026-10-07): monatliche **Gutschrift im Selbstabrechnungsverfahren**, ausgestellt von der UG (Ausstellerdaten offen, 21) mit eigenem Nummernkreis **`CE-PG<JJ>-<laufend>`**; abgerechnet werden alle zum Stichtag abrechnungsreifen, noch nicht abgerechneten Positionen. **Negativer Saldo:** keine Rückforderung, Vortrag und Verrechnung mit späteren positiven Provisionen. **Auszahlung:** manuelle Überweisung, ein Admin hält „ausgezahlt" mit Pflichtdatum, optionaler Referenz und Audit fest — keine Bankautomatik. **Zustellung:** Download im Partnerportal plus kurze Mail „Neue Gutschrift verfügbar" (Nummer, Zeitraum, Portallink; kein Anhang, keine Steuer- oder Bankdaten).
- Abrechnungsdaten pflegt der Partner im Portal; verwendet werden nur vom Admin bestätigte Daten.
- **Positionsreferenz der Gutschrift** (2026-10-09): Positionen künftig ausgestellter Partnergutschriften nennen ausschließlich die neutrale Provisionsreferenz `VP-<Ledger-ID>` — dieselbe wie im Partnerportal —, nie eine Kundenauftragsnummer (CE-BS), auch nicht bei Teampositionen. Bereits ausgestellte Gutschriften, ihre gespeicherten PDFs und ihre Stornos bleiben unverändert; Gutschriftnummern und Abrechnungsregeln sind unberührt (Backend #407). Eine steuerliche oder rechtliche Freigabe ist damit nicht verbunden.
- **Bedienoberfläche (UX-Vereinfachung, Betreiberentscheidungen 2026-10-08):** Anrede überall „Sie“; „Mein Team“ bleibt im Partnerportal immer sichtbar, auch ohne Mitglieder; der separat kopierbare Empfehlungscode verschwindet aus der normalen Partnerübersicht (Kunden- und Partnerlink bleiben; Code und Zuordnungslogik im Backend unverändert); auch EINE Gutschrift wird erst nach bewusster Bestätigung ausgestellt (die Sammelbestätigung bleibt); keine obligatorische globale Obergrenze; das bestehende Design wird weiterverwendet, nicht ersetzt. Umsetzung in sechs Paketen (Klarheit und Bedienfehler → Admin-Aufgaben und Navigation → Partner-Startseite → Partnerdetail → Gutschriften, Versandnachweise, Pre-Live → Partner-Unterseiten und Texte); Geschäftsregeln, Provisionsberechnung und Datenverträge bleiben unverändert. **Stand 2026-10-09:** alle sechs Pakete umgesetzt und gemergt (Frontend #474–#479, Backend #403); die Gesamt-QA fand keine Regression. Offene Go-Live-Risiken: 20.6; Produktions- und Deploymentzustand nicht verifiziert: 21; Bericht `docs/ux-gesamt-qa-2026-10-08.md` in beiden Repositories.
- Aktivierung jedes Teils ist eine eigene ausdrückliche Betreiberentscheidung (21).

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

#### ConfidaraExpress als App (PWA Core)

**Status: IMPLEMENTED, wirksam nach Merge und Frontend-Deployment** (Branch `feat/pwa-core`)

Eine Anwendung, keine zweite App: dieselbe React-SPA läuft im Browser und installiert (Web-App-Manifest `public/manifest.webmanifest` mit `id` „/", `start_url` „/dashboard", `scope` „/", `display` „standalone").

- Service Worker `public/sw.js`, registriert nur im Produktionsbuild: behandelt ausschließlich Navigationen derselben Origin (Netz zuerst) und antwortet nur bei einem Netzfehler mit `/offline.html`. Genau ein Cache (`ce-offline-v1`) mit genau dieser Datei — nie App-Code, API-Antworten, Dokumente oder Kundendaten. Keine Offline-Preise, -Angebote oder -Buchungen, kein Background Sync.
- Keine neue Abhängigkeit (kein Workbox, kein `vite-plugin-pwa`); die App-Icons entstehen aus `public/favicon-v2.svg` über `scripts/export-app-icons.mjs`.
- Updates: `index.html` und `sw.js` werden mit `no-cache` ausgeliefert; eine neue Version meldet die Shell mit „Neu laden" — nie automatisch, nicht auf `/booking` und nicht in „Neue Sendung".
- Auth unverändert: die Installation verleiht keine zusätzlichen Rechte. Home-Screen-Apps auf iPhone/iPad und Safari-Web-Apps am Mac haben eigenen Speicher (einmalige Neuanmeldung).
- Nicht Teil dieses Stands: Push, Badging, Manifest-Shortcuts, Share Target, `getInstalledRelatedApps`.

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

Seit der Final Bookability Closure (wirksam nach Merge) gibt es keinen JUMiNGO-Buchungsweg ohne gespeichertes Angebot mehr: `/book` ohne `offerId` endet mit 409 `OFFER_NOT_BOOKABLE`, bevor Budget, Claim oder Provider berührt werden. Tarif und Anbieterreferenz des Tarifs kommen aus dem Angebot (`bindJumingoOfferTariff`); `tariffId` und `shipperTariffId` des Clients sind nur noch Konsistenzwächter.

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

Ein Entwurf ohne Eigentümer (`user_id IS NULL`) ist für jedes Konto fremd: Neubepreisung, Warenkorbvorschau, `/book` und die Entwurfsreferenz antworten 404 ohne Providerkontakt (Final Bookability Closure, wirksam nach Merge). Bestehende besitzerlose Entwürfe werden nicht automatisch bereinigt — Zählung und Bereinigung sind eine Betreiberentscheidung (21).

### 5.9 Authentifizierung und Autorisierung

**Status: ACTIVE_CURRENT**

JWT allein ist nicht die vollständige Autoritätsquelle.

Der Backend-Auth-Pfad prüft Benutzerstatus und Rolle pro Request erneut gegen die Datenbank.

Ein gesperrter Benutzer darf nicht bis zum Ablauf eines alten JWT weiter autorisiert bleiben.

Jeder authentifizierte Pfad trägt eine feste Rollen-Allowlist (Vertriebspartner-Programm, wirksam nach Merge): Kundenbereich nur `customer`/`admin`, gemeinsame Kontofunktionen (Sitzung, Passwort, E-Mail-Wechsel) zusätzlich `sales_partner`, Partnerportal nur `sales_partner`; jede andere oder unbekannte Rolle wird abgelehnt (fail-closed, `ROLE_NOT_PERMITTED`). Das Frontend spiegelt diese Grenzen, ersetzt sie aber nicht.

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

Umgekehrt ist ein Ausgang, für den BEWIESEN ist, dass nichts bestellt wurde (Abbruch vor der Bestellung, dokumentierte Ablehnung, nachweislich nie zustande gekommene Verbindung), kein offener Ausgang: er trägt `BOOKING_FAILED` — der Transportstatus (409 oder 5xx) bleibt, der Code entscheidet —, und die Oberfläche bietet „Angebote neu berechnen“ statt „Zu meinen Sendungen“ (Final Bookability Closure, wirksam nach Merge; `lib/booking/bookingNotPlaced.js`).

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

**Final Bookability Closure** (2026-09-28, wirksam nach Merge): die Buchbarkeit eines JUMiNGO-Tarifs für DIESE Sendung entscheidet eine Funktion (`lib/jumingoBookability.js`) — beim Vergleich aus der rohen Tarifzeile und bei `/book` am frischen Tarif erneut; ein Tarif ohne diese Entscheidung ist `quote_only` (fail closed). Abgabe nur für einen kuratierten Carrier (`config/jumingoDropoffCapability.js`: UPS, DHL, GLS, DPD seit 2026-10-01, wirksam nach Merge), Gebietszuschlag und Warenkorbzuschläge nie gebucht, dreiwertige Grenzen, Firmen-/Privat-/Abholflags, Inhaltsangabe aus der gespeicherten Sendung (1A). Anbieterstatus erreicht den Kunden nie roh (`lib/providerFailureStatus.js`: 502, nur 404 bzw. 400/422 bleiben, wo sie eine Kundenaussage sind) — ein 401/403 des Anbieters meldet den Kunden nicht ab; scheitert die Live-Verfolgung, antwortet die Kundenroute mit dem gespeicherten Stand und der gespeicherten Sendungsnummer (`liveTracking: false`). Meldet ein Abruf mehrere verschiedene Etiketten, liegen sie als Belege der Buchung vor (`shipment_provider_documents`, dedupliziert über den Inhalt, an den gebuchten Versuch und den Eigentümer gebunden, byte-identisch — `lib/jumingoLabelDocuments.js`); N Etiketten sind N Downloads und N Mailanhänge, ein einzelnes bleibt auf dem bisherigen Weg. Liegt ein Mehrfachsatz nach der Ablage nicht vollständig in CE (ein Etikett nicht lesbar, Ablage gescheitert, kein gebuchter Versuch), wird nichts zwischengespeichert — kein `label_url`, kein `label_ready`; der Abruffehler `label_set_<grund>` steht in der Betriebssicht, der nächste Zugriff beschafft erneut, die Label-Mail wartet. Ohne direkten Schlüsseltreffer im Dokumentensatz gilt nur ein eindeutiger Satz (genau ein Eintrag), nie das Etikett einer fremden Sendung; die Admin-Labelauswahl ist dieselbe Funktion (Go-Live-Abschluss D3, 2026-09-29, wirksam nach Merge). Der Trackingtakt stellt eine gescheiterte Sendung (`tracking_fetch_failed_at`) für `TRACKING_SYNC_FAILURE_BACKOFF_MS` (Default 2 h) zurück und fragt gesunde Sendungen zuerst.

**Go-Live Block B — Tarifnamen, Versandart, Samstagszustellung** (Betreiberentscheidungen 2026-10-02, wirksam nach Merge): Die Angebotskarte zeigt für einen kuratierten Tarif denselben Namen wie Bestätigung und Rechnung — eine Tabelle (`lib/tariffDisplayName.js`, Exact-Match), keine zweite; ohne Kuration bleibt der neutrale Versandartname („Standardversand“/„Expressversand“/„Economyversand“), nie ein Rohname. Einzige Ausnahme: „JUMiNGO CARGO“ (3469) bleibt auf der Karte beim neutralen Namen. Die Versandart eines kuratierten Tarifs folgt derselben Exact-Match-Kuration (`classifyShippingMode` in `lib/serviceClassification.js`); nur ein nicht kuratierter Name fällt auf die Namensregel zurück. 3144 „ECONOMY EXPRESS“ ist STANDARD (Standardaufschlag), Versandart Economy, Name „Economy Express“; 3339 „EuroBusinessParcel“ ist STANDARD, Versandart Standard, Name „Standard Business Europa“ — jeweils genau dieser vollständige Name, keine Preisänderung gegenüber dem bisherigen UNKNOWN→Standard-Rückfall. `deliveryOnSaturday` ist `true` nur bei einem eindeutig aktiven Providerwert `delivery_on_saturday` (belegt: 3588, 3587, 3573, 1016), nie aus dem Namen. 3106 „JUMiNGO EXPRESS (UPS EXPRESS SAVER EU) VK“ bleibt bis zu einem belastbaren Carrier-Nachweis neutral (keine UPS-Kuration, keine Ableitung aus Name, Trackinghost oder dem DE-Wrapper).

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

- **Produktfreigabe eines Portfolioservice (seit 2026-10-05, vor allen übrigen Bedingungen):** ein Matrixeintrag mit `publicReleaseGate` (heute genau 86 und 137) erzeugt nur mit seinem Freigabeschalter (`TG86_PUBLIC_RELEASE_ENABLED` bzw. `TG137_PUBLIC_RELEASE_ENABLED`, nur exakt `"true"`) überhaupt ein Angebot. Zwei Schranken, beide vor jedem Providerkontakt: die Service-Policy (Schritt 3a′, `service_not_released`; sie bleibt ENV-frei und erhält `releasedServiceIds` von Angebotsmapper, Quote, Revalidierung und Szenariobepreisung — ohne das Feld fail closed) und die Buchbarkeit eines gespeicherten Angebots. Die Freigabe ist **nicht** der technische Buchungsweg: kein Adapterschalter liest sie, sie liest keinen Adapterschalter; Tracking, Etikett-Nachlauf, Rechnung und Buchungsklärung bestehender Sendungen lesen sie nicht. Ratchet: `tests/tg-public-release-gate.test.js` (mit allen Schaltern der ersten Welle und ohne Freigabe entstehen Angebote für genau deren 14 Services),
- Service `publicBookable` **und** Routenbereich in `publicBookableScopes` (heute die Services 22, 23 und 26 sowie seit dem DHL-Abschluss 84, 85 und 87 nur DE→DE, 107 nur DE→EU),
- `TRANSGLOBAL_PUBLIC_BOOKING_ENABLED` (Produktschalter, default aus),
- belegte Kontowährung `TRANSGLOBAL_ACCOUNT_CURRENCY=EUR` (default nicht gesetzt ⇒ kein TG-Angebot),
- **Servicekatalog der Umgebung (seit 2026-10-10, wirksam nach Merge):** die Anbieter-ServiceID muss im Katalog `TRANSGLOBAL_SERVICE_CATALOG` (genau `staging` oder `live`; in Produktion Pflicht, ohne Wert kein TG-Angebot und keine TG-Buchung) einem kuratierten Produkt zugeordnet sein. Transglobal nummeriert je Umgebung eigenständig (Live-Klärungstests 2026-10-10: Live 84/85 tragen andere DHL-Zeitprodukte als Staging 84/85, Live 124 ein anderes Produkt); übersetzt wird nur am Eingang (Quote) und am Ausgang (V2-Bestellung, Portaladapter), innen gilt der Produktschlüssel der Service-Policy. Live zugeordnet sind ausschließlich belegte IDs (Belegstandard: derselbe Anbieter-Produktname und Carrier, dieselbe Produktstruktur auf identischer Route zur selben Zeit in beiden Umgebungen, bei Portalprodukten derselbe Übergabevermerk der Angebotsseite; Preisparameter des Kontos sind kein Kriterium) — 22, 23, 26, 29, 41, 137 identisch, 49 ← 44, 44 ← 45, 85 ← 83, 87 ← 85, 84 ← 86, 107 ← 111, 110 ← 114, 124 ← 125; 47 und 48 bietet das Live-Konto nicht an (freischalten kann nur der Anbieter); eine gemessene Vertragsabweichung (Live-DHL 83/85/86/111: RES 5,00 bei Privatzustellung) übernimmt die Zuordnung nicht — die Adressartprüfung sperrt privat fail closed, bis eine Betreiberentscheidung die Kuration ändert; es wird keine ID geraten,
- Full Quote mit Buchungsreferenz, kuratierte Übergabeart und Preisklasse, gebundene Art der Lieferadresse (Services 22, 23, 26, 84, 85, 87 und 107: nach der Angebotsauswahl; ohne Bindung nicht buchbar), Packstückgrenzen der Service-Policy (22, 23 und 107 höchstens eins, 26, 84, 85 und 87 höchstens zwei),
- bei Abholung ein Abholtag nach heute; heute nur als Abholung am selben Tag eines Services mit dieser Fähigkeit (gebührenpflichtig 22, 23 und 26; gebührenfrei 84, 85, 87, 48 und 49 — siehe „Same-Day End-to-End" unten) vor dem wirksamen Abholschluss. Geprüft wird der Abholtag des Angebots — nach einem Abholtag-Rückfall der wirksame (siehe „Frühester Abholtag" unten).

Angebotsvertrag des Referenzservices (TG22 Golden Offer Contract): Leistungsname „Standardversand" (CE-Klassifikation wie ein Standardangebot der anderen Einkaufsquelle; eingefroren an Angebot, Sendung und Rechnung), Abholvertrag aus Abholtag und „bereit ab 09:00 Uhr" (kein Zeitfenster, kein „bis", keine Fensterwahl), Laufzeit „1–2 Tage" (Zustelldaten erscheinen nur, wo ein Anbieter sie liefert; dazu die voraussichtliche Lieferung als CE-Prognose, siehe unten), Labelformate „PDF · DIN A4 / Thermodruck" ohne Formatwahl, höchstens ein Packstück, zusätzliche Transportabsicherung nach Warenwert (bis 50 € Grundabsicherung ohne Aufpreis, oberhalb der Höchstdeckung kein Zusatz, sonst Preis ausschließlich über die Neubepreisung). Abholung am selben Tag siehe unten (TG22 Same-Day).

Die Bestellung braucht zusätzlich `TRANSGLOBAL_BOOKING_ENABLED` (technischer Kill-Switch, default aus). Angebot und Buchung prüfen dieselbe Quelle.

Art der Lieferadresse (TG22 Residential, wirksam nach Merge): Das Vergleichsangebot trägt den echten Geschäftspreis eines Full Quotes ohne Adressart (`priceCompleteness: "indicative"`, `requiredPriceInputs: ["deliveryIsResidential"]`, `unavailableReason: "price_inputs_required"` — auswählbar, nicht buchbar). Nach der Auswahl bepreist `POST /api/offers/price-input-options` genau zwei vollständige Full Quotes parallel (kein Retry, 15-Minuten-Snapshot am Angebot, fail closed bei jeder Inkonsistenz); `POST /api/offers/price-inputs` bindet ohne Providerkontakt aus diesem Snapshot (neue Preisrevision, eine gebundene Absicherung wird zurückgesetzt). `/book` verlangt Bindung und `offerRevision`, revalidiert mit der gebundenen Wahl und prüft Fracht, Zuschlag, Einkauf, Aufschlag und Kundenpreis gegen die Bindung; jede Abweichung verlangt eine neue Wahl.

Abholung am selben Tag (TG22 Same-Day, wirksam nach Merge): Für Service 22 — seit TG23 ebenso für Service 23 — ist ein heutiger Abholtag buchbar, solange die Berliner Uhrzeit vor dem wirksamen Abholschluss liegt (`SameDayCollectionCutOffTime` des frischen Quotes minus 15 Minuten). Die Gebühr (`COLFEE`, optionales Extra außerhalb von `TotalCost`) wird zum Einkauf addiert und durchläuft die zentrale Preisfunktion; der Anbieter berechnet sie bei einem heutigen `CollectionDate` automatisch, BookShipment sendet kein Accessory. ReadyFrom ist die Uhrzeit der Bestellung, aufgerundet auf die Viertelstunde, mindestens die gespeicherte Bereitzeit. Angebot, Optionen, Bindung, Neubepreisung und `/book` prüfen dasselbe Zeitfenster; eine letzte Schranke unmittelbar vor der Bestellung verhindert eine Bestellung nach dem wirksamen Abholschluss (`409 SAME_DAY_COLLECTION_UNAVAILABLE`). Kein Schalter, keine ENV-Änderung, keine Schemaänderung; alle anderen Services und JUMiNGO unverändert. Grundvertrag (wirksam nach Merge): Einzige Quelle des Abholschlusses ist `SameDayCollectionCutOffTime` des frischen Full-Quotes — Transglobal hat keine eigene Cutoff-Schnittstelle, und das Feld fehlt, wenn dem Anbieter die Information fehlt oder der Abholschluss zum Quote-Zeitpunkt vorbei ist. Kein Ersatzwert, keine zweite Quelle, kein zusätzlicher Providerrequest; ein Preisvergleich stellt weiterhin genau einen Quote. Öffentlich unterscheidet das Angebot `same_day_unavailable` (zeitlich abgelaufen), `same_day_unconfirmed` (kein Abholschluss im Quote) und `same_day_unverifiable` (unbrauchbare Abholschluss-, Gebühren-, Preis- oder Uhrdaten; ebenso jede unbekannte Ursache); jede 409 `SAME_DAY_COLLECTION_UNAVAILABLE` trägt dazu `sameDayUnavailableKind` (`expired` / `unconfirmed` / `unverifiable`) und den Text dieser Art, nie einen internen Grund. Ist die Abholung heute für ein Angebot nicht verkäuflich, trägt die Karte `collectionReadyFrom: null` und nur den Abholtag; der gespeicherte Abholvertrag bleibt unverändert. Seit TG UPS Effective Collection Date gilt beides nur noch für einen Service ohne kuratierten Abholtag-Rückfall — 22 und 23 tragen stattdessen den nächsten Versandtag (siehe „Frühester Abholtag" unten); die 409-Verträge der Buchungswege bleiben unverändert.

Produktdetails (TG22 Package A, wirksam nach Merge): Service 22 trägt ein kuratiertes Produktprofil — wirtschaftlicher Standardversand für weniger eilige Sendungen, ein Packstück je Sendung, höchstens 70 kg je Packstück, Volumendivisor 5.000 ausschließlich zur Erklärung des Abrechnungsgewichts, Paletten und Koffer nicht zugelassen. Öffentlich erscheint es als `serviceDetails` (Codes und Zahlen, dazu die Absicherungsgrenzen 50 € / 2.500 €) und als Tarifgrenze `weight <= 70`; seit TG23 trägt Service 23 beides ebenso (Kurzbeschreibung „Schneller Expressversand für eilige Sendungen."). Die Service-Policy setzt die 70-kg-Grenze an denselben Stellen durch wie die Packstückzahl (Vergleich, Optionen, Revalidierung, `/book`): genau 70,0 kg ist erlaubt, darüber entsteht kein Angebot und keine Buchung, ohne belegtes Gewicht ist die 22 gesperrt. Das Abrechnungsgewicht bleibt der Anbieterwert, die Laufzeit „1–2 Tage" ohne Uhrzeit; ein Datum steht nur in der getrennten voraussichtlichen Lieferung (siehe unten). Nicht Teil des Profils: Access Point, Samstagszustellung, Länge und Gurtmaß, Zustellzusagen, statische Zuschläge oder Preise. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; JUMiNGO und alle anderen Services unverändert.

Voraussichtliche Lieferung (TG22 Package B, wirksam nach Merge): Transglobal nennt keine Zustelldaten, nur `TransitTimeEstimate`. Für Service 22 und seit TG23 für Service 23 rechnet ConfidaraExpress daraus eine eigene Prognose `deliveryProjection { kind: "estimated", dateMin, dateMax }`: Basis ist der Abholtag des Angebots (`requestedShippingDate`, Tag 0), gezählt werden Montag bis Freitag, Samstag, Sonntag und seit der Final Bookability Closure die neun bundesweiten Feiertage werden übersprungen, regionale und ausländische nicht; `1-2` ergibt einen Zeitraum, `1` einen Tag, `1+` nur `dateMin`. Keine Prognose ohne gültigen Abholtag, bei unlesbarer Laufzeit oder wenn eine heutige Abholung nicht mehr möglich ist und nicht verschoben wird; nach einem Abholtag-Rückfall beginnt sie am wirksamen Abholtag. Keine Uhrzeit, keine Anbieterzusage. Die Prognose steht nie in `deliveryDateMin/Max`, wird nicht gespeichert und hat keine Wirkung auf Preis, Buchbarkeit, Sortierung, Revalidierung, `/book`, Rechnung, Sendungs-ETA, Lieferdatumsfilter oder Kennzahlen. JUMiNGO-Zustelldaten und -uhrzeiten bleiben unverändert autoritativ. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; alle anderen Services unverändert.

Expressversand (TG23, Backend gemergt; Frontend wirksam nach Merge): Service 23 (UPS Express Saver) trägt dieselbe Kuratierung wie der Referenzservice 22 — Leistungsname „Expressversand" (CE-Klassenname des JUMiNGO-Pendants), Preisklasse EXPRESS (Expressaufschlag des Kontos, ohne gültigen Wert der Standardaufschlag; kein Satz im Code; die Absicherung bleibt 1:1 und steuerfrei), `publicBookableScopes` nur DE→DE, höchstens ein Packstück als CE-Launchgrenze und 70 kg je Packstück, Art der Lieferadresse nach der Auswahl, Abholung am selben Tag mit der Gebühr aus dem frischen Quote, Transportabsicherung nach Warenwert, Tracking, Label „PDF · DIN A4 / Thermodruck", Produktprofil `express_urgent` und die voraussichtliche Lieferung (Laufzeit „1": ein Tag). Keine Zustelluhrzeit, keine Garantie, keine Anbieterangaben beim Kunden. Kein neuer Produktionspfad, kein Schalter, keine ENV-Änderung, keine Schemaänderung; JUMiNGO und alle anderen Services unverändert. Die Aktivierung folgt derselben Konjunktion wie bei Service 22 — die Schalter gelten gemeinsam für beide Services. Status: staging smoke passed / provider booking evidence confirmed — ein Staging-GetQuote und ein Staging-BookShipment (2026-09-15) bestätigen die Buchung mit Abholung am selben Tag, Privatadresse und Absicherung: Same-Day-Gebühr automatisch ohne Accessory, Anbieterrechnung netto = TotalCost + COLFEE + INS (Delta 0,00, INS steuerfrei), Labels A4 und Thermal. Positionstexte der Anbieterrechnung nennen den Anbieter; verglichen wird ausschließlich an Beträgen.

UPS-Vervollständigung (wirksam nach Merge): Service 29 (UPS Express, „Express") trägt die Kuratierung der 23 mit ausschließlich belegten Werten — `maxPackages: 1` als CE-Grenze, kein Gewicht, Produktprofil `express_urgent` mit nicht belegtem Divisor (`volumetricDivisor: null`: Profil ja, Volumengewichtsformel nein), Paletten und Koffer, Tracking, Druckpflicht, Absicherung, Art der Lieferadresse, Abholung am selben Tag und Werktagsprognose — seit **2026-09-23 DE→DE öffentlich buchbar** (`publicBookable: true`, `publicBookableScopes: [DE_DOMESTIC]`); DE→EU bleibt Preisauskunft. Belegt ist ein Staging-Full-Quote (2026-09-16: Fracht 24,36, Privatzuschlag 2,65, Same-Day-Gebühr 2,52 mit Abholschluss 17:00, Absicherung 10,00 bei Warenwert 500, Labels A4 und Thermal) und fünf eigene Stagingbuchungen (DE0052577 sowie DE0052640/41/42/44). Der zunächst nicht bestandene Smoke (Quote 1266, Buchung DE0052577) ist durch die vier weiteren Buchungen aufgelöst: die Position „Collection" über 2,00 € netto ist eine feste Buchungskostenposition je SENDUNG, unabhängig von Adressart, Absicherung, Zielzone und Rechnungshöhe, und wird in keinem Vorabkanal ausgewiesen (kein COL-Bestandteil, Preis mit = ohne Abholung; im Webportal alle Abholgebührfelder 0). Sie lebt deshalb als **kuratierter Providerkostenvertrag** an genau einer Stelle (`config/transglobalProviderBookingFee.js`: deny by default, ganze Cent, Fail-Fast beim Laden, nur der gemessene Routenbereich) und geht über `resolveProviderPurchaseNet` in den Einkauf — dieselbe Funktion, die eine Same-Day-Gebühr addiert. Angebot, Optionen, Bindung, Neubepreisung, Revalidierung und Rechnungserwartung rechnen damit denselben Betrag; die Quote-Evidenz der Bindung (`providerNetCents`, `providerTotalCost`) bleibt ausdrücklich OHNE ihn, weil kein Quote sie nennt, und der effektive Einkauf entsteht in `boundPurchaseNetCents` an genau einer Stelle. Eine Angebotszeile, deren Einkauf sie nicht trägt, gilt als nicht gebunden und erreicht den Anbieter nicht. **Nicht freigegeben: die Abholung am selben Tag** — der `sameDayCollection`-Block der 29 ist entfernt, ein heutiger Wunschtag verschiebt sich über `collectionDateFallback` sichtbar auf den nächsten Versandtag, und der Preis ist an jedem Tag derselbe. Service 26 (UPS Standard Multi, „Standardversand Mehrpaket") ist seit TG26 öffentlich buchbar für genau den belegten Umfang: nur DE→DE, `maxPackages: 2` (CE-Launchgrenze, kein Höchstgewicht), Art der Lieferadresse nach der Auswahl (Szenarioprüfung: genau ein Zuschlag Privatadresse), Transportabsicherung, Tracking und Druckpflicht aus Kuration; ohne Abholung am selben Tag, ohne Produktprofil, ohne Prognose. Belegt durch einen Staging-Full-Quote und eine Staging-Buchung (2026-09-17, zwei gleiche Packstücke je 2 kg: Fracht 26,61, Privatzuschlag 2,65 einmal je Sendung, Absicherung 10,00, Rechnung 39,26 netto centgenau ohne weitere Position; ein A4- und ein Thermal-PDF mit je einer Seite je Paket). Das Full-Quote-Paketmodell fragt N gleiche Packstücke an, Revalidierung und Buchung lesen dieselbe Entwurfszeile; eine gemeinsame Sendungsnummer ergibt EIN logisches Versandlabel in zwei Formaten, mehrere Sendungsnummern generisch „Versandlabel k von N (Format)" und je eine Tracking-Etappe. Die Transportabsicherung entsteht nur für Services mit kuratierter Fähigkeit (`capabilities.transportInsurance`, Stand TG Staging Final Closure 2026-09-29: 22, 23, 26, 29, 41, 44, 48, 49, 84, 85, 86, 87, 107 — jede Aufnahme stützt sich auf eine Staging-Buchung mit Absicherung) — das Anbieterextra allein genügt nicht, obwohl der Anbieter `INS` an jeder Quotezeile führt. Ohne kuratierte Fähigkeit sind allein die Portaltarife 47, 110, 124 und 137: ihr Angebot trägt auch buchbar keine Absicherung (`insuranceAvailable: false`, `insuranceDetails: null` — die Angebotskarte sagt „Keine Zusatzversicherung verfügbar.“, die Buchungsseite zeigt kein Absicherungsmodul), und der Portalkern beendet eine dennoch mitgeschickte Absicherung vor jedem Portalaufruf (`insurance_not_supported`). Die frühere offene Produktentscheidung zu 41/48/49 ist gefallen (Betreiber, 2026-09-29: unterstützen, wenn Staging es belegt) und belegt: je eine eigene versicherte Staging-Buchung (DE0052655/56/57, TG Staging Final Closure). Jede ausgewertete Transglobal-Antwort schreibt eine Bestandszeile (`[TG service-inventory]`: angebotene ServiceIDs, abgelehnte nur mit ServiceID, Carrier und Grund, unbekannte ServiceIDs kuratierter Carrier als Warnung) — ohne zusätzlichen Request. Nachträgliche Anbieterbelastungen bleiben Befund der bestehenden Rechnungsprüfung; die Stornierung ist unverändert. Kein Schalter, keine ENV-Änderung, keine Schemaänderung; JUMiNGO funktional unverändert (das kuratierte Paar „EXPRESS ®" ↔ 29 bestand bereits; für die 26 gibt es kein Paar).

DHL Foundation (wirksam nach Merge): Service 84 (DHL Domestic Express, „Domestic Express") ist vollständig kuratiert — EXPRESS, Direktabholung, nur DE→DE, `maxPackages: 2` (CE-Launchgrenze), Tracking, Druckpflicht, Transportabsicherung und `priceInputs.deliveryIsResidential: "declared_no_surcharge"` —, aber `publicBookable: false` ohne Routenbereich: Preisauskunft; Optionen, Bindung, Neubepreisung und `/book` enden vor jedem Providerkontakt. Belegt durch die Staging-Quotes 1274/1275 und die Staging-Buchung DE0052580 (Rechnung INV-0040781 centgenau: Fracht 17,74 + ISC 101,00 + Absicherung 10,00, Steuer nur auf den Versand; kein `RES`, kein `COL`, keine Position „Collection"; Laufzeit „1", Abrechnungsgewicht 4; Abholschluss im Quote, aber keine Abholung am selben Tag). Die Aktivierungsprobe beweist die ganze Kette mit genau dem Wechsel der beiden Freigabefelder. Offen vor einer Freigabe: die Zuordnung der DHL-Trackingereignisse (keine erfundene Abbildung — ein nicht belegter Code bleibt „unbekannt") und die Produktionsbedeutung von ISC. **Art der Lieferadresse ohne Zuschlag** ist ein generischer Modus der Service-Policy (`PRICE_INPUT_MODE.DECLARED_NO_SURCHARGE`, nur für die Zustelladresse; die Abholadresse bleibt fest geschäftlich): die Adressart wird wie bei `surcharge_options` nach der Auswahl erfragt, gebunden und an den Anbieter übermittelt, beide Szenarien müssen aber centgenau gleich sein; die Bestandteile tragen nie „Zuschlag Privatadresse" und die Herleitung `scenario_difference_no_residential_surcharge` (bestehende Snapshots behalten `scenario_difference`). Das Angebot nennt die Angabe zusätzlich in `surchargeFreePriceInputs` (öffentlich, providerneutral, Teilmenge von `requiredPriceInputs`, sonst `[]`). Fail closed: ein `RES` oder eine andere Preisdifferenz der Szenarien sperrt die Optionen (`409 OFFER_NOT_BOOKABLE`, kein Snapshot, kein Wiederholungsangebot); ein Zuschlag bei der Revalidierung ergibt `PRICE_CHANGED` mit Neubestätigung, die dann an derselben Sperre endet; Snapshot, Bindung, Evidenz und Bestandteile werden gegen die aktuelle Kuratierung gelesen — wechselt sie, gilt keine alte Bindung. ISC und jeder andere Bestandteil außer Fracht und Zuschlag sind gewöhnliche Einkaufsbestandteile ohne Sonderregel. Belege: eine gemeinsame Sendungsnummer ergibt EIN logisches Versandlabel in zwei Formaten und genau eine Trackingreferenz; DHL-Stücknummern stehen nur im Carrier-PDF und werden nicht gespeichert (kein Datenmodell ohne Bedarf). Die Metadaten der gemessenen Carrier-PDFs nennen die Einkaufsquelle; Kundendownloads und Mailanhänge laufen durch die bestehende Metadaten-Neutralisierung, der Seiteninhalt bleibt unverändert (sichtbarer Text ohne Einkaufsquelle in den ausgewerteten Inhalten; eine Sichtprüfung der dritten Seite steht aus). Fristen: unverändert. Jede Full-Quote-Wiederholung nach der Auswahl (Optionen, Neubepreisung, Revalidierung vor dem Claim) nutzt weiterhin `TRANSGLOBAL_BOOK_PRE_ORDER_TIMEOUT_MS` mit 20 s, der Vergleich `TRANSGLOBAL_QUOTE_TIMEOUT_MS` mit 30 s, die Bestellung `TRANSGLOBAL_ORDER_TIMEOUT_MS` mit 90 s. **Offener Betriebsbefund, nicht Teil dieses Pakets:** die gemessenen Staging-Full-Quotes liegen bei etwa 26–41 s, sodass die heutigen Vorgaben dort zu Timeouts führen können; die Produktionslatenz ist nicht gemessen; keine Umgebung setzt einen der drei Schlüssel (Stand 2026-09-17, nur Schlüsselnamen gelesen). Die Lösung gehört in ein eigenes TG-weites Latenz-/Fristenpaket — die DHL Foundation ändert keine Frist. (Nachtrag: dieser Befund ist durch den UPS-Abschluss TG22/TG23/TG26 aufgelöst, die geltenden Fristen stehen dort.) Kein Schalter, keine ENV-Änderung, keine Schemaänderung; 22, 23, 26, 29 und JUMiNGO unverändert. (Nachtrag DHL-Abschluss 2026-09-19: die 84 ist DE→DE freigegeben, die beiden offenen Punkte — Trackingereignisse und ISC — sind dort aufgelöst.)

DHL Zeitfamilie (wirksam nach Merge): die Services 85 (9am) und 87 (12pm) tragen dieselbe Kuratierung wie die 84 und heißen kundenseitig „Domestic Express 9:00" bzw. „Domestic Express 12:00"; beide bleiben `publicBookable: false` ohne Routenbereich. Belegt **ohne einen einzigen neuen Providerrequest** aus den bereits erhobenen Staging-Quotes 1265 (ein Packstück) und 1275 (zwei Packstücke je 2 kg): Carrier DHL, kein Lagerservice, keine `CollectionOptions`, With = Without, `TransitTimeEstimate` „1", `INS` 10,00 als optionales Extra, kein `COLFEE`, Abholschluss 15:00, Primary-Label PDF A4/Thermal — und im Breakdown **ausschließlich Fracht**: kein `RES` trotz privater Zustelladresse, kein `COL`, kein `STK` und **kein `ISC`**. Damit ist von der anderen Seite belegt, dass `ISC` ein Befund der 84 ist und keine Familienregel. **Die 87 hat danach ihre eigene Buchungsevidenz** (Staging, ausdrücklich freigegeben, 2026-09-17: genau ein Full GetQuote und genau ein BookShipment, kein Retry, kein TrackOrder, kein Cancel): Quote 1276 mit Fracht 22,54 als einzigem Bestandteil — kein ISC, kein Zuschlag Privatadresse trotz privater Zustelladresse, keine Abholposition, kein Sperrgut, With = Without, Absicherung 10,00 als Extra, Laufzeit „1", Abrechnungsgewicht 4, keine CollectionOptions, kein Lagerservice. Buchung DE0052581, Rechnung INV-0040782 = Fracht + Absicherung = 32,54 netto, Steuer 4,28 nur auf den Versand, brutto 36,82, centgenau und ohne Abweichung; keine Position „Collection", kein Zuschlag Privatadresse, kein Sperrgut, keine unbekannte Position. Belege: ein A4- und ein Thermal-PDF mit je drei Seiten, eine gemeinsame Sendungsnummer, zwei DHL-Stücknummern (eine je Paket), eine Trackingreferenz. Aus derselben Antwort wurden 84, 85 und 86 ohne Zusatzanfrage mitprotokolliert; die 86 wurde dabei live mit `product_identity_unverified` gesperrt — die neue Schranke greift gegen echte Anbieterdaten. 85 und 86 haben **keine** eigene Buchungsevidenz; alle drei bleiben Preisauskunft. **Die Uhrzeit im Namen ist Produktidentität, keine Zusage:** weder Anbieterantwort noch Portaltext nennt eine Zustellzeit, deshalb steht die Uhrzeit als Teil des Produktnamens und nie als „Zustellung bis …", ohne Garantie und ohne Geld-zurück-Aussage; die Schreibweise folgt dem kuratierten Gegenstück desselben Carriers im anderen Einkaufsweg („EXPRESS DOMESTIC 9:00" / „… 12:00"), die Uhrzeit ist also doppelt belegt. **Service 86 (10am) erzeugt kein Angebot:** der Katalog desselben Carriers kennt 9:00, 10:30 und 12:00 — welches Produkt „10am" benennt, ist offen, und die Gleichsetzung mit der 10:30-Variante ist ausdrücklich abgelehnt. Umgesetzt ist das als allgemeine Schranke, nicht als ServiceID-Sonderfall: das neue Policy-Feld `productIdentityVerified` (Default `true`, damit kein künftiger Eintrag still unsichtbar wird) und der neue Grund `product_identity_unverified`, geprüft **vor** der Carrierprüfung; der Eintrag bleibt in der Matrix und erscheint mit diesem Grund in der Bestandsdiagnose. Bewusst **nicht** übernommen: die Portalbeschreibung der DHL-Expressfamilie (Maße, Gewichtsempfehlung, Palettenhinweis) ist ein Familientext für jedes Produkt und kein Vertrag je Service; sekundäre Grenzen aus dem DHL-Deutschland-Katalog gelten für einen anderen Vertragspartner; der im Portal sichtbare Sperrgutzuschlag (75,00 € für alle vier DHL-Inlandsservices) und `postcodeCheckRequired` stehen **nicht** in der V2-API — CE kann sie weder sehen noch weitergeben, deshalb steht keiner von beiden im Code, und die **Postleitzahl-Verfügbarkeit ist für CE nicht feststellbar**. Offener Befund außerhalb dieses Pakets: die TNT-Zeitprodukte 47/48/49 tragen aus einer früheren Kuratierung „Express — Zustellung bis 9/10/12 Uhr" — dieselbe Formulierung mit derselben offenen Zusagefrage; eigene TNT-Klärung. **Familienevidenz aus TG84 + TG87** (zwei Services desselben Carriers, dieselbe Route, derselbe Testfall, zweimal dieselbe Struktur): Direktabholung, Collection-Verhalten (With = Without, keine Abholposition in der Rechnung, kein Abholetikett), Art der Lieferadresse ohne Zuschlag, Transportabsicherung als eigene steuerfreie Rechnungsposition, Rechnung = frischer Quote + gewählte Absicherung, Steuer nur auf den Versand, Belegformate (Primary PDF in A4 und Thermal, je drei Seiten) und das Sendungsnummernmodell (eine gemeinsame Nummer, Stücknummern je Paket). **Nicht** als Familienvertrag übernommen: die genaue Uhrzeit, eine Garantie, die Postleitzahl-Verfügbarkeit, Gewichtsgrenzen, das ISC (Befund der 84) und die Produktidentität der 86. Weitere Providerevidenz ist für den heutigen Stand nicht nötig: die 85 braucht ihren eigenen Buchungssmoke erst für eine Freigabe, die 86 eine Anbieterauskunft. Kein Schalter, keine ENV-Änderung, keine Schemaänderung, keine Fristenänderung; 84, 22, 23, 26, 29 und JUMiNGO unverändert, 107 und 117/118 nicht angefasst. (Nachtrag DHL-Abschluss 2026-09-19: die 85 hat ihre Buchungsevidenz seit 2026-09-18 — Quote 1282, DE0052583, siehe Druckvertrag —; 85 und 87 sind DE→DE freigegeben, die 86 bleibt unverändert gesperrt.) (Nachtrag TG Staging Final Closure 2026-09-29: die Produktidentität der 86 ist durch eine Buchungsevidenz aufgelöst — DE0052654, Etikett „[O] EXPRESS 10:30 (33)“; die 86 heißt „Domestic Express 10:30“, ist DE→DE freigegeben und mit „EXPRESS DOMESTIC 10:30“ gepaart, siehe 1A.)

TG107 DHL Economy Select (wirksam nach Merge): Service 107 ist vollständig kuratiert — STANDARD, Direktabholung, nur DE→EU, `maxPackages: 1`, Tracking, Druckpflicht, Transportabsicherung —, aber `publicBookable: false` ohne Routenbereich: Preisauskunft. Er ist der **erste EU-Block mit eigener Buchungsevidenz**; alle früheren Buchungssmokes liefen DE→DE. Belegt durch Staging-Quote 1277 und Buchung DE0052582 / Rechnung INV-0040783 (DE 63741 geschäftlich → FR 75001 privat, EIN Packstück 2 kg, 30 × 20 × 15 cm, Warenwert 500, Absicherung 500/20; ausdrücklich freigegeben, genau ein Full GetQuote und genau ein BookShipment, kein Retry, kein TrackOrder, kein Cancel): Carrier DHL, `ServiceType` Air, kein Lagerservice, **keine `CollectionOptions`**, Abholschluss 14:30, **Fracht 15,14 als einziger Bestandteil** — kein `ISC`, kein `RES` trotz privater Zustelladresse, kein `COL`, kein `STK`, keine Fernzone, kein unbekannter Code —, With = Without, `INS` 10,00 als optionales Extra, kein `COLFEE`, **Abrechnungsgewicht 2 = Realgewicht (kein Volumengewicht)**, Laufzeit „5", Primary-Label PDF A4/Thermal, EUR. Rechnung = Fracht + Absicherung = 25,14 netto, Steuer 2,88 nur auf den Versand, brutto 28,02 — centgenau, ohne Position „Collection", ohne Zuschlag Privatadresse, ohne Sperrgut, ohne unbekannte Position, ohne Abweichung; die Absicherung ist eine eigene **steuerfreie** Position. Belege: ein A4- und ein Thermal-PDF mit je **zwei** Seiten (die DHL-Express-Inlandsbelege hatten drei), **eine gemeinsame Sendungsnummer**, eine DHL-Stücknummer, genau eine Trackingreferenz, keine `Documents`. **Die EU-Steuer wurde gemessen, nicht angenommen:** der Satz wird aus dem Quote gelesen (Brutto/Netto) und nur auf innere Konsistenz geprüft; Ergebnis 19,02 %, also 19 % nach Centrundung — im Code steht kein Steuersatz je Service oder Route, und Preis- wie Steuerhoheit bleibt der Anbieter. **Die Adressart bleibt bewusst unkuratiert:** die Zustelladresse war privat und trug keinen Zuschlag, aber das ist ein Befund über EINE Adressart und kein Vertrag über beide; „Art der Lieferadresse ohne Zuschlag" wird deshalb **nicht** von 84/85/87 übernommen, und die 107 trägt gar kein `priceInputs`. Ein unkuratierter Abholservice fällt providerweit auf „beide Adressarten" zurück — bestehendes Verhalten für jeden unkuratierten Transglobal-Service und folgenlos, solange die 107 `quote_only` ist; eine zuschlagsfreie Zusage gibt sie ausdrücklich nicht. Ebenfalls **nicht** kuratiert: Höchstgewicht, Maße, Volumendivisor (aus einer Sendung ohne Aufschlag ist kein Divisor rückrechenbar; der Portaltext 120 × 80 × 100 cm / 70 kg ist ein Familientext), Abholung am selben Tag, Produktprofil, CE-Prognose, Zeit- oder Lieferzusage (die Antwort trug genau ein Zeitfeld und **null** strukturierte Zusagen), Fernzonen- und PLZ-Regeln (die V2-API führt weder das eine noch das andere; der Portalwert des EU-Sperrgutzuschlags von 175,00 € steht nirgends im Code) sowie **DHL-Trackingereigniscodes** (die bekannte Tabelle stammt aus UPS-Belegen und bleibt unverändert). White Label wie bei 84/87: „Transglobal Express" nur in den PDF-Metadaten, die bestehende Neutralisierung genügt, der Seiteninhalt wird nie verändert. Offen vor einer Freigabe: der Adressartvertrag (zwei Szenarien statt einem), mehr als ein Packstück, weitere EU-Ziele (gemessen ist eine von 27 Strecken), die Zuordnung der DHL-Trackingereignisse, Fernzonen-/PLZ-Verfügbarkeit und Gewichts-/Maßgrenzen. Kein Schalter, keine ENV-Änderung, keine Schemaänderung, keine Fristenänderung; 84/85/86/87, 22, 23, 26, 29 und JUMiNGO unverändert, 117/118 nicht angefasst. (Nachtrag DHL-Abschluss 2026-09-19: die 107 ist DE→EU freigegeben — der Adressartvertrag wird bei jeder Buchung in beiden Szenarien gemessen, mehr als ein Packstück bleibt gesperrt, die Trackingbedeutung ist carriergebunden; weitere EU-Ziele, Fernzonen-/PLZ-Verfügbarkeit und Gewichts-/Maßgrenzen sind keine CE-Regel, sondern entscheidet der frische Quote jeder Sendung: ein Ziel, für das der Anbieter die 107 nicht nennt, erzeugt kein Angebot und keine Buchung.)

**Druckvertrag mehrseitiger Providerbelege** (wirksam nach Merge): Ein Anbieterbeleg ist nicht zwangsläufig nur ein Etikett. Die erste Sichtprüfung eines echten Belegs (TG85, Quote 1282, Auftrag DE0052583, Rechnung INV-0040784, zwei Packstücke) zeigt für A4 **und** Thermodruck je **drei Seiten**: zwei Versandetiketten, die der Carrier selbst mit „attach it to your parcel“ beschriftet, und danach ein **Waybill Doc** mit „**Not to be attached to package - Hand to Courier**“ und „Please print off and hand this Waybill Doc to the driver.“ ConfidaraExpress nannte die ganze Datei „Versandlabel“ und sagte zum Umgang mit den Seiten nichts — ein Kunde konnte den Frachtbrief aufkleben oder wegwerfen, obwohl ihn der Fahrer braucht. **Daraus wird ausdrücklich keine Seitenregel:** UPS Standard Multi (26) liefert für zwei Packstücke **zwei** Seiten, beide Etiketten, ohne Begleitdokument. „Seiten = Packstücke + 1“ ist ein Befund der DHL-Familie, keine Regel; es wird keine Seite klassifiziert, keine Seitennummer genannt und kein Anbieter unterschieden. Abgebildet wird allein die über alle Anbieter wahre Aussage: hat ein Beleg mehr als eine Seite, kann CE die Zuordnung nicht bestimmen — der Carrier kann es und druckt sie auf die Seite. Dafür trägt `shipment_provider_documents` die Spalte `page_count` (additiv, idempotent; `NULL` heißt „nicht erfasst“ und ergibt **keinen** Hinweis — der Satz behauptet „umfasst mehrere Seiten“, und das darf nicht über etwas gesagt werden, das niemand gemessen hat; bewusst **nicht** fail closed, weil eine unbelegte Aussage hier schlimmer wäre als eine fehlende. Für den auslösenden Fall folgenlos: die DHL-Familie war beim Druckvertrag `quote_only`, es existiert kein ausgelieferter DHL-Beleg im Altbestand, und jede künftige Buchung — seit dem DHL-Abschluss auch jede DHL-Buchung — trägt die Seitenzahl), gelesen mit `pdf-lib` einmal je Beleg direkt nach der Buchung; ein synchroner Byte-Scan wäre billiger und ist **nachweislich gescheitert**, weil die Anbieterbelege PDF 1.5 mit komprimierten Objektströmen sind. Die Seitenzahl ist beschreibend und steht **nicht** im Integritätsabgleich; die Prüfsumme deckt die Bytes. Die PDF-Bytes werden nur gelesen, nie verändert. **White Label ist damit für einen DHL-Beleg erstmals visuell belegt:** über sechs gerenderte Seiten kein sichtbarer Name der Einkaufsquelle und keine Anbieter-URL; das Absenderfeld nennt CEs eigenen Kontonamen, und die einzigen „Transglobal Express“-Vorkommen liegen in `Author` und `Creator` der PDF-Metadaten, die `sanitizeCustomerPdfMetadata` vollständig ersetzt. **Korrektur 2026-09-19 (DHL-Abschlussaudit):** die frühere Aussage „kein Konto- oder Supplierhinweis“ war unzutreffend — Etikett und Waybill Doc tragen „Ref No: <Auftragsreferenz der Einkaufsquelle> / <CE-Referenz>“ (offen als EXTERNAL_WHITE_LABEL_DECISION_REQUIRED, siehe 1A und 5.12; CE verändert den Seiteninhalt nicht) und „Payer Details … FRT“ mit der Kontonummer des Frachtzahlers (Abrechnungsfeld des Carriers ohne Namen der Einkaufsquelle, zulässig). Erlaubtes DHL-Branding ist reichlich vorhanden. Nebenbefund: die **Produktidentität der 85** ist vierfach belegt (Quote-Name, Labelkopf „EXPRESS 9:00“, Waybill Doc „[I] EXPRESS 9:00 (32)“ mit DHL-Servicecode, Rechnungsposition) — **ohne** dass daraus eine Zustellzusage folgt; der Quote trug genau ein Zeitfeld und null strukturierte Zusagen. Derselbe Weg über das Waybill Doc ist der aussichtsreichste, um die Produktidentität der 86 zu klären. Keine Freigabe-, Preis-, Policy-, ENV- oder Schalteränderung.

**UPS-Abschluss TG22/TG23/TG26** (wirksam nach Merge): Die Transglobal-Fristen folgen den gemessenen Antwortzeiten (Staging, 2026-09-16 bis -18: Full Quotes 26,5–46,4 s, BookShipment 12,6–14,2 s, TrackOrder 39,9 s in einer Messung; **die Produktionslatenz ist nicht gemessen**). Mit den früheren Fristen endete jede Full-Quote-Wiederholung nach der Auswahl (20 s) und die Mehrzahl der Vergleiche (30 s) als Abbruch — sicher, aber ohne Angebot bzw. ohne Buchung —, TrackOrder (fest 15 s) immer. Server: Vergleich `TRANSGLOBAL_QUOTE_TIMEOUT_MS` **55 s**; Optionen, Neubepreisung und Revalidierung vor dem Claim `TRANSGLOBAL_BOOK_PRE_ORDER_TIMEOUT_MS` **55 s**; Bestellung `TRANSGLOBAL_ORDER_TIMEOUT_MS` unverändert **90 s** (ein Abbruch dort ist mehrdeutig); TrackOrder neu über `TRANSGLOBAL_TRACKING_TIMEOUT_MS` mit **50 s** (Bereich 1000–60000, ein ungültiger Wert fällt auf die Vorgabe zurück — dieselbe Disziplin wie bei den übrigen Fristen). Jede Frist ist eine Notbremse, keine Wartezeit, liegt über dem gemessenen Höchstwert und unter der Browserfrist ihres Aufrufers; `/book` im Grenzfall 55 s + 90 s = 145 s unter 150 s. Jeder Transglobal-Anbieteraufruf schreibt genau eine Laufzeitzeile `[TG timing]` mit Methode, Transportart, HTTP-Status, Dauer und Frist — nie Körper, Zugangsdaten, Host, Auftragsreferenz oder Antwortinhalt. Der Transglobal-Trackingtakt stellt eine Sendung nach einem gescheiterten Abruf im Prozess zurück (mindestens die Freshness-Frist, verdoppelt je weiterem Fehlschlag, höchstens 6 h; ein Erfolg hebt sie auf) und zählt für den Circuit Breaker nur Transport- und Konfigurationsfehler: dauerhaft scheiternde Sendungen verdrängen die übrigen nicht mehr. Ein Fehlschlag schreibt weiterhin nichts, es gibt keinen Retry, der JUMiNGO-Takt ist unverändert. Kein Schalter, keine Freigabe-, Preis-, Policy- oder Schemaänderung; Same-Day-Normalizer (ohne Beleg für einen fehlerhaften Quellfall nicht angefasst), Kuratierung der 22/23/26 (26 höchstens zwei Packstücke), `MULTI_PROVIDER_DEBUG_MODE`, TG29, DHL und JUMiNGO unverändert. Ob Proxy und Containerlaufzeit diese Fristen tragen (Traefik-Fristen, Stop-Grace für `SHUTDOWN_GRACE_MS` 150 s), ist ein Runtime-Fakt (21).

**Frühester Abholtag — TG UPS Effective Collection Date** (wirksam nach Merge): Das Versanddatum des Kunden ist der früheste gewünschte Abholtag. Die Service-Policy führt die Regel als kuratiertes Feld `collectionDateFallback: "next_business_day_mon_fri"` — heute genau an 22, 23 und 26 sowie seit dem DHL-Abschluss an 84, 85, 87 und 107; kein Eintrag erbt es, keine ServiceID-Weiche im Code. Der Angebotsmapper bewertet zuerst den Wunschtag unverändert. Sperrt ausschließlich die Abholtagsschranke (`collection_date_not_bookable`: Wochenende, heute ohne Same-Day-Fähigkeit; `same_day_collection_unavailable`: Abholschluss fehlt oder erreicht, Sicherheitsabstand, Gebühr, Preis oder ReadyFrom unbrauchbar) und liegt der Wunschtag heute oder später, bewertet er denselben Service aus DEMSELBEN Quote für `addBusinessDaysMonFri(Wunschtag, 1)` vollständig neu — Abholvertrag mit ReadyFrom 09:00, Same-Day-Befund (künftiger Tag: keiner), Preis ohne Gebühr, Buchbarkeit, Lieferprognose — und übernimmt den Tag nur, wenn das Angebot dort buchbar ist oder ausschließlich die Szenariowahl aussteht. Jede andere Sperre verschiebt nichts (Schalter, Routenbereich, Kontowährung, minimaler Quote, fehlende Freigabe, Vergangenheit); die Paketregeln greifen vorher (26: zwei Packstücke ja, drei nein). `shipment_offers.collection_date` trägt den wirksamen Tag; Optionen, Bindung, Neubepreisung, Revalidierung und `/book` lesen ausschließlich ihn, BookShipment sendet `Collection.CollectionDate` = Angebotstag, kein Clientwert wird gelesen. Der Wunschtag bleibt bis zur Buchung an der Entwurfszeile; der Abschluss (`completeBookedShipment`), die Rechnungsprüfung vor der Bestellung und der Klärungsweg setzen den Versand- und Leistungstag über denselben Leser der Angebotszeile (`storedOfferCollectionContract`) — Sendung, Auftragsbestätigung, Rechnung und Folgebelege tragen den gebuchten Tag; ohne gespeicherten Abholvertrag (Paketshopabgabe, Altangebot) bleibt es beim Sendungstag. Zur Buchungszeit wird nie erneut verschoben: ist der Angebotstag inzwischen heute oder vorbei, endet `/book` vor dem Anbieter. Je verschobenem Angebot eine Protokollzeile `[TG collection-date] service=… requested=… effective=… reason=…` (nur ServiceID, Kalendertage, Grundcode); die `[TG same-day]`-Zeilen bleiben. Requests unverändert: ein Full GetQuote je Vergleich, keine Tag-für-Tag-Quotes. Kein Schalter, keine ENV-, Schema-, Preis- oder Freigabeänderung; Schranke L, Same-Day-Zeitfenster und -Preis, TG29, DHL und JUMiNGO unverändert. (Nachtrag DHL-Abschluss 2026-09-19: 84, 85, 87 und 107 tragen dasselbe Feld — siehe nächster Absatz.)

**DHL-Abschluss TG84/TG85/TG87/TG107** (wirksam nach Merge): Die vier kuratierten DHL-Dienste sind öffentlich buchbar vorbereitet — 84 („Domestic Express"), 85 („Domestic Express 9:00") und 87 („Domestic Express 12:00") nur DE→DE mit höchstens zwei Packstücken, 107 („Economy Select") nur DE→EU mit genau einem Packstück. Die Freigabe ist je Eintrag der Wechsel `publicBookable: true` mit `publicBookableScopes` (`DE_DOMESTIC` bzw. `DE_EU`) und `collectionDateFallback: "next_business_day_mon_fri"`; bei der 107 zusätzlich `priceInputs { deliveryIsResidential: "declared_no_surcharge", collectionIsResidential: "fixed_false" }`. Kein neuer Code im Buchungsweg: Angebot, Optionen (zwei parallele Full Quotes geschäftlich/privat, centgenau gleich, sonst `409 OFFER_NOT_BOOKABLE` ohne Snapshot), Bindung (`scenario_difference_no_residential_surcharge`), Neubepreisung der Absicherung, Revalidierung (frischer Full Quote aus der gespeicherten Sendung — fehlt der Service im frischen Quote, etwa weil der Anbieter ihn für die Postleitzahl nicht mehr nennt, endet `/book` mit `409 OFFER_NOT_BOOKABLE`; ein Transportfehler mit `503 PRICE_UNCONFIRMED`; keine zusätzliche Verfügbarkeitsanfrage), BookShipment (`QuoteSelection` + `BookDetails { ServiceID, Collection { CollectionDate, ReadyFrom }, Insurance }` aus der gespeicherten Angebotszeile; kein Clientfeld überschreibt ServiceID, Anbieter, Preis, Abholtag oder Adressartvertrag), der dreiwertige Ausgang (unklar ⇒ `202 BOOKING_PENDING`, Klärungsfall, kein Retry), die Rechnungsprüfung gegen die erwartete Anbieterrechnung (Mehr- oder Minderbelastung als Befund, der Kundenpreis bleibt), der Druckvertrag (Bytes unverändert, Metadaten neutralisiert, keine `DownloadURL`, Hinweis bei mehrseitigen Belegen) und die Trackingprojektion sind die bestehenden generischen Verträge — die neuen Suiten beweisen die volle Kette je Dienst mit der echten Matrix. **Preis:** der Anbieterpreis des frischen Quotes ist die Quelle; ISC (84) bleibt ein gewöhnlicher Bestandteil, es gibt keine hartkodierte Gebühr, keinen DHL-Sonderaufschlag, keine erfundene Fernzonengebühr und keinen Puffer; der Kundenpreis entsteht über die zentrale Preisfunktion mit dem konfigurierten Steuersatz. **Abholtag:** heute ist für DHL nie buchbar (keine Same-Day-Fähigkeit) — heute, Samstag und Sonntag tragen den nächsten Versandtag, ein späterer Werktag bleibt, und derselbe Tag steht in Angebot, Optionen, Neubepreisung, Revalidierung, BookShipment, Rechnungsprüfung, Abschluss und Belegen; kein Tag-für-Tag-Quote, keine eigene Feiertagslogik. **Tracking:** die Codebedeutung ist carriergebunden (nur UPS gemessen) — DHL-Legs zeigen ihre Ereignisse, ihr Stand bleibt „unbekannt“ (siehe 1A). **Cross-Provider:** die kuratierten Paare 84/85/87 ↔ „EXPRESS DOMESTIC“ / „… 9:00“ / „… 12:00“ bleiben, die 107 bekommt kein Paar, die 86 bleibt ungepaart; keine Paarung über ähnliche Namen. **Service 86 bleibt vollständig gesperrt** (`product_identity_unverified`, `publicBookable: false`, keine 10:00→10:30-Deutung, keine Gleichsetzung). Offen und nicht im Code lösbar: „Ref No“ auf DHL-Belegen (EXTERNAL_WHITE_LABEL_DECISION_REQUIRED, 1A/5.12). Kein Schalter, keine ENV-, Schema-, Fristen- oder Preisfunktionsänderung; 22, 23, 26, 29, 86, 117/118 und JUMiNGO unverändert. Providerrequests in diesem Paket: **0**. (Nachtrag TG Staging Final Closure 2026-09-29: die 86 ist seit DE0052654 belegt, DE→DE freigegeben und gepaart; die Sperre `product_identity_unverified` bleibt als Mechanismus, trägt aber keinen Eintrag mehr.)

**Same-Day End-to-End — gebührenfrei durch alle Stufen, Datumsschranke für jede Abholung** (2026-09-25, wirksam nach Merge): Die zentrale Wahrheit bleibt `lib/providers/transglobal/sameDayCollection.js` — Vertragsart (`feeCharging`), Gebühr (`none` → 0) und Zeitfenster für beide Arten; es entsteht keine zweite Same-Day-Definition. Korrigiert sind die Aufrufer, die „Abholung heute möglich" mit „Gebühr > 0" gleichsetzten: (1) die Revalidierung (`lib/offers/transglobalRevalidation.js`, dieselbe Funktion für Optionen, Neubepreisung und `/book`) bildet die Szenariokette (Basis ohne Gebühr, Zuschlag als Differenz) nur noch bei einer Gebühr — dieselbe Regel wie der Angebotsmapper —, meldet das Zeitfenster aber für beide Arten (`sameDayCollection` mit `feeCents: 0`); (2) Szenariopaar und Einkaufsevidenz (`residentialPriceOptions.js`) prüfen die Abholung heute in beiden Szenarien gleich, bauen Snapshot und Evidenz der Version 2 aber nur mit Gebühr — gebührenfrei entsteht der gewöhnliche Snapshot, dessen Lebensdauer derselbe wirksame Abholschluss begrenzt (`transglobalPriceInputs.js`); (3) `/book` und Neubepreisung (`transglobalBookingEntry.js`) tragen vor dem Quote für einen gebührenfreien heutigen Abholtag den ausstehenden Befund — derselbe, den Optionen und Bindung seit jeher tragen —, und der frische Quote entscheidet ihn; (4) der Ablauf (`bookShipmentFlow.js`) friert Einkaufsevidenz der Version 2 nur mit Gebühr ein. Die Mitternachtsschranke: der Einstieg reicht den gespeicherten Abholvertrag für JEDE Abholung an den Ablauf (vorher nur mit kuratierter Abholung heute); die bestehende letzte Schranke unmittelbar vor dem mutierenden Aufruf verlangt ohne verfügbares Zeitfenster aus dem frischen Quote einen Abholtag nach heute (Europe/Berlin) — sonst `409 SAME_DAY_COLLECTION_UNAVAILABLE` (Art `expired`), der Versuch endet bewiesen „nicht gebucht", nichts wird verbraucht. Ohne kuratierte Fähigkeit bewertet die Revalidierung keine Abholung heute (`NOT_SAME_DAY`) — der Preis dieser Dienste ist unverändert. Keine ServiceID- oder Carrierweiche, kein Schalter, keine ENV-, Schema-, Policy-, Preisfunktions- oder Fristenänderung; Portalcode (47/110/124) und JUMiNGO unberührt — die Portalabholungen 47/110 durchlaufen lediglich dieselbe generische Datumsschranke vor ihrem Adapter. Belegt durch `tests/tg-fee-free-same-day-chain.test.js` (volle Kette an der echten Matrix für 84/85/87/48/49 vor und nach dem Abholschluss, 22/26 unverändert, 29/41/44/107 nie still heute, Mitternacht, Wochenende) — zehn ihrer Fälle scheitern am Stand davor. Providerrequests in diesem Paket: **0**.

**Portal-Core-Final — ein Portalkern für 47, 110 und 124** (2026-09-25, wirksam nach Merge): Es gibt genau EINEN Portalablauf (`lib/providers/transglobal/portal/portalBookingCore.js`); die drei Services liefern nur dünne Binder (Vorbedingungen, Rate aus der Buchen-Schaltfläche des eigenen Service und MasterServiceType, belegter Stapelbarkeitswert, belegter Packstückumfang — 47, 110 und 124 genau eines —, Adressschritt, Auswahl im Abhol-ViewModel des Portals: 47 der gebundene Tag und sein frühestes Fenster, 110 der gebundene Tag mit dem belegten Fenster 09–17, 124 genau der gebundene Paketshop). Die Reihenfolge ist die an der Oberfläche gemessene: Warenkorb lesen (muss leer sein) → Rates → Serviceauswahl → Adresse → Packliste → Übersicht → Warenprüfung/Abholung (hier entsteht der Warenkorbauftrag; danach muss der Warenkorb genau ihn enthalten) → Abhol- und kostenlose Absicherungsauswahl als zurückgesendetes ViewModel → Warenkorb- und Preisprüfung (`verifyPortalCartIsolation`, centgenau, ohne Toleranz) → Bedingungen bestätigen → Zahlung (erste Mutation) → Zahlungsseite muss genau einen Auftrag nennen → `CompleteOrder` genau einmal → Bestätigung über ihre Weiterleitungskette, deren Referenz der erfasste Auftrag sein muss. Eine PostgreSQL-Advisory-Sperre mit festem Schlüssel serialisiert alle Portalbuchungen des Portalkontos (eines je Umgebung, aus `TG_PORTAL_USER`); ohne Sperre wird nicht gebucht, und der Versuch wird unter der Sperre neu gelesen. Vor der Zahlung endet jeder Abbruch als NOT_BOOKED mit Entfernen ausschließlich des eigenen, eindeutig bestimmten Auftrags und dem Zustandsübergang `cart_built → init` (neu, nur für diesen bewiesen folgenlosen Abbruch); ab dem Absenden der Zahlung ist jeder unklare Ausgang AMBIGUOUS mit Klärung, nie ein Retry. Die Sitzung meldet sich genau einmal an und sendet nie einen Request erneut (die frühere Regel „Weiterleitung auf eine Login-Seite = neu anmelden und wiederholen" traf belegt einen normalen Assistentenschritt). Der Idempotenz-Claim der drei Portaltabellen scheiterte seit der Store-Fabrik (TG110) an JEDER echten Datenbank (Parameterversatz im `INSERT`) — jede Portalbuchung wäre vor dem ersten Providerkontakt als AMBIGUOUS `attempt_claim_failed` geendet; die Offline-Suiten liefen gegen einen Fake-Store und sahen es nicht. Behoben und je Tabelle gegen PostgreSQL belegt (`tests/portal-label-recovery-pg.test.js`, P14/P15). Die Sendungsnummer geht unabhängig vom Etikett in Sendung und Trackingreferenzen; der Etikett-Nachlauf folgt der belegten Profilweiterleitung und meldet eine nicht auf der ersten Listenseite stehende Referenz als eigenen Befund, nie als fremde Zeile. **Zahlschritt (PD-01) und Schranke B3d:** die `ResponseGuid` stammt aus der Antwort von `POST /Cart/ValidateCartOverview` (`isValid`/`responseGuid`, `lib/providers/transglobal/portal/paymentContract.js`; belegt mit dem erfassten Seitencontroller und echten Staging-Antworten); ohne ausdrückliches `isValid` oder ohne GUID-förmigen Wert endet der Versuch vor der Zahlung, der eigene Auftrag wird entfernt. B3d ist damit offen und sperrt nur noch, falls dieser Vertrag entfällt — die Buchbarkeit hängt weiter an `TG47_PORTAL_ADAPTER_ENABLED`, `TG110_PORTAL_ADAPTER_ENABLED`, `TG124_PORTAL_ADAPTER_ENABLED` und `TG_PORTAL_LABEL_RECOVERY_ENABLED`. **Adressschritt:** eine belegte Feldfolge für alle drei Services (124 zusätzlich der Paketshopblock); der versteckte Kopf wird wie vom Browser aus dem Adressformular gelesen; Portalprüfung der Abholung, dann der Zustellung (`ValidateQuoteAddressViewModel`), Absenden, Rücklesung (`GetSessionQuoteAddressesAndContactDetails`) mit Feldvergleich und `SendTrackingEmail: false`; genau eine bewusste Abweichung von der Oberfläche (keine Tracking-Mail des Anbieters an den Empfänger). Die Adressen kommen über `toTransglobalAddressInput` — dieselbe Zuordnung wie der V2-Weg; vorher blieben Straße und PLZ jeder echten Sendung leer. **110:** `constraints.maxPackages: 1` zentral in der Matrix (gleich der Bindergrenze), am Angebot als `tariffLimits`; die frueher erfasste Zwei-Paket-Annahme des Portals bleibt historische Protokollevidenz, ist aber seit der ausdruecklichen Ein-Paket-Produktgrenze vom 2026-09-30 kein Launch-Vertrag mehr; seit DE0052649 an `TG_PORTAL_LABEL_RECOVERY_ENABLED` gebunden wie 124 und 47. **Nachlauffenster des Portalwegs 120 Stunden** (`PORTAL_LABEL_RECOVERY_WINDOW_MINUTES`, `config/portalLabelRecovery.js`; die Zusatzmail einer Portalbuchung wartet genauso lange, jede andere 48 Stunden): der Anbieter erzeugt das Etikett einer Buchung außerhalb der Geschäftszeiten erst am nächsten Werktag. **Portal-Final-Closure (2026-09-25, wirksam nach Merge):** (1) **Schranke P** in `publicBookability.js` — für 124/110/47 rechnet sie beim Angebot, beim gespeicherten Angebot (Optionen, Bindung, Absicherung, `/book`) dieselbe Adressprüfung wie der Kern auf denselben gespeicherten Adressen (`portal/addressContract.js`, eine Fassung für Kern, Buchungseinstieg und Buchbarkeit); zu lang → `portal_address_too_long` → öffentlich `address_details_too_long`, unbrauchbar → `portal_address_unusable` → `quote_only`; sie steht wie N hinter allen strukturellen Schranken und vor J. (2) **Aufräumreserve** im Kern (`PORTAL_AUFRAEUM_RESERVE_MS` = 10 s, höchstens ein Drittel der Frist): vor der ersten Mutation endet der Aufbau vor der Reserve, der saubere Abbruch entfernt den eigenen Auftrag noch innerhalb der Frist; danach keine Reserve und nie ein Entfernen. (3) **Größenangabe** (`lib/booking/providerDocuments.js`): „A4" wird nur gespeichert, wenn jede PDF-Seite nachgemessen A4 ist (Toleranz 3 pt, hoch oder quer), sonst `null`; das Angebot der drei Portalservices trägt nur das Format (`withoutLabelSizes`). (4) **Login-Smoke** `scripts/portal-session-smoke-readonly.js` (nur Staging, nur lesend). Keine ENV, kein Schema, keine Preisfunktion geändert; JUMiNGO, V2-Buchungsweg, Same-Day und Effective Collection unberührt. Belegt durch `tests/portal-core-final.test.js`, `tests/tg-portal-address-contract.test.js` (Feldidentität gegen die drei echten UI-POSTs) und die auf dieselben echten Erfassungen umgestellten Portalsuiten (`tests/helpers/portalFlowScript.js`); Staging-Evidenz siehe 1A. Providerrequests: ausschließlich Staging (Portal und V2), Produktion **0**. (Nachtrag TG Staging Final Closure 2026-09-29: ein vierter Binder für die 137 — DPD Classic mit Fahrerabholung —, derselbe Kern, eigene Tabelle `tg137_booking_attempt`, Schranke B3e; siehe 1A.)

**Go-Live-Innenabschluss — Sendungsnummer und Etikett** (2026-09-26, wirksam nach Merge): (1) Trägt eine gebuchte Transglobal-Sendung keine Carrier-Sendungsnummer, hält der Transglobal-Trackingtakt sie aus derselben TrackOrder-Antwort fest — belegt: die `TrackingReference` der Primär-Leg ist zeichengleich die Buchungs- bzw. Portal-AWB, auch bei `Status: "ERROR"` vor dem ersten Scan. Gelesen wird nur aus SUCCESS/ERROR, nur exakt zur angefragten `OrderReference` und nur aus Primär-Legs (`carrierReferencesFromTrackOrder`, dieselbe Regel im Portal-Leser, dessen früherer Rohrückfall eine fremde AWB übernehmen konnte); geschrieben wird einmalig, nur an eine Sendung ohne jede Nummer, gebunden an Anbieter, Auftragsreferenz und gebuchten Zustand. (2) Ein bestätigter V2-Auftrag ohne nutzbares Versandetikett bleibt in der Buchungsklärung; einen lesenden Nachholweg gibt es nicht (V2 ohne Dokumentabruf, im Portal blieben solche Aufträge bei „wird generiert"). Der Befund steht am Versuch (`primary_label_usable`), „nicht gebucht" sperrt die harte Buchungsevidenz, „gebucht" verlangt die ausdrückliche Aussage `labelDelivered: true` (Etikett beim Anbieter beschafft und dem Kunden zugestellt). (3) Was CE über das Etikett weiß (2026-09-27): `label_missing` zählt „kein Versandlabel in CE“ — noch nicht abgerufen, beim Anbieter noch nicht bereit oder Abruf gescheitert; die Befunde vermerkt ausschließlich der eine Labelresolver aus echten Abrufen — und nie einen per Klärung außerhalb von CE zugestellten Fall (`delivered_outside_ce`). Die Labelaussage der Auftragsbestätigung ist nie stärker als der Beleg: „finden Sie in Ihrem Konto“ nur, wenn das Etikett in CE liegt (gespeicherte Bytes oder LABEL-Beleg); liegt es noch nicht dort, ist aber über das Konto abrufbar (Abruf auf Anforderung) oder vom Portal-Nachlauf erwartet: „Sobald Ihr Versandlabel verfügbar ist, können Sie es in Ihrem ConfidaraExpress-Konto abrufen.“; außerhalb von CE zugestellt: „Das Versandlabel wurde Ihnen gesondert bereitgestellt.“ (ohne Ort); sonst keine Labelaussage. Das Kundenkonto zeigt ein in CE nie entstehendes Etikett (V2 außerhalb zugestellt; JUMiNGO ohne Bestellnummer oder Referenz) als „Nicht im Kundenkonto verfügbar“ statt „Wird erstellt …“. (4) Kein Providercall kam hinzu.

**TG Staging Final Closure — 86, 137 und die kostenpflichtige Absicherung für 41/48/49** (2026-09-29, wirksam nach Merge): Geschlossen ist, was Staging belegen kann — jede Aufnahme stützt sich auf eine eigene, vorher registrierte und ausdrücklich freigegebene Staging-Aktion, keine auf eine Ableitung. (1) **86** (`config/transglobalServicePolicy.js`): „Domestic Express 10:30“, EXPRESS, Direktabholung, `publicBookableScopes: [DE_DOMESTIC]`, `maxPackages: 2`, Transportabsicherung, `deliveryIsResidential: declared_no_surcharge` / `collectionIsResidential: fixed_false`, `collectionDateFallback`, **kein** `sameDayCollection`; Produktpaar `dhl-domestic-express-1030` in `config/crossProviderEquivalence.js` (deny by default, belegt allein durch das Etikett DE0052654). (2) **137**: `fulfillmentMode: DIRECT_PICKUP`, `maxPackages: 1`, `publicBookableScopes: [DE_DOMESTIC]`, beide Adressarten `fixed_false`, `collectionDateFallback`, ohne Absicherung; Adapter `lib/providers/transglobal/portal/tg137BookingAdapter.js` (Abholslot nur aus genau einer MST-700-Gruppe mit Abholoption, Zeitoption, angebotenem Tag und Fenster „09-17“, nie aus einer Paketshopgruppe), Schalter `config/tg137PortalAdapter.js` (nur der exakte Wert „true“), additive Tabelle `tg137_booking_attempt` (`db/init.js`, idempotent), vierte Quelle der Portalklärung (`lib/booking/portalBookingAttempts.js`), Schranke B3e und `PORTAL_SERVICE_IDS` 124/110/47/137 (`lib/providers/transglobal/publicBookability.js`), genau ein 137-Zweig in `bookShipmentFlow.js` und die Slotpflicht im Buchungseinstieg (`409 COLLECTION_SLOT_REQUIRED`). (3) **41/48/49**: `capabilities.transportInsurance: true` — Karte, Optionen, Preis, Revalidierung, Buchung, Rechnung und Kundensicht laufen über die bestehende zentrale Absicherungslogik (Anbieterkosten centgenau, keine doppelte Absicherungsposition). Belegt durch `tests/tg137-dpd-classic-portal-booking.test.js` (jede Antwort des Offline-Laufs aus der Staging-Buchung S137B) und die auf den neuen Stand gebrachten Policy-/Buchbarkeits-/Absicherungssuiten; die Mechanismen, für die 86 und 137 bisher als Beispiel dienten (Produktsperre, fehlende Übergabeart, generische Adressartangabe), prüfen die Suiten an synthetischen Einträgen weiter. Staging-Evidenz siehe 1A; Staging-Kosten 148,65 € netto; Production **0**.

**Versandart** (Go-Live Block B, 2026-10-02, wirksam nach Merge): Jeder Matrixeintrag trägt seine Versandart ausdrücklich im Policyfeld `shippingMode` (`standard`/`express`/`economy`; jeder andere gesetzte Wert ist ein Ladefehler); der Versandartfilter liest nur dieses Feld, nie die Preisklasse oder den Namen. 107 und 41 sind `economy` bei unveränderter Preisklasse STANDARD; alle anderen Services behalten ihren bisherigen Modus. Die Transglobal-Anzeigenamen sind unverändert — die 22 heißt weiterhin „Standardversand“, ihr JUMiNGO-Pendant „STANDARD ®“ seit Block B „Standard“ (eine Angleichung wäre eine eigene Betreiberentscheidung).

Nicht daraus ableiten, dass Transglobal heute produktiv buchbar ist: alle Schalter sind im Repository aus, der Runtime-Zustand ist UNKNOWN_RUNTIME_STATE.

Unklare Transglobal-Ausgänge laufen durch dieselbe Buchungsklärung wie JUMiNGO (5.11); die bisherigen Transglobal-Adminpfade bleiben als Aliasse der providerneutralen Routen bestehen (Package C, wirksam nach Merge).

### 6.5 Cross-Provider Matching

**Status: ACTIVE_CURRENT**

Providerangebote können systemseitig auf Produktgleichheit geprüft und verglichen werden.

Die Angebotsschicht enthält Cross-Provider-Matching (Produktgleichheit). Seit der Betreiberentscheidung 2026-10-02 (wirksam nach Merge) bleiben beide Providerangebote kundensichtbar: ein Preisunterschied ist nie ein Grund, ein Angebot zu verbergen — keine Winner-Suppression, keine Providerpräferenz, keine automatische „beste Wahl“, keine neue Sortierung. Die Gleichheitsgruppen dienen der Diagnose (Vergleichsmodus); `lib/offers/crossProviderWinner.js` bleibt eine reine Analysefunktion ohne Aufrufer im Kundenpfad, und die Oberfläche blendet kein Angebot aus (die frühere Sonderregel UPS · Expressversand · `quote_only` ist entfernt). „Nicht buchbar“ bleibt eine Kennzeichnung, keine Ausblendung.

Diese Architektur ist beim Ausbau weiterer Provider zu respektieren.

Transglobal-Paare sind kuratiert und deny by default (`config/crossProviderEquivalence.js`): ein Paar entsteht nur aus einem Beleg, nie aus ähnlichen Namen. Seit der TG Staging Final Closure (2026-09-29, wirksam nach Merge) ist die 86 mit dem JUMiNGO-Tarif „EXPRESS DOMESTIC 10:30“ gepaart — belegt durch die Produktzeile des Carrieretiketts der Staging-Buchung DE0052654 („[O] EXPRESS 10:30 (33)“).

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

Economy ist eine Versandart, kein eigener Aufschlag (Betreiberentscheidung 2026-10-02, wirksam nach Merge): TG107, TG41 und JUMiNGO 3144 tragen den Standardaufschlag ihrer Preisklasse STANDARD.

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

**Wählbarkeit (Pre-Live Fix-Pack 2026-09-29, wirksam nach Merge):** Ein Konto mit `consolidated_7d` erhält bei der Buchung keine Einzelrechnung; fakturiert wird es ausschließlich im Sammelrechnungslauf, und der startet nur mit `CONSOLIDATED_INVOICING_ENABLED="true"`. Ein Wechsel NEU auf `consolidated_7d` ist deshalb nur möglich, wenn der Lauf eingeschaltet ist — im Kundenprofil (`PATCH /kunde/profil`) und in der Admin-Umstellung (`PUT /admin/users/:id/billing-mode`) sonst `409 BILLING_MODE_UNAVAILABLE` (neutraler Kundentext, nichts geschrieben, kein Erfolgs-Audit). Ein Konto, das den Modus bereits führt, bleibt lesbar und unverändert (keine stille Umschreibung); der Wechsel zurück auf `single` ist immer möglich und danach vorerst endgültig. `/kundenbereich` liefert die neutrale Fähigkeit `billingCapabilities.consolidated7dAvailable`; die Oberfläche bietet die Option nur bei exakt `true` an (fehlt das Feld: nicht verfügbar — sicher auch bei gemischter Deploymentreihenfolge). Die Regel steht an einer Stelle (`lib/billingMode.js`), an der auch der Start des Laufs in `server.js` hängt. Ob Production-Konten den Modus bereits führen, ist eine read-only Betreiberzählung.

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
- **CE-PG** — Gutschrift und Korrekturbeleg an Vertriebspartner (`CE-PG<JJ>-<laufend>`, eigener lückenloser Kreis, nie mit CE-RE oder Kundengutschriften gemischt; 12A, wirksam nach Merge)
- **CE-TEST-PG** — Pre-Live-Testgutschrift und Test-Korrekturbeleg (`CE-TEST-PG<JJ>-<laufend>`, eigener Zähler; verbraucht nie eine CE-PG-Nummer, Datenbank-CHECK: Testkennzeichen ⇔ Testnummer; 12A, wirksam nach Merge)

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

### 11.4 Vertriebspartnervereinbarung

**Status: IMPLEMENTED / KEINE FASSUNG VERÖFFENTLICHT** (2026-10-07, wirksam nach Merge)

- Eigener Registry-Typ `sales_partner_agreement` in derselben Legal-Registry (Datei im Git, SHA-256, `is_published`, eine Zeile je Typ und Version), Version `MAJOR.MINOR`.
- **Nie Teil eines Kunden-Legal-Sets** (Vollständigkeitsprüfung und Datenbank-CHECK schließen ihn aus); das Kunden-Pflichtset (11.1) bleibt unverändert.
- Neue Partner stimmen GENAU der über `SALES_PARTNER_AGREEMENT_VERSION` gewählten Fassung zu — wirksam nur, wenn sie veröffentlicht, heute gültig und hash-geprüft ist; sonst bleibt die Registrierung geschlossen (fail-closed). Das Profil referenziert die Registry-Zeile.
- Eine veröffentlichte Fassung wird nie ersetzt; eine neue Fassung ist eine neue Version mit neuer Datei. Kein Vertragstext im Frontend-Code — Quelle ist ausschließlich die registrierte PDF.

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

## 12A. Vertriebspartner-Programm

**Status: IMPLEMENTED_DISABLED** (2026-10-06, Vereinbarung/Abrechnungsdaten/Gutschrift und Pre-Live-Testmodus 2026-10-07, wirksam nach Merge; alle Schalter default aus — 13.4, 14, 21)

Produktregeln: 1A. Technische Details: Backend `docs/BACKEND_ARCHITECTURE.md` §16.

- **Kein Feature ist aktiv**, solange seine Schalter aus sind: ohne `SALES_PARTNER_REGISTRATION_ENABLED` keine öffentliche Partnerregistrierung (und auch mit ihm keine ohne veröffentlichte Vereinbarungsfassung, 11.4), ohne `SALES_PARTNER_REFERRALS_ENABLED` keine Kundenzuordnung über Links und keine Speicherung im Browser, ohne `SALES_PARTNER_COMMISSIONS_ENABLED` keine Bewertung und kein Ledgereintrag, ohne `DISPATCH_EVIDENCE_AUTO_ENABLED` kein automatischer Versandnachweis, ohne `SALES_PARTNER_CREDIT_NOTES_ENABLED` keine Gutschrift.
- **Versandnachweis ist ein eigener, versionierter Beleg** je Sendung. Kein Nachweis sind: Buchungsstatus, Labelstand, `tracking_status`, AWB-Anzahl, Transglobal-UPS 003 und 167. Automatisch nur aus belegten Transglobal-UPS-Ereignissen (160, 005, 021, 011; Produktionsgeltung offen), sonst Adminentscheidung (Versendet mit Datum, Nachweisart und Begründung / Nicht versendet / Ungeklärt). JUMiNGO und Transglobal ohne UPS: nur Adminentscheidung; Rohbeobachtungen des Trackings werden dedupliziert gespeichert.
- **Zeitmodell:** Zuordnung, Status, Sätze, Level, Plätze und Obergrenzen sind Historien mit Gültigkeitsbeginn und werden zum Versandtag ausgewertet; Gültigkeitsbeginne liegen nie in der Vergangenheit (einzige Ausnahme: Pre-Live-Testdaten bei aktivem Testmodus; globale Regeln und Obergrenzen nur, solange kein echter Partner existiert), ein Versandtag wird erst nach seinem Ablauf verarbeitet. Die Monatsbewertung wird eingefroren.
- **Startwerte** (1A) liefert der Server (`startDefaults`, `config/salesPartnerProgram.js`); die Freigabe belegt fehlende Sätze mit 10,00 / 5,00 / 2,50 vor, die Maske der globalen Level-Regel ohne bestehende Version mit den Startschwellen. Gespeichert wird nur, was der Admin bestätigt.
- **Fail-closed:** ungültige Paketanzahl wird nie als 1 geraten (ausgelassen, gezählt); ein ungültiger Partner-Override fällt nicht still auf die globale Regel zurück; ohne Bewertung entsteht keine Provision; eine unbrauchbare Obergrenze stellt zurück (`partner_cap_invalid` / `global_cap_invalid`); Basis ≤ 0 ergibt keine Provision.
- **Obergrenzen optional** (2026-10-07): keine Version = keine Grenze, normale Provision (vorher fail-closed `cap_missing` — entfallen). Individuelle Version je Partner (`sales_partner_cap_versions.partner_user_id`) vor der globalen; der Entscheidungs-Snapshot nennt Version und Bereich. Werte werden nicht erfunden; die Datenbank begrenzt sie auf 0–100. Die Kürzungsreihenfolge einer überschrittenen Gesamtobergrenze ist nicht entschieden — eine Überschreitung ergibt `cap_exceeded` ohne Gutschrift (Aktivierungsentscheidung, 21).
- **Ledger nur anhängend:** Gutschrift je Entscheidung und Ebene höchstens einmal, Rücknahme je Eintrag höchstens einmal, Korrekturen als eigene auditierte Einträge. „Auszahlbar“ folgt der bestehenden Forderungsregel (Einzel- oder Sammelrechnung bezahlt); es gibt keine Zahlungsfunktion.
- **Abrechnungsdaten:** 1:1 zum Partner, im Portal gepflegt (IBAN dort nur maskiert), jede Änderung braucht eine neue Adminbestätigung; Audit und Benachrichtigung nennen nur Feldnamen, nie Werte; nie in Teamsichten.
- **Gutschrift (Selbstabrechnung, Modell C):** eine Gutschrift für Monat M enthält alle noch nicht wirksam abgerechneten Ledger-Einträge, die zum Stichtag (00:00 Uhr Europe/Berlin am Ersten des Folgemonats) abrechnungsreif sind — vorher angelegt und Korrekturbuchung oder vor dem Stichtag bezahlte Kundenrechnung (Einzel- oder Sammelrechnung); spät bezahlte Positionen kommen in eine spätere Gutschrift. Saldo ≤ 0 → kein Beleg, Vortrag. Ablauf: Admin-Vorschau mit Fingerabdruck → Bestätigung je Partner → eine Transaktion (Abweichung 409); kein automatischer Lauf. Ein Ledger-Eintrag liegt höchstens auf einer wirksamen Gutschrift, je Partner und Monat höchstens eine wirksame Gutschrift (Datenbankindizes).
- **Steuer und Aussteller fail-closed:** nur freigegebene Steuerfälle („mit USt-Ausweis", „ohne USt-Ausweis/Sonderstatus"), Satz und Pflichthinweise ausschließlich aus eigener Konfiguration — **nie `VAT_RATE`**; Ausstellerdaten der UG mit eigenem Präfix, kein Rückgriff auf den Rechnungsaussteller. Fehlt etwas, wird nicht ausgestellt (Sperrgrund in der Vorschau).
- **Beleg:** Snapshots (Partner ohne Bankdaten, Aussteller, Steuer, Vertragsbezug) eingefroren; PDF einmal erzeugt, als Bytes mit SHA-256 gespeichert, bei jedem Abruf geprüft, nur authentifiziert (`no-store`), ohne Providerangaben. Korrektur: Betragsänderungen über das Ledger; Storno als eigener Korrekturbeleg (CE-PG) mit Bezug, Original-PDF unverändert, Positionen frei für eine Neuausstellung; kein doppelter Storno. „Ausgezahlt" ist nur ein Adminvermerk. E-Rechnung ist ein offenes Gate (21).
- **Mandantentrennung:** Partnerportal ohne ID im Pfad, jede Abfrage an das angemeldete Konto gebunden; Partner sehen keine Adressen, Rechnungen, Einkaufspreise, Providerdaten oder Kunden ihrer Teammitglieder. Gutschriftpositionen nennen seit der Betreiberentscheidung vom 2026-10-09 die neutrale Provisionsreferenz `VP-<Ledger-ID>` statt der Auftragsnummer, auch Teampositionen. Vor Backend #407 ausgestellte Gutschriften und ihre Stornos behalten ihre gespeicherte Referenz (1A, 20.7 R4).
- **Pre-Live-Testmodus** (2026-10-07, `SALES_PARTNER_PRELIVE_TEST_MODE`, opt-in, aus; unabhängig von allen produktiven Schaltern): Adminbereich „Pre-Live-Test" (Frontend `/admin/partners/prelive`, nur sichtbar bei `status.enabled`; nur Admin, serverseitig gesperrt — ohne Modus 404) für Testpartner (pending, ohne Vereinbarung, dann die echte Freigabe → einmaliger Passwortlink über den bestehenden Rücksetzmechanismus, keine Mail, kein Klartextpasswort → Anmeldung → Portal mit Testhinweis), Testkunden (Zuordnung über Testpartner oder adminintern über dessen Code), providerfreie Testsendungen, Testzahlung, Versandnachweis über die normale Adminentscheidung, Szenarien (Level, A → B → C, 10 + 10), manuellen Test-Provisionslauf (derselbe Takt, nur Testdaten), Mailvorschau und Bereinigung.
  - **Öffentliche Registrierung im Pre-Live-Modus** (primärer Ende-zu-Ende-Weg, `config registrationPath`): ist `SALES_PARTNER_REGISTRATION_ENABLED` aus und der Testmodus an, legt `POST /api/sales-partner/register` mit derselben Validierung und demselben Rate-Limit einen Pre-Live-Testpartner an (Rolle `sales_partner`, pending, `prelive_test` unveränderlich, KEINE Fassung, kein Dokumentbezug, kein Zustimmungszeitpunkt — eine mitgesendete Fassung oder ein Client-Feld wie `isTest` wird ignoriert). Der produktive Schalter hat IMMER Vorrang: ist er an, gilt nur der produktive Weg (ohne gültige Vereinbarung geschlossen, nie stattdessen ein Testantrag). `public-config` nennt den offenen Weg als `registrationMode` (`production` | `prelive_test` | `closed`; `registrationEnabled` bleibt der produktive Vertrag). Sponsorcode nur im selben Bereich (Partnerlink eines aktiven Testpartners → Testsponsor, Ebene 1; ein echter Code wird still übergangen). Freigabe, Anmeldung mit dem eigenen Passwort und Sperre ohne Testmodus wie bei jedem Testkonto; Eingangs- und Freigabemail hält der Versandschutz zurück.
  - **Kennzeichen:** `prelive_test` an Konto, Partnerprofil, Zuordnung und Sendung, `is_test` an der Gutschrift — unveränderlich (Trigger), Test ↔ Test über zusammengesetzte Fremdschlüssel erzwungen; `is_test_booking` bleibt der JUMiNGO-Sandbox vorbehalten.
  - **Testsendung:** Status und Provider `prelive_test` (kein bekannter Provider — jeder Providerpfad endet fail-closed), keine Referenz, kein Label, keine Trackingnummer, keine Abrechnungsart, keine CE-BS-Nummer (Datenbank-CHECKs); Zahlung als `prelive_test_paid_at` statt CE-RE-Rechnung. Status-gefilterte Pfade (Tracking, Labels, Reconciliation, Queues, Nachweis-Queue, Sammelrechnung) übergehen sie konstruktiv; Admin-Sendungs- und Kundenliste schließen Testdaten aus; Testkonten laufen nie durch die Kundenfreischaltung und erhalten keine Kundennummer.
  - **Anmeldung:** ein Testpartner nur bei aktivem Modus (Token mit signiertem Marker, ohne Modus abgewiesen), ein Testkunde nie; kein Reset-Link per Mail an Testkonten.
  - **Testgutschrift:** dieselbe Auswahl-, Summen-, Snapshot-, PDF- und Stornologik in einer Testhülle — nur Testpartner, nur mit Testmodus (nie über `SALES_PARTNER_CREDIT_NOTES_ENABLED`), Nummernkreis CE-TEST-PG, als Testdaten gekennzeichneter Aussteller (keine UG-Daten), Steuer nur zur Darstellung, Wasserzeichen „TESTDOKUMENT – NICHT STEUERLICH GÜLTIG" auf jeder Seite, keine Benachrichtigung, „ausgezahlt" nur als Testvermerk; Storno, Neuausstellung bleiben Testbelege. Ein echter Lauf sieht keine Testpartner und umgekehrt (409).
  - **Rückdatierung:** nur Testdaten bei aktivem Modus; Testledgerzeilen gelten am Folgetag ihres Versandtags als entstanden (wie im echten Takt), sonst wäre kein abgeschlossener Testmonat abrechenbar.
  - **Mails:** Versandschutz im emailService — an ein Testkonto nur über die exakte interne Ausnahmeliste `SALES_PARTNER_PRELIVE_TEST_MAIL_ALLOWLIST`, sonst kein Versand (keine Sammelumleitung); ohne Modus unverändert.
  - **Bereinigung:** Trockenlauf mit Zählungen; feste, fremdschlüsselgerechte Löschfolge nur kennzeichengebundener Zeilen; Blocker aus dem Datenbankkatalog, sobald eine echte Zeile auf Testdaten zeigt; Bestätigungstoken; eine Transaktion unter dem Provisions-Lock; Audit; kein allgemeines Wipe. Auditzeilen bleiben (Verweis gelöst).
- Mit dem Programm korrigiert: der Transglobal-Trackinglauf hat einen eigenen Advisory-Lock-Schlüssel (vorher geteilt mit dem Überfälligkeitslauf — einer übersprang still), das Trackingfenster richtet sich nach dem Buchungszeitpunkt, der JUMiNGO-Trackingschreibpfad ist an Provider und gebuchten Zustand gebunden.

Evidence anchor: `config/salesPartnerProgram.js`, `lib/salesPartner/*`, `lib/dispatchEvidence.js`, `services/salesPartnerCommissions.js`, `routes/salesPartner.js`, `routes/admin/salesPartners.js`, `tests/sales-partner-program-pg.test.js`; Vereinbarung/Abrechnungsdaten/Gutschrift: `lib/salesPartner/agreement.js`, `lib/salesPartner/billingDetails.js`, `lib/salesPartner/creditNotes.js`, `lib/salesPartner/creditNoteDocument.js`, `lib/salesPartnerCreditNotePdf.js`, `routes/admin/salesPartnerCreditNotes.js`, `tests/sales-partner-credit-notes.test.js`, `tests/sales-partner-credit-notes-pg.test.js`; Pre-Live-Testmodus: `lib/salesPartner/prelive.js`, `lib/salesPartner/approval.js`, `lib/mailGuard.js`, `routes/admin/salesPartnerPrelive.js`, `tests/sales-partner-prelive.test.js`, `tests/sales-partner-prelive-pg.test.js`.

---

## 13. Auth, Security und Tenant Boundaries

### 13.1 Auth

**Status: ACTIVE_CURRENT**

- JWT-basierte Authentifizierung
- Rolle und Benutzerstatus werden serverseitig gegen DB-Zustand geprüft
- Standardrolle Kunde; Adminfunktionen benötigen explizite Adminprüfung
- Rollen: `customer`, `admin`, `sales_partner` (Vertriebspartner, 12A, wirksam nach Merge) — jede Middleware mit fester Allowlist (5.9); ein Partnerkonto läuft nie durch die Kundenfreischaltung, steht nicht in der Kundenliste, erhält keine Kundennummer und wird über den Kundenpfad weder gelöscht noch anonymisiert (Konzept offen, 21)

Login (`POST /login`, seit Backend #406): zuerst das Passwort, dann der Kontostatus. Ohne gültiges Passwort antwortet der Server für jedes Konto wortgleich wie für eine unbekannte Adresse (401 `INVALID_CREDENTIALS`); ein fehlender oder unbrauchbarer Passwort-Hash gilt fail-closed als falsches Passwort, nie als 500. `ACCOUNT_BLOCKED`, `ACCOUNT_PENDING_APPROVAL` und `ACCOUNT_PRELIVE_TEST_INACTIVE` erhält nur, wer das Passwort kennt. Laufzeitunterschiede zu unbekannten Adressen sind bewusst unverändert (20.7 R2).

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

Produktfreigabe der Transglobal-Portfolioservices (2026-10-05): `TG86_PUBLIC_RELEASE_ENABLED` und `TG137_PUBLIC_RELEASE_ENABLED` — je opt-in, Default aus, nur exakt `"true"`, bei jedem Aufruf gelesen (`config/transglobalPublicRelease.js`); ohne sie weder Angebot noch Buchung des jeweiligen Service (6.4). Runtime-Status: `UNKNOWN_RUNTIME_STATE`.

Transglobal-Servicekatalog (2026-10-10, wirksam nach Merge): `TRANSGLOBAL_SERVICE_CATALOG` — kein Schalter, sondern Pflichtangabe der Umgebung: genau `staging` oder `live` (strikt, kein trim/case), bei jedem Aufruf gelesen (`config/transglobalServiceCatalog.js`). In Produktion (`NODE_ENV=production`, beide Coolify-Umgebungen) ohne Default: ohne Wert kein TG-Angebot und keine TG-Buchung (Startwarnung); ein unbekannter Wert ist überall fail closed (Startfehlermeldung, kein Startabbruch). Außerhalb der Produktion ohne Wert `staging`. Soll: Produktions-API `live`, Staging-Backend `staging`. Runtime-Status: `UNKNOWN_RUNTIME_STATE` (vor dem Merge in beiden Coolify-Umgebungen zu setzen, 21).

Vertriebspartner-Programm (2026-10-06/07, 12A): `SALES_PARTNER_REGISTRATION_ENABLED`, `SALES_PARTNER_REFERRALS_ENABLED`, `SALES_PARTNER_COMMISSIONS_ENABLED`, `DISPATCH_EVIDENCE_AUTO_ENABLED`, `SALES_PARTNER_CREDIT_NOTES_ENABLED` — je opt-in, Default aus, nur exakt `"true"`, bei jedem Aufruf gelesen (`config/salesPartnerProgram.js`). Werte: `SALES_PARTNER_AGREEMENT_VERSION` (bei aktiver Registrierung Pflicht und Format `MAJOR.MINOR`, sonst Startabbruch; wirksam nur mit veröffentlichter Registry-Fassung, 11.4), `SALES_PARTNER_DEFAULT_LEVEL1_RATE_PERCENT` / `…LEVEL2…` (Default 5.00 / 2.50), `SALES_PARTNER_ASSESSMENT_GRACE_DAYS` (Default 3, 0–15), `SALES_PARTNER_JOB_INTERVAL_MS` (Default 15 min); Gutschrift ohne Defaults: `SALES_PARTNER_TAX_STATUSES_ENABLED`, `SALES_PARTNER_TAX_WITH_VAT_RATE_PERCENT`, `SALES_PARTNER_TAX_WITH_VAT_NOTE`, `SALES_PARTNER_TAX_WITHOUT_VAT_NOTE`, `SALES_PARTNER_CREDIT_NOTE_TITLE`, `SALES_PARTNER_CREDIT_NOTE_CANCELLATION_TITLE`, `SALES_PARTNER_ISSUER_*` — ungültige Werte scheitern beim Start, fehlende sperren nur die Ausstellung. `SALES_PARTNER_AGREEMENT_URL` ist entfallen (2026-10-07). Pre-Live-Testmodus (2026-10-07): `SALES_PARTNER_PRELIVE_TEST_MODE` (opt-in, Default aus, nur exakt `"true"`, unabhängig von den übrigen Schaltern; öffnet die öffentliche Partnerregistrierung als Testweg, solange `SALES_PARTNER_REGISTRATION_ENABLED` aus ist) und optional `SALES_PARTNER_PRELIVE_TEST_MAIL_ALLOWLIST` (kommagetrennte exakte Adressen, keine Platzhalter; ungültig → Startabbruch). Runtime-Status aller: `UNKNOWN_RUNTIME_STATE`.

### 13.5 Multi-Provider-Debugmodus

**Status: SECURITY RULE** (Final Bookability Closure, wirksam nach Merge)

`MULTI_PROVIDER_DEBUG_MODE` legt Einkaufsdaten offen und wirkt deshalb nur für ein angemeldetes Konto mit der Rolle `admin` (aus `req.user`, nie aus einem Requestfeld) und nie bei `NODE_ENV=production`; ist er dort gesetzt, warnt der Serverstart. Evidence anchor: `config/multiProviderDebug.js`.

---

## 14. Relevante Feature-/Worker-States

| System | Technischer Status | Default / Hinweis |
| --- | --- | --- |
| JUMiNGO Quote/Buchung | ACTIVE_CURRENT | produktiver Buchungspfad |
| Transglobal Quote | ACTIVE_CURRENT / UNKNOWN_RUNTIME_STATE | benötigt Runtime-Konfiguration |
| Transglobal Booking | IMPLEMENTED_CONDITIONALLY | default aus; öffentlich buchbar vorbereitet nur Service 22, Service 23 (TG23 — seit 2026-09-23 (#374) aus dem Kundenangebot zurückgezogen: `offerEnabled: false`, kein Angebot) und Service 26 (TG26, Staging-Smoke bestanden, höchstens zwei Packstücke, ohne Abholung am selben Tag, wirksam nach Merge), DE→DE hinter Produktschalter, Buchungsschalter und Kontowährung; Art der Lieferadresse nach der Angebotsauswahl (TG22 Residential, wirksam nach Merge); Abholung am selben Tag bis zum wirksamen Abholschluss (TG22 Same-Day, wirksam nach Merge); Produktprofil und 70-kg-Grenze je Packstück (TG22 Package A, wirksam nach Merge); voraussichtliche Lieferung als CE-Prognose aus Abholtag und Laufzeit (TG22 Package B, wirksam nach Merge); UPS Express (29) DE→DE öffentlich buchbar vorbereitet (2026-09-23, fünf eigene Stagingbuchungen; die Rechnungsposition „Collection" 2,00 € netto je Sendung als kuratierter Providerkostenvertrag im Einkauf; OHNE Abholung am selben Tag, wirksam nach Merge); TNT Express 9:00 (47) DE→DE über den Portalpfad vorbereitet (2026-09-23; V2-Buchung vom Carrier abgelehnt, Portalbuchung DE0052643 zum centgleichen Preis; zwei Schalter TG47_PORTAL_ADAPTER_ENABLED und TG_PORTAL_LABEL_RECOVERY_ENABLED, beide default aus; ohne Abholung am selben Tag, ohne kostenpflichtige Zusatzabsicherung, wirksam nach Merge); TNT 41/44 (DE→EU, je ein Packstück) und 48/49 (DE→DE, die 48 höchstens zwei Packstücke) öffentlich buchbar vorbereitet (2026-09-22, Staging-Buchungen DE0052630/31/32/34 mit Delta 0; nur an einen Geschäftsempfänger mit Firmenname, sonst `business_recipient_required`; Zusatzabsicherung zunächst nur für die 44); Transportabsicherung nur für kuratierte Services (Stand TG Staging Final Closure 2026-09-29: 22, 23, 26, 29, 41, 44, 48, 49, 84, 85, 86, 87, 107 — nicht die Portaltarife 47, 110, 124, 137); Bestandsdiagnose je Quote (UPS-Vervollständigung, wirksam nach Merge); DHL Domestic Express (84) vollständig kuratiert (Staging-Buchungssmoke 1275/DE0052580 bestanden); Art der Lieferadresse ohne Zuschlag als generischer Modus (DHL Foundation); DHL-Zeitvarianten 85 und 87 vollständig kuratiert (Staging-Buchungssmokes 1282/DE0052583 und 1276/DE0052581 bestanden), 86 bis zur TG Staging Final Closure gesperrt ohne Angebot (`product_identity_unverified`, DHL Zeitfamilie); DHL Economy Select (107) vollständig kuratiert, **erster EU-Block mit eigener Buchungsevidenz** (1277/DE0052582), höchstens ein Packstück (TG107); Transglobal-Fristen nach gemessenen Antwortzeiten (Vergleich und Vorbestellung 55 s, Bestellung 90 s, TrackOrder 50 s konfigurierbar), Laufzeitzeile je Anbieteraufruf, faire Auswahl im Trackingtakt (UPS-Abschluss, wirksam nach Merge); Versanddatum als frühester Abholtag — 22/23/26 verschieben einen allein am Abholtag gesperrten Wunschtag auf den nächsten Versandtag, Angebot, Buchung und Belege tragen denselben Tag (TG UPS Effective Collection Date, wirksam nach Merge); **DHL-Abschluss (wirksam nach Merge): 84, 85 und 87 DE→DE (höchstens zwei Packstücke) und 107 DE→EU (genau ein Packstück) öffentlich buchbar vorbereitet** — hinter denselben Schaltern und derselben Kontowährung, Adressart ohne Zuschlag (bei der 107 bei jeder Buchung in beiden Szenarien gemessen), frühester Abholtag, carriergebundene Trackingbedeutung (DHL-Stand „unbekannt“ bis zu echter Ereignisevidenz); die 86 blieb gesperrt; „Ref No“ auf DHL-Belegen offen als EXTERNAL_WHITE_LABEL_DECISION_REQUIRED; **Same-Day End-to-End (2026-09-25, wirksam nach Merge):** die gebührenfreie Abholung am selben Tag (84, 85, 87, 48, 49) ist durch Optionen, Bindung, Neubepreisung und `/book` buchbar (Nullunterschied kein Fehler, kein Zuschlag, derselbe Preis), und die letzte Datumsschranke vor der Bestellung gilt für jede Abholung (Mitternacht); **Portal-Tarife (2026-09-25, wirksam nach Merge):** ein Portalkern für 47/110/124 nach der belegten Portalreihenfolge (leerer Warenkorb vorher, genau der eigene Auftrag vor der Zahlung, Kontosperre, kein zweites Absenden), Zahl- und Adressschritt belegt, je eine Staging-Buchung centgenau (DE0052648/DE0052649/DE0052650); **47, 110 (höchstens zwei Packstücke) und 124 DE→DE öffentlich buchbar vorbereitet** hinter ihren Portalschaltern und dem Nachlaufschalter (alle default aus); **TG Staging Final Closure (2026-09-29, wirksam nach Merge):** 86 („Domestic Express 10:30“, DE→DE, höchstens zwei Packstücke, Staging-Buchung DE0052654) und 137 (DPD Classic, Fahrerabholung, DE→DE, ein Packstück, Portalpfad hinter `TG137_PORTAL_ADAPTER_ENABLED` und dem Nachlaufschalter, Staging-Buchung DE0052658) öffentlich buchbar vorbereitet — **seit 2026-10-05 Portfolio, nicht erste Live-Welle: ohne `TG86_PUBLIC_RELEASE_ENABLED` bzw. `TG137_PUBLIC_RELEASE_ENABLED` (default aus) weder Angebot noch Buchung** (1A, 6.4); kostenpflichtige Absicherung für 41/48/49 (DE0052655/56/57); **TG110 Final Closure (2026-10-01, wirksam nach Merge):** 110 genau ein Packstück mit dem Labelvertrag `carrier_at_pickup` (der Carrier bringt das Label bei der Abholung an — kein Kundenlabel, kein Drucker), öffentlich buchbar vorbereitet hinter `TG110_PORTAL_ADAPTER_ENABLED` ohne den Nachlaufschalter (Staging-Buchung DE0052660) |
| Customs | IMPLEMENTED_DISABLED | opt-in aus + Launch-Scope blockiert Drittländer |
| Legal Booking Gate | IMPLEMENTED_CONDITIONALLY | default aus |
| Consolidated Invoicing | IMPLEMENTED_CONDITIONALLY | default aus |
| Tracking Sync Worker | IMPLEMENTED_CONDITIONALLY | default aus; JUMiNGO: Rückstellung nach Fehlschlag (`TRACKING_SYNC_FAILURE_BACKOFF_MS`, Default 2 h), gesunde Sendungen zuerst (Final Bookability Closure) |
| Overdue Notification Worker | ACTIVE_CURRENT | default an / opt-out |
| Shipment Email Worker | ACTIVE_CURRENT | default an / opt-out |
| Buchungsklärung (Package C) | IMPLEMENTED, wirksam nach Merge | kein Schalter; Adminaktion mit Bestätigung, ruft keinen Anbieter |
| Betriebs-Queues (Package C) | IMPLEMENTED, wirksam nach Merge | kein Schalter; reiner Datenbankread |
| JUMiNGO Sandbox/Testmechanismus | IMPLEMENTED_CONDITIONALLY | bewusst gated |
| Multi-Provider Debug | IMPLEMENTED_CONDITIONALLY | Diagnosefunktion; nur Admin, nie in Produktion (13.5) |
| Transglobal-Aufwärmen (Kaltstart) | ACTIVE_CURRENT (wirksam nach Merge) | kein Schalter. Gemessen: TG-Server nach ~34–35 min Ruhe kalt (~34 s erster Request), warm ~4,5 s, Verbindungsaufbau ~0,1–0,2 s. Start-Aufwärmruf + bedarfsgesteuert: angemeldete Versandseiten melden `POST /api/offers/prepare`; der Server startet höchstens EIN `GetCountries` je Ruhephase (≥ 10 min ohne belegten Quote-Kontakt, `inFlight`, Fehler-Cooldown 2–10 min), nie einen Quote; der Vergleich wartet höchstens 20 s auf einen laufenden Aufwärmruf (Abzug von der Quotefrist), JUMiNGO startet sofort. Ohne Kunden keine Requests |
| Vertriebspartner-Registrierung und -Portal | IMPLEMENTED_DISABLED (wirksam nach Merge) | `SALES_PARTNER_REGISTRATION_ENABLED` default aus; Portal nur für freigegebene Partner (12A) |
| Referral-Zuordnung (Kundenlink, Browser-Vormerkung) | IMPLEMENTED_DISABLED (wirksam nach Merge) | `SALES_PARTNER_REFERRALS_ENABLED` default aus — Datenschutzgate bis zur Freigabe der Rechtstexte |
| Vertriebspartner-Provisionsjob (Monatsbewertung, Ledger) | IMPLEMENTED_DISABLED (wirksam nach Merge) | `SALES_PARTNER_COMMISSIONS_ENABLED` default aus; ohne globale Level-Regel entsteht auch eingeschaltet nichts; eine Obergrenze ist optional (seit 2026-10-07) |
| Automatischer Versandnachweis (Transglobal-UPS) | IMPLEMENTED_DISABLED (wirksam nach Merge) | `DISPATCH_EVIDENCE_AUTO_ENABLED` default aus; Rohbeobachtungen des Trackings entstehen unabhängig davon, soweit der Trackingjob läuft |
| Partnergutschriften (Admin-Abrechnungslauf) | IMPLEMENTED_DISABLED (wirksam nach Merge) | `SALES_PARTNER_CREDIT_NOTES_ENABLED` default aus; kein automatischer Lauf; auch eingeschaltet ohne UG-Ausstellerdaten, Titel, freigegebene Steuerfälle und bestätigte Abrechnungsdaten keine Ausstellung |
| Vertriebspartnervereinbarung (Registry) | IMPLEMENTED, keine Fassung veröffentlicht (wirksam nach Merge) | ohne veröffentlichte, gültige Fassung bleibt die Registrierung auch mit Schalter geschlossen |
| Pre-Live-Testmodus Vertriebspartner (öffentliche Testregistrierung, Testkonten, Testsendungen, Test-Provisionslauf, Testgutschriften CE-TEST-PG, Bereinigung) | IMPLEMENTED_DISABLED (wirksam nach Merge) | `SALES_PARTNER_PRELIVE_TEST_MODE` default aus; ohne ihn keine Testwerkzeuge, keine Testregistrierung und keine Anmeldung von Testkonten; mit ihm öffnet `/partner-registrieren` nur, solange die produktive Registrierung aus ist; Mails an Testkonten nur über `SALES_PARTNER_PRELIVE_TEST_MAIL_ALLOWLIST` |

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

DHL-Abschluss TG84/TG85/TG87/TG107 (wirksam nach Merge): **keine Frontendänderung.** Die vier DHL-Dienste laufen durch die bestehenden generischen Flächen, gesteuert allein von den Serverfeldern: das Angebot ist auswählbar („Vorläufiger Preis“), trägt `surchargeFreePriceInputs` und zeigt deshalb „Die Art der Lieferadresse wird vor der Buchung abgefragt.“, die Auswahl „Geschäftsadresse + 0,00 €“ / „Privatadresse + 0,00 €“ (die 107 jetzt ebenso), danach Absicherung und Buchung wie bei 22/23/26. Der Abholtag ist der Serverwert aus `collectionDate` (heute, Samstag und Sonntag bereits serverseitig auf den nächsten Versandtag verschoben). Mehrseitige Belege tragen den bestehenden Druckhinweis. Ein DHL-Trackingstand „unbekannt“ wird wie bisher nicht benannt — die Ereignisse und der Carrierlink bleiben sichtbar. Keine ServiceID-Prüfung, keine Produktnamen, kein Anbietername im Frontendcode; die 86 erschien bis zur TG Staging Final Closure nicht.

Produktfreigabe 86/137 (2026-10-05): **keine Frontendänderung** — ohne Freigabe liefert der Server für 86/137 schlicht kein Angebot; die Oberfläche kennt keine ServiceID-Weiche. TG Staging Final Closure (2026-09-29, wirksam nach Merge): **keine Frontendänderung.** 86 und 137 und die Absicherung für 41/48/49 laufen durch dieselben generischen Flächen, gesteuert allein von den Serverfeldern (`requiredPriceInputs`/`surchargeFreePriceInputs`, `insuranceAvailable`/`insuranceDetails`, `collectionDateAdjusted`, Belegtitel aus der Labelwahrheit — das A6-Etikett der 137 heißt neutral „Versandlabel“). Keine ServiceID-Prüfung, keine Produktnamen, kein Anbietername im Frontendcode.

UPS-Abschluss TG22/TG23/TG26 (wirksam nach Merge): Die Browserfristen liegen über den Serverfristen ihres Aufrufs — Vergleich in „Neue Sendung" und im Preisrechner 75 s, Adressart-Optionen 75 s, Neubepreisung der Absicherung 75 s, Kunden- und Admin-Tracking 65 s, `/book` unverändert 150 s. Ein langsamer Anbieter endet damit als Serverantwort mit dem bestehenden Fehlertext statt als vorzeitiger Browserabbruch. Ladezustände, Texte und Design sind unverändert; es entsteht keine Preis- oder Buchungsautorität im Frontend, keine ServiceID-Prüfung und kein Anbietername.

TG UPS Effective Collection Date (wirksam nach Merge): **keine Frontendänderung.** Die Karte zeigt den Abholtag des Angebots aus `collectionDate` — nach einem serverseitigen Abholtag-Rückfall den wirksamen Tag mit „bereit ab 09:00 Uhr"; das Angebot ist wie jeder spätere Abholtag auswählbar (`price_inputs_required`), und ausgewähltes Angebot und Live-Leiste zeigen denselben Tag (`pickupSummaryOf`). Kein Hinweistext, kein Datumsvergleich im Client und keine Uhr — dieselbe Darstellung wie ein JUMiNGO-Tarif, dessen Abholtag der Anbieter nennt. Das Versanddatumsfeld bleibt der Wunschtag des Kunden. Die Sätze einer gesperrten Abholung heute bleiben für Angebote ohne Rückfall und für die 409-Antworten der Buchungswege.

Same-Day End-to-End (2026-09-25, wirksam nach Merge): **keine Frontendänderung.** Die gebührenfreie Abholung heute läuft über die bestehenden Serverfelder: die Karte trägt `pickupToday: true` ohne Zuschlagsfelder (keine Zuschlagszeile), Options- und Bindungsantwort tragen für sie **keinen** `sameDayCollection`-Block — ein solcher Block trägt immer einen Zuschlag > 0 und wird ohne ihn verworfen —, beide Optionen zeigen „+ 0,00 €", die Bindung nur den Versand, und der Buchungserfolg nennt die tatsächlich gesendete Abholung aus `booking.sameDayCollection`. Die Schleife „Angebote neu berechnen" → dieselbe Karte entfällt, weil der Server die heutige Karte jetzt bindet und bucht; nach dem Abholschluss liefert die Neuberechnung den nächsten Versandtag („Frühester Abholtag"). Paritätsbeleg mit den echten Serverantworten: `src/utils/feeFreeSameDayParity.test.mjs`.

Druckvertrag mehrseitiger Providerbelege (wirksam nach Merge): Enthält ein Versandbeleg mehr als eine Seite, erscheint **ein** Satz — wörtlich vom Server, an drei Stellen aus derselben Quelle: auf dem Buchungserfolg über den Downloadknöpfen, im Dokument-Drawer bei den Versandbelegen und in der Label-Mail angehängt an den bestehenden Formathinweis. Er lautet: „Dieses Dokument umfasst mehrere Seiten. Bitte folgen Sie den Hinweisen, die der Carrier auf den einzelnen Seiten abdruckt: Nicht jede Seite gehört auf ein Paket — manche Carrier legen ein Begleitdokument bei, das dem Fahrer bei der Abholung auszuhändigen ist.“ Er nennt **keine Seitennummer** (die Seitenzahl ist dynamisch), keinen Carrier, keinen Anbieter und keine ServiceID, und er behauptet nie, alle Seiten gehörten aufs Paket. Das Frontend formuliert ihn nicht und entscheidet nicht, wann er gilt — es zeigt, was der Server schickt; ein fehlender oder leerer Wert ergibt keine Zeile. **Die Belegnamen bleiben unverändert** („Versandlabel“, „Abholetikett“), ebenso Download- und Mailanhang-Dateinamen: eine Umbenennung in „Versandunterlagen“ wäre für die DHL-Familie treffender, für UPS und JUMiNGO aber falsch — deren Belege sind reine Etiketten —, und derselbe Name speist Anzeige, Downloadnamen und Mailanhang.

ConfidaraExpress als App (PWA Core, wirksam nach Merge und Frontend-Deployment): Einen eigenen Installationszugang zeigt CE erst nach dem Login — die Karte „ConfidaraExpress als App" in den Kontoeinstellungen (rechte Spalte direkt nach „Sicherheit", bestehendes Kartenmaterial, CE-Signet) und einen dezenten Utility-Eintrag vor „Abmelden" in Sidebar bzw. Drawer, der nur mit echtem Installationsweg erscheint und nach der ersten Benutzung auf dem Gerät verschwindet. Chromium: „App installieren" öffnet den Installationsdialog des Browsers ausschließlich auf Klick (`beforeinstallprompt` wird beim Start zurückgehalten); iPhone/iPad und Safari am Mac: „Anleitung anzeigen" — kein nachgebauter Dialog; ohne Installationsweg ein ruhiger Satz ohne Knopf; als App geöffnet ein Status. Nie neben dem Benutzerchip, nie in der Topbar, kein automatischer Dialog, keine „Download"-Begriffe. Dass ein Browser selbst eine Installation anbietet, kann CE nicht verhindern und behauptet es nicht. Offline zeigt die Shell einen ruhigen Hinweis (`navigator.onLine` nur als Hinweis, nie als Sperre); ein offline nicht ladbarer Codeabschnitt heißt „Keine Internetverbindung", nicht „neuere Version". Geschützte Adressen führen nach dem Login dorthin zurück — ausschließlich über die Allowlist `utils/loginReturnTarget.mjs` (kein Open Redirect, `/booking` bewusst ausgenommen).

Final Bookability Closure (wirksam nach Merge): ein Code „nichts beauftragt“ ist nie ein offener Ausgang — `BOOKING_FAILED`, `PROVIDER_UNAVAILABLE`, `SHIPMENT_PROVIDER_UNSUPPORTED`, `VOUCHER_NOT_APPLICABLE`, `COLLECTION_DATE_CHANGED` (und die früheren `CHECKOUT_CHECK_FAILED`/`CHECKOUT_NOT_READY`) ersetzen den Bestellknopf durch „Angebote neu berechnen“, auch bei einem 5xx; `CUSTOMS_BOOKING_UNAVAILABLE` und `CUSTOMS_NOT_READY_AFTER_INVOICE_UPLOAD` zeigen einen Hinweis „später erneut“ bei stehendem Knopf; nie „wird geprüft“ oder „Zu meinen Sendungen“ (`utils/bookingErrors.mjs`). `BOOKING_FAILED` heißt „Buchung nicht durchgeführt — Es wurde nichts beauftragt und nichts berechnet.“; `COLLECTION_DATE_CHANGED` „Der früheste Abholtag hat sich geändert auf <Wochentag, TT.MM.JJJJ>. Bitte Angebot neu berechnen.“ Der Erfolgsbildschirm liest `labelStatus` der Buchungsantwort: „Label herunterladen“ nur bei `available`; `pending` → „Ihr Versandlabel wird erstellt. Sobald es verfügbar ist, können Sie es in Ihrem ConfidaraExpress-Konto abrufen.“ (mit `labelRetrievable` zusätzlich zweitrangig „Versandlabel jetzt abrufen“), `separate` → „Das Versandlabel wurde Ihnen gesondert bereitgestellt.“, sonst ein neutraler Verweis; fehlt das Feld (älterer Server), bleibt der bisherige Knopf. Im Dokument-Drawer ist `ready` „liegt in CE“; ein noch nicht abgelegtes, beim Anbieter abrufbares Label steht als „Wird erstellt …“ bzw. „Derzeit nicht verfügbar“ mit der Aktion „Abrufen“ (`retrievePath`), nie als „Herunterladen“. Der Paketshop-Finder erscheint auf einer auswählbaren Abgabe mit kontrolliertem Carrier-Suchcode (`offerSupportsAccessPointSearch`: Übergabeart + `accessPoint.provider` bzw. `publicCarrierId` → ups/dpd/dhlexpress/gls); die zusätzliche Bedingung „nur mit Serverfähigkeit“ der Final Bookability Closure ist seit 2026-10-01 entfernt (wirksam nach Merge), denn `accessPoint.available` trägt nur der belegte UPS-Access-Point-Tarif — Transglobal-Abgaben tragen weiter `parcelShopSearch: "server"`. Vier neue Sperrgründe: „Nur für Geschäftsabsender verfügbar.“, „Nur mit Angabe des Inhalts buchbar.“ (je mit Handlungshinweis), „Für diese Maße nicht bestätigt.“, „Gebietszuschlag nicht bestätigt.“. Der Lieferhinweis lautet „… Wochenenden und bundesweite Feiertage sind nicht mitgezählt. Regionale oder ausländische Feiertage können die Zustellung verschieben.“

Paketshop-Finder-Karte (Go-Live-Abschluss 2026-09-29, beobachtet am ausgelieferten Bündel): ohne eigenen Stil (`VITE_MAP_STYLE_URL`, `src/config/map.js`) lädt der Browser des Kunden Kacheln von `tile.openstreetmap.org` — ein Datenfluss (IP-Adresse, Kartenausschnitt) an die OpenStreetMap Foundation, den die Rechtstexte nicht nennen (21).

Go-Live Block B (2026-10-02, wirksam nach Merge): **Späteste Lieferzeit** — bewertet wird ausschließlich die Anbieterzusage (`deliveryDateMax`/`deliveryDate`, `deliveryTimeUntil`); nachweislich zu späte Angebote fallen wie bisher heraus. Ein Angebot ohne sicher vergleichbare Anbieterzusage — kein Anbieterdatum (etwa jedes Transglobal-Angebot) oder am Stichtag keine Uhrzeit bei gesetzter Uhrzeit — bleibt sichtbar und trägt den neutralen Hinweis „Zustelltermin nicht bewertbar“; ohne Filter nie. Kein Termin wird geschätzt, keine Uhrzeit aus einem Tarifnamen gelesen, keine CE-Prognose wird zur Anbieterzusage (`utils/offersFilterView.mjs`, `deliveryDeadlineAssessment`; die Tarife selbst bleiben unverändert). **Samstagszustellung** steht als Detailzeile „Samstagszustellung: Ja“ unter „Hauptmerkmale“ nur bei `deliveryOnSaturday === true`; auf der Kartenfläche trägt der kuratierte Tarifname die Unterscheidung. Den Kartennamen liefert der Server; die Oberfläche fällt nur ohne ihn auf den Versandartnamen zurück.

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

PWA (wirksam nach Frontend-Deployment): `nginx.conf` liefert `/sw.js`, `/manifest.webmanifest` (Typ `application/manifest+json` ausdrücklich — nginx kennt die Endung nicht) und `/offline.html` mit `no-cache`, die App-Icons `/app-icon-*` eine Stunde; jede dieser Locations wiederholt den vollständigen Sicherheitsheaderblock. `/sw.js` nie ersatzlos entfernen (ein 404 lässt den alten Service Worker aktiv) — im Notfall eine Fassung ausliefern, die sich per `self.registration.unregister()` selbst abmeldet.

Betreibergates vor der öffentlichen Bewerbung der App: `preisrechner.confidaraexpress.de` liefert dieselbe Anwendung aus, steht aber nicht in der CORS-Liste der API — auf `https://confidaraexpress.de` umleiten oder als eigenständigen Einstieg entfernen. Zusätzlich reale Geräteprüfungen (iPhone, Android Chrome, Windows Edge oder Chrome) einschließlich Rechnungs- und Labeldownload, Labeldruck bzw. Weitergabe.

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

### 17.4 Bekannte sporadische Tests

**Status: ACTIVE_CURRENT** (Stand 2026-10-09, nach der Umsetzung von R1 und R7; Belege im Bericht `docs/ux-gesamt-qa-2026-10-08.md`, R1, R7 und Nachtrag)

Derzeit ist kein sporadischer Test mit offener Ursache bekannt. Beide unten genannten Ursachen sind behoben (20.7); die Einträge bleiben als Einordnungshilfe stehen.

- Backend `tests/book-outcome-safety-pg.test.js` Fall (N): kein Testproblem, sondern ein Reihenfolgefehler im Buchungscode (20.6, R1) — behoben mit Backend #405; die Reihenfolge prüfen seither deterministische Fälle in derselben Datei.
- Frontend `tests/e2e/insuranceDraftReset.test.mjs` Fall (1) und `tests/e2e/multiProviderDebugMode.test.mjs` Fall 5: Die Prüfung fällt in ein kurzes Zeitfenster, bevor Sperre bzw. Darstellung nachziehen; kein Produktfehler nachgewiesen (20.6, R7) — beide Ursachen behoben mit Frontend #481 (Buchungssperre im Render der Auswahl; Test wartet auf den fertig dargestellten Zustand).
- Regel: Scheitert genau eine dieser Prüfungen, wird sie mit dem dokumentierten Befund eingeordnet und gesondert berichtet. Der Test bleibt unverändert aktiv; ein grüner Wiederholungslauf gilt nie als Behebung.

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

### 20.6 Offene Go-Live-Risiken (Gesamt-QA der UX-Pakete 1–6, 2026-10-09)

Ergebnis der Gesamt-QA gegen Frontend `c1bc6f9` und Backend `99f8a20` — lokal und isoliert, kein Produktivsystem. Bericht: `docs/ux-gesamt-qa-2026-10-08.md` in beiden Repositories. Die UX-Pakete haben keinen dieser Punkte verursacht oder behoben; grüne UX-CI ist kein Nachweis einer Behebung. Keiner ist ein automatischer Umsetzungsauftrag.

> Historischer Stand der Gesamt-QA (2026-10-09, vor der Umsetzung) — die Einträge unten sind bewusst unverändert. Den aktuellen Umsetzungsstand führt 20.7.

- **R1 — Risiko A, Buchungssicherheit bei fehlgeschlagener Datenbankpersistenz (offen, Betreiberentscheidung):** Nach bestätigtem Providerauftrag und gescheiterter lokaler Transaktion geht `502 BOOKING_OUTCOME_UNKNOWN` hinaus, bevor das Angebot `reconciliation_required` ist. Der Sendungs-Claim sperrt einen Retry derselben Sendung; der Angebotsschutz und der zugesagte Zustand fehlen im Antwortmoment, bei gescheiterter Markierung dauerhaft. Eigene Backendaufgabe mit deterministischem Test — Backend `docs/booking-safety-finding-offer-reconciliation-order-2026-10.md`.
- **R2 — Risiko B, Kontostatus vor der Passwortprüfung (offen, Betreiberentscheidung):** `POST /login` meldet „wartet auf Freischaltung“ bzw. „gesperrt“ schon ohne gültiges Passwort; integriert bestätigt — Backend `docs/security-finding-login-status-disclosure-2026-10.md`.
- **R3 — E-Mail-Wechsel defekt (offen, vorbestehend):** Das Frontend ruft `/kunde/email-change` (Start, Erneut senden, Abbrechen) und `/auth/confirm-email-change` ohne `/api` auf, das Backend bedient nur `/api/…` → 404 (integriert bestätigt).
- **R4 — mögliche Datenschutzfrage im Gutschrift-PDF (offen, Produkt- und Datenschutzentscheidung):** Positionen nennen die Auftragsnummer der Sendung, auch Teampositionen (Sendung eines Kunden eines Teammitglieds); das Portal nennt dieselbe Buchung neutral `VP-<id>` (12A „Mandantentrennung“).
- **R5 — Admin-Rate-Limit (Hinweis, Betreiberentscheidung):** Alle lesenden Endpunkte des Partner-Adminbereichs teilen 120 Zugriffe je 15 Minuten und Admin (im Speicher je Prozess); eine Partnerdetailansicht kostet 5 davon.
- **R6 — Startabhängigkeit `RESEND_API_KEY` (Dokumentation korrigiert):** Ohne Wert startet das Backend nicht, weil `emailService.js` den Resend-Client beim Laden erzeugt.
- **R7 — sporadische Frontend-Tests (offen, Testbefunde):** 17.4.
- **R8 — Grenze des Kundenlink-Tests im Pre-Live-Modus (Testgrenze, gewollt):** Die öffentliche Kundenregistrierung ordnet Testpartnern nie Kunden zu. Der Weg Kundenlink → Zuordnung ist nur mit einem echten Partner prüfbar (lokal geprüft, nie gegen Produktion); Provisionen echter Kunden lassen sich nicht am selben Tag prüfen.
- **R9 — vorbestehende UX- und Barrierefreiheitsbefunde (offen):** u. a. Kundenregistrierung ohne Labels für Postleitzahl, Ort und Land; Kontraste im Admin-Kundendetail und im Kundenprofil; Touch-Ziele der Fußzeilenlinks. Vollständige Liste im Bericht.

### 20.7 Umsetzungsstand R1–R9 (Nachtrag 2026-10-09)

**Status: ACTIVE_CURRENT**

Stand gegen Backend `origin/main` `4c246df` und Frontend `origin/main` `1d0f57d`. „Gemergt“ und „Main-CI grün“ sind gegen GitHub geprüft. **Deployt: nein** — in diesen Aufträgen wurde nichts ausgerollt; der Deploymentzustand außerhalb des Repository bleibt `UNKNOWN_RUNTIME_STATE` (21). **Produktiv verifiziert: nein** für alle Punkte. Details und Nachweise: Nachtrag im Bericht `docs/ux-gesamt-qa-2026-10-08.md`.

| Punkt | Ergebnis | Implementiert | Gemergt (PR → Main) | Main-CI | Deployt | Produktiv verifiziert |
|---|---|---|---|---|---|---|
| R1 Buchungssicherheit | Angebot vor der Antwort `reconciliation_required` verbraucht; Antwort bleibt 502 `BOOKING_OUTCOME_UNKNOWN`, kein Revert, kein Retry | ja | Backend #405 → `1272b8a` | grün | nein | nein |
| R2 Login | Passwort vor Status, fail-closed bei unbrauchbarem Hash (13.1) | ja | Backend #406 → `87862cc` | grün | nein | nein |
| R3 E-Mail-Wechsel | Frontend ruft die Backendpfade mit `/api` auf; Vertragstest; keine Alias-Routen | ja | Frontend #482 → `d217958` | grün | nein | nein |
| R4 Gutschrift-Referenz | `VP-<Ledger-ID>` für künftige Gutschriften (1A, 12A) | ja | Backend #407 → `144ae30` | grün | nein | nein |
| R5 Admin-Rate-Limit | geprüft, keine Codeänderung erforderlich; keine Erhöhung auf 600 | — | — | — | — | — |
| R6 E-Mail-Betrieb | kein Codefix; offene Produktions-/Coolify-Prüfung | — | — | — | — | offen |
| R7 FE-CI-Stabilität | Ursachen beider sporadischer Tests behoben (17.4) | ja | Frontend #481 → `2a0cb8c` | grün | nein | — |
| R8 Kundenlink Pre-Live | gewollte Testgrenze; produktiver Rauchtest ausstehend | — | — | — | — | offen |
| R9 Bedienung/Barrierefreiheit | Labels, Kontraste, zugängliche Namen, Tastatur, Touch-Ziele, Gutschriftslauf | ja | Frontend #483 → `dcf0ba5` | grün | nein | nein |
| Admin-Kennzahl „Kunden“ | eigener Serverzähler (1A) | ja | Backend #408 → `4c246df`, Frontend #484 → `1d0f57d` | grün | nein | nein |

- **R5:** Der gemeinsame Lesezähler des Partner-Adminbereichs (120 je 15 Minuten und Admin, im Speicher je Prozess) wird bei manueller Arbeit erst nach über 15 Partnerprüfungen in 15 Minuten erreicht; der Gutschriftslauf belastet ihn nicht (Ausstellen läuft über den Schreibzähler). Ausgelöst hat ihn nur eine automatisierte Messreihe. Falls je eine Anpassung nötig wird: ein eigener Wert nur für diesen Zähler (Vorschlag 240), keine pauschale Erhöhung. Betreiberentscheidung, kein Go-Live-Blocker.
- **R6:** In Production bricht der Start ohne `RESEND_API_KEY`, `INVOICE_EMAIL_FROM` oder `INVOICE_EMAIL_REPLY_TO` ab (`server.js`); `APP_BASE_URL` wird erst bei Benutzung geprüft. Der feste Reset-Link `https://confidaraexpress.de/login?reset=` ist ein bewusster, per Test festgehaltener Vertrag. Offen ist allein die Prüfung der Produktionsumgebung (read-only Preflight im Bericht; 21).
- **R8:** Die Trennung von Test- und Echtdaten bleibt unverändert; ein Testpartner-Code ordnet nie einen Kunden zu. Der echte Weg Kundenlink → Registrierung → Zuordnung wird erst mit echtem Partner und echtem Kunden geprüft (Rauchtestplan im Bericht; Betreiberentscheidungen in 21). Hinweis: Der Kundenlink eines Testpartners erzeugt in Production ein echtes, nicht zugeordnetes Konto; er darf dort nicht benutzt werden.
- **Bewusst offen (Betreiberentscheidung, kein Blocker):** ein eigener Text für abgelehnte Partneranträge; die Anzeige des Betrags bereits ausgestellter Gutschriften im Gutschriftslauf (nicht erforderlich: Betrag und PDF stehen im Partnerdetail).

---

## 21. Runtime / Human Confirmation Required

Folgende Punkte dürfen ohne aktuelle Runtime-/Produktbestätigung nicht als Fakt behauptet werden:

- Welche Feature Flags aktuell in Production gesetzt sind.
- Ob Transglobal-Credentials in Production vorhanden sind.
- Ob Transglobal-Angebote technisch tatsächlich ausgespielt werden können; produktseitig ist ihre Sichtbarkeit bestätigt.
- Aktueller Zustand von `TRANSGLOBAL_ACCOUNT_CURRENCY`, `TRANSGLOBAL_PUBLIC_BOOKING_ENABLED` und `TRANSGLOBAL_BOOKING_ENABLED` je Umgebung.
- Aktueller Wert von `TRANSGLOBAL_SERVICE_CATALOG` je Umgebung (Soll: Produktions-API `live`, Staging-Backend `staging`; ohne Wert in Produktion kein TG-Angebot). Welche Live-ServiceID welches Produkt trägt, ist für die 14 im Katalog belegten IDs gemessen (Klärungstest 3, 2026-10-10); 47/48 sind im Live-Konto nicht angeboten (Freischaltung durch den Anbieter). Die Formularidentität der Portaltarife 110/124 (Live 114/125) und Etikett/Tracking der Live-Produkte belegt erst der jeweilige Rauchtest.
- Aktueller Zustand der Produktfreigaben `TG86_PUBLIC_RELEASE_ENABLED` und `TG137_PUBLIC_RELEASE_ENABLED` je Umgebung (Repository-Default: aus; Setzen ist eine ausdrückliche Betreiberentscheidung, 1A).
- Aktueller Zustand der Transglobal-Fristen `TRANSGLOBAL_QUOTE_TIMEOUT_MS`, `TRANSGLOBAL_BOOK_PRE_ORDER_TIMEOUT_MS`, `TRANSGLOBAL_ORDER_TIMEOUT_MS` und `TRANSGLOBAL_TRACKING_TIMEOUT_MS` je Umgebung sowie die tatsächlichen Antwortzeiten des Anbieters dort.
- Wirksame Proxyfristen vor der API (Traefik: `respondingTimeouts`, `forwardingTimeouts`) und die Stop-Grace des Containers — beide müssen die längste Browserfrist (`/book`, 150 s) bzw. `SHUTDOWN_GRACE_MS` tragen.
- Aktueller `VAT_RATE` in Production.
- Aktueller globaler Fallback `CONFIDARA_MARGIN`.
- Aktueller Zustand von `LEGAL_BOOKING_GATE_ENABLED`.
- Aktueller Zustand von `CONSOLIDATED_INVOICING_ENABLED`.
- Aktueller Zustand von `TRACKING_SYNC_ENABLED`.
- Aktueller Sandbox-/Production-Modus der Provider.
- Tatsächlicher Deploymentzustand außerhalb des Repository.
- Ob in Production Entwürfe ohne Eigentümer existieren (read-only: `SELECT count(*) FROM shipments WHERE user_id IS NULL AND status = 'draft'`) und ob sie bereinigt werden — eine Betreiberentscheidung, nie automatisch (Final Bookability Closure).
- Reale Auftrags- und Etikettevidenz für JUMiNGO-Abgaben im Paketshop (UPS, DHL, GLS, DPD — je Carrier ein Entwurf mit Shop-PUT, ein Readback, das das Readback-Gate besteht (persistierte `rate`, siehe 1A), und eine echte Bestellung mit Etikett). Seit 2026-10-01 sind die vier Carrier per Betreiberentscheidung kuratiert (`config/jumingoDropoffCapability.js`); bleibt die `rate` leer (wie im DPD-Negativbefund), blockiert das Readback-Gate und die Buchung endet ohne Bestellung.
- Die Höhe eines JUMiNGO-Gebietszuschlags (G4_REQUIRED); bis dahin ist ein Tarif mit `hasAreaSurcharge` nicht buchbar.
- Ob der Transglobal-PRODUKTIONSserver dasselbe Kaltstartverhalten zeigt wie Staging (gemessen nur Staging, 2026-10-06) und ob die Idle-Schwelle von 10 min dort ausreicht — ablesbar ohne Zusatzrequest an `[TG warmup]`- und `[TG timing] op=GetQuote`-Zeilen.
- Der Kartenanbieter des Paketshop-Finders (OpenStreetMap-Kachelrichtlinie, eigener Anbieter über `VITE_MAP_STYLE_URL`) und die Nennung von Transglobal und der Kartenkacheln in Datenschutzerklärung und AGB (neue Legal-Set-Fassung; die aktiven Fassungen SET-2026-08 nennen nur JUMiNGO).
- Vertriebspartner-Programm (12A) — vor jeder Aktivierung: Zustand der fünf Schalter je Umgebung; die finale Partnervereinbarung 1.0 als freigegebene, registrierte und veröffentlichte PDF (11.4) und ihre Fassung (`SALES_PARTNER_AGREEMENT_VERSION`; ein evtl. gesetzter Altwert im Freitextformat muss vor dem Einschalten der Registrierung auf `MAJOR.MINOR` umgestellt sein) sowie Datenschutzaussagen zur Referral-Vormerkung (keine erfundenen Rechtstexte); ob und in welcher Höhe eine Obergrenze gilt (optional) und die Kürzungsreihenfolge der Gesamtobergrenze; Level-Schwellen der globalen Regel; Produktionsgeltung der Transglobal-UPS-Ereigniscodes; ob individuelle Obergrenzen gesetzt werden sollen (Standard: keine); ob der Trackingjob (`TRACKING_SYNC_ENABLED`) in der Umgebung läuft; Rollen- und Kontobestand der Produktion (unbekannte Rollenwerte, Altkonten ohne Rolle); ein Lösch-/Anonymisierungskonzept für Partnerkonten (bis dahin lehnt der Kundenpfad beides ab); ein Staging-Rauchtest; die ausdrückliche Betreiberfreigabe je Schalter.
- **Pre-Go-Live-Gate des Vertriebspartnerprogramms** (12A, 2026-10-07) — vor dem echten Start: `SALES_PARTNER_PRELIVE_TEST_MODE` aus (bzw. entfernt) und `SALES_PARTNER_PRELIVE_TEST_MAIL_ALLOWLIST` entfernt; Pre-Live-Testdaten über den Trockenlauf geprüft und bereinigt (Status: alle Zähler 0, kein Blocker); die während der Tests angelegten globalen Level-Regeln und Obergrenzen bewusst bestätigt oder durch eine neue Version ersetzt (sie sind keine Testdaten und bleiben); UG-Ausstellerdaten; die echte Vereinbarung 1.0 veröffentlicht; Legal/Tax freigegeben; jeder produktive Schalter bewusst gesetzt; Runtime-Prüfung gegen die Deploymentumgebung.
- Partnergutschriften (12A) — vor `SALES_PARTNER_CREDIT_NOTES_ENABLED`: Ausstellerdaten der UG (`SALES_PARTNER_ISSUER_*`, nicht erfinden); erlaubte Steuerfälle, Steuersatz und Pflichthinweise (`SALES_PARTNER_TAX_*`, nie `VAT_RATE`); Dokumenttitel von Gutschrift und Korrekturbeleg; E-Rechnungsformat/-pflicht für Gutschriften; Aufbewahrungs- und Löschregeln für Belege und Abrechnungsdaten; endgültige Korrekturbezeichnungen; Betriebsablauf beim Storno einer bereits ausgezahlten Gutschrift; ein Staging-Rauchtest.
- **UX-Pakete 1–6 und Gesamt-QA** (2026-10-09):
  - ob Frontend `c1bc6f9` und Backend `99f8a20` ausgerollt sind — Deployment wurde nicht durchgeführt; Reihenfolge Backend vor Frontend, Übergabeplan im Bericht `docs/ux-gesamt-qa-2026-10-08.md`;
  - `APP_BASE_URL` in Production (https, Basis der Partnerlinks) und ob `RESEND_API_KEY` gesetzt ist (Startvoraussetzung, 20.6 R6);
  - die Zahl der Proxys vor der API: `app.set("trust proxy", 1)` erwartet genau einen, sonst teilen sich Clients die IP-basierten Limits (Login, Registrierung);
  - ob ein Proxy die E-Mail-Wechsel-Pfade umschreibt (laut Code nicht vorgesehen, 20.6 R3; seit Frontend #482 ohne Bedeutung, 20.7);
  - das Verhalten in Production oder Staging, auf physischen Geräten und mit Screenreadern (nicht geprüft).
- **Abschluss R1–R9** (2026-10-09, 20.7):
  - ob Backend `4c246df` und Frontend `1d0f57d` ausgerollt sind — nicht deployt; Reihenfolge Backend vor Frontend (die Kennzahl „Kunden“ braucht `GET /admin/metrics/customer-accounts`; ohne ihn zeigt das Frontend „Anzahl nicht verfügbar“);
  - R6-Preflight in Coolify (read-only): Startlog ohne Pflichtvariablen-Abbruch, `RESEND_API_KEY`, `INVOICE_EMAIL_FROM` und `INVOICE_EMAIL_REPLY_TO` gesetzt, `APP_BASE_URL` gleich der öffentlichen Frontend-URL, Absenderdomains bei Resend verifiziert (SPF, DKIM, DMARC), Postfächer der festen Alarmadressen vorhanden — ohne Mailversand, ohne ENV-Änderung;
  - R8-Rauchtest des echten Kundenlinks nach Betreiberentscheidung: Referral-Schalter, echter befreundeter Partner und Kunde, Zeitpunkt nach dem Pre-Go-Live-Gate, Provisionsschalter, Vorgehen bei Abbruch.

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
- ein Teil des Vertriebspartner-Programms wird aktiviert oder seine Provisions-, Level- oder Obergrenzenregeln ändern sich
- eine Vertriebspartnervereinbarung wird veröffentlicht, oder Steuerfälle, Aussteller oder Nummernkreis der Partnergutschrift ändern sich
- der Pre-Live-Testmodus wird eingeschaltet, eine Ausnahmeliste gesetzt, Testdaten bereinigt — oder ein neuer Pfad liest Sendungen, Konten oder Gutschriften ohne Status- oder Kennzeichenfilter

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
- Transglobal: Portfolio ≠ erste Live-Welle (1A) — 86/137 sind kein Scope-Verstoß an sich; prüfen, ob ihre Aktivierung über die eigene Produktfreigabe kontrolliert bleibt und nicht mit der ersten Welle geschieht
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
- das Vertriebspartner-Programm sei aktiv, weil sein Code vorhanden ist.
- ein Buchungsstatus, ein Label, `tracking_status` oder eine AWB sei ein Versandnachweis.
- die Provisionsbasis werde mit der Paketanzahl multipliziert oder eine ungültige Paketanzahl sei 1.
- eine Partnergutschrift dürfe ihren Steuersatz aus `VAT_RATE` oder ihren Aussteller aus `INVOICE_ISSUER_*` ableiten.
- die Vertriebspartnervereinbarung gehöre in ein Kunden-Legal-Set, oder eine Fassung dürfe mit erfundenen Unternehmensdaten veröffentlicht werden.
- „ausgezahlt" bedeute, dass das System gezahlt hat, oder ein negativer Saldo werde vom Partner zurückgefordert.
- eine fehlende Obergrenze stelle die Provision zurück, oder eine unbrauchbare individuelle Obergrenze dürfe still durch die globale ersetzt werden.
- Pre-Live-Testdaten dürften in echte Kennzahlen, Rechnungen, Forderungen, Queues, Gutschriften oder Nummernkreise einfließen, ein Testkennzeichen dürfe umgesetzt werden, oder `is_test_booking` sei ein Pre-Live-Testkennzeichen.
- eine Testgutschrift sei steuerlich gültig, trage UG-Daten oder eine CE-PG-Nummer, oder der Testmodus ersetze den produktiven Schalter.
- Mails an Testkonten dürften an eine Sammeladresse umgeleitet werden, oder die Bereinigung sei ein allgemeines Löschwerkzeug.

---

## 25. Changelog

### v2.36 — 2026-10-10 (Transglobal-Servicekatalog: Produktidentität getrennt von der ServiceID der Umgebung)

- 1A/6.4: Befund der Live-Klärungstests (Produktivkonto, je fünf GetQuotes, read-only): Transglobal nummeriert je Umgebung eigenständig — Live 84/85 tragen andere DHL-Zeitprodukte als Staging 84/85, Live 44 ein Inlands- statt des EU-Produkts, Live 124 einen Lagerservice eines anderen Carriers; eine Rechenregel gibt es nicht. Die ID-geschlüsselte Matrix hätte live 84/85 unter falschen Leistungsnamen angeboten.
- 6.4: neue Bedingung „Servicekatalog der Umgebung" — Übersetzung Anbieter-ID ↔ Produktschlüssel nur am Eingang (Quote) und am Ausgang (V2-Bestellung, Portaladapter); innen unverändert der Produktschlüssel (Policy, Preise, Adressart, Freigaben, Gebühren, Cross-Provider, gespeicherte Angebote). Live belegt: 22, 23, 26, 29, 41, 137 identisch, 49 ← 44, 44 ← 45, 85 ← 83, 87 ← 85, 84 ← 86, 107 ← 111, 110 ← 114, 124 ← 125 — Belegstandard Anbietername + gleiche Produktstruktur auf identischer Route + Portal-Übergabevermerk; keine geratene Zuordnung, keine Tarifsperre, keine Streichung. 47/48 bietet das Live-Konto nicht an; 86 („10am") hat live kein Gegenstück.
- Klärungstest 3 (2026-10-10, Staging und Live im selben Lauf, nur Lese- und Preisabfragen, Warenkorb unverändert): kein Wochentagseffekt (offizielle GetQuote-Dokumentation ohne Datumsfeld, Staging bot 47/48 am Samstag); 47/48 live auf keiner DE-Route und nicht auf der Angebotsseite; keine verborgenen Produktschlüssel (14 dokumentierte Felder, Tarifzeilen-IDs je Umgebung verschieden); Portal Live 125 „Shopabgabe" und 114 „Frei" wie Staging 124/110; Live-DHL RES 5,00 bei Privatzustellung (privat fail closed bis zur Betreiberentscheidung).
- 13.4/21: `TRANSGLOBAL_SERVICE_CATALOG` (`staging` | `live`), Pflicht in Produktion, vor dem Merge in beiden Coolify-Umgebungen zu setzen (Produktions-API `live`, Staging-Backend `staging`).
- Providerrequests nur zur Klärung (7 Staging-GetQuotes lokal; Klärungstest 3 je 7 GetQuotes und eine Portal-Angebotsseite in Staging und Live); keine Buchung, keine Warenkorbänderung, keine ENV-Änderung, kein Deployment.

### v2.35 — 2026-10-10 (Betreiberentscheidung: Pre-Live-Priorisierung)

- 1A Betriebsstatus: Keine echten Kunden oder freigeschalteten echten Vertriebspartner/Freelancer im regulären Betrieb; technische Fertigstellung vor zusätzlicher Testkennzeichnung, künstlichen Tarif-Zwischensperren und nicht erforderlicher Härtung. Alle 14 TG-Tarife bleiben im Abschlussumfang; Kernschutz und Freigabegrenzen bleiben erhalten.
- Reine Dokumentation: keine Code- oder ENV-Änderung, kein Providerrequest, keine Buchung, kein Deployment.

### v2.34 — 2026-10-09 (Technischer Abschluss R1–R9)

- 1A: neue Betreiberentscheidungen — Admin-Übersicht (Kennzahl „Kunden“ nur echte Kundenkonten) und Positionsreferenz der Partnergutschrift (`VP-<Ledger-ID>`).
- 12A: offene Frage zur Auftragsnummer in Gutschriftpositionen durch die Entscheidung ersetzt.
- 13.1: Login prüft das Passwort vor dem Kontostatus.
- 17.4: Ursachen beider sporadischer Testbefunde behoben; Einordnungsregel bleibt.
- 20.6: bleibt als historischer Stand der Gesamt-QA, nur mit Verweis auf 20.7.
- 20.7 (neu): Umsetzungsstand R1–R9 — implementiert, gemergt, Main-CI, deployt und produktiv verifiziert getrennt.
- 21: Deploymentstand, R6-Preflight und R8-Rauchtest als offene Laufzeitpunkte.
- Dokumente: datierter Nachtrag im Bericht `docs/ux-gesamt-qa-2026-10-08.md` (beide Repositories, byte-gleich); die ursprünglichen Abschnitte des Berichts bleiben unverändert.
- Keine Codeänderung, kein Providerrequest, keine Buchung, keine ENV-Änderung, kein Deployment.

### v2.33 — 2026-10-09 (Gesamt-QA der UX-Pakete 1–6: Abschluss, offene Go-Live-Risiken, Produktionszustand)

- 1A: UX-Vereinfachung abgeschlossen — alle sechs Pakete gemergt (Frontend #474–#479, Backend #403), Gesamt-QA ohne Regression.
- 12A: offene Frage zur Auftragsnummer in Teampositionen des Gutschrift-PDFs (20.6 R4).
- 17.4 (neu): bekannte sporadische Tests und Einordnungsregel.
- 20.6 (neu): offene Go-Live-Risiken R1–R9 aus der Gesamt-QA; Risiko A und Risiko B unverändert offen.
- 21: Deploymentstand der UX-Pakete, `APP_BASE_URL`, `RESEND_API_KEY`, Proxy-Anzahl, E-Mail-Wechsel-Pfade, ungeprüfte Umgebungen.
- Dokumente: Bericht `docs/ux-gesamt-qa-2026-10-08.md` (beide Repositories, byte-gleich); Backend `docs/booking-safety-finding-offer-reconciliation-order-2026-10.md` (neu); integrierte Bestätigung in `docs/security-finding-login-status-disclosure-2026-10.md`; ENV-Tabelle `RESEND_API_KEY` in `docs/BACKEND_ARCHITECTURE.md` korrigiert.
- Keine Codeänderung, kein Providerrequest, keine Buchung, keine ENV-Änderung, kein Deployment.

### v2.32 — 2026-10-08 (UX-Paket 1: Verständlichkeit und Bedienfehler)

- 1A: Betreiberentscheidungen zur Bedienoberfläche (Anrede „Sie“, „Mein Team“ immer sichtbar, Empfehlungscode nicht mehr in der Partnerübersicht, Einzelausstellung einer Gutschrift nur nach Bestätigung, keine obligatorische globale Obergrenze, bestehendes Design) und sechs Umsetzungspakete.
- 12A: Kundendetail `GET /admin/users/:id` nennt `user.prelive_test` als reines Lesefeld (Testkonto zuverlässig als TEST, auch ohne Testmodus). Login-Statusmeldung vor der Passwortprüfung als eigenständiger Sicherheitsbefund dokumentiert (`docs/security-finding-login-status-disclosure-2026-10.md`), nicht geändert.
- Keine Änderung an Provisionsberechnung, Level, Team, Referral, Versandnachweisen, Gutschriftenlogik oder Auth. Kein Providerrequest, keine Buchung, keine ENV-Änderung, kein Deployment.

### v2.31 — 2026-10-07 (Pre-Live-Partnerregistrierung über den echten öffentlichen Ablauf)

- 1A: Betreiberentscheidung — im Pre-Live-Testmodus öffnet `/partner-registrieren` das echte Formular als Testweg (ersetzt „bleibt bis 1.0 geschlossen" für den Testbetrieb; die produktive Registrierung bleibt geschlossen); primärer Ende-zu-Ende-Test des Betreiberflows; kein Zugangscode; Admin-Testanlage bleibt für Fixtures.
- 12A/13.4/14: Registrierungsweg zentral (`registrationPath`): produktiver Schalter mit Vorrang, Testweg nur ohne ihn; Testantrag serverseitig gekennzeichnet, ohne Vertragsannahme; `public-config.registrationMode`; Sponsorcode Test ↔ Test.
- Kein Providerrequest, keine Buchung, keine ENV-Änderung, kein Deployment.

### v2.30 — 2026-10-07 (Pre-Live-Testmodus, Startwerte, Obergrenze optional: implementiert, nicht aktiviert)

- 1A: Betreiberentscheidungen — Startwerte (10 % / 5 % / 2,5 %, aktiv ab 3 Paketen, Level 3/6/10/15/25 und 100/250/500/1000/2000, Bonus 2,5–12,5 Punkte) global vorbelegt und je Partner änderbar; Obergrenze optional, global oder individuell, unbrauchbare fail-closed ohne Rückfall; Pre-Live-Testmodus ohne echte rechtliche, steuerliche, finanzielle oder Providerwirkung.
- 10: Nummernkreis CE-TEST-PG für Pre-Live-Testgutschriften (eigener Zähler).
- 12A: Startwerte vom Server; Obergrenze optional (`cap_missing` entfallen) und individuell je Partner; Pre-Live-Testmodus (Kennzeichen und Datenbankverträge, providerfreie Testsendung, Anmeldung, Testgutschrift, Rückdatierung nur für Testdaten, Versandschutz, Bereinigung).
- 13.4/14/21/22/24: `SALES_PARTNER_PRELIVE_TEST_MODE` (aus) und `SALES_PARTNER_PRELIVE_TEST_MAIL_ALLOWLIST`; Featurezustand; Pre-Go-Live-Gate; Re-Audit-Trigger; verbotene Driftmuster.
- Kein Providerrequest, keine Buchung, keine Gutschrift, keine Auszahlung, keine ENV-Änderung, kein Deployment.

### v2.29 — 2026-10-07 (Vertriebspartnervereinbarung, Abrechnungsdaten, Gutschrift: implementiert, nicht aktiviert)

- 1A: Betreiberentscheidungen — Vereinbarung als versioniertes Registry-Dokument (`MAJOR.MINOR`, Start `1.0`, nie im Kunden-Set, keine Fassung mit erfundenen Daten); monatliche Gutschrift im Selbstabrechnungsverfahren durch die UG; negativer Saldo ohne Rückforderung (Vortrag); manuelle Überweisung, „ausgezahlt" als Adminvermerk; Zustellung über Portal und kurze Mail ohne Anhang; Nummernkreis `CE-PG<JJ>-<laufend>`.
- 10/11.4: neuer Nummernkreis CE-PG; neuer Registry-Typ `sales_partner_agreement` mit Bindung der Registrierung an die veröffentlichte, gültige, hash-geprüfte Fassung (keine Fassung veröffentlicht — Registrierung bleibt geschlossen).
- 12A: Abrechnungsdaten mit Adminprüfung; Gutschrift nach Modell C (Stichtag Europe/Berlin, Saldovortrag, Vorschau mit Fingerabdruck → Bestätigung, Datenbankindizes gegen Doppelabrechnung), Steuer und Aussteller fail-closed (nie `VAT_RATE`, kein Rückgriff auf den Rechnungsaussteller), eingefrorene Snapshots und PDF, Storno als eigener Korrekturbeleg, Auszahlung nur festgehalten.
- 13.4/14/21/22/24: fünfter opt-in-Schalter `SALES_PARTNER_CREDIT_NOTES_ENABLED` (aus) und Gutschriftwerte ohne Defaults; `SALES_PARTNER_AGREEMENT_URL` entfallen; `SALES_PARTNER_AGREEMENT_VERSION` bei aktiver Registrierung im Format `MAJOR.MINOR`; Featurezustände, Aktivierungsgates, Re-Audit-Trigger, verbotene Driftmuster.
- Kein Providerrequest, keine Buchung, keine Gutschrift, keine Auszahlung, keine ENV-Änderung, kein Deployment.

### v2.28 — 2026-10-06 (Vertriebspartner-Programm: implementiert, nicht aktiviert)

- 1A: Betreiberentscheidungen zum Vertriebspartner-Programm — additive Eigenprovision aus Grundprovision, Kunden- und Paketbonus (je 5 Level), aktiver Kunde ab 3 versendeten Paketen, Vormonat bestimmt Folgemonat, Versandtag als Stichtag, Basis nie mit der Paketanzahl multipliziert, zwei Teamebenen mit 10+10 Plätzen, erst nach Zahlung der Kundenrechnung auszahlbar.
- 5.9/13.1: Rolle `sales_partner` und feste Rollen-Allowlists je authentifiziertem Pfad (vorher prüfte der Kundenpfad keine Rolle).
- 12A: neuer Abschnitt — Versandnachweis als eigener Beleg, Zeitmodell, Fail-closed-Regeln, Obergrenzen mit offener Kürzungsreihenfolge, Ledger nur anhängend, Mandantentrennung; Trackingkorrekturen (eigener Advisory-Lock für den Transglobal-Trackinglauf, Fenster nach Buchungszeitpunkt, gebundener JUMiNGO-Schreibpfad).
- 13.4/14/21/22/24: vier neue opt-in-Schalter (alle aus) und Werte, Featurezustände, Aktivierungsvoraussetzungen, Re-Audit-Trigger, verbotene Driftmuster.
- Kein Providerrequest, keine Buchung, keine ENV-Änderung, kein Deployment.

### v2.27 — 2026-10-06 (Transglobal-Kaltstart: bedarfsgesteuertes Aufwärmen)

- 14/21: Befund (Staging, read-only gemessen): der Kaltstart liegt auf dem Server des Anbieters (~34 s nach ~35 min Ruhe), nicht im Verbindungsaufbau (~0,1–0,2 s). Betreiberentscheidung: Full-Quote-Vergleich bleibt, kein Wechsel auf `GetQuoteMinimal`. Aufwärmen ausschließlich über `GetCountries` — beim Start und bedarfsgesteuert durch angemeldete Versandseiten (`POST /api/offers/prepare`), höchstens ein Ruf je Ruhephase (10 min), Fehler-Cooldown, kein periodischer Ping. Warm zählen nur erfolgreiche `GetCountries`/`GetQuote`/`GetQuoteMinimal`; Tracking, Buchung und Portal nicht. Der Vergleich wartet höchstens 20 s auf einen laufenden Aufwärmruf und sendet dann mit der Restfrist; JUMiNGO unverändert sofort.
- Kein Providerrequest bei der Umsetzung; keine ENV, keine Migration.

### v2.26 — 2026-10-05 (Portfolio ≠ erste Live-Welle: Produktfreigabe für TG86 und TG137)

- 1A: Betreiberentscheidung — TG-Kundenportfolio (alle kuratierten Services einschließlich 86 und 137) und erste TG-Live-Aktivierungswelle (22, 26, 29, 41, 44, 47, 48, 49, 84, 85, 87, 107, 110, 124) sind getrennte Begriffe; „vorbereitet“ heißt nicht „aktiviert“. 86 und 137 bleiben vollständig erhalten, sind bis zu ihrer jeweiligen ausdrücklichen Freigabe aber weder sichtbar noch buchbar. Die Entscheidung vom 2026-10-01 („137 gehört zum Launch“) ist als Portfolioaussage eingeordnet.
- 6.4/13.4: je ein Produktfreigabeschalter `TG86_PUBLIC_RELEASE_ENABLED` / `TG137_PUBLIC_RELEASE_ENABLED` (opt-in, nur exakt `"true"`), Matrixfeld `publicReleaseGate`, Policy-Schritt 3a′ (`service_not_released`, Policy bleibt ENV-frei) und Schranke für gespeicherte Angebote — beide vor jedem Providerkontakt. Für 137 bleibt `TG137_PORTAL_ADAPTER_ENABLED` der getrennte technische Adapterschalter. Tracking, Nachlauf, Rechnung und Klärung bestehender Sendungen unberührt.
- 21/23: Runtime-Zustand der beiden Schalter als `UNKNOWN_RUNTIME_STATE`; Re-Audit-Punkt „86/137 kein Scope-Verstoß an sich, Aktivierungskontrolle prüfen“.
- Kein Providerrequest, keine Buchung, keine ENV-Änderung; die historischen Einträge v2.18 und v2.23 bleiben unverändert.

### v2.25 — 2026-10-02 (Go-Live Block B: Tarifnamen, Economy-Versandart, Samstagszustellung, Lieferzeitfilter, GLS 3339)

- 6.2/6.4/8.2: Betreiberentscheidungen K1–K4. Economy ist eine Versandart, kein Aufschlag: TG107 und TG41 (Policyfeld `shippingMode`) sowie JUMiNGO 3144 „ECONOMY EXPRESS“ (STANDARD, Economy-Liste, „Economy Express“) — Standardaufschlag, keine Preisänderung. 3339 „EuroBusinessParcel“ STANDARD / „Standard Business Europa“. 3106 bleibt neutral.
- Backend: `config/transglobalServicePolicy.js` führt `shippingMode` in allen 17 Einträgen (Ladeprüfung, eigene Werteliste wegen des Ladezyklus über `priceInputCapability.js`), `lib/providers/transglobal/servicePolicy.js` reicht es durch, `lib/offers/mappers/transglobal.js` liest es statt der Preisklasse. `lib/serviceClassification.js`: zwei Exact-Match-Namen, Economy-Liste (nur STANDARD-Namen, Ladeguard) und `classifyShippingMode`. `lib/tariffDisplayName.js`: zwei Namen und `offerTariffDisplayName` (Cargo-Ausnahme). `routes/jumingo.js`: Versandart und Kartenname aus der Kuration, `deliveryOnSaturday` aus dem Providerflag.
- 15 / Frontend: `utils/offersFilterView.mjs` bewertet die Frist dreiwertig (`met`/`too_late`/`not_assessable`) und filtert nur `too_late`; die Karte zeigt „Zustelltermin nicht bewertbar“ (neutraler Hinweis, Foundation-Tokens) und die Detailzeile „Samstagszustellung“. Bis Block B fiel ein Tarif am Stichtag ohne Uhrzeit bei gesetzter Uhrzeit heraus.
- Tests: `tests/go-live-tariff-presentation.test.js` (Matrix, Validator, Preisneutralität, Namen, echte Route DE→FR mit Versandart-, Abholungs-, Abgabe- und Carrierfilter, 3106, Samstag, Tarifgrenzen); angepasste Anker in `service-classification` (U1/U5/M4, S2b), `transglobal-pricing-class-curation` (3), `jumingo-card-class-parity` (K1/K2/K3/K5), `transglobal-service-class-display` (H3), `public-carrier-verified-resolution` (R6), `public-carrier-contract`, `access-point-capability` (14) und `carrier-resolution-diagnostics` (14); Frontend `offersFilterView` (F3 auf K2, K1–K5), `tariffPresentation` und E2E `tariffPresentation` (A–D, Samstag).
- Unverändert: Preisformel, Aufschlagsberechnung, Buchung, Provider-Payload, Offer-Snapshot, Cargo 3469, Carrier von 3106, alle Transglobal-Anzeigenamen. Der Volumenfaktor (B6) bleibt unveröffentlicht. Keine Provideraktion, keine DB-, ENV- oder Preisfunktionsänderung, kein Deployment.

### v2.24 — 2026-10-02 (Cross-Provider-Sichtbarkeit: JUMiNGO und Transglobal bleiben beide sichtbar)

- 6.5: Betreiberentscheidung — ein Preisunterschied ist nie ein Grund, eines von zwei gleichen Angeboten zu verbergen. `routes/jumingo.js` ruft `selectCrossProviderWinners` nicht mehr auf; weder die JUMiNGO-Tarife noch die Transglobal-Angebote werden nach `suppressedOfferIds` gefiltert. Persistenz (`orchestriert.offers`), Kundenfilter, Buchbarkeit und Reihenfolge unverändert.
- Das Matching bleibt (`config/crossProviderEquivalence.js`, `lib/offers/crossProviderMatch.js`); seine Gruppen erscheinen nur im Vergleichsmodus (Admin, nie Production). `lib/offers/crossProviderWinner.js` bleibt als reine Analysefunktion ohne Kundenwirkung.
- Frontend: `utils/offerSuppression.mjs` (2026-09-23, UPS · Expressversand · `quote_only`) entfernt; „Neue Sendung“ und Versandkostenrechner übernehmen die Serverliste unverändert. Nicht buchbare Angebote bleiben gekennzeichnet („Derzeit nicht direkt buchbar“).
- Tests: `tests/cross-provider-visibility.test.js` an der echten Route — eine Stellvertretermatrix setzt nur die Zustelladressart der Paarservices fest auf `false`, damit beide Seiten buchbar sind; verschiedene, umgedrehte und gleiche Preise, Buchbarkeit je Seite, alle sechs Registry-Paare 22/29/84/85/86/87 gematcht und sichtbar, keine Vermischung; gegen die vorherige Route sind A, B, F, F2, G und H rot. Routenanker in `cross-provider-winner-selection` (Z, AC), `provider-product-identity` (Y), `tg22-package-b`, `tg23-offer-withdrawal` (R5) und `tg23-express-saver` (52); Frontend `offerVisibilityContract` und E2E `crossProviderVisibility`.
- TG23 bleibt zurückgezogen (`offerEnabled: false`). Keine Provideraktion, keine DB-, ENV- oder Preisfunktionsänderung, kein Deployment.

### v2.23 — 2026-10-01 (DPD 137 ausdrücklich in das Launchportfolio aufgenommen)

- Produktentscheidung: Transglobal DPD Service 137 „DPD Classic“ gehört neben Service 124 „DPD PaketShop“ ausdrücklich zum Launchportfolio.
- Freigegebener Umfang der 137 bleibt exakt der bereits belegte Vertrag: DE→DE, genau ein Packstück, Fahrerabholung über den Portalpfad; keine Ableitung auf DE→EU, Mehrpaket oder Zusatzabsicherung.
- Eignungsbeleg unverändert: Portalprobe S137A zeigt Fahrerabholung statt Paketshop/Warehouse; Staging-Buchung DE0052658 wurde erfolgreich abgeschlossen und lieferte DPD-AWB sowie Versandlabel.
- Keine Code-, Preis-, Datenbank-, ENV- oder Provideränderung durch diesen Dokumentationsabschluss. Runtime-Schalter sind volatile Betriebswerte und werden nicht als dauerhafte Wahrheit kanonisiert.

### v2.22 — 2026-10-01 (JUMiNGO-Paketshop-Regression: Abgabe für UPS, DHL, GLS und DPD wiederhergestellt)

- 1A/6.2: `config/jumingoDropoffCapability.js` kuratiert per Betreiberentscheidung wieder `ups`, `dhl`, `gls`, `dpd`; `isJumingoDropoffBookable` bleibt die zentrale Freigabe, ein unbekannter Carrier bleibt `quote_only`. Die leere Liste (v2.15) war eine nachträgliche CE-Härtung; der gemeinsame Shop-Buchungspfad blieb erhalten. Der frühere DPD-Negativbefund (`rate=null`, `missing_data`, 2026-06-28) entstand vor der Umstellung auf die volle Tarif-ID (4d7d441, 2026-06-29) und begründet keine Sperre.
- Unverändert: Angebots- und Tarifbindung, Abholtag (`COLLECTION_DATE_CHANGED`), Ownership, Idempotenz und Klärung, Grenzen, Gebietszuschlag (G4_REQUIRED), Readback-Gate `evaluateOrderReadiness` (blockiert ohne persistierte `rate`, bei einem bekannten Nicht-bereit-Wert in `status`/`import_status` oder einem aktiven `shipper_tariff_id`-Leer-/Pflicht-Issue — dann 409 ohne Bestellung; `status: ready` wird nicht verlangt, unbekannte Statuswerte blockieren nicht), Warenkorb- und Preisprüfung, Etikett- und Trackingpfad.
- 15: der Paketshop-Finder folgt wieder Übergabeart + kontrolliertem Suchcode (`offerSupportsAccessPointSearch`); `offerHasParcelShopCapability` bleibt als Leser der Serverfelder bestehen, ist aber keine Finder-Bedingung mehr. TG124 unverändert.
- 21: offen bleibt die reale Auftrags-/Etikettevidenz je Carrier; diese Änderung erfindet keinen Providernachweis.
- Tests: `tests/jumingo-dropoff-regression-pg.test.js` (Vergleich → Angebot → Buchung je Carrier, Shoprate mit voller Tarif-ID, Gegenproben: Readback, Preis, Angebotskennung, Ownership, Tarifreferenz, G4, unbekannter Carrier); `book-runtime-order-pg` R11/R20/R24 auf den Stand vor der Härtung; `final-bookability-closure` P1-02; `book-revert-claim-runtime` R23; Frontend `finalBookabilityClosure` F6, E2E-Paketshop-Fixtures ohne Fähigkeitszusatz, `parcelShopOfferIntegration` 14.
- Keine Provideraktion, keine DB-, ENV- oder Preisfunktionsänderung, kein Deployment.

### v2.21 — 2026-10-01 (TG110 Final Closure: Labelvertrag `carrier_at_pickup` — Carrier bringt das Label bei der Abholung an)

- 1A/6.4/14/15: Staging-Buchung DE0052660 (QT-007171), genau ein Paket, genau ein Submit, 0 Retries; 14,53 € netto + 2,76 € USt = 17,29 € brutto, INV-0040824 vollständig bezahlt, Guthaben 3.679,68 € → 3.662,39 €; Abholung 01.10.2026 09–17 Uhr. Servicegenaue Bestätigung: der GLS-Fahrer bringt das Versandetikett bei der Abholung am Paket an.
- Providerneutraler Labelvertrag `labelHandling` (`lib/offers/labelHandling.js`), kuratiert genau einmal in `config/transglobalServicePolicy.js` (110: `carrier_at_pickup`, `printerRequired: false`); durchgereicht über das Verdict (`lib/providers/transglobal/servicePolicy.js`, `labelHandlingForService`) an Angebot, Buchbarkeit, TG110-Binder und Buchungseinstieg. Öffentliches Angebotsfeld `labelHandling` (Allowlist bewusst erweitert).
- Portalkern: unter `carrier_at_pickup` kein Labelabruf, kein `label_pending`; AWB unabhängig, genau eine Zahlung und ein Abschluss. Der Vorgangsbeleg ist die additive Spalte `label_handling` der vier Portaltabellen (`db/init.js`, nullable, ohne Default, ohne Backfill, idempotent), geschrieben ausschließlich von `claimInit` vor jedem Providerkontakt und von keinem anderen Schreibweg berührt; der Kern liest den Vertrag aus der Zeile, nicht aus dem heutigen Binder. `portalLabelState`, `carrierAppliedPortalSql`, Verfügbarkeit (`carrier_applied`, geschlossen), Kundendokumente, Kundenstatus/Auftragsbestätigung (`carrier_at_pickup`) und Etikettabruf (kein Portalkontakt) lesen ausschließlich diesen Beleg — für den abgeschlossenen und den menschlich als gebucht bestätigten Klärungsfall —, nie ServiceID oder Matrix. Der Label-Nachlauf schließt genau diese Vorgänge aus (`label_handling IS DISTINCT FROM 'carrier_at_pickup'`); historische TG110-Vorgänge mit `label_pending` bleiben Kandidaten.
- Buchbarkeit: 110 ohne `TG_PORTAL_LABEL_RECOVERY_ENABLED`; 47/124/137 unverändert. Zusatzmail: „Versandlabel & Tracking“ unter `carrier_at_pickup` fail closed (`LABEL_EMAIL_NOT_AVAILABLE`), Tracking-only frei. Frontend wertet ausschließlich `labelHandling` aus.
- Tests: `tests/tg110-carrier-label-contract.test.js` (u. a. F1–F3: der Fehlerpfad „`completed` nicht persistiert“ durch den echten Kern), `tests/tg110-carrier-label-pg.test.js` (T6/T7: derselbe Fehlerpfad durch Kern und Store gegen PostgreSQL mit menschlicher Bestätigung, T8: Schema, Idempotenz, Unveränderlichkeit; Gegenprobe gegen den ersten Implementierungsversuch #389: die historische Umdeutung war in allen fünf PG-Fällen rot; gegen den Vermerk-Stand: der Vertrag ging im Fehlerpfad verloren), `portal-order-detail-path` K0, Allowlist-Ratchets semantisch um `labelHandling` erweitert.
- Keine Production-Aktion, keine ENV- oder Preisfunktionsänderung; eine additive Schemaänderung (`label_handling`); Provideraktionen dieses Pakets 0.

### v2.20 — 2026-09-30 (TG110 Single-Package-Korrektur: aktueller Produktvertrag schlaegt Zwei-Paket-Portalannahme)

- 1A/6.4/14/15: GLS Pick&Ship / Service 110 ist fuer den Launch auf **genau ein Paket pro Sendung** begrenzt (`maxPackages: 1`). Aktuelle Provider-Evidenz: die Staging-Produktseite nennt ausdruecklich ein Paketstueck pro Sendung; ein frischer read-only Lauf bietet 110 mit einem Paket (2 kg, 30 × 20 × 15 cm) fuer 14,53 € netto an.
- Die historischen Zwei-Paket-Captures und DE0052649 bleiben als Evidenz dafuer erhalten, dass Quote/Warenkorb zwei Pakete annahmen. Sie sind **kein** End-to-End-Beleg fuer einen vollstaendig verarbeiteten Zwei-Paket-Auftrag: DE0052649 blieb ohne nachgewiesenes Label/AWB. Daraus wird umgekehrt **nicht** abgeleitet, dass zwei Pakete die Label-Luecke verursacht haben.
- Matrix und TG110-Binder sind wieder identisch und fail-closed: zwei oder mehr Pakete enden vor jedem Providerkontakt. Das Frontend erhaelt die Grenze weiter generisch ueber `tariffLimits`; keine ServiceID-Weiche noetig.
- Die historischen Zwei-Paket-Flow-Fixtures bleiben als ausdruecklich historischer Protokoll-Replay fuer Formular-/Schrittdrift bestehen; eigene aktuelle Tests beweisen, dass der produktive Adapter diese Eingabe nicht mehr sendet.
- Keine Aenderung an `printerRequired`, Label-Recovery oder Tracking-Semantik; deren endgueltiger TG110-Vertrag bleibt separat zu beweisen. Keine Provideraktion, keine ENV-/Schema-/Preisfunktionsaenderung.

### v2.19 — 2026-09-29 (Pre-Live Fix-Pack: Sammelabrechnung fail-closed, pagination-fester Etikettnachlauf, Adressbuch-Kontakt)

- 9.2: Wählbarkeit der Sammelabrechnung an den laufenden Sammelrechnungslauf gebunden (Profil, Admin, `/kundenbereich`-Fähigkeit; Bestandskonten unverändert, Rückweg auf `single` frei). Code: `lib/billingMode.js`, `routes/kunde/profile.js`, `routes/kunde/kundenbereich.js`, `routes/admin/users.js`, `server.js`; Frontend `BillingModeCard`, `billingModeView`, `AuthContext`. Tests: `tests/billing-mode-availability-pg.test.js` (Gegenprobe alter Stand: 4 von 5 rot), `tests/billing-mode-consolidated.test.js` (I1–I3, G6), `src/utils/billingModeUx.test.mjs` (H1–H6).
- 1A, 6.4: Portal-Etikettnachlauf pagination-fest — `order_detail_path` (additiv, alle vier Portaltabellen), gesetzt mit dem Abschluss bzw. einmalig beim ersten identitätsgeprüften Abruf, direkt gelesen. Code: `portal/labelRetrieval.js`, `portal/htmlForms.js` (`isStoredOrderDetailPath`), `portal/portalBookingCore.js`, `portal/bookingAttemptStore.js`, `lib/booking/portalBookingAttempts.js`, `lib/booking/portalLabelRecoveryStore.js`, `lib/shipmentLabel.js`, `db/init.js`. Tests: `tests/portal-order-detail-path.test.js` (Gegenprobe: 10 von 13 rot), `tests/portal-order-detail-path-pg.test.js`.
- Fehlerbehebung Adressbuch: Vor- und Nachname wurden validiert und gelesen, aber nie geschrieben (seit 2026-09-06). Code: `routes/addresses.js`; Tests: `tests/addresses.test.js` (11b/11c/12b, 26 geschärft), `tests/addresses-contact-pg.test.js` (Gegenprobe: 5 von 5 rot). Altadressen ohne Namen bleiben leer (kein Backfill).
- Providerrequests: **0**. Keine Buchung, keine ENV-/Schalteränderung, keine Production-DB-Mutation, kein Deployment. Schema: eine additive, nullable Spalte je Portaltabelle (idempotent). Schema-Version bleibt 2.1.
- Wirksam nach Merge des Branches `fix/prelive-internal-blockers-2026-09-29` (Backend und Frontend); die Frontendkopie dieses Dokuments ist byte-gleich.

### v2.18 — 2026-09-29 (TG Staging Final Closure: 86 und 137 belegt, kostenpflichtige Absicherung für 41/48/49)

- 1A, 6.4, 6.5, 14, 15: Service 86 ist das DHL-Produkt „EXPRESS 10:30“ — belegt durch die Staging-Buchung DE0052654 (Quote 1513, zwei Packstücke, Absicherung; Rechnung INV-0040819 = 33,74 + 10,00 steuerfrei, Delta 0; Etikett „[O] EXPRESS 10:30 (33)“). Kundenname „Domestic Express 10:30“, DE→DE öffentlich buchbar vorbereitet, höchstens zwei Packstücke, Absicherung, Adressart ohne Zuschlag (14 Staging-Quotes), frühester Abholtag, **ohne** Abholung am selben Tag; Produktpaar mit „EXPRESS DOMESTIC 10:30“.
- 1A, 6.4, 14: Service 137 (DPD Classic) ist Fahrerabholung — Portalprobe S137A (Abholgruppe, keine Paketshopgruppe) und Staging-Buchung S137B (DE0052658: 7,50 netto centgenau, genau eine Zahlung und ein Abschluss, DPD-Etikett sofort, Sendungsnummer 09985052595031). Portalpfad als vierter Binder, Schalter `TG137_PORTAL_ADAPTER_ENABLED` plus Nachlaufschalter (B3e), additive Tabelle `tg137_booking_attempt`, DE→DE, genau ein Packstück, beide Adressarten fest geschäftlich, ohne kostenpflichtige Absicherung.
- 1A, 6.4, 14: kostenpflichtige Transportabsicherung für TNT 41, 48 und 49 kuratiert — je eine eigene versicherte Staging-Buchung (DE0052655: 29,44 + 10,00; DE0052656: 21,78 + 10,00; DE0052657: 16,19 + 10,00; Absicherung je eigene steuerfreie Position, Delta 0). Ohne Absicherung bleiben allein die Portaltarife 47, 110, 124, 137 (Betreiberentscheidung).
- 1A (Korrektur): die Art der Lieferadresse ohne Zuschlag tragen laut Matrix auch TNT 41/44/47/48/49 und die 124; den frühesten Abholtag trägt die 29 seit ihrer Freigabe (2026-09-23).
- Offen (bewusst nicht geraten): Abholung am selben Tag der 86 (nicht gemessen); mehr als ein Packstück der 137; die Trackingereignisse — die Staging-TrackOrder-Antworten der V2-Buchungen 86/41/48/49 tragen `Status ERROR` ohne Ereignisse, aber den Leg mit der Etikett-Sendungsnummer; die Portalbuchung der 137 hat wie 47/110/124 keine Anbieterrechnung im Buchungsweg (Rechnungsbefund `unknown`, Kaufbeleg ist der geprüfte Warenkorb 7,50 + 1,42 = 8,92); TG110 (DE0052649) bleibt ein Zeitgate (letzte Lesung im CE-Nachlauffenster 30.09.2026 12–13 UTC); die 47 braucht ihre Production-Abnahme; „Ref No“ auf DHL-Belegen unverändert EXTERNAL_WHITE_LABEL_DECISION_REQUIRED.
- Providerrequests: ausschließlich Staging, ausdrücklich freigegeben und vor jedem Lauf registriert — S86 (1 GetQuote, 1 BookShipment, 1 TrackOrder), S137A (22 Portalrequests, keine Bestellung), S-INS 41/48/49 (je 1 GetQuote, 1 BookShipment, 1 TrackOrder), S137B (V2-Vergleichs- und Revalidierungsquote, 37 Portalrequests mit genau einer Zahlung und einem Abschluss). Staging-Kosten 148,65 € netto, kein unklarer Ausgang. **Production: 0** — keine Production-Buchung, keine ENV-/Schalteränderung, kein Deployment. Schema-Version bleibt 2.1.
- Wirksam nach Merge des Branches `fix/tg-final-closure` (Backend); die Frontendkopie dieses Dokuments wird im selben Stand über den Doku-Branch `docs/canonical-v2-17` synchron gehalten.

### v2.17 — 2026-09-29 (TG Final Closure: Transportabsicherung je Tarif, TNT-Freigabe nachgetragen)

- 6.4, 14 (Korrektur): die kuratierte Transportabsicherung nannte nur 22, 23, 26, 29. Seit dem TNT- und dem DHL-Abschluss sind es 22, 23, 26, 29, 44, 84, 85, 87, 107 — jede Aufnahme stützt sich auf eine Staging-Buchung mit Absicherung (eigene steuerfreie Rechnungsposition). Ohne sie: 41, 48, 49 (Absicherung quotiert, nie mitgebucht) und die Portaltarife 47, 110, 124. Deren buchbare Angebote tragen keine Absicherung (Karte „Keine Zusatzversicherung verfügbar.“, kein Absicherungsmodul), und der Portalkern beendet eine mitgeschickte Absicherung vor jedem Portalaufruf (`insurance_not_supported`). Test `tests/tg-final-closure.test.js` (Mutationsgegenprobe: 124 mit Absicherung → 5 von 8 rot; ohne Portalsperre → rot).
- 1A, 14 (Nachtrag): TNT 41/44 (DE→EU) und 48/49 (DE→DE) sind seit 2026-09-22 öffentlich buchbar vorbereitet (nur an Geschäftsempfänger mit Firmenname); 1A nannte sie nicht und führte den seit 2026-09-23 zurückgezogenen Service 23 noch als Ausnahme.
- Offen (bewusst nicht geraten): kostenpflichtige Absicherung für 41/48/49 — Produktentscheidung (ohne Absicherung starten oder zuvor je Service ein Staging-Nachweis); 86 (Produktidentität) und 137 (Übergabeart) bleiben ohne Angebot, ihre Klärung braucht je einen Staging-Nachweis mit Betreiberfreigabe.
- Providerrequests: **0**. Keine Buchung, keine ENV-/Schalteränderung, kein Deployment. Schema-Version bleibt 2.1.
- Wirksam nach Merge des Branches `fix/tg-final-closure` (Backend); die Frontendkopie dieses Dokuments wird im selben Stand über einen Doku-Branch synchron gehalten.

### v2.16 — 2026-09-29 (Go-Live-Abschluss: Etikettensatz-Integrität, belegte Tarifgrenzen, TG23-Status, Kartenquelle)

- 6.2 (D3): ein JUMiNGO-Mehrfachsatz, der nach der Ablage nicht vollständig in CE liegt, wird nie als Einzeletikett zwischengespeichert; ohne direkten Schlüssel nur ein eindeutiger Satz, nie ein fremdes Etikett; Admin-Labelauswahl = zentrale Funktion. Code: `lib/shipmentLabel.js`, `lib/jumingoLabelDocuments.js`, `routes/admin/shipments.js`; Tests `tests/jumingo-label-set-integrity.test.js`, `tests/final-bookability-closure-pg.test.js` F7.
- 6.2 (D5): `second_length` wird nur noch als zweitlängste Seite geprüft — so definiert die offizielle JUMiNGO-Spezifikation das Feld (`ShipmentPackage`), und so beschreibt es die Angebotskarte. Die zusätzliche Lesart „eingegebene Breite" sperrte den echten Tarif s-3258 („DHL national Paket VK Zeitoption", Mitschnitt) bei 40 × 90 × 20 cm als nicht prüfbar, obwohl die belegte Regel (40 ≤ 80) erfüllt ist. `girth` und `length`/`width`/`height` unverändert. Code: `lib/jumingoBookability.js`; Test `tests/jumingo-limit-readings.test.js` (Gegenprobe gegen `108eb06`: 4 von 9 rot).
- 14: Korrektur — TG23 ist seit 2026-09-23 (#374) aus dem Kundenangebot zurückgezogen (`offerEnabled: false`); die Zeile nannte ihn noch als öffentlich buchbar vorbereitet.
- 15, 21: Kartenkacheln des Paketshop-Finders standardmäßig von `tile.openstreetmap.org` (Produktionsbündel beobachtet); Anbieterwahl und Nennung in den Rechtstexten sind Betreiberentscheidungen.
- Providerrequests: **0** (die read-only Portallesungen dieses Tages betreffen keinen Vertrag). Keine Buchung, keine ENV-/Schalteränderung, kein Deployment. Schema-Version bleibt 2.1.
- Wirksam nach Merge des Branches `fix/jumingo-label-set-integrity` (Backend); die Frontendkopie dieses Dokuments wird im selben Stand über einen Doku-Branch synchron gehalten.

### v2.15 — 2026-09-28 (Final Bookability Closure: alle intern lösbaren Buchbarkeitslücken)

- 5.11, 15 (P0-01): nachweislich nicht bestellte JUMiNGO-Abbrüche antworten `BOOKING_FAILED` (Transportstatus bleibt), echter unklarer Ausgang unverändert `BOOKING_OUTCOME_UNKNOWN`; die Oberfläche bietet für jeden „nichts beauftragt“-Code die Neuberechnung bzw. „später erneut“, nie „wird geprüft“/„Zu meinen Sendungen“.
- 5.8 (P0-02): besitzerlose und fremde Entwürfe → 404 ohne Providerkontakt (Neubepreisung, Warenkorbvorschau, `/book`, Entwurfsreferenz); Bestandszählung nur read-only durch den Betreiber (21).
- 13.5 (P1-01): Debugmodus nur Admin, nie in Produktion, Startwarnung.
- 1A, 6.2 (P1-02, P2-05, P2-08): JUMiNGO-Abgabe nur mit Bindungsbeleg (Liste leer; DROPOFF_EVIDENCE_REQUIRED UPS/DHL/GLS/DPD), Gebietszuschlag und Warenkorbzuschläge fail-closed (G4_REQUIRED), dreiwertige Tarifgrenzen ohne erfundene Gurtmaßformel, Firmen-/Privat-/Abholflags, Inhaltsangabe statt „Paket“.
- 1A, 5.1 (P1-03, P2-04): das gespeicherte Angebot bindet Tarif und gezeigten Abholtag (additive Spalten `shipment_offers.provider_tariff_ref`, `offered_pickup_date`); `COLLECTION_DATE_CHANGED` und `OFFER_MISMATCH` vor jedem Claim; kein JUMiNGO-Weg ohne `offerId`.
- 6.2 (P2-06, P1-04, P2-07): Providerstatus normalisiert, Tracking-Rückfall auf die gespeicherte Sendungsnummer; JUMiNGO-Mehrfachetiketten als Belege; Trackingtakt mit Rückstellung und Fairness.
- 15 (P2-01, EXTRA): `labelStatus`/`labelRetrievable` in beiden Buchungsantworten aus der zentralen Labelwahrheit; die Dokumentliste meldet ein nicht abgelegtes JUMiNGO-Etikett als `processing`/`failed` mit `retrievePath` statt `ready`.
- 1A, 6.4 (P2-02): neun bundesweite Feiertage (Europe/Berlin) in Abholtag-Rückfall, Same-Day, Transglobal-Buchbarkeit und Lieferprognose.
- 17 (P2-03): der Textstufentest des Vergleichs-Overlays hält die Seitenuhr vor dem Klick an — deterministisch, Schwellen exakt statt ±500 ms.
- Code: neu `lib/booking/bookingNotPlaced.js`, `lib/jumingoBookability.js`, `config/jumingoDropoffCapability.js`, `lib/jumingoLabelDocuments.js`, `lib/providerFailureStatus.js`; Tests `tests/final-bookability-closure.test.js`, `tests/final-bookability-closure-pg.test.js` (Lauf `test:security-pg`), Frontend `src/utils/finalBookabilityClosure.test.mjs`.
- Nicht umgesetzt (extern/Betreiber, bewusst nicht geraten): TG86-Identität, TG137-Erfüllung, Höhe des JUMiNGO-Gebietszuschlags, JUMiNGO-Abgabe-Carrier ohne Beleg, JUMiNGO-Etikettformat.
- Providerrequests: **0**. Keine Buchung, keine ENV-/Schalteränderung, keine Production-DB-Mutation, kein Deployment. Schema-Version bleibt 2.1.
- Wirksam nach Merge der Branches `fix/final-bookability-closure` (Backend und Frontend).

### v2.14 — 2026-09-27 (PWA Core: ConfidaraExpress als App)

- 3.1, 15, 16: installierbare PWA auf Basis der bestehenden SPA — Manifest, vier CE-App-Icons (any/maskable, sichere Zone per Pixeltest belegt), minimaler Service Worker nur für die Offline-Seite (ein Cache, eine Datei), Installationskarte in den Kontoeinstellungen plus Utility-Eintrag in Sidebar/Drawer, Offline- und Versionshinweis ohne automatisches Neuladen, Offline-Wortlaut der Fehlergrenze, Login-Rücksprung über Allowlist, nginx-Regeln (no-cache, MIME, vollständige Sicherheitsheader).
- Keine neue Abhängigkeit, kein Backend-/DB-/ENV-Eingriff, kein Push. Providerrequests: **0**. Schema-Version bleibt 2.1.
- Wirksam nach Merge des Branches `feat/pwa-core` (Frontend) und dem Frontend-Deployment. Die Backendkopie dieses Dokuments wird im selben Stand über den Doku-Branch `docs/pwa-core-canonical` synchron gehalten.

### v2.13 — 2026-09-27 (Zero-Open-Innenabschluss: was CE über das Versandlabel weiß und dem Kunden sagt)

- 6.4, 14: `label_missing` (Schlüssel unverändert) zählt nach der Betriebsfrist nur noch „kein Versandlabel in CE“ — `not_in_ce_yet`, `provider_not_ready`, `fetch_failed`. Die Befunde vermerkt ausschließlich der eine Labelresolver aus echten Abrufen (drei nullable Spalten; kein Geschäftsstatus, kein zusätzlicher Providerabruf, kein Vorabruf). Ein per Klärung außerhalb von CE zugestelltes V2-Etikett (`delivered_outside_ce`) ist kein offener Fall. Präzisiert die v2.12-Zeile zu `label_missing`.
- 1A, 6.4, 15: die Labelaussage der Auftragsbestätigung ist nie stärker als der Beleg. Der bisherige Satz „Versandlabel … finden Sie in Ihrem ConfidaraExpress-Konto.“ steht nur, wenn das Label in CE liegt (gespeicherte Bytes oder LABEL-Beleg). Liegt es noch nicht dort, ist aber über das Konto abrufbar (JUMiNGO-Abruf auf Anforderung — CE weiß erst nach einem erfolgreichen Abruf, dass der Anbieter es hat) oder vom Portal-Nachlauf erwartet: „Sobald Ihr Versandlabel verfügbar ist, können Sie es in Ihrem ConfidaraExpress-Konto abrufen.“ Außerhalb von CE zugestellt: „Das Versandlabel wurde Ihnen gesondert bereitgestellt.“ (ohne Ort). Sonst keine Labelaussage; das PDF trifft keine. Die Aussage entsteht bei jedem Versand neu. Das Kundenkonto zeigt ein in CE nie entstehendes Etikett (Serverzustand `unavailable`, seit TG-6; jetzt auch JUMiNGO ohne Bestellnummer oder Referenz) als „Nicht im Kundenkonto verfügbar“ statt dauerhaft „Wird erstellt …“ mit endlosem Nachladen. Keine Anbieter- oder ServiceID-Weiche im Client.
- Providerrequests: **0**. Keine Buchung, keine ENV-/Schalteränderung, kein Deployment. Schema-Version bleibt 2.1.
- Wirksam nach Merge der Branches `fix/golive-tracking-labels` (Backend) und `fix/golive-label-reconciliation` (Frontend), zusammen mit v2.12.

### v2.12 — 2026-09-26 (Go-Live-Innenabschluss: Belegkette, Versicherungsrücksetzung, eine Quelle je Anzeige, Sendungsnummer, Etikettklärung)

- 1A, 6.4: Abholtag — der wirksame Abholtag von 29/107/41/44 (Wochenende, verschobener Tag, Mitternacht) ist von der Buchungsanfrage bis zu Rechnung und Auftragsbestätigung derselbe; kein Zuschlag, kein Clientwert (Tests, Branch `fix/golive-tracking-labels`).
- 6.2 JUMiNGO: wählt der Kunde „keine" Zusatzversicherung auf einem versicherten Entwurf, setzt `/book` sie serverseitig zurück und bestätigt den unversicherten Preis vor der Bestellung (sonst 409, keine Order) — Branch `fix/jumingo-golive-hardening`.
- 15: der gebundene Abgabe-Paketshop (Portal 124) erscheint auf Erfolgsseite, Auftragsbestätigung, Kundenkonto und Adminsicht aus EINER Serverquelle (Branch `fix/tg-portal-core-final`); der Leistungsname der Bestätigung ist der gebuchte Tarifname (Economy nie „Standard") — Branch `fix/golive-documents-mail`.
- 6.2, 6.4, 14: Sendungsnummer — `awb_missing` unterscheidet fünf Zustände (`available`, `fetch_failed`, `not_fetched_yet`, `not_available_yet`, `actually_missing`); der JUMiNGO-Takt hält die Nummer aus seinem bestehenden Abruf fest; späte Transglobal-AWB aus TrackOrder (6.4, Go-Live-Innenabschluss). `label_missing` bei JUMiNGO heißt „noch nicht in CE abgerufen".
- 5.11: V2-Auftrag ohne Versandetikett — Befund am Versuch, „gebucht" nur mit Zustellaussage, im Audit `label_delivery` (Backend `fix/golive-tracking-labels`, Frontend `fix/golive-label-reconciliation`).
- Bewusst offen (Belege extern/Betreiber): Gebietszuschlag JUMiNGO (`hasAreaSurcharge` ohne Betrag; zum Buchungszeitpunkt schützt der Warenkorbpreisgate), spätere JUMiNGO-Rechnungskorrekturen (Abgleich außerhalb von CE, nie Kundennachbelastung), Metadaten der JUMiNGO-Etiketten (kein Artefakt im Bestand); kein Admin-Werkzeug zum Nachtragen von Etikett/AWB (nicht launchnotwendig).
- Providerrequests: **0**. Keine Buchung, keine ENV-/Schalteränderung, kein Deployment. Kombinierter Integrationsstand ohne Regression gegen `origin/main`.
- Wirksam nach Merge der Branches `fix/golive-documents-mail`, `fix/golive-tracking-labels`, `fix/jumingo-golive-hardening`, `fix/tg-portal-core-final` (Backend) sowie `fix/jumingo-golive-hardening`, `fix/tg-portal-core-final`, `fix/golive-label-reconciliation` (Frontend).

### v2.11 — 2026-09-26 (Portal-Zusatzmail im Fenster des Nachlaufs)

- 1A, 6.4: die vom Kunden bestellte Label-/Trackingmail einer Portalbuchung wartet so lange wie der Label-Nachlauf (120 h statt 48 h) und geht genau einmal hinaus, sobald ihre Artefakte da sind; vorher stand sie nach einer Freitagabendbuchung am Sonntagabend auf `failed` und kam nur per Adminretry. Erkannt wird der Portalweg am abgeschlossenen Portalversuch der Sendung (`loadPortalLabelState`), nie an einer ServiceID; jede andere Sendung behält 48 Stunden; `failed` bleibt echten Mailproviderfehlern und dem Fensterende vorbehalten.
- Code: `lib/shipmentEmailDelivery.js` (`nextReadinessAttempt` mit optionalem, belegtem Fenster — derselbe Vertrag wie `readinessDueFromTimestamps`), `services/shipmentEmailDeliveries.js` (Portalweg → Nachlauffenster). Belegt durch `tests/portal-mail-readiness-pg.test.js` (echter Zustellworker, echtes Schema) und `tests/portal-label-recovery.test.js` (R4). Providerrequests: **0**.
- Wirksam nach Merge des Branches `fix/tg-portal-core-final`.

### v2.10 — 2026-09-25 (Portal-Final-Closure 47/110/124: Namens- und Adressgrenze schon im Vergleich, Aufräumreserve, Größenangabe nur mit Beleg, Login-Smoke)

- 1A: der Portalpunkt nennt die Adressgrenze jetzt als Vergleichsschranke (`address_details_too_long`, konservativ mit Leerzeichen gezählt, keine erfundene Zahl), den Fristablauf ohne Warenkorbrest, die AWB vor dem Etikett, die Zusatzmail einer Portalbuchung im Fenster des Nachlaufs (120 h statt 48 h, genau einmal), die Größenangabe nur mit gemessener Seite (DPD „Standard (A4)" = A6) und den Login-Smoke. Der 47-Befund ist geschärft: DE0052643 wurde über die Anbieteroberfläche selbst gebucht — die fehlenden Etiketten sind eine Eigenschaft der Stagingumgebung, kein Abruffehler; der Nachweis braucht eine Production-Bestellung nach Plan.
- 6.4: Nachtrag „Portal-Final-Closure" im Absatz Portal-Core-Final (Schranke P, Aufräumreserve, Größenangabe, Login-Smoke).
- 15: Frontend — ein neuer öffentlicher Grund `address_details_too_long` mit neutralem Text und Handlungshinweis (`utils/offerIdentity.mjs`); Paritätstest `src/utils/portalTariffParity.test.mjs` gegen die echten Serverformen von 47/110/124; keine ServiceID-Logik.
- Code: neu `lib/providers/transglobal/portal/addressContract.js`, `scripts/portal-session-smoke-readonly.js`, `docs/portal-production-smoke-plan.md`; geändert `publicBookability.js` (Schranke P), `lib/offers/mappers/transglobal.js` und `lib/offers/providers/transglobalQuote.js` (Absenderadresse, Grund, Labelangabe), `lib/offers/commonOffer.js` (Grund), `lib/offers/labelCapabilities.js` (`withoutLabelSizes`), `lib/booking/providerDocuments.js` (Seitenmessung), `portalBookingCore.js` (Aufräumreserve, Adressvertrag ausgelagert), `lib/booking/transglobalBookingEntry.js` (gemeinsame Adresszuordnung), `config/portalBookingDeadline.js` (Doku), `docs/runbook-buchungsklaerung.md` (§5.13).
- Providerrequests in diesem Paket: **0** (alle Nachweise offline; die read-only Lesungen vom 2026-09-25 stammen aus v2.9). Keine Buchung, keine ENV-/Schalteränderung, kein Deployment.
- Offen: TG110 Etikett/AWB zeitabhängig (read-only Prüfung am nächsten Werktag); TG47 Etikett/AWB am Staging extern — Production-Smoke nach Plan, eigene Entscheidung; Login-Smoke am Staging braucht den Branch auf Staging (Betreiber-Deploy).
- Wirksam nach Merge des Branches `fix/tg-portal-core-final` (Backend und Frontend).

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
