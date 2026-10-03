import {verify,X509Certificate} from 'node:crypto';
import {crc32} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {ProviderError} from './types.ts';

// PayPal's documented signature message uses the exact request bytes. The CRC
// is a message component, not authentication; RSA verification provides that.
const headersSchema=z.object({
 'paypal-transmission-id':z.string().regex(/^[A-Za-z0-9-]{1,128}$/),
 'paypal-transmission-time':z.string().max(64).pipe(z.iso.datetime({offset:true})),
 'paypal-auth-algo':z.literal('SHA256withRSA'),
 'paypal-transmission-sig':z.string().min(128).max(2048).regex(/^[A-Za-z0-9+/]+={0,2}$/),
 'paypal-cert-url':z.string().max(300).refine(value=>{
  try{const u=new URL(value);return ['https://api.sandbox.paypal.com','https://api-m.sandbox.paypal.com','https://api.paypal.com','https://api-m.paypal.com'].includes(u.origin)
   &&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/v1\/notifications\/certs\/CERT-[A-Za-z0-9-]{1,180}$/.test(u.pathname);}catch{return false;}
 })
});
export function webhookHeaders(headers:Record<string,string>){return headersSchema.safeParse(headers);}
const certificateCaches=new WeakMap<typeof fetch,Map<string,{certificate:X509Certificate;until:number}>>();
async function certificate(url:string,transport:typeof fetch){
 let cache=certificateCaches.get(transport);if(!cache){cache=new Map();certificateCaches.set(transport,cache);}
 const old=cache.get(url);if(old&&old.until>Date.now())return old.certificate;
 try{
  const response=await transport(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok||Number(response.headers.get('content-length')??0)>16000||!response.body)throw new Error();
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();throw new Error();}chunks.push(value);}}
  finally{reader.releaseLock();}
  const parsed=new X509Certificate(Buffer.concat(chunks));
  if(parsed.publicKey.asymmetricKeyType!=='rsa')throw new Error();
  if(cache.size>=8)cache.delete(cache.keys().next().value!);
  cache.set(url,{certificate:parsed,until:Date.now()+3600000});return parsed;
 }catch{throw new ProviderError('WEBHOOK_CERTIFICATE_UNAVAILABLE');}
}
export async function verifyPayPalWebhook(webhookId:string,headers:Record<string,string>,event:unknown,raw:Uint8Array|undefined,transport:typeof fetch=fetch){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(webhookId))throw new ProviderError('WEBHOOK_NOT_CONFIGURED');
 const parsed=webhookHeaders(headers);if(!parsed.success||!raw||raw.byteLength>256000)return false;
 try{if(!isDeepStrictEqual(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)),event))return false;}catch{return false;}
 const h=parsed.data,signature=Buffer.from(h['paypal-transmission-sig'],'base64');
 if(signature.length<128||signature.length>1024||signature.toString('base64')!==h['paypal-transmission-sig'])return false;
 const cert=await certificate(h['paypal-cert-url'],transport),at=Date.parse(h['paypal-transmission-time']);
 // PayPal retries for days. A valid signed transmission need not be recent,
 // but its timestamp must fall inside the certificate's validity interval.
 if(at<Date.parse(cert.validFrom)||at>Date.parse(cert.validTo))return false;
 const message=`${h['paypal-transmission-id']}|${h['paypal-transmission-time']}|${webhookId}|${crc32(raw)}`;
 return verify('RSA-SHA256',Buffer.from(message,'utf8'),cert.publicKey,signature);
}
