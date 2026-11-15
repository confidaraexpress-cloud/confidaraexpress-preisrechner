/* Sendungsaktionen hinter „Weitere Aktionen“ (Bediensystem D3, Betreiberentscheidung 2026-11-14).

   In der Sendungsliste bleibt nur „Tracking“ als Taste sichtbar; „Dokumente“ und „Stornierung anfragen“ liegen im
   Menü der Zeile (src/components/dashboard/ShipmentsList.jsx, WeitereSendungsAktionen). Die Helfer bedienen das Menü
   wie ein Mensch — Taste klicken, Eintrag klicken — und gehen dabei über den Vertrag der Menütaste (aria-expanded,
   role="menu", role="menuitem"), statt einen Eintrag am Menü vorbei anzusprechen.

   `bereich` ist die Seite, eine Tabellenzeile oder eine Karte: Das Menü liegt im DOM der Zeile (fixiert positioniert,
   nicht in einem Portal), Zeilen-Locatoren finden ihre Einträge also selbst. */

/** Zugänglicher Name der Menütaste einer Sendung: „Weitere Aktionen für Sendung <Nummer>“ (ohne Nummer: „… für diese Sendung“). */
export const SENDUNGS_MENUE = /^Weitere Aktionen für (Sendung |diese Sendung)/;

const eintragsName = (eintrag) => (typeof eintrag === "string" ? { name: eintrag, exact: true } : { name: eintrag });

/** Öffnet das Menü „Weitere Aktionen“ im Bereich und gibt das offene Menü zurück. */
export async function oeffneWeitereAktionen(bereich, { timeout = 10000 } = {}) {
  const taste = bereich.getByRole("button", { name: SENDUNGS_MENUE }).first();
  await taste.waitFor({ timeout });
  if ((await taste.getAttribute("aria-expanded")) !== "true") await taste.click({ timeout });
  const menue = bereich.getByRole("menu").first();
  await menue.waitFor({ timeout });
  return menue;
}

/** Wählt einen Eintrag aus „Weitere Aktionen“, z. B. „Dokumente“ oder „Stornierung anfragen“. */
export async function weitereAktion(bereich, eintrag, { timeout = 10000 } = {}) {
  const menue = await oeffneWeitereAktionen(bereich, { timeout });
  await menue.getByRole("menuitem", eintragsName(eintrag)).click({ timeout });
}

/** Die Einträge, die das Menü des Bereichs anbietet (in Reihenfolge); schließt das Menü danach mit Escape. */
export async function weitereAktionenEintraege(bereich, { timeout = 10000 } = {}) {
  const menue = await oeffneWeitereAktionen(bereich, { timeout });
  const namen = (await menue.getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
  await menue.page().keyboard.press("Escape");
  await menue.waitFor({ state: "detached", timeout });
  return namen;
}
