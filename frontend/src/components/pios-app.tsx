"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@/components/icon";
import { initialLearningPaths, initialSources, recentActivity } from "@/lib/demo-data";
import type { KnowledgeSource, LearningPath, SourceKind, ViewId } from "@/lib/types";
import NotesWorkspace, { QuickCaptureModal } from "@/components/notes-workspace";
import AiProvidersView from "@/components/ai-providers-view";
import { initialNoteFolders, initialNotes } from "@/lib/notes";
import type { NoteFolder, PiosNote } from "@/lib/notes";

type ChatMessage = { id: number; role: "user" | "assistant"; text: string; sources?: string[] };
type AddTab = "url" | "note" | "file";

const navGroups: { label: string; items: { id: ViewId; label: string; icon: string; badge?: string }[] }[] = [
  { label: "WORKSPACE", items: [
    { id: "overview", label: "Overview", icon: "grid" },
    { id: "knowledge", label: "Knowledge library", icon: "layers" },
    { id: "notes", label: "Notes", icon: "sticky-note" },
    { id: "assistant", label: "Ask PIOS", icon: "sparkles" },
    { id: "learning", label: "Learning paths", icon: "graduation" },
    { id: "graph", label: "Knowledge graph", icon: "network" },
  ] },
  { label: "MANAGE", items: [
    { id: "projects", label: "Projects", icon: "folder" },
    { id: "aiProviders", label: "AI providers", icon: "brain" },
    { id: "integrations", label: "Integrations", icon: "plug" },
    { id: "activity", label: "Activity", icon: "activity" },
  ] },
];

const viewTitles: Record<ViewId, { title: string; subtitle: string }> = {
  overview: { title: "Overview", subtitle: "Your knowledge and learning, in one place." },
  knowledge: { title: "Knowledge library", subtitle: "Everything you have captured, organised and understood." },
  notes: { title: "Notes", subtitle: "Capture thoughts quickly, then let PIOS help organise them." },
  assistant: { title: "Ask PIOS", subtitle: "Think across your knowledge, with sources attached." },
  learning: { title: "Learning paths", subtitle: "Turn disconnected resources into structured progress." },
  graph: { title: "Knowledge graph", subtitle: "Explore how your ideas and concepts connect." },
  projects: { title: "Projects", subtitle: "Bring knowledge into the work you are doing." },
  integrations: { title: "Integrations", subtitle: "Connect the tools you already use, with permission." },
  aiProviders: { title: "AI providers", subtitle: "Choose which AI models power your PIOS workspace." },
  activity: { title: "Activity", subtitle: "A timeline of what is changing in your workspace." },
  settings: { title: "Settings", subtitle: "Manage your workspace and privacy preferences." },
};

const initialChat: ChatMessage[] = [
  {
    id: 1,
    role: "assistant",
    text: "Hi. I can help you connect ideas across your saved knowledge. Ask a question, compare concepts, or turn something you have collected into a learning plan.",
  },
];

function BrandMark() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark"><span /><span /><span /><span /></div>
      <div className="brand-name">pios<span> .</span><small>PERSONAL INTELLIGENCE OS</small></div>
    </div>
  );
}

function NavButton({ id, label, icon, active, onClick }: { id: ViewId; label: string; icon: string; active: boolean; onClick: (id: ViewId) => void }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={() => onClick(id)}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
      {id === "assistant" && <span className="nav-sparkle"><Icon name="sparkle" size={13} /></span>}
    </button>
  );
}

function SourceIcon({ kind, color }: { kind: SourceKind; color: string }) {
  const icon = kind === "PDF" ? "file" : kind === "Web page" ? "globe" : kind === "Video" ? "video" : "sticky-note";
  return <div className={`source-icon ${color}`}><Icon name={icon} size={18} /></div>;
}

function ProgressBar({ value, tone = "green" }: { value: number; tone?: string }) {
  return <div className={`progress-track ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

function StatCard({ label, value, detail, icon, tone, trend }: { label: string; value: string; detail: string; icon: string; tone: string; trend?: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon name={icon} size={18} /></div>
      <div className="stat-copy"><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-detail">{detail}</span></div>
      {trend && <span className="stat-trend"><Icon name="arrow-up-right" size={13} /> {trend}</span>}
    </div>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="section-title"><h2>{title}</h2>{action && <button className="text-action" onClick={onAction}>{action}<Icon name="arrow-right" size={14} /></button>}</div>;
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="layers" size={22} /></div><h3>{title}</h3><p>{detail}</p>{action && <button className="button button-primary button-small" onClick={onAction}><Icon name="plus" size={15} />{action}</button>}</div>;
}

export default function PiosApp() {
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [sources, setSources] = useState<KnowledgeSource[]>(initialSources);
  const [learningPaths, setLearningPaths] = useState<LearningPath[]>(initialLearningPaths);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChat);
  const [chatInput, setChatInput] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState("Retrieval augmented generation");
  const [collectionFilter, setCollectionFilter] = useState("All sources");
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({});
  const [privacyMode, setPrivacyMode] = useState(true);
  const [notes, setNotes] = useState<PiosNote[]>(initialNotes);
  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>(initialNoteFolders);
  const [notesHydrated, setNotesHydrated] = useState(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);

  useEffect(() => {
    try {
      const savedNotes = window.localStorage.getItem("pios-notes-v1");
      const savedFolders = window.localStorage.getItem("pios-note-folders-v1");
      if (savedNotes) setNotes(JSON.parse(savedNotes) as PiosNote[]);
      if (savedFolders) setNoteFolders(JSON.parse(savedFolders) as NoteFolder[]);
    } catch {
      setToast("Saved notes could not be loaded. Demo notes are still available.");
    }
    setNotesHydrated(true);
  }, []);

  useEffect(() => {
    if (!notesHydrated) return;
    window.localStorage.setItem("pios-notes-v1", JSON.stringify(notes));
    window.localStorage.setItem("pios-note-folders-v1", JSON.stringify(noteFolders));
  }, [notes, noteFolders, notesHydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setQuickCaptureOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setActiveView("notes");
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setAddOpen(false);
        setQuickCaptureOpen(false);
        setSelectedSource(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filteredSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sources.filter((source) => {
      const matchesQuery = !needle || [source.title, source.collection, source.kind, ...source.tags].join(" ").toLowerCase().includes(needle);
      const matchesCollection = collectionFilter === "All sources" || source.collection === collectionFilter;
      return matchesQuery && matchesCollection;
    });
  }, [sources, query, collectionFilter]);

  const navigate = (id: ViewId) => {
    setActiveView(id);
    setMobileNavOpen(false);
    setSearchOpen(false);
  };

  const openAssistantWithPrompt = (prompt: string) => {
    setActiveView("assistant");
    setChatInput(prompt);
    setMobileNavOpen(false);
  };

  const addSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let title = "";
    let kind: SourceKind = "Note";
    let collection = "Inbox";
    let readTime = "New source";
    if (addTab === "url") {
      if (!sourceUrl.trim()) return;
      try {
        const parsed = new URL(sourceUrl.trim());
        title = parsed.hostname.replace(/^www\./, "") + (parsed.pathname === "/" ? "" : parsed.pathname.replaceAll("/", " · "));
      } catch {
        setToast("Enter a valid URL, including https://");
        return;
      }
      kind = "Web page";
      readTime = "Processing pending";
    } else if (addTab === "note") {
      if (!noteTitle.trim() || !noteBody.trim()) return;
      title = noteTitle.trim();
      kind = "Note";
      readTime = "Personal note";
    } else {
      if (!selectedFile) return;
      title = selectedFile.name.replace(/\.[^.]+$/, "");
      kind = "PDF";
      readTime = "Upload pending";
    }
    const newSource: KnowledgeSource = {
      id: `s-${Date.now()}`, title, kind, collection, updated: "Added just now", readTime,
      concepts: 0, color: kind === "PDF" ? "rose" : kind === "Web page" ? "blue" : "amber",
      initials: title.slice(0, 2).toUpperCase(), tags: ["Inbox", "New"],
    };
    setSources((current) => [newSource, ...current]);
    setAddOpen(false);
    setSourceUrl(""); setNoteTitle(""); setNoteBody(""); setSelectedFile(null);
    setToast("Source added to your inbox. Connect the backend to process it.");
  };

  const saveQuickNote = (note: PiosNote, newFolder?: NoteFolder, appendToPageId?: string) => {
    if (newFolder && !noteFolders.some((folder) => folder.id === newFolder.id)) {
      setNoteFolders((current) => [...current, newFolder]);
    }
    if (appendToPageId) {
      setNotes((current) => current.map((existing) => existing.id === appendToPageId
        ? { ...existing, bodyHtml: `${existing.bodyHtml}<hr/><h3>${note.title}</h3>${note.bodyHtml}`, plainText: `${existing.plainText} ${note.title} ${note.plainText}`.trim(), updatedAt: "Just now", order: Date.now() }
        : existing));
      setQuickCaptureOpen(false);
      const pageTitle = notes.find((existing) => existing.id === appendToPageId)?.title ?? "existing page";
      setToast(`Added this capture to “${pageTitle}”.`);
      return;
    }
    setNotes((current) => [note, ...current]);
    const destination = newFolder?.name ?? noteFolders.find((folder) => folder.id === note.folderId)?.name ?? "Inbox";
    const source: KnowledgeSource = {
      id: note.id, title: note.title, kind: "Note", collection: destination, updated: "Added just now", readTime: "Personal note",
      concepts: 0, color: "amber", initials: note.title.slice(0, 2).toUpperCase(), tags: [destination, "Note"],
    };
    setSources((current) => [source, ...current]);
    setQuickCaptureOpen(false);
    setToast(`Note saved in ${destination}. AI routing is a local demo preview.`);
  };

  const sendMessage = (event?: FormEvent<HTMLFormElement>, explicitText?: string) => {
    event?.preventDefault();
    const text = (explicitText ?? chatInput).trim();
    if (!text) return;
    const userMessage: ChatMessage = { id: Date.now(), role: "user", text };
    const response: ChatMessage = {
      id: Date.now() + 1,
      role: "assistant",
      text: "Here is a starting point from the knowledge currently in this demo workspace. In the connected product, PIOS will retrieve relevant passages, compare them, and attach precise source citations before answering.\n\nA useful way to approach this is to separate the core idea, the mechanism behind it, and the trade-offs. Then connect each part to the concepts you have already saved. This response is illustrative; it is not generated by a live model.",
      sources: ["Designing Data-Intensive Applications", "RAG from first principles"],
    };
    setChatMessages((current) => [...current, userMessage, response]);
    setChatInput("");
  };

  const finishLesson = (pathId: string) => {
    setLearningPaths((current) => current.map((path) => {
      if (path.id !== pathId) return path;
      const lessonsDone = Math.min(path.lessonsTotal, path.lessonsDone + 1);
      return { ...path, lessonsDone, progress: Math.round((lessonsDone / path.lessonsTotal) * 100) };
    }));
    setToast("Learning progress updated in this demo session.");
  };

  const currentMeta = viewTitles[activeView];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-top">
          <BrandMark />
          <button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><Icon name="x" /></button>
        </div>
        <button className="workspace-switcher" onClick={() => setToast("Workspace switcher will be connected to workspace management.")}>
          <div className="workspace-avatar">P</div>
          <div className="workspace-meta"><strong>Personal workspace</strong><span>Free workspace</span></div>
          <Icon name="chevron-down" size={15} />
        </button>
        <div className="sidebar-scroll">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => <NavButton key={item.id} {...item} active={activeView === item.id} onClick={navigate} />)}
            </div>
          ))}
          <div className="sidebar-bottom-group">
            <div className="nav-label">PREFERENCES</div>
            <button className={`nav-item ${activeView === "settings" ? "active" : ""}`} onClick={() => navigate("settings")}><Icon name="settings" size={18} /><span>Settings</span></button>
            <button className="nav-item" onClick={() => setToast("Help centre is not connected in this demo.")}><Icon name="help" size={18} /><span>Help & feedback</span></button>
          </div>
        </div>
        <div className="sidebar-footer">
          <div className="plan-card"><div className="plan-top"><span>YOUR WORKSPACE</span><span className="plan-pill">FREE</span></div><div className="plan-meter"><span style={{ width: "34%" }} /></div><p>34% of your source allowance used</p><button onClick={() => setToast("Plan management will be available after billing is configured.")}>View usage <Icon name="arrow-up-right" size={13} /></button></div>
          <button className="profile-row" onClick={() => navigate("settings")}><div className="profile-avatar">U</div><div className="profile-meta"><strong>Your profile</strong><span>Personal account</span></div><Icon name="more" size={17} /></button>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Icon name="menu" /></button>
            <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron-right" size={13} /><strong>{currentMeta.title}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="top-search-wrap">
              <button className="top-search" onClick={() => setSearchOpen((open) => !open)}><Icon name="search" size={16} /><span>Search anything...</span><kbd>⌘ K</kbd></button>
              {searchOpen && <div className="search-popover"><div className="search-input-row"><Icon name="search" size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources, concepts, collections..." /><button onClick={() => { setSearchOpen(false); setQuery(""); }}><Icon name="x" size={15} /></button></div><div className="search-hint">{query ? `${filteredSources.length} matching sources` : "SUGGESTED SEARCHES"}</div>{(query ? filteredSources.slice(0, 5) : sources.slice(0, 3)).map((source) => <button className="search-result" key={source.id} onClick={() => { setSelectedSource(source); setSearchOpen(false); }}><SourceIcon kind={source.kind} color={source.color} /><span><strong>{source.title}</strong><small>{source.collection}</small></span><Icon name="arrow-up-right" size={14} /></button>)}{query && filteredSources.length === 0 && <p className="search-empty">No sources found. Try a different term.</p>}</div>}
            </div>
            <button className="top-quick-capture" onClick={() => setQuickCaptureOpen(true)} title="Quick capture · Ctrl + Alt + N"><Icon name="plus" size={15}/><span>Quick capture</span><kbd>Alt N</kbd></button>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast("You are all caught up.")}><Icon name="bell" size={18} /><i /></button>
            <button className="button button-primary add-source-top" onClick={() => setAddOpen(true)}><Icon name="plus" size={16} />Add source</button>
          </div>
        </header>

        <div className="page-content">
          {activeView === "overview" && <OverviewView sources={sources} learningPaths={learningPaths} onNavigate={navigate} onAdd={() => setAddOpen(true)} onPrompt={openAssistantWithPrompt} onOpenSource={setSelectedSource} />}
          {activeView === "knowledge" && <KnowledgeView sources={filteredSources} query={query} onQuery={setQuery} collection={collectionFilter} onCollection={setCollectionFilter} onAdd={() => setAddOpen(true)} onOpenSource={setSelectedSource} />}
          {activeView === "notes" && <NotesWorkspace notes={notes} folders={noteFolders} onNotesChange={setNotes} onFoldersChange={setNoteFolders} onQuickCapture={() => setQuickCaptureOpen(true)} onToast={setToast} />}
          {activeView === "assistant" && <AssistantView messages={chatMessages} input={chatInput} onInput={setChatInput} onSend={sendMessage} />}
          {activeView === "learning" && <LearningView paths={learningPaths} onFinish={finishLesson} onPrompt={openAssistantWithPrompt} />}
          {activeView === "graph" && <GraphView selected={selectedGraphNode} onSelect={setSelectedGraphNode} />}
          {activeView === "projects" && <ProjectsView onPrompt={openAssistantWithPrompt} onToast={setToast} />}
          {activeView === "integrations" && <IntegrationsView integrations={integrations} onToggle={(key) => { setIntegrations((current) => ({ ...current, [key]: !current[key] })); setToast("Demo connection state updated. OAuth is not configured."); }} />}
          {activeView === "aiProviders" && <AiProvidersView onToast={setToast} />}
          {activeView === "activity" && <ActivityView />}
          {activeView === "settings" && <SettingsView privacyMode={privacyMode} onPrivacy={setPrivacyMode} onToast={setToast} />}
        </div>
        <footer className="app-footer"><span>PIOS preview <b>·</b> Frontend demo</span><span><i className="status-dot" /> All systems local <b>·</b> Backend not connected</span></footer>
      </main>

      {quickCaptureOpen && <QuickCaptureModal folders={noteFolders} notes={notes} onClose={() => setQuickCaptureOpen(false)} onSave={saveQuickNote} />}
      {addOpen && <AddSourceModal tab={addTab} onTab={setAddTab} url={sourceUrl} onUrl={setSourceUrl} title={noteTitle} onTitle={setNoteTitle} body={noteBody} onBody={setNoteBody} file={selectedFile} onFile={setSelectedFile} onClose={() => setAddOpen(false)} onSubmit={addSource} />}
      {selectedSource && <SourceDetailModal source={selectedSource} onClose={() => setSelectedSource(null)} onAsk={(prompt) => { setSelectedSource(null); openAssistantWithPrompt(prompt); }} />}
      {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}</div>}
    </div>
  );
}

function OverviewView({ sources, learningPaths, onNavigate, onAdd, onPrompt, onOpenSource }: {
  sources: KnowledgeSource[]; learningPaths: LearningPath[]; onNavigate: (id: ViewId) => void; onAdd: () => void;
  onPrompt: (prompt: string) => void; onOpenSource: (source: KnowledgeSource) => void;
}) {
  const totalConcepts = sources.reduce((sum, source) => sum + source.concepts, 0);
  return (
    <div className="view-stack">
      <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-dot" /> WEDNESDAY, NOVEMBER 4, 2026</div><h1>Your knowledge, <em>connected.</em></h1><p>A clear view of what you know, what you are learning, and what comes next.</p></div><button className="button button-secondary" onClick={onAdd}><Icon name="plus" size={16} />Capture something</button></div>
      <div className="stats-grid">
        <StatCard label="SOURCES SAVED" value={String(sources.length).padStart(2, "0")} detail="Across 2 collections" icon="layers" tone="mint" trend="+2 this week" />
        <StatCard label="CONCEPTS MAPPED" value={String(totalConcepts).padStart(2, "0")} detail="Connected in your graph" icon="network" tone="lavender" trend="+8 this week" />
        <StatCard label="LEARNING STREAK" value="06 days" detail="You are building a habit" icon="zap" tone="peach" />
        <StatCard label="AVG. MASTERY" value="72%" detail="Across active learning paths" icon="target" tone="sky" trend="+5%" />
      </div>
      <div className="dashboard-grid">
        <section className="panel continue-panel">
          <div className="panel-kicker"><span className="kicker-icon"><Icon name="graduation" size={15} /></span> PICK UP WHERE YOU LEFT OFF <span className="kicker-right">YOUR LEARNING</span></div>
          <div className="continue-content"><div className="continue-art"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-core"><Icon name="braces" size={34}/></div><span className="art-node node-one"/><span className="art-node node-two"/><span className="art-node node-three"/></div><div className="continue-copy"><span className="subject-chip">BACKEND ENGINEERING</span><h2>Spring Boot: Production Backend</h2><p>Next up: Building secure REST APIs with Spring Security.</p><div className="continue-progress"><div><span>YOUR PROGRESS</span><strong>68%</strong></div><ProgressBar value={68}/><small>8 of 12 lessons completed</small></div><button className="button button-primary" onClick={() => onNavigate("learning")}>Continue learning <Icon name="arrow-right" size={16}/></button></div></div>
        </section>
        <section className="panel ask-panel"><div className="panel-heading"><div><span className="panel-overline">YOUR SECOND BRAIN</span><h2>Ask your knowledge</h2></div><div className="ask-spark"><Icon name="sparkles" size={18}/></div></div><p className="ask-description">Get answers grounded in the things you have saved. Every answer can point back to its source.</p><div className="ask-input-shell" onClick={() => onPrompt("")}><span>What would you like to understand?</span><button aria-label="Open Ask PIOS"><Icon name="arrow-up-right" size={17}/></button></div><div className="prompt-list"><button onClick={() => onPrompt("How does RAG work, and why do embeddings matter?")}><span className="prompt-dot purple"/>Connect RAG and embeddings<Icon name="arrow-up-right" size={13}/></button><button onClick={() => onPrompt("Summarise my notes on Spring Security.")}><span className="prompt-dot green"/>Summarise my Spring Security notes<Icon name="arrow-up-right" size={13}/></button><button onClick={() => onPrompt("What concepts should I revise this week?")}><span className="prompt-dot amber"/>What should I revise this week?<Icon name="arrow-up-right" size={13}/></button></div><button className="ask-footer-link" onClick={() => onNavigate("assistant")}>Open PIOS assistant <Icon name="arrow-right" size={14}/></button></section>
      </div>
      <div className="lower-grid">
        <section className="panel sources-panel"><SectionTitle title="Recently captured" action="View library" onAction={() => onNavigate("knowledge")}/><div className="source-list">{sources.slice(0, 4).map((source) => <button key={source.id} className="source-row" onClick={() => onOpenSource(source)}><SourceIcon kind={source.kind} color={source.color}/><span className="source-row-main"><strong>{source.title}</strong><small>{source.collection} <i>·</i> {source.updated}</small></span><span className="source-concepts"><b>{source.concepts || "—"}</b><small>concepts</small></span><Icon name="chevron-right" className="source-chevron" size={16}/></button>)}</div></section>
        <section className="panel focus-panel"><SectionTitle title="Your learning paths" action="All paths" onAction={() => onNavigate("learning")}/><div className="mini-paths">{learningPaths.slice(0, 3).map((path) => <div className="mini-path" key={path.id}><div className={`mini-path-icon ${path.color}`}><Icon name={path.icon} size={16}/></div><div className="mini-path-main"><strong>{path.title}</strong><div className="mini-progress-row"><ProgressBar value={path.progress} tone={path.color}/><span>{path.progress}%</span></div></div></div>)}</div><div className="focus-note"><div className="focus-note-icon"><Icon name="target" size={15}/></div><p><strong>Today's focus</strong><br/>Complete one lesson and review 3 concepts you learned yesterday.</p></div></section>
      </div>
      <section className="value-strip"><div className="value-strip-mark"><Icon name="sparkles" size={18}/></div><div><strong>Knowledge should compound, not disappear.</strong><span>PIOS connects what you capture with what you learn and what you build.</span></div><button onClick={() => onNavigate("graph")}>Explore your knowledge graph <Icon name="arrow-right" size={14}/></button></section>
    </div>
  );
}

function KnowledgeView({ sources, query, onQuery, collection, onCollection, onAdd, onOpenSource }: {
  sources: KnowledgeSource[]; query: string; onQuery: (value: string) => void; collection: string; onCollection: (value: string) => void;
  onAdd: () => void; onOpenSource: (source: KnowledgeSource) => void;
}) {
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  return (
    <div className="view-stack">
      <div className="page-heading-row"><div><div className="eyebrow">YOUR PERSONAL KNOWLEDGE BASE</div><h1>Knowledge library</h1><p>One place for the things you want to understand, remember and reuse.</p></div><button className="button button-primary" onClick={onAdd}><Icon name="plus" size={16}/>Add source</button></div>
      <div className="library-summary"><div><strong>{sources.length}</strong><span>visible sources</span></div><div className="summary-divider"/><div><strong>{sources.reduce((sum, source) => sum + source.concepts, 0)}</strong><span>mapped concepts</span></div><div className="summary-divider"/><div><strong>2</strong><span>collections</span></div></div>
      <div className="library-toolbar"><div className="library-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search titles, tags, concepts..."/><kbd>/</kbd></div><div className="toolbar-right"><select value={collection} onChange={(event) => onCollection(event.target.value)} aria-label="Filter collection"><option>All sources</option><option>Backend Engineering</option><option>AI & Machine Learning</option><option>Inbox</option></select><div className="view-toggle"><button className={viewMode === "list" ? "selected" : ""} onClick={() => setViewMode("list")} aria-label="List view"><Icon name="menu" size={16}/></button><button className={viewMode === "grid" ? "selected" : ""} onClick={() => setViewMode("grid")} aria-label="Grid view"><Icon name="grid" size={16}/></button></div></div></div>
      {sources.length === 0 ? <EmptyState title="No sources match this search" detail="Try a different keyword or clear the collection filter." action="Clear filters" onAction={() => { onQuery(""); onCollection("All sources"); }}/> : viewMode === "list" ? <div className="panel library-table"><div className="table-head"><span>NAME</span><span>COLLECTION</span><span>UPDATED</span><span>CONCEPTS</span><span/></div>{sources.map((source) => <button className="table-row" key={source.id} onClick={() => onOpenSource(source)}><div className="table-name"><SourceIcon kind={source.kind} color={source.color}/><span><strong>{source.title}</strong><small>{source.kind} <i>·</i> {source.readTime}</small></span></div><span className="table-collection">{source.collection}</span><span className="table-updated">{source.updated}</span><span className="table-count">{source.concepts || "—"}</span><Icon name="chevron-right" className="table-chevron" size={16}/></button>)}</div> : <div className="library-card-grid">{sources.map((source) => <button className="library-card" key={source.id} onClick={() => onOpenSource(source)}><div className="library-card-top"><SourceIcon kind={source.kind} color={source.color}/><span className="source-type-tag">{source.kind}</span><Icon name="more" size={16}/></div><h3>{source.title}</h3><p>{source.collection}</p><div className="library-card-tags">{source.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="library-card-bottom"><span><Icon name="network" size={13}/>{source.concepts} concepts</span><span>{source.updated.replace("Updated ", "")}</span></div></button>)}</div>}
      <div className="library-footnote"><Icon name="lock" size={14}/> Your sources are private to this workspace. Demo content is stored only in this browser session.</div>
    </div>
  );
}

function AssistantView({ messages, input, onInput, onSend }: { messages: ChatMessage[]; input: string; onInput: (value: string) => void; onSend: (event?: FormEvent<HTMLFormElement>, text?: string) => void }) {
  const suggestions = ["Explain how vector search works", "Connect my notes on RAG and LLMs", "Create a revision plan for this week"];
  return (
    <div className="assistant-layout">
      <div className="assistant-main"><div className="assistant-heading"><div className="assistant-avatar"><Icon name="sparkles" size={22}/></div><div><div className="eyebrow">YOUR CONTEXT-AWARE ASSISTANT</div><h1>Ask PIOS</h1><p>Answers should be grounded in your knowledge, not just generated from the open web.</p></div><span className="demo-badge">DEMO MODE</span></div>
        <div className="chat-thread">{messages.map((message) => <div className={`chat-message ${message.role}`} key={message.id}><div className={`chat-avatar ${message.role}`}>{message.role === "assistant" ? <Icon name="sparkles" size={16}/> : "U"}</div><div className="chat-message-content"><div className="chat-role-name">{message.role === "assistant" ? "PIOS assistant" : "You"}<span>{message.role === "assistant" ? "· Illustrative response" : "· Just now"}</span></div><div className="chat-bubble">{message.text.split("\n").map((line, index) => <p key={`${message.id}-${index}`}>{line || " "}</p>)}</div>{message.sources && <div className="answer-sources"><div className="answer-sources-title"><Icon name="bookmark" size={13}/> RELATED KNOWLEDGE</div>{message.sources.map((source) => <span key={source}><Icon name="file" size={13}/>{source}<Icon name="external" size={11}/></span>)}</div>}</div></div>)}</div>
        <div className="suggestion-row">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => onSend(undefined, suggestion)}>{suggestion}<Icon name="arrow-up-right" size={13}/></button>)}</div>
        <form className="chat-composer" onSubmit={onSend}><textarea value={input} onChange={(event) => onInput(event.target.value)} placeholder="Ask anything about your knowledge..." rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }}/><div className="composer-bottom"><div className="composer-tools"><button type="button" onClick={() => alert("File attachments will be enabled when the ingestion API is connected.")}><Icon name="paperclip" size={15}/>Attach</button><span><Icon name="lock" size={12}/> Private workspace</span></div><button className="send-button" type="submit" disabled={!input.trim()}><Icon name="arrow-up" size={17}/></button></div></form>
        <div className="assistant-disclaimer">Demo interface only. Live LLM, retrieval and citation verification are not connected.</div>
      </div>
      <aside className="assistant-context"><div className="context-card"><div className="context-card-head"><span className="panel-overline">YOUR CONTEXT</span><span className="live-indicator"><i/>LOCAL DEMO</span></div><h3>Knowledge used by PIOS</h3><p>In the production system, relevant sources are retrieved based on workspace permissions and the question.</p><div className="context-source-list">{initialSources.slice(0, 3).map((source) => <div key={source.id}><SourceIcon kind={source.kind} color={source.color}/><span><strong>{source.title}</strong><small>{source.concepts} concepts</small></span></div>)}</div><button className="context-link" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Context settings <Icon name="arrow-up-right" size={13}/></button></div><div className="context-principle"><div className="principle-icon"><Icon name="shield-check" size={18}/></div><strong>Source-aware by design</strong><p>Every production answer should show where its information came from and what remains uncertain.</p></div></aside>
    </div>
  );
}

function LearningView({ paths, onFinish, onPrompt }: { paths: LearningPath[]; onFinish: (id: string) => void; onPrompt: (prompt: string) => void }) {
  const [tab, setTab] = useState("In progress");
  return (
    <div className="view-stack"><div className="page-heading-row"><div><div className="eyebrow">LEARN WITH INTENTION</div><h1>Learning paths</h1><p>Build mastery through connected concepts, practice and revision.</p></div><button className="button button-primary" onClick={() => onPrompt("Help me create a structured learning path for a topic I want to master.")}><Icon name="plus" size={16}/>Create learning path</button></div>
      <div className="learning-overview-grid"><div className="learning-overview-card"><div className="stat-icon mint"><Icon name="graduation" size={18}/></div><span>ACTIVE PATHS</span><strong>{paths.filter((path) => path.progress < 100).length}</strong><small>Keep moving forward</small></div><div className="learning-overview-card"><div className="stat-icon lavender"><Icon name="target" size={18}/></div><span>LESSONS COMPLETED</span><strong>{paths.reduce((sum, path) => sum + path.lessonsDone, 0)}</strong><small>Across all paths</small></div><div className="learning-overview-card"><div className="stat-icon peach"><Icon name="zap" size={18}/></div><span>WEEKLY STREAK</span><strong>6 days</strong><small>One session at a time</small></div><div className="learning-overview-card"><div className="stat-icon sky"><Icon name="brain" size={18}/></div><span>CONCEPT MASTERY</span><strong>72%</strong><small>Average across paths</small></div></div>
      <div className="learning-tabs">{["In progress", "Completed", "All paths"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
      <div className="learning-path-list">{paths.filter((path) => tab === "All paths" || (tab === "Completed" ? path.progress === 100 : path.progress < 100)).map((path, index) => <div className="panel learning-path-card" key={path.id}><div className={`learning-path-art ${path.color}`}><div className="art-ring ring-a"/><div className="art-ring ring-b"/><div className="art-letter">{index === 0 ? "01" : index === 1 ? "02" : "03"}</div><Icon name={path.icon} size={23}/></div><div className="learning-path-info"><div className="learning-path-meta"><span>{path.subtitle.split(" · ")[0].toUpperCase()}</span><span className={path.progress === 100 ? "complete-label" : "in-progress-label"}>{path.progress === 100 ? "COMPLETED" : "IN PROGRESS"}</span></div><h2>{path.title}</h2><p>Continue from your last lesson. Review concepts and check understanding as you go.</p><div className="path-progress-line"><ProgressBar value={path.progress} tone={path.color}/><strong>{path.progress}%</strong></div><div className="path-bottom"><span>{path.lessonsDone} of {path.lessonsTotal} lessons completed</span><button className="button button-secondary button-small" onClick={() => onFinish(path.id)}>{path.progress === 100 ? "Review path" : "Complete next lesson"}<Icon name="arrow-right" size={14}/></button></div></div></div>)}{paths.length === 0 && <EmptyState title="No learning paths yet" detail="Create a path to organise your next learning goal."/>}</div>
      <div className="revision-banner"><div className="revision-icon"><Icon name="refresh" size={20}/></div><div><strong>Make knowledge stick with spaced revision.</strong><p>PIOS will surface concepts when they are due for review, based on recall and confidence.</p></div><button onClick={() => onPrompt("Build a spaced revision session from my saved concepts.")}>Plan a revision session <Icon name="arrow-right" size={14}/></button></div>
    </div>
  );
}

function GraphView({ selected, onSelect }: { selected: string; onSelect: (value: string) => void }) {
  const nodes = [
    { id: "RAG", label: "Retrieval augmented generation", x: 395, y: 188, r: 44, cls: "main" },
    { id: "Embeddings", label: "Embeddings", x: 205, y: 93, r: 32, cls: "violet" },
    { id: "Vector search", label: "Vector search", x: 570, y: 90, r: 34, cls: "blue" },
    { id: "Chunking", label: "Chunking", x: 190, y: 280, r: 28, cls: "amber" },
    { id: "LLMs", label: "Large language models", x: 590, y: 285, r: 38, cls: "green" },
    { id: "Spring AI", label: "Spring AI", x: 385, y: 366, r: 30, cls: "rose" },
    { id: "Semantic search", label: "Semantic search", x: 750, y: 185, r: 26, cls: "sky" },
  ];
  const edges = [[0,1],[0,2],[0,3],[0,4],[0,5],[2,6],[1,3],[4,5],[2,4]];
  const selectedNode = nodes.find((node) => node.label === selected) ?? nodes[0];
  return (
    <div className="view-stack"><div className="page-heading-row"><div><div className="eyebrow">CONCEPTS & RELATIONSHIPS</div><h1>Knowledge graph</h1><p>See the connections between the things you are learning.</p></div><button className="button button-secondary" onClick={() => onSelect("Retrieval augmented generation")}><Icon name="refresh" size={15}/>Reset graph</button></div>
      <div className="graph-stats"><div><span className="graph-stat-dot purple"/><strong>100+</strong><small>Concepts to connect</small></div><div><span className="graph-stat-dot green"/><strong>68</strong><small>Relationships discovered</small></div><div><span className="graph-stat-dot amber"/><strong>12</strong><small>Source clusters</small></div><div className="graph-controls"><button><Icon name="minus" size={15}/></button><span>100%</span><button><Icon name="plus" size={15}/></button><button><Icon name="sliders" size={15}/> Filters</button></div></div>
      <div className="graph-layout"><div className="panel graph-canvas"><div className="graph-canvas-head"><div><span className="panel-overline">YOUR CONCEPT MAP</span><strong>AI & Machine Learning</strong></div><span className="graph-map-tag"><i/> LIVE PREVIEW</span></div><svg className="graph-svg" viewBox="0 0 840 430" role="img" aria-label="Concept map connecting RAG, embeddings, vector search, chunking, LLMs, Spring AI and semantic search">{edges.map(([a,b], index) => <line key={index} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} className="graph-edge"/>)}{nodes.map((node) => <g key={node.id} className={`graph-node ${node.cls} ${selectedNode.id === node.id ? "selected" : ""}`} onClick={() => onSelect(node.label)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onSelect(node.label); }}><circle cx={node.x} cy={node.y} r={node.r + 9} className="node-halo"/><circle cx={node.x} cy={node.y} r={node.r} className="node-circle"/><text x={node.x} y={node.y + 4} textAnchor="middle" className="node-code">{node.id === "RAG" ? "RAG" : node.id.slice(0, 2).toUpperCase()}</text><text x={node.x} y={node.y + node.r + 20} textAnchor="middle" className="node-label">{node.label}</text></g>)}</svg><div className="graph-legend"><span><i className="legend-dot violet"/> AI concepts</span><span><i className="legend-dot green"/> Engineering</span><span><i className="legend-dot amber"/> Foundations</span><span><i className="legend-line"/> Relationship</span></div></div><aside className="panel graph-detail"><span className="panel-overline">SELECTED CONCEPT</span><div className="graph-detail-icon"><Icon name="network" size={21}/></div><h2>{selectedNode.label}</h2><p>This concept is connected to related ideas across your saved learning material.</p><div className="detail-divider"/><div className="detail-stat"><span>Connected concepts</span><strong>{selectedNode.id === "RAG" ? "5" : "3"}</strong></div><div className="detail-stat"><span>Source references</span><strong>{selectedNode.id === "RAG" ? "4" : "2"}</strong></div><div className="detail-related"><span>RELATED CONCEPTS</span>{nodes.filter((node) => node.id !== selectedNode.id).slice(0, 4).map((node) => <button key={node.id} onClick={() => onSelect(node.label)}><i className={`related-dot ${node.cls}`}/>{node.label}<Icon name="chevron-right" size={13}/></button>)}</div><button className="button button-secondary button-block" onClick={() => onSelect("Retrieval augmented generation")}>View in context</button></aside></div><div className="graph-footnote"><Icon name="info" size={14}/> This is a sample visualisation. The production graph will be generated from extracted concepts and verified relationships.</div>
    </div>
  );
}

function ProjectsView({ onPrompt, onToast }: { onPrompt: (prompt: string) => void; onToast: (message: string) => void }) {
  const projects = [
    { title: "Personal Intelligence OS", desc: "Build the foundation for a connected knowledge and learning workspace.", status: "IN DEVELOPMENT", progress: 24, count: "12 linked sources", icon: "sparkles", color: "green" },
    { title: "Java Backend Mastery", desc: "A structured track for production backend engineering with Java and Spring.", status: "ACTIVE", progress: 58, count: "8 linked sources", icon: "layers", color: "purple" },
    { title: "Generative AI Foundations", desc: "Understand LLMs, retrieval, embeddings and evaluation through projects.", status: "PLANNING", progress: 12, count: "5 linked sources", icon: "brain", color: "blue" },
  ];
  return <div className="view-stack"><div className="page-heading-row"><div><div className="eyebrow">KNOWLEDGE IN ACTION</div><h1>Projects</h1><p>Connect the information you collect to outcomes you are working towards.</p></div><button className="button button-primary" onClick={() => onToast("Project creation will be connected to the Projects API.")}><Icon name="plus" size={16}/>New project</button></div><div className="project-highlight"><div className="project-highlight-symbol"><Icon name="target" size={24}/></div><div><span className="panel-overline">PROJECT WORKSPACE</span><h2>Move from knowing to doing.</h2><p>Attach sources, decisions and learning objectives to each project so context travels with the work.</p></div><button className="button button-secondary" onClick={() => onPrompt("How can I apply my saved backend and AI concepts to a practical project?")}>Ask PIOS for direction <Icon name="arrow-right" size={14}/></button></div><div className="project-grid">{projects.map((project) => <div className="panel project-card" key={project.title}><div className="project-card-top"><div className={`project-icon ${project.color}`}><Icon name={project.icon} size={19}/></div><span className="project-status">{project.status}</span><button className="icon-button" onClick={() => onToast("Project options will be available soon.")}><Icon name="more" size={17}/></button></div><h2>{project.title}</h2><p>{project.desc}</p><div className="project-card-progress"><div><span>PROJECT PROGRESS</span><strong>{project.progress}%</strong></div><ProgressBar value={project.progress} tone={project.color}/></div><div className="project-card-bottom"><span><Icon name="layers" size={13}/>{project.count}</span><button onClick={() => onPrompt(`Summarise the key knowledge I should use for ${project.title}.`)}>Open project <Icon name="arrow-up-right" size={13}/></button></div></div>)}</div></div>;
}

function IntegrationsView({ integrations, onToggle }: { integrations: Record<string, boolean>; onToggle: (key: string) => void }) {
  const items = [
    { key: "Google Drive", desc: "Bring documents and files into your knowledge library.", icon: "database", color: "blue", category: "FILES & STORAGE" },
    { key: "GitHub", desc: "Connect repositories, issues and technical documentation.", icon: "folder", color: "slate", category: "DEVELOPMENT" },
    { key: "Notion", desc: "Bring notes, databases and project knowledge together.", icon: "layers", color: "dark", category: "KNOWLEDGE" },
    { key: "YouTube", desc: "Capture videos, transcripts and timestamped learning notes.", icon: "video", color: "red", category: "LEARNING" },
    { key: "Google Calendar", desc: "Connect learning plans and important work milestones.", icon: "calendar", color: "green", category: "PRODUCTIVITY" },
    { key: "Slack", desc: "Search authorised conversations and institutional context.", icon: "message", color: "purple", category: "COLLABORATION" },
  ];
  return <div className="view-stack"><div className="page-heading-row"><div><div className="eyebrow">YOUR TOOLS, CONNECTED WITH PERMISSION</div><h1>Integrations</h1><p>Choose what PIOS can access. You stay in control of every connection.</p></div><span className="secure-label"><Icon name="lock" size={14}/> Permission-based access</span></div><div className="integration-notice"><div><Icon name="shield-check" size={19}/></div><p><strong>Your data, your decision.</strong> Connections are opt-in. PIOS should only access the content and actions you explicitly authorise. OAuth and provider APIs are not configured in this frontend demo.</p></div><div className="integration-grid">{items.map((item) => <div className="panel integration-card" key={item.key}><div className="integration-card-head"><div className={`integration-icon ${item.color}`}><Icon name={item.icon} size={20}/></div><span>{item.category}</span></div><h3>{item.key}</h3><p>{item.desc}</p><div className="integration-card-bottom"><span className={integrations[item.key] ? "connected-state" : "not-connected-state"}><i/>{integrations[item.key] ? "Demo connected" : "Not connected"}</span><button className={integrations[item.key] ? "button button-secondary button-small" : "button button-primary button-small"} onClick={() => onToggle(item.key)}>{integrations[item.key] ? "Disconnect" : "Connect"}</button></div></div>)}</div></div>;
}

function ActivityView() {
  const entries = [
    ...recentActivity,
    { title: "Added a learning objective", detail: "Understand retrieval-augmented generation", time: "Oct 30", icon: "target" },
    { title: "Created a collection", detail: "AI & Machine Learning", time: "Oct 28", icon: "folder" },
    { title: "Updated a source", detail: "PostgreSQL indexing strategies", time: "Oct 27", icon: "file" },
  ];
  return <div className="view-stack"><div className="page-heading-row"><div><div className="eyebrow">WORKSPACE HISTORY</div><h1>Activity</h1><p>A record of the knowledge you are collecting and the progress you are making.</p></div><button className="button button-secondary" onClick={() => window.location.reload()}><Icon name="refresh" size={15}/>Refresh demo</button></div><div className="panel activity-panel"><div className="activity-panel-head"><h2>Recent activity</h2><span>LAST 30 DAYS</span></div><div className="timeline">{entries.map((entry, index) => <div className="timeline-item" key={`${entry.title}-${index}`}><div className="timeline-icon"><Icon name={entry.icon} size={16}/></div><div className="timeline-copy"><strong>{entry.title}</strong><span>{entry.detail}</span></div><time>{entry.time}</time></div>)}</div></div></div>;
}

function SettingsView({ privacyMode, onPrivacy, onToast }: { privacyMode: boolean; onPrivacy: (value: boolean) => void; onToast: (message: string) => void }) {
  return <div className="view-stack"><div className="page-heading-row"><div><div className="eyebrow">WORKSPACE PREFERENCES</div><h1>Settings</h1><p>Configure how your workspace behaves and how your information is handled.</p></div></div><div className="settings-layout"><div className="panel settings-panel"><div className="settings-section"><div className="settings-section-heading"><div><h2>Workspace</h2><p>Basic information about your PIOS workspace.</p></div></div><div className="settings-row"><div><strong>Workspace name</strong><span>Personal workspace</span></div><button className="button button-secondary button-small" onClick={() => onToast("Workspace editing will be available after account setup.")}>Edit</button></div><div className="settings-row"><div><strong>Workspace type</strong><span>Personal · Private</span></div><span className="settings-readonly">Personal</span></div></div><div className="settings-section"><div className="settings-section-heading"><div><h2>Privacy & data</h2><p>Control the default privacy posture for your workspace.</p></div></div><div className="settings-row"><div><strong>Private workspace mode</strong><span>Require explicit permissions for connected sources.</span></div><button className={`toggle ${privacyMode ? "on" : ""}`} onClick={() => { onPrivacy(!privacyMode); onToast(`Private workspace mode ${!privacyMode ? "enabled" : "disabled"} in this demo.`); }} aria-label="Toggle private workspace mode"><i/></button></div><div className="settings-row"><div><strong>Data export</strong><span>Download a copy of your workspace data.</span></div><button className="button button-secondary button-small" onClick={() => onToast("Data export requires the backend export service.")}>Request export</button></div><div className="settings-row"><div><strong>Delete workspace data</strong><span>Permanent deletion should require confirmation and re-authentication.</span></div><button className="button button-danger button-small" onClick={() => onToast("Deletion is disabled in this frontend preview.")}>Manage data</button></div></div><div className="settings-section"><div className="settings-section-heading"><div><h2>AI preferences</h2><p>Model and answer behaviour will be managed here.</p></div></div><div className="settings-row"><div><strong>Answer style</strong><span>Clear explanations with source references.</span></div><span className="settings-readonly">Grounded</span></div><div className="settings-row"><div><strong>Model provider</strong><span>Not configured</span></div><span className="settings-readonly">—</span></div></div></div><aside className="panel settings-side"><div className="settings-side-icon"><Icon name="shield-check" size={22}/></div><h3>Privacy is a foundation, not a setting hidden in the footer.</h3><p>Production PIOS must isolate workspace data, enforce permissions in backend services, and provide clear controls for export and deletion.</p><button className="text-action" onClick={() => onToast("Security and privacy documentation is included in the architecture pack.")}>Security principles <Icon name="arrow-up-right" size={14}/></button></aside></div></div>;
}

function AddSourceModal({ tab, onTab, url, onUrl, title, onTitle, body, onBody, file, onFile, onClose, onSubmit }: {
  tab: AddTab; onTab: (tab: AddTab) => void; url: string; onUrl: (value: string) => void; title: string; onTitle: (value: string) => void;
  body: string; onBody: (value: string) => void; file: File | null; onFile: (file: File | null) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal add-modal"><div className="modal-header"><div><div className="eyebrow">GROW YOUR KNOWLEDGE BASE</div><h2>Add a source</h2><p>Capture something you want PIOS to help you understand and remember.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="x"/></button></div><div className="add-tabs"><button className={tab === "url" ? "active" : ""} onClick={() => onTab("url")}><Icon name="link" size={15}/>URL</button><button className={tab === "note" ? "active" : ""} onClick={() => onTab("note")}><Icon name="sticky-note" size={15}/>Note</button><button className={tab === "file" ? "active" : ""} onClick={() => onTab("file")}><Icon name="file" size={15}/>File</button></div><form onSubmit={onSubmit}>{tab === "url" && <div className="form-field"><label htmlFor="source-url">Website URL</label><div className="field-with-icon"><Icon name="globe" size={16}/><input id="source-url" value={url} onChange={(event) => onUrl(event.target.value)} placeholder="https://example.com/article" type="url" required/></div><small>Paste an article, documentation page or public resource.</small></div>}{tab === "note" && <><div className="form-field"><label htmlFor="note-title">Note title</label><input id="note-title" value={title} onChange={(event) => onTitle(event.target.value)} placeholder="e.g. Things I learned about caching" required/></div><div className="form-field"><label htmlFor="note-body">Your note</label><textarea id="note-body" rows={5} value={body} onChange={(event) => onBody(event.target.value)} placeholder="Write or paste your notes here..." required/></div></>}{tab === "file" && <div className="file-drop"><input type="file" accept=".pdf,.txt,.md,.doc,.docx" onChange={(event) => onFile(event.target.files?.[0] ?? null)}/><div className="file-drop-icon"><Icon name="upload" size={22}/></div><strong>{file ? file.name : "Choose a file or drag it here"}</strong><span>PDF, TXT, Markdown or DOCX · 25 MB max</span></div>}<div className="modal-note"><Icon name="lock" size={14}/><span>Only you can access sources in this private workspace. File transfer and processing require the backend.</span></div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary"><Icon name="plus" size={15}/>Add to library</button></div></form></div></div>;
}

function SourceDetailModal({ source, onClose, onAsk }: { source: KnowledgeSource; onClose: () => void; onAsk: (prompt: string) => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal source-detail-modal"><div className="modal-header"><div className="source-detail-title"><SourceIcon kind={source.kind} color={source.color}/><div><div className="eyebrow">{source.kind.toUpperCase()} · {source.collection.toUpperCase()}</div><h2>{source.title}</h2></div></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="x"/></button></div><div className="source-detail-meta"><span><Icon name="clock" size={14}/>{source.readTime}</span><span><Icon name="calendar" size={14}/>{source.updated}</span><span><Icon name="network" size={14}/>{source.concepts} concepts</span></div><div className="source-detail-body"><div className="detail-placeholder-art"><div className="placeholder-page"><span/><span/><span/><span/><i/></div><div className="placeholder-glow"/></div><h3>Source overview</h3><p>This source is part of your {source.collection} collection. When document processing is connected, PIOS will generate a structured summary, extract concepts and connect relevant passages to your knowledge graph.</p><div className="source-tag-list">{source.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="modal-actions"><button className="button button-secondary" onClick={onClose}>Close</button><button className="button button-primary" onClick={() => onAsk(`Help me understand ${source.title} and connect it to related concepts in my library.`)}><Icon name="sparkles" size={15}/>Ask PIOS about this</button></div></div></div>;
}
