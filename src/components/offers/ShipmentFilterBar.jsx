import { Icon } from "../ui/Icon";
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
   ist bewusst NICHT Teil dieses Bauteils. */
export function ShipmentFilterBar({
  serviceFilterOpen, setServiceFilterOpen, selectedOption, SERVICE_OPTIONS, serviceFilter, handleServiceFilter,
  datePickerOpen, setDatePickerOpen, shippingDate, handleDateChange,
  carrierRef, carrierDropdownOpen, setCarrierDropdownOpen, carrierLabel,
  selectedPublicCarrierIds, setSelectedPublicCarrierIds, resetResults,
  publicCarriers, selectedPublicSet, handleTogglePublicCarrier,
  shippingModeOpen, setShippingModeOpen, selectedShippingMode, SHIPPING_MODE_OPTIONS, shippingModeFilter, handleShippingMode,
  latestOpen, setLatestOpen, form, handleLatestDeliveryChange, handleLatestDeliveryTimeChange, zeitOptionen,
  idPrefix, carrierEmptyHint,
}) {
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
                  <Icon n={selectedOption.icon} s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Abholung / Shopabgabe</div>
                    <div className="service-filter-trigger-val">{selectedOption.label}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${serviceFilterOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {serviceFilterOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Abholung / Shopabgabe">
                  {SERVICE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ${serviceFilter === opt.id ? "selected" : ""}`}
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
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setDatePickerOpen(o => !o)}
                aria-expanded={datePickerOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="clock" s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Versanddatum</div>
                    <div className="service-filter-trigger-val">{labelForDate(shippingDate)}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${datePickerOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {datePickerOpen && (
                <div className="date-picker-body">
                  <div className="date-quick-options">
                    <button className={`date-quick-btn ${shippingDate === todayISO()    ? "active" : ""}`} onClick={() => handleDateChange(todayISO())}>Heute</button>
                    <button className={`date-quick-btn ${shippingDate === addDaysISO(1) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(1))}>Morgen</button>
                    <button className={`date-quick-btn ${shippingDate === addDaysISO(2) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(2))}>Übermorgen</button>
                  </div>
                  <DateCalendar
                    value={shippingDate}
                    onSelect={handleDateChange}
                    minDate={todayISO()}
                    onClose={() => setDatePickerOpen(false)}
                  />
                </div>
              )}
            </div>

            {/* Carrier Filter */}
            <div className="calc-panel" ref={carrierRef}>
              <button
                className="service-filter-trigger"
                onClick={() => setCarrierDropdownOpen(o => !o)}
                aria-expanded={carrierDropdownOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="truck" s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Versanddienst</div>
                    <div className="service-filter-trigger-val">{carrierLabel}</div>
                  </div>
                  {selectedPublicCarrierIds.length > 0 && (
                    <span className="carrier-badge">{selectedPublicCarrierIds.length}</span>
                  )}
                </div>
                <div className={`service-filter-chevron ${carrierDropdownOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {carrierDropdownOpen && (
                <div className="carrier-dropdown" role="group" aria-label="Versanddienst">
                  {/* Multi-Select mit Premium-Radio-Optik (wie „Versandart"): runder
                      Auswahlkreis + Label. role="checkbox" behält die Mehrfachauswahl-
                      Semantik; Chip-Key = publicCarrier.id, Label = publicCarrier.name
                      („other" → „Versanddienstleister"). */}
                  <button
                    type="button"
                    className={`service-filter-option service-filter-option--radio ${selectedPublicCarrierIds.length === 0 ? "selected" : ""}`}
                    role="checkbox"
                    aria-checked={selectedPublicCarrierIds.length === 0}
                    onClick={() => { setSelectedPublicCarrierIds([]); resetResults(); }}
                  >
                    <span className="service-filter-radio" aria-hidden="true" />
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
                          className={`service-filter-option service-filter-option--radio ${selectedPublicSet.has(pc.id) ? "selected" : ""}`}
                          role="checkbox"
                          aria-checked={selectedPublicSet.has(pc.id)}
                          onClick={() => handleTogglePublicCarrier(pc.id)}
                        >
                          <span className="service-filter-radio" aria-hidden="true" />
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
                  <Icon n={selectedShippingMode.icon} s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Versandart</div>
                    <div className="service-filter-trigger-val">{selectedShippingMode.label}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${shippingModeOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {shippingModeOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Versandart">
                  {SHIPPING_MODE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ${shippingModeFilter === opt.id ? "selected" : ""}`}
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
                  <Icon n="calendar" s={15} c="var(--ce-color-brand-ink)" />
                  <div>
                    <div className="service-filter-trigger-title">Späteste Lieferzeit</div>
                    <div className="service-filter-trigger-val">{latestDeliveryFieldValue(
                      form.latestDeliveryDate ? fmtShortDE(form.latestDeliveryDate) : "",
                      form.latestDeliveryTime,
                    )}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${latestOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {latestOpen && (
                <div className="date-picker-body date-picker-body--latest">
                  <div className="date-quick-options">
                    <button className={`date-quick-btn ${!form.latestDeliveryDate ? "active" : ""}`} onClick={() => handleLatestDeliveryChange("")}>Beliebig</button>
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
