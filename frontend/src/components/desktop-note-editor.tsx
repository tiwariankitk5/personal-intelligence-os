"use client";

import {useEffect, useRef, useState} from "react";
import type {ApiNote} from "@/lib/api";
import type {PiosNote} from "@/lib/notes";
import {plainTextFromHtml, sanitizeNoteHtml} from "@/lib/notes";

type Props = {note:ApiNote; onPatch:(id:string,patch:Partial<PiosNote>)=>Promise<boolean>; onClose:()=>void; onDelete:()=>Promise<boolean>};
type Draft = Pick<ApiNote,"title"|"bodyHtml"|"plainText"|"color"|"pinned"|"archived">;
const colors=["sage","butter","lavender","sky","rose","slate"] as const;
export default function DesktopNoteEditor({note,onPatch,onClose,onDelete}:Props){
  const initial:Draft={title:note.title,bodyHtml:sanitizeNoteHtml(note.bodyHtml),plainText:note.plainText,color:note.color,pinned:note.pinned,archived:note.archived};
  const [draft,setDraft]=useState(initial),[revision,setRevision]=useState(0),[status,setStatus]=useState("Saved"),[busy,setBusy]=useState(false);
  const latest=useRef(initial),confirmed=useRef(JSON.stringify(initial)),queue=useRef(Promise.resolve(true));
  const patch=useRef(onPatch);patch.current=onPatch;
  const mounted=useRef(true),editor=useRef<HTMLDivElement>(null);
  useEffect(()=>{mounted.current=true;if(editor.current)editor.current.innerHTML=sanitizeNoteHtml(note.bodyHtml);return()=>{mounted.current=false;};},[note.id]);
  function update(value:Partial<Draft>){latest.current={...latest.current,...value};setDraft(latest.current);setRevision(v=>v+1);setStatus("Unsaved");}
  function flush(){
    const work=async()=>{while(JSON.stringify(latest.current)!==confirmed.current){
      const snapshot={...latest.current};if(mounted.current)setStatus("Saving…");
      let ok=false;try{ok=await patch.current(note.id,snapshot);}catch{}
      if(!ok){if(mounted.current)setStatus("Save failed — retry");return false;}
      confirmed.current=JSON.stringify(snapshot);
    }if(mounted.current)setStatus("Saved");return true;};
    queue.current=queue.current.then(work,work);return queue.current;
  }
  useEffect(()=>{if(!revision)return;const timer=setTimeout(()=>{void flush();},600);return()=>clearTimeout(timer);},[revision]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(JSON.stringify(latest.current)!==confirmed.current){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[]);
  function exportNote(){const data={format:"pios-note-v1",title:draft.title,bodyHtml:draft.bodyHtml,plainText:draft.plainText};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="pios-note.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function close(){setBusy(true);if(await flush())onClose();else setBusy(false);}
  return <section className={`desktop-note-editor ${draft.color}`} aria-label={`Floating note: ${note.title}`}>
    <header className="desktop-note-drag"><input aria-label="Floating note title" value={draft.title} maxLength={240} onChange={e=>update({title:e.target.value||"Untitled note"})}/><span role="status">{status}</span><button aria-label="Return note to edge tabs" disabled={busy} onClick={()=>void close()}>—</button><button aria-label="Close floating note" disabled={busy} onClick={()=>void close()}>×</button></header>
    {status.startsWith("Save failed")&&<button className="desktop-note-retry" onClick={()=>void flush()}>Retry saving note</button>}
    <div ref={editor} className="desktop-note-writing" role="textbox" aria-label="Floating note content" aria-multiline="true" contentEditable suppressContentEditableWarning onInput={e=>{const html=sanitizeNoteHtml(e.currentTarget.innerHTML);update({bodyHtml:html,plainText:plainTextFromHtml(html)});}} onPaste={e=>{e.preventDefault();document.execCommand("insertText",false,e.clipboardData.getData("text/plain"));}} onDrop={e=>e.preventDefault()}/>
    <footer><div className="desktop-note-colors" aria-label="Note colors">{colors.map(color=><button key={color} className={color} aria-label={`Use ${color} color`} aria-pressed={draft.color===color} onClick={()=>update({color})}/>)}</div>
      <button aria-pressed={draft.pinned} onClick={()=>update({pinned:!draft.pinned})}>{draft.pinned?"Unpin":"Pin"}</button>
      <button onClick={()=>update({archived:!draft.archived})}>{draft.archived?"Restore":"Archive"}</button>
      <button disabled={busy} onClick={async()=>{if(!window.confirm("Permanently delete this note from your PIOS account?"))return;setBusy(true);if(!await flush()){setBusy(false);return;}if(await onDelete())onClose();else setBusy(false);}}>Delete</button>
      <button onClick={exportNote}>Export JSON</button><button disabled={busy} onClick={()=>void close()}>Close</button>
    </footer>
  </section>;
}
