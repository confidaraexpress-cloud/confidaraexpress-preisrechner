import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";

const EMAIL = "support@confidaraexpress.de";

const PROVIDERS = [
  {
    id: "mailto",
    label: "E-Mail-App öffnen",
    href: `mailto:${EMAIL}`,
  },
  {
    id: "gmail",
    label: "Gmail",
    href: `https://mail.google.com/mail/u/0/?to=${EMAIL}&tf=cm`,
  },
  {
    id: "outlook",
    label: "Outlook / Microsoft 365",
    href: `https://outlook.office.com/mail/deeplink/compose?to=${EMAIL}`,
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    href: `https://compose.mail.yahoo.com/?to=${EMAIL}`,
  },
];

export function ContactMailMenu({ open, onClose }) {
  const dialogRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else {
      if (el.open) el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleClose = () => onClose();
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onClose]);

  const handleBackdrop = (e) => {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (
      e.clientX < rect.left || e.clientX > rect.right ||
      e.clientY < rect.top  || e.clientY > rect.bottom
    ) {
      onClose();
    }
  };

  const copyEmail = () => {
    navigator.clipboard?.writeText(EMAIL).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <dialog
      ref={dialogRef}
      className="ce-mail-dialog"
      aria-modal="true"
      aria-labelledby="ce-mail-dialog-title"
      onClick={handleBackdrop}
    >
      <div className="ce-mail-dialog-inner">
        <div className="ce-mail-dialog-header">
          <span id="ce-mail-dialog-title" className="ce-mail-dialog-title">
            E-Mail schreiben
          </span>
          <button
            type="button"
            className="ce-mail-dialog-close"
            onClick={onClose}
            aria-label="Dialog schließen"
          >
            <Icon n="x" s={16} />
          </button>
        </div>

        <p className="ce-mail-dialog-addr">{EMAIL}</p>

        <div className="ce-mail-dialog-providers">
          {PROVIDERS.map((p) => (
            <a
              key={p.id}
              href={p.href}
              className="ce-mail-dialog-provider"
              target={p.id !== "mailto" ? "_blank" : undefined}
              rel={p.id !== "mailto" ? "noopener noreferrer" : undefined}
              onClick={onClose}
            >
              {p.label}
              {p.id !== "mailto" && (
                <Icon n="arrowRight" s={14} c="currentColor" />
              )}
            </a>
          ))}
        </div>

        <div className="ce-mail-dialog-divider" />

        <button
          type="button"
          className="ce-mail-dialog-copy"
          onClick={copyEmail}
        >
          <Icon n={copied ? "check" : "copy"} s={15} c="currentColor" />
          {copied ? "Kopiert!" : "E-Mail-Adresse kopieren"}
        </button>
      </div>
    </dialog>
  );
}
