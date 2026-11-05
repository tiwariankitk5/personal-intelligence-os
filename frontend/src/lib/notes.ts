export type NoteColor = "sage" | "butter" | "lavender" | "sky" | "rose" | "slate";

export interface PiosNote {
  id: string;
  title: string;
  bodyHtml: string;
  plainText: string;
  folderId: string;
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  updatedAt: string;
  order: number;
  inkData?: string;
  coverUrl?: string; editorSettings?: string;
}

export interface NoteFolder {
  id: string;
  name: string;
  color: string;
}

export const initialNoteFolders: NoteFolder[] = [
  { id: "inbox", name: "Inbox", color: "#7e9b8b" },
  { id: "backend", name: "Backend Engineering", color: "#57917a" },
  { id: "ai", name: "AI & Machine Learning", color: "#8b7ac2" },
  { id: "cs", name: "Computer Science", color: "#6993bc" },
  { id: "projects", name: "Projects", color: "#c38b5e" },
  { id: "personal", name: "Personal", color: "#c17d8d" },
];

const now = "Just now";
export const initialNotes: PiosNote[] = [
  { id: "n1", title: "Spring Boot — production checklist", bodyHtml: "<p>Things to verify before shipping a Spring Boot service:</p><ul><li>Configuration is externalised and secrets are not committed.</li><li>Health checks and structured logs are enabled.</li><li>Database migrations are tested on a clean database.</li></ul><p>Next: add integration tests with Testcontainers.</p>", plainText: "Things to verify before shipping a Spring Boot service configuration secrets health checks structured logs database migrations integration tests Testcontainers", folderId: "backend", color: "sage", pinned: true, archived: false, updatedAt: "12 min ago", order: 0 },
  { id: "n2", title: "RAG pipeline — questions to investigate", bodyHtml: "<p>Important moving parts:</p><ol><li>Chunking strategy and metadata.</li><li>Embedding model and vector dimensions.</li><li>Hybrid retrieval, reranking and context limits.</li></ol><p>Evaluate citation precision separately from answer quality.</p>", plainText: "RAG pipeline chunking embeddings vector dimensions hybrid retrieval reranking context citations evaluation", folderId: "ai", color: "lavender", pinned: true, archived: false, updatedAt: "Yesterday", order: 1 },
  { id: "n3", title: "Database revision", bodyHtml: "<p>Review these before the next DSA / backend revision session.</p><ul><li>Index selectivity</li><li>Transactions and isolation levels</li><li>Normalization vs denormalization</li></ul>", plainText: "Database revision index selectivity transactions isolation levels normalization denormalization DBMS SQL PostgreSQL", folderId: "cs", color: "sky", pinned: false, archived: false, updatedAt: "Mon", order: 2 },
  { id: "n4", title: "PIOS product questions", bodyHtml: "<p>How should the product connect notes, projects and learning without becoming another disconnected workspace?</p><p>Principle: recommend destinations, show the reason, and always let the user decide.</p>", plainText: "PIOS product questions notes projects learning context memory product decisions", folderId: "projects", color: "butter", pinned: false, archived: false, updatedAt: "Oct 31", order: 3 },
  { id: "n5", title: "Ideas to revisit", bodyHtml: "<p>Keep a lightweight place for thoughts that do not have a clear destination yet.</p>", plainText: "personal ideas journal things to revisit", folderId: "personal", color: "rose", pinned: false, archived: false, updatedAt: "Oct 29", order: 4 },
];

const folderKeywords: Record<string, string[]> = {
  backend: ["java", "spring", "spring boot", "spring security", "api", "backend", "microservice", "postgres", "sql", "database", "docker", "kafka", "redis", "http", "rest", "hibernate", "jpa", "jwt", "server"],
  ai: ["ai", "llm", "rag", "embedding", "vector", "transformer", "agent", "prompt", "model", "machine learning", "neural", "token", "inference", "mcp", "genai", "retrieval"],
  cs: ["dsa", "algorithm", "data structure", "operating system", "computer network", "dbms", "complexity", "tree", "graph", "recursion", "array", "sorting", "normalization", "transaction"],
  projects: ["pios", "project", "product", "feature", "roadmap", "build", "launch", "customer", "requirement", "idea"],
  personal: ["personal", "journal", "life", "health", "habit", "routine", "reflection", "goal"],
};

export function suggestNoteDestination(text: string, folders: NoteFolder[], notes: PiosNote[], excludeId?: string) {
  const haystack = text.toLowerCase();
  const scored = folders.map((folder) => {
    const normalizedName = folder.name.toLowerCase();
    const inferredKey = normalizedName.includes("backend") ? "backend"
      : normalizedName.includes("machine learning") || normalizedName === "ai" || normalizedName.includes("artificial intelligence") ? "ai"
      : normalizedName.includes("computer science") || normalizedName === "cs" ? "cs"
      : normalizedName.includes("project") ? "projects"
      : normalizedName.includes("personal") ? "personal" : folder.id;
    const words = folderKeywords[folder.id] ?? folderKeywords[inferredKey] ?? [];
    const hits = words.filter((word) => haystack.includes(word));
    return { folder, hits, score: hits.reduce((total, word) => total + (word.includes(" ") ? 2 : 1), 0) };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  const destination = best && best.score > 0 ? best.folder : folders.find((folder) => folder.name.trim().toLowerCase() === "inbox") ?? folders[0];
  const other = notes.filter((note) => !note.archived && note.id !== excludeId && note.folderId === destination?.id);
  const titleWords = haystack.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const pageMatches = other.map((note) => {
    const noteWords = `${note.title} ${note.plainText}`.toLowerCase().split(/[^a-z0-9]+/);
    const overlap = titleWords.filter((word) => noteWords.includes(word)).length;
    return { note, overlap };
  }).sort((a, b) => b.overlap - a.overlap);
  const page = pageMatches[0]?.overlap >= 2 ? pageMatches[0].note : null;
  return {
    folder: destination,
    matchedTerms: best?.hits ?? [],
    confidence: best && best.score > 0 ? Math.min(96, 62 + best.score * 7) : 42,
    page,
    reason: best && best.score > 0
      ? `Matched ${best.hits.slice(0, 3).join(", ")} with content already in this workspace.`
      : "This note does not strongly match an existing topic yet. Keep it in Inbox or create a new folder.",
  };
}

export function plainTextFromHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function sanitizeNoteHtml(html: string) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return "";
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const allowed = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "UL", "OL", "LI", "A", "H1", "H1", "H2", "H3", "H4", "PRE", "CODE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "H4", "PRE", "CODE", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "BLOCKQUOTE", "HR", "INPUT", "IMG"]);
  parsed.body.querySelectorAll("script,style,iframe,object,embed,svg,math").forEach((node) => node.remove());
  parsed.body.querySelectorAll("*").forEach((node) => {
    if (!allowed.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }
    Array.from(node.attributes).forEach((attribute) => {
      if (node.tagName === "IMG" && attribute.name === "src") {
        if (attribute.value.length > 3_500_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(attribute.value)) node.removeAttribute("src");
        else node.setAttribute("src", attribute.value);
      } else if (node.tagName === "IMG" && attribute.name === "data-pios-diagram-id") {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attribute.value)) node.remove();
        else node.setAttribute("data-pios-diagram-id", attribute.value);
      } else if (node.tagName === "IMG" && attribute.name === "title") {
        node.setAttribute("title", "Double-click to edit this diagram");
      } else if (node.tagName === "IMG" && attribute.name === "alt") {
        node.setAttribute("alt", "Editable diagram");
      } else if (node.tagName === "IMG" && attribute.name === "class") {
        node.setAttribute("class", "pios-inline-diagram");
      } else if (node.tagName === "IMG" && attribute.name === "contenteditable") {
        node.setAttribute("contenteditable", "false");
      } else if (node.tagName === "A" && attribute.name === "href") {
        try {
          const url = new URL(attribute.value, window.location.origin);
          if (!["http:", "https:", "mailto:"].includes(url.protocol)) node.removeAttribute("href");
          else node.setAttribute("href", url.href);
        } catch { node.removeAttribute("href"); }
      } else if (node.tagName === "INPUT" && attribute.name === "type" && attribute.value === "checkbox") {
        node.setAttribute("type", "checkbox");
      } else if (node.tagName === "INPUT" && attribute.name === "checked") {
        node.setAttribute("checked", "");
      } else {
        node.removeAttribute(attribute.name);
      }
    });
    if (node.tagName === "INPUT" && node.getAttribute("type") !== "checkbox") node.remove();
    if (node.tagName === "IMG" && (!node.getAttribute("src") || !node.getAttribute("data-pios-diagram-id"))) node.remove();
  });
  return parsed.body.innerHTML;
}
