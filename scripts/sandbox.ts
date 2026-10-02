import { randomUUID } from 'node:crypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { database,localDatabaseUrl } from '../src/db.ts';
import { PaymentEngine } from '../src/payments/engine.ts';
import { createSandboxOffer } from '../src/payments/fixtures.ts';
import { PayPalSandbox } from '../src/payments/paypal.ts';
import type { Operation,Observation } from '../src/payments/types.ts';

const action = process.argv[2] ?? 'doctor';
const required = ['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_MERCHANT_ID','PAYPAL_BUYER_IDS'];
if (action === 'doctor') {
  console.log('Rally sandbox configuration (values are never printed):');
  for (const key of required) console.log(`${key}: ${process.env[key] ? 'configured' : 'missing'}`);
  console.log('DATABASE_URL:',process.env.DATABASE_URL ? 'configured' : 'using localhost test database');
  process.exit(required.every(k=>process.env[k]) ? 0 : 2);
}
if (!['init','authorize','step','status','evidence','partial-failure','lost-response'].includes(action)) throw new Error('Unknown sandbox command');
if (required.some(k=>!process.env[k])) throw new Error('Sandbox configuration is incomplete. Run npm run sandbox -- doctor.');
const buyers = process.env.PAYPAL_BUYER_IDS!.split(',').map(v=>v.trim());
if (buyers.length !== 3 || new Set(buyers).size !== 3 || buyers.some(v=>!/^[A-Za-z0-9_-]+$/.test(v))) throw new Error('PAYPAL_BUYER_IDS requires three distinct sandbox payer IDs');
const pool = database(process.env.DATABASE_URL ?? localDatabaseUrl);
const provider = new PayPalSandbox({clientId:process.env.PAYPAL_CLIENT_ID!,clientSecret:process.env.PAYPAL_CLIENT_SECRET!,merchantId:process.env.PAYPAL_MERCHANT_ID!,webhookId:process.env.PAYPAL_WEBHOOK_ID});
const engine = new PaymentEngine(pool,provider);
const directory = new URL('../evidence/private/',import.meta.url);
const sessionPath = new URL('sandbox-session.json',directory);
const sessionSchema = z.object({id:z.uuid(),hash:z.string().length(64),members:z.array(z.object({id:z.uuid(),userId:z.uuid(),ordinal:z.number()})).length(3)});
try {
  await mkdir(directory,{recursive:true,mode:0o700});
  if (action === 'init') {
    // Do not abandon unresolved balances when starting another run.
    const existing = await pool.query("SELECT id FROM offers WHERE state IN ('OPEN','SETTLING') OR cleanup IN ('REQUIRED','RUNNING','ACTION_REQUIRED') LIMIT 1");
    if (existing.rowCount) throw new Error('An existing sandbox run is still open or has unresolved financial cleanup. Finish it before creating another run.');
    const session = await createSandboxOffer(pool,{merchantId:process.env.PAYPAL_MERCHANT_ID!});
    await writeFile(sessionPath,JSON.stringify(session,null,2),{mode:0o600});
    for (const member of session.members) {
      await engine.accept({commandId:randomUUID(),offerId:session.id,actorId:member.userId,offerHash:session.hash});
      await engine.step(session.id);
      const status = await engine.participantStatus(session.id,member.userId);
      console.log(`Buyer ${member.ordinal+1}:`,status.approvalUrl ?? status.payment);
    }
    console.log('Approve each URL using the corresponding distinct sandbox personal account. Then run authorize.');
  } else {
    const session = sessionSchema.parse(JSON.parse(await readFile(sessionPath,'utf8')));
    if (action === 'authorize') {
      for (const member of session.members) {
        await engine.authorize({commandId:randomUUID(),offerId:session.id,actorId:member.userId,offerHash:session.hash});
        await engine.step(session.id);
      }
      const actual = (await pool.query('SELECT ordinal,payer_id,qualified_at FROM offer_members WHERE offer_id=$1 ORDER BY ordinal',[session.id])).rows;
      if (actual.some((m,i)=>m.payer_id !== buyers[i] || !m.qualified_at)) throw new Error('Buyer identities or authorization qualification did not match the configured sandbox accounts. Do not start settlement; inspect status.');
      console.log('Three buyer identities and authorizations verified. No captures dispatched yet.');
    }
    if (action === 'partial-failure') {
      const captures = await pool.query("SELECT 1 FROM payment_operations WHERE offer_id=$1 AND kind='CAPTURE'",[session.id]);
      if (captures.rowCount) throw new Error('Partial-failure scenario requires a fresh, fully authorized run with no captures yet.');
      await engine.step(session.id); // Deliberate barrier: capture A, then stop the worker.
      const first = (await pool.query("SELECT state FROM payment_operations WHERE member_id=$1 AND kind='CAPTURE'",[session.members[0].id])).rows[0];
      if (first?.state !== 'SUCCEEDED') throw new Error('First capture has not verified completion. Reconcile before fault injection.');
      const authorization = (await pool.query('SELECT authorization_id FROM offer_members WHERE id=$1',[session.members[1].id])).rows[0].authorization_id;
      const payload = {merchantId:process.env.PAYPAL_MERCHANT_ID!,amountMinor:4800,currency:'USD' as const,offerId:session.id,memberId:session.members[1].id,referenceId:session.members[1].id,parentId:authorization};
      const faultId=randomUUID();
      const fault:Operation = {id:faultId,offer_id:session.id,member_id:session.members[1].id,kind:'VOID',state:'PLANNED',request_id:randomUUID(),payload,payload_hash:'sandbox_fault',provider_id:null,provider_status:null,approval_url:null,dispatched_at:null,retry_until:null,lease_token:null,lease_until:null};
      // The normal cleanup planner will later reconcile the already voided authorization.
      const result = await provider.execute(fault);
      await writeFile(new URL(`fault-${faultId}.json`,directory),JSON.stringify({label:'Sandbox fault: authorization deliberately canceled',offerId:session.id,result},null,2),{mode:0o600});
      if (result.outcome !== 'success') throw new Error('Fault authorization void is not verified. Stop and reconcile.');
      console.log('Sandbox fault: authorization deliberately canceled after the first completed capture.');
      for (let i=0;i<20;i++) if (!await engine.step(session.id)) break;
    }
    if (action === 'lost-response') {
      const capture = await pool.query("SELECT 1 FROM payment_operations WHERE offer_id=$1 AND kind='CAPTURE'",[session.id]);
      if (capture.rowCount) throw new Error('Lost-response scenario requires a fresh authorized run with no captures.');
      let dropped=false;
      const wrapper = {mode:provider.mode,retentionMs:provider.retentionMs.bind(provider),observe:provider.observe.bind(provider),
        execute:async(op:Operation):Promise<Observation> => {
          const result=await provider.execute(op);
          if (op.kind === 'CAPTURE' && result.outcome === 'success' && !dropped) {
            await writeFile(new URL(`local-fault-${session.id}.json`,directory),JSON.stringify({label:'Local fault: successful provider response deliberately dropped',offerId:session.id,operationId:op.id,observedResult:result},null,2),{mode:0o600});
            dropped=true;throw new Error('Local fault: successful provider response deliberately dropped');
          }
          return result;
        }};
      await new PaymentEngine(pool,wrapper).step(session.id);
      if(!dropped) throw new Error('Capture did not complete successfully; dropped-response fault was not injected.');
      console.log('Local fault: successful provider response deliberately dropped.');
      for(let i=0;i<20;i++) if(!await engine.step(session.id)) break;
    }
    if (action === 'step') await engine.step(session.id);
    if (action === 'evidence') {
      const [offer,operations,events] = await Promise.all([
        pool.query('SELECT id,state,cleanup,amount_minor,currency,deadline,reservation_end FROM offers WHERE id=$1',[session.id]),
        pool.query('SELECT id,kind,state,request_id,provider_id,provider_status,safe_code,dispatched_at,updated_at FROM payment_operations WHERE offer_id=$1 ORDER BY created_at',[session.id]),
        pool.query('SELECT event_type,state,operation_id,occurred_at FROM payment_events WHERE offer_id=$1 ORDER BY seq',[session.id])]);
      await writeFile(new URL(`run-${session.id}.json`,directory),JSON.stringify({mode:'actual_paypal_sandbox',status:'requires_manual_review',offer:offer.rows[0],operations:operations.rows,events:events.rows},null,2),{mode:0o600});
      console.log('Sanitized evidence written under ignored evidence/private/. Review before sharing.');
    }
    for (const member of session.members) console.log(`Buyer ${member.ordinal+1}:`,JSON.stringify(await engine.participantStatus(session.id,member.userId)));
  }
} catch(error) {
  // No raw provider payloads, secrets, SQL connection details or buyer emails.
  console.error(error instanceof Error ? error.message : 'Sandbox command failed');process.exitCode=1;
} finally {await pool.end();}
