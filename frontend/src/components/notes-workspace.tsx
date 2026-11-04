"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent } from "react";
import { Icon } from "@/components/icon";
import NoteDrawingModal from "@/components/note-drawing-modal";
import type { NoteFolder, NoteColor, PiosNote } from "@/lib/notes";
import { plainTextFromHtml, sanitizeNoteHtml, suggestNoteDestination } from "@/lib/notes";

type NotesWorkspaceProps = {
  notes: PiosNote[];
  folders: NoteFolder[];
  onNotesChange: (notes: PiosNote[]) => void;
  onFoldersChange: (folders: NoteFolder[]) => void;
  onQuickCapture: () => void;
  onToast: (message: string) => void;
};

type NoteBlockCommand = { id: string; label: string; detail: string; keywords: string; html?: string; action?: "youtube" | "drawing" };

const NOTE_BLOCK_COMMANDS: NoteBlockCommand[] = [
  { id: "text", label: "Text", detail: "Start a plain paragraph", keywords: "paragraph p", html: "<p><br></p>" },
  { id: "heading-1", label: "Heading 1", detail: "A large section heading", keywords: "title h1", html: "<h1>Heading</h1><p><br></p>" },
  { id: "heading-2", label: "Heading 2", detail: "A section heading", keywords: "h2", html: "<h2>Heading</h2><p><br></p>" },
  { id: "heading-3", label: "Heading 3", detail: "A smaller heading", keywords: "h3", html: "<h3>Heading</h3><p><br></p>" },
  { id: "bullets", label: "Bulleted list", detail: "Unordered list", keywords: "list ul", html: "<ul><li>First item</li><li>Second item</li></ul><p><br></p>" },
  { id: "numbered", label: "Numbered list", detail: "Ordered steps", keywords: "ordered ol steps", html: "<ol><li>First step</li><li>Second step</li></ol><p><br></p>" },
  { id: "checklist", label: "Checklist", detail: "Tasks you can tick off", keywords: "todo task checkbox", html: '<ul><li><input type="checkbox" /> Task to complete</li></ul><p><br></p>' },
  { id: "quote", label: "Callout / quote", detail: "Highlight an important idea", keywords: "blockquote callout note", html: "<blockquote><p>Important idea...</p></blockquote><p><br></p>" },
  { id: "code", label: "Code block", detail: "JavaScript, Java, Python and more", keywords: "developer code programming", html: '<pre data-language="text"><code>Write or paste code here</code></pre><p><br></p>' },
  { id: "sql", label: "SQL query", detail: "A dedicated SQL snippet", keywords: "database postgres mysql query", html: '<pre data-language="sql"><code>SELECT * FROM table_name;</code></pre><p><br></p>' },
  { id: "terminal", label: "Terminal command", detail: "Shell and PowerShell commands", keywords: "bash shell powershell cli command", html: '<pre data-language="bash"><code></code></pre><p><br></p>' },
  { id: "api", label: "API request", detail: "HTTP method, route, headers and body", keywords: "http rest endpoint api", html: '<pre data-language="http"><code>GET /api/v1/resource HTTP/1.1\nHost: localhost:8080</code></pre><p><br></p>' },
  { id: "java", label: "Java starter", detail: "A minimal Java class with main method", keywords: "java class object spring backend", html: '<pre data-language="java"><code>public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, PIOS");\n    }\n}</code></pre><p><br></p>' },
  { id: "python", label: "Python starter", detail: "A function and entry point", keywords: "python script function ml data science", html: '<pre data-language="python"><code>def main():\n    print("Hello, PIOS")\n\nif __name__ == "__main__":\n    main()</code></pre><p><br></p>' },
  { id: "json", label: "JSON payload", detail: "A sample request or response object", keywords: "json data api payload object", html: '<pre data-language="json"><code>{\n  "name": "PIOS",\n  "status": "draft"\n}</code></pre><p><br></p>' },
  { id: "git", label: "Git workflow", detail: "A small version-control command sequence", keywords: "git github version control commit", html: '<pre data-language="bash"><code>git status\ngit add .\ngit commit -m "Describe the change"</code></pre><p><br></p>' },
  { id: "table", label: "Table", detail: "Compare concepts, options or results", keywords: "grid rows columns comparison matrix", html: "<table><thead><tr><th>Topic</th><th>Notes</th></tr></thead><tbody><tr><td>Item 1</td><td>Details</td></tr><tr><td>Item 2</td><td>Details</td></tr></tbody></table><p><br></p>" },
  { id: "flashcard", label: "Study flashcard", detail: "Question and answer for active recall", keywords: "study revision memory question answer flash card", html: "<blockquote><p><strong>Question:</strong> Write the prompt here.</p><p><strong>Answer:</strong> Write the answer here.</p></blockquote><p><br></p>" },
  { id: "formula", label: "Math / formula", detail: "A space for LaTeX or a formula", keywords: "math latex equation calculus", html: '<pre data-language="latex"><code>\\( a^2 + b^2 = c^2 \\)</code></pre><p><br></p>' },
  { id: "youtube", label: "YouTube lecture", detail: "Embed a lecture or explainer video", keywords: "video youtube embed lecture", action: "youtube" },
  { id: "drawing", label: "Drawing canvas", detail: "Pen, shapes, connectors and arrows", keywords: "diagram excalidraw flowchart architecture canvas", action: "drawing" },
  { id: "divider", label: "Divider", detail: "Separate sections of a note", keywords: "hr separator line", html: "<hr><p><br></p>" },
];

function youtubeEmbedUrl(input: string) {
  try {
    const url = new URL(input.trim());
    let videoId = "";
    if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") videoId = url.pathname.slice(1).split("/")[0];
    else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v") ?? "";
      else if (url.pathname.startsWith("/embed/") || url.pathname.startsWith("/shorts/")) videoId = url.pathname.split("/")[2] ?? "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

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
  const [slashMenu, setSlashMenu] = useState<{ query: string } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [showNoteActions, setShowNoteActions] = useState(false);
  const savedEditorRangeRef = useRef<Range | null>(null);

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
    const handleEditorEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || slashMenu) return;
      if (showNoteActions) { setShowNoteActions(false); return; }
      if (drawingOpen) { setDrawingOpen(false); return; }
      if (focusMode) { setFocusMode(false); return; }
      if (editorOpen) setEditorOpen(false);
    };
    window.addEventListener("keydown", handleEditorEscape);
    return () => window.removeEventListener("keydown", handleEditorEscape);
  }, [slashMenu, showNoteActions, drawingOpen, focusMode, editorOpen]);
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
    setDraftTitle(selected.title); setDraftHtml(selected.bodyHtml); setDraftColor(selected.color);
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
    updateNote(selected.id, { title: draftTitle.trim() || "Untitled note", bodyHtml: draftHtml, plainText: body, color: draftColor, updatedAt: "Just now", order: Date.now() });
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
  const filteredBlockCommands = NOTE_BLOCK_COMMANDS.filter((command) =>
    !slashMenu?.query || `${command.label} ${command.keywords} ${command.detail}`.toLowerCase().includes(slashMenu.query.toLowerCase())
  );

  const handleEditorInput = () => {
    if (!editorRef.current) return;
    setDraftHtml(sanitizeNoteHtml(editorRef.current.innerHTML));
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) { setSlashMenu(null); return; }
    const range = selection.getRangeAt(0);
    const block = range.startContainer.nodeType === Node.TEXT_NODE
      ? (range.startContainer.parentElement?.closest("p,div,h1,h2,h3,li,blockquote") ?? editorRef.current)
      : ((range.startContainer as HTMLElement).closest?.("p,div,h1,h2,h3,li,blockquote") ?? editorRef.current);
    try {
      const beforeCaret = document.createRange();
      beforeCaret.selectNodeContents(block);
      beforeCaret.setEnd(range.startContainer, range.startOffset);
      const match = beforeCaret.toString().match(new RegExp(String.fromCharCode(47) + "([a-z0-9-]*)$", "i"));
      if (match) { setSlashMenu({ query: match[1] }); setSlashIndex(0); }
      else setSlashMenu(null);
    } catch {
      setSlashMenu(null);
    }
  };

  const insertHtmlAtCursor = (html: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (selection && savedEditorRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(savedEditorRangeRef.current);
    }
    document.execCommand("insertHTML", false, html);
    savedEditorRangeRef.current = null;
    setSlashMenu(null);
    setDraftHtml(sanitizeNoteHtml(editor.innerHTML));
  };

  const applyBlockCommand = (command: NoteBlockCommand) => {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const before = textNode.textContent?.slice(0, range.startOffset) ?? "";
        const match = before.match(new RegExp(String.fromCharCode(47) + "([a-z0-9-]*)$", "i"));
        if (match) {
          range.setStart(textNode, range.startOffset - match[0].length);
          range.deleteContents();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
      savedEditorRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setSlashMenu(null);
    if (command.action === "drawing") { setDrawingOpen(true); return; }
    if (command.action === "youtube") {
      const input = window.prompt("Paste a YouTube video or lecture URL");
      if (!input) return;
      const embedUrl = youtubeEmbedUrl(input);
      if (!embedUrl) { onToast("That URL is not a supported YouTube video link."); return; }
      insertHtmlAtCursor(`<p><iframe src="${embedUrl}" title="YouTube lecture" loading="lazy"></iframe></p><p><br></p>`);
      return;
    }
    insertHtmlAtCursor(command.html ?? "<p><br></p>");
    if (command.html?.includes("<pre")) {
      const code = editorRef.current?.querySelector("pre:last-of-type code");
      if (code) {
        const range = document.createRange();
        range.selectNodeContents(code);
        range.collapse(false);
        const selectionAfterInsert = window.getSelection();
        selectionAfterInsert?.removeAllRanges();
        selectionAfterInsert?.addRange(range);
      }
      editorRef.current?.focus();
    }
  };

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!slashMenu) return;
    if (event.key === "Escape") { event.preventDefault(); setSlashMenu(null); return; }
    if (event.key === "ArrowDown" && filteredBlockCommands.length) { event.preventDefault(); setSlashIndex((index) => (index + 1) % filteredBlockCommands.length); return; }
    if (event.key === "ArrowUp" && filteredBlockCommands.length) { event.preventDefault(); setSlashIndex((index) => (index - 1 + filteredBlockCommands.length) % filteredBlockCommands.length); return; }
    if (event.key === "Enter" && filteredBlockCommands[slashIndex]) { event.preventDefault(); applyBlockCommand(filteredBlockCommands[slashIndex]); }
  };

  const insertDrawing = (dataUrl: string) => {
    setDrawingOpen(false);
    if (draftHtml.length + dataUrl.length + 100 > 99_000) {
      onToast("This note is close to its size limit. Save or move some content before inserting a drawing.");
      return;
    }
    insertHtmlAtCursor(`<p><img src="${dataUrl}" alt="Note diagram" /></p><p><br></p>`);
    onToast("Drawing inserted into your note.");
  };

  const toggleArchive = () => { if (!selected) return; updateNote(selected.id, { archived: !selected.archived }); setSelectedId(null); onToast(selected.archived ? "Note restored." : "Note archived. You can find it under Archived."); };
  const togglePin = () => { if (!selected) return; updateNote(selected.id, { pinned: !selected.pinned }); onToast(selected.pinned ? "Note unpinned." : "Note pinned."); };
  const closeEditor = () => {
    setEditorOpen(false);
    setFocusMode(false);
    setShowNoteActions(false);
  };
  const exportSelectedNote = () => {
    if (!selected) return;
    const title = draftTitle.trim() || selected.title;
    const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "pios-note";
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{max-width:860px;margin:48px auto;padding:0 24px;font:16px/1.7 system-ui,sans-serif;color:#26372f}pre{overflow:auto;padding:16px;background:#f4f6f4;border-radius:8px}blockquote{border-left:3px solid #79a486;padding-left:16px;color:#607166}img,iframe{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #dce5dd;padding:8px 12px}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${sanitizeNoteHtml(draftHtml || selected.bodyHtml)}
</body>
</html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShowNoteActions(false);
    onToast("HTML export downloaded.");
  };
  const duplicateSelectedNote = () => {
    if (!selected) return;
    const bodyHtml = sanitizeNoteHtml(draftHtml || selected.bodyHtml);
    const duplicate: PiosNote = {
      ...selected,
      id: crypto.randomUUID(),
      title: `${draftTitle.trim() || selected.title} (copy)`,
      bodyHtml,
      plainText: plainTextFromHtml(bodyHtml),
      pinned: false,
      archived: false,
      updatedAt: "Just now",
      order: Date.now(),
    };
    onNotesChange([duplicate, ...notes]);
    setSelectedId(duplicate.id);
    setDraftTitle(duplicate.title);
    setDraftHtml(duplicate.bodyHtml);
    setDraftColor(duplicate.color);
    setEditorOpen(true);
    setFocusMode(false);
    setShowNoteActions(false);
    onToast("Note duplicated.");
  };
  const deleteSelectedNote = () => {
    if (!selected) return;
    const title = draftTitle.trim() || selected.title;
    if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    onNotesChange(notes.filter((note) => note.id !== selected.id));
    setSelectedId(null);
    closeEditor();
    onToast("Note deleted.");
  };
  const folderTitle = selectedFolderId === "all" ? "All notes" : folders.find((folder) => folder.id === selectedFolderId)?.name ?? "Notes";
  const currentFolderId = selected?.folderId || inboxFolderId;

  return <div className={`notes-workspace${focusMode ? " focus-mode" : ""}${!editorOpen ? " editor-closed" : ""}`}>
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
        {visibleNotes.map((note) => <button key={note.id} draggable onDragStart={() => setDraggedId(note.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(note.id)} onDragEnd={() => setDraggedId(null)} className={`note-list-card ${note.color} ${selectedId === note.id ? "selected" : ""} ${draggedId === note.id ? "dragging" : ""}`} onClick={() => { setSelectedId(note.id); setEditorOpen(true); setFocusMode(false); setShowNoteActions(false); }}>
          <div className="note-list-card-top"><span>{note.pinned && <Icon name="pin" size={12}/>}<span>{folders.find((folder) => folder.id === note.folderId)?.name ?? "Inbox"}</span></span><span className="note-card-time">{note.updatedAt}</span></div>
          <strong>{note.title}</strong><p>{note.plainText || "No additional text"}</p>
          <div className="note-list-card-bottom"><span>{Math.max(1, Math.ceil(note.plainText.length / 240))} min read</span><span className="drag-handle" title="Drag to reorder"><Icon name="grip" size={14}/></span></div>
        </button>)}
        {visibleNotes.length === 0 && <div className="notes-empty"><div><Icon name="sticky-note" size={22}/></div><strong>No notes here yet</strong><p>Create a note or change the current filters.</p><button className="button button-secondary button-small" onClick={onQuickCapture}>Create a note</button></div>}
      </div>
    </section>

    {editorOpen && <section className="note-editor-pane">
      {selected ? <>
        <div className="note-editor-toolbar-top"><div><span className="saved-indicator"><i/> Account storage</span><span className="editor-updated">Edited {selected.updatedAt.toLowerCase()}</span></div><div className="note-editor-actions">
          <button type="button" className="icon-button" title="Close note editor (Esc)" aria-label="Close note editor" onClick={closeEditor}><Icon name="x" size={16}/></button>
          <button type="button" className="icon-button" title={focusMode ? "Exit full-screen editor" : "Open full-screen editor"} aria-label={focusMode ? "Exit full-screen editor" : "Open full-screen editor"} onClick={() => { setEditorOpen(true); setFocusMode((value) => !value); }}><Icon name={focusMode ? "minimize-2" : "maximize-2"} size={16}/></button>
          <button type="button" className={`icon-button ${selected.pinned ? "pinned" : ""}`} title={selected.pinned ? "Unpin note" : "Pin note"} aria-label={selected.pinned ? "Unpin note" : "Pin note"} onClick={togglePin}><Icon name="pin" size={16}/></button>
          <button type="button" className="icon-button" title={selected.archived ? "Restore note" : "Archive note"} aria-label={selected.archived ? "Restore note" : "Archive note"} onClick={toggleArchive}><Icon name="archive" size={16}/></button>
          <div className="note-actions-menu-wrap">
            <button type="button" className="icon-button" title="More note actions" aria-label="More note actions" aria-expanded={showNoteActions} onClick={() => setShowNoteActions((value) => !value)}><Icon name="more" size={17}/></button>
            {showNoteActions && <div className="note-actions-menu" role="menu">
              <button type="button" role="menuitem" onClick={exportSelectedNote}><Icon name="download" size={15}/>Export as HTML</button>
              <button type="button" role="menuitem" onClick={duplicateSelectedNote}><Icon name="copy" size={15}/>Duplicate note</button>
              <div className="note-actions-menu-divider"/>
              <button type="button" role="menuitem" className="danger" onClick={deleteSelectedNote}><Icon name="trash-2" size={15}/>Delete permanently</button>
            </div>}
          </div>
        </div></div>
        <div className="note-editor-content">
          <input className="note-editor-title" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Untitled note" aria-label="Note title"/>
          <div className="note-editor-meta"><span><Icon name="folder" size={13}/>{folders.find((folder) => folder.id === selected.folderId)?.name ?? "Inbox"}</span><span><Icon name="clock" size={13}/>{selected.updatedAt}</span></div>
          <div className="rich-toolbar" role="toolbar" aria-label="Text formatting">
            <button type="button" title="Bold (Ctrl+B)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("bold")}><b>B</b></button>
            <button type="button" title="Italic (Ctrl+I)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("italic")}><i>I</i></button>
            <button type="button" title="Underline (Ctrl+U)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("underline")}><u>U</u></button>
            <button type="button" title="Strikethrough" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("strikeThrough")}><s>S</s></button>
            <i className="toolbar-divider"/>
            <button type="button" title="Bulleted list" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("insertUnorderedList")}><Icon name="list" size={15}/></button>
            <button type="button" title="Numbered list" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => format("insertOrderedList")}><Icon name="list-ordered" size={15}/></button>
            <button type="button" title="Checklist" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={insertChecklist}><Icon name="list-checks" size={15}/></button>
            <button type="button" title="Add link" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => { const url = window.prompt("Enter link URL"); if (url) format("createLink", url); }}><Icon name="link" size={15}/></button>
            <i className="toolbar-divider"/>
            <button type="button" title="Insert block (or type /)" onMouseDown={(event: MouseEvent) => event.preventDefault()} onClick={() => { editorRef.current?.focus(); setSlashMenu({ query: "" }); setSlashIndex(0); }}><Icon name="plus-square" size={15}/><span className="note-toolbar-insert-label">Block</span></button>
          </div>
          {slashMenu && <div className="note-slash-menu" role="listbox" aria-label="Insert a note block">
            <div className="note-slash-menu-heading"><strong>Insert a block</strong><kbd>↑ ↓ ENTER</kbd></div>
            {filteredBlockCommands.length ? filteredBlockCommands.map((command, index) => <button type="button" role="option" aria-selected={slashIndex === index} key={command.id} className={slashIndex === index ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => applyBlockCommand(command)}>
              <span className="note-slash-command-icon">{command.id === "drawing" ? "↗" : command.id === "youtube" ? "▶" : command.id === "code" || command.id === "sql" || command.id === "terminal" || command.id === "api" ? "</>" : command.id === "formula" ? "∑" : "¶"}</span>
              <span><strong>{command.label}</strong><small>{command.detail}</small></span>
              <kbd>/{command.id}</kbd>
            </button>) : <p className="note-slash-empty">No matching block. Try a different command.</p>}
          </div>}
          <div ref={editorRef} className="note-rich-editor" contentEditable suppressContentEditableWarning onInput={handleEditorInput} onKeyDown={handleEditorKeyDown} data-placeholder="Start writing... Type / to insert a block." />
          <div className="note-editor-footer"><div className="note-color-picker">{colors.map((color) => <button key={color.id} type="button" title={color.name} aria-label={color.name} className={`note-color-dot ${color.id} ${draftColor === color.id ? "selected" : ""}`} onClick={() => setDraftColor(color.id)}/>)}</div><span>{plainTextFromHtml(draftHtml).trim().split(/\s+/).filter(Boolean).length} words</span><button className="button button-primary button-small" onClick={saveDraft}><Icon name="check" size={14}/>Save changes</button></div>
          <div className="note-routing-toggle"><button onClick={() => setShowDestination((value) => !value)}><Icon name="sparkles" size={14}/> Organise this note with PIOS <Icon name="chevron-down" size={13}/></button></div>
          {showDestination && <NoteDestination title={draftTitle} body={plainTextFromHtml(draftHtml)} folders={folders} notes={notes} folderId={currentFolderId} excludeId={selected.id} onFolderChange={(folderId) => updateNote(selected.id, { folderId })} onFoldersChange={onFoldersChange}/>}
        </div>
      </> : <div className="note-editor-empty"><div><Icon name="sticky-note" size={27}/></div><h3>Select a note</h3><p>Choose a note from the list or create a new one to start writing.</p><button className="button button-primary button-small" onClick={onQuickCapture}><Icon name="plus" size={14}/>Create note</button></div>}
    </section>}

    {drawingOpen && <NoteDrawingModal onClose={() => setDrawingOpen(false)} onInsert={insertDrawing}/>}
    {folderDialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFolderDialog(false); }}><form className="modal new-folder-modal" onSubmit={createFolder}><div className="modal-header"><div><div className="eyebrow">ORGANISE YOUR KNOWLEDGE</div><h2>Create a folder</h2><p>Folders keep related notes together.</p></div><button className="icon-button" type="button" onClick={() => setFolderDialog(false)}><Icon name="x"/></button></div><label htmlFor="folder-name">Folder name</label><input id="folder-name" autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="e.g. Java Concurrency"/><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setFolderDialog(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={!folderName.trim()}><Icon name="plus" size={14}/>Create folder</button></div></form></div>}
  </div>;
}
