// Private course lifecycle checks against a disposable PostgreSQL deployment and labelled AI fixture.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.PIOS_TEST_API_URL||'http://localhost:8080/api/v1';
const providerBase=process.env.PIOS_RAG_FIXTURE_URL||'http://localhost:11434/v1';
const fixtureBase=process.env.PIOS_RAG_FIXTURE_CONTROL||'http://localhost:11434';
async function fixture(path,body){const r=await fetch(fixtureBase+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});assert(r.ok);return r.json();}
function client(){let cookie='',csrf;const api=async(path,{method='GET',body,expected=200}={})=>{
  if(method!=='GET'&&!csrf)csrf=await api('/auth/csrf');
  const r=await fetch(base+path,{method,headers:{Cookie:cookie,...(csrf?{[csrf.headerName]:csrf.token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  cookie=r.headers.getSetCookie().find(v=>v.startsWith('JSESSIONID='))?.split(';')[0]||cookie;
  assert.equal(r.status,expected,`${method} ${path}`);const text=await r.text();return text?JSON.parse(text):undefined;
};return{api,register:async()=>{await api('/auth/session/register',{method:'POST',expected:201,body:{displayName:'Learning Test',email:`learning-${randomUUID()}@example.com`,password:randomUUID()+'Aa1!'}});csrf=undefined;}};}
const owner=client(),other=client();await owner.register();await other.register();
const objective=await owner.api('/learning/objectives',{method:'POST',body:{title:'Reliable systems',description:'Learn through practice',category:'Engineering'}});
const otherObjective=await other.api('/learning/objectives',{method:'POST',body:{title:'Private goal',description:'',category:'General'}});
const course=()=>owner.api(`/learning/objectives/${objective.id}/course`);
assert.equal((await course()).lessons.length,0);assert.equal((await course()).dailyMinutes,30);
await other.api(`/learning/objectives/${objective.id}/course`,{expected:404});
const payload={title:'Atomic writes',videoUrl:'https://youtu.be/M7lc1UVf-VE?t=3m',durationMinutes:10,startSeconds:null,endSeconds:600,article:'Store the event and business change together.',questions:[],aiDraft:false,reviewed:false};
const lesson=await owner.api(`/learning/objectives/${objective.id}/lessons`,{method:'POST',body:payload});
const reading=await owner.api(`/learning/objectives/${objective.id}/lessons`,{method:'POST',body:{...payload,title:'Recovery practice',videoUrl:'',startSeconds:0,endSeconds:null,durationMinutes:75}});
await other.api(`/learning/objectives/${objective.id}/lessons`,{method:'POST',expected:404,body:payload});
await owner.api(`/learning/objectives/${objective.id}/lessons`,{method:'POST',expected:400,body:{...payload,videoUrl:'https://youtube.com.evil/watch?v=M7lc1UVf-VE'}});
let view=await course();assert.equal(view.lessons[0].startSeconds,180);assert.equal(view.lessons[0].durationMinutes,7);
const checkpoint={prompt:'What belongs in one transaction?',options:['Business row and event','Only the network call'],correctIndex:0,explanation:'The database write and durable event record commit atomically.',replaySeconds:192,sourceQuote:''};
view=await owner.api(`/learning/lessons/${lesson.id}/questions`,{method:'POST',body:checkpoint});
const question=view.lessons[0].questions[0];assert.equal(question.correctIndex,undefined,'answer key not exposed in course view');
await owner.api(`/learning/lessons/${lesson.id}/state`,{method:'PATCH',expected:409,body:{completed:true}});
await owner.api(`/learning/objectives/${objective.id}`,{method:'PATCH',expected:409,body:{progress:100}});
await other.api(`/learning/questions/${question.id}/answer`,{method:'POST',expected:404,body:{choice:0,placement:true}});
let feedback=await owner.api(`/learning/questions/${question.id}/answer`,{method:'POST',body:{choice:1,placement:false}});assert.equal(feedback.correct,false);assert.equal(feedback.replaySeconds,192);
feedback=await owner.api(`/learning/questions/${question.id}/answer`,{method:'POST',body:{choice:0,placement:true}});assert.equal(feedback.known,true);
view=await course();assert.equal(view.progress,50);assert(view.lessons[0].known);assert(view.plan.every(block=>block.lessonId===reading.id));
assert.deepEqual(view.plan.map(block=>block.minutes),[30,30,15]);
view=await owner.api(`/learning/objectives/${objective.id}/pace`,{method:'PUT',body:{dailyMinutes:60}});assert.deepEqual(view.plan.map(block=>block.minutes),[60,15]);
await owner.api(`/learning/objectives/${objective.id}/pace`,{method:'PUT',expected:400,body:{dailyMinutes:0}});

view=await owner.api(`/learning/lessons/${lesson.id}/notes`,{method:'POST',body:{seconds:200,body:'Remember the outbox. <script>not executable</script>'}});
const timed=view.lessons[0].notes[0];
await other.api(`/learning/lesson-notes/${timed.id}/save-note`,{method:'POST',expected:404});
const exported=await Promise.all([owner.api(`/learning/lesson-notes/${timed.id}/save-note`,{method:'POST'}),owner.api(`/learning/lesson-notes/${timed.id}/save-note`,{method:'POST'})]);
assert.equal(exported[0].id,exported[1].id,'concurrent export creates one PIOS note');
const saved=(await owner.api('/notes')).find(note=>note.id===exported[0].id);assert(saved);assert(!saved.bodyHtml.includes('<script>'));assert(saved.bodyHtml.includes('&lt;script&gt;'));assert(saved.bodyHtml.includes('t=200s'));
await owner.api(`/learning/lesson-notes/${timed.id}`,{method:'DELETE'});assert((await owner.api('/notes')).some(note=>note.id===saved.id),'learning-note deletion keeps exported copy');
await owner.api(`/learning/lessons/${lesson.id}/state`,{method:'PATCH',body:{completed:false}});assert.equal((await course()).progress,0);
await owner.api(`/learning/lessons/${lesson.id}/state`,{method:'PATCH',body:{completed:true}});
await owner.api(`/learning/lessons/${reading.id}/state`,{method:'PATCH',body:{completed:true}});assert.equal((await course()).progress,100);assert.equal((await course()).plan.length,0);
view=await owner.api(`/learning/lessons/${lesson.id}`,{method:'PUT',body:{...payload,article:'Revised lesson notes.',questions:null}});assert.equal(view.progress,50);assert.equal(view.lessons[0].questions.length,1);assert.equal(view.lessons[0].questions[0].passed,false);
await other.api(`/learning/lessons/${lesson.id}`,{method:'DELETE',expected:404});

const draftInput={title:'Event publication',transcript:'00:00 Write the event with the business row.\n03:12 Relay the event after commit.'};
await owner.api(`/learning/objectives/${objective.id}/lesson-draft`,{method:'POST',expected:412,body:draftInput});
await owner.api('/ai/providers',{method:'POST',body:{displayName:'Learning fixture',providerType:'OPENAI_COMPATIBLE',modelName:'fixture-learning',baseUrl:providerBase,apiKey:'',makeDefault:true}});
const beforeForeign=(await fixture('/__state')).draftCalls;
await other.api(`/learning/objectives/${objective.id}/lesson-draft`,{method:'POST',expected:404,body:draftInput});assert.equal((await fixture('/__state')).draftCalls,beforeForeign);
const draft=await owner.api(`/learning/objectives/${objective.id}/lesson-draft`,{method:'POST',body:draftInput});assert(draft.reviewRequired&&draft.timestamped);assert.equal(draft.questions[1].replaySeconds,192);
const generated={...payload,videoUrl:'https://www.youtube.com/watch?v=M7lc1UVf-VE',startSeconds:0,endSeconds:null,title:draft.title,article:draft.article,questions:draft.questions,aiDraft:true,reviewed:false};
await owner.api(`/learning/objectives/${objective.id}/lessons`,{method:'POST',expected:400,body:generated});
await owner.api(`/learning/objectives/${objective.id}/lessons`,{method:'POST',body:{...generated,reviewed:true}});
await fixture('/__control',{invalidDraft:true});await owner.api(`/learning/objectives/${objective.id}/lesson-draft`,{method:'POST',expected:422,body:draftInput});await fixture('/__control',{invalidDraft:false});
for(let i=0;i<8;i++)await owner.api(`/learning/objectives/${objective.id}/lesson-draft`,{method:'POST',body:draftInput});
const calls=(await fixture('/__state')).draftCalls;await owner.api(`/learning/objectives/${objective.id}/lesson-draft`,{method:'POST',expected:429,body:draftInput});assert.equal((await fixture('/__state')).draftCalls,calls);assert.equal((await course()).draftRequestsToday,10);
await owner.api(`/learning/objectives/${objective.id}`,{method:'DELETE'});await owner.api(`/learning/objectives/${objective.id}/course`,{expected:404});
assert((await owner.api('/notes')).some(note=>note.id===saved.id),'course deletion preserves separately saved PIOS notes');
assert.equal((await other.api(`/learning/objectives/${otherObjective.id}/course`)).draftRequestsToday,0);
console.log('PASS: private courses, lesson/video ranges, checkpoint feedback/replay, placement skipping, daily planning, derived progress, timed-note export/idempotence/XSS handling, edit/delete lifecycle, reviewed transcript drafts, evidence rejection and generation quotas. AI fixture only.');
