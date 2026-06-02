import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";

const TRUST_ITEMS = [
  { ico: "truck",   title: "Live Tracking",           sub: "Echtzeit-Transparenz" },
  { ico: "shield",  title: "Sicher & Geschützt",      sub: "Ihre Daten in besten Händen" },
  { ico: "headset", title: "Persönlicher Support",    sub: "Per E-Mail & Telefon" },
  { ico: "cube",    title: "Carrier-Vergleich",       sub: "DHL, UPS, DPD & mehr" },
];

export function TrustBar() {
  return (
    <div className="auth-trust auth-anim delay-4">
      <div className="auth-trust-row">
        {TRUST_ITEMS.map(({ ico, title, sub }) => (
          <div className="auth-trust-item" key={title}>
            <div className="auth-trust-ico"><Icon n={ico} s={16} /></div>
            <div>
              <div className="auth-trust-title">{title}</div>
              <div className="auth-trust-sub">{sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="auth-foot">
        <span className="auth-foot-ico"><Icon n="lock" s={14} /></span>
        <span>
          <strong>Ihre Daten sind bei uns sicher.</strong>{" "}
          Verschlüsselte Übertragung (TLS) ·{" "}
          <Link to="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</Link>
        </span>
      </div>
    </div>
  );
}
