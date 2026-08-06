import { FLOW_STORAGE_KEY } from "./shippingFlowState.mjs";

// Zugriff auf den sessionStorage-Spiegel des temporären Versandvorgangs.
//
// Bewusst ein eigenes, winziges Modul ohne React: sowohl der
// ShippingFlowProvider als auch der Abmeldepfad im AuthContext brauchen es.
// Läge es im Context, entstünde ein Importzyklus (AuthContext ↔
// ShippingFlowContext); läge es in shippingFlowState.mjs, wäre die reine,
// in Node getestete Zustandslogik nicht mehr frei von Browser-APIs.
//
// Jeder Zugriff kann werfen — Privatmodus, gesperrter oder voller Speicher.
// Die Anwendung muss ohne Speicher vollständig funktionieren: der Vorgang lebt
// dann nur im Arbeitsspeicher und übersteht eben keinen Reload.

export function readShippingFlow() {
  try {
    return window.sessionStorage.getItem(FLOW_STORAGE_KEY);
  } catch {
    return null;
  }
}

// true = geschrieben, false = Speicher nicht verfügbar (kein Fehlerfall).
export function writeShippingFlow(text) {
  try {
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
}

export function clearShippingFlowStorage() {
  try {
    window.sessionStorage.removeItem(FLOW_STORAGE_KEY);
  } catch {
    /* nichts zu tun */
  }
}
