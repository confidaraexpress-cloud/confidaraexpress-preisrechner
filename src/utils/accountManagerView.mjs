// Persönlicher ConfidaraExpress-Ansprechpartner der Seitenleiste (Betreiberentscheidung 2026-10-30, Canonical 1A,
// v2.90) — reine Ansichtslogik ohne React, damit sie ohne DOM prüfbar bleibt.
//
// Quelle ist allein das Serverfeld `accountManager` aus GET /kundenbereich (AuthContext faltet es ins Benutzerobjekt):
// Name, Telefon (Anzeige und tel:-Ziel), E-Mail und die Fotoversion. Das Frontend kennt keine Personen und keine
// Kontaktdaten der Ansprechpartner — fehlt das Feld oder ist es unvollständig, zeigt die Karte den allgemeinen
// ConfidaraExpress-Kundenservice, nie eine geratene Person (auch die öffentliche Demo, die null liefert).

export const ANSPRECH_TEXT = Object.freeze({
  rolle: "Ihr Ansprechpartner",
  serviceName: "ConfidaraExpress",
  serviceRolle: "Kundenservice",
  // Vorgelesener Teil der Links: der sichtbare Text bleibt im Namen (WCAG 2.5.3), davor die Handlung.
  anrufen: "Anrufen: ",
  mailen: "E-Mail an ",
  // Schalter des Pulsierens (WCAG 2.2.2): benennt die Handlung, nie einen Zustand der Person.
  pulsAnhalten: "Pulsieren des Punkts anhalten",
  pulsFortsetzen: "Pulsieren des Punkts fortsetzen",
});

// Gerätebezogene Vorliebe, kein Kontodatum: nur „aus“ wird gespeichert, sonst pulsiert der Punkt (Standard).
export const PULS_SPEICHER_SCHLUESSEL = "ce_ansprechpartner_puls";

const SCHLUESSEL_RE = /^[a-z]{2,32}$/;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
const TEL_HREF_RE = /^tel:\+[1-9][0-9]{6,14}$/;
const VERSION_RE = /^[0-9a-f]{6,64}$/;

const text = (w, max) => (typeof w === "string" && w.trim() !== "" && w.length <= max ? w.trim() : null);

export function initialen(name) {
  const worte = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (worte.length === 0) return "";
  const erste = worte[0][0] || "";
  const letzte = worte.length > 1 ? worte[worte.length - 1][0] || "" : "";
  return `${erste}${letzte}`.toUpperCase();
}

// Lokaler Teil und Domain getrennt: die Karte setzt dazwischen eine Umbruchstelle (<wbr>) vor dem „@“ — passt die
// Adresse nicht in die Zeile (große Schrift), bricht sie nur dort und nie mitten im Namen oder in der Domain.
export function emailTeile(email) {
  const i = email.indexOf("@");
  return { lokal: email.slice(0, i), domain: email.slice(i) };
}

// Ansicht der Karte. art "person": alle Angaben vollständig und plausibel; sonst art "service".
export function ansprechpartnerAnsicht(accountManager) {
  const am = accountManager && typeof accountManager === "object" ? accountManager : null;
  const name = am ? text(am.name, 80) : null;
  const anzeige = am && am.phone ? text(am.phone.display, 30) : null;
  const href = am && am.phone && typeof am.phone.href === "string" && TEL_HREF_RE.test(am.phone.href) ? am.phone.href : null;
  const email = am && typeof am.email === "string" && EMAIL_RE.test(am.email) ? am.email : null;
  const key = am && typeof am.key === "string" && SCHLUESSEL_RE.test(am.key) ? am.key : null;
  if (!name || !anzeige || !href || !email || !key) {
    return Object.freeze({
      art: "service", name: ANSPRECH_TEXT.serviceName, rolle: ANSPRECH_TEXT.serviceRolle,
      initialen: "", telefon: null, email: null, fotoVersion: null,
    });
  }
  const version = am.photo && typeof am.photo.version === "string" && VERSION_RE.test(am.photo.version) ? am.photo.version : null;
  return Object.freeze({
    art: "person", key, name, rolle: ANSPRECH_TEXT.rolle, initialen: initialen(name),
    telefon: Object.freeze({ anzeige, href }),
    email: Object.freeze({ adresse: email, href: `mailto:${email}`, ...emailTeile(email) }),
    fotoVersion: version,
  });
}

// Vorliebe „Pulsieren angehalten“ lesen und schreiben. Jeder Zugriff kann werfen (privates Fenster, gesperrter
// Speicher) — dann gilt der Standard, und die Karte funktioniert unverändert.
export function pulsAngehalten(speicher) {
  try { return Boolean(speicher) && speicher.getItem(PULS_SPEICHER_SCHLUESSEL) === "aus"; } catch { return false; }
}

export function pulsMerken(speicher, angehalten) {
  try {
    if (!speicher) return;
    if (angehalten) speicher.setItem(PULS_SPEICHER_SCHLUESSEL, "aus");
    else speicher.removeItem(PULS_SPEICHER_SCHLUESSEL);
  } catch { /* Vorliebe nicht speicherbar: sie gilt dann nur bis zum Neuladen */ }
}
