import { chromium } from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
mkdirSync('qa-artifacts',{recursive:true});
const s=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,VITE_CAPTURE_JEV:'true'}});
const text=('Build one standalone HTML file: one document, one inline style block, one short inline script. No build step, no CSS framework, no component library, no TypeScript.\n\nKeep all controls visible and keep the original text.\n\n').repeat(400)+'UNBROKEN-'+('x'.repeat(10000))+'\nLAST LINE: exact end of original paste.';
let calls=0;
try {
 await new Promise(r=>setTimeout(r,1800));
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',args:['--no-sandbox']});
 const p=await b.newPage({viewport:{width:600,height:330}});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:1420/?capture=1');
 await p.evaluate(async()=>{const {repo}=await import('/src/useNotes.ts');await repo.setPrefs({...await repo.getPrefs(),extraFolders:['Work','Ideas']});localStorage.setItem('pip.session.v1',JSON.stringify({access_token:'qa-local-placeholder',refresh_token:'qa-local-placeholder',expires_at:9999999999,user:{id:'qa'}}));});
 await p.reload();
 await p.route('**/functions/v1/capture-arrange',async route=>{calls++; const body=route.request().postDataJSON(); assert.equal(body.text,text); await route.fulfill({json:{answers:{title:{type:'choice',choice:'t1',confidence:.95},folder:{type:'choice',choice:'f1',confidence:.95}}}});});
 await p.locator('textarea').evaluate((el,t)=>{el.focus();const dt=new DataTransfer();dt.setData('text/plain',t);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));document.execCommand('insertText',false,t);},text);
 await p.waitForTimeout(1600);
 assert.ok(calls>=1);assert.equal(await p.locator('select').inputValue(),'Work');
 const geometry=async()=>await p.evaluate(()=>{const a=document.querySelector('textarea'),f=document.querySelector('.capture footer'),d=document.querySelector('.capture'),r=f.getBoundingClientRect();return {viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],dialog:[d.clientWidth,d.clientHeight],textarea:[a.clientWidth,a.clientHeight,a.scrollWidth,a.scrollHeight],footer:[r.top,r.bottom]};});
 for (const [w,h,name] of [[600,330,'default'],[360,280,'small'],[1000,800,'large']]) {
   await p.setViewportSize({width:w,height:h});await p.waitForTimeout(400);const g=await geometry();assert.ok(g.page[0]<=w);assert.ok(g.page[1]<=h);assert.ok(g.footer[1]<=h);assert.ok(g.textarea[3]>g.textarea[1]);assert.ok(g.textarea[2]<=g.textarea[0]);console.log(name,g);await p.locator('textarea').evaluate(el=>el.scrollTop=0);await p.screenshot({path:`./qa-artifacts/pip-after-${name}.png`});
 }
 await p.locator('textarea').evaluate(el=>el.scrollTop=el.scrollHeight); await p.screenshot({path:'./qa-artifacts/pip-after-scrolled.png'});
 assert.equal(await p.locator('textarea').inputValue(),text);
 await p.locator('select').selectOption('Ideas');
 await p.getByRole('button',{name:/Keep it/}).click();await p.waitForTimeout(900);
 const saved=await p.evaluate(async()=>{const {repo}=await import('/src/useNotes.ts');return repo.list({view:'all',query:''});});assert.equal(saved.length,1);assert.equal(saved[0].folder,'Ideas');assert.equal(saved[0].body,text);console.log('suggestion and manual override save PASS',text.length);
 // Reload, emulate service failure, then Ctrl+Enter and verify the local fallback loses no text.
 await p.reload(); await p.unroute('**/functions/v1/capture-arrange'); await p.route('**/functions/v1/capture-arrange',r=>r.fulfill({status:503,body:'Unavailable'})); await p.locator('textarea').fill(text);await p.waitForTimeout(1600);await p.locator('select').selectOption('Work');await p.locator('textarea').press('Control+Enter');await p.waitForTimeout(900);
 const fallback=await p.evaluate(async()=>{const {repo}=await import('/src/useNotes.ts');return repo.list({view:'all',query:''});});assert.equal(fallback.length,2);const n=fallback.find(n=>n.folder==='Work');assert.equal(n.title+'\n'+n.body,text);console.log('fallback and keyboard save PASS');
 await p.reload();assert.equal((await p.evaluate(async()=>{const {repo}=await import('/src/useNotes.ts');return repo.list({view:'all',query:''});})).length,2);
 await p.locator('textarea').fill('An unsaved draft\nwith another line');await p.locator('select').selectOption('Ideas');await p.locator('textarea').press('Escape'); await p.waitForTimeout(200);const drafts=await p.evaluate(async()=>{const {repo}=await import('/src/useNotes.ts');return repo.listDrafts();});assert.equal(drafts[0].folder,'Ideas');assert.equal(drafts[0].text,'An unsaved draft\nwith another line');console.log('draft dismiss PASS');
 // Render actual clipboard component independently, avoiding account and cloud side effects.
 await p.goto('http://127.0.0.1:1420/?capture=1');await p.locator('textarea').waitFor();await p.evaluate(async()=>{const React=await import('/node_modules/.vite/deps/react.js');const ReactDOM=await import('/node_modules/.vite/deps/react-dom_client.js');const createRoot=ReactDOM.createRoot ?? ReactDOM.default.createRoot;const {Clipboard}=await import('/src/components/Clipboard.tsx');const root=document.createElement('div');root.className='db';document.body.replaceChildren(root);document.documentElement.classList.remove('cap-win');createRoot(root).render((React.createElement ?? React.default.createElement)(Clipboard,{onClose:()=>{},onKept:()=>{}}));});await p.waitForTimeout(400);assert.ok(await p.getByRole('dialog',{name:'Clipboard history'}).isVisible());await p.getByRole('searchbox').fill('test');await p.screenshot({path:'./qa-artifacts/pip-clipboard.png'});console.log('clipboard browser state PASS');
 assert.deepEqual(errors,[]);await b.close();
}finally{s.kill('SIGTERM');}
