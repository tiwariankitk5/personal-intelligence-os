"use client";

import {useEffect, useState} from "react";
import type {PiosNote} from "@/lib/notes";
import {sanitizeNoteHtml} from "@/lib/notes";
import "./peek-deck.css";

type Props = {accountId:string; notes:PiosNote[]; onCreate:()=>void; onPatch:(id:string, patch:Partial<PiosNote>)=>Promise<boolean>; onRefresh:()=>Promise<void>};
const palette = ["sage", "butter", "lavender", "sky", "rose", "slate"] as const;
function escaped(value:string){return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}

export default function PeekDeck({accountId, notes, onCreate, onPatch, onRefresh}:Props){
  const [open,setOpen]=useState(false), [side,setSide]=useState("right");
  const [query,setQuery]=useState(""), [archived,setArchived]=useState(false), [sort,setSort]=useState("recent");
  const [windows,setWindows]=useState<string[]>([]), [undo,setUndo]=useState<{id:string;until:number}|null>(null);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{try{setSide(localStorage.getItem(`pios-peek-side:${accountId}`)==="left"?"left":"right");}catch{}},[accountId]);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.altKey&&event.shiftKey&&event.code==="KeyP"){event.preventDefault();setOpen(v=>!v);}if(event.key==="Escape")setOpen(false);};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
  useEffect(()=>{if(!undo)return;const timer=setTimeout(()=>setUndo(null),Math.max(0,undo.until-Date.now()));return()=>clearTimeout(timer);},[undo]);
  const filtered=notes.filter(n=>n.archived===archived&&`${n.title} ${n.plainText}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):Number(b.pinned)-Number(a.pinned)||b.order-a.order);
  async function patch(id:string,value:Partial<PiosNote>){setBusy(true);setError("");try{const ok=await onPatch(id,value);if(!ok)setError("Could not save. Retry before closing this panel.");return ok;}catch{setError("Could not save. Please retry.");return false;}finally{setBusy(false);}}
  function show(id:string){setWindows(previous=>[...previous.filter(item=>item!==id),id].slice(-3));}
  return <div className={`pios-peek-root ${side}`}>
    <button className="pios-peek-toggle" aria-expanded={open} aria-controls="pios-peek-deck" title="Peek notes (Alt+Shift+P)" onClick={()=>setOpen(!open)} onMouseEnter={()=>setOpen(true)}>Peek notes</button>
    {open&&<aside id="pios-peek-deck" className="pios-peek-deck" aria-label="Peek notes deck">
      <header><strong>Peek notes</strong><button aria-label="Close Peek deck" onClick={()=>setOpen(false)}>×</button></header>
      <div className="pios-peek-actions"><button onClick={onCreate}>+ New note</button><button disabled={busy} onClick={()=>void onRefresh()}>Refresh</button><button onClick={()=>{const next=side==="left"?"right":"left";setSide(next);try{localStorage.setItem(`pios-peek-side:${accountId}`,next);}catch{}}}>Move {side==="left"?"right":"left"}</button></div>
      <input aria-label="Search Peek notes" placeholder="Search your notes" value={query} onChange={e=>setQuery(e.target.value)}/>
      <div className="pios-peek-actions"><label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> Archived</label><select aria-label="Sort Peek notes" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Pinned / recent</option><option value="title">Title</option></select></div>
      <div className="pios-peek-list">{filtered.map(note=><button className={`pios-peek-card ${note.color}`} key={note.id} onClick={()=>show(note.id)} title={note.plainText.slice(0,400)}><strong>{note.pinned?"★ ":""}{note.title}</strong><span>{note.plainText.slice(0,180)||"Empty note"}</span></button>)}{!filtered.length&&<p>No matching notes.</p>}</div>
      <small>Saved to your PIOS account. Refresh on another device to load changes. Shortcut works while PIOS is focused.</small>
    </aside>}
    {windows.map((id,index)=>{const note=notes.find(n=>n.id===id);return note?<PeekWindow key={id} note={note} index={index} busy={busy} onPatch={patch} onClose={()=>setWindows(v=>v.filter(item=>item!==id))} onArchive={async()=>{if(await patch(id,{archived:!note.archived})){if(!note.archived)setUndo({id,until:Date.now()+10000});}}}/>:null;})}
    {undo&&<div className="pios-peek-undo" role="status">Note archived. <button disabled={busy} onClick={async()=>{if(await patch(undo.id,{archived:false}))setUndo(null);}}>Undo</button></div>}
    {error&&<div className="pios-peek-error" role="alert">{error}<button onClick={()=>setError("")}>Dismiss</button></div>}
  </div>;
}

export function PeekWindow({note,index,busy,onPatch,onClose,onArchive,native=false}:{note:PiosNote;index:number;busy:boolean;onPatch:(id:string,patch:Partial<PiosNote>)=>Promise<boolean>;onClose:()=>void;onArchive:()=>Promise<void>;native?:boolean}){
  const [text,setText]=useState(""),[full,setFull]=useState(false),[position,setPosition]=useState<{x:number;y:number}|null>(null);
  useEffect(()=>{if(!text)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[text]);
  function exportNote(){const blob=new Blob([JSON.stringify({format:"pios-note-v1",title:note.title,bodyHtml:note.bodyHtml,plainText:note.plainText},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="pios-note.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section aria-label={`Floating note: ${note.title}`} className={`pios-peek-window ${note.color} ${full?"expanded":""}`} style={!full?(position?{left:position.x,top:position.y}:{right:40+index*24,top:90+index*32}):undefined}>
    <header onPointerDown={e=>{if(native||full||(e.target as HTMLElement).closest("button"))return;const el=e.currentTarget;const rect=el.parentElement!.getBoundingClientRect(),dx=e.clientX-rect.left,dy=e.clientY-rect.top;el.setPointerCapture(e.pointerId);el.onpointermove=event=>setPosition({x:Math.max(0,Math.min(window.innerWidth-rect.width,event.clientX-dx)),y:Math.max(0,Math.min(window.innerHeight-60,event.clientY-dy))});el.onpointerup=()=>{el.onpointermove=null;el.onpointerup=null;};}}><strong>{note.title}</strong><button aria-label="Expand floating note" onClick={()=>setFull(!full)}>{full?"Restore":"Expand"}</button><button aria-label="Close floating note" onClick={()=>{if(!text||window.confirm("Discard the unsaved addition?"))onClose();}}>×</button></header>
    <div className="pios-peek-actions"><button disabled={busy} onClick={()=>void onPatch(note.id,{pinned:!note.pinned})}>{note.pinned?"Unpin":"Pin"}</button><button disabled={busy} onClick={()=>void onArchive()}>{note.archived?"Restore note":"Archive"}</button><button onClick={exportNote}>Export JSON</button><select aria-label="Floating note color" value={note.color} disabled={busy} onChange={e=>void onPatch(note.id,{color:e.target.value as PiosNote["color"]})}>{palette.map(color=><option key={color}>{color}</option>)}</select></div>
    <div className="pios-peek-content" dangerouslySetInnerHTML={{__html:sanitizeNoteHtml(note.bodyHtml)}}/>
    <textarea aria-label="Add to floating note" placeholder="Add a thought without replacing your formatted note…" value={text} onChange={e=>setText(e.target.value)} maxLength={10000}/>
    <button disabled={busy||!text.trim()} onClick={async()=>{const addition=text;if(await onPatch(note.id,{bodyHtml:note.bodyHtml+`<p>${escaped(addition).replace(/\n/g,"<br/>")}</p>`,plainText:note.plainText+"\n"+addition}))setText(current=>current===addition?"":current);}}>Save addition</button>
  </section>;
}
