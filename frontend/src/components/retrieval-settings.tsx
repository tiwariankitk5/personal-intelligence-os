"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ApiProvider, RetrievalStatus, RetrievedPassage, getRetrievalStatus, configureRetrieval, retryRetrieval, rebuildRetrieval, searchRetrieval } from "@/lib/api";

export default function RetrievalSettings({ providers, onToast }: { providers: ApiProvider[]; onToast: (message: string) => void }) {
  const [status, setStatus] = useState<RetrievalStatus | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("text-embedding-3-small");
  const [dimensions, setDimensions] = useState(1536);
  const [requestDimensions, setRequestDimensions] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [calls, setCalls] = useState(100);
  const [inputLimit, setInputLimit] = useState(100000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ mode: string; warning: string | null; passages: RetrievedPassage[] } | null>(null);
  useEffect(() => {
    let alive = true;
    getRetrievalStatus().then((value) => {
      if (!alive) return;
      setStatus(value); setProvider(value.providerId || ""); setModel(value.model); setDimensions(value.dimensions);
      setEnabled(value.enabled); setRequestDimensions(value.requestDimensions); setCalls(value.dailyCallLimit); setInputLimit(value.dailyInputLimit);
    }).catch(() => { if (alive) setError("Could not load retrieval settings. Refresh to retry."); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!status?.configured || !status.states.some((item) => ["pending", "processing"].includes(item.state))) return;
    const timer = setTimeout(() => {
      getRetrievalStatus().then(setStatus).catch(() => setError("Status refresh failed. Use Refresh status to retry."));
    }, 5000);
    return () => clearTimeout(timer);
  }, [status]);
  const refresh = async () => {
    setError("");
    try { setStatus(await getRetrievalStatus()); } catch { setError("Could not refresh indexing status."); }
  };
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      setStatus(await configureRetrieval({ enabled, providerId: provider || null, model, dimensions, requestDimensions, dailyCallLimit: calls, dailyInputLimit: inputLimit, consent: enabled }));
      onToast(enabled ? "Semantic indexing enabled. New and edited content will be processed within your daily limits." : "Semantic processing disabled. Keyword retrieval remains available.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save settings."); }
    finally { setBusy(false); }
  }
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { setResult(await searchRetrieval(query)); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Search failed."); }
    finally { setBusy(false); }
  }
  return <section className="panel retrieval-settings" aria-label="Semantic retrieval settings">
    <header><span className="panel-overline">YOUR KNOWLEDGE</span><h2>Semantic retrieval</h2><p>Combine meaning-based matches with keyword search. Choose an embedding-capable OpenAI-compatible connection; it can be different from your chat model.</p></header>
    {error && <p role="alert" className="retrieval-error">{error}</p>}
    {!status ? <p>Loading retrieval status…</p> : <>
      <form onSubmit={save} className="retrieval-form">
        <label>Embedding provider<select aria-label="Embedding provider" value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">Choose a connection</option>{providers.filter((item) => item.providerType === "OPENAI_COMPATIBLE").map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
        <label>Embedding model<input aria-label="Embedding model" value={model} maxLength={180} required onChange={(event) => setModel(event.target.value)}/></label>
        <label>Vector dimensions<input aria-label="Vector dimensions" type="number" min={1} max={3072} required value={dimensions} onChange={(event) => setDimensions(Number(event.target.value))}/></label>
        <label>Daily embedding calls<input aria-label="Daily embedding calls" type="number" min={1} max={1000} required value={calls} onChange={(event) => setCalls(Number(event.target.value))}/></label>
        <label>Daily input budget<input aria-label="Daily input budget" type="number" min={1000} max={1000000} required value={inputLimit} onChange={(event) => setInputLimit(Number(event.target.value))}/></label>
        <label className="retrieval-check"><input type="checkbox" checked={requestDimensions} onChange={(event) => setRequestDimensions(event.target.checked)}/>Request reduced dimensions (only for models supporting this option)</label>
        <label className="retrieval-check"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)}/>Enable semantic retrieval. I allow note/source chunks and search queries to be sent to this provider, including automatic indexing after edits.</label>
        <p className="retrieval-help">Provider charges may apply. Input budget uses a conservative byte-based reservation, not a price estimate. Model changes require re-indexing. Without a working embedding provider, PIOS uses keyword matches.</p>
        <button type="submit" className="button button-primary button-small" disabled={busy}>{busy ? "Working…" : "Save retrieval settings"}</button>
      </form>
      <div className="retrieval-status" aria-live="polite"><strong>{status.configured ? "Semantic processing enabled" : "Keyword fallback"}</strong><p>{status.embeddedChunks} / {status.chunks} chunks indexed · {status.documents} documents</p><p>{status.states.map((item) => `${item.state}: ${item.count}`).join(" · ") || "No documents yet"}</p><p>Today: {status.usage.calls} / {status.dailyCallLimit} calls · {status.usage.reserved_input} / {status.dailyInputLimit} input budget · {status.usage.reported_tokens} provider-reported tokens · {status.usage.failed_calls} failed calls</p>{status.lastError && <p className="retrieval-error">{status.lastError}</p>}{status.truncatedDocuments > 0 && <p className="retrieval-error">{status.truncatedDocuments} large documents are limited to their first 200,000 characters for retrieval.</p>}<button type="button" className="button button-secondary button-small" disabled={busy} onClick={() => void refresh()}>Refresh status</button> <button type="button" className="button button-secondary button-small" disabled={busy || !status.configured} onClick={async () => { setBusy(true); try { setStatus(await retryRetrieval()); } catch { setError("Could not retry indexing."); } finally { setBusy(false); } }}>Retry incomplete indexing</button> <button type="button" className="button button-secondary button-small" disabled={busy || !status.configured} onClick={async () => { if (!window.confirm("Rebuild all embeddings using this model? Provider charges may apply. Your notes are preserved.")) return; setBusy(true); try { setStatus(await rebuildRetrieval()); } catch { setError("Could not rebuild embeddings."); } finally { setBusy(false); } }}>Rebuild embeddings</button></div>
      <form onSubmit={search} className="retrieval-preview"><label>Preview retrieved passages<input aria-label="Preview retrieval query" value={query} maxLength={2000} required onChange={(event) => setQuery(event.target.value)} placeholder="Ask a question about your notes"/></label><button className="button button-secondary button-small" disabled={busy || !query.trim()}>Search passages</button></form>
      {result && <div className="retrieval-results"><strong>{result.mode === "hybrid" ? "Hybrid matches" : "Keyword matches"}</strong>{result.warning && <p>{result.warning}</p>}{!result.passages.length && <p>No matching passages found.</p>}{result.passages.map((passage) => <details key={passage.chunkId}><summary>{passage.title} · passage {passage.chunkIndex + 1}</summary><blockquote>{passage.excerpt}</blockquote></details>)}</div>}
    </>}
  </section>;
}
