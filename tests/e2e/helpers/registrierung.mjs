// Bedienvertrag der Kundenregistrierung in drei Schritten — Premium UX 4.0 (Betreiberentscheidung A3, 2026-11-22).
//
// Eine Quelle für die E2E-Suiten: Schritt 1 „Zugang“ (Ansprechpartner, E-Mail, Passwort, Wiederholung), Schritt 2
// „Unternehmen“ (Firma, USt-IdNr. oder Rechtsform, Versandvolumen, Adresse), Schritt 3 „Prüfen“ (Zusammenfassung,
// Erklärungen, „Konto beantragen“). „Weiter“ prüft nur die Felder seines Schritts im Browser und sendet nichts; erst
// „Konto beantragen“ sendet die eine Anfrage POST /register. Inaktive Schritte tragen `hidden` — ihre Felder sind weder
// sichtbar noch bedienbar, deshalb führen die Suiten erst in den Schritt eines Felds.

export const SCHRITT = Object.freeze({ zugang: 0, unternehmen: 1, pruefen: 2 });

// Synthetische Werte — keine echten Personen, Firmen oder Nummern.
export const STANDARD = Object.freeze({
  name: "Max Mustermann",
  email: "einkauf@muster-logistik.de",
  passwort: "EinSicheresPasswort2026",
  firma: "Muster Logistik GmbH",
  ustId: "DE123456789",
  volumen: "11_50",
});

export const weiterKnopf = (page) => page.locator("button.auth-reg-weiter");
export const absendeKnopf = (page) => page.locator("button.auth-reg-absenden");
export const zurueckKnopf = (page) => page.locator("button.auth-reg-zurueck");
export const sichtbarerSchritt = (page) => page.locator(".auth-reg-schritt:not([hidden])");

/** Aktueller Schritt (0–2) laut Schrittleiste (aria-current="step"); -1 ohne Leiste. */
export function aktuellerSchritt(page) {
  return page.locator(".auth-reg-leiste > li").evaluateAll(
    (punkte) => punkte.findIndex((li) => li.getAttribute("aria-current") === "step"));
}

export async function warteAufSchritt(page, schritt, { timeout = 5000 } = {}) {
  await page.waitForFunction(
    (z) => document.querySelectorAll(".auth-reg-leiste > li")[z]?.getAttribute("aria-current") === "step",
    schritt, { timeout });
}

/** „Weiter“ — erwartet den nächsten Schritt. Bleibt das Formular stehen, nennt der Fehler die Meldungen des Schritts. */
export async function weiter(page) {
  const vorher = await aktuellerSchritt(page);
  await weiterKnopf(page).click();
  try {
    await warteAufSchritt(page, vorher + 1);
  } catch {
    const meldungen = await sichtbarerSchritt(page).locator(".auth-field-error").allInnerTexts();
    throw new Error(`„Weiter“ blieb in Schritt ${vorher + 1}: ${JSON.stringify(meldungen)}`);
  }
}

/** Zurück in einen erledigten Schritt — über dessen Knopf in der Schrittleiste. */
export async function zurueckZu(page, schritt) {
  await page.locator(".auth-reg-leiste > li").nth(schritt).locator("button").click();
  await warteAufSchritt(page, schritt);
}

/** Schritt 1 füllen; die Wiederholung ist das Passwort, wenn nicht anders angegeben. */
export async function fuelleZugang(page, werte = {}) {
  const w = { ...STANDARD, ...werte };
  await page.fill("#reg-name", w.name);
  await page.fill("#reg-email", w.email);
  await page.fill("#reg-password", w.passwort);
  await page.fill("#reg-password-repeat", w.wiederholung ?? w.passwort);
}

/** Schritt 2 füllen; `ustId: null` bzw. `volumen: null` lassen das Feld leer. Das Versandvolumen wird VOR der USt-IdNr.
 *  gewählt: eine ungültige Nummer zeigt ihren Fehler beim Verlassen des Felds und verschiebt die Felder darunter. */
export async function fuelleUnternehmen(page, werte = {}) {
  const w = { ...STANDARD, ...werte };
  await page.fill("#reg-company", w.firma);
  if (w.volumen !== null) await page.locator("#reg-volume").selectOption(w.volumen);
  if (w.ustId !== null) await page.fill("#reg-vat", w.ustId);
}

/** Bis „Prüfen“: Zugang füllen, weiter, Unternehmen füllen, weiter. */
export async function bisPruefen(page, werte = {}) {
  await fuelleZugang(page, werte);
  await weiter(page);
  await fuelleUnternehmen(page, werte);
  await weiter(page);
}

/** Beide Erklärungen anhaken — die Kästchen selbst: ein Klick auf den AGB-Link schaltet bewusst nicht um. */
export async function erklaerungenAnhaken(page) {
  await page.click("#reg-business .auth-checkbox");
  await page.click("#reg-terms .auth-checkbox");
}

/** Der ganze Weg bis zum Absenden: genau eine Anfrage POST /register. */
export async function registrierungAbsenden(page, werte = {}) {
  await bisPruefen(page, werte);
  await erklaerungenAnhaken(page);
  await absendeKnopf(page).click();
}
