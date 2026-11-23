export type DesktopPeekState = {expanded:boolean;side:string;capturePrivate?:boolean;captureProtectionSupported?:boolean;captureProtectionApplied?:boolean;overlaysHidden?:boolean};
export type PiosDesktopBridge = {
  hideOverlays?:()=>Promise<DesktopPeekState>;
  capturePrivacy?:(enabled:boolean)=>Promise<DesktopPeekState>;
  refreshDeck?:()=>Promise<void>; onRefresh?:(callback:()=>void)=>()=>void;
  count?:(count:number)=>Promise<void>;
  openNote:(id:string)=>Promise<void>; openWorkspace:()=>Promise<void>;
  state:()=>Promise<DesktopPeekState>; onState:(callback:(state:DesktopPeekState)=>void)=>()=>void;
  expand:(expanded:boolean)=>Promise<void>; side:(side:"left"|"right")=>Promise<void>; close:()=>Promise<void>;
};
declare global {interface Window {piosDesktop?:PiosDesktopBridge}}
