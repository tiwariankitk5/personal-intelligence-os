import type { KnowledgeSource, LearningPath } from "./types";

export const initialSources: KnowledgeSource[] = [
  {
    id: "s1", title: "Designing Data-Intensive Applications", kind: "PDF", collection: "Backend Engineering", updated: "Updated 2 hours ago", readTime: "18 min read", concepts: 24, color: "violet", initials: "DD",
    tags: ["Distributed systems", "Databases", "Backend"],
  },
  {
    id: "s2", title: "A visual guide to Transformer attention", kind: "Web page", collection: "AI & Machine Learning", updated: "Updated yesterday", readTime: "12 min read", concepts: 16, color: "blue", initials: "AT",
    tags: ["Transformers", "Attention", "LLMs"],
  },
  {
    id: "s3", title: "Spring Security — authentication flow", kind: "Note", collection: "Backend Engineering", updated: "Updated Oct 31", readTime: "8 min read", concepts: 11, color: "amber", initials: "SS",
    tags: ["Spring Boot", "Security", "JWT"],
  },
  {
    id: "s4", title: "RAG from first principles", kind: "Video", collection: "AI & Machine Learning", updated: "Updated Oct 29", readTime: "26 min read", concepts: 19, color: "rose", initials: "RG",
    tags: ["RAG", "Embeddings", "Vector search"],
  },
  {
    id: "s5", title: "PostgreSQL indexing strategies", kind: "Web page", collection: "Backend Engineering", updated: "Updated Oct 28", readTime: "14 min read", concepts: 13, color: "teal", initials: "PG",
    tags: ["PostgreSQL", "Indexes", "Query planning"],
  },
  {
    id: "s6", title: "The mathematics of gradient descent", kind: "PDF", collection: "AI & Machine Learning", updated: "Updated Oct 26", readTime: "21 min read", concepts: 17, color: "indigo", initials: "GD",
    tags: ["Optimization", "Machine learning", "Maths"],
  },
];

export const initialLearningPaths: LearningPath[] = [
  { id: "l1", title: "Spring Boot: Production Backend", subtitle: "Backend Engineering · 12 lessons", progress: 68, lessonsDone: 8, lessonsTotal: 12, color: "green", icon: "layers" },
  { id: "l2", title: "Large Language Models", subtitle: "AI & Machine Learning · 16 lessons", progress: 32, lessonsDone: 5, lessonsTotal: 16, color: "purple", icon: "sparkles" },
  { id: "l3", title: "Database Systems & PostgreSQL", subtitle: "Computer Science · 10 lessons", progress: 80, lessonsDone: 8, lessonsTotal: 10, color: "blue", icon: "database" },
];

export const recentActivity = [
  { title: "Added a source", detail: "Designing Data-Intensive Applications", time: "2 hours ago", icon: "file" },
  { title: "Completed a learning session", detail: "Spring Security · Authentication flow", time: "Yesterday", icon: "graduation" },
  { title: "Explored a connection", detail: "Embeddings → Vector search → RAG", time: "Yesterday", icon: "network" },
];
