import {authorizeSettlementTrigger,scheduledSettlement} from '../../../../src/payments/scheduled.ts';
import {applicationDatabase,payments} from '../../../../src/web/services.ts';
import {errorResponse} from '../../../../src/web/security.ts';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  authorizeSettlementTrigger(request);
  const result=await scheduledSettlement(applicationDatabase(),payments());
  return Response.json(result,{status:result.failures?503:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}
}
