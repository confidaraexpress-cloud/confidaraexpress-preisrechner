// Beispieldokumente der Kundenbereich-Demo: ein schlichtes, gültiges PDF (A4, Helvetica) mit dem Aufdruck
// „SIMULATION“. Kein Versandlabel, keine Rechnung, keine Auftragsbestätigung — und das steht auf jeder Seite.
// Rein und ohne Abhängigkeiten; Umlaute über WinAnsiEncoding (Latin-1).

const BREITE = 595;
const HOEHE = 842;

// Text für einen PDF-String: nur Latin-1, Klammern und Backslash maskiert.
function pdfText(text) {
  let aus = "";
  for (const zeichen of String(text)) {
    const code = zeichen.codePointAt(0);
    const sicher = code === 0x2013 || code === 0x2014 ? "-" : code === 0x201e || code === 0x201c ? '"' : code > 255 ? "?" : zeichen;
    aus += sicher === "(" || sicher === ")" || sicher === "\\" ? `\\${sicher}` : sicher;
  }
  return aus;
}

/**
 * Ein einseitiges Beispieldokument.
 * @param {{ titel: string, nummer?: string, zeilen?: string[] }} inhalt
 * @returns {Uint8Array}
 */
export function demoPdf({ titel, nummer = "", zeilen = [] }) {
  const inhalt = [];
  // Wasserzeichen: diagonal, hellgrau.
  inhalt.push("q 0.9 0.92 0.95 rg BT /F2 96 Tf 0.7071 0.7071 -0.7071 0.7071 150 230 Tm (SIMULATION) Tj ET Q");
  // Kopf: Marke und Hinweis.
  inhalt.push(`BT 0.004 0.106 0.333 rg /F2 18 Tf 56 780 Td (${pdfText("ConfidaraExpress")}) Tj ET`);
  inhalt.push(`BT 0.6 0.1 0.1 rg /F2 11 Tf 56 760 Td (${pdfText("SIMULATION – Beispieldokument aus der Kundenbereich-Demo")}) Tj ET`);
  inhalt.push(`BT 0.043 0.082 0.196 rg /F2 22 Tf 56 712 Td (${pdfText(titel)}) Tj ET`);
  if (nummer) inhalt.push(`BT 0.3 0.35 0.45 rg /F1 12 Tf 56 690 Td (${pdfText(nummer)}) Tj ET`);
  let y = 650;
  for (const zeile of zeilen) {
    inhalt.push(`BT 0.043 0.082 0.196 rg /F1 11 Tf 56 ${y} Td (${pdfText(zeile)}) Tj ET`);
    y -= 18;
  }
  inhalt.push(`BT 0.35 0.4 0.5 rg /F1 9 Tf 56 60 Td (${pdfText("Keine echte Buchung, keine Rechnung, kein Versandlabel. Es wurde kein Versanddienstleister beauftragt.")}) Tj ET`);
  const strom = inhalt.join("\n");

  const objekte = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${BREITE} ${HOEHE}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${strom.length} >>\nstream\n${strom}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const lagen = [];
  objekte.forEach((obj, i) => {
    lagen.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (const lage of lagen) pdf += `${String(lage).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
