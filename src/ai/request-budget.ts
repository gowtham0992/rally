import type pg from 'pg';
import {clarify,type Clarification} from './clarifier.ts';
import {RequestLimiter,rateLimitKey} from '../web/rate-limits.ts';
// Called only after persistent clarification ownership and consent checks.
// A quota denial is caught by intake as review, with saved choices intact.
type ClarifierInput={revisionId:string;text:string;catalog:unknown};
export function budgetedClarifier(pool:pg.Pool,model:(input:ClarifierInput)=>Promise<Clarification>=clarify,key:()=>string=rateLimitKey){
 return async(input:ClarifierInput)=>{
  await new RequestLimiter(pool,key()).reserve('MODEL_GLOBAL','application');
  return model(input);
 };
}
