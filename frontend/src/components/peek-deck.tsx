"use client";

import {useEffect, useRef, useState} from "react";
import type {PiosNote} from "@/lib/notes";
import FloatingNoteEditor from "./floating-note-editor";
import "./peek-deck.css";

type Props = {loading?:boolean;accountId:string; notes:PiosNote[]; onCreate:()=>Promise<PiosNote|null>; onPatch:(id:string, patch:Partial<PiosNote>)=>Promise<boolean>; onRefresh:()=>Promise<void>; onDelete?:(id:string)=>Promise<boolean>};
export default function PeekDeck({loading=false,accountId, notes, onCreate, onPatch, onRefresh, onDelete}:Props){
  const [open,setOpen]=useState(false),[side,setSide]=useState("right"),[previewId,setPreviewId]=useState<string|null>(null);
  const [query,setQuery]=useState(""),[archived,setArchived]=useState(false),[sort,setSort]=useState("recent");
  const [windows,setWindows]=useState<string[]>([]),[undo,setUndo]=useState<{id:string;until:number}|null>(null);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[creating,setCreating]=useState(false),[previewLeaving,setPreviewLeaving]=useState(false);
  const [activation,setActivation]=useState<Record<string,number>>({});
  const dismiss=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{try{setSide(localStorage.getItem(`pios-peek-side:${accountId}`)==="left"?"left":"right");}catch{}},[accountId]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.altKey&&event.shiftKey&&event.code==="KeyP"){event.preventDefault();setPreviewId(null);setOpen(v=>!v);}if(event.key==="Escape"){setOpen(false);setPreviewId(null);}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
  useEffect(()=>()=>{if(dismiss.current)clearTimeout(dismiss.current);},[]);
  useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),Math.max(0,undo.until-Date.now()));return()=>clearTimeout(timer);},[undo]);
  useEffect(()=>{const ids=new Set(notes.map(note=>note.id));setWindows(previous=>previous.every(id=>ids.has(id))?previous:previous.filter(id=>ids.has(id)));},[notes]);
  const active=notes.filter(n=>!n.archived).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.order-a.order);
  const filtered=notes.filter(n=>n.archived===archived&&`${n.title} ${n.plainText}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):Number(b.pinned)-Number(a.pinned)||b.order-a.order);
  const preview=notes.find(n=>n.id===previewId&&!n.archived);
  async function patch(id:string,value:Partial<PiosNote>){setBusy(true);setError("");try{const ok=await onPatch(id,value);if(!ok)setError("Could not save. Retry before closing this panel.");else if(value.archived===true&&!notes.find(n=>n.id===id)?.archived)setUndo({id,until:Date.now()+10000});return ok;}catch{setError("Could not save. Please retry.");return false;}finally{setBusy(false);}}
  function show(id:string){if(!windows.includes(id)&&windows.length>=3){setError("Close one of the three open notes before opening another. Your edits stay in place.");return;}setActivation(previous=>({...previous,[id]:(previous[id]||0)+1}));setPreviewId(null);setOpen(false);setWindows(previous=>[...previous.filter(item=>item!==id),id]);}
  return <div className={`pios-peek-root ${side}`} onMouseEnter={()=>{if(dismiss.current)clearTimeout(dismiss.current);setPreviewLeaving(false);}} onMouseLeave={()=>{dismiss.current=setTimeout(()=>{setPreviewLeaving(true);dismiss.current=setTimeout(()=>{setPreviewId(null);setPreviewLeaving(false);},180);},80);}}>
    <nav className="pios-peek-tabs" aria-label="Screen edge notes">{active.slice(0,8).map(note=><button className={note.color} key={note.id} aria-label={`Peek ${note.title}`} onMouseEnter={()=>{setOpen(false);setPreviewId(note.id);}} onFocus={()=>{setOpen(false);setPreviewId(note.id);}} onClick={()=>show(note.id)}><span>{note.title}</span></button>)}<button aria-label="Peek notes" aria-expanded={open} aria-controls="pios-peek-deck" title="Browse or create notes (Alt+Shift+P)" onClick={()=>{setPreviewId(null);setOpen(!open);}}>+</button></nav>
    {preview&&<button className={`pios-peek-hover ${preview.color} ${previewLeaving?"leaving":""}`} aria-label={`Open ${preview.title}`} onClick={()=>show(preview.id)}><strong>{preview.title}</strong><p>{preview.plainText.slice(0,700)||"Empty note"}</p><small>Click to open · {preview.updatedAt}</small></button>}
    {open&&<aside id="pios-peek-deck" className="pios-peek-deck" aria-label="Peek notes deck">
      <header><strong>Peek notes folder</strong><button aria-label="Close Peek deck" onClick={()=>setOpen(false)}>×</button></header>
      <div className="pios-peek-actions"><button disabled={creating||loading} onClick={async()=>{if(windows.length>=3){setError("Close a floating note before creating another.");return;}setCreating(true);try{const note=await onCreate();if(note)show(note.id);else setError("Could not create the Peek note. Retry after saving pending changes.");}finally{setCreating(false);}}}>{creating?"Creating…":"+ New Peek note"}</button><button disabled={busy} onClick={()=>void onRefresh()}>Refresh</button><button onClick={()=>{const next=side==="left"?"right":"left";setSide(next);try{localStorage.setItem(`pios-peek-side:${accountId}`,next);}catch{}}}>Move {side==="left"?"right":"left"}</button></div>
      <input aria-label="Search Peek notes" placeholder="Search your notes" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="pios-peek-actions"><label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> Archived</label><select aria-label="Sort Peek notes" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Pinned / recent</option><option value="title">Title</option></select></div>
      <div className="pios-peek-list">{filtered.map(note=><button className={`pios-peek-card ${note.color}`} key={note.id} onClick={()=>show(note.id)}><strong>{note.pinned?"★ ":""}{note.title}</strong><span>{note.plainText.slice(0,180)||"Empty note"}</span></button>)}{!filtered.length&&<p>No Peek notes yet. Create one in this folder.</p>}</div>
      <small>Only notes in the Peek notes folder appear here. Your other notebooks stay separate. Click a tab to edit; changes save automatically. Alt+Shift+P browses notes while PIOS is focused.</small>
    </aside>}
    {windows.map((id,index)=>{const note=notes.find(n=>n.id===id);return note?<WebPeekWindow key={id} activation={activation[id]||0} note={note} index={index} onPatch={patch} onClose={()=>setWindows(v=>v.filter(item=>item!==id))} onDelete={onDelete?()=>onDelete(id):undefined}/>:null;})}
    {undo&&<div className="pios-peek-undo" role="status">Note archived. <button disabled={busy} onClick={async()=>{if(await patch(undo.id,{archived:false}))setUndo(null);}}>Undo</button></div>}
    {error&&<div className="pios-peek-error" role="alert">{error}<button onClick={()=>setError("")}>Dismiss</button></div>}
  </div>;
}
function WebPeekWindow({note,index,onPatch,onClose,onDelete,activation}:{activation:number;note:PiosNote;index:number;onPatch:Props["onPatch"];onClose:()=>void;onDelete?:()=>Promise<boolean>}){
  const [full,setFull]=useState(false),[position,setPosition]=useState<{x:number;y:number}|null>(null);
  return <div className={`pios-peek-window ${full?"expanded":""}`} style={{zIndex:4+index,...(!full?(position?{left:position.x,top:position.y}:{right:42+index*24,top:80+index*12}):{})}}>
    <FloatingNoteEditor activation={activation} note={note} onPatch={onPatch} onClose={onClose} onDelete={onDelete} onToggleExpand={()=>setFull(v=>!v)} expanded={full} onDragStart={e=>{if(full)return;const el=e.currentTarget,rect=el.closest('.pios-peek-window')!.getBoundingClientRect(),dx=e.clientX-rect.left,dy=e.clientY-rect.top;el.setPointerCapture(e.pointerId);el.onpointermove=event=>setPosition({x:Math.max(0,Math.min(window.innerWidth-rect.width,event.clientX-dx)),y:Math.max(0,Math.min(window.innerHeight-rect.height,event.clientY-dy))});const stop=()=>{el.onpointermove=null;el.onpointerup=null;el.onpointercancel=null;};el.onpointerup=stop;el.onpointercancel=stop;}}/>
  </div>;
}
