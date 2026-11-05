const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('piosDesktop',Object.freeze({
  openNote:id=>ipcRenderer.invoke('peek:open-note',id),
  openWorkspace:()=>ipcRenderer.invoke('peek:workspace'),
  expand:value=>ipcRenderer.invoke('peek:expand',value),
  side:value=>ipcRenderer.invoke('peek:side',value),
  close:()=>ipcRenderer.invoke('peek:close'),
  state:()=>ipcRenderer.invoke('peek:state'),
  onState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('peek:state',listener);return()=>ipcRenderer.removeListener('peek:state',listener);},
}));
