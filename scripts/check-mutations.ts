import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const mutations = [
  {name:'noncanonical payload hash',file:'src/payments/types.ts',from:'JSON.stringify(canonical(value))',to:'JSON.stringify(value)',pattern:'three verified authorizations'},
  {name:'ownership guard removed',file:'src/payments/engine.ts',from:"if (!member) throw new DomainError('NOT_A_MEMBER',403);",to:"if (!member) throw new DomainError('WRONG_SECURITY_RESPONSE',403);",pattern:'object-level ownership'},
  {name:'expired offer accepted',file:'src/payments/engine.ts',from:"offer.state === 'OPEN' && now >= offer.deadline",to:"offer.state === 'OPEN' && false",pattern:'missing authorization at deadline'},
  {name:'failed capture ignored',file:'src/payments/engine.ts',from:"captures.some(o => o.state === 'FAILED')",to:'false',pattern:'definitive failure after a capture'},
  {name:'private resource overlap allowed',file:'db/001_payments.sql',from:"WHERE (state IN ('HELD','BOOKED'))",to:"WHERE (state = 'BOOKED')",pattern:'PostgreSQL exclusion constraint'},
  {name:'webhook signature guard removed',file:'src/payments/engine.ts',from:'!await this.provider.verifyWebhook(headers,value)',to:'false',pattern:'unverified webhook'},
  {name:'provider amount guard removed',file:'src/payments/paypal.ts',from:"value.currency_code !== 'USD' || parseMinor(value.value) !== op.payload.amountMinor",to:'false',pattern:'changed provider amount'},
  {name:'refund parent guard removed',file:'src/payments/paypal.ts',from:'url.pathname !== expected',to:'false',pattern:'same-amount refund'},
  {name:'webhook duplicate guard removed',file:'src/payments/engine.ts',from:'if (!inserted.rowCount) return {duplicate:true};',to:'if (false) return {duplicate:true};',pattern:'verified webhooks deduplicate'},
  {name:'stale worker response allowed',file:'src/payments/engine.ts',from:'if (current.lease_token !== token) return;',to:'if (false) return;',pattern:'expired worker lease'},
  {name:'private spending ceiling ignored',file:'src/planning/domain.ts',from:'p.budgetMinor>=offering.priceMinor',to:'true',pattern:'confirmed cup-making requirement'},
  {name:'essential technique relaxed',file:'src/planning/domain.ts',from:"(p.technique==='ANY'||p.technique===offering.technique)",to:'true',pattern:'wheel-essential'},
  {name:'finish deadline ignored',file:'src/planning/domain.ts',from:'(!p.latestFinishAt||Date.parse(endAt)<=Date.parse(p.latestFinishAt))',to:'true',pattern:'incompatible finish time'},
  {name:'nominee consent ignored',file:'src/planning/domain.ts',from:'!consent.nomineeAgreed',to:'false',pattern:'collection nominee requires'},
  {name:'same-day need ignored',file:'src/planning/domain.ts',from:"(!offering.requiresLaterCollection||p.collection!=='SAME_DAY_REQUIRED')",to:'true',pattern:'same-day collection'},
  {name:'unverified catalog offered',file:'src/planning/domain.ts',from:'if(!offering.verified) continue;',to:'if(false) continue;',pattern:'unverified facts'},
  {name:'private budget added to shared card',file:'src/planning/domain.ts',from:"amountMinor:offering.priceMinor,currency:'USD'",to:"amountMinor:offering.priceMinor,budgetMinor:preferences[0].budgetMinor,currency:'USD'",pattern:'confirmed cup-making requirement'},
  {name:'interpretation source evidence ignored',file:'src/planning/interpretation.ts',from:'input.text.slice(item.sourceStart,item.sourceEnd)!==item.sourceSpan',to:'false',pattern:'interpretations need exact evidence'},
];
const results=[];
for(const mutation of mutations) {
  const file=new URL(`../${mutation.file}`,import.meta.url),original=await readFile(file,'utf8');
  if (!original.includes(mutation.from)) throw new Error(`Mutation target missing: ${mutation.name}`);
  const testFile=mutation.file.includes('/planning/') ? 'test/planning.test.ts' : mutation.file.endsWith('/paypal.ts') ? 'test/paypal.test.ts' : 'test/payments.test.ts';
  const args=['--import','tsx','--test','--test-concurrency=1',`--test-name-pattern=${mutation.pattern}`,testFile];
  const baseline=spawnSync(process.execPath,args,{encoding:'utf8',timeout:20000});
  if(baseline.status!==0) throw new Error(`Unmodified targeted test failed: ${mutation.name}`);
  try {
    await writeFile(file,original.replace(mutation.from,mutation.to));
    const run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:20000});
    const output=run.stdout+run.stderr;
    const intendedFailure=output.split('\n').some(line=>/^(not ok|✖)/.test(line)&&new RegExp(mutation.pattern).test(line));
    const caught=run.status !== 0 && run.status !== null && /fail [1-9]/.test(output)&&intendedFailure;
    results.push({mutation:mutation.name,baselinePassed:true,caught,exitCode:run.status});
    console.log(`${caught ? 'CAUGHT' : 'MISSED'}: ${mutation.name}`);
  } finally {await writeFile(file,original);}
}
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('../evidence/local-mutation-results.json',import.meta.url),JSON.stringify({mode:'local_database_and_simulated_provider',results},null,2));
if(results.some(r=>!r.caught)) process.exitCode=1;
