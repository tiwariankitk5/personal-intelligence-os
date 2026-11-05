const {URL}=require('node:url');
function appOrigin(input='http://localhost:3100') {
  const url=new URL(input);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('PIOS_DESKTOP_URL must be an origin only.');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Remote PIOS requires HTTPS.');
  return url.origin;
}
function trustedFrame(url,origin){try{const value=new URL(url);return value.origin===origin&&value.pathname==='/peek';}catch{return false;}}
function noteId(value){return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);}
function edgeBounds(area,side,expanded){const width=Math.min(expanded?380:34,area.width);const height=Math.min(expanded?720:150,area.height);return {x:side==='left'?area.x:area.x+area.width-width,y:area.y+Math.round((area.height-height)/2),width,height};}
module.exports={appOrigin,trustedFrame,noteId,edgeBounds};
