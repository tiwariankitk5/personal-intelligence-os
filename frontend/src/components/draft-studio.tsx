"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { getDraftSheets, saveDraftSheet, type DraftSheet } from "@/lib/api";
const Canvas = dynamic(() => import("./draft-writing-canvas"), { ssr: false, loading: () => <p>Loading writing tools…</p> });

export default function DraftStudio({ open, onClose, onPromote }: {
  open: boolean; onClose: () => void; onPromote: (title: string, scene: string, png: string) => Promise<boolean>;
}) {
  const [sheets, setSheets] = useState<DraftSheet[]>([]);
  const [active, setActive] = useState<DraftSheet | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const pending = useRef<DraftSheet | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef<Promise<boolean> | null>(null);
  const exportRef = useRef<(() => Promise<string>) | null>(null);
  const loaded = useRef(false);
  const latestScenes = useRef(new Map<string, string>());

  async function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    if (running.current) return running.current;
    const work = async () => {
      while (pending.current) {
        const snapshot = pending.current;
        pending.current = null;
        setStatus("Saving…");
        try {
          const saved = await saveDraftSheet(snapshot);
          setSheets((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
          setStatus(pending.current ? "Saving…" : "Saved to account"); setError("");
        } catch (cause) {
          pending.current ??= snapshot;
          setError(cause instanceof Error ? cause.message : "Could not save Draft.");
          setStatus("Not saved — retry"); return false;
        }
      }
      return true;
    };
    running.current = work().finally(() => { running.current = null; });
    return running.current;
  }

  async function load() {
    setStatus("Loading…"); setError("");
    try {
      const rows = await getDraftSheets();
      if (rows.length) { setSheets(rows); setActive(rows[0]); }
      else {
        const sheet = await saveDraftSheet({ id: crypto.randomUUID(), title: "Rough work", sceneData: "" });
        setSheets([sheet]); setActive(sheet);
      }
      loaded.current = true; setStatus("Saved to account");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load Draft."); setStatus("Load failed"); }
  }
  useEffect(() => { if (open && !loaded.current) void load(); }, [open]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pending.current || running.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); clearTimeout(timer.current); void flush(); };
  }, []);

  function changed(sceneData: string) {
    if (!active || sceneData === (latestScenes.current.get(active.id) ?? active.sceneData)) return;
    latestScenes.current.set(active.id, sceneData);
    pending.current = { ...active, sceneData };
    setStatus("Unsaved changes"); clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1000);
  }
  async function choose(sheet: DraftSheet) { if (await flush()) { setActive(sheet); setMinimized(false); } }
  async function newSheet() {
    if (!await flush()) return;
    try {
      const sheet = await saveDraftSheet({ id: crypto.randomUUID(), title: `Draft ${sheets.length + 1}`, sceneData: "" });
      setSheets((rows) => [sheet, ...rows]); setActive(sheet);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create a sheet."); }
  }
  async function close() { if (await flush()) onClose(); }
  async function promote() {
    if (!active || !exportRef.current || !await flush()) return;
    try {
      const png = await exportRef.current();
      const saved = { ...active, sceneData: latestScenes.current.get(active.id) ?? active.sceneData };
      if (await onPromote(active.title, saved.sceneData, png)) setStatus("Copied to your note");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not copy the drawing."); }
  }
  if (!open) return null;
  return <>
    {minimized && <button className="draft-restore" onClick={() => setMinimized(false)}>✎ Restore Draft · {active?.title}</button>}
    <div className="draft-overlay" style={{ display: minimized ? "none" : undefined }} role="dialog" aria-modal="true" aria-label="Draft scratchpad">
      <section className="draft-studio">
        <header className="draft-header"><div><small>PIOS DRAFT · ROUGH WORK</small><h2>Your space to think.</h2></div><div className="draft-header-actions"><span role="status">{status}</span><button onClick={() => setMinimized(true)}>Minimise</button><button onClick={() => void close()} aria-label="Close Draft">✕</button></div></header>
        <nav className="draft-sheets" aria-label="Draft sheets">{sheets.map((sheet) => <button className={active?.id === sheet.id ? "active" : ""} key={sheet.id} onClick={() => void choose(sheet)}>{sheet.title}</button>)}<button onClick={() => void newSheet()}>＋ New sheet</button></nav>
        {error && <div className="draft-error" role="alert">{error} <button onClick={() => void (loaded.current ? flush() : load())}>Retry</button></div>}
        {active && <Canvas key={active.id} initialScene={active.sceneData} onChange={changed} onExportReady={(exporter) => { exportRef.current = exporter; }}/>}
        <footer className="draft-footer"><span>Pen to write · two fingers/hand tool to pan · zoom and library in the canvas</span><button disabled={!active} onClick={() => void flush()}>Save now</button><button disabled={!active} onClick={() => void promote()}>Copy drawing to current note</button></footer>
      </section>
    </div>
  </>;
}
