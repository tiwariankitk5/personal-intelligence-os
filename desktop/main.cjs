const {app,BrowserWindow,screen,Tray,Menu,nativeImage,globalShortcut,ipcMain,session,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {appOrigin,trustedFrame,noteId,edgeBounds}=require('./policy.cjs');
const origin=appOrigin(process.env.PIOS_DESKTOP_URL||'http://localhost:3100');
const partition='persist:pios-peek';
let edge,workspace,tray,side='right',expanded=false,quitting=false,shortcutReady=false,paused=false;
const notes=new Map();
let cookieReloadTimer;
const hidden=process.argv.includes('--hidden');
const background=process.argv.includes('--background');
app.setPath('userData',path.join(app.getPath(hidden?'temp':'appData'),hidden?'PIOS-Peek-test':'PIOS-Peek'));
const settingsFile=path.join(app.getPath('userData'),'preferences.json');
try{const saved=JSON.parse(fs.readFileSync(settingsFile,'utf8'));if(['left','right'].includes(saved.side))side=saved.side;}catch{}
function saveSide(){try{fs.mkdirSync(path.dirname(settingsFile),{recursive:true});fs.writeFileSync(settingsFile,JSON.stringify({side}));}catch{console.error('Could not save dock preference.');}}
function options(extra={}){return {show:false,backgroundColor:'#f5f8f5',webPreferences:{partition,preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,webviewTag:false},...extra};}
function guard(win){
  win.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['Keep editing','Discard addition'],defaultId:0,cancelId:0,message:'Discard the unsaved note addition?'});if(choice===1)event.preventDefault();});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{try{if(new URL(url).origin!==origin)event.preventDefault();}catch{event.preventDefault();}});
  win.webContents.on('will-redirect',(event,url)=>{try{if(new URL(url).origin!==origin)event.preventDefault();}catch{event.preventDefault();}});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  win.webContents.on('did-fail-load',(_event,code)=>{if(code!==-3)console.error(`PIOS window failed to load (${code}); check the configured server.`);});
}
function area(){return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;}
function resizeEdge(value){expanded=value;edge.setBounds(edgeBounds(area(),side,expanded));edge.webContents.send('peek:state',{expanded,side});}
function workspaceWindow(){if(!workspace||workspace.isDestroyed()){workspace=new BrowserWindow(options({width:1100,height:800,title:'PIOS workspace'}));guard(workspace);workspace.loadURL(origin);workspace.on('closed',()=>{workspace=null;});}if(!hidden){workspace.show();workspace.focus();}}
function showEdge(){if(paused)paused=false;resizeEdge(true);if(!hidden){edge.show();edge.focus();}}
function closeNoteWindows(){for(const win of notes.values())if(!win.isDestroyed())win.destroy();notes.clear();}
function buildMenu(){tray.setContextMenu(Menu.buildFromTemplate([
  {label:'Show Peek notes',click:showEdge}, {label:'Open PIOS / sign in',click:workspaceWindow},
  {label:'Dock edge',submenu:['left','right'].map(value=>({label:value,type:'radio',checked:side===value,click:()=>{side=value;saveSide();resizeEdge(expanded);buildMenu();}}))},
  {label:paused?'Resume overlays':'Hide all overlays',click:()=>{paused=!paused;if(paused){edge.hide();for(const win of notes.values())win.hide();}else{edge.showInactive();for(const win of notes.values())win.showInactive();}buildMenu();}},
  {label:'Launch at sign-in',type:'checkbox',enabled:app.isPackaged,checked:app.isPackaged&&app.getLoginItemSettings().openAtLogin,click:item=>app.setLoginItemSettings({openAtLogin:item.checked,args:['--background']})},
  {label:shortcutReady?'Shortcut: Ctrl/Cmd+Alt+P':'Shortcut unavailable (use tray)',enabled:false},
  {type:'separator'},{label:'Quit PIOS Peek',click:()=>{quitting=true;app.quit();}}
]));}
function trusted(event){const win=BrowserWindow.fromWebContents(event.sender);return win&&event.senderFrame===event.sender.mainFrame&&trustedFrame(event.senderFrame.url,origin)&&(win===edge||[...notes.values()].includes(win));}
function ipc(channel,handler){ipcMain.handle(channel,(event,value)=>{if(!trusted(event))throw new Error('Untrusted Peek request');return handler(event,value);});}
if(!app.requestSingleInstanceLock())app.quit();else{
app.on('second-instance',()=>{if(edge)showEdge();workspaceWindow();});
app.whenReady().then(()=>{
  const sess=session.fromPartition(partition);
  sess.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  sess.setPermissionCheckHandler(()=>false);
  // A session rotation/sign-out invalidates old note windows before another user can use them.
  sess.cookies.on('changed',(_event,cookie)=>{if(cookie.name==='JSESSIONID'){closeNoteWindows();if(edge&&!edge.isDestroyed()){resizeEdge(false);clearTimeout(cookieReloadTimer);cookieReloadTimer=setTimeout(()=>{if(!edge.isDestroyed())edge.webContents.reload();},100);}}});
  edge=new BrowserWindow(options({frame:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,...edgeBounds(area(),side,false)}));guard(edge);
  edge.loadURL(origin+'/peek');edge.once('ready-to-show',()=>{if(!hidden)edge.showInactive();});
  edge.on('close',event=>{if(!quitting){event.preventDefault();edge.hide();}});
  screen.on('display-metrics-changed',()=>resizeEdge(expanded));screen.on('display-removed',()=>resizeEdge(expanded));
  ipc('peek:state',()=>({expanded,side}));
  ipc('peek:workspace',()=>workspaceWindow());
  ipc('peek:expand',(event,value)=>{if(BrowserWindow.fromWebContents(event.sender)!==edge||typeof value!=='boolean')throw new Error('Invalid edge request');resizeEdge(value);});
  ipc('peek:side',(_event,value)=>{if(!['left','right'].includes(value))throw new Error('Invalid side');side=value;saveSide();resizeEdge(expanded);buildMenu();});
  ipc('peek:close',event=>{const win=BrowserWindow.fromWebContents(event.sender);if(win===edge)resizeEdge(false);else win.close();});
  ipc('peek:open-note',(_event,id)=>{
    if(!noteId(id))throw new Error('Invalid note identifier');
    const existing=notes.get(id);if(existing&&!existing.isDestroyed()){if(!hidden){existing.show();existing.focus();}return;}
    if(notes.size>=12)throw new Error('Close a floating note before opening another (maximum 12).');
    const a=area(),offset=(notes.size%6)*28;
    const win=new BrowserWindow(options({width:Math.min(440,a.width),height:Math.min(620,a.height),x:a.x+30+offset,y:a.y+30+offset,title:'PIOS Peek note',alwaysOnTop:true,minWidth:300,minHeight:300}));guard(win);notes.set(id,win);win.loadURL(origin+'/peek?note='+id);win.once('ready-to-show',()=>{if(!hidden)win.show();});win.on('closed',()=>notes.delete(id));
  });
  tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'tray.png')));tray.setToolTip('PIOS Peek notes');tray.on('click',showEdge);
  shortcutReady=globalShortcut.register('CommandOrControl+Alt+P',()=>{if(edge.isVisible()&&expanded){resizeEdge(false);}else showEdge();});buildMenu();
  if(!hidden&&!background)workspaceWindow();
}).catch(error=>{console.error(error.message);app.quit();});
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{quitting=true;});
app.on('will-quit',()=>globalShortcut.unregisterAll());
}
