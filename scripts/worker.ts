import { setTimeout } from 'node:timers/promises';
import { database } from '../src/db.ts';
import { PaymentEngine } from '../src/payments/engine.ts';
import { sandboxProvider } from '../src/payments/config.ts';
import {purgeRequestLimits} from '../src/web/rate-limits.ts';
const pool=database(),engine=new PaymentEngine(pool,sandboxProvider());
let running=true;
let lastMaintenance=0;
process.on('SIGINT',()=>running=false);process.on('SIGTERM',()=>running=false);
try {
  console.log('Rally sandbox payment worker started.');
  while(running) {
    if(Date.now()-lastMaintenance>=60000){
      try{await purgeRequestLimits(pool);lastMaintenance=Date.now();}
      catch{console.error(JSON.stringify({event:'quota_maintenance_failed'}));lastMaintenance=Date.now();}
    }
    const offers=await pool.query("SELECT id FROM offers WHERE state IN ('OPEN','SETTLING') OR cleanup IN ('REQUIRED','RUNNING','ACTION_REQUIRED') ORDER BY opened_at LIMIT 100");
    for(const offer of offers.rows) {
      try {await engine.step(offer.id);} catch {console.error(JSON.stringify({event:'worker_step_failed',offerId:offer.id}));}
    }
    await setTimeout(1000);
  }
} finally {await pool.end();}
