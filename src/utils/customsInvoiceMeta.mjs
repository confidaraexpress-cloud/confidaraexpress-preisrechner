// Reiner, framework-freier Helfer (.mjs, wie kpis.mjs/bookingGate.mjs): baut die
// OPTIONALEN Zollrechnungs-Metadaten für customsData (customs_invoice) an EINER
// testbaren Stelle. Deckt exakt die Regeln des Slice ab:
//   - invoiceNumber : getrimmt; leer/nur-Whitespace → Feld weglassen
//   - invoiceDate   : getrimmt; leer → Feld weglassen (Kalendergültigkeit prüft die
//                     BookingPage-Freigabe + das Backend — hier reine Shape-Logik)
//   - remarks       : ein einzelner Hinweis → Array mit genau EINEM getrimmten Eintrag;
//                     leer/nur-Whitespace → Feld weglassen
// Es entstehen NIE leere Strings, NIE null, NIE ein invoiceMode/document/upload-Key.
// Betrifft ausschließlich die Zollrechnung — niemals Kundenpreis/-rechnung, MwSt,
// Zahlungsziel oder Versicherung.
export function buildCustomsInvoiceMeta({ invoiceNumber, invoiceDate, invoiceRemark } = {}) {
  const meta = {};
  const num = typeof invoiceNumber === "string" ? invoiceNumber.trim() : "";
  if (num) meta.invoiceNumber = num;
  const date = typeof invoiceDate === "string" ? invoiceDate.trim() : "";
  if (date) meta.invoiceDate = date;
  const remark = typeof invoiceRemark === "string" ? invoiceRemark.trim() : "";
  if (remark) meta.remarks = [remark];
  return meta;
}
