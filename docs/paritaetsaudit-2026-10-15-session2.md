# Paritätsaudit 2026-10-15 — Session 2 (Frontend): Nachweis

**Stand:** 2026-10-16 · **Branch:** `feat/frontend-paritaet-session2` (aus Frontend `origin/main` `4648896`)
**Backendvertrag:** Backend `origin/main` `b53bd34` (enthält PR #432 der Session 1) — alle Felder, Codes und Routen unten
sind gegen diesen Stand gelesen, nichts davon ist erfunden.
**Abgrenzung:** kein Merge, kein Deployment, keine Produktionsdaten, keine Provideraufrufe. Alle Browserprüfungen laufen
gegen einen gemockten Backend-Server (`page.route`).

Dieses Dokument ist ein datierter Nachweis der Frontend-Session, keine zweite Wahrheitsschicht. Das zentrale Register steht
im Backend (`confidaraexpress-api/docs/go-live/paritaetsaudit-2026-10-15-register.md`) und wird in Session 3 fortgeschrieben.

## 1. Backend erledigt, Frontend in Session 2 (10)

| ID | Umsetzung im Frontend | Nachweis |
|---|---|---|
| B4 | Marker „Testbuchung“ in Sendungsliste (Badge) und Sendungskopf; Gutschein-Zeilen (`voucher_code`, `voucher_discount_gross`) nur mit Code — `utils/adminShipmentView.mjs` (`isTestBooking`, `shipmentVoucherView`), `AdminShipmentsPage.jsx`, `AdminShipmentDetailPage.jsx` | `adminShipmentView.test.mjs` (B4); E2E `adminParitySession2` (Liste, Detail 1440/390 px) |
| B9 | No-op am echten Feld: `noOp` (Statuswechsel), `alreadyAnonymized` (Anonymisierung); Blockieren meldet „Status war bereits gesetzt.“ — `utils/adminCustomerView.mjs` (`statusChangeWasNoOp`, `anonymizeWasNoOp`), `AdminUsersPage.jsx`, `AdminUserDetailPage.jsx` | `adminCustomerView.test.mjs` (B9/B13) |
| BI1 | 409 `ORDER_ALREADY_SHIPPED` mit eigenem Satz; der Grund steht **im** Stornodialog (vorher hinter dem offenen Dialog) — `utils/inventoryErrors.mjs`, `inventory/OrderDetailPage.jsx` | `inventoryErrors.test.mjs`; E2E `warehouseManagement` (BI1) |
| BI2 | 409 `PRODUCT_INACTIVE` mit SKU aus `details.sku` — `utils/inventoryErrors.mjs` | `inventoryErrors.test.mjs` |
| BI7 | Lagerfilter (`warehouseId`) für Bestand und Bewegungen, ab zwei Lagern; alle Lager über den Cursor statt der ersten 50; gebucht wird nur in aktive Lager — `StockPage.jsx`, `MovementsPage.jsx`, `hooks/useAllWarehouses.js`, `utils/warehouseView.mjs` | `warehouseView.test.mjs` (2, 3, 7), `movementsUx.test.mjs`; E2E `warehouseManagement` (BI7) |
| BI9 | Mehrlagerregeln mit eigenen Texten (`WAREHOUSE_INACTIVE`, `WAREHOUSE_DEFAULT_REQUIRED`, `WAREHOUSE_NOT_EMPTY` samt Mengen aus `details`, auch `openReservations`) und die Lagerverwaltung (Abschnitt 4) | `inventoryErrors.test.mjs`, `warehouseView.test.mjs`; E2E `warehouseManagement` |
| BA1 | Statusverlauf zeigt die interne Deaktivierungsnotiz (`statusHistory[].note`); `DEACTIVATION_NOTE_INVALID` / `DEACTIVATION_REASON_INVALID` stehen am Feld — `utils/adminSalesPartnerView.mjs`, `admin/SalesPartnerStatusCard.jsx` | `adminSalesPartnerView.test.mjs` (BA1/BA7/BA9); E2E `adminSalesPartners` Test 16 |
| A3 | `ADDRESS_CONTACT_INCOMPLETE` mit `field` → „Für diese Adresse fehlt noch der Vorname … über „Bearbeiten““ — `utils/addressForm.mjs`, `AddressBookPage.jsx` | `addressBookView.test.mjs` (A3); E2E `addressBookContactNames` |
| A5 | Feldfehler der Zusatzadressen am Feld; `LABEL_EMAIL_NOT_AVAILABLE` markiert die Option „Versandlabel per E-Mail“ statt in den Adresszweig zu führen — `utils/bookingErrors.mjs` (`zusatzmailFehler`), `BookingPage.jsx` | `bookingErrors.test.mjs` (A4/A5/O1), `sharedShipmentEmailOptions.test.mjs` 9, `tg22PackageBWiring.test.mjs` 8 |
| O1 | Codes der gestuften Neubepreisung (alle 4xx-Zweige des Backends und die Angebotsweiche `OFFER_*`) als Kundentexte; die bisherige Statuskette bleibt Rückfall — `utils/bookingErrors.mjs` (`repriceFehlerText`), `BookingPage.jsx` | `bookingErrors.test.mjs` (A4/A5/O1) |

## 2. Reine Frontendbefunde (24)

| ID | Umsetzung | Nachweis |
|---|---|---|
| B1 | Auftragsbestätigung aus der Sendung senden (`pending`/`failed`), bewusst erneut senden (`sent`) und einen hängenden Versand übernehmen (`sending`, mit Prüfhinweis) — je mit Bestätigungsdialog, Doppelklickschutz und Rückmeldung aus dem `outcome`; Sperrgründe (`order_confirmation_email_*`) als Text, nie als Code — `api/adminApi.js`, `utils/adminShipmentOperations.mjs`, `AdminShipmentDetailPage.jsx` | `adminShipmentOperations.test.mjs` (B1), `api/adminApiContract.test.mjs` (B1); E2E `adminParitySession2` (B1 ×2) |
| B2 | Protokoll blättert über `limit`/`offset` (vorher `page`/`page_size`, vom Server ignoriert) — `api/adminApi.js`, `AuditLogPage.jsx` | `api/adminApiContract.test.mjs` (B2), `auditLogView.test.mjs` 4; E2E `adminParitySession2` (1440/390 px) |
| A1 | Stornoanfrage liest den Code (`code` vor `error`); ein fremder 409 ist ein eigener Fall — `utils/customerCancellation.mjs` | `customerCancellation.test.mjs` (A1) |
| A2 | Kontaktperson aus Vor-/Nachname bzw. `contactName` im ganzen Adressbuch (Titel, Zeile, Karte, Menü, Dialoge) — `utils/addressPickerView.mjs` (`addressContactPerson`), `components/addressbook/*` | `addressPickerUx.test.mjs` (A2); E2E `addressBookContactNames` (1440/390 px) |
| B3 | Rückmeldung der Zusatzmail-Wiederholung je `outcome` (nur `sent` ist Erfolg, `not_ready`/`in_progress`/`already_sent` Hinweis, `failed`/`not_found` Fehler); die Rückmeldung überlebt jetzt das Neuladen (vorher sofort gelöscht) — `utils/shipmentEmailDeliveryView.mjs`, `AdminShipmentDetailPage.jsx` | `shipmentEmailDeliveryView.test.mjs` 3/4; E2E `adminParitySession2` |
| BI3 | Erster Wareneingang eines neuen Artikels ohne Bestand ins Standardlager (bei mehreren aktiven Lagern wählbar) — `inventory/ProductDetailPage.jsx` | `warehouseView.test.mjs` 7; E2E `warehouseManagement` (1440/390 px) |
| BI11 | Ladefehler der Lagerliste ≠ „Noch kein Lager“: Fehler mit Wiederholung, kein Onboarding — `inventory/InventoryOverviewPage.jsx`, `hooks/useAllWarehouses.js` | `warehouseView.test.mjs` 2/7; E2E `warehouseManagement` (BI11) |
| BI4 | Mengen aus `details` bei `INSUFFICIENT_STOCK` / `INSUFFICIENT_BLOCKED_STOCK` im Satz — `utils/inventoryErrors.mjs` | `inventoryErrors.test.mjs` |
| A4 | 409 `PARCELSHOP_REQUIRED` → zurück zur Shopauswahl, „Es wurde nichts beauftragt.“ — vor Absicherungs- und Sammelzweig — `utils/bookingErrors.mjs`, `BookingPage.jsx` | `bookingErrors.test.mjs` (A4/A5/O1) |
| A6 | Sitzungsende am Code `SESSION_EXPIRED` (bzw. 403), nicht am Wortlaut — `utils/emailChangeView.mjs` (`endsSession`), `EmailChangeSection.jsx`, `PasswordChangeSection.jsx` | `emailChangeView.test.mjs` (A6/BP6), `dashboardAccountCommunication.test.mjs` 11 |
| BP6 | wie A6 im Partnerportal (dieselben Komponenten in `PartnerAccountPanel.jsx`) | wie A6 |
| B6 | Gesperrte Dokumenterzeugung (409/422 des Produktiv-Guards) mit Grund und fehlenden Feldern statt „erneuter Versuch möglich“ — `utils/adminInvoiceView.mjs` (`documentErrorMessage`), `AdminInvoiceDetailPage.jsx` | `adminInvoiceView.test.mjs` (B6) |
| B7 | Mail-Ausgänge `unclear`, `superseded` und `failed` + `finalize_failed` als Hinweis „Ausgang unklar“ statt „fehlgeschlagen“ — `utils/adminInvoiceView.mjs` | `adminInvoiceView.test.mjs` 11 |
| B8 | Zeile „Testmodus“ entfernt (das Feld kommt nicht, sie stand immer auf „aus“); Probelauf der Dokumenterzeugung (`checks.invoice_document_generation`) und Rechtsdokumente (`legalDocuments`) sichtbar — `utils/invoiceBackfillView.mjs`, `AdminBackfillPage.jsx` | `invoiceBackfillView.test.mjs` (B8) |
| B11 | Nur der Revisionskonflikt bekommt den Konfliktbanner; `CANCELLATION_STATUS_TRANSITION_INVALID` eigener Text — `AdminCancellationRequestDetailPage.jsx` | `adminCancellations.test.mjs` (B11) |
| B13 | 409 `SALES_PARTNER_MANAGED_SEPARATELY` beim Löschen/Anonymisieren mit eigenem Hinweis — `utils/adminCustomerView.mjs`, `AdminUserDetailPage.jsx` | `adminCustomerView.test.mjs` (B9/B13) |
| B14 | Labels für `invoice.generate_document`, `invoice.retry_document` und zwei weitere geschriebene Aktionen (`sales_partner.billing_details_viewed`, `user.business_verification`) — `AuditLogPage.jsx` | `auditLogView.test.mjs` 4; E2E `adminParitySession2` |
| BA2 | Testsendung: 1–99 Pakete (eine Grenze mit `PACKAGE_COUNT_MAX`) — `utils/salesPartnerPrelive.mjs` | `salesPartnerPrelive.test.mjs` (BA2) |
| BA3 | Abgelöste Entscheidung ohne „Rücknahme“; `reversed: 0` als Hinweis — `utils/adminSalesPartnerView.mjs`, `admin/SalesPartnerCommissionsCard.jsx` | `adminSalesPartnerView.test.mjs` (BA3) |
| BA4 | Monatsbewertungen: „abgelöst“-Marker, Spalte „Ohne gültige Paketzahl“ nur bei Werten > 0, Zusammenfassung aus der gültigen Version — `utils/adminSalesPartnerView.mjs`, `utils/adminPartnerDetailView.mjs`, `AdminSalesPartnerDetailPage.jsx` | `adminSalesPartnerView.test.mjs` (BA4) |
| BA5 | `taxNumberOrVatId` und `billingDetails` mit Label; beide Steuerzeilen markiert; kein Doppelhinweis — `utils/salesPartnerBilling.mjs`, `utils/adminSalesPartnerSettlementView.mjs` | `adminSalesPartnerSettlementView.test.mjs` (BA5/BA6) |
| BA6 | Testgutschrift: „Keine Benachrichtigung (Testgutschrift)“, kein endloses „Dokument erneut erzeugen“ — `utils/adminSalesPartnerSettlementView.mjs` | `adminSalesPartnerSettlementView.test.mjs` (BA5/BA6) |
| BA7 | Gründe `approved`/`reactivated` als „Freigabe“/„Reaktivierung“, unbekannt nie roh — `utils/adminSalesPartnerView.mjs` | `adminSalesPartnerView.test.mjs`; E2E `adminSalesPartners` Test 16 |
| BA9 | Begründungsfeld beim Ablehnen entfernt — der Server liest keins; **keine** Backendänderung — `admin/SalesPartnerStatusCard.jsx`, `utils/adminSalesPartnerView.mjs` | `adminSalesPartnerView.test.mjs` 5; E2E `adminSalesPartners` Test 16 |

## 3. Nur Integration geprüft — keine Doppelimplementierung (3)

| ID | Ergebnis |
|---|---|
| R2 | Das Frontend fragt Orte nur für formal gültige PLZ ab (`isPostalCodeQueryable`) und zeigt bei `reason: "postal_code_invalid"` (leere Liste) schlicht keine Vorschläge — keine Änderung nötig. |
| B10 | Das Stornodetail liest `shipment.serviceType`, `shipment.priceGross` und `customer.customerNumber` bereits unter diesen Namen; abgesichert mit der exakten Backendform (`adminCancellations.test.mjs`, B10). Keine Codeänderung. |
| BP2 | Im Backend als Startdiagnose gelöst; das Frontend behält seinen neutralen Hinweis „Dieser Link ist derzeit nicht verfügbar.“ Keine Änderung. **Betreiber:** Produktionswert von `APP_BASE_URL` prüfen (Register). |

## 4. Mehrlagerverwaltung (Umfang C)

`components/inventory/WarehouseManager.jsx` in der Lagerübersicht, ausschließlich mit `GET/POST/PATCH /api/kunde/warehouses`:
Liste Seite für Seite über den Server-Cursor („Weitere Lager laden“), Anlegen (Name, Kürzel, Notiz, optional Standard),
Bearbeiten (Name, Kürzel, Notiz), Standard festlegen, Deaktivieren, Aktivieren — jeweils mit Bestätigung; Sperrgründe des
Servers samt Mengen im Dialog; doppelter Name am Feld; Lade-, Fehler-, Leer- und Erfolgszustände; 44-px-Ziele auf Mobil.
Bewusst nicht: Löschen (gibt es im Backend nicht), Umbuchen zwischen Lagern, Lagerplätze.

## 5. Bei der Umsetzung zusätzlich behoben (im Umfang der Befunde)

- **B3:** Nach „Erneut versuchen“ löschte das Neuladen der Seite die Rückmeldung sofort wieder — Rücksetzen jetzt nur beim Sendungswechsel.
- **BI1:** Der Stornofehler lag hinter dem offenen Dialog und war nicht lesbar — er steht jetzt im Dialog.
- **B7/B1:** `failed` mit `errorCode: "finalize_failed"` (Anbieter hat angenommen, Status nicht gespeichert) gilt als unklar, nicht als wiederholbar.

## 6. Dokumentierte Ankeränderungen bestehender Tests

`sharedShipmentEmailOptions.test.mjs` 9, `tg22PackageBWiring.test.mjs` 8 (A5) · `movementsUx.test.mjs` B7/B8, `productUxBlocking.test.mjs` 25
(BI7, fünfter Filter) · `dashboardAccountCommunication.test.mjs` 11 (A6/BP6: Code statt Wortlaut) · `shipmentEmailDeliveryView.test.mjs` 3 (B3)
· `adminSalesPartnerView.test.mjs` 5 (BA9) · `salesPartnerPrelive.test.mjs` (BA2: 100 statt 10000 als ungültige Paketzahl).

## 7. Für Session 3

- Register im Backend fortschreiben (Status „FE erledigt“ mit diesem PR und den Nachweisen oben).
- Frontend-Deployment ist Betreiberhandlung (kein Auto-Deploy) — erst nach Merge und grüner CI auf `main`.
- Betreiberpunkte unverändert offen: R1 (Preisrechner-Domain), BP2 (Produktionswert `APP_BASE_URL`).
