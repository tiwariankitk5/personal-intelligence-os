"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icon";

export default function AccountMenu({ displayName, email, onAccount, onLogout }: {
  displayName: string; email: string; onAccount: () => void; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, bottom: 60 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)), bottom: Math.max(8, window.innerHeight - rect.top + 8) });
    };
    const dismiss = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    };
    place();
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="pios-user-row" title="Account options" aria-label="Account options" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((value) => !value)}>
      <span className="pios-avatar">{displayName.slice(0, 1).toUpperCase()}</span><span><strong>{displayName}</strong><small>Account options</small></span><Icon name="chevron-down" size={15}/>
    </button>
    {open && createPortal(<div ref={panel} id={id} className="pios-account-menu" role="region" aria-label="Account options" style={position} onBlur={(event) => {
      const next = event.relatedTarget as Node | null;
      if (next && !event.currentTarget.contains(next) && !trigger.current?.contains(next)) setOpen(false);
    }}>
      <div className="pios-account-summary"><strong>{displayName}</strong><small>{email}</small></div>
      <button type="button" onClick={() => { setOpen(false); onAccount(); }}><Icon name="settings" size={16}/>Settings</button>
      <button type="button" className="pios-account-logout" onClick={() => { setOpen(false); onLogout(); }}><Icon name="log-out" size={16}/>Sign out</button>
    </div>, document.body)}
  </>;
}
