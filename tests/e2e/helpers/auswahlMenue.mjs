// Kompakte Auswahlmenüs des Kundenbereichs (src/components/ui/AuswahlMenue.jsx, Premium Control System 2.0) im E2E
// bedienen — wie ein Kunde: Feld öffnen, Option anklicken. Nichts wird erzwungen (kein force, kein Entfernen von
// disabled oder aria-disabled). Die Liste hängt als Portal an <body>; Umschlag und Liste tragen beide
// data-auswahl="<name>", jede Option ihren Wert als data-wert, der Auslöser den gewählten Wert als data-wert
// ("" = noch nichts gewählt).

export const MENUE = (name) => `.ce-auswahl[data-auswahl="${name}"]`;
export const AUSLOESER = (name) => `${MENUE(name)} [role="combobox"]`;
export const LISTE = (name) => `[role="listbox"][data-auswahl="${name}"]`;
export const OPTION = (name, wert) => `${LISTE(name)} [role="option"][data-wert="${wert}"]`;

export const ausloeser = (page, name) => page.locator(AUSLOESER(name));

/** Öffnet das Menü (falls zu) und wartet auf die Liste. */
export async function oeffneMenue(page, name, { timeout = 20000 } = {}) {
  const knopf = ausloeser(page, name);
  await knopf.waitFor({ state: "visible", timeout });
  if ((await knopf.getAttribute("aria-expanded")) !== "true") await knopf.click({ timeout });
  await page.locator(LISTE(name)).waitFor({ state: "visible", timeout });
}

/** Schließt ein offenes Menü ohne Wahl (Escape, wie beim Kunden). */
export async function schliesseMenue(page, name, { timeout = 5000 } = {}) {
  const knopf = ausloeser(page, name);
  if ((await knopf.getAttribute("aria-expanded")) !== "true") return;
  await knopf.press("Escape");
  await page.locator(LISTE(name)).waitFor({ state: "detached", timeout });
}

/**
 * Wählt eine Option per Klick und wartet, bis die Liste zu ist. Ist die Option schon gewählt, schließt das Menü
 * ohne Wechsel — genau wie beim Kunden (das Bauteil meldet nur echte Wechsel).
 */
export async function waehleOption(page, name, wert, { timeout = 20000 } = {}) {
  await oeffneMenue(page, name, { timeout });
  await page.locator(OPTION(name, wert)).click({ timeout });
  await page.locator(LISTE(name)).waitFor({ state: "detached", timeout });
}

const regexText = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Die Option mit genau diesem sichtbaren Namen (exakt — ein Teilvergleich träfe auch Sätze anderer Optionen). */
export const optionNachName = (page, name, optionsName) => page.locator(`${LISTE(name)} [role="option"]`)
  .filter({ has: page.locator(".ce-auswahl-name", { hasText: new RegExp(`^${regexText(optionsName)}$`) }) });

/** Wie waehleOption, aber über den sichtbaren Namen der Option. */
export async function waehleOptionNachName(page, name, optionsName, { timeout = 20000 } = {}) {
  await oeffneMenue(page, name, { timeout });
  await optionNachName(page, name, optionsName).click({ timeout });
  await page.locator(LISTE(name)).waitFor({ state: "detached", timeout });
}

/** Der gewählte Wert am Auslöser ("" = nichts gewählt, null = kein Menü). */
export async function gewaehlterWert(page, name) {
  const knopf = ausloeser(page, name);
  if ((await knopf.count()) === 0) return null;
  return knopf.getAttribute("data-wert");
}

/** Der sichtbare Name der gewählten Option (oder der Platzhalter). */
export const gewaehlterName = (page, name) => page.locator(`${AUSLOESER(name)} .ce-auswahl-wert-text`).innerText();

/** Alle Optionen mit Wert, Name, Gesamttext, Wahl und Sperre — öffnet das Menü und schließt es wieder. */
export async function optionen(page, name) {
  await oeffneMenue(page, name);
  const liste = await page.locator(`${LISTE(name)} [role="option"]`).evaluateAll((els) => els.map((el) => ({
    wert: el.getAttribute("data-wert"),
    id: el.id,
    name: (el.querySelector(".ce-auswahl-name")?.textContent || "").replace(/\s+/g, " ").trim(),
    text: (el.textContent || "").replace(/\s+/g, " ").trim(),
    gewaehlt: el.getAttribute("aria-selected") === "true",
    gesperrt: el.getAttribute("aria-disabled") === "true",
  })));
  await schliesseMenue(page, name);
  return liste;
}
