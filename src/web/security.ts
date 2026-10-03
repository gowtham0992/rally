import { z } from 'zod';
export class WebError extends Error {constructor(public code:string,public status=400){super(code);}}
export function appOrigin(value=process.env.APP_ORIGIN){
 if(!value)throw new WebError('SETUP_REQUIRED',503);
 const url=new URL(value);
 if(url.origin!==value||url.username||url.password||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new WebError('SETUP_REQUIRED',503);
 return value;
}
export function sameOrigin(request:Request,origin=appOrigin()){
 if(request.headers.get('origin')!==origin)throw new WebError('REQUEST_NOT_ALLOWED',403);
 const site=request.headers.get('sec-fetch-site');if(site&&site!=='same-origin')throw new WebError('REQUEST_NOT_ALLOWED',403);
}
export function safeNext(value:unknown):string {
 return typeof value==='string'&&/^\/(?!\/)[A-Za-z0-9/_?=&%-]*$/.test(value)&&value.length<512?value:'/';
}
export async function rawJsonBody(request:Request,maxBytes=12000){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new WebError('JSON_REQUIRED',415);
 // Bound streamed input as well as Content-Length; private wording is never logged.
 if(Number(request.headers.get('content-length')??0)>maxBytes)throw new WebError('REQUEST_TOO_LARGE',413);
 const reader=request.body?.getReader();if(!reader)throw new WebError('INVALID_REQUEST');
 let bytes=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBytes){await reader.cancel();throw new WebError('REQUEST_TOO_LARGE',413);}chunks.push(value);}}
 finally{reader.releaseLock();}
 try{const raw=Buffer.concat(chunks);return {value:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),raw};}catch{throw new WebError('INVALID_REQUEST');}
}
export async function body(request:Request){return (await rawJsonBody(request)).value;}
export function errorResponse(error:unknown){
 if(error instanceof WebError){
  const headers:Record<string,string>={'Cache-Control':'no-store'};
  if(error.status===429&&'retryAfter' in error&&Number.isSafeInteger(error.retryAfter)&&Number(error.retryAfter)>0)headers['Retry-After']=String(error.retryAfter);
  return Response.json({error:error.code},{status:error.status,headers});
 }
 if(error instanceof z.ZodError)return Response.json({error:'INVALID_REQUEST'},{status:400,headers:{'Cache-Control':'no-store'}});
 const code=error instanceof Error&&'code' in error?String(error.code):'';
 const allowed=['NOT_FOUND','STALE_REVISION','COMMAND_CONFLICT','PLANNING_LOCKED','ROSTER_CLOSED','INVALID_ROSTER','GROUP_FULL','UNKNOWN_SLOT','INVALID_NOMINEE','VERIFIED_IDENTITY_REQUIRED','COLLECTION_REVIEW_REQUIRED','OWNER_CONSENT_REQUIRED','DISCLOSURE_REQUIRED','CONSENT_REVOKED','STALE_PREFERENCE','NO_COLLECTION_ARRANGEMENT','NO_NOTE','NOTE_TOO_LONG','NOTE_ALREADY_REVIEWED','CLARIFICATION_LIMIT','STALE_CLARIFICATION','INVALID_ANSWER','STALE_PLANNING','NO_VALID_CANDIDATE','UNVERIFIED_CATALOG','SESSION_TOO_SOON','RESERVATION_CONFLICT','OFFER_CLOSED','STALE_OFFER','STALE_ACCEPTANCE','ORDER_NOT_READY','CANCELLATION_REVIEW_REQUIRED','NOT_A_MEMBER','OFFER_NOT_FOUND','PAYMENT_CHECK_UNAVAILABLE'];
 if([...allowed,'PAYMENT_RECOVERY_REQUIRED'].includes(code))return Response.json({error:code},{status:['NOT_FOUND','OFFER_NOT_FOUND'].includes(code)?404:code==='NOT_A_MEMBER'?403:['NO_VALID_CANDIDATE','UNVERIFIED_CATALOG','SESSION_TOO_SOON'].includes(code)?422:409,headers:{'Cache-Control':'no-store'}});
 // No raw database/provider error, payload or credential crosses the HTTP boundary.
 return Response.json({error:'TEMPORARILY_UNAVAILABLE'},{status:503,headers:{'Cache-Control':'no-store'}});
}
