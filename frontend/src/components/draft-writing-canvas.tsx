"use client";
import { useRef, useState } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

export default function DraftWritingCanvas({ initialScene, onChange, onExportReady }: {
  initialScene: string; onChange: (data: string) => void; onExportReady: (exporter: () => Promise<string>) => void;
}) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const initial = useRef((() => { try { return JSON.parse(initialScene); } catch { return { elements: [], appState: { viewBackgroundColor: "#202124", currentItemStrokeColor: "#eeeeee" } }; } })());
  const [theme, setTheme] = useState<"light" | "dark">(initial.current.appState?.theme ?? "dark");
  const [paper, setPaper] = useState(initial.current.paper ?? "plain");
  const paperRef = useRef(paper);
  const library = useRef(initial.current.libraryItems ?? []);
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState({ x: 18, y: 80 });
  const undoClear = useRef<ReturnType<ExcalidrawImperativeAPI["getSceneElements"]> | null>(null);
  const [canUndoClear, setCanUndoClear] = useState(false);
  const changeRef = useRef(onChange); changeRef.current = onChange;
  function snapshot() {
    if (!api.current) return;
    const state = api.current.getAppState();
    changeRef.current(JSON.stringify({ format: "pios-excalidraw-v1", elements: api.current.getSceneElements(), files: api.current.getFiles(),
      libraryItems: library.current, paper: paperRef.current,
      appState: { theme: state.theme, viewBackgroundColor: state.viewBackgroundColor, gridSize: state.gridSize, scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom } }));
  }
  function drag(event: React.PointerEvent<HTMLButtonElement>) {
    const start = { x: event.clientX, y: event.clientY };
    // Keep the palette reachable on touch and desktop screens.
    const originX = position.x, originY = position.y;
    const move = (next: PointerEvent) => setPosition({ x: Math.max(0, Math.min(window.innerWidth - 220, originX + next.clientX - start.x)), y: Math.max(0, Math.min(500, originY + next.clientY - start.y)) });
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  }
  return <div className={`draft-canvas paper-${paper}`}>
    <Excalidraw initialData={{ ...initial.current, appState: { ...initial.current.appState, theme } }} theme={theme}
      onChange={() => snapshot()} onLibraryChange={(items) => { library.current = items; snapshot(); }}
      excalidrawAPI={(handle) => {
        api.current = handle;
        onExportReady(async () => {
          const blob = await exportToBlob({ elements: handle.getSceneElements(), appState: { ...handle.getAppState(), exportBackground: true }, files: handle.getFiles(), mimeType: "image/png", maxWidthOrHeight: 1600 });
          return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Image export failed.")); reader.readAsDataURL(blob); });
        });
      }} />
    <div className="draft-palette" style={{ left: position.x, top: position.y }} role="toolbar" aria-label="Floating pencil tools">
      <button onPointerDown={drag} style={{ touchAction: "none", cursor: "grab" }} aria-label="Drag pencil toolbar">⠿</button><button onClick={() => setCollapsed(!collapsed)}>{collapsed ? "Tools" : "−"}</button>
      {!collapsed && <><button onClick={() => { api.current?.setActiveTool({ type: "freedraw" }); api.current?.updateScene({ appState: { currentItemOpacity: 100, currentItemStrokeWidth: 1 } }); }}>Pen</button><button onClick={() => { api.current?.setActiveTool({ type: "freedraw" }); api.current?.updateScene({ appState: { currentItemOpacity: 35, currentItemStrokeWidth: 12 } }); }}>Highlight</button><button onClick={() => api.current?.setActiveTool({ type: "eraser" })}>Eraser</button><button onClick={() => api.current?.setActiveTool({ type: "selection" })}>Select</button><button onClick={() => api.current?.setActiveTool({ type: "hand" })}>Pan</button>
        <input aria-label="Ink colour" type="color" defaultValue="#eeeeee" onChange={(event) => api.current?.updateScene({ appState: { currentItemStrokeColor: event.target.value, currentItemOpacity: 100 } })}/>
        <select aria-label="Paper appearance" value={paper} onChange={(event) => { setPaper(event.target.value); paperRef.current = event.target.value; api.current?.updateScene({ appState: { gridSize: 20, gridModeEnabled: event.target.value === "grid" } }); snapshot(); }}><option value="plain">Plain</option><option value="grid">Grid</option><option value="dots">Dotted</option><option value="ruled">Ruled</option></select>
        <select aria-label="Paper colour" onChange={(event) => { const dark = event.target.value === "#202124"; setTheme(dark ? "dark" : "light"); api.current?.updateScene({ appState: { viewBackgroundColor: event.target.value, theme: dark ? "dark" : "light", currentItemStrokeColor: dark ? "#eeeeee" : "#202124" } }); snapshot(); }} defaultValue={initial.current.appState?.viewBackgroundColor ?? "#202124"}><option value="#202124">Black</option><option value="#ffffff">White</option><option value="#f5eedc">Warm</option></select>
        <button className="danger" onClick={() => { if (!api.current) return; undoClear.current = api.current.getSceneElements(); api.current.updateScene({ elements: [] }); setCanUndoClear(true); snapshot(); }}>Clear All</button>
        {canUndoClear && <button onClick={() => { if (undoClear.current) api.current?.updateScene({ elements: undoClear.current }); setCanUndoClear(false); snapshot(); }}>Undo Clear</button>}
      </>}
    </div>
  </div>;
}
