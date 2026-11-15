// Reine Logik des Auswahlmenüs (AuswahlMenue.jsx; eigener Dateiname, weil Windows „auswahlMenue.mjs“ und „AuswahlMenue.jsx“
// beim Auflösen von „./AuswahlMenue“ nicht unterscheidet) — ohne React, damit sie ohne Renderschicht prüfbar ist.
//
// Markiert ist die Option, auf der Tastatur oder Zeiger gerade stehen; gewählt ist der Wert. Gesperrte Optionen
// bleiben erreichbar (der Grund steht an ihnen und wird vorgelesen), lassen sich aber nicht wählen.

/** Index der Option mit diesem Wert, sonst -1. Strikter Vergleich: `false` ist ein Wert, `null` keiner. */
export function optionsIndex(optionen, wert) {
  if (!Array.isArray(optionen)) return -1;
  return optionen.findIndex((o) => o && o.value === wert);
}

/** Wo die Markierung beim Öffnen steht: auf der gewählten Option, sonst auf der ersten wählbaren, sonst auf der ersten. */
export function startMarke(optionen, wert) {
  if (!Array.isArray(optionen) || optionen.length === 0) return -1;
  const gewaehlt = optionsIndex(optionen, wert);
  if (gewaehlt >= 0) return gewaehlt;
  const waehlbar = optionen.findIndex((o) => o && !o.disabled);
  return waehlbar >= 0 ? waehlbar : 0;
}

/** Nächste Markierung für eine Taste. Kein Umlauf: an den Enden bleibt die Markierung stehen. Unbekannte Taste → null. */
export function bewegeMarke(index, taste, anzahl) {
  if (!Number.isInteger(anzahl) || anzahl <= 0) return -1;
  const jetzt = Number.isInteger(index) && index >= 0 && index < anzahl ? index : -1;
  switch (taste) {
    case "ArrowDown": return jetzt < 0 ? 0 : Math.min(jetzt + 1, anzahl - 1);
    case "ArrowUp":   return jetzt < 0 ? anzahl - 1 : Math.max(jetzt - 1, 0);
    case "Home":      return 0;
    case "End":       return anzahl - 1;
    default:          return null;
  }
}

/** Darf diese Option gewählt werden? Gesperrte nie, die schon gewählte ist kein Wechsel. */
export function istWechsel(optionen, index, wert) {
  if (!Array.isArray(optionen)) return false;
  const o = optionen[index];
  if (!o || o.disabled) return false;
  return o.value !== wert;
}
