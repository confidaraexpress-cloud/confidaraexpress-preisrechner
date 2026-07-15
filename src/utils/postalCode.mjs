// ─────────────────────────────────────────────────────────────────────────────
// Central, country-specific postal-code validation + input guidance (Paket 1).
//
// Framework-free (.mjs, like bookingGate/pickupWindowClient). Rules are GENERATED
// from src/utils/address-metadata.json (Google libaddressinput snapshot) into
// generated/postalCodeRules.mjs — never hand-maintained here. This module only
// interprets those rules; it invents no per-country regex.
//
// Frontend validation is for USER GUIDANCE ONLY. The backend re-validates the same
// rules authoritatively before any JUMiNGO call — the client can never bypass it.
//
// Scope note (format only): a pattern-valid code is NOT proven to exist, nor
// proven to belong to the entered city/street. E.g. FR + 63743 stays valid.
// ─────────────────────────────────────────────────────────────────────────────
import { rules, version } from "./generated/postalCodeRules.mjs";

export const postalRulesVersion = version;

// Mirror of the JUMiNGO CreateShipmentAddress.zip maxLength (OpenAPI v1.0.4).
const MAX_LEN = 10;

const MSG_FORMAT = "Die Postleitzahl entspricht nicht dem Format des ausgewählten Landes.";
const MSG_REQUIRED = "Für das ausgewählte Land ist eine Postleitzahl erforderlich.";

const _reCache = new Map();
function _regex(cc) {
  if (_reCache.has(cc)) return _reCache.get(cc);
  const rule = rules[cc];
  const re = rule && rule.pattern ? new RegExp("^(?:" + rule.pattern + ")$", "i") : null;
  _reCache.set(cc, re);
  return re;
}
const _cc = (country) => String(country == null ? "" : country).trim().toUpperCase();

export function getPostalCodeRule(country) {
  return rules[_cc(country)] || null;
}

export function isPostalCodeRequired(country) {
  const rule = getPostalCodeRule(country);
  return rule ? rule.required === true : false;
}

// Safe normalization only: trim, collapse internal whitespace, uppercase Latin for
// alphanumeric-postcode countries. Never adds/removes digits, never pads.
export function normalizePostalCode(country, value) {
  const rule = getPostalCodeRule(country);
  let v = String(value == null ? "" : value).trim().replace(/\s+/g, " ");
  if (rule && rule.uppercase) v = v.toUpperCase();
  return v;
}

// { valid:true, normalizedValue, required, example } | { valid:false, code, countryCode, example, message }
export function validatePostalCode(country, value) {
  const cc = _cc(country);
  const rule = rules[cc] || null;
  const normalized = normalizePostalCode(cc, value);
  const example = rule ? rule.example : null;

  if (!rule) {
    if (normalized.length > MAX_LEN) return { valid: false, code: "INVALID_POSTAL_CODE_FORMAT", countryCode: cc, example: null, message: MSG_FORMAT };
    return { valid: true, normalizedValue: normalized, required: false, example: null };
  }
  if (normalized === "") {
    if (rule.required) return { valid: false, code: "POSTAL_CODE_REQUIRED", countryCode: cc, example, message: MSG_REQUIRED };
    return { valid: true, normalizedValue: "", required: false, example };
  }
  if (normalized.length > MAX_LEN) return { valid: false, code: "INVALID_POSTAL_CODE_FORMAT", countryCode: cc, example, message: MSG_FORMAT };
  const re = _regex(cc);
  if (re && !re.test(normalized)) return { valid: false, code: "INVALID_POSTAL_CODE_FORMAT", countryCode: cc, example, message: MSG_FORMAT };
  return { valid: true, normalizedValue: normalized, required: rule.required === true, example };
}

// ── UI guidance helpers (pure) ───────────────────────────────────────────────

// Whether a postal-code field should be shown at all for the country. Countries
// with no documented postal system (pattern null AND not required) get no field.
export function hasPostalCode(country) {
  const rule = getPostalCodeRule(country);
  if (!rule) return true; // unknown country: keep the field (safe default)
  return rule.required === true || rule.pattern != null;
}

export function postalCodeExample(country) {
  const rule = getPostalCodeRule(country);
  return rule && rule.example ? rule.example : "";
}

// "numeric" when the pattern accepts digits/spaces/hyphens only; otherwise "text".
// Regex escapes like \d/\w contain a Latin letter in the pattern STRING — strip
// backslash-escapes first so e.g. "\d{5}" (DE) is correctly detected as numeric.
export function postalCodeInputMode(country) {
  const rule = getPostalCodeRule(country);
  if (!rule || !rule.pattern) return "text";
  const stripped = rule.pattern.replace(/\\[a-zA-Z]/g, "");
  return /[A-Za-z]/.test(stripped) ? "text" : "numeric";
}

export function postalCodeMaxLength() {
  return MAX_LEN;
}

// Short human hint, e.g. "Beispiel: 100096" — empty when no example is known.
export function postalCodeHint(country) {
  const ex = postalCodeExample(country);
  return ex ? `Beispiel: ${ex}` : "";
}
