"use client";
import {useEffect,useRef,useState} from "react";
import {getMe,getNotes,getFolders,createNote,updateNote,clearToken} from "@/lib/api";
import type {ApiNote} from "@/lib/api";
import type {PiosNote} from "@/lib/notes";
import type {PiosDesktopBridge} from "@/lib/desktop";
import {PeekWindow} from "./peek-deck";
import "./desktop-peek.css";

export default function DesktopPeek(){
  const [bridge,setBridge]=useState<PiosDesktopBridge>(),[noteId,setNoteId]=useState<string|null>(null);
  const [expanded,setExpanded]=useState(false),[notes,setNotes]=useState<ApiNote[]>([]),[user,setUser]=useState<string|null>(null);
  const [query,setQuery]=useState(""),[archived,setArchived]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [title,setTitle]=useState(""),[body,setBody]=useState(""),[creating,setCreating]=useState(false);
  const owner=useRef<string|null>(null),request=useRef(0);
  const notesRef=useRef(notes);notesRef.current=notes;
  async function load(){const version=++request.current;try{const me=await getMe();const rows=await getNotes();if(version!==request.current)return;owner.current=me.id;setUser(me.id);setNotes(rows);setError("");}catch(e){if(version!==request.current)return;owner.current=null;setUser(null);setNotes([]);setError(e instanceof Error?e.message:"Could not load notes.");}}
  useEffect(()=>{setBridge(window.piosDesktop);setNoteId(new URLSearchParams(location.search).get("note"));void load();const expired=()=>{request.current++;owner.current=null;setUser(null);setNotes([]);clearToken();};window.addEventListener("pios-session-expired",expired);return()=>{request.current++;window.removeEventListener("pios-session-expired",expired);};},[]);
  useEffect(()=>{if(!bridge)return;const dispose=bridge.onState(state=>setExpanded(state.expanded));void bridge.state().then(state=>setExpanded(state.expanded)).catch(()=>{});return dispose;},[bridge]);
  async function change(id:string,patch:Partial<PiosNote>){const own=owner.current;const existing=notesRef.current.find(n=>n.id===id);if(!existing||!own)return false;setBusy(true);setError("");try{const updated=await updateNote(id,{...existing,...patch});if(owner.current!==own)return false;setNotes(rows=>rows.map(n=>n.id===id?updated:n));return true;}catch(e){setError(e instanceof Error?e.message:"Save failed. Retry your addition.");return false;}finally{setBusy(false);}}
  async function create(){if(!title.trim()||busy)return;setBusy(true);setError("");const own=owner.current;try{const folders=await getFolders();const folder=folders.find(f=>f.name.toLowerCase()==="inbox")||folders[0];if(!folder)throw new Error("Create an Inbox folder in PIOS first.");const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");const note=await createNote({id:crypto.randomUUID(),title:title.trim(),bodyHtml:`<p>${escape(body).replace(/\n/g,"<br/>")}</p>`,plainText:body,folderId:folder.id,color:"sage",pinned:false,archived:false,order:Date.now()});if(owner.current!==own)return;setNotes(rows=>[note,...rows]);setTitle("");setBody("");setCreating(false);if(bridge)await bridge.openNote(note.id);}catch(e){setError(e instanceof Error?e.message:"Could not create note.");}finally{setBusy(false);}}
  function expand(value:boolean){setExpanded(value);void bridge?.expand(value).catch(e=>setError(String(e)));}
  const note=notes.find(n=>n.id===noteId);
  return <main onMouseLeave={()=>{if(!noteId&&!creating)expand(false);}} className={`pios-peek-root desktop-peek ${noteId?"note-mode":"edge-mode"} ${expanded?"open":""}`}>
    {!noteId&&!expanded&&<button className="desktop-peek-handle" aria-label="Expand Peek notes" onMouseEnter={()=>expand(true)} onClick={()=>expand(true)}>Peek</button>}
    {(noteId||expanded)&&<>
      {!noteId&&<header><strong>PIOS Peek</strong><button aria-label="Collapse Peek notes" onClick={()=>expand(false)}>×</button></header>}
      {error&&<p role="alert">{error} <button onClick={()=>void load()}>Retry</button></p>}
      {!user?<div className="desktop-peek-login"><p>Sign in to your PIOS account in the companion workspace, then refresh.</p><button onClick={()=>bridge?void bridge.openWorkspace():location.assign("/")}>Open PIOS / sign in</button><button onClick={()=>void load()}>Refresh</button></div>:noteId?(note?<PeekWindow native note={{...note,folderId:note.folderId||""}} index={0} busy={busy} onPatch={change} onClose={()=>bridge?void bridge.close():window.close()} onArchive={async()=>{await change(note.id,{archived:!note.archived});}}/>:<p>This note is unavailable. <button onClick={()=>void load()}>Refresh</button></p>):<>
        <div className="desktop-peek-controls"><button onClick={()=>setCreating(!creating)}>+ New note</button><button disabled={busy} onClick={()=>void load()}>Refresh</button><button onClick={()=>void bridge?.side("left")}>Left</button><button onClick={()=>void bridge?.side("right")}>Right</button><button onClick={()=>void bridge?.openWorkspace()}>Workspace</button></div>
        {creating&&<form onSubmit={e=>{e.preventDefault();void create();}}><label>Title<input required maxLength={240} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Note<textarea maxLength={10000} value={body} onChange={e=>setBody(e.target.value)}/></label><button disabled={busy||!title.trim()}>Save new note</button></form>}
        <input aria-label="Search desktop notes" placeholder="Search your notes…" value={query} onChange={e=>setQuery(e.target.value)}/>
        <label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> Archived notes</label>
        <div className="desktop-peek-notes">{notes.filter(n=>n.archived===archived&&`${n.title} ${n.plainText}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.order-a.order).map(n=><button key={n.id} title={n.plainText.slice(0,400)} onClick={()=>{if(bridge)void bridge.openNote(n.id).catch(e=>setError(String(e)));else location.assign(`/peek?note=${n.id}`);}}><strong>{n.pinned?"★ ":""}{n.title}</strong><span>{n.plainText.slice(0,140)}</span></button>)}</div>
        <small>Ctrl/Cmd+Alt+P opens this deck globally. Refresh to load changes from other devices.</small>
      </>}
    </>}
  </main>;
}
