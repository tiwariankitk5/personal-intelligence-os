const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080/api/v1").replace(/\/$/, "");
const TOKEN_KEY = "pios-access-token-v1";

export type ApiUser = { id: string; email: string; displayName: string; createdAt: string };
export type AuthResult = { accessToken: string; tokenType: string; expiresInSeconds: number; user: { id: string; email: string; displayName: string } };
export type ApiFolder = { id: string; name: string; color: string };
export type ApiNote = {
  id: string; title: string; bodyHtml: string; plainText: string; folderId: string | null;
  color: "sage" | "butter" | "lavender" | "sky" | "rose" | "slate";
  pinned: boolean; archived: boolean; order: number; updatedAt: string;
};
export type ApiSource = {
  id: string; title: string; kind: string; collection: string; originalFileName?: string;
  sourceUrl?: string; byteSize: number; updatedAt: string;
};
export type ApiProvider = {
  id: string; displayName: string; providerType: "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI";
  modelName: string; baseUrl?: string; hasApiKey: boolean; isDefault: boolean; createdAt: string;
};
export type ApiObjective = {
  id: string; title: string; description: string; category: string; targetDate?: string;
  progress: number; createdAt: string; updatedAt: string;
};
export type ApiCitation = { id: string; title: string; type: string };
export type ApiChatResponse = {
  conversationId: string; answer: string; citations: ApiCitation[]; providerId: string;
  providerName: string; createdAt: string;
};

type RequestOptions = RequestInit & { skipAuth?: boolean };

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function saveToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!options.skipAuth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    const message = payload?.message || payload?.detail || payload?.error || `Request failed (${response.status}).`;
    if (response.status === 401 && !options.skipAuth) clearToken();
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return payload as T;
}

export async function signIn(email: string, password: string) {
  const result = await apiRequest<AuthResult>("/auth/login", {
    method: "POST", skipAuth: true, body: JSON.stringify({ email, password }),
  });
  saveToken(result.accessToken);
  return result.user;
}

export async function signUp(displayName: string, email: string, password: string) {
  const result = await apiRequest<AuthResult>("/auth/register", {
    method: "POST", skipAuth: true, body: JSON.stringify({ displayName, email, password }),
  });
  saveToken(result.accessToken);
  return result.user;
}

export const getMe = () => apiRequest<ApiUser>("/users/me");
export const getFolders = () => apiRequest<ApiFolder[]>("/folders");
export const createFolder = (name: string, color = "#7e9b8b", id?: string) => apiRequest<ApiFolder>("/folders", { method: "POST", body: JSON.stringify({ id, name, color }) });
export const deleteFolder = (id: string) => apiRequest<void>(`/folders/${id}`, { method: "DELETE" });
export const getNotes = () => apiRequest<ApiNote[]>("/notes");
export const createNote = (note: Omit<ApiNote, "updatedAt">) => apiRequest<ApiNote>("/notes", { method: "POST", body: JSON.stringify(note) });
export const updateNote = (id: string, note: Omit<ApiNote, "updatedAt">) => apiRequest<ApiNote>(`/notes/${id}`, { method: "PUT", body: JSON.stringify(note) });
export const removeNote = (id: string) => apiRequest<void>(`/notes/${id}`, { method: "DELETE" });
export const getSources = (q = "") => apiRequest<ApiSource[]>(`/sources${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const removeSource = (id: string) => apiRequest<void>(`/sources/${id}`, { method: "DELETE" });
export const getProviders = () => apiRequest<ApiProvider[]>("/ai/providers");
export const createProvider = (input: { displayName: string; providerType: string; modelName: string; baseUrl?: string; apiKey?: string; makeDefault: boolean }) =>
  apiRequest<ApiProvider>("/ai/providers", { method: "POST", body: JSON.stringify(input) });
export const setDefaultProvider = (id: string) => apiRequest<ApiProvider>(`/ai/providers/${id}/default`, { method: "PUT" });
export const removeProvider = (id: string) => apiRequest<void>(`/ai/providers/${id}`, { method: "DELETE" });
export const testProvider = (id: string) => apiRequest<{ success: boolean; message: string; output: string }>(`/ai/providers/${id}/test`, { method: "POST" });
export const sendChat = (question: string, conversationId?: string, useKnowledge = true) =>
  apiRequest<ApiChatResponse>("/ai/chat", { method: "POST", body: JSON.stringify({ question, conversationId, useKnowledge }) });
export const getObjectives = () => apiRequest<ApiObjective[]>("/learning/objectives");
export const createObjective = (title: string, description: string, category: string, targetDate?: string) =>
  apiRequest<ApiObjective>("/learning/objectives", { method: "POST", body: JSON.stringify({ title, description, category, targetDate }) });
export const updateObjectiveProgress = (id: string, progress: number) =>
  apiRequest<ApiObjective>(`/learning/objectives/${id}`, { method: "PATCH", body: JSON.stringify({ progress }) });
export const deleteObjective = (id: string) => apiRequest<void>(`/learning/objectives/${id}`, { method: "DELETE" });

export async function uploadSource(file: File, collection = "Inbox") {
  const form = new FormData();
  form.set("file", file);
  form.set("collection", collection);
  return apiRequest<ApiSource>("/sources/upload", { method: "POST", body: form });
}
export const createTextSource = (title: string, content: string, collection = "Inbox") =>
  apiRequest<ApiSource>("/sources/text", { method: "POST", body: JSON.stringify({ title, content, collection }) });
