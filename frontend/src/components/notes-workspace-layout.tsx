"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

const key = "pios-note-column-widths-v1";
const defaults = [150, 210];
const minimum = [130, 180];
const maximum = [320, 420];

export default function NotesWorkspaceLayout({ children, foldersCollapsed = false }: { children: ReactNode; foldersCollapsed?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; x: number; width: number } | null>(null);
  const [widths, setWidths] = useState(defaults);
  const [available, setAvailable] = useState(1000);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(saved) && saved.length === 2 && saved.every((n) => typeof n === "number" && Number.isFinite(n))) {
        setWidths(saved.map((n, i) => Math.max(minimum[i], Math.min(maximum[i], n))));
      }
    } catch { /* Restricted browser storage uses defaults. */ }
    setReady(true);
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(key, JSON.stringify(widths)); } catch { /* Layout remains usable without storage. */ }
  }, [ready, widths]);

  const folder = foldersCollapsed ? 56 : Math.min(widths[0], Math.max(minimum[0], available - minimum[1] - 280));
  const list = Math.min(widths[1], Math.max(minimum[1], available - folder - 280));
  const effective = [folder, list];
  const resize = (index: number, value: number) => {
    const limit = Math.min(maximum[index], available - effective[1 - index] - 280);
    setWidths((old) => old.map((n, i) => i === index ? Math.round(Math.max(minimum[i], Math.min(limit, value))) : n));
  };
  return <div ref={root} className={`notes-workspace${foldersCollapsed ? " folders-collapsed" : ""}`} style={{ "--folder-width": `${folder}px`, "--list-width": `${list}px` } as CSSProperties}>
    {children}
    {(foldersCollapsed ? [1] : [0, 1]).map((index) => <div key={index} className={`notes-column-divider divider-${index}`} role="separator" aria-orientation="vertical" aria-label={index === 0 ? "Resize folders column" : "Resize notes column"} aria-valuemin={minimum[index]} aria-valuemax={Math.max(minimum[index], Math.min(maximum[index], available - effective[1 - index] - 280))} aria-valuenow={Math.round(effective[index])} tabIndex={0} title="Drag to resize · arrow keys to adjust · double-click to reset"
      onPointerDown={(event) => { event.preventDefault(); drag.current = { index, x: event.clientX, width: effective[index] }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { const start = drag.current; if (start?.index === index) resize(index, start.width + event.clientX - start.x); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={() => setWidths(defaults)}
      onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); resize(index, event.key === "Home" ? minimum[index] : event.key === "End" ? maximum[index] : effective[index] + (event.key === "ArrowRight" ? 10 : -10)); } }} />)}
  </div>;
}
