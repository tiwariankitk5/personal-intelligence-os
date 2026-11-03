export type ViewId = "overview" | "knowledge" | "notes" | "assistant" | "learning" | "graph" | "projects" | "integrations" | "aiProviders" | "activity" | "settings";

export type SourceKind = "PDF" | "Web page" | "Note" | "Video";

export interface KnowledgeSource {
  id: string;
  title: string;
  kind: SourceKind;
  collection: string;
  updated: string;
  readTime: string;
  concepts: number;
  color: string;
  initials: string;
  tags: string[];
}

export interface LearningPath {
  id: string;
  title: string;
  subtitle: string;
  progress: number;
  lessonsDone: number;
  lessonsTotal: number;
  color: string;
  icon: string;
}
