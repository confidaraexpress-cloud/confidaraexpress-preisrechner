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

import { isPostalCodeQueryable, isStreetQueryable, isValidationReady, streetQueryText } from "../../../src/utils/addressValidationView.mjs";

/** Vollständiger, gültiger Standardvorgang. Einzelne Werte lassen sich je
 *  Suite überschreiben; die Struktur bleibt dieselbe. */
export const STANDARD_ABSENDER = Object.freeze({
  company: "Muster GmbH", firstName: "Max", lastName: "Mustermann",
  email: "max@example.com", phone: "+49301234567",
  street: "Hauptstrasse 1", zip: "70173", city: "Berlin", country: "DE",
});

export const STANDARD_EMPFAENGER = Object.freeze({
  company: "Empfang AG", firstName: "Erika", lastName: "Empfaenger",
  email: "erika@example.com", phone: "+49891234567",
  street: "Bahnhofstrasse 9", zip: "80331", city: "Muenchen", country: "DE",
});

export const STANDARD_PAKET = Object.freeze({
  packageCount: "2", weight: "5.5", length: "40", width: "30", height: "20",
});

/* Reihenfolge mit Absicht: Land ZUERST. Die PLZ-Prüfung und ihr Beispiel
   hängen am gewählten Land — wird das Land nachträglich gesetzt, wechselt die
   Regel unter einer bereits eingetragenen PLZ. */
// `state` steht NACH `country`: das Feld erscheint erst, wenn ein Land mit Bundesstaatpflicht
// (US/CA) gewählt ist. Bestehende Suiten übergeben es nicht — `fuelleAdresse` überspringt jeden
// undefined-Wert, ihr Ablauf bleibt damit unverändert.
// Seit dem Versandkontaktvertrag steht die Kontaktperson STRUKTURIERT im Formular, und
// E-Mail und Telefon sind Pflichtfelder. Das frühere kombinierte `fullName` gibt es als
// Eingabefeld nicht mehr — es steht deshalb auch hier nicht mehr, sonst liefe jede Suite
// in einen Timeout auf eine id, die die Seite gar nicht rendert.
//
// Genau dafür gibt es diese Datei: die Produktänderung ist an EINER Stelle nachgezogen,
// nicht in zehn Kopien.
const ADRESSFELDER = ["country", "state", "company", "firstName", "lastName",
                      "email", "phone", "street", "zip", "city"];
const PAKETFELDER  = ["packageCount", "weight", "length", "width", "height"];

/* Die beiden Sendungsangaben, die VOR dem Angebotsvergleich erhoben werden: Inhalt und
   Warenwert. Sie sind Pflicht, weil sie den Preis mitbestimmen — ohne sie bleibt der CTA
   gesperrt, und das ist Produktverhalten, kein Testproblem.

   TG22 Residential: die Adressartfragen stehen nicht mehr im Formular. Die Art der
   Lieferadresse wird erst NACH der Angebotsauswahl auf der Buchungsseite gewählt — und nur
   für ein Angebot, das sie braucht (helpers/residentialPriceInputs.mjs).

   Auch hier gilt die Regel dieser Datei: EINE Stelle. Die vorherige Fassung dieses
   Helfers hätte nach der Produktänderung jede Suite gleichzeitig scheitern lassen, die
   „Angebote vergleichen" klickt. */
export const STANDARD_SENDUNGSANGABEN = Object.freeze({
  declaredContent: "Ersatzteile",
  declaredGoodsValue: "250",
});

/** Füllt Inhalt und Warenwert. Ein Feld auf `null` bleibt ausdrücklich leer — so prüft eine
 *  Suite den gesperrten Zustand, ohne den CTA zu erzwingen. Weitere Schlüssel (etwa eine
 *  Adressart aus einer älteren Suite) werden ignoriert: das Formular kennt sie nicht mehr. */
export async function fuelleSendungsangaben(page, angaben = STANDARD_SENDUNGSANGABEN) {
  for (const feld of ["declaredContent", "declaredGoodsValue"]) {
    const wert = angaben[feld];
    if (wert === undefined || wert === null) continue;
    await setzeFeld(page, `ns-${feld}`, wert);
  }
}

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
 *  so prüfen Suiten, dass ohne vollständige Maße kein Request hinausgeht. */
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
 *
 * Und danach darauf, dass die Adresshilfe der Eingabe zur Ruhe gekommen ist: seit 2026-10-14
 * prüft das Formular eine vollständige Anschrift nach einer Ruhesekunde automatisch und zeigt
 * das Ergebnis über den Angeboten an. Ein Kunde füllt danach noch die Paketangaben aus; ein Test
 * klickt sofort — die Statuszeile käme dann erst NACH den Angebotskarten und verschöbe die Seite
 * mitten in einer Messung. Abgewartet wird bestmöglich (Zeitlimit ohne Fehler): eine Suite, deren
 * Attrappe die Adressrouten als „nicht abgedeckt“ beantwortet, löst weniger Anfragen aus — für
 * sie gibt es nichts abzuwarten. Wer ein exaktes Beobachtungsfenster braucht, nutzt weiterhin
 * `adressvorschlaegeAbgeschlossen` (dort mit Fehler bei Zeitüberschreitung).
 */
export async function fuelleVersandformular(page, {
  absender = STANDARD_ABSENDER,
  empfaenger = STANDARD_EMPFAENGER,
  paket = STANDARD_PAKET,
  sendungsangaben = STANDARD_SENDUNGSANGABEN,
} = {}) {
  await page.waitForSelector("#ns-weight", { timeout: 20000 });
  const adresshilfe = adressvorschlaegeAbgeschlossen(page, { absender, empfaenger, timeout: 4000 });
  await fuelleAdresse(page, "s", absender);
  await fuelleAdresse(page, "r", empfaenger);
  await fuellePaket(page, paket);
  await fuelleSendungsangaben(page, sendungsangaben);
  await adresshilfe.catch(() => {});
}

/* ── Die Adressvorschläge der Eingabe abwarten ─────────────────────────────
 * „Neue Sendung" fragt je Adresse (Absender, Empfänger) ENTPRELLT Orte zur PLZ
 * und Straßen zu PLZ, Ort und Straßenname ab (src/hooks/useAddressValidation.js,
 * 300 ms nach der letzten Änderung). Diese Anfragen gehören zur EINGABE.
 *
 * Eine Suite, die Requests einer späteren Bedienung zuordnet — etwa „ein reiner
 * Anzeigeschalter löst keinen Request aus" —, darf ihr Beobachtungsfenster erst
 * öffnen, wenn genau diese Anfragen abgeschlossen sind. Sonst fallen sie hinein,
 * sobald die Angebote schneller erscheinen als die Entprellzeit: so geschehen in
 * vatDisplayContract N7 (Frontend-CI auf b03e778; lokal 2 von 8 Läufen, Angebote
 * nach rund 70 ms statt rund 430 ms). Die Anfragen trugen genau die Werte des
 * Formulars, kamen auch OHNE Umschalten, und nach ihrem Abschluss blieb
 * viermaliges Umschalten ohne jeden Request.
 *
 * Gewartet wird auf ein EREIGNIS, nicht auf eine Zeit: je erwarteter Abfrage mit
 * den ENDGÜLTIGEN Werten auf `requestfinished` oder `requestfailed` (das Formular
 * bricht eine laufende Abfrage bei einer Adressänderung selbst ab). Welche
 * Abfragen entstehen, entscheiden dieselben Regeln wie im Produkt
 * (src/utils/addressValidationView.mjs) — hier entsteht keine zweite Fassung.
 *
 * VOR dem Ausfüllen anlegen, danach abwarten — sonst kann ein bereits
 * abgeschlossenes Ereignis verpasst werden:
 *
 *     const adressen = adressvorschlaegeAbgeschlossen(page);
 *     await fuelleVersandformular(page, …);
 *     …
 *     await adressen;
 */
export function erwarteteAdressvorschlaege({ absender = STANDARD_ABSENDER, empfaenger = STANDARD_EMPFAENGER } = {}) {
  const liste = [];
  for (const [seite, a] of [["Absender", absender], ["Empfänger", empfaenger]]) {
    if (!a) continue;
    if (isPostalCodeQueryable(a.country, a.zip)) {
      liste.push({
        name: `${seite}: Orte zu ${a.zip}`, pfad: "/api/address/localities",
        werte: { country: String(a.country), postalCode: String(a.zip) },
      });
    }
    if (isStreetQueryable(a.country, a.zip, a.city, a.street)) {
      // Gesucht wird mit der vollständigen Eingabe (Straße UND Hausnummer). PLZ und Ort
      // grenzen ein, wenn sie beim Absenden schon im Formular stehen — das hängt vom
      // Tempo der Eingabe ab und wird deshalb nicht verglichen.
      liste.push({
        name: `${seite}: Straßen zu ${a.zip}`, pfad: "/api/address/streets",
        werte: { country: String(a.country), street: streetQueryText(a.street) },
      });
    }
    // Die Gesamtprüfung läuft automatisch, sobald die Anschrift vollständig aussieht und
    // eine Sekunde ruht (POST ohne Query — gezählt wird je Adresse ein Aufruf).
    if (isValidationReady({ country: a.country, postalCode: a.zip, city: a.city, street: a.street })) {
      liste.push({ name: `${seite}: Adressprüfung`, pfad: "/api/address/validate", werte: {} });
    }
  }
  return liste;
}

const passtZu = (erwartung, url) => url.pathname.endsWith(erwartung.pfad)
  && Object.entries(erwartung.werte).every(([schluessel, wert]) => url.searchParams.get(schluessel) === wert);

export function adressvorschlaegeAbgeschlossen(page, { absender, empfaenger, timeout = 15000 } = {}) {
  const offen = erwarteteAdressvorschlaege({ absender, empfaenger });
  const fertig = new Promise((resolve, reject) => {
    if (offen.length === 0) { resolve(); return; }
    let timer = null;
    const loesen = () => {
      clearTimeout(timer);
      page.off("requestfinished", erledigt);
      page.off("requestfailed", erledigt);
    };
    function erledigt(request) {
      let url;
      try { url = new URL(request.url()); } catch { return; }
      const i = offen.findIndex((e) => passtZu(e, url));
      if (i < 0) return;
      offen.splice(i, 1);
      if (offen.length === 0) { loesen(); resolve(); }
    }
    page.on("requestfinished", erledigt);
    page.on("requestfailed", erledigt);
    timer = setTimeout(() => {
      loesen();
      reject(new Error(`Adressvorschläge der Eingabe nicht abgeschlossen: ${offen.map((e) => e.name).join(", ")}`));
    }, timeout);
  });
  // Als behandelt markieren: der Aufrufer erhält einen Fehler erst beim `await`, nie als
  // unbehandelte Ablehnung zwischen Anlegen und Abwarten.
  fertig.catch(() => {});
  return fertig;
}

/** Der Angebots-CTA. Eine Stelle, damit ein Klassenwechsel nicht wieder zehn
 *  Suiten einzeln trifft. */
export function angebotsCta(page) {
  return page.locator(".offers-calc-cta button").first();
}

/**
 * Löst die Preisberechnung aus und wartet auf die Angebotskarten.
 *
 * Seit Auftrag 1 (P11, 2026-10-17) ist der CTA auch bei unvollständigem Formular bedienbar;
 * gesperrt ist er nur, während gerechnet oder gespeichert wird. Ein Klick auf ein
 * unvollständiges Formular sendet nichts und markiert die Felder — dann schlägt diese
 * Hilfsfunktion mit den markierten Feldern fehl, statt still auf Angebote zu warten.
 * Ein `force`-Klick bleibt verboten.
 */
export async function berechneAngebote(page, { timeout = 20000 } = {}) {
  const cta = angebotsCta(page);
  await cta.waitFor({ state: "visible", timeout });
  if (await cta.isDisabled()) {
    throw new Error("Der Angebots-CTA ist gesperrt — es läuft noch eine Berechnung oder ein Speichervorgang.");
  }
  await cta.click();
  const ergebnis = await Promise.race([
    page.waitForSelector(".offer-card", { timeout }).then(() => "angebote").catch(() => "zeitlimit"),
    page.waitForSelector('[data-field][aria-invalid="true"]', { timeout }).then(() => "fehler").catch(() => "zeitlimit"),
  ]);
  if (ergebnis === "fehler" && (await page.locator(".offer-card").count()) === 0) {
    const felder = await page.locator('[data-field][aria-invalid="true"]').evaluateAll(
      (els) => els.map((e) => e.getAttribute("data-field")));
    throw new Error(`Das Formular ist unvollständig — markiert: ${felder.join(", ")}`);
  }
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
