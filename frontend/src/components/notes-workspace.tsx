"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { Icon } from "@/components/icon";
import type { NoteFolder, NoteColor, PiosNote } from "@/lib/notes";
import { plainTextFromHtml, sanitizeNoteHtml, suggestNoteDestination } from "@/lib/notes";
import { sendChat } from "@/lib/api";

type NotesWorkspaceProps = {
  notes: PiosNote[];
  folders: NoteFolder[];
  onNotesChange: (notes: PiosNote[]) => void;
  onFoldersChange: (folders: NoteFolder[]) => void;
  onQuickCapture: () => void;
  onToast: (message: string) => void;
};

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

export default function NotesWorkspace({ notes, folders, onNotesChange, onFoldersChange, onQuickCapture, onToast }: NotesWorkspaceProps) {
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
  const [folderName, setFolderName] = useState("");
  const [showDestination, setShowDestination] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [drawingTool, setDrawingTool] = useState("select");
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askConversationId, setAskConversationId] = useState<string | undefined>();
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });
  const [toolbarDragging, setToolbarDragging] = useState(false);
  const [inkData, setInkData] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const coverInputRef = useRef<HTMLInputElement>(null);
  const editorPaneRef = useRef<HTMLElement>(null);

  const selected = notes.find((note) => note.id === selectedId) ?? null;
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
      const firstActive = notes.find((note) => !note.archived);
      if (firstActive) setSelectedId(firstActive.id);
      return;
    }
    if (!notes.some((note) => note.id === selectedId)) setSelectedId(notes.find((note) => !note.archived)?.id ?? null);
  }, [notes, selectedId]);
  useEffect(() => {
    if (!selected) {
      setDraftTitle(""); setDraftHtml(""); return;
    }
    setDraftTitle(selected.title); setDraftHtml(selected.bodyHtml); setDraftColor(selected.color); setInkData(selected.inkData ?? ""); setCoverUrl(selected.coverUrl ?? "");
    if (editorRef.current) editorRef.current.innerHTML = sanitizeNoteHtml(selected.bodyHtml);
  }, [selectedId, selected?.bodyHtml, selected?.title, selected?.color]);

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
  const saveDraft = () => {
    if (!selected) return;
    const body = plainTextFromHtml(draftHtml);
    updateNote(selected.id, { title: draftTitle.trim() || "Untitled note", bodyHtml: draftHtml, plainText: body, color: draftColor, inkData, coverUrl, updatedAt: "Just now", order: Date.now() });
    onToast("Note saved to your PIOS account.");
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
  const askPios = async () => {
    if (!askText.trim() || !selected || askBusy) return;
    setAskBusy(true); setAskAnswer("");
    const context = "Current note title: " + draftTitle + "\nCurrent note content:\n" + plainTextFromHtml(draftHtml);
    try {
      const response = await sendChat(context + "\n\nUser question: " + askText.trim(), askConversationId, true);
      setAskConversationId(response.conversationId);
      setAskAnswer(response.answer);
    } catch (error) {
      setAskAnswer(error instanceof Error ? error.message : "Could not contact Ask PIOS. Check your provider connection.");
    } finally { setAskBusy(false); }
  };
  const startToolbarDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!(event.target as HTMLElement).closest("[data-toolbar-handle]")) return;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    const move = (moveEvent: PointerEvent) => setToolbarPosition({ x: origin.left + moveEvent.clientX - origin.x, y: origin.top + moveEvent.clientY - origin.y });
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); setToolbarDragging(false); };
    setToolbarDragging(true); window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };

  const handleCoverFile = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 2 * 1024 * 1024) { onToast("Cover images must be 2 MB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = () => setCoverUrl(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const insertBlock = (kind: string) => {
    editorRef.current?.focus();
    const html: Record<string, string> = { text: "<p><br></p>", h1: "<h2><br></h2>", h2: "<h3><br></h3>", bullet: "<ul><li><br></li></ul>", number: "<ol><li><br></li></ol>", todo: '<ul><li><input type="checkbox" /></li></ul>', quote: "<blockquote><br></blockquote>", divider: "<hr>" };
    document.execCommand("insertHTML", false, html[kind] || html.text);
    handleEditorInput(); setSlashOpen(false);
  };
  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (event.key === "/" && !selection?.toString() && (!selection?.anchorNode?.textContent?.trim() || selection.anchorOffset === 0)) { event.preventDefault(); setSlashOpen(true); }
    if (event.key === "Escape") setSlashOpen(false);
  };
  const downloadFile = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  };
  const exportHtml = () => {
    if (!selected) return;
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(draftTitle) + '</title></head><body><h1>' + escapeHtml(draftTitle) + '</h1>' + sanitizeNoteHtml(draftHtml) + '</body></html>';
    downloadFile((draftTitle || "pios-note") + ".html", html, "text/html"); setMoreOpen(false);
  };
  const exportPdf = () => {
    if (!selected) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) { onToast("Allow pop-ups to export as PDF."); return; }
    win.document.write('<!doctype html><html><head><title>' + escapeHtml(draftTitle) + '</title><style>body{font:16px/1.7 Arial,sans-serif;max-width:780px;margin:56px auto;padding:0 28px;color:#1b2a24}</style></head><body><h1>' + escapeHtml(draftTitle) + '</h1>' + sanitizeNoteHtml(draftHtml) + '</body></html>');
    win.document.close(); win.focus(); win.print(); setMoreOpen(false);
  };
  const duplicateNote = () => {
    if (!selected) return;
    const copy: PiosNote = { ...selected, id: crypto.randomUUID(), title: selected.title + " (copy)", pinned: false, archived: false, updatedAt: "Just now", order: Date.now() };
    onNotesChange([copy, ...notes]); setSelectedId(copy.id); setMoreOpen(false); onToast("Note duplicated.");
  };
  const deletePermanently = () => {
    if (!selected || !window.confirm('Permanently delete "' + selected.title + '"? This cannot be undone.')) return;
    onNotesChange(notes.filter((note) => note.id !== selected.id)); setSelectedId(null); setMoreOpen(false); onToast("Note permanently deleted.");
  };
  const toggleFullscreen = async () => {
    if (!editorPaneRef.current) return;
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await editorPaneRef.current.requestFullscreen(); }
    catch { onToast("Fullscreen is not available in this browser."); }
  };

  const toggleArchive = () => { if (!selected) return; updateNote(selected.id, { archived: !selected.archived }); setSelectedId(null); onToast(selected.archived ? "Note restored." : "Note archived. You can find it under Archived."); };
  const togglePin = () => { if (!selected) return; updateNote(selected.id, { pinned: !selected.pinned }); onToast(selected.pinned ? "Note unpinned." : "Note pinned."); };
  const folderTitle = selectedFolderId === "all" ? "All notes" : folders.find((folder) => folder.id === selectedFolderId)?.name ?? "Notes";
  const currentFolderId = selected?.folderId || inboxFolderId;

  return <div className="notes-workspace">
    <aside className="notes-folder-pane">
      <div className="notes-pane-heading"><span>YOUR NOTES</span><button className="icon-button" onClick={onQuickCapture} aria-label="Create a note"><Icon name="plus" size={16}/></button></div>
      <button className={`notes-folder-row ${selectedFolderId === "all" ? "active" : ""}`} onClick={() => setSelectedFolderId("all")}><Icon name="layers" size={16}/><span>All notes</span><b>{notes.filter((note) => !note.archived).length}</b></button>
      <button className={`notes-folder-row ${selectedFolderId === inboxFolderId ? "active" : ""}`} onClick={() => setSelectedFolderId(inboxFolderId)}><Icon name="inbox" size={16}/><span>Inbox</span><b>{notes.filter((note) => note.folderId === inboxFolderId && !note.archived).length}</b></button>
      <div className="notes-folder-subhead"><span>FOLDERS</span><button onClick={() => setFolderDialog(true)} aria-label="Create folder"><Icon name="plus" size={14}/></button></div>
      {folders.filter((folder) => folder.id !== inboxFolderId).map((folder) => <button key={folder.id} className={`notes-folder-row ${selectedFolderId === folder.id ? "active" : ""}`} onClick={() => setSelectedFolderId(folder.id)}><span className="folder-color-dot" style={{ background: folder.color }}/><span>{folder.name}</span><b>{notes.filter((note) => note.folderId === folder.id && !note.archived).length}</b></button>)}
      <div className="notes-folder-bottom"><div><Icon name="shield-check" size={15}/><span>Synced to your PIOS account</span></div><small>Stored in your PIOS database</small></div>
    </aside>

    <section className="notes-list-pane">
      <div className="notes-list-header"><div><div className="eyebrow">PERSONAL KNOWLEDGE</div><h1>{folderTitle}</h1><p>{visibleNotes.length} {visibleNotes.length === 1 ? "note" : "notes"}</p></div><button className="button button-primary button-small" onClick={onQuickCapture}><Icon name="plus" size={14}/>New note</button></div>
      <div className="notes-search"><Icon name="search" size={15}/><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your notes..."/><kbd>⌘ F</kbd></div>
      <div className="notes-list-toolbar"><div className="notes-filter-tabs"><button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>All</button><button className={filter === "pinned" ? "active" : ""} onClick={() => setFilter("pinned")}>Pinned</button><button className={filter === "archived" ? "active" : ""} onClick={() => setFilter("archived")}>Archived</button></div><select aria-label="Sort notes" value={sort} onChange={(event) => setSort(event.target.value)}><option value="manual">My order</option><option value="recent">Recently updated</option><option value="oldest">Oldest</option><option value="title">Title</option></select></div>
      <div className="notes-card-list">
        {visibleNotes.map((note) => <button key={note.id} draggable onDragStart={() => setDraggedId(note.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(note.id)} onDragEnd={() => setDraggedId(null)} className={`note-list-card ${note.color} ${selectedId === note.id ? "selected" : ""} ${draggedId === note.id ? "dragging" : ""}`} onClick={() => setSelectedId(note.id)}>
          <div className="note-list-card-top"><span>{note.pinned && <Icon name="pin" size={12}/>}<span>{folders.find((folder) => folder.id === note.folderId)?.name ?? "Inbox"}</span></span><span className="note-card-time">{note.updatedAt}</span></div>
          <strong>{note.title}</strong><p>{note.plainText || "No additional text"}</p>
          <div className="note-list-card-bottom"><span>{Math.max(1, Math.ceil(note.plainText.length / 240))} min read</span><span className="drag-handle" title="Drag to reorder"><Icon name="grip" size={14}/></span></div>
        </button>)}
        {visibleNotes.length === 0 && <div className="notes-empty"><div><Icon name="sticky-note" size={22}/></div><strong>No notes here yet</strong><p>Create a note or change the current filters.</p><button className="button button-secondary button-small" onClick={onQuickCapture}>Create a note</button></div>}
      </div>
    </section>

    <section className="note-editor-pane">
      {selected ? <>
        <div className="note-editor-toolbar-top"><div><span className="saved-indicator"><i/> Account storage</span><span className="editor-updated">Edited {selected.updatedAt.toLowerCase()}</span></div><div className="note-editor-actions"><button className="icon-button" title="Close editor" onClick={() => setSelectedId(null)}><Icon name="x" size={16}/></button><button className="icon-button" title="Minimise" onClick={() => setMinimized(true)}><Icon name="minus" size={16}/></button><button className="icon-button" title="Full screen" onClick={toggleFullscreen}>⛶</button><button className={`icon-button ${selected.pinned ? "pinned" : ""}`} title={selected.pinned ? "Unpin note" : "Pin note"} onClick={togglePin}><Icon name="pin" size={16}/></button><button className="icon-button" title={selected.archived ? "Restore note" : "Archive note"} onClick={toggleArchive}><Icon name="archive" size={16}/></button><div className="note-more-wrap"><button className="icon-button" title="More actions" aria-expanded={moreOpen} onClick={() => setMoreOpen(v => !v)}><Icon name="more" size={17}/></button>{moreOpen && <div className="note-more-menu"><button className="danger" onClick={deletePermanently}><Icon name="trash" size={15}/>Delete permanently</button><button onClick={duplicateNote}><Icon name="file-plus" size={15}/>Duplicate note</button><button onClick={exportHtml}><Icon name="braces" size={15}/>Export HTML</button><button onClick={exportPdf}><Icon name="file" size={15}/>Export PDF</button></div>}</div></div></div>
        <div className="note-editor-content">
          <input className="note-editor-title" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Untitled note" aria-label="Note title"/>
          <div className="note-editor-meta"><span><Icon name="folder" size={13}/>{folders.find((folder) => folder.id === selected.folderId)?.name ?? "Inbox"}</span><span><Icon name="clock" size={13}/>{selected.updatedAt}</span></div>
          <div className="rich-toolbar floating-rich-toolbar" role="toolbar" aria-label="Text formatting" onPointerDown={startToolbarDrag} style={toolbarPosition.x || toolbarPosition.y ? { position: "fixed", left: toolbarPosition.x, top: toolbarPosition.y, zIndex: 50, cursor: toolbarDragging ? "grabbing" : undefined } : undefined}>\n             <span data-toolbar-handle title="Drag toolbar" style={{ cursor: "grab", padding: "0 6px", touchAction: "none" }}>⠿</span>
            <button type="button" title="Bold (Ctrl+B)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("bold")}><b>B</b></button>
            <button type="button" title="Italic (Ctrl+I)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("italic")}><i>I</i></button>
            <button type="button" title="Underline (Ctrl+U)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("underline")}><u>U</u></button>
            <button type="button" title="Strikethrough" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("strikeThrough")}><s>S</s></button>
            <i className="toolbar-divider"/>
            <button type="button" title="Bulleted list" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("insertUnorderedList")}><Icon name="list" size={15}/></button>
            <button type="button" title="Numbered list" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("insertOrderedList")}><Icon name="list-ordered" size={15}/></button>
            <button type="button" title="Checklist" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={insertChecklist}><Icon name="list-checks" size={15}/></button>
            <button type="button" title="Add link" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => { const url = window.prompt("Enter link URL"); if (url) format("createLink", url); }}><Icon name="link" size={15}/></button>
          </div>
          <div className="note-editor-body-wrap"><div ref={editorRef} className="note-rich-editor" contentEditable suppressContentEditableWarning onInput={handleEditorInput} onKeyDown={handleEditorKeyDown} data-placeholder="Type / for commands, or start writing..." />{slashOpen && <div className="slash-command-menu">{[["text","Text"],["h1","Heading 1"],["h2","Heading 2"],["bullet","Bulleted list"],["number","Numbered list"],["todo","To-do list"],["quote","Quote"],["divider","Divider"]].map(([key,label]) => <button key={key} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertBlock(key)}>{label}</button>)}</div>}</div>
          <div className="note-drawing-toolbar" role="toolbar" aria-label="Drawing tools">
            {["select","pen","highlighter","eraser","lasso"].map((tool) => <button key={tool} type="button" className={drawingTool === tool ? "active" : ""} onClick={() => setDrawingTool(tool)}><span>{tool === "select" ? "↖" : tool === "pen" ? "✎" : tool === "highlighter" ? "▰" : tool === "eraser" ? "◩" : "⌁"}</span><small>{tool}</small></button>)}
          </div>
          <button type="button" className="ask-pios-fab" onClick={() => setAskOpen(!askOpen)}><Icon name="sparkles" size={15}/> Ask PIOS</button>
          {askOpen && <div className="ask-pios-panel"><strong>Ask PIOS</strong><p>Ask about this note or turn it into a learning resource.</p><textarea value={askText} onChange={(event) => setAskText(event.target.value)} placeholder="Ask something about this page..." rows={3}/><button className="button button-primary button-small" disabled={!askText.trim() || askBusy} onClick={() => void askPios()}>{askBusy ? "Thinking…" : "Ask"}</button>{askAnswer && <div className="ask-pios-answer" role="status">{askAnswer}</div>}</div>}
          <div className="note-editor-footer"><div className="note-color-picker">{colors.map((color) => <button key={color.id} type="button" title={color.name} aria-label={color.name} className={`note-color-dot ${color.id} ${draftColor === color.id ? "selected" : ""}`} onClick={() => setDraftColor(color.id)}/>)}</div><span>{plainTextFromHtml(draftHtml).trim().split(/\s+/).filter(Boolean).length} words</span><button className="button button-primary button-small" onClick={saveDraft}><Icon name="check" size={14}/>Save changes</button></div>
          <div className="note-routing-toggle"><button onClick={() => setShowDestination((value) => !value)}><Icon name="sparkles" size={14}/> Organise this note with PIOS <Icon name="chevron-down" size={13}/></button></div>
          {showDestination && <NoteDestination title={draftTitle} body={plainTextFromHtml(draftHtml)} folders={folders} notes={notes} folderId={currentFolderId} excludeId={selected.id} onFolderChange={(folderId) => updateNote(selected.id, { folderId })} onFoldersChange={onFoldersChange}/>}
        </div>
      </> : <div className="note-editor-empty"><div><Icon name="sticky-note" size={27}/></div><h3>Select a note</h3><p>Choose a note from the list or create a new one to start writing.</p><button className="button button-primary button-small" onClick={onQuickCapture}><Icon name="plus" size={14}/>Create note</button></div>}
    </section>

    {folderDialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFolderDialog(false); }}><form className="modal new-folder-modal" onSubmit={createFolder}><div className="modal-header"><div><div className="eyebrow">ORGANISE YOUR KNOWLEDGE</div><h2>Create a folder</h2><p>Folders keep related notes together.</p></div><button className="icon-button" type="button" onClick={() => setFolderDialog(false)}><Icon name="x"/></button></div><label htmlFor="folder-name">Folder name</label><input id="folder-name" autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="e.g. Java Concurrency"/><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setFolderDialog(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={!folderName.trim()}><Icon name="plus" size={14}/>Create folder</button></div></form></div>}
  </div>;
}
