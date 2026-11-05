"use client";

import { useMemo, useState } from "react";
import type { PiosNote } from "@/lib/notes";

export default function NoteEdgeRail({ notes, selectedId, onSelect }: {
  notes: PiosNote[]; selectedId: string | null; onSelect: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const shortcuts = useMemo(() => {
    const recent = notes.filter((note) => !note.archived).sort((a,b) => b.order - a.order).slice(0,6);
    const selected = notes.find((note) => note.id === selectedId && !note.archived);
    if (selected && !recent.some((note) => note.id === selected.id)) { if (recent.length === 6) recent.pop(); recent.unshift(selected); }
    return recent;
  }, [notes, selectedId]);
  if (!shortcuts.length) return null;
  return <div className="note-edge-rail-anchor"><nav className="note-edge-rail" aria-label="Recent note shortcuts">
    {shortcuts.map((note) => <button key={note.id} type="button" className={note.id === selectedId ? "active" : ""}
      aria-label={`Open note ${note.title}`} aria-current={note.id === selectedId ? "page" : undefined}
      aria-describedby={`note-shortcut-${note.id}`} disabled={pending}
      onClick={async () => { if (note.id === selectedId) return; setPending(true); try { await onSelect(note.id); } finally { setPending(false); } }}>
      <span className="note-edge-line" aria-hidden="true"/>
      <span className="note-edge-preview" role="tooltip" id={`note-shortcut-${note.id}`}><strong>{note.title}</strong><small>{note.updatedAt}</small></span>
    </button>)}
  </nav></div>;
}
