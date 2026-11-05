export type PiosDesktopBridge = {
  refreshDeck?:()=>Promise<void>; onRefresh?:(callback:()=>void)=>()=>void;
  count?:(count:number)=>Promise<void>;
  openNote:(id:string)=>Promise<void>; openWorkspace:()=>Promise<void>;
  state:()=>Promise<{expanded:boolean;side:string}>; onState:(callback:(state:{expanded:boolean;side:string})=>void)=>()=>void;
  expand:(expanded:boolean)=>Promise<void>; side:(side:"left"|"right")=>Promise<void>; close:()=>Promise<void>;
};
declare global {interface Window {piosDesktop?:PiosDesktopBridge}}
