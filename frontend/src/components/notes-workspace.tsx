"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { FormEvent, MouseEvent } from "react";
import { Icon } from "@/components/icon";
import type { NoteFolder, NoteColor, PiosNote } from "@/lib/notes";
import { plainTextFromHtml, sanitizeNoteHtml, suggestNoteDestination } from "@/lib/notes";
import DraftStudio from "./draft-studio";
import NotesWorkspaceLayout from "./notes-workspace-layout";
import NoteEdgeRail from "./note-edge-rail";
import { sendChat } from "@/lib/api";
import type { ApiCitation } from "@/lib/api";

type NotesWorkspaceProps = {
  notes: PiosNote[];
  folders: NoteFolder[];
  onNotesChange: (notes: PiosNote[]) => void | Promise<boolean>;
  onFoldersChange: (folders: NoteFolder[]) => void;
  onDeleteFolder?: (id: string) => Promise<boolean>;
  onDeleteNote?: (id: string) => Promise<boolean>;
  onQuickCapture: () => void;
  onToast: (message: string) => void;
};

const NoteDrawingCanvas = dynamic(() => import("@/components/note-drawing-canvas"), {
  ssr: false,
  loading: () => <div className="pios-excalidraw-loading">Loading drawing canvas…</div>,
});

type QuickCaptureModalProps = {
  folders: NoteFolder[];
  notes: PiosNote[];
  onClose: () => void;
  onSave: (note: PiosNote, newFolder?: NoteFolder, appendToPageId?: string) => void;
};

const colors: { id: NoteColor; name: string }[] = [
  { id: "sage", name: "Sage" }, { id: "butter", name: "Butter" }, { id: "lavender", name: "Lavender" },
  { id: "sky", name: "Sky" }, { id: "rose", name: "Rose" }, { id: "slate", name: "Slate" },
];

type NoteDiagramRecord = { id: string; sceneData: string };
type NoteDiagramStore = { format: "pios-diagrams-v1"; diagrams: NoteDiagramRecord[]; legacyScene?: string };
type ExportedNoteDiagram = { sceneData: string; previewDataUrl: string };

function readDiagramStore(raw: string): NoteDiagramStore {
  if (!raw) return { format: "pios-diagrams-v1", diagrams: [] };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.format === "pios-diagrams-v1" && Array.isArray(parsed.diagrams)) {
      return { format: "pios-diagrams-v1", diagrams: parsed.diagrams.filter((item: unknown): item is NoteDiagramRecord =>
        !!item && typeof item === "object" && typeof (item as NoteDiagramRecord).id === "string" && typeof (item as NoteDiagramRecord).sceneData === "string"
      ) };
    }
    if (parsed?.format === "pios-excalidraw-v1" && Array.isArray(parsed.elements)) {
      return { format: "pios-diagrams-v1", diagrams: [], legacyScene: raw };
    }
  } catch {
    // Ignore malformed legacy drawing data and preserve it only until a replacement is saved.
  }
  return { format: "pios-diagrams-v1", diagrams: [] };
}

function makeNote(title: string, body: string, folderId: string, color: NoteColor = "sage"): PiosNote {
  const html = body.trim().split(/\n/).map((line) => line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>").join("");
  return {
    id: crypto.randomUUID(),
    title: title.trim() || "Untitled note", bodyHtml: html, plainText: body.trim(), folderId, color,
    pinned: false, archived: false, updatedAt: "Just now", order: Date.now(),
  };
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function NoteDestination({
  title, body, folders, notes, folderId, onFolderChange, onFoldersChange, onUsePage, excludeId, compact = false,
}: {
  title: string; body: string; folders: NoteFolder[]; notes: PiosNote[]; folderId: string;
  onFolderChange: (id: string) => void; onFoldersChange?: (folders: NoteFolder[]) => void;
  onUsePage?: (note: PiosNote) => void; excludeId?: string; compact?: boolean;
}) {
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const suggestion = useMemo(() => suggestNoteDestination(`${title} ${body}`, folders, notes, excludeId), [title, body, folders, notes, excludeId]);
  const suggestedFolder = suggestion.folder?.id ?? "inbox";
  const selectedFolder = folders.find((folder) => folder.id === folderId) ?? folders[0];

  const createFolder = (event: FormEvent) => {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name || !onFoldersChange) return;
    const folder: NoteFolder = { id: crypto.randomUUID(), name, color: "#8c9a90" };
    onFoldersChange([...folders, folder]);
    onFolderChange(folder.id);
    setNewFolderName(""); setShowNewFolder(false);
  };

  return (
    <div className={`note-destination ${compact ? "compact" : ""}`}>
      <div className="note-destination-top">
        <div className="note-ai-mark"><Icon name="sparkles" size={14}/></div>
        <div className="note-destination-copy">
          <strong>PIOS destination suggestion</strong>
          <span>{suggestion.reason}</span>
        </div>
        <span className="destination-confidence">{suggestion.confidence}% match</span>
      </div>
      <div className="destination-options">
        <button className={`destination-choice ${folderId === suggestedFolder ? "chosen" : ""}`} onClick={() => onFolderChange(suggestedFolder)} type="button">
          <Icon name="folder" size={15}/><span><small>Suggested folder</small><strong>{suggestion.folder?.name ?? "Inbox"}</strong></span>
          {folderId === suggestedFolder && <Icon name="check" size={15}/>}
        </button>
        {suggestion.page ? <div className="destination-page-hint"><Icon name="file-text" size={14}/><span>Possible existing page: <strong>{suggestion.page.title}</strong></span>{onUsePage && <button type="button" onClick={() => onUsePage(suggestion.page!)}>Add to page</button>}</div> : <div className="destination-page-hint"><Icon name="file-plus" size={14}/><span>No close page match. Save as a <strong>new page</strong> in this folder.</span></div>}
        <div className="destination-manual">
          <label htmlFor={compact ? "capture-folder" : "editor-folder"}>Choose a folder</label>
          <select id={compact ? "capture-folder" : "editor-folder"} value={folderId} onChange={(event) => onFolderChange(event.target.value)}>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          {onFoldersChange && <button type="button" className="inline-create-folder" onClick={() => setShowNewFolder((value) => !value)}><Icon name="plus" size={13}/> New folder</button>}
        </div>
      </div>
      {showNewFolder && <form className="new-folder-inline" onSubmit={createFolder}><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Folder name"/><button className="button button-primary button-small" type="submit" disabled={!newFolderName.trim()}>Create</button></form>}
      <p className="destination-disclaimer">Suggestions are local demo rules right now. A connected PIOS model can classify by meaning and retrieve the best existing page.</p>
      {selectedFolder && <span className="sr-only">Selected folder: {selectedFolder.name}</span>}
    </div>
  );
}

export function QuickCaptureModal({ folders, notes, onClose, onSave }: QuickCaptureModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const firstSuggestion = suggestNoteDestination("", folders, notes).folder?.id ?? "inbox";
  const [folderId, setFolderId] = useState(firstSuggestion);
  const [color, setColor] = useState<NoteColor>("butter");
  const [createPage, setCreatePage] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolder, setNewFolder] = useState<NoteFolder | undefined>();
  const [appendToPageId, setAppendToPageId] = useState<string | null>(null);
  const [manualDestination, setManualDestination] = useState(false);
  const activeFolders = newFolder ? [...folders, newFolder] : folders;

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() && !body.trim()) return;
    let targetFolder = folderId;
    let folderToSave = newFolder;
    if (createPage) {
      const pageFolderName = newFolderName.trim() || title.trim() || "New page";
      folderToSave = { id: crypto.randomUUID(), name: pageFolderName, color: "#8c9a90" };
      targetFolder = folderToSave.id;
    }
    onSave(makeNote(title, body, targetFolder, color), folderToSave, appendToPageId ?? undefined);
  };

  return <div className="modal-backdrop quick-capture-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal quick-capture-modal">
      <div className="quick-capture-topline"><span><Icon name="sparkles" size={14}/> QUICK CAPTURE</span><kbd>ESC</kbd></div>
      <form onSubmit={handleSave}>
        <input className="quick-capture-title" autoFocus value={title} onChange={(event) => { setTitle(event.target.value); if (!createPage && !manualDestination) setFolderId(suggestNoteDestination(`${event.target.value} ${body}`, activeFolders, notes).folder?.id ?? "inbox"); }} placeholder="Give this note a title..." />
        <textarea className="quick-capture-body" value={body} onChange={(event) => { setBody(event.target.value); if (!createPage && !manualDestination) setFolderId(suggestNoteDestination(`${title} ${event.target.value}`, activeFolders, notes).folder?.id ?? "inbox"); }} placeholder="Capture a thought. Use a dash for a quick list..." rows={6}/>
        <div className="quick-capture-options">
          <div className="note-color-picker" aria-label="Note colour">{colors.map((item) => <button type="button" key={item.id} title={item.name} aria-label={item.name} className={`note-color-dot ${item.id} ${color === item.id ? "selected" : ""}`} onClick={() => setColor(item.id)}/>)}</div>
          <label className="new-page-toggle"><input type="checkbox" checked={createPage} onChange={(event) => { setCreatePage(event.target.checked); setAppendToPageId(null); setManualDestination(false); }}/> Create a new folder for this page</label>
        </div>
        {createPage ? <div className="new-page-field"><label htmlFor="new-page-name">New folder name</label><input id="new-page-name" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="e.g. Java Concurrency"/><small>Your note will be created as a new page inside this folder.</small></div> : <NoteDestination title={title} body={body} folders={activeFolders} notes={notes} folderId={folderId} onFolderChange={(id) => { setFolderId(id); setManualDestination(true); if (folders.some((folder) => folder.id === id)) setNewFolder(undefined); }} onUsePage={(page) => { setAppendToPageId(page.id); setFolderId(page.folderId); setManualDestination(true); setNewFolder(undefined); }} onFoldersChange={(next) => { const latest = next[next.length - 1]; if (latest && !folders.some((folder) => folder.id === latest.id)) setNewFolder(latest); }} compact/>}
        {appendToPageId && <div className="append-page-state"><Icon name="file-text" size={13}/> This capture will be appended to an existing note instead of creating a separate page.</div>}
        <div className="quick-capture-footer"><span><Icon name="command" size={13}/> Ctrl + Alt + N when PIOS is open</span><div><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={!title.trim() && !body.trim()}><Icon name="check" size={15}/>{appendToPageId ? "Add to page" : "Save note"}</button></div></div>
      </form>
    </div>
  </div>;
}

export default function NotesWorkspace({ notes, folders, onNotesChange, onFoldersChange, onDeleteFolder, onDeleteNote, onQuickCapture, onToast }: NotesWorkspaceProps) {
  const [foldersCollapsed, setFoldersCollapsed] = useState(true);
  useEffect(() => {
    try { setFoldersCollapsed(localStorage.getItem("pios-folders-collapsed-v1") !== "false"); } catch { /* Keep the compact default without storage. */ }
  }, []);
  const toggleFolders = () => {
    const next = !foldersCollapsed;
    setFoldersCollapsed(next);
    try { localStorage.setItem("pios-folders-collapsed-v1", String(next)); } catch { /* The toggle still works without storage. */ }
  };
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [filter, setFilter] = useState<"active" | "pinned" | "archived">("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("manual");
  const [selectedId, setSelectedId] = useState<string | null>(notes.find((note) => !note.archived)?.id ?? null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftHtml, setDraftHtml] = useState("");
  const [draftColor, setDraftColor] = useState<NoteColor>("sage");
  const editorRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [showDestination, setShowDestination] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [draftOpen, setDraftOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved to account");
  const [pageTheme, setPageTheme] = useState("white");
  const [pageIcon, setPageIcon] = useState("");
  const [coverPosition, setCoverPosition] = useState(50);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadedNote = useRef<string | null>(null);
  const saveLatest = useRef<() => Promise<boolean>>(async () => true);
  const [askOpen, setAskOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [drawingSaving, setDrawingSaving] = useState(false);
  const [drawingInitialData, setDrawingInitialData] = useState("");
  const [editingDiagramId, setEditingDiagramId] = useState<string | null>(null);
  const [askText, setAskText] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askCitations, setAskCitations] = useState<ApiCitation[]>([]);
  const [askBusy, setAskBusy] = useState(false);
  const [askConversationId, setAskConversationId] = useState<string | undefined>();
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
  const [toolbarDragging, setToolbarDragging] = useState(false);
  const [toolbarOrientation, setToolbarOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { const saved = localStorage.getItem("pios-format-toolbar-orientation"); if (saved === "vertical" || saved === "horizontal") setToolbarOrientation(saved); } catch { /* Browser preference storage is optional. */ }
  }, []);
  const toggleToolbarOrientation = () => {
    const next = toolbarOrientation === "horizontal" ? "vertical" : "horizontal";
    setToolbarOrientation(next);
    try { localStorage.setItem("pios-format-toolbar-orientation", next); } catch { /* Keep the current layout without storage. */ }
  };
  const [inkData, setInkData] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importContent = async (file?: File) => {
    if (!file || !editorRef.current) return;
    if (file.size > 2 * 1024 * 1024) { onToast("Import files must be 2 MB or smaller."); return; }
    try {
      const source = await file.text();
      const html = /\.html?$/i.test(file.name) ? new DOMParser().parseFromString(source, "text/html").body.innerHTML : source.split("\n").map((line) => "<p>" + escapeHtml(line) + "</p>").join("");
      const clean = sanitizeNoteHtml(html);
      editorRef.current.innerHTML = clean; setDraftHtml(clean); setSaveStatus("Unsaved changes");
    } catch { onToast("Could not import this file."); }
  };
  const editorPaneRef = useRef<HTMLElement>(null);
  const drawingSceneExporterRef = useRef<(() => Promise<ExportedNoteDiagram>) | null>(null);
  const editorCursorRangeRef = useRef<Range | null>(null);
  const restoreCaretAfterDiagramIdRef = useRef<string | null>(null);

  const currentDraftSignature = useRef("");
  currentDraftSignature.current = JSON.stringify([draftTitle, draftHtml, draftColor, inkData, coverUrl, pageTheme, pageIcon, coverPosition]);
  const selected = notes.find((note) => note.id === selectedId) ?? null;
  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const keepVisible = () => {
      const rect = toolbar.getBoundingClientRect();
      setToolbarPosition((position) => {
        if (!position) return position;
        const x = Math.max(8, Math.min(window.innerWidth - rect.width - 8, position.x));
        const y = Math.max(8, Math.min(window.innerHeight - rect.height - 8, position.y));
        return x === position.x && y === position.y ? position : { x, y };
      });
    };
    const observer = new ResizeObserver(keepVisible); observer.observe(toolbar);
    window.addEventListener("resize", keepVisible);
    return () => { observer.disconnect(); window.removeEventListener("resize", keepVisible); };
  }, [selectedId]);
  const diagramStore = readDiagramStore(inkData);
  const savedDiagramCount = diagramStore.diagrams.length + (diagramStore.legacyScene ? 1 : 0);
  const inboxFolderId = folders.find((folder) => folder.name.trim().toLowerCase() === "inbox")?.id ?? "inbox";
  useEffect(() => {
    const handleNotesShortcuts = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleNotesShortcuts);
    return () => window.removeEventListener("keydown", handleNotesShortcuts);
  }, []);
  useEffect(() => {
    if (!selectedId) {
      const firstActive = loadedNote.current ? undefined : notes.find((note) => !note.archived);
      if (firstActive) setSelectedId(firstActive.id);
      return;
    }
    if (!notes.some((note) => note.id === selectedId)) setSelectedId(notes.find((note) => !note.archived)?.id ?? null);
  }, [notes, selectedId]);
  useEffect(() => {
    if (!selected) {
      setDraftTitle(""); setDraftHtml(""); return;
    }
    loadedNote.current = selected.id;
    let settings: { theme?: string; icon?: string; coverPosition?: number } = {};
    try { settings = JSON.parse(selected.editorSettings || "{}"); } catch { /* Legacy notes use defaults. */ }
    setPageTheme(["white", "black", "warm", "ruled", "grid", "dots"].includes(settings.theme ?? "") ? settings.theme! : "white");
    setPageIcon(settings.icon ?? ""); setCoverPosition(settings.coverPosition ?? 50); setSaveStatus("Saved to account");
    setDraftTitle(selected.title); setDraftHtml(selected.bodyHtml); setDraftColor(selected.color); setInkData(selected.inkData ?? ""); setCoverUrl(selected.coverUrl ?? "");
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeNoteHtml(selected.bodyHtml);
      const diagramId = restoreCaretAfterDiagramIdRef.current;
      if (diagramId) {
        const insertedImage = editorRef.current.querySelector(`img[data-pios-diagram-id="${diagramId}"]`);
        if (insertedImage) {
          const lineBreak = insertedImage.nextSibling;
          const range = document.createRange();
          if (lineBreak && lineBreak.nodeName === "BR") range.setStartAfter(lineBreak);
          else range.setStartAfter(insertedImage);
          range.collapse(true);
          editorRef.current.focus();
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        restoreCaretAfterDiagramIdRef.current = null;
      }
    }
  }, [selectedId]);

  const visibleNotes = useMemo(() => {
    let result = notes.filter((note) => {
      const filterMatch = filter === "archived" ? note.archived : filter === "pinned" ? note.pinned && !note.archived : !note.archived;
      const folderMatch = selectedFolderId === "all" || note.folderId === selectedFolderId;
      const searchMatch = !search.trim() || `${note.title} ${note.plainText} ${folders.find((folder) => folder.id === note.folderId)?.name ?? ""}`.toLowerCase().includes(search.toLowerCase());
      return filterMatch && folderMatch && searchMatch;
    });
    if (sort === "recent") result = result.sort((a, b) => b.order - a.order);
    else if (sort === "title") result = result.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "oldest") result = result.sort((a, b) => a.order - b.order);
    else result = result.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return result;
  }, [notes, folders, selectedFolderId, filter, search, sort]);

  const updateNote = (id: string, patch: Partial<PiosNote>) => onNotesChange(notes.map((note) => note.id === id ? { ...note, ...patch } : note));
  const saveDraft = async () => {
    if (!selected) return true;
    const html = editorRef.current ? sanitizeNoteHtml(editorRef.current.innerHTML) : draftHtml;
    const body = plainTextFromHtml(html);
    const patch = { title: draftTitle.trim() || "Untitled note", bodyHtml: html, plainText: body, color: draftColor, inkData, coverUrl,
      editorSettings: JSON.stringify({ theme: pageTheme, icon: pageIcon, coverPosition }), updatedAt: "Just now", order: Date.now() };
    const signature = currentDraftSignature.current;
    setSaveStatus("Saving…");
    const result = await onNotesChange(notes.map((note) => note.id === selected.id ? { ...note, ...patch } : note));
    if (signature === currentDraftSignature.current) setSaveStatus(result === false ? "Not saved — retry" : "Saved to account");
    return result !== false;
  };
  saveLatest.current = saveDraft;
  useEffect(() => {
    if (!selected || loadedNote.current !== selected.id) return;
    const settings = JSON.stringify({ theme: pageTheme, icon: pageIcon, coverPosition });
    if (draftTitle === selected.title && draftHtml === selected.bodyHtml && draftColor === selected.color && inkData === (selected.inkData ?? "") && coverUrl === (selected.coverUrl ?? "") && settings === selected.editorSettings) return;
    setSaveStatus("Unsaved changes");
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void saveLatest.current(), 1100);
    return () => clearTimeout(autosaveTimer.current);
  }, [draftTitle, draftHtml, draftColor, inkData, coverUrl, pageTheme, pageIcon, coverPosition]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saveStatus !== "Saved to account") { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus]);
  const rememberEditorCursor = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) editorCursorRangeRef.current = range.cloneRange();
  };
  const openNewDiagram = () => {
    rememberEditorCursor();
    const store = readDiagramStore(inkData);
    setEditingDiagramId(null);
    setDrawingInitialData(store.legacyScene ?? "");
    setDrawingOpen(true);
  };
  const openExistingDiagram = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const image = target.closest("img[data-pios-diagram-id]") as HTMLImageElement | null;
    if (!image || !selected) return;
    const id = image.dataset.piosDiagramId;
    if (!id) return;
    const diagram = readDiagramStore(inkData).diagrams.find((item) => item.id === id);
    if (!diagram) {
      onToast("The editable source for this diagram could not be found.");
      return;
    }
    setEditingDiagramId(id);
    setDrawingInitialData(diagram.sceneData);
    setDrawingOpen(true);
  };
  const saveDrawing = async (provided?: ExportedNoteDiagram) => {
    if (!selected || drawingSaving) return;
    const exporter = drawingSceneExporterRef.current;
    if (!exporter && !provided) {
      onToast("The drawing workspace is still loading.");
      return;
    }
    setDrawingSaving(true);
    try {
      const exported = provided ?? await exporter!();
      if (exported.previewDataUrl.length > 3_500_000) {
        throw new Error("This diagram preview is over 3.5 MB. Reduce its size or remove large embedded images.");
      }
      const diagramId = provided ? crypto.randomUUID() : editingDiagramId ?? crypto.randomUUID();
      const store = readDiagramStore(inkData);
      const diagrams = [...store.diagrams];
      const existingIndex = diagrams.findIndex((item) => item.id === diagramId);
      const record = { id: diagramId, sceneData: exported.sceneData };
      if (existingIndex >= 0) diagrams[existingIndex] = record;
      else diagrams.push(record);
      const nextInkData = JSON.stringify({ format: "pios-diagrams-v1", diagrams });

      const editor = editorRef.current;
      if (!editor) throw new Error("The note editor is no longer available.");
      let image = editor.querySelector(`img[data-pios-diagram-id="${diagramId}"]`) as HTMLImageElement | null;
      const previousPreviewSize = image?.getAttribute("src")?.length ?? 0;
      const projectedHtmlSize = editor.innerHTML.length - previousPreviewSize + exported.previewDataUrl.length + (image ? 0 : 220);
      if (projectedHtmlSize > 4_000_000) {
        throw new Error("This note has reached its 4 MB content limit. Remove a large image or diagram first.");
      }
      if (nextInkData.length > 12_000_000) {
        throw new Error("This note's editable drawing data exceeds the 12 MB limit.");
      }
      if (image) {
        image.src = exported.previewDataUrl;
        image.alt = "Editable diagram — double-click to modify";
        image.title = "Double-click to edit this diagram";
      } else {
        restoreCaretAfterDiagramIdRef.current = diagramId;
        image = document.createElement("img");
        image.src = exported.previewDataUrl;
        image.alt = "Editable diagram — double-click to modify";
        image.className = "pios-inline-diagram";
        image.title = "Double-click to edit this diagram";
        image.dataset.piosDiagramId = diagramId;
        image.contentEditable = "false";

        let range = editorCursorRangeRef.current;
        if (!range || !editor.contains(range.commonAncestorContainer)) {
          range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
        }
        range.deleteContents();
        range.insertNode(image);
        const lineBreak = document.createElement("br");
        image.after(lineBreak);
        const caret = document.createRange();
        caret.setStartAfter(lineBreak);
        caret.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(caret);
      }

      const nextHtml = sanitizeNoteHtml(editor.innerHTML);
      const updated: PiosNote = {
        ...selected,
        title: draftTitle.trim() || "Untitled note",
        bodyHtml: nextHtml,
        plainText: plainTextFromHtml(nextHtml),
        color: draftColor,
        inkData: nextInkData,
        coverUrl,
        updatedAt: "Just now",
        order: Date.now(),
      };
      if (await onNotesChange(notes.map((note) => note.id === selected.id ? updated : note)) === false) throw new Error("The drawing was not saved. Please retry.");
      setDraftHtml(nextHtml);
      setInkData(nextInkData);
      setSaveStatus("Saved to account");
      setDrawingOpen(false);
      setEditingDiagramId(null);
      editorCursorRangeRef.current = null;
      onToast(editingDiagramId ? "Diagram updated in this note." : "Diagram inserted at the cursor.");
      return true;
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not save the diagram.");
      return false;
    } finally {
      setDrawingSaving(false);
    }
  };
  const cancelDrawing = () => {
    drawingSceneExporterRef.current = null;
    setDrawingOpen(false);
    setEditingDiagramId(null);
    setDrawingInitialData("");
  };
  const createFolder = (event: FormEvent) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    const folder: NoteFolder = { id: crypto.randomUUID(), name, color: "#8c9a90" };
    onFoldersChange([...folders, folder]); setSelectedFolderId(folder.id); setFolderName(""); setFolderDialog(false);
  };
  const reorder = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const ordered = [...notes];
    const from = ordered.findIndex((note) => note.id === draggedId);
    const to = ordered.findIndex((note) => note.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = ordered.splice(from, 1); ordered.splice(to, 0, item);
    onNotesChange(ordered.map((note, index) => ({ ...note, order: index })));
    setDraggedId(null);
  };
  const format = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) setDraftHtml(sanitizeNoteHtml(editorRef.current.innerHTML));
  };
  const insertChecklist = () => {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, '<ul><li><input type="checkbox" /> New task</li></ul><p><br></p>');
    if (editorRef.current) setDraftHtml(sanitizeNoteHtml(editorRef.current.innerHTML));
  };
  const handleEditorInput = () => { if (editorRef.current) setDraftHtml(sanitizeNoteHtml(editorRef.current.innerHTML)); };
  const askPios = async (instruction?: string) => {
    const question = instruction ?? askText.trim();
    if (!question || !selected || askBusy) return;
    setAskBusy(true); setAskAnswer(""); setAskCitations([]);
    const context = "Current note title: " + draftTitle + "\nCurrent note content:\n" + plainTextFromHtml(draftHtml).slice(0,5500);
    try {
      const response = await sendChat(context + "\n\nUser question: " + question.slice(0,1800), askConversationId, true);
      setAskConversationId(response.conversationId);
      setAskAnswer(response.answer); setAskCitations(response.citations);
    } catch (error) {
      setAskAnswer(error instanceof Error ? error.message : "Could not contact Ask PIOS. Check your provider connection.");
    } finally { setAskBusy(false); }
  };
  const startToolbarDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest("[data-toolbar-handle]")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    const move = (moveEvent: PointerEvent) => setToolbarPosition({
      x: Math.max(8, Math.min(window.innerWidth - rect.width - 8, origin.left + moveEvent.clientX - origin.x)),
      y: Math.max(8, Math.min(window.innerHeight - rect.height - 8, origin.top + moveEvent.clientY - origin.y)),
    });
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); setToolbarDragging(false); };
    setToolbarPosition({ x: rect.left, y: rect.top });
    setToolbarDragging(true); window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
  };

  const handleCoverFile = (file?: File) => {
    if (!file || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) { onToast("Choose a PNG, JPEG, WebP or GIF cover."); return; }
    if (file.size > 2 * 1024 * 1024) { onToast("Cover images must be 2 MB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = () => setCoverUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const commands = [
    ["text", "Text"], ["h1", "Heading 1"], ["h2", "Heading 2"], ["h3", "Heading 3"],
    ["bold", "Bold / unbold"], ["italic", "Italic"], ["bullet", "Bulleted list"], ["number", "Numbered list"],
    ["todo", "Checklist"], ["quote", "Quote"], ["divider", "Divider"], ["table", "Table"],
    ["java", "Java code"], ["python", "Python code"], ["sql", "SQL code"], ["javascript", "JavaScript code"],
    ["json", "JSON code"], ["shell", "Terminal / shell code"], ["diagram", "Diagram / design library"], ["draft", "Draft rough sheet"], ["ask", "Ask PIOS"]
  ];
  const filteredCommands = commands.filter(([, label]) => label.toLowerCase().includes(slashQuery.toLowerCase()));
  const insertBlock = (kind: string) => {
    editorRef.current?.focus();
    const range = editorCursorRangeRef.current;
    if (range && editorRef.current?.contains(range.commonAncestorContainer)) { const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
    setSlashOpen(false); setSlashQuery("");
    if (kind === "diagram") { openNewDiagram(); return; }
    if (kind === "draft") { setDraftOpen(true); return; }
    if (kind === "ask") { setAskOpen(true); return; }
    if (kind === "bold" || kind === "italic") { format(kind); return; }
    const html: Record<string, string> = { text: "<p><br></p>", h1: "<h1><br></h1>", h2: "<h2><br></h2>", h3: "<h3><br></h3>", bullet: "<ul><li><br></li></ul>", number: "<ol><li><br></li></ol>", todo: '<ul><li><input type="checkbox" /></li></ul>', quote: "<blockquote><br></blockquote>", divider: "<hr>", table: "<table><tbody><tr><th>Column 1</th><th>Column 2</th></tr><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>" };
    const code = ["java", "python", "sql", "javascript", "json", "shell"].includes(kind);
    document.execCommand("insertHTML", false, code ? "<p>" + escapeHtml(kind) + "</p><pre><code><br></code></pre><p><br></p>" : html[kind] || html.text);
    handleEditorInput();
  };
  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (event.key === "/" && !selection?.toString() && (!selection?.anchorNode?.textContent?.trim() || selection.anchorOffset === 0)) {
      event.preventDefault(); rememberEditorCursor(); setSlashQuery(""); setSlashIndex(0); setSlashOpen(true);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveDraft(); }
    if (event.key === " " && selection?.anchorNode?.nodeType === Node.TEXT_NODE) {
      const prefix = selection.anchorNode.textContent?.slice(0, selection.anchorOffset);
      const command = prefix === "-" ? "insertUnorderedList" : prefix === "1." ? "insertOrderedList" : "";
      if (command || prefix === "[ ]") {
        event.preventDefault();
        for (let i = 0; i < prefix!.length; i++) document.execCommand("delete");
        if (command) format(command); else document.execCommand("insertHTML", false, '<ul><li><input type="checkbox" />&nbsp;</li></ul>');
        handleEditorInput();
      }
    }
    if (event.key === "Escape") setSlashOpen(false);
  };
  const downloadFile = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  };
  const exportCsv = () => {
    if (!selected) return;
    const cell = (value: string) => '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replace(/"/g, '""') + '"';
    const rows = [["Title", "Text", "Folder", "Pinned", "Archived", "Updated"], [draftTitle, plainTextFromHtml(draftHtml), folders.find((folder) => folder.id === selected.folderId)?.name ?? "", String(selected.pinned), String(selected.archived), selected.updatedAt]];
    const doc = new DOMParser().parseFromString(draftHtml, "text/html");
    doc.querySelectorAll("table").forEach((table, index) => { rows.push([], ["Table " + (index + 1)]); table.querySelectorAll("tr").forEach((row) => rows.push(Array.from(row.querySelectorAll("th,td")).map((cell) => cell.textContent ?? ""))); });
    downloadFile((draftTitle || "pios-note") + ".csv", "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8"); setMoreOpen(false);
  };
  const exportDocument = () => '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(draftTitle) + '</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:24px;color:' + (pageTheme === "black" ? '#eee;background:#202124' : '#253b30;background:' + (pageTheme === "warm" ? '#f5eedc' : '#fff')) + '}img{max-width:100%;height:auto}img.cover{width:100%;max-height:240px;object-fit:cover;object-position:center ' + coverPosition + '%}pre{white-space:pre-wrap;padding:16px;background:#26342f;color:white}table{border-collapse:collapse;width:100%}td,th{border:1px solid #8a9b91;padding:8px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0}}</style></head><body>' + (coverUrl ? '<img class="cover" alt="Page cover" src="' + escapeHtml(coverUrl) + '">' : '') + '<h1>' + escapeHtml(pageIcon + ' ' + draftTitle) + '</h1>' + sanitizeNoteHtml(editorRef.current?.innerHTML ?? draftHtml) + '</body></html>';
  const exportHtml = () => {
    if (!selected) return;
    const html = exportDocument();
    downloadFile((draftTitle || "pios-note") + ".html", html, "text/html"); setMoreOpen(false);
  };
  const exportPdf = () => {
    if (!selected) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { onToast("Allow pop-ups to export as PDF."); return; }
    win.document.write(exportDocument());
    win.document.close(); win.focus();
    void Promise.all(Array.from(win.document.images).map((image) => image.decode().catch(() => {}))).then(() => win.print());
    setMoreOpen(false);
  };
  const duplicateNote = () => {
    if (!selected) return;
    const copy: PiosNote = { ...selected, id: crypto.randomUUID(), title: selected.title + " (copy)", pinned: false, archived: false, updatedAt: "Just now", order: Date.now() };
    onNotesChange([copy, ...notes]); setSelectedId(copy.id); setMoreOpen(false); onToast("Note duplicated.");
  };
  const deleteNote = async (note: PiosNote) => {
    if (!window.confirm('Permanently delete "' + note.title + '"? This cannot be undone.')) return;
    clearTimeout(autosaveTimer.current);
    if (note.id !== selectedId && !await saveLatest.current()) return;
    const removed = onDeleteNote ? await onDeleteNote(note.id) : await onNotesChange(notes.filter((row) => row.id !== note.id));
    if (removed === false) return;
    if (note.id === selectedId) setSelectedId(null);
    setMoreOpen(false); onToast("Note permanently deleted.");
  };
  const deletePermanently = () => selected && deleteNote(selected);
  const removeFolder = async (folder: NoteFolder) => {
    if (deletingFolder || !window.confirm('Delete folder "' + folder.name + '"? Its notes will move to Inbox.')) return;
    setDeletingFolder(true);
    try {
      clearTimeout(autosaveTimer.current);
      if (!await saveLatest.current()) return;
      if (onDeleteFolder) { if (!await onDeleteFolder(folder.id)) return; }
      else {
        if (await onNotesChange(notes.map((note) => note.folderId === folder.id ? { ...note, folderId: inboxFolderId } : note)) === false) return;
        onFoldersChange(folders.filter((row) => row.id !== folder.id));
      }
      if (selectedFolderId === folder.id) setSelectedFolderId(inboxFolderId);
      onToast("Folder deleted. Its notes are in Inbox.");
    } finally { setDeletingFolder(false); }
  };
  const toggleFullscreen = async () => {
    const expand = !editorExpanded;
    setEditorExpanded(expand);
    try {
      if (!expand && document.fullscreenElement) await document.exitFullscreen();
      else if (expand) await editorPaneRef.current?.requestFullscreen?.();
    } catch { /* In-app focus mode also works where the browser disallows native fullscreen. */ }
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !drawingOpen && !draftOpen) setEditorExpanded(false); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [drawingOpen, draftOpen]);

  const toggleArchive = () => { if (!selected) return; updateNote(selected.id, { archived: !selected.archived }); setSelectedId(null); onToast(selected.archived ? "Note restored." : "Note archived. You can find it under Archived."); };
  const togglePin = () => { if (!selected) return; updateNote(selected.id, { pinned: !selected.pinned }); onToast(selected.pinned ? "Note unpinned." : "Note pinned."); };
  const folderTitle = selectedFolderId === "all" ? "All notes" : folders.find((folder) => folder.id === selectedFolderId)?.name ?? "Notes";
  const currentFolderId = selected?.folderId || inboxFolderId;

  return <NotesWorkspaceLayout foldersCollapsed={foldersCollapsed}>
    <aside className="notes-folder-pane">
      <button type="button" className="notes-folder-toggle" onClick={toggleFolders} aria-expanded={!foldersCollapsed} aria-label={foldersCollapsed ? "Expand folders" : "Collapse folders"} title={foldersCollapsed ? "Expand folders" : "Collapse folders"}><Icon name="chevron-right" size={18}/>{!foldersCollapsed && <span>Collapse folders</span>}</button>
      <div className="notes-pane-heading"><span>YOUR NOTES</span><button className="icon-button" onClick={onQuickCapture} aria-label="Create a note"><Icon name="plus" size={16}/></button></div>
      <button title="All notes" aria-label="All notes" className={`notes-folder-row ${selectedFolderId === "all" ? "active" : ""}`} onClick={() => setSelectedFolderId("all")}><Icon name="layers" size={16}/><span>All notes</span><b>{notes.filter((note) => !note.archived).length}</b></button>
      <button title="Inbox" aria-label="Inbox" className={`notes-folder-row ${selectedFolderId === inboxFolderId ? "active" : ""}`} onClick={() => setSelectedFolderId(inboxFolderId)}><Icon name="inbox" size={16}/><span>Inbox</span><b>{notes.filter((note) => note.folderId === inboxFolderId && !note.archived).length}</b></button>
      <div className="notes-folder-subhead"><span>FOLDERS</span><button onClick={() => setFolderDialog(true)} aria-label="Create folder"><Icon name="plus" size={14}/></button></div>
      {folders.filter((folder) => folder.id !== inboxFolderId).map((folder) => <div className="notes-folder-item" key={folder.id}>
        <button title={folder.name} aria-label={folder.name} className={`notes-folder-row ${selectedFolderId === folder.id ? "active" : ""}`} onClick={() => setSelectedFolderId(folder.id)}><span className="folder-color-dot" style={{ background: folder.color }}/><span>{folder.name}</span><b>{notes.filter((note) => note.folderId === folder.id && !note.archived).length}</b></button>
        <button type="button" className="notes-delete-button" title={`Delete folder ${folder.name}`} aria-label={`Delete folder ${folder.name}`} disabled={deletingFolder} onClick={() => void removeFolder(folder)}><Icon name="trash" size={12}/></button>
      </div>)}
      <div className="notes-folder-bottom"><div><Icon name="shield-check" size={15}/><span>Synced to your PIOS account</span></div><small>Stored in your PIOS database</small></div>
    </aside>

    <section className="notes-list-pane">
      <div className="notes-list-header"><div><div className="eyebrow">PERSONAL KNOWLEDGE</div><h1>{folderTitle}</h1><p>{visibleNotes.length} {visibleNotes.length === 1 ? "note" : "notes"}</p></div><button className="button button-primary button-small" onClick={onQuickCapture}><Icon name="plus" size={14}/>New note</button></div>
      <div className="notes-search"><Icon name="search" size={15}/><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your notes..."/><kbd>⌘ F</kbd></div>
      <div className="notes-list-toolbar"><div className="notes-filter-tabs"><button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>All</button><button className={filter === "pinned" ? "active" : ""} onClick={() => setFilter("pinned")}>Pinned</button><button className={filter === "archived" ? "active" : ""} onClick={() => setFilter("archived")}>Archived</button></div><select aria-label="Sort notes" value={sort} onChange={(event) => setSort(event.target.value)}><option value="manual">My order</option><option value="recent">Recently updated</option><option value="oldest">Oldest</option><option value="title">Title</option></select></div>
      <div className="notes-card-list">
        {visibleNotes.map((note) => <div className="notes-card-item" key={note.id}><button aria-label={note.title} draggable onDragStart={() => setDraggedId(note.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(note.id)} onDragEnd={() => setDraggedId(null)} className={`note-list-card ${note.color} ${selectedId === note.id ? "selected" : ""} ${draggedId === note.id ? "dragging" : ""}`} onClick={async () => { clearTimeout(autosaveTimer.current); if (await saveLatest.current()) setSelectedId(note.id); }}>
          <div className="note-list-card-top"><span>{note.pinned && <Icon name="pin" size={12}/>}<span>{folders.find((folder) => folder.id === note.folderId)?.name ?? "Inbox"}</span></span><span className="note-card-time">{note.updatedAt}</span></div>
          <strong>{note.title}</strong><p>{note.plainText || "No additional text"}</p>
          <div className="note-list-card-bottom"><span>{Math.max(1, Math.ceil(note.plainText.length / 240))} min read</span><span className="drag-handle" title="Drag to reorder"><Icon name="grip" size={14}/></span></div>
        </button><button type="button" className="notes-delete-button" title={`Delete note ${note.title}`} aria-label={`Delete note ${note.title}`} onClick={() => void deleteNote(note)}><Icon name="trash" size={13}/></button></div>)}
        {visibleNotes.length === 0 && <div className="notes-empty"><div><Icon name="sticky-note" size={22}/></div><strong>No notes here yet</strong><p>Create a note or change the current filters.</p><button className="button button-secondary button-small" onClick={onQuickCapture}>Create a note</button></div>}
      </div>
    </section>

    <section ref={editorPaneRef} className={`note-editor-pane page-${pageTheme} ${editorExpanded ? "editor-expanded" : ""} ${minimized ? "editor-minimized" : ""}`}>
      {selected ? minimized ? <div className="editor-restore"><span>{draftTitle || "Untitled note"}</span><div><button type="button" onClick={() => setMinimized(false)}>Restore</button><button type="button" onClick={() => { setMinimized(false); setSelectedId(null); }}>Close</button></div></div> : <>
        <div className="note-editor-toolbar-top"><div><span className="saved-indicator"><i/> {saveStatus}</span><span className="editor-updated">Edited {selected.updatedAt.toLowerCase()}</span></div><div className="note-editor-actions"><button className="icon-button" title="Close editor" onClick={async () => { clearTimeout(autosaveTimer.current); if (await saveLatest.current()) setSelectedId(null); }}><Icon name="x" size={16}/></button><button className="icon-button" title="Minimise" onClick={() => { setMinimized(true); setEditorExpanded(false); }}><Icon name="minus" size={16}/></button><button className="icon-button" title={editorExpanded ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>⛶</button><button className={`icon-button ${selected.pinned ? "pinned" : ""}`} title={selected.pinned ? "Unpin note" : "Pin note"} onClick={togglePin}><Icon name="pin" size={16}/></button><button className="icon-button" title={selected.archived ? "Restore note" : "Archive note"} onClick={toggleArchive}><Icon name="archive" size={16}/></button><div className="note-more-wrap"><button className="icon-button" title="More actions" aria-expanded={moreOpen} onClick={() => setMoreOpen(v => !v)}><Icon name="more" size={17}/></button>{moreOpen && <div className="note-more-menu"><button className="danger" onClick={deletePermanently}><Icon name="trash" size={15}/>Delete permanently</button><button onClick={duplicateNote}><Icon name="file-plus" size={15}/>Duplicate note</button><button onClick={exportCsv}>Export CSV</button><button onClick={exportHtml}><Icon name="braces" size={15}/>Export HTML</button><button onClick={exportPdf}><Icon name="file" size={15}/>Export PDF</button></div>}</div></div></div>
        <NoteEdgeRail notes={notes} selectedId={selectedId} onSelect={async (id) => {
          clearTimeout(autosaveTimer.current);
          try {
            if (!await saveLatest.current()) return;
            setSelectedFolderId("all"); setFilter("active"); setSearch(""); setSelectedId(id);
          } catch { onToast("Could not switch notes. Save your changes and retry."); }
        }}/>
        <div className="note-editor-content">
          <div className="note-cover" style={coverUrl ? { backgroundImage: `url(${coverUrl})`, backgroundPosition: `center ${coverPosition}%` } : undefined}><button type="button" onClick={() => coverInputRef.current?.click()}>{coverUrl ? "Change cover" : "Add cover"}</button>{coverUrl && <button type="button" onClick={() => setCoverUrl("")}>Remove</button>}<input ref={coverInputRef} hidden type="file" accept="image/*" onChange={(event) => handleCoverFile(event.target.files?.[0])}/></div>
          <div className="page-preferences"><input aria-label="Page icon" placeholder="Page icon" value={pageIcon} maxLength={12} onChange={(event) => setPageIcon(event.target.value)}/><select aria-label="Page appearance" value={pageTheme} onChange={(event) => setPageTheme(event.target.value)}>{["white", "black", "warm", "ruled", "grid", "dots"].map((theme) => <option key={theme} value={theme}>{theme}</option>)}</select>{coverUrl && <label>Cover position<input aria-label="Cover position" type="range" min="0" max="100" value={coverPosition} onChange={(event) => setCoverPosition(Number(event.target.value))}/></label>}<button onClick={() => setDraftOpen(true)}>✎ Draft</button><button onClick={() => importInputRef.current?.click()}>Import HTML / text</button><input hidden ref={importInputRef} type="file" accept=".html,.htm,.txt" onChange={(event) => { void importContent(event.target.files?.[0]); event.target.value = ""; }}/><button onClick={() => setAskOpen(!askOpen)}>✦ Ask PIOS</button></div><input className="note-editor-title" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Untitled note" aria-label="Note title"/>
          <div className="note-editor-meta"><span><Icon name="folder" size={13}/>{folders.find((folder) => folder.id === selected.folderId)?.name ?? "Inbox"}</span><span><Icon name="clock" size={13}/>{selected.updatedAt}</span></div>
          <div ref={toolbarRef} className={`rich-toolbar floating-rich-toolbar toolbar-${toolbarOrientation}`} role="toolbar" aria-label="Text formatting" aria-orientation={toolbarOrientation} onPointerDown={startToolbarDrag} style={toolbarPosition ? { position: "fixed", left: toolbarPosition.x, top: toolbarPosition.y, bottom: "auto", right: "auto", margin: 0, height: "auto", maxWidth: "calc(100vw - 16px)", zIndex: 50, cursor: toolbarDragging ? "grabbing" : undefined } : undefined}>
             <span data-toolbar-handle title="Drag toolbar" style={{ cursor: "grab", padding: "0 6px", touchAction: "none" }}>⠿</span>
            <button type="button" title={toolbarOrientation === "horizontal" ? "Use vertical toolbar" : "Use horizontal toolbar"} aria-label={toolbarOrientation === "horizontal" ? "Use vertical toolbar" : "Use horizontal toolbar"} onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={toggleToolbarOrientation}>{toolbarOrientation === "horizontal" ? "↕" : "↔"}</button>
            <button type="button" title="Bold (Ctrl+B)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("bold")}><b>B</b></button>
            <button type="button" title="Italic (Ctrl+I)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("italic")}><i>I</i></button>
            <button type="button" title="Underline (Ctrl+U)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("underline")}><u>U</u></button>
            <button type="button" title="Strikethrough" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("strikeThrough")}><s>S</s></button>
            <i className="toolbar-divider"/>
            <button type="button" title="Bulleted list" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("insertUnorderedList")}><Icon name="list" size={15}/></button>
            <button type="button" title="Numbered list" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("insertOrderedList")}><Icon name="list-ordered" size={15}/></button>
            <button type="button" title="Checklist" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={insertChecklist}><Icon name="list-checks" size={15}/></button>
            <button type="button" title="Add link" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => { const url = window.prompt("Enter link URL"); if (url) format("createLink", url); }}><Icon name="link" size={15}/></button>
            <button type="button" title="Insert diagram at cursor" onMouseDown={rememberEditorCursor} onClick={openNewDiagram}><Icon name="pencil-ruler" size={15}/></button>
          </div>
          <div className="note-editor-body-wrap"><div ref={editorRef} className="note-rich-editor" contentEditable suppressContentEditableWarning onInput={handleEditorInput} onKeyDown={handleEditorKeyDown} onDoubleClick={openExistingDiagram} data-placeholder="Type / for commands, or start writing..." />{slashOpen && <div className="slash-command-menu" role="dialog" aria-label="Slash commands"><input autoFocus aria-label="Search commands" placeholder="Search commands…" value={slashQuery} onChange={(event) => { setSlashQuery(event.target.value); setSlashIndex(0); }} onKeyDown={(event) => { if (event.key === "Escape") { setSlashOpen(false); editorRef.current?.focus(); } if (event.key === "ArrowDown") { event.preventDefault(); setSlashIndex((i) => Math.min(i + 1, filteredCommands.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setSlashIndex((i) => Math.max(0, i - 1)); } if (event.key === "Enter" && filteredCommands[slashIndex]) { event.preventDefault(); insertBlock(filteredCommands[slashIndex][0]); } }}/>{filteredCommands.map(([key,label], index) => <button className={slashIndex === index ? "active" : ""} key={key} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertBlock(key)}>{label}</button>)}{!filteredCommands.length && <p>No matching command</p>}</div>}</div>
          <section className="note-design-tools">
            <div className="note-design-tools-icon" aria-hidden="true">✎</div>
            <div className="note-design-tools-copy">
              <strong>Design tools</strong>
              <span>Insert a tightly cropped, editable diagram exactly where your text cursor is placed.</span>
              <small>{savedDiagramCount} saved diagram{savedDiagramCount === 1 ? "" : "s"} · Double-click a diagram to edit it.</small>
            </div>
            <button type="button" className="button button-secondary button-small" onMouseDown={rememberEditorCursor} onClick={openNewDiagram}>Insert diagram</button>
          </section>
          <button type="button" className="ask-pios-fab" onClick={() => setAskOpen(!askOpen)}><Icon name="sparkles" size={15}/> Ask PIOS</button>
          {askOpen && <div className="ask-pios-panel"><strong>Ask PIOS</strong><p>Relevant content from this note and your workspace is sent to your configured AI provider.</p><button disabled={askBusy} onClick={() => void askPios("Review this material for factual errors and contradictions. Separate supported statements, suggested corrections, and unresolved uncertainty. Cite supplied sources when they support a finding. Do not claim external verification without evidence.")}>Review material</button><textarea value={askText} onChange={(event) => setAskText(event.target.value)} placeholder="Ask something about this page..." rows={3}/><button className="button button-primary button-small" disabled={!askText.trim() || askBusy} onClick={() => void askPios()}>{askBusy ? "Thinking…" : "Ask"}</button>{askAnswer && <div className="ask-pios-answer" role="status">{askAnswer}{askCitations.length > 0 && <ul>{askCitations.map((source) => <li key={source.chunkId || source.id}><details><summary>[{source.number}] {source.title}</summary><blockquote>{source.excerpt}</blockquote></details></li>)}</ul>}</div>}</div>}
          <div className="note-editor-footer"><div className="note-color-picker">{colors.map((color) => <button key={color.id} type="button" title={color.name} aria-label={color.name} className={`note-color-dot ${color.id} ${draftColor === color.id ? "selected" : ""}`} onClick={() => setDraftColor(color.id)}/>)}</div><span>{plainTextFromHtml(draftHtml).trim().split(/\s+/).filter(Boolean).length} words</span><button className="button button-primary button-small" onClick={() => void saveDraft()}><Icon name="check" size={14}/>Save changes</button></div>
          <div className="note-routing-toggle"><button onClick={() => setShowDestination((value) => !value)}><Icon name="sparkles" size={14}/> Organise this note with PIOS <Icon name="chevron-down" size={13}/></button></div>
          {showDestination && <NoteDestination title={draftTitle} body={plainTextFromHtml(draftHtml)} folders={folders} notes={notes} folderId={currentFolderId} excludeId={selected.id} onFolderChange={(folderId) => updateNote(selected.id, { folderId })} onFoldersChange={onFoldersChange}/>}
        </div>
      </> : <div className="note-editor-empty"><div><Icon name="sticky-note" size={27}/></div><h3>Select a note</h3><p>Choose a note from the list or create a new one to start writing.</p><button className="button button-primary button-small" onClick={onQuickCapture}><Icon name="plus" size={14}/>Create note</button></div>}
    </section>

    <DraftStudio open={draftOpen} onClose={() => setDraftOpen(false)} onPromote={async (_title, scene, png) => Boolean(await saveDrawing({ sceneData: scene, previewDataUrl: png }))}/>
    {drawingOpen && selected && <div className="pios-design-studio-overlay" role="dialog" aria-modal="true" aria-label="Design tools">
      <section className="pios-design-studio">
        <header className="pios-design-studio-header">
          <div><span className="pios-design-studio-eyebrow">PIOS DESIGN TOOLS</span><h2>{editingDiagramId ? "Edit diagram" : "New diagram"} · {draftTitle || selected.title}</h2><p>Draw only the diagram. PIOS will crop to its content and place it at your saved cursor position.</p></div>
          <button type="button" className="icon-button" aria-label="Close design tools" onClick={cancelDrawing}><Icon name="x" size={18}/></button>
        </header>
        <div className="pios-design-studio-canvas">
          <NoteDrawingCanvas key={selected.id + (editingDiagramId ?? "new")} sceneData={drawingInitialData} onRegisterSceneExporter={(exporter) => { drawingSceneExporterRef.current = exporter; }} />
        </div>
        <footer className="pios-design-studio-footer">
          <span>The cropped preview appears in the note. Double-click it later to change arrows, shapes or labels.</span>
          <div><button type="button" className="button button-secondary" onClick={cancelDrawing}>Cancel</button><button type="button" className="button button-primary" disabled={drawingSaving} onClick={() => void saveDrawing()}><Icon name="check" size={15}/>{drawingSaving ? "Saving…" : editingDiagramId ? "Update diagram" : "Save & Insert"}</button></div>
        </footer>
      </section>
    </div>}
    {folderDialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFolderDialog(false); }}><form className="modal new-folder-modal" onSubmit={createFolder}><div className="modal-header"><div><div className="eyebrow">ORGANISE YOUR KNOWLEDGE</div><h2>Create a folder</h2><p>Folders keep related notes together.</p></div><button className="icon-button" type="button" onClick={() => setFolderDialog(false)}><Icon name="x"/></button></div><label htmlFor="folder-name">Folder name</label><input id="folder-name" autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="e.g. Java Concurrency"/><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setFolderDialog(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={!folderName.trim()}><Icon name="plus" size={14}/>Create folder</button></div></form></div>}
  </NotesWorkspaceLayout>;
}
