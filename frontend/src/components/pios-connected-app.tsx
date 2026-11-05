"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/icon";
import PeekDeck from "@/components/peek-deck";
import NotesWorkspace, { QuickCaptureModal } from "@/components/notes-workspace";
import AiProvidersView from "@/components/ai-providers-view";
import LearningWorkspace from "@/components/learning-workspace";
import { createNoteWriter } from "@/lib/note-writer";
import type { NoteFolder, PiosNote } from "@/lib/notes";
import {
  ApiChatResponse, ApiCitation, ApiFolder, ApiNote, ApiObjective, ApiProvider, ApiSource, ApiUser,
  clearToken, createFolder, deleteFolder, createNote, createTextSource,
  getFolders, getMe, getNotes, getObjectives, getProviders, getSources, removeNote,
  removeSource, sendChat, signIn, signUp, signOut, updateNote, uploadSource,
} from "@/lib/api";

type View = "overview" | "notes" | "knowledge" | "assistant" | "learning" | "ai" | "graph" | "settings";
type ChatEntry = { id: string; role: "user" | "assistant"; text: string; citations?: ApiCitation[]; retrievalMode?: string; retrievalWarning?: string };

function toPiosNote(note: ApiNote): PiosNote {
  return { ...note, folderId: note.folderId ?? "", updatedAt: relativeTime(note.updatedAt) };
}
function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  if (seconds < 172800) return "Yesterday";
  return new Date(value).toLocaleDateString();
}
function notePayload(note: PiosNote) {
  return {
    id: note.id, title: note.title, bodyHtml: note.bodyHtml, plainText: note.plainText,
    folderId: note.folderId || null, color: note.color, pinned: note.pinned,
    archived: note.archived, order: note.order, inkData: note.inkData ?? "", coverUrl: note.coverUrl ?? "", editorSettings: note.editorSettings ?? "{}",
  };
}
function sourceLabel(source: ApiSource) {
  if (source.kind === "PDF") return "PDF";
  if (source.kind === "Text") return "Text";
  return "Document";
}

export default function PiosConnectedApp() {
  const [tokenExists, setTokenExists] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [user, setUser] = useState<ApiUser | null>(null);
  const activeUserRef = useRef<string | null>(null); activeUserRef.current = user?.id || null;
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [activeView, setActiveView] = useState<View>("overview");
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<PiosNote[]>([]);
  const notesRef = useRef<PiosNote[]>([]);

  const foldersRef = useRef<NoteFolder[]>([]);
  const [sources, setSources] = useState<ApiSource[]>([]);
  const [objectives, setObjectives] = useState<ApiObjective[]>([]);
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [chatBusy, setChatBusy] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { setSidebarOpen(window.matchMedia("(min-width:761px)").matches); }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  const notify = useCallback((message: string) => setToast(message), []);
  const noteWriter = useMemo(() => createNoteWriter<PiosNote>({
    create: (note) => createNote(notePayload(note)),
    update: (note) => updateNote(note.id, notePayload(note)),
    remove: removeNote,
    equal: (left, right) => JSON.stringify(notePayload(left)) === JSON.stringify(notePayload(right)),
    onError: (error) => notify(error instanceof Error ? error.message : "A note could not be saved. Retry saving your edit."),
  }), [notify]);

  const loadWorkspace = useCallback(async () => {
    setDataLoading(true);
    try {
      const [folderRows, noteRows, sourceRows, objectiveRows, providerRows] = await Promise.all([
        getFolders(), getNotes(), getSources(), getObjectives(), getProviders(),
      ]);
      const mappedFolders = folderRows.map((folder) => ({ id: folder.id, name: folder.name, color: folder.color }));
      const mappedNotes = noteRows.map(toPiosNote);
      foldersRef.current = mappedFolders; notesRef.current = mappedNotes; noteWriter.reset(mappedNotes);
      setFolders(mappedFolders); setNotes(mappedNotes); setSources(sourceRows);
      setObjectives(objectiveRows); setProviders(providerRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load the PIOS workspace.";
      if (/401|unauthorized|sign in/i.test(message)) {
        clearToken(); setTokenExists(false); setUser(null);
      }
      notify(message);
    } finally { setDataLoading(false); }
  }, [notify, noteWriter]);

  useEffect(() => {
    clearToken();
    getMe(true).then((me) => { setUser(me); setTokenExists(true); return loadWorkspace(); })
      .catch(() => { setTokenExists(false); setUser(null); })
      .finally(() => setAuthChecking(false));
  }, [loadWorkspace]);

  useEffect(() => {
    const expired = () => {
      noteWriter.reset([]);
      setUser(null); setTokenExists(false); setAuthMode("login");
      setAuthError("Your session has expired. Sign in again to continue.");
      setNotes([]); setFolders([]); setSources([]); setObjectives([]); setProviders([]);
      notesRef.current = []; foldersRef.current = [];
      setChatEntries([]); setConversationId(undefined);
      setQuickCaptureOpen(false); setAddSourceOpen(false); setShowSearch(false);
    };
    window.addEventListener("pios-session-expired", expired);
    return () => window.removeEventListener("pios-session-expired", expired);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "n" && user) {
        event.preventDefault(); setQuickCaptureOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && user) {
        event.preventDefault(); setShowSearch(true);
      }
      if (event.key === "Escape") { setQuickCaptureOpen(false); setAddSourceOpen(false); setShowSearch(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [user]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthBusy(true); setAuthError("");
    try {
      if (authMode === "register") await signUp(authName.trim(), authEmail.trim(), authPassword);
      else await signIn(authEmail.trim(), authPassword);
      const me = await getMe();
      setUser(me); setTokenExists(true); setAuthPassword(""); await loadWorkspace();
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Authentication failed."); }
    finally { setAuthBusy(false); }
  }

  function persistNotes(nextNotes: PiosNote[]): Promise<boolean> {
    notesRef.current = nextNotes; setNotes(nextNotes);
    return noteWriter.save(nextNotes);
  }

  async function removeFolder(id: string) {
    const inbox = foldersRef.current.find((folder) => folder.name.trim().toLowerCase() === "inbox");
    if (!inbox || id === inbox.id) return false;
    const moved = notesRef.current.map((note) => note.folderId === id ? { ...note, folderId: inbox.id } : note);
    if (!await persistNotes(moved)) return false;
    try {
      await deleteFolder(id);
      const next = foldersRef.current.filter((folder) => folder.id !== id);
      foldersRef.current = next; setFolders(next);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Folder could not be deleted. Notes remain in Inbox.");
      return false;
    }
  }

  async function persistFolders(nextFolders: NoteFolder[]) {
    const previous = foldersRef.current;
    foldersRef.current = nextFolders; setFolders(nextFolders);
    const previousIds = new Set(previous.map((folder) => folder.id));
    try {
      for (const folder of nextFolders) {
        if (!previousIds.has(folder.id)) await createFolder(folder.name, folder.color, folder.id);
      }
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "A folder could not be saved.");
      void loadWorkspace();
      return false;
    }
  }

  async function saveQuickNote(note: PiosNote, newFolder?: NoteFolder, appendToPageId?: string) {
    try {
      if (newFolder && !foldersRef.current.some((folder) => folder.id === newFolder.id) && !await persistFolders([...foldersRef.current, newFolder])) return;
      if (appendToPageId) {
        const existing = notesRef.current.find((entry) => entry.id === appendToPageId);
        if (existing) {
          const updated = { ...existing, bodyHtml: `${existing.bodyHtml}<hr/><h3>${note.title}</h3>${note.bodyHtml}`, plainText: `${existing.plainText} ${note.title} ${note.plainText}`.trim(), updatedAt: "Just now", order: Date.now() };
          if (!await persistNotes(notesRef.current.map((entry) => entry.id === appendToPageId ? updated : entry))) return;
        }
      } else if (!await persistNotes([note, ...notesRef.current])) return;
      setQuickCaptureOpen(false); notify("Note saved to your PIOS workspace.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save this note."); }
  }

  async function submitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSourceBusy(true);
    try {
      let created: ApiSource;
      if (sourceFile) created = await uploadSource(sourceFile);
      else if (sourceTitle.trim() && sourceText.trim()) created = await createTextSource(sourceTitle.trim(), sourceText.trim());
      else throw new Error("Choose a PDF, TXT or Markdown file, or enter a title and text.");
      setSources((current) => [created, ...current]); setAddSourceOpen(false);
      setSourceTitle(""); setSourceText(""); setSourceFile(null); notify(`Added “${created.title}” to your knowledge library.`);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not add this source."); }
    finally { setSourceBusy(false); }
  }

  async function handleChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = chatQuestion.trim(); if (!question || chatBusy) return;
    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: "user", text: question };
    setChatEntries((current) => [...current, userEntry]); setChatQuestion(""); setChatBusy(true);
    try {
      const response: ApiChatResponse = await sendChat(question, conversationId, true);
      setConversationId(response.conversationId);
      setChatEntries((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: response.answer, citations: response.citations, retrievalMode: response.retrievalMode, retrievalWarning: response.retrievalWarning }]);
    } catch (error) {
      setChatEntries((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: error instanceof Error ? error.message : "The AI request failed. Check your provider connection." }]);
    } finally { setChatBusy(false); }
  }

  async function removeKnowledgeSource(id: string) {
    try { await removeSource(id); setSources((current) => current.filter((source) => source.id !== id)); notify("Source removed."); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not remove source."); }
  }

  async function refreshProviders() { try { setProviders(await getProviders()); } catch { /* provider view displays its own error */ } }

  async function logout() {
    try {
      await signOut();
      noteWriter.reset([]);
      setUser(null); setTokenExists(false); setAuthMode("login");
      setFolders([]); setNotes([]); setSources([]); setObjectives([]); setProviders([]);
      notesRef.current = []; foldersRef.current = [];
      setChatEntries([]); setConversationId(undefined);
      setQuickCaptureOpen(false); setAddSourceOpen(false); setShowSearch(false);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not sign out. Please try again."); }
  }

  const filteredSources = useMemo(() => {
    const q = knowledgeQuery.toLowerCase().trim();
    if (!q) return sources;
    return sources.filter((source) => `${source.title} ${source.kind} ${source.collection} ${source.originalFileName ?? ""}`.toLowerCase().includes(q));
  }, [sources, knowledgeQuery]);
  const activeNotes = notes.filter((note) => !note.archived).length;
  const pinnedNotes = notes.filter((note) => note.pinned && !note.archived).length;
  const totalProgress = objectives.length ? Math.round(objectives.reduce((sum, item) => sum + item.progress, 0) / objectives.length) : 0;
  const currentTitle: Record<View, string> = { overview: "Overview", notes: "Notes", knowledge: "Knowledge library", assistant: "Ask PIOS", learning: "Learning", ai: "AI providers", graph: "Knowledge map", settings: "Settings" };

  if (authChecking) return <div className="pios-loading"><div className="pios-mark">P</div><span>Opening your private workspace…</span></div>;
  if (!user || !tokenExists) return <div className="pios-auth-page"><div className="pios-auth-card"><div className="pios-brand"><span className="pios-brand-symbol">P</span><span>pios<span className="pios-brand-dot">.</span><small>PERSONAL INTELLIGENCE OS</small></span></div><div className="pios-auth-copy"><div className="pios-eyebrow">YOUR KNOWLEDGE, CONNECTED</div><h1>{authMode === "register" ? "Create your private workspace." : "Welcome back."}</h1><p>One place to capture knowledge, connect ideas, learn and ask questions across your own material.</p></div><div className="pios-auth-tabs"><button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }}>Create account</button><button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Sign in</button></div><form className="pios-auth-form" onSubmit={handleAuth}>{authMode === "register" && <label>Your name<input value={authName} onChange={(event) => setAuthName(event.target.value)} required minLength={2} maxLength={120} placeholder="Your name"/></label>}<label>Email address<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required autoComplete="email" placeholder="you@example.com"/></label><label>Password<input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required minLength={8} autoComplete={authMode === "register" ? "new-password" : "current-password"} placeholder="At least 8 characters"/></label>{authError && <div className="pios-auth-error">{authError}</div>}<button className="pios-primary-button" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "register" ? "Create workspace" : "Sign in"}<Icon name="arrow-right" size={16}/></button></form><div className="pios-auth-foot"><Icon name="shield-check" size={14}/> Your notes, sources and provider keys are isolated to your account.</div><div className="pios-auth-server">Backend API: {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api/v1"}</div></div></div>;

  return <div className="pios-shell">
    <aside id="pios-navigation" className={`pios-sidebar ${sidebarOpen ? "open" : ""}`} inert={!sidebarOpen} aria-hidden={!sidebarOpen}><div className="pios-brand"><span className="pios-brand-symbol">P</span><span>pios<span className="pios-brand-dot">.</span><small>PERSONAL INTELLIGENCE OS</small></span></div><div className="pios-workspace-pill"><span className="pios-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><span><strong>Personal workspace</strong><small>{user.email}</small></span><Icon name="chevron-down" size={14}/></div><div className="pios-nav-label">WORKSPACE</div><nav className="pios-nav">{([
      ["overview", "Overview", "grid"], ["notes", "Notes", "sticky-note"], ["knowledge", "Knowledge library", "layers"], ["assistant", "Ask PIOS", "sparkles"], ["learning", "Learning", "graduation"], ["graph", "Knowledge map", "network"],
    ] as [View, string, string][]).map(([id, label, icon]) => <button key={id} className={activeView === id ? "active" : ""} onClick={() => { setActiveView(id); setSidebarOpen(false); }}><Icon name={icon} size={17}/>{label}{id === "assistant" && <span className="pios-nav-spark">✦</span>}</button>)}</nav><div className="pios-nav-label pios-nav-manage">MANAGE</div><nav className="pios-nav"><button className={activeView === "ai" ? "active" : ""} onClick={() => { setActiveView("ai"); setSidebarOpen(false); }}><Icon name="brain" size={17}/>AI providers</button><button className={activeView === "settings" ? "active" : ""} onClick={() => { setActiveView("settings"); setSidebarOpen(false); }}><Icon name="settings" size={17}/>Settings</button></nav><div className="pios-sidebar-bottom"><div className="pios-storage-card"><span>YOUR WORKSPACE</span><strong>{activeNotes} notes · {sources.length} sources</strong><small>Stored in your own PIOS database</small></div><button className="pios-user-row" onClick={logout}><span className="pios-avatar">{user.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{user.displayName}</strong><small>Sign out</small></span><Icon name="log-out" size={15}/></button></div></aside>
    {sidebarOpen && <button className="pios-mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}/>}
    <main className="pios-main"><header className="pios-topbar"><div className="pios-topbar-left"><button className="pios-mobile-menu" onClick={() => setSidebarOpen((open) => !open)} aria-label={sidebarOpen ? "Close menu" : "Open menu"} aria-expanded={sidebarOpen} aria-controls="pios-navigation"><Icon name="menu"/></button><div className="pios-crumb">Workspace <Icon name="chevron-right" size={13}/><strong>{currentTitle[activeView]}</strong></div></div><div className="pios-top-actions"><button className="pios-search-button" onClick={() => setShowSearch(true)}><Icon name="search" size={15}/><span>Search your workspace</span><kbd>Ctrl K</kbd></button><button className="pios-capture-button" onClick={() => setQuickCaptureOpen(true)}><Icon name="plus" size={15}/>Quick capture<kbd>Alt N</kbd></button><button className="pios-add-button" onClick={() => setAddSourceOpen(true)}><Icon name="upload" size={15}/>Add source</button></div></header>
      <div className={`pios-page-content ${activeView === "notes" ? "notes-page-content" : ""}`}>
        {activeView === "overview" && <section className="pios-view"><div className="pios-page-heading"><div><div className="pios-eyebrow">YOUR PERSONAL INTELLIGENCE WORKSPACE</div><h1>Good to see you, {user.displayName.split(" ")[0]}.</h1><p>Your knowledge, learning and AI tools in one private workspace.</p></div><button className="pios-primary-button small" onClick={() => setQuickCaptureOpen(true)}><Icon name="plus" size={15}/>Capture a thought</button></div><div className="pios-stat-grid"><Stat label="Notes" value={String(activeNotes)} sub={`${pinnedNotes} pinned`} icon="sticky-note"/><Stat label="Knowledge sources" value={String(sources.length)} sub="Uploaded to your library" icon="layers"/><Stat label="Learning objectives" value={String(objectives.length)} sub={`${totalProgress}% average progress`} icon="graduation"/><Stat label="AI connections" value={String(providers.length)} sub={providers.find((item) => item.isDefault)?.displayName ?? "No default model"} icon="brain"/></div><div className="pios-overview-grid"><div className="pios-panel"><PanelHeading title="Recent notes" action="Open notes" onAction={() => setActiveView("notes")}/>{notes.filter((note) => !note.archived).slice(0, 5).map((note) => <button className="pios-list-row" key={note.id} onClick={() => setActiveView("notes")}><span className={`pios-note-dot ${note.color}`}/><span><strong>{note.title}</strong><small>{folders.find((folder) => folder.id === note.folderId)?.name ?? "Inbox"} · {note.updatedAt}</small></span><Icon name="arrow-up-right" size={14}/></button>)}{!activeNotes && <Empty title="No notes yet" body="Use Quick Capture to create your first note." action="Capture note" onClick={() => setQuickCaptureOpen(true)}/>}</div><div className="pios-panel"><PanelHeading title="Learning progress" action="View learning" onAction={() => setActiveView("learning")}/>{objectives.slice(0, 4).map((objective) => <div className="pios-progress-row" key={objective.id}><div><strong>{objective.title}</strong><span>{objective.category}</span></div><b>{objective.progress}%</b><div className="pios-progress-track"><i style={{ width: `${objective.progress}%` }}/></div></div>)}{!objectives.length && <Empty title="No learning objectives" body="Define what you want to master and track progress." action="Add objective" onClick={() => setActiveView("learning")}/>}</div></div><div className="pios-panel pios-ask-banner"><div><span className="pios-eyebrow">ASK YOUR KNOWLEDGE</span><h2>Find the connection you are looking for.</h2><p>Ask questions across your notes and uploaded documents. PIOS retrieves relevant excerpts and cites the material it used.</p><button className="pios-primary-button small" onClick={() => setActiveView("assistant")}><Icon name="sparkles" size={15}/>Ask PIOS</button></div><div className="pios-orbit-art"><span/><span/><span/><b><Icon name="brain" size={27}/></b></div></div></section>}

        {activeView === "notes" && <section className="pios-view notes-view"><div className="pios-page-heading"><div><div className="pios-eyebrow">PERSONAL KNOWLEDGE</div><h1>Notes</h1><p>Capture, organise, search, pin and archive your thoughts. Notes are saved to your PIOS account.</p></div><button className="pios-primary-button small" onClick={() => setQuickCaptureOpen(true)}><Icon name="plus" size={15}/>New note</button></div>{dataLoading ? <Loading/> : <NotesWorkspace notes={notes} folders={folders} onNotesChange={persistNotes} onFoldersChange={persistFolders} onDeleteFolder={removeFolder} onDeleteNote={(id) => persistNotes(notesRef.current.filter((note) => note.id !== id))} onQuickCapture={() => setQuickCaptureOpen(true)} onToast={notify}/>}</section>}

        {activeView === "knowledge" && <section className="pios-view"><div className="pios-page-heading"><div><div className="pios-eyebrow">YOUR SOURCE LIBRARY</div><h1>Knowledge library</h1><p>Documents and text you have uploaded. Content is stored in your private workspace and indexed for AI retrieval.</p></div><button className="pios-primary-button small" onClick={() => setAddSourceOpen(true)}><Icon name="upload" size={15}/>Add source</button></div><div className="pios-library-toolbar"><label className="pios-library-search"><Icon name="search" size={16}/><input value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="Search source titles and collections"/></label><span>{filteredSources.length} sources</span></div><div className="pios-source-grid">{filteredSources.map((source) => <article className="pios-source-card" key={source.id}><div className="pios-source-icon"><Icon name={source.kind === "PDF" ? "file-pdf" : "file-text"} size={20}/></div><div className="pios-source-type">{sourceLabel(source)}</div><h3>{source.title}</h3><p>{source.originalFileName ?? source.collection}</p><div className="pios-source-footer"><span>{relativeTime(source.updatedAt)}</span><button title="Delete source" onClick={() => void removeKnowledgeSource(source.id)}><Icon name="trash-2" size={15}/></button></div></article>)}</div>{!filteredSources.length && <Empty title="Your library is empty" body="Add a PDF, Markdown or text file to make it searchable by PIOS." action="Add source" onClick={() => setAddSourceOpen(true)}/>}</section>}

        {activeView === "assistant" && <section className="pios-view pios-chat-view"><div className="pios-page-heading"><div><div className="pios-eyebrow">GROUNDED AI ASSISTANT</div><h1>Ask PIOS</h1><p>Ask questions using your private notes and uploaded sources as reference material.</p></div><span className="pios-privacy-chip"><Icon name="lock" size={13}/>Workspace-scoped retrieval</span></div><div className="pios-chat-panel"><div className="pios-chat-messages">{!chatEntries.length && <div className="pios-chat-empty"><div className="pios-chat-mark"><Icon name="sparkles" size={23}/></div><h2>What would you like to understand?</h2><p>PIOS will search your notes and uploaded files, then ask your selected model to answer with source references.</p><div className="pios-prompt-chips">{["Summarise my notes about Spring Boot", "What have I saved about RAG?", "Create a study plan from my knowledge library"].map((prompt) => <button key={prompt} onClick={() => setChatQuestion(prompt)}>{prompt}<Icon name="arrow-up-right" size={13}/></button>)}</div></div>}{chatEntries.map((entry) => <div key={entry.id} className={`pios-chat-message ${entry.role}`}><div className="pios-chat-avatar">{entry.role === "assistant" ? <Icon name="sparkles" size={15}/> : user.displayName.slice(0,1).toUpperCase()}</div><div className="pios-chat-bubble"><span className="pios-chat-role">{entry.role === "assistant" ? "PIOS" : "YOU"}</span><p>{entry.text}</p>{entry.retrievalMode && <small className="retrieval-answer-mode">{entry.retrievalMode === "hybrid" ? "Hybrid retrieval" : "Keyword retrieval"}{entry.retrievalWarning ? " · " + entry.retrievalWarning : ""}</small>}{entry.citations && entry.citations.length > 0 && <div className="pios-citations"><strong>Sources used</strong>{entry.citations.map((citation, index) => <details key={citation.chunkId || citation.id}><summary>[{citation.number || index + 1}] {citation.title} · passage {(citation.chunkIndex ?? 0) + 1}</summary><blockquote>{citation.excerpt}</blockquote></details>)}</div>}</div></div>)}{chatBusy && <div className="pios-chat-message assistant"><div className="pios-chat-avatar"><Icon name="sparkles" size={15}/></div><div className="pios-chat-bubble"><span className="pios-chat-role">PIOS</span><p className="pios-thinking">Searching your knowledge and generating an answer…</p></div></div>}</div><form className="pios-chat-composer" onSubmit={handleChat}><textarea value={chatQuestion} onChange={(event) => setChatQuestion(event.target.value)} placeholder="Ask anything about your notes and sources…" rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }}}/><div><span><Icon name="shield-check" size={13}/> Retrieved context is scoped to your account</span><button type="submit" disabled={!chatQuestion.trim() || chatBusy}><Icon name="arrow-up" size={17}/></button></div></form></div></section>}

        {activeView === "learning" && <LearningWorkspace objectives={objectives}
          onCreated={(objective) => { if (activeUserRef.current === user.id) setObjectives((current) => [objective, ...current]); }}
          onRemoved={(id) => { if (activeUserRef.current === user.id) setObjectives((current) => current.filter((item) => item.id !== id)); }}
          onProgress={(id, progress) => { if (activeUserRef.current === user.id) setObjectives((current) => current.map((item) => item.id === id ? { ...item, progress } : item)); }}
          onNoteExported={async () => { const owner = user.id; if (activeUserRef.current !== owner) return; const mapped = (await getNotes()).map(toPiosNote); if (activeUserRef.current !== owner) return; notesRef.current = mapped; noteWriter.reset(mapped); setNotes(mapped); }}
          onOpenProviders={() => setActiveView("ai")} onToast={notify}/>}
        {activeView === "ai" && <section className="pios-view"><AiProvidersView onToast={notify}/></section>}

        {activeView === "graph" && <section className="pios-view"><div className="pios-page-heading"><div><div className="pios-eyebrow">CONNECTED KNOWLEDGE</div><h1>Knowledge map</h1><p>A lightweight view of your current notes and uploaded materials.</p></div></div><div className="pios-panel pios-graph-panel"><div className="pios-graph-center"><span>YOUR KNOWLEDGE</span><strong>{notes.length + sources.length}</strong><small>items in your workspace</small></div><div className="pios-graph-nodes">{notes.slice(0, 8).map((note, index) => <button key={note.id} className={`pios-graph-node n${index % 5}`} onClick={() => setActiveView("notes")}><Icon name="sticky-note" size={15}/>{note.title}</button>)}{sources.slice(0, 8).map((source, index) => <button key={source.id} className={`pios-graph-node s${index % 5}`} onClick={() => setActiveView("knowledge")}><Icon name="file-text" size={15}/>{source.title}</button>)}</div>{!notes.length && !sources.length && <Empty title="Nothing to map yet" body="Save notes and upload sources to start building your knowledge map."/>}</div></section>}

        {activeView === "settings" && <section className="pios-view"><div className="pios-page-heading"><div><div className="pios-eyebrow">ACCOUNT & PRIVACY</div><h1>Settings</h1><p>Manage your personal account and stored data.</p></div></div><div className="pios-settings-grid"><div className="pios-panel"><h2>Account</h2><div className="pios-setting-row"><span>Display name</span><strong>{user.displayName}</strong></div><div className="pios-setting-row"><span>Email</span><strong>{user.email}</strong></div><div className="pios-setting-row"><span>Account created</span><strong>{new Date(user.createdAt).toLocaleDateString()}</strong></div><button className="pios-secondary-button" onClick={logout}><Icon name="log-out" size={15}/>Sign out</button></div><div className="pios-panel"><h2>Privacy & AI</h2><p className="pios-settings-copy">Your notes, sources and learning objectives are scoped by your account ID in backend queries. Provider API keys are encrypted at rest using AES-256-GCM. When you ask PIOS a question, relevant excerpts are sent to your selected AI provider.</p><p className="pios-settings-copy">This local development build stores uploaded originals in the backend uploads volume. Back up the PostgreSQL database and upload volume together.</p></div></div></section>}
      </div>
      <footer className="pios-footer"><span>PIOS · PERSONAL INTELLIGENCE OS</span><span>{dataLoading ? "Syncing…" : "Connected to local backend"}<i/></span></footer>
    </main>

    {quickCaptureOpen && <QuickCaptureModal folders={folders} notes={notes} onClose={() => setQuickCaptureOpen(false)} onSave={(note, folder, pageId) => void saveQuickNote(note, folder, pageId)}/>}
    {addSourceOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddSourceOpen(false); }}><div className="modal add-modal"><div className="modal-header"><div><div className="eyebrow">KNOWLEDGE INGESTION</div><h2>Add to your library</h2><p>Upload a PDF, TXT or Markdown file, or capture text directly.</p></div><button className="icon-button" onClick={() => setAddSourceOpen(false)}><Icon name="x"/></button></div><form onSubmit={submitSource}><div className="form-field"><label>Source title</label><input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="Title for pasted text"/></div><div className="form-field"><label>Paste text (optional)</label><textarea rows={5} value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="Paste an article or your study material…"/></div><div className="form-field"><label>Or upload a file</label><input type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}/><small>Maximum 25 MB. Supported formats: PDF, TXT and Markdown.</small></div><div className="modal-note"><Icon name="lock" size={14}/><span>Files are stored in your backend uploads volume and indexed for workspace-scoped retrieval.</span></div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setAddSourceOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={sourceBusy}>{sourceBusy ? "Processing…" : "Add to library"}</button></div></form></div></div>}
    {showSearch && <div className="pios-search-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSearch(false); }}><div className="pios-search-dialog"><div><Icon name="search" size={18}/><input autoFocus value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search notes and documents…"/><button onClick={() => setShowSearch(false)}><Icon name="x" size={16}/></button></div><p>Search terms are applied to notes and source titles. Press Escape to close.</p><div className="pios-search-results">{notes.filter((note) => `${note.title} ${note.plainText}`.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 5).map((note) => <button key={note.id} onClick={() => { setActiveView("notes"); setShowSearch(false); }}><Icon name="sticky-note" size={16}/><span>{note.title}</span></button>)}{sources.filter((source) => source.title.toLowerCase().includes(globalSearch.toLowerCase())).slice(0, 5).map((source) => <button key={source.id} onClick={() => { setActiveView("knowledge"); setKnowledgeQuery(globalSearch); setShowSearch(false); }}><Icon name="file-text" size={16}/><span>{source.title}</span></button>)}</div></div></div>}
    <PeekDeck key={user.id} accountId={user.id} notes={notes} onCreate={() => setQuickCaptureOpen(true)} onPatch={async (id, patch) => {
      const owner = user.id;
      const previous = notesRef.current.find(note => note.id === id);
      if (!previous) return false;
      const updated = {...previous, ...patch, updatedAt: "Just now", order: Date.now()};
      const ok = await persistNotes(notesRef.current.map(note => note.id === id ? updated : note));
      if (!ok && activeUserRef.current === owner && notesRef.current.find(note => note.id === id) === updated) {
        const restored = notesRef.current.map(note => note.id === id ? previous : note);
        notesRef.current = restored; setNotes(restored);
      }
      return ok;
    }} onRefresh={async () => { if (await noteWriter.save(notesRef.current)) await loadWorkspace(); }}/>
    {toast && <div className="pios-toast"><Icon name="info" size={15}/>{toast}</div>}
  </div>;
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  return <div className="pios-stat-card"><div className="pios-stat-icon"><Icon name={icon} size={18}/></div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}
function PanelHeading({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return <div className="pios-panel-heading"><h2>{title}</h2><button onClick={onAction}>{action}<Icon name="arrow-right" size={13}/></button></div>;
}
function Empty({ title, body, action, onClick }: { title: string; body: string; action?: string; onClick?: () => void }) {
  return <div className="pios-empty"><Icon name="layers" size={21}/><strong>{title}</strong><p>{body}</p>{action && <button onClick={onClick}>{action}</button>}</div>;
}
function Loading() { return <div className="pios-loading"><div className="pios-mark">P</div><span>Loading workspace…</span></div>; }
