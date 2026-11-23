const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('piosDesktop',Object.freeze({
  refreshDeck:()=>ipcRenderer.invoke('peek:refresh-deck'),
  onRefresh:callback=>{const listener=()=>callback();ipcRenderer.on('peek:refresh',listener);return()=>ipcRenderer.removeListener('peek:refresh',listener);},
  count:value=>ipcRenderer.invoke('peek:count',value),
  openNote:id=>ipcRenderer.invoke('peek:open-note',id),
  openWorkspace:()=>ipcRenderer.invoke('peek:workspace'),
  expand:value=>ipcRenderer.invoke('peek:expand',value),
  side:value=>ipcRenderer.invoke('peek:side',value),
  close:()=>ipcRenderer.invoke('peek:close'),
  hideOverlays:()=>ipcRenderer.invoke('peek:hide-overlays'),
  capturePrivacy:value=>ipcRenderer.invoke('peek:privacy',value),
  state:()=>ipcRenderer.invoke('peek:state'),
  onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('peek:state',listener);return()=>ipcRenderer.removeListener('peek:state',listener);},
}));
