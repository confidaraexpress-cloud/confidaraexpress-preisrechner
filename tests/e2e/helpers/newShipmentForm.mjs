/* Gemeinsames Ausfüllen von „Neue Sendung" für die Browser-E2E-Suiten.
 *
 * ── Warum es diese Datei gibt ─────────────────────────────────────────────
 * Zehn Suiten trugen eine wörtlich kopierte Hilfsfunktion, die das Formular
 * über PLATZHALTERTEXTE ansprach:
 *
 *     page.getByPlaceholder("5", { exact: true }).fill("5.5")   // Gewicht
 *
 * Mit dem Paket „Paketmaße sind Pflicht" haben die vier Maßfelder bewusst ein
 * „z. B." vor ihr Beispiel bekommen — eine nackte „5" in einem Zahlenfeld ist
 * von einer echten Eingabe nicht zu unterscheiden. Diese Produktänderung war
 * richtig; sie hat zehn Suiten gleichzeitig zerlegt, weil zehn Kopien
 * derselben Annahme existierten.
 *
 * Ein Platzhalter ist BESCHRIFTUNGSTEXT: er darf sich jederzeit ändern und ist
 * deshalb kein tragfähiger Selektor. Jedes Feld des Formulars trägt eine
 * stabile, im Produktcode ausdrücklich vergebene `id` (`ns-…`, siehe
 * `addrField`/`zipField`/`countrySelect` in NewShipmentPage.jsx). Diese Datei
 * spricht ausschließlich über diese ids.
 *
 * Aus demselben Grund verschwinden hier die positionsbasierten Zugriffe der
 * Art `.booking-addr-grid > div nth(1) input.field-input nth(4)`: die zählten
 * Eingabefelder in der DOM-Reihenfolge und hätten bei jedem eingefügten Feld
 * still das falsche getroffen.
 *
 * ── Was diese Datei NICHT tut ─────────────────────────────────────────────
 * Sie umgeht nichts. Der CTA bleibt genau so lange deaktiviert, wie das
 * Produkt es vorsieht; es wird nichts erzwungen, nichts geklickt, was
 * deaktiviert ist, und keine Pflichtprüfung ausgehebelt. `berechneAngebote()`
 * prüft ausdrücklich, dass der CTA bedienbar IST, und schlägt sonst mit dem
 * sichtbaren Hinweis fehl — statt ihn per `force` anzuklicken.
 *
 * Wer den GESPERRTEN Zustand prüfen will, übergibt einzelne Paketfelder als
 * `""`: `fuellePaket(page, { ...STANDARD_PAKET, height: "" })` leert das Feld
 * ausdrücklich, statt es zu überspringen.
 */

/** Vollständiger, gültiger Standardvorgang. Einzelne Werte lassen sich je
 *  Suite überschreiben; die Struktur bleibt dieselbe. */
export const STANDARD_ABSENDER = Object.freeze({
  company: "Muster GmbH", fullName: "Max Mustermann",
  street: "Hauptstrasse 1", zip: "70173", city: "Berlin", country: "DE",
});

export const STANDARD_EMPFAENGER = Object.freeze({
  company: "Empfang AG", fullName: "Erika Empfaenger",
  street: "Bahnhofstrasse 9", zip: "80331", city: "Muenchen", country: "DE",
});

export const STANDARD_PAKET = Object.freeze({
  packageCount: "2", weight: "5.5", length: "40", width: "30", height: "20",
});

/* Reihenfolge mit Absicht: Land ZUERST. Die PLZ-Prüfung und ihr Beispiel
   hängen am gewählten Land — wird das Land nachträglich gesetzt, wechselt die
   Regel unter einer bereits eingetragenen PLZ. */
const ADRESSFELDER = ["country", "company", "fullName", "street", "zip", "city"];
const PAKETFELDER  = ["packageCount", "weight", "length", "width", "height"];

async function setzeFeld(page, id, wert) {
  const el = page.locator(`#${id}`);
  await el.waitFor({ state: "visible", timeout: 20000 });
  // `select` will ausgewählt, nicht befüllt werden.
  const tag = await el.evaluate((n) => n.tagName.toLowerCase());
  if (tag === "select") await el.selectOption(String(wert));
  else await el.fill(String(wert));
}

/** Füllt eine Adressseite. `seite` ist "s" (Absender) oder "r" (Empfänger). */
export async function fuelleAdresse(page, seite, adresse) {
  for (const feld of ADRESSFELDER) {
    const wert = adresse[feld];
    if (wert === undefined || wert === null) continue;   // "" ist ein gültiger Wert
    await setzeFeld(page, `ns-${seite}-${feld}`, wert);
  }
}

/** Füllt die fünf Paketfelder. Ein Feld auf `""` LEERT es ausdrücklich —
 *  so prüfen Suiten, dass der CTA ohne vollständige Maße gesperrt bleibt. */
export async function fuellePaket(page, paket = STANDARD_PAKET) {
  for (const feld of PAKETFELDER) {
    const wert = paket[feld];
    if (wert === undefined || wert === null) continue;
    await setzeFeld(page, `ns-${feld}`, wert);
  }
}

/**
 * Bringt „Neue Sendung" in einen vollständig gültigen Zustand.
 * Wartet vorher darauf, dass das Formular wirklich steht.
 */
export async function fuelleVersandformular(page, {
  absender = STANDARD_ABSENDER,
  empfaenger = STANDARD_EMPFAENGER,
  paket = STANDARD_PAKET,
} = {}) {
  await page.waitForSelector("#ns-weight", { timeout: 20000 });
  await fuelleAdresse(page, "s", absender);
  await fuelleAdresse(page, "r", empfaenger);
  await fuellePaket(page, paket);
}

/** Der Angebots-CTA. Eine Stelle, damit ein Klassenwechsel nicht wieder zehn
 *  Suiten einzeln trifft. */
export function angebotsCta(page) {
  return page.locator(".offers-calc-cta button").first();
}

/**
 * Löst die Preisberechnung aus und wartet auf die Angebotskarten.
 *
 * Prüft VORHER, dass der CTA tatsächlich bedienbar ist. Ein `force`-Klick auf
 * einen deaktivierten Knopf würde eine Produktprüfung umgehen und wäre genau
 * das, was diese Suiten aufdecken sollen — deshalb schlägt die Hilfsfunktion
 * hier lieber mit einer sprechenden Meldung fehl.
 */
export async function berechneAngebote(page, { timeout = 20000 } = {}) {
  const cta = angebotsCta(page);
  await cta.waitFor({ state: "visible", timeout });
  if (await cta.isDisabled()) {
    const hinweis = await page.locator(".offers-calc-cta").innerText().catch(() => "");
    throw new Error(
      "Der Angebots-CTA ist deaktiviert — das Formular ist unvollständig. " +
      `Sichtbarer Hinweis: ${hinweis.replace(/\s+/g, " ").trim() || "(keiner)"}`
    );
  }
  await cta.click();
  await page.waitForSelector(".offer-card", { timeout });
}

/** Wählt das erste verfügbare Angebot und wartet auf die Buchungsseite. */
export async function waehleErstesAngebot(page, { warteAuf, timeout = 20000 } = {}) {
  await page.locator(".offer-card:not(.offer-card--unavailable)").first()
    .locator("button.offer-cta-btn").click();
  if (warteAuf) await page.waitForSelector(warteAuf, { timeout });
}

/**
 * Der ganze Weg: Formular → Angebote → Buchung.
 * `warteAuf` ist der Selektor, an dem die aufrufende Suite erkennt, dass die
 * Buchungsseite steht.
 */
export async function zurBuchung(page, { warteAuf, ...rest } = {}) {
  await fuelleVersandformular(page, rest);
  await berechneAngebote(page);
  await waehleErstesAngebot(page, { warteAuf });
}

/* ── Sidebar-Navigation ───────────────────────────────────────────────────
   Die Sidebar hat seit der Umstrukturierung ZWEI Ebenen: zwei direkte
   Einträge (Übersicht, Adressbuch) plus Rechnungen, und drei aufklappbare
   Gruppen (Versand, Lager & Aufträge, Konto). Alle Gruppen starten
   GESCHLOSSEN — auch nach jedem Reload, das ist die dokumentierte Produktregel.

   Eingeklappt bleiben die Einträge zwar im DOM (sonst gäbe es nichts zu
   animieren), sind aber per `visibility: hidden` aus Fokusreihenfolge UND
   Accessibility-Baum genommen. Genau deshalb findet
   `getByRole("button", { name: "Entwürfe" })` sie nicht — das ist korrektes
   Verhalten und kein Testproblem: ein zugeklappter Bereich ist nicht bedienbar.

   Der echte Nutzerweg ist: Gruppe öffnen, dann Eintrag klicken. */
const GRUPPE_JE_EINTRAG = {
  "Neue Sendung": "Versand", "Versandkostenrechner": "Versand", "Entwürfe": "Versand",
  "Sendungen": "Versand", "Sendungsverfolgung": "Versand",
  "Lagerübersicht": "Lager & Aufträge", "Artikel": "Lager & Aufträge",
  "Bestand": "Lager & Aufträge", "Aufträge": "Lager & Aufträge",
  "Bewegungen": "Lager & Aufträge",
  "Kontoeinstellungen": "Konto", "Supportanfragen": "Konto",
};

/**
 * Navigiert über die Sidebar zu `eintrag` — inklusive Aufklappen seiner Gruppe.
 * Einträge der ersten Ebene (Übersicht, Adressbuch, Rechnungen) brauchen das
 * nicht und werden direkt geklickt.
 */
export async function ueberSidebar(page, eintrag, { timeout = 20000 } = {}) {
  const gruppe = GRUPPE_JE_EINTRAG[eintrag];
  if (gruppe) {
    // `exact: true` ist hier tragend, nicht Kosmetik: Playwright vergleicht
    // Namen sonst als Teilstring, und „Versand" steckt auch in
    // „Versandkostenrechner". Der Gruppenkopf steht zwar im DOM vor seinen
    // Einträgen, sodass `.first()` heute das Richtige träfe — aber auf eine
    // Reihenfolge zu bauen, wo ein exakter Vergleich möglich ist, ist genau
    // die Sorte Annahme, die diese Suiten schon einmal zerlegt hat.
    const kopf = page.getByRole("button", { name: gruppe, exact: true }).first();
    await kopf.waitFor({ state: "visible", timeout });
    // Höchstens eine Gruppe ist offen; ist es bereits diese, nicht erneut
    // klicken — das würde sie zuklappen.
    if ((await kopf.getAttribute("aria-expanded")) !== "true") await kopf.click();
    await page.waitForTimeout(250);   // Öffnungsanimation (200 ms)
  }
  await page.getByRole("button", { name: eintrag, exact: true }).first().click({ timeout });
}
