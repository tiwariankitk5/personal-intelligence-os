"use client";

import {useEffect, useRef, useState} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";
import "./floating-note-editor.css";
import type {ApiNote} from "@/lib/api";
import type {PiosNote} from "@/lib/notes";
import {plainTextFromHtml, sanitizeNoteHtml} from "@/lib/notes";

type Props = {note:Pick<ApiNote,"id"|"title"|"bodyHtml"|"plainText"|"color"|"pinned"|"archived">; onPatch:(id:string,patch:Partial<PiosNote>)=>Promise<boolean>; onClose:()=>void; onDelete?:()=>Promise<boolean>; onDragStart?:(event:ReactPointerEvent<HTMLElement>)=>void; onToggleExpand?:()=>void; expanded?:boolean; activation?:number};
type Draft = Pick<ApiNote,"title"|"bodyHtml"|"plainText"|"color"|"pinned"|"archived">;
const colors=["sage","butter","lavender","sky","rose","slate"] as const;
export default function FloatingNoteEditor({note,onPatch,onClose,onDelete,onDragStart,onToggleExpand,expanded,activation=0}:Props){
  const initial:Draft={title:note.title,bodyHtml:sanitizeNoteHtml(note.bodyHtml),plainText:note.plainText,color:note.color,pinned:note.pinned,archived:note.archived};
  const [draft,setDraft]=useState(initial),[revision,setRevision]=useState(0),[status,setStatus]=useState("Saved"),[busy,setBusy]=useState(false),[leaving,setLeaving]=useState(false),[formatError,setFormatError]=useState("");
  const closeEpoch=useRef(0);
  const latest=useRef(initial),confirmed=useRef(JSON.stringify(initial)),queue=useRef(Promise.resolve(true));
  const patch=useRef(onPatch);patch.current=onPatch;
  const mounted=useRef(true),editor=useRef<HTMLDivElement>(null);
  useEffect(()=>{mounted.current=true;if(editor.current)editor.current.innerHTML=sanitizeNoteHtml(note.bodyHtml);return()=>{mounted.current=false;};},[note.id]);
  useEffect(()=>{
    const incoming:Draft={title:note.title,bodyHtml:sanitizeNoteHtml(note.bodyHtml),plainText:note.plainText,color:note.color,pinned:note.pinned,archived:note.archived};
    const encoded=JSON.stringify(incoming);
    if(JSON.stringify(latest.current)===confirmed.current&&encoded!==confirmed.current){latest.current=incoming;confirmed.current=encoded;setDraft(incoming);if(editor.current&&editor.current.innerHTML!==incoming.bodyHtml)editor.current.innerHTML=incoming.bodyHtml;setStatus("Saved");}
  },[note.title,note.bodyHtml,note.plainText,note.color,note.pinned,note.archived]);
  useEffect(()=>{closeEpoch.current++;setLeaving(false);setBusy(false);},[activation]);
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
  async function close(){const epoch=++closeEpoch.current;setBusy(true);const saved=await flush();if(epoch!==closeEpoch.current||!mounted.current)return;if(saved){setLeaving(true);if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)await new Promise(resolve=>setTimeout(resolve,180));if(epoch===closeEpoch.current&&mounted.current)onClose();}else setBusy(false);}
  function format(command:string){
    if(!editor.current)return;const selection=window.getSelection();const range=selection?.rangeCount&&editor.current.contains(selection.anchorNode)?selection.getRangeAt(0).cloneRange():null;
    let value:string|undefined;if(command==="createLink"){const input=window.prompt("Link URL","https://");if(!input)return;try{const url=new URL(input);if(!["https:","http:","mailto:"].includes(url.protocol))throw new Error();value=url.href;}catch{setFormatError("Use an https, http or mailto link.");return;}}
    setFormatError("");editor.current.focus();if(range&&selection){selection.removeAllRanges();selection.addRange(range);}document.execCommand(command,false,value);
    const html=sanitizeNoteHtml(editor.current.innerHTML);update({bodyHtml:html,plainText:plainTextFromHtml(html)});
  }
  return <section className={`desktop-note-editor ${draft.color} ${leaving?"leaving":""}`} inert={leaving} aria-label={`Floating note: ${note.title}`}>
    <header className="desktop-note-drag">{onDragStart&&<button type="button" aria-label="Move floating note" onPointerDown={onDragStart}>⠿</button>}<input aria-label="Floating note title" value={draft.title} maxLength={240} onChange={e=>update({title:e.target.value||"Untitled note"})}/><span role="status">{status}</span>{onToggleExpand&&<button type="button" aria-label="Expand floating note" aria-pressed={expanded} onClick={onToggleExpand}>↗</button>}<button aria-label="Return note to edge tabs" disabled={busy} onClick={()=>void close()}>—</button><button aria-label="Close floating note" disabled={busy} onClick={()=>void close()}>×</button></header>
    {status.startsWith("Save failed")&&<button className="desktop-note-retry" onClick={()=>void flush()}>Retry saving note</button>}
    <div ref={editor} className="desktop-note-writing" role="textbox" aria-label="Floating note content" aria-multiline="true" contentEditable suppressContentEditableWarning onInput={e=>{const html=sanitizeNoteHtml(e.currentTarget.innerHTML);update({bodyHtml:html,plainText:plainTextFromHtml(html)});}} onPaste={e=>{e.preventDefault();document.execCommand("insertText",false,e.clipboardData.getData("text/plain"));}} onDrop={e=>e.preventDefault()}/>
    <div className="peek-format-bar" role="toolbar" aria-label="Floating note formatting">{[["bold","Bold","B"],["italic","Italic","I"],["underline","Underline","U"],["strikeThrough","Strikethrough","S"],["insertUnorderedList","Bulleted list","☷"],["insertOrderedList","Numbered list","1."],["createLink","Insert link","↗"]].map(([command,label,text])=><button type="button" key={command} aria-label={label} onMouseDown={event=>event.preventDefault()} onClick={()=>format(command)}>{text}</button>)}{formatError&&<small role="alert">{formatError}</small>}</div>
    <footer><div className="desktop-note-colors" aria-label="Note colors">{colors.map(color=><button key={color} className={color} aria-label={`Use ${color} color`} aria-pressed={draft.color===color} onClick={()=>update({color})}/>)}</div>
      <button aria-pressed={draft.pinned} onClick={()=>update({pinned:!draft.pinned})}>{draft.pinned?"Unpin":"Pin"}</button>
      <button onClick={()=>update({archived:!draft.archived})}>{draft.archived?"Restore":"Archive"}</button>
      {onDelete&&<button disabled={busy} onClick={async()=>{if(!window.confirm("Permanently delete this note from your PIOS account?"))return;setBusy(true);if(!await flush()){setBusy(false);return;}if(await onDelete())onClose();else setBusy(false);}}>Delete</button>}
      <button onClick={exportNote}>Export JSON</button><button disabled={busy} onClick={()=>void close()}>Close</button>
    </footer>
  </section>;
}
