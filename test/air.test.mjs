import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
test('air: closed, timer, manual off, persisted cap and pending judge; no public admin',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'duck-air-'));let count=0,app,base
  const provider=createServer(async(req,res)=>{for await(const _ of req){};count++;res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({reply:'Ответ персонажа',emotion:'smug',intensity:.5,memory:'память',winner:'duck'})}}]}))}).listen(0,'127.0.0.1');await once(provider,'listening')
  async function start(){app=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',DUCK_STATE_DIR:dir,CAT_DUCK_API_KEY:'fixture',CAT_DUCK_MODEL:'fixture',CAT_DUCK_API_BASE:`http://127.0.0.1:${provider.address().port}`,DUCK_DAILY_CALL_LIMIT:'4'}});const [out]=await once(app.stdout,'data');base=out.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0]}
  async function stop(){app.kill();await once(app,'exit')}
  t.after(async()=>{if(app.exitCode===null)await stop();provider.close();rmSync(dir,{recursive:true,force:true,maxRetries:3})})
  const post=(path,data,headers={})=>fetch(base+path,{method:'POST',body:JSON.stringify(data),headers});const on=(minutes,dailyLimit)=>post('/internal/air',{minutes,dailyLimit});
  const turn={kind:'reply',history:[{role:'cat',text:'Выпад'}],memory:'',score:null,duel:'a'.repeat(36),round:'b'.repeat(36)}
  await start();await fetch(base);assert.equal(count,0);assert.equal((await post('/api/turn',turn)).status,503);assert.equal(count,0)
  assert.equal((await post('/internal/air',{minutes:2},{'x-forwarded-for':'1.2.3.4'})).status,403)
  await on(1);assert.equal((await post('/api/turn',turn)).status,200);assert.equal(count,1)
  await on(0);assert.equal((await post('/api/judge',{duel:turn.duel,round:turn.round})).status,503);assert.equal(count,1)
  await stop();await start();assert.equal((await(await fetch(base+'/api/config')).json()).air.open,false)
  await on(.001);await new Promise(r=>setTimeout(r,90));assert.equal((await post('/api/raccoon',{history:[{role:'cat',text:'Судья?'}]})).status,503);assert.equal(count,1)
  await on(1);assert.equal((await post('/api/judge',{duel:turn.duel,round:turn.round})).status,200);assert.equal(count,2)
  assert.equal((await post('/api/raccoon',{history:[{role:'cat',text:'Судья?'}]})).status,200);assert.equal(count,3)
  await on(1,3);assert.equal((await post('/api/raccoon',{history:[{role:'cat',text:'Ещё?'}]})).status,429);assert.equal(count,3)
  await stop();await start();assert.equal((await(await fetch(base+'/api/config')).json()).air.calls,3);assert.equal((await post('/api/raccoon',{history:[{role:'cat',text:'Ещё?'}]})).status,429);assert.equal(count,3)
  assert.equal((await post('/api/turn',{...turn,memory:'x'.repeat(30000)})).status,400)
  await stop();const db=new DatabaseSync(join(dir,'air.sqlite'));db.exec('DELETE FROM air');db.close();await start();assert.equal((await(await fetch(base+'/api/config')).json()).air.open,false);assert.equal((await post('/api/raccoon',{history:[{role:'cat',text:'Ещё?'}]})).status,503);assert.equal(count,3)
})
