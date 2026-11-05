// Optional real-model evaluation. Creates one synthetic account; only its synthetic text is embedded.
// Set PIOS_EVAL_MODEL, PIOS_EVAL_PROVIDER_URL, PIOS_EVAL_DIMENSIONS and PIOS_TEST_API_URL.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const model=process.env.PIOS_EVAL_MODEL;assert(model,'Set PIOS_EVAL_MODEL to an actual embedding model, not the deterministic fixture.');
const dimensions=Number(process.env.PIOS_EVAL_DIMENSIONS||384);
const base=process.env.PIOS_TEST_API_URL||'http://localhost:8280/api/v1';
const providerUrl=process.env.PIOS_EVAL_PROVIDER_URL||'http://host.docker.internal:1234/v1';
const corpus=JSON.parse(await readFile(new URL('../docs/evaluation/rag-cases.json',import.meta.url),'utf8'));
let cookie='',csrf;
async function api(path,method='GET',body){
  if(method!=='GET'&&!csrf)csrf=await api('/auth/csrf');
  const response=await fetch(base+path,{method,headers:{Cookie:cookie,...(csrf?{[csrf.headerName]:csrf.token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  cookie=response.headers.getSetCookie().find(v=>v.startsWith('JSESSIONID='))?.split(';')[0]||cookie;
  assert(response.ok,`${method} ${path}: ${response.status}`);const text=await response.text();return text?JSON.parse(text):undefined;
}
await api('/auth/session/register','POST',{displayName:'Retrieval Evaluation',email:`eval-${randomUUID()}@example.com`,password:randomUUID()+'Aa1!'});csrf=undefined;
const ids={};
for(const doc of corpus.documents){const note=await api('/notes','POST',{title:doc.title,bodyHtml:`<p>${doc.text}</p>`,plainText:doc.text,color:'sage',folderId:null,pinned:false,archived:false,order:0});ids[doc.key]=note.id;}
const provider=await api('/ai/providers','POST',{displayName:'Local evaluation model',providerType:'OPENAI_COMPATIBLE',modelName:'embedding-only',baseUrl:providerUrl,apiKey:process.env.PIOS_EVAL_API_KEY||'',makeDefault:false});
const config={providerId:provider.id,model,dimensions,requestDimensions:false,enabled:true,consent:true,dailyCallLimit:100,dailyInputLimit:100000};
const results=[];
for(const test of corpus.queries){const result=await api('/ai/retrieval/search','POST',{query:test.query});results.push({...test,keywordRank:result.passages.findIndex(p=>p.id===ids[test.expected])+1});}
await api('/ai/retrieval/settings','PUT',config);
let ready=false;
for(let i=0;i<240;i++){const status=await api('/ai/retrieval/settings');if(status.embeddedChunks===status.chunks&&status.chunks>0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}
assert(ready,'Model index did not become ready. Inspect the retrieval settings status.');
for(const test of results){const result=await api('/ai/retrieval/search','POST',{query:test.query});assert.equal(result.mode,'hybrid',result.warning||'Hybrid retrieval unavailable');test.hybridRank=result.passages.findIndex(p=>p.id===ids[test.expected])+1;}
const score=field=>({recallAt5:results.filter(v=>v[field]>0&&v[field]<=5).length/results.length,mrr:results.reduce((sum,v)=>sum+(v[field]>0?1/v[field]:0),0)/results.length,top1:results.filter(v=>v[field]===1).length/results.length});
const usage=(await api('/ai/retrieval/settings')).usage;
await api('/ai/retrieval/settings','PUT',{...config,enabled:false,consent:false});
const report={model,dimensions,description:corpus.description,queries:results.length,keyword:score('keywordRank'),hybrid:score('hybridRank'),usage,results};
const reportPath=process.env.PIOS_EVAL_REPORT||'.validation/rag-evaluation.json';await writeFile(reportPath,JSON.stringify(report,null,2));
if(process.env.PIOS_EVAL_SESSION_STATE)await writeFile(process.env.PIOS_EVAL_SESSION_STATE,JSON.stringify({cookie,base}));
console.log(JSON.stringify({model,queries:report.queries,keyword:report.keyword,hybrid:report.hybrid,usage,report:reportPath}));
