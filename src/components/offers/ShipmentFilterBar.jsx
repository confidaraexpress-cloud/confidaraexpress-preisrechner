import { DateCalendar } from "../common/DateCalendar";
import DeliveryTimeSelect from "./DeliveryTimeSelect.jsx";
import { todayISO, addDaysISO, labelForDate, fmtShortDE } from "../../utils/date";
import { latestDeliveryFieldValue } from "../../utils/deliveryTimeView.mjs";
import { publicCarrierChipLabel } from "../../utils/carrierMap";

/* ── ShipmentFilterBar ───────────────────────────────────────────────────────
   Die gemeinsame Filterleiste von „Neue Sendung" und Versandkostenrechner:
   fünf aufklappbare Panels (Abholung/Shopabgabe · Versanddatum · Versanddienst ·
   Versandart · Späteste Lieferzeit). Bis zur Modularisierung Phase 2 stand
   dieses Markup wortgleich in BEIDEN Seiten (222 Zeilen je Seite, gemessen
   31 Zeilen Diff — davon 4 Kommentare, der Leer-Hinweis des Carrier-Panels,
   das idPrefix und Blockenden). Es ist eine reine DARSTELLUNG: sämtlicher
   Zustand, alle Handler und die Optionslisten bleiben in den Seiten und kommen
   als Props — die Filterlogik (FILTER_ONLY_FIELDS, clearFilters, calcKeyRef)
   ist bewusst NICHT Teil dieses Bauteils.

   Redesign 2026-10: keine Symbole in den Filtern. Jeder Auslöser trägt
   Beschriftung + aktuellen Wert als Text; dass er aufklappt, zeigt eine kleine,
   rein per CSS gezeichnete Klappmarke (kein Icon) und aria-expanded. Werte
   werden vollständig gezeigt — sie brechen um, statt abgeschnitten zu werden. */
export function ShipmentFilterBar({
  serviceFilterOpen, setServiceFilterOpen, selectedOption, SERVICE_OPTIONS, serviceFilter, handleServiceFilter,
  datePickerOpen, setDatePickerOpen, shippingDate, handleDateChange,
  carrierRef, carrierDropdownOpen, setCarrierDropdownOpen, carrierLabel,
  selectedPublicCarrierIds, setSelectedPublicCarrierIds, resetResults,
  publicCarriers, selectedPublicSet, handleTogglePublicCarrier,
  shippingModeOpen, setShippingModeOpen, selectedShippingMode, SHIPPING_MODE_OPTIONS, shippingModeFilter, handleShippingMode,
  latestOpen, setLatestOpen, form, handleLatestDeliveryChange, handleLatestDeliveryTimeChange, zeitOptionen,
  idPrefix, carrierEmptyHint, dateError,
}) {
  // Versanddatum als Formularfeld (Auftrag 1, P11): `data-field` ist das Ziel von
  // focusFirstError(); ein Fehler steht sichtbar unter dem Auslöser und ist per
  // aria-describedby verbunden. Ohne `dateError` ist das Markup unverändert.
  const datumFehlerId = `${idPrefix || "filter"}-date-err`;
  return (
          <div className="calc-filter-bar mb-16">
            {/* Service Filter */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setServiceFilterOpen(o => !o)}
                aria-expanded={serviceFilterOpen}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Abholung / Shopabgabe</div>
                    <div className="service-filter-trigger-val">{selectedOption.label}</div>
                  </div>
                </div>
                <span className={`service-filter-chevron ${serviceFilterOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {serviceFilterOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Abholung / Shopabgabe">
                  {SERVICE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ce-wahl ce-wahl--zeile ${serviceFilter === opt.id ? "selected" : ""}`}
                      onClick={() => handleServiceFilter(opt.id)}
                      role="radio"
                      aria-checked={serviceFilter === opt.id}
                    >
                      <span className="service-filter-radio" aria-hidden="true" />
                      <div className="service-filter-option-text">
                        <div className="service-filter-option-label">{opt.label}</div>
                        <div className="service-filter-option-desc">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Versanddatum */}
            <div className={`calc-panel${dateError ? " calc-panel--error" : ""}`}>
              <button
                type="button"
                className="service-filter-trigger"
                onClick={() => setDatePickerOpen(o => !o)}
                aria-expanded={datePickerOpen}
                data-field="shippingDate"
                aria-invalid={dateError ? "true" : undefined}
                aria-describedby={dateError ? datumFehlerId : undefined}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Versanddatum</div>
                    <div className="service-filter-trigger-val">{shippingDate ? labelForDate(shippingDate) : "Bitte Datum wählen"}</div>
                  </div>
                </div>
                <span className={`service-filter-chevron ${datePickerOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {datePickerOpen && (
                <div className="date-picker-body">
                  <div className="date-quick-options ce-segment">
                    <button className={`date-quick-btn ce-segment-option ${shippingDate === todayISO()    ? "active" : ""}`} onClick={() => handleDateChange(todayISO())}>Heute</button>
                    <button className={`date-quick-btn ce-segment-option ${shippingDate === addDaysISO(1) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(1))}>Morgen</button>
                    <button className={`date-quick-btn ce-segment-option ${shippingDate === addDaysISO(2) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(2))}>Übermorgen</button>
                  </div>
                  <DateCalendar
                    value={shippingDate}
                    onSelect={handleDateChange}
                    minDate={todayISO()}
                    onClose={() => setDatePickerOpen(false)}
                  />
                </div>
              )}
              {dateError && <span className="field-error calc-panel-error" id={datumFehlerId}>{dateError}</span>}
            </div>

            {/* Carrier Filter */}
            <div className="calc-panel" ref={carrierRef}>
              <button
                className="service-filter-trigger"
                onClick={() => setCarrierDropdownOpen(o => !o)}
                aria-expanded={carrierDropdownOpen}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Versanddienst</div>
                    <div className="service-filter-trigger-val">{carrierLabel}</div>
                  </div>
                  {selectedPublicCarrierIds.length > 0 && (
                    <span className="carrier-badge">{selectedPublicCarrierIds.length}</span>
                  )}
                </div>
                <span className={`service-filter-chevron ${carrierDropdownOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {carrierDropdownOpen && (
                <div className="carrier-dropdown" role="group" aria-label="Versanddienst">
                  {/* Mehrfachauswahl: quadratisches Auswahlfeld; die Einfachauswahl daneben
                      („Abholung / Shopabgabe", „Versandart") ist im Kundenbereich eine Navy-Wahl
                      mit Haken (`ce-wahl`, reine Darstellung). Bleibt bewusst so — role="checkbox"
                      trägt die Mehrfachauswahl-Semantik; Chip-Key = publicCarrier.id, Label =
                      publicCarrier.name („other" → „Versanddienstleister"). */}
                  <button
                    type="button"
                    className={`service-filter-option service-filter-option--check ${selectedPublicCarrierIds.length === 0 ? "selected" : ""}`}
                    role="checkbox"
                    aria-checked={selectedPublicCarrierIds.length === 0}
                    onClick={() => { setSelectedPublicCarrierIds([]); resetResults(); }}
                  >
                    <span className="service-filter-check" aria-hidden="true" />
                    <div className="service-filter-option-text">
                      <div className="service-filter-option-label">Alle Dienstleister</div>
                    </div>
                  </button>
                  {publicCarriers.length === 0 ? (
                    <div className="carrier-empty-hint">{carrierEmptyHint}</div>
                  ) : (
                    <>
                      <div className="carrier-divider" />
                      {publicCarriers.map(pc => (
                        <button
                          key={pc.id}
                          type="button"
                          className={`service-filter-option service-filter-option--check ${selectedPublicSet.has(pc.id) ? "selected" : ""}`}
                          role="checkbox"
                          aria-checked={selectedPublicSet.has(pc.id)}
                          onClick={() => handleTogglePublicCarrier(pc.id)}
                        >
                          <span className="service-filter-check" aria-hidden="true" />
                          <div className="service-filter-option-text">
                            <div className="service-filter-option-label">{publicCarrierChipLabel(pc)}</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Versandart */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setShippingModeOpen(o => !o)}
                aria-expanded={shippingModeOpen}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Versandart</div>
                    <div className="service-filter-trigger-val">{selectedShippingMode.label}</div>
                  </div>
                </div>
                <span className={`service-filter-chevron ${shippingModeOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {shippingModeOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Versandart">
                  {SHIPPING_MODE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ce-wahl ce-wahl--zeile ${shippingModeFilter === opt.id ? "selected" : ""}`}
                      onClick={() => handleShippingMode(opt.id)}
                      role="radio"
                      aria-checked={shippingModeFilter === opt.id}
                    >
                      <span className="service-filter-radio" aria-hidden="true" />
                      <div className="service-filter-option-text">
                        <div className="service-filter-option-label">{opt.label}</div>
                        <div className="service-filter-option-desc">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Späteste Lieferzeit — collapsible (reiner Client-Filter, kein Recalc) ── */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setLatestOpen(o => !o)}
                aria-expanded={latestOpen}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Späteste Lieferzeit</div>
                    <div className="service-filter-trigger-val">{latestDeliveryFieldValue(
                      form.latestDeliveryDate ? fmtShortDE(form.latestDeliveryDate) : "",
                      form.latestDeliveryTime,
                    )}</div>
                  </div>
                </div>
                <span className={`service-filter-chevron ${latestOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {latestOpen && (
                <div className="date-picker-body date-picker-body--latest">
                  <div className="date-quick-options ce-segment">
                    <button className={`date-quick-btn ce-segment-option ${!form.latestDeliveryDate ? "active" : ""}`} onClick={() => handleLatestDeliveryChange("")}>Beliebig</button>
                  </div>
                  <DateCalendar
                    value={form.latestDeliveryDate}
                    onSelect={handleLatestDeliveryChange}
                    minDate={shippingDate}
                    onClose={() => setLatestOpen(false)}
                  />
                  <DeliveryTimeSelect
                    options={zeitOptionen}
                    value={form.latestDeliveryTime}
                    onChange={handleLatestDeliveryTimeChange}
                    hasDate={!!form.latestDeliveryDate}
                    idPrefix={idPrefix}
                  />
                </div>
              )}
            </div>
          </div>
  );
}
