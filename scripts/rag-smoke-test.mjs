// Real PostgreSQL/pgvector and HTTP pipeline checks with an explicitly synthetic provider.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base=process.env.PIOS_TEST_API_URL||'http://localhost:8080/api/v1';
const providerBase=process.env.PIOS_RAG_FIXTURE_URL||'http://localhost:11434/v1';
const controlBase=process.env.PIOS_RAG_FIXTURE_CONTROL||'http://localhost:11434';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fixture=async(path,body)=>{
  const response=await fetch(controlBase+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  assert(response.ok);return response.json();
};
let fixtureReady=false;
for(let i=0;i<40;i++){
  try{await fixture('/__state');fixtureReady=true;break;}catch{await sleep(100);}
}
assert(fixtureReady,'Synthetic provider did not start. Launch scripts/rag-test-provider.mjs first.');
function client(){
  let cookie='',csrf;
  const api=async(path,{method='GET',body,expected=200}={})=>{
    if(method!=='GET'&&!csrf)csrf=await api('/auth/csrf');
    const response=await fetch(base+path,{method,headers:{Cookie:cookie,...(csrf?{[csrf.headerName]:csrf.token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
    cookie=response.headers.getSetCookie().find(value=>value.startsWith('JSESSIONID='))?.split(';')[0]||cookie;
    assert.equal(response.status,expected,`${method} ${path}`);
    const text=await response.text();return text?JSON.parse(text):undefined;
  };
  return{api,register:async()=>{await api('/auth/session/register',{method:'POST',expected:201,body:{displayName:'RAG Test',email:`rag-${randomUUID()}@example.com`,password:randomUUID()+'Aa1!'}});csrf=undefined;}};
}
const owner=client(),other=client();await owner.register();await other.register();
const initialProviderCalls=(await fixture('/__state')).calls.length;
const note=(title,text,id=randomUUID(),archived=false)=>({id,title,bodyHtml:`<p>${text}</p>`,plainText:text,folderId:null,color:'sage',pinned:false,archived,order:0});
const create=async(c,value)=>c.api('/notes',{method:'POST',body:value});
const change=async(c,value)=>c.api('/notes/'+value.id,{method:'PUT',body:value});
const search=(c,query)=>c.api('/ai/retrieval/search',{method:'POST',body:{query}});
const status=c=>c.api('/ai/retrieval/settings');
const ready=async(c)=>{for(let i=0;i<160;i++){const s=await status(c);if(s.chunks>0&&s.embeddedChunks===s.chunks&&s.states.every(item=>item.state==='ready'))return s;await sleep(150);}throw Error('Index did not become ready');};
const settings=(provider,extra={})=>({providerId:provider.id,model:'fixture-semantic-v1',dimensions:3,requestDimensions:false,enabled:true,dailyCallLimit:100,dailyInputLimit:100000,consent:true,...extra});
const setup=(c,body)=>c.api('/ai/retrieval/settings',{method:'PUT',body});
const provider=async(c)=>c.api('/ai/providers',{method:'POST',body:{displayName:'Synthetic RAG fixture',providerType:'OPENAI_COMPATIBLE',modelName:'fixture-chat',baseUrl:providerBase,apiKey:'',makeDefault:true}});

const cat=note('Nutrition reference','Kittens need protein-rich meals.');await create(owner,cat);
const vehicle=note('Transport reference','The engine drives an automobile.');await create(owner,vehicle);
const privateNote=note('Private feline reference','A cat belongs to another account.');await create(other,privateNote);
const source=await owner.api('/sources/text',{method:'POST',body:{title:'Uploaded feline handbook',content:'Kittens enjoy healthy meals. '.repeat(130),collection:'Tests'}});
assert.equal((await search(owner,'protein')).mode,'keyword');assert.equal((await fixture('/__state')).calls.length,initialProviderCalls,'no provider use without consent');
const ownerProvider=await provider(owner),otherProvider=await provider(other);
await owner.api('/ai/retrieval/settings',{method:'PUT',expected:400,body:settings(otherProvider)});
await owner.api('/ai/retrieval/settings',{method:'PUT',expected:400,body:settings(ownerProvider,{consent:false})});
await setup(owner,settings(ownerProvider));await setup(other,settings(otherProvider));
await ready(owner);await ready(other);
let result=await search(owner,'feline dietary guidance');
assert.equal(result.mode,'hybrid');assert(result.passages.some(p=>p.id===cat.id));assert(!result.passages.some(p=>p.id===privateNote.id));
assert(result.passages.some(p=>p.id===source.id),'source chunks participate');
assert(!(await search(other,'feline dietary guidance')).passages.some(p=>p.id===cat.id),'other account cannot retrieve owner chunks');
const chat=await owner.api('/ai/chat',{method:'POST',body:{question:'feline dietary guidance',useKnowledge:true}});
assert.equal(chat.retrievalMode,'hybrid');assert.equal(chat.citations.length,1);assert.equal(chat.citations[0].number,1);
assert(chat.citations[0].excerpt&&chat.citations[0].chunkId);assert(!chat.answer.includes('[999]'));assert(chat.answer.includes('[unsupported citation]'));
await other.api('/ai/chat',{method:'POST',expected:404,body:{question:'feline dietary guidance',useKnowledge:true,conversationId:chat.conversationId}});
const history=await owner.api(`/ai/conversations/${chat.conversationId}/messages`);assert(JSON.parse(history[1].citations)[0].excerpt);

// Edits during a delayed request must not write old vectors into replacement chunks.
await fixture('/__control',{delayMs:700});
const oldCallCount=(await fixture('/__state')).calls.length;
await change(owner,note(cat.title,'Kittens need OLD_MARKER meals.',cat.id));
for(let i=0;i<80;i++){if((await fixture('/__state')).calls.length>oldCallCount)break;await sleep(50);}
await change(owner,note(cat.title,'Automobile NEW_MARKER engines require maintenance.',cat.id));
await fixture('/__control',{delayMs:0});await ready(owner);
result=await search(owner,'automobile maintenance');assert(result.passages.some(p=>p.id===cat.id&&p.excerpt.includes('NEW_MARKER')));
assert(!result.passages.some(p=>p.excerpt.includes('OLD_MARKER')));

await change(owner,note(cat.title,'Automobile NEW_MARKER engines require maintenance.',cat.id,true));
assert(!(await search(owner,'NEW_MARKER')).passages.some(p=>p.id===cat.id),'archived note excluded');
await change(owner,note(cat.title,'Automobile NEW_MARKER engines require maintenance.',cat.id));await ready(owner);
await setup(owner,settings(ownerProvider,{model:'fixture-semantic-v2'}));await ready(owner);
assert((await fixture('/__state')).calls.some(call=>call.model==='fixture-semantic-v2'));
await owner.api('/ai/retrieval/rebuild',{method:'POST'});await ready(owner);

await fixture('/__control',{error:true});
result=await search(owner,'automobile');assert.equal(result.mode,'keyword');assert(result.warning.includes('Embedding provider'));
await change(owner,note(vehicle.title,'Engine FAILURE_MARKER mechanics.',vehicle.id));
for(let i=0;i<80;i++){if((await status(owner)).states.some(item=>item.state==='failed'))break;await sleep(100);}
assert((await status(owner)).states.some(item=>item.state==='failed'),'index failures visible');
await fixture('/__control',{error:false});await owner.api('/ai/retrieval/retry',{method:'POST'});await ready(owner);
assert((await status(owner)).usage.failed_calls>0,'failed calls recorded');

await owner.api('/sources/'+source.id,{method:'DELETE'});await owner.api('/notes/'+cat.id,{method:'DELETE'});
assert(!(await search(owner,'feline')).passages.some(p=>[cat.id,source.id].includes(p.id)),'deleted content absent');
await setup(other,settings(otherProvider,{enabled:false,consent:false}));await ready(owner);
await fixture('/__control',{delayMs:400});
const leaseMarker='DUPLICATE_LEASE_MARKER_'+randomUUID();
const leaseNote=note('Concurrent indexing',(leaseMarker+' engine mechanics. ').repeat(80));
await create(owner,leaseNote);await ready(owner);await sleep(700);
const leaseCalls=(await fixture('/__state')).calls.filter(call=>call.input.some(text=>text.includes(leaseMarker)));
assert.equal(leaseCalls.length,1,'a claimed document batch is not processed twice');
const used=(await status(owner)).usage.calls;
await setup(owner,settings(ownerProvider,{model:'fixture-semantic-v2',dailyCallLimit:used+1}));
const beforeConcurrent=(await fixture('/__state')).calls.length;
const concurrent=await Promise.all(Array.from({length:10},()=>search(owner,'engine')));
assert.equal(concurrent.filter(item=>item.mode==='hybrid').length,1,'shared budget allows only one remaining concurrent call');
assert.equal((await fixture('/__state')).calls.length,beforeConcurrent+1);
await fixture('/__control',{delayMs:0});
await setup(owner,settings(ownerProvider,{model:'fixture-semantic-v2',dailyCallLimit:1}));
const callsBefore=(await fixture('/__state')).calls.length;
result=await search(owner,'engine');assert.equal(result.mode,'keyword');assert(result.warning.includes('budget'));
assert.equal((await fixture('/__state')).calls.length,callsBefore,'budget enforced before upstream call');
assert((await status(owner)).usage.reported_tokens>0);
await setup(owner,settings(ownerProvider,{model:'fixture-semantic-v2',enabled:false,consent:false}));
assert.equal((await search(owner,'engine')).mode,'keyword');
console.log('PASS: real pgvector hybrid retrieval, consent, note/source isolation, exact cited excerpts, edit/lease safety, archive/delete lifecycle, model changes, visible failures/retry, budgets and keyword fallback. Synthetic provider only; this is not a real-model quality evaluation.');
