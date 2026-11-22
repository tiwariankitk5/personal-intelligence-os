"use client";

import {useLayoutEffect,useRef,useState} from "react";
import type {CSSProperties} from "react";
import type {PiosNote} from "@/lib/notes";
import type {PeekEdge} from "./use-peek-dock";

export default function PeekHoverPreview({note,anchor,edge,leaving,onOpen}:{note:PiosNote;anchor:HTMLButtonElement;edge:PeekEdge;leaving:boolean;onOpen:()=>void}){
  const panel=useRef<HTMLButtonElement>(null);
  const [position,setPosition]=useState<CSSProperties>({visibility:"hidden"});
  useLayoutEffect(()=>{
    const place=()=>{
      if(!panel.current||!anchor.isConnected)return;
      const a=anchor.getBoundingClientRect(),r=panel.current.getBoundingClientRect();
      const horizontal=edge==="left"||edge==="right";
      const x=horizontal?(edge==="left"?a.right+2:a.left-r.width-2):a.left+a.width/2-r.width/2;
      const y=horizontal?a.top+a.height/2-r.height/2:edge==="top"?a.bottom+2:a.top-r.height-2;
      setPosition({left:Math.max(8,Math.min(innerWidth-r.width-8,x)),top:Math.max(8,Math.min(innerHeight-r.height-8,y)),background:getComputedStyle(anchor).getPropertyValue("--peek-paper").trim()||"#fff",visibility:"visible","--peek-enter-x":horizontal?(edge==="left"?"-28px":"28px"):"0px","--peek-enter-y":horizontal?"0px":edge==="top"?"-28px":"28px"} as CSSProperties);
    };
    place();const observer=new ResizeObserver(place);observer.observe(anchor);if(panel.current)observer.observe(panel.current);
    window.addEventListener("resize",place);window.addEventListener("scroll",place,true);
    return()=>{observer.disconnect();window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true);};
  },[anchor,edge,note.color]);
  return <button ref={panel} className={`pios-peek-hover anchored ${note.color}${leaving?" leaving":""}`} style={position} aria-label={`Open ${note.title}`} onClick={onOpen}><strong>{note.title}</strong><p>{note.plainText.slice(0,700)||"Empty note"}</p><small>Click to open · {note.updatedAt}</small></button>;
}
