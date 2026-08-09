import React from "react";
import { Icon } from "../ui/Icon";
import { countries } from "../../utils/countries";
import { addressBadgeList } from "../../utils/addressBookView.mjs";
import { AddressActionsMenu } from "./AddressActionsMenu";
import { AddressCreateShipmentButton } from "./AddressCreateShipmentButton";

const countryName = (code) => countries.find((c) => c.code === code)?.name || code;

// Höchstens drei Badges gleichzeitig — die Zusammenfassung (Standard-Flags,
// Priorisierung) liefert addressBadgeList (rein, getestet).
function AddressBadges({ address }) {
  return (
    <div className="abk-row-badges">
      {addressBadgeList(address).map((b) => (
        <span key={b.key} className={`badge badge-${b.tone}`}>{b.text}</span>
      ))}
    </div>
  );
}

export function AddressDesktopRow({ address, busy, onEdit, onDuplicate, onToggleFavorite, onSetDefaultSender, onSetDefaultRecipient, onNewShipment, onDelete }) {
  return (
    <li className="abk-row">
      <div className="abk-row-identity">
        <span className="abk-row-name">{address.label || address.company || address.contactName || "Ohne Bezeichnung"}</span>
        {address.company && address.label && <span className="abk-row-company">{address.company}</span>}
        {address.contactName && <span className="abk-row-contact">{address.contactName}</span>}
      </div>
      <div className="abk-row-detail">
        <span className="abk-row-addr">
          {[address.streetAndNumber, [address.postalCode, address.city].filter(Boolean).join(" "), countryName(address.country)].filter(Boolean).join(", ")}
        </span>
        {(address.email || address.phone) && (
          /* E-Mail und Telefon als EIGENE Glieder: nur so kann die E-Mail als
             technischer String lokal brechen (.abk-contact-email) und das
             Telefon als Einheit die Zeile wechseln — als nackte Textknoten
             waren beide unteilbare anonyme Flex-Items, und die E-Mail lief
             sichtbar unter die Badge-Spalte. */
          <span className="abk-row-meta">
            {address.email && <><Icon n="mail" s={12} c="currentColor" /><span className="abk-contact-email">{address.email}</span></>}
            {address.email && address.phone && <span aria-hidden="true">·</span>}
            {address.phone && <><Icon n="phone" s={12} c="currentColor" /><span className="abk-contact-phone">{address.phone}</span></>}
          </span>
        )}
      </div>
      <AddressBadges address={address} />
      {/* Aktionen rechts: sichtbarer „Sendung erstellen"-Button VOR dem Zahnrad
          (Reihenfolge Badges → Button → Zahnrad). Der Button startet den
          bestehenden onNewShipment-Flow direkt, ohne das Menü zu öffnen. */}
      <div className="abk-row-actions">
        <AddressCreateShipmentButton address={address} onNewShipment={onNewShipment} />
        <AddressActionsMenu
          address={address} busy={busy}
          onEdit={onEdit} onDuplicate={onDuplicate} onToggleFavorite={onToggleFavorite}
          onSetDefaultSender={onSetDefaultSender} onSetDefaultRecipient={onSetDefaultRecipient}
          onDelete={onDelete}
        />
      </div>
    </li>
  );
}

export { AddressActionsMenu, AddressBadges };
