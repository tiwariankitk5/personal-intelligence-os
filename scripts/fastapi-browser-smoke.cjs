// Uses the actual frontend and actual FastAPI HTTP service. Only the API destination
// is forwarded so the normal signed-in workspace and user database stay untouched.
const {chromium}=require('../tools/browser/node_modules/playwright');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const web=process.env.PIOS_TEST_WEB_URL||'http://localhost:3100';
const target=process.env.PIOS_TEST_API_URL||'http://localhost:8383/api/v1';
assert(['localhost','127.0.0.1'].includes(new URL(target).hostname),'Use a disposable local API');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let token;
  const api=async(path,method='GET',data)=>{
    if(method!=='GET'&&!token)token=await api('/auth/csrf');
    const r=await context.request.fetch(target+path,{method,data,headers:token?{[token.headerName]:token.token}:{}});
    assert(r.ok(),`${method} ${path}: ${r.status()} ${await r.text()}`);
    const text=await r.text();return text?JSON.parse(text):null;
  };
  try{
    await api('/auth/session/register','POST',{displayName:'FastAPI browser test',email:`fastapi-${randomUUID()}@example.com`,password:randomUUID()+'Aa1!'});token=null;
    const folder=(await api('/folders'))[0];
    const note=await api('/notes','POST',{title:'FastAPI retained note',bodyHtml:'<h2>Python backend</h2><p>End-to-end content</p>',folderId:folder.id,color:'rose',editorSettings:'{}'});
    await page.route('**/api/v1/**',async route=>{
      const path=new URL(route.request().url()).pathname.split('/api/v1')[1];
      const response=await route.fetch({url:target+path+new URL(route.request().url()).search});
      await route.fulfill({response});
    });
    await page.goto(web);
    await page.getByRole('button',{name:'Notes',exact:true}).click();
    await page.getByText(note.title,{exact:true}).first().click();
    await page.getByText('End-to-end content',{exact:true}).waitFor();
    await page.reload();
    await page.getByRole('button',{name:'Notes',exact:true}).click();
    await page.getByText(note.title,{exact:true}).first().waitFor();
    await page.getByRole('button',{name:'Learning',exact:true}).click();
    await page.getByLabel('Learning objective title').fill('Learn FastAPI');
    await page.getByRole('button',{name:'Create objective',exact:true}).click();
    await page.getByRole('button',{name:'Add lesson',exact:true}).click();
    await page.getByLabel('Lesson title',{exact:true}).fill('Python APIs');
    await page.getByLabel('Lesson article',{exact:true}).fill('A real persisted lesson.');
    await page.getByRole('button',{name:'Save lesson',exact:true}).click();
    await page.getByRole('button',{name:'Mark lesson complete',exact:true}).click();
    await page.getByText('Lesson completed',{exact:true}).waitFor();
    await page.reload();
    assert((await api('/learning/objectives')).some(o=>o.title==='Learn FastAPI'&&o.progress===100));
    await page.screenshot({path:'.validation/fastapi-browser.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: existing frontend + FastAPI Docker runtime, authenticated loading, note content/reload, learning create/save/complete persistence, no page errors.');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
