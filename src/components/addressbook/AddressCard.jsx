import React from "react";
import { Icon } from "../ui/Icon";
import { countries } from "../../utils/countries";
import { isArchived } from "../../utils/addressBookView.mjs";
import { AddressActionsMenu, AddressBadges } from "./AddressDesktopRow";

const countryName = (code) => countries.find((c) => c.code === code)?.name || code;

// Mobil-Karte — enthält dieselben Informationen wie die Desktop-Zeile, aber
// gestapelt statt in Spalten (keine horizontale Pflicht-Scroll-Tabelle).
export function AddressCard({ address, busy, onEdit, onDuplicate, onToggleFavorite, onSetDefaultSender, onSetDefaultRecipient, onNewShipment, onArchive, onRestore }) {
  const archived = isArchived(address);
  return (
    <li className={`abk-card${archived ? " abk-card--archived" : ""}`}>
      <div className="abk-card-top">
        <div style={{ minWidth: 0 }}>
          <div className="abk-card-name">{address.label || address.company || address.contactName || "Ohne Bezeichnung"}</div>
          {address.company && address.label && <div className="abk-card-company">{address.company}</div>}
        </div>
        <AddressActionsMenu
          address={address} busy={busy}
          onEdit={onEdit} onDuplicate={onDuplicate} onToggleFavorite={onToggleFavorite}
          onSetDefaultSender={onSetDefaultSender} onSetDefaultRecipient={onSetDefaultRecipient}
          onNewShipment={onNewShipment} onArchive={onArchive} onRestore={onRestore}
        />
      </div>
      <AddressBadges address={address} />
      <div className="abk-card-info">
        {address.contactName && (
          <div className="abk-card-info-row"><Icon n="user" s={13} />{address.contactName}</div>
        )}
        <div className="abk-card-info-row">
          <Icon n="mapPin" s={13} />
          <span>{[address.streetAndNumber, [address.postalCode, address.city].filter(Boolean).join(" "), countryName(address.country)].filter(Boolean).join(", ")}</span>
        </div>
        {address.email && <div className="abk-card-info-row"><Icon n="mail" s={13} />{address.email}</div>}
        {address.phone && <div className="abk-card-info-row"><Icon n="phone" s={13} />{address.phone}</div>}
      </div>
    </li>
  );
}
