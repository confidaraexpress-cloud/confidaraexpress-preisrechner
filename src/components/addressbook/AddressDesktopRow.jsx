import React from "react";
import { Icon } from "../ui/Icon";
import { countries } from "../../utils/countries";
import { ROLE_SENDER, ROLE_RECIPIENT, ROLE_BOTH } from "../../utils/addressBookView.mjs";
import { AddressActionsMenu } from "./AddressActionsMenu";

const ROLE_LABEL = { [ROLE_SENDER]: "Absender", [ROLE_RECIPIENT]: "Empfänger", [ROLE_BOTH]: "Beides" };
const countryName = (code) => countries.find((c) => c.code === code)?.name || code;

// Badge-Priorisierung: Standard-Flags (blau, am wichtigsten) → Favorit (gelb) →
// Rolle (grau, ruhigster Marker). Nicht alle Badges gleichzeitig dominant.
function AddressBadges({ address }) {
  return (
    <div className="abk-row-badges">
      {address.isDefaultSender && <span className="badge badge-blue">Standard-Absender</span>}
      {address.isDefaultRecipient && <span className="badge badge-blue">Standard-Empfänger</span>}
      {address.favorite && <span className="badge badge-yellow">Favorit</span>}
      <span className="badge badge-gray">{ROLE_LABEL[address.role] || address.role}</span>
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
          <span className="abk-row-meta">
            {address.email && <><Icon n="mail" s={12} c="currentColor" />{address.email}</>}
            {address.email && address.phone && <span aria-hidden="true">·</span>}
            {address.phone && <><Icon n="phone" s={12} c="currentColor" />{address.phone}</>}
          </span>
        )}
      </div>
      <AddressBadges address={address} />
      <div className="abk-row-actions">
        <AddressActionsMenu
          address={address} busy={busy}
          onEdit={onEdit} onDuplicate={onDuplicate} onToggleFavorite={onToggleFavorite}
          onSetDefaultSender={onSetDefaultSender} onSetDefaultRecipient={onSetDefaultRecipient}
          onNewShipment={onNewShipment} onDelete={onDelete}
        />
      </div>
    </li>
  );
}

export { AddressActionsMenu, AddressBadges };
