import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
test('sliding visitor limit counts reservations, not page views',()=>{const dir=mkdtempSync(join(tmpdir(),'duck-rate-'));try{const code=`import { controlAir,reserveCall,airStatus } from './air.mjs';controlAir(1);reserveCall('visitor-a');try { reserveCall('visitor-a'); process.exit(2) } catch(e) { if(e.status!==429) throw e } reserveCall('visitor-b');if(airStatus().calls!==2)process.exit(3)`;const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,DUCK_STATE_DIR:dir,DUCK_VISITOR_CALLS_PER_MINUTE:'1'}});assert.equal(result.status,0,result.stderr.toString())}finally{rmSync(dir,{recursive:true,force:true,maxRetries:3})}})
