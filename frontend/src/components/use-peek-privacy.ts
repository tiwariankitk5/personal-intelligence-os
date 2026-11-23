"use client";
import {useEffect,useState} from "react";

export default function usePeekPrivacy(accountId:string|null){
  const [state,setState]=useState<{owner:string|null;hidden:boolean}>({owner:null,hidden:true});
  const ready=!!accountId&&state.owner===accountId;
  const hidden=!ready||state.hidden;
  useEffect(()=>{
    if(!accountId)return;
    let hidden=false;
    try{const saved=localStorage.getItem(`pios-peek-private:${accountId}`);hidden=saved===null?!!window.piosDesktop:saved==="true";}catch{hidden=!!window.piosDesktop;}
    setState({owner:accountId,hidden});
    const changed=(event:StorageEvent)=>{
      if(event.key===`pios-peek-private:${accountId}`)setState({owner:accountId,hidden:event.newValue==="true"});
    };
    window.addEventListener("storage",changed);return()=>window.removeEventListener("storage",changed);
  },[accountId]);
  const toggle=()=>{
    if(!ready||!accountId)return;
    const next=!hidden;setState({owner:accountId,hidden:next});
    try{localStorage.setItem(`pios-peek-private:${accountId}`,String(next));}catch{}
  };
  useEffect(()=>{
    const shortcut=(event:KeyboardEvent)=>{
      if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.code==="KeyH"&&!event.repeat){event.preventDefault();toggle();}
    };
    window.addEventListener("keydown",shortcut);return()=>window.removeEventListener("keydown",shortcut);
  });
  return {hidden,ready,toggle};
}
