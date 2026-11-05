"use client";
import {useEffect,useRef,useState} from "react";
import type {CSSProperties} from "react";
import {getMe,getNotes,getFolders,createNote,updateNote,removeNote,clearToken} from "@/lib/api";
import type {ApiNote} from "@/lib/api";
import type {PiosNote} from "@/lib/notes";
import type {PiosDesktopBridge} from "@/lib/desktop";
import {ensurePeekFolder,isPeekFolder} from "@/lib/peek-folder";
import FloatingNoteEditor from "./floating-note-editor";
import "./desktop-peek.css";

export default function DesktopPeek(){
  const [bridge,setBridge]=useState<PiosDesktopBridge>(),[noteId,setNoteId]=useState<string|null>(null);
  const [hoverId,setHoverId]=useState<string|null>(null),[side,setSide]=useState("right");
  const [expanded,setExpanded]=useState(false),[notes,setNotes]=useState<ApiNote[]>([]),[user,setUser]=useState<string|null>(null);
  const [query,setQuery]=useState(""),[archived,setArchived]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const owner=useRef<string|null>(null),request=useRef(0);
  const notesRef=useRef(notes);notesRef.current=notes;
  async function load(){const version=++request.current;try{const me=await getMe();const [rows,folders]=await Promise.all([getNotes(),getFolders()]);const peekIds=new Set(folders.filter(isPeekFolder).map(folder=>folder.id));if(version!==request.current)return;owner.current=me.id;setUser(me.id);setNotes(rows.filter(note=>note.folderId&&peekIds.has(note.folderId)));setError("");}catch(e){if(version!==request.current)return;owner.current=null;setUser(null);setNotes([]);setError(e instanceof Error?e.message:"Could not load notes.");}}
  useEffect(()=>{setBridge(window.piosDesktop);setNoteId(new URLSearchParams(location.search).get("note"));void load();const expired=()=>{request.current++;owner.current=null;setUser(null);setNotes([]);clearToken();};window.addEventListener("pios-session-expired",expired);return()=>{request.current++;window.removeEventListener("pios-session-expired",expired);};},[]);
  useEffect(()=>{if(!bridge)return;const dispose=bridge.onState(state=>{setExpanded(state.expanded);setSide(state.side);});void bridge.state().then(state=>{setExpanded(state.expanded);setSide(state.side);}).catch(()=>{});return dispose;},[bridge]);
  useEffect(()=>{if(!noteId)return bridge?.onRefresh?.(()=>void load());},[bridge,noteId]);
  async function change(id:string,patch:Partial<PiosNote>){const own=owner.current;const existing=notesRef.current.find(n=>n.id===id);if(!existing||!own)return false;setBusy(true);setError("");try{const updated=await updateNote(id,{...existing,...patch});if(owner.current!==own)return false;setNotes(rows=>rows.map(n=>n.id===id?updated:n));if(noteId)void bridge?.refreshDeck?.();return true;}catch(e){setError(e instanceof Error?e.message:"Could not save the note. Please retry.");return false;}finally{setBusy(false);}}
  async function create(){if(busy||!owner.current)return;setBusy(true);setError("");const own=owner.current;try{const folder=await ensurePeekFolder();const note=await createNote({id:crypto.randomUUID(),title:"Untitled Peek note",bodyHtml:"<p><br></p>",plainText:"",folderId:folder.id,color:"butter",pinned:false,archived:false,order:Date.now()});if(owner.current!==own)return;setNotes(rows=>[note,...rows]);if(bridge)await bridge.openNote(note.id);}catch(e){setError(e instanceof Error?e.message:"Could not create Peek note.");}finally{setBusy(false);}}

  function expand(value:boolean){setExpanded(value);void bridge?.expand(value).catch(e=>setError(String(e)));}
  const tabs=notes.filter(n=>!n.archived).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.order-a.order).slice(0,8);
  useEffect(()=>{if(!noteId)void bridge?.count?.(tabs.length).catch(()=>{});},[bridge,noteId,tabs.length]);
  function openNote(id:string){if(bridge)void bridge.openNote(id).catch(e=>setError(String(e)));else location.assign(`/peek?note=${id}`);}
  const preview=notes.find(n=>n.id===hoverId);
  const note=notes.find(n=>n.id===noteId);
  return <main style={{"--peek-tabs-height":`${Math.max(48,tabs.length*80+48)}px`} as CSSProperties} onMouseLeave={()=>{if(!noteId){setHoverId(null);expand(false);}}} className={`pios-peek-root desktop-peek ${noteId?"note-mode":"edge-mode"} ${expanded?"open":""} dock-${side}`}>
    {!noteId&&<nav className="desktop-edge-tabs" aria-label="Screen edge notes">{tabs.map(n=><button key={n.id} className={n.color} aria-label={`Peek ${n.title}`} onMouseEnter={()=>{setHoverId(n.id);expand(true);}} onFocus={()=>{setHoverId(n.id);expand(true);}} onClick={()=>openNote(n.id)}><span>{n.title}</span></button>)}<button aria-label="Expand Peek notes" onClick={()=>{setHoverId(null);expand(true);}}>+</button></nav>}
    {!noteId&&expanded&&preview&&<button className={`desktop-edge-preview ${preview.color}`} aria-label={`Open ${preview.title}`} onClick={()=>openNote(preview.id)}><strong>{preview.title}</strong><p>{preview.plainText.slice(0,700)||"Empty note"}</p><small>Click to open · {new Date(preview.updatedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></button>}
    {(noteId||(expanded&&!preview))&&<>
      {!noteId&&<header><strong>Peek notes folder</strong><button aria-label="Collapse Peek notes" onClick={()=>expand(false)}>×</button></header>}
      {error&&<p role="alert">{error} <button onClick={()=>void load()}>Retry</button></p>}
      {!user?<div className="desktop-peek-login"><p>Sign in to your PIOS account in the companion workspace, then refresh.</p><button onClick={()=>bridge?void bridge.openWorkspace():location.assign("/")}>Open PIOS / sign in</button><button onClick={()=>void load()}>Refresh</button></div>:noteId?(note?<FloatingNoteEditor key={note.id} note={note} onPatch={change} onClose={()=>bridge?void bridge.close():window.close()} onDelete={async()=>{try{await removeNote(note.id);setNotes(rows=>rows.filter(n=>n.id!==note.id));void bridge?.refreshDeck?.();return true;}catch(e){setError(e instanceof Error?e.message:"Could not delete note.");return false;}}}/>:<p>This note is unavailable. <button onClick={()=>void load()}>Refresh</button></p>):<>
        <div className="desktop-peek-controls"><button disabled={busy} onClick={()=>void create()}>+ New Peek note</button><button disabled={busy} onClick={()=>void load()}>Refresh</button><button onClick={()=>void bridge?.side("left")}>Left</button><button onClick={()=>void bridge?.side("right")}>Right</button><button onClick={()=>void bridge?.openWorkspace()}>Workspace</button></div>
        <input aria-label="Search desktop notes" placeholder="Search your notes…" value={query} onChange={e=>setQuery(e.target.value)}/>
        <label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> Archived notes</label>
        <div className="desktop-peek-notes">{notes.filter(n=>n.archived===archived&&`${n.title} ${n.plainText}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.order-a.order).map(n=><button key={n.id} title={n.plainText.slice(0,400)} onClick={()=>openNote(n.id)}><strong>{n.pinned?"★ ":""}{n.title}</strong><span>{n.plainText.slice(0,140)}</span></button>)}</div>
        <small>Ctrl/Cmd+Alt+P opens this deck globally. Refresh to load changes from other devices.</small>
      </>}
    </>}
  </main>;
}
