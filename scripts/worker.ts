import { setTimeout } from 'node:timers/promises';
import { database } from '../src/db.ts';
import { PaymentEngine } from '../src/payments/engine.ts';
import { sandboxProvider } from '../src/payments/config.ts';
const pool=database(),engine=new PaymentEngine(pool,sandboxProvider());
let running=true;
process.on('SIGINT',()=>running=false);process.on('SIGTERM',()=>running=false);
try {
  console.log('Rally sandbox payment worker started.');
  while(running) {
    const offers=await pool.query("SELECT id FROM offers WHERE state IN ('OPEN','SETTLING') OR cleanup IN ('REQUIRED','RUNNING','ACTION_REQUIRED') ORDER BY opened_at LIMIT 100");
    for(const offer of offers.rows) {
      try {await engine.step(offer.id);} catch {console.error(JSON.stringify({event:'worker_step_failed',offerId:offer.id}));}
    }
    await setTimeout(1000);
  }
} finally {await pool.end();}
