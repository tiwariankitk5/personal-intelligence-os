// Deterministic protocol fixture, NOT an embedding model or a production provider.
// Tests use synthetic accounts/documents only. Never connect a real user's workspace.
import http from 'node:http';
let control={delayMs:0,error:false,badDimensions:false};
const calls=[];
const vector=text=>/feline|kitten|\bcat\b/i.test(text)?[1,0,0]:/automobile|engine|vehicle|motor/i.test(text)?[0,1,0]:[0,0,1];
const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.url==='/__state')return send(200,{calls});
  let raw='';for await(const part of req){raw+=part;if(raw.length>200000)return send(413,{error:'fixture input too large'});}
  let body;try{body=JSON.parse(raw||'{}');}catch{return send(400,{error:'invalid JSON'});}
  if(req.url==='/__control'){control={...control,...body};return send(200,{ok:true});}
  if(req.url==='/v1/embeddings'){
    const snapshot={...control};calls.push({model:body.model,input:body.input});
    if(snapshot.delayMs)await new Promise(resolve=>setTimeout(resolve,snapshot.delayMs));
    if(snapshot.error)return send(503,{error:'fixture provider intentionally unavailable'});
    return send(200,{model:body.model,data:body.input.map((text,index)=>({index,embedding:snapshot.badDimensions?[1,0]:vector(text)})).reverse(),usage:{total_tokens:body.input.reduce((sum,s)=>sum+Math.ceil(s.length/4),0)}});
  }
  if(req.url==='/v1/chat/completions')return send(200,{choices:[{message:{content:'Fixture answer supported by the first passage [1]. Unsupported reference [999].'}}]});
  send(404,{error:'not found'});
});
server.listen(Number(process.env.PIOS_RAG_FIXTURE_PORT||11434),'0.0.0.0',()=>console.log('RAG synthetic protocol fixture ready'));
