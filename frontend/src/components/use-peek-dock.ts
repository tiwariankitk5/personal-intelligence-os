"use client";

import {useEffect, useRef, useState} from "react";
import type {MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent} from "react";

export type PeekEdge = "left" | "right" | "top" | "bottom";
type Dock = {edge:PeekEdge;offset:number};
const edges:PeekEdge[]=["left","right","top","bottom"];

export default function usePeekDock(accountId:string,onStart:()=>void){
  const [dock,setDock]=useState<Dock>({edge:"right",offset:.5});
  const current=useRef(dock);current.current=dock;
  const rail=useRef<HTMLElement>(null);
  const [size,setSize]=useState({width:32,height:32});
  const [dragging,setDragging]=useState(false);
  const pending=useRef<{id:number;x:number;y:number;active:boolean;origin:Dock;timer:ReturnType<typeof setTimeout>|null}|null>(null);
  const suppress=useRef(0);
  const save=(next:Dock)=>{current.current=next;setDock(next);try{localStorage.setItem(`pios-peek-dock:${accountId}`,JSON.stringify(next));}catch{}};
  useEffect(()=>{
    let next:Dock={edge:"right",offset:.5};
    try{
      const saved=JSON.parse(localStorage.getItem(`pios-peek-dock:${accountId}`)||"null");
      if(saved&&edges.includes(saved.edge)&&typeof saved.offset==="number"&&Number.isFinite(saved.offset))next={edge:saved.edge,offset:Math.max(0,Math.min(1,saved.offset))};
      else if(localStorage.getItem(`pios-peek-side:${accountId}`)==="left")next.edge="left";
    }catch{}
    current.current=next;setDock(next);
    return()=>{if(pending.current?.timer)clearTimeout(pending.current.timer);pending.current=null;};
  },[accountId]);
  useEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.borderBoxSize[0]?.inlineSize||entry.contentRect.width,height:entry.borderBoxSize[0]?.blockSize||entry.contentRect.height}));
    if(rail.current)observer.observe(rail.current);
    return()=>observer.disconnect();
  },[]);
  const stop=(event:ReactPointerEvent<HTMLElement>,cancel=false)=>{
    const drag=pending.current;if(!drag||drag.id!==event.pointerId)return;
    if(drag.timer)clearTimeout(drag.timer);pending.current=null;
    if(drag.active){suppress.current=Date.now()+500;if(cancel){current.current=drag.origin;setDock(drag.origin);}else save(current.current);setDragging(false);}
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const horizontal=dock.edge==="top"||dock.edge==="bottom";
  return {rail,edge:dock.edge,dragging,
    style:horizontal?{left:`calc((100vw - ${size.width}px) * ${dock.offset})`,right:"auto",top:dock.edge==="top"?"0":"auto",bottom:dock.edge==="bottom"?"0":"auto",transform:"none"}:{top:`calc((100dvh - ${size.height}px) * ${dock.offset})`,bottom:"auto",left:dock.edge==="left"?"0":"auto",right:dock.edge==="right"?"0":"auto",transform:"none"},
    setEdge:(edge:PeekEdge)=>save({edge,offset:current.current.offset}),
    handlers:{
      onPointerDown:(event:ReactPointerEvent<HTMLElement>)=>{
        if(event.button!==0||!event.isPrimary||pending.current)return;
        const element=event.currentTarget,id=event.pointerId;
        pending.current={id,x:event.clientX,y:event.clientY,active:false,origin:current.current,timer:null};
        const begin=()=>{
          if(!pending.current)return;
          pending.current.active=true;element.setPointerCapture(id);setDragging(true);onStart();
        };
        if((event.target as Element).closest(".pios-peek-drag-handle")){
          event.preventDefault();begin();
        }else pending.current.timer=setTimeout(begin,400);
      },
      onPointerMove:(event:ReactPointerEvent<HTMLElement>)=>{
        const drag=pending.current;if(!drag||drag.id!==event.pointerId)return;
        if(!drag.active){if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>8){if(drag.timer)clearTimeout(drag.timer);pending.current=null;}return;}
        event.preventDefault();
        const x=event.clientX,y=event.clientY,w=window.innerWidth,h=window.innerHeight;
        const edge=([...edges].sort((a,b)=>({left:x,right:w-x,top:y,bottom:h-y}[a])-({left:x,right:w-x,top:y,bottom:h-y}[b])))[0];
        const horizontal=edge==="top"||edge==="bottom",length=horizontal?w:h;
        const extent=horizontal?rail.current?.getBoundingClientRect().width:rail.current?.getBoundingClientRect().height;
        const offset=Math.max(0,Math.min(1,((horizontal?x:y)-(extent||32)/2)/Math.max(1,length-(extent||32))));
        const next={edge,offset};current.current=next;setDock(next);
      },
      onPointerUp:(event:ReactPointerEvent<HTMLElement>)=>stop(event),
      onPointerCancel:(event:ReactPointerEvent<HTMLElement>)=>stop(event,true),
      onLostPointerCapture:(event:ReactPointerEvent<HTMLElement>)=>stop(event),
      onClickCapture:(event:ReactMouseEvent<HTMLElement>)=>{if(Date.now()<suppress.current){event.preventDefault();event.stopPropagation();}},
    },
  };
}
