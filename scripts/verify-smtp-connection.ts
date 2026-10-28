import tls from 'node:tls';
import {writeFile} from 'node:fs/promises';
async function run(){
 const key=process.env.RALLY_SMTP_PASSWORD;if(!key?.startsWith('re_')||key.length<20)throw Error('SMTP_PRIVATE_CONFIGURATION_REQUIRED');
 const socket=tls.connect({host:'smtp.resend.com',port:465,servername:'smtp.resend.com',rejectUnauthorized:true,minVersion:'TLSv1.2'});
 const replies:{code:number;text:string}[]=[],waiters:((v:{code:number;text:string})=>void)[]=[];let buffered='',group:string[]=[];
 socket.setTimeout(20000,()=>socket.destroy(Error('SMTP_TIMEOUT')));
 socket.on('data',chunk=>{buffered+=chunk.toString('utf8');for(;;){const i=buffered.indexOf('\r\n');if(i<0)break;const line=buffered.slice(0,i);buffered=buffered.slice(i+2);if(!/^\d{3}[ -]/.test(line))continue;group.push(line);if(line[3]===' '){const reply={code:Number(line.slice(0,3)),text:group.join('\n')};group=[];const w=waiters.shift();if(w)w(reply);else replies.push(reply);}}});
 let failed:(e:Error)=>void=()=>{};
 const failure=new Promise<never>((_,reject)=>{failed=reject;});socket.on('error',e=>failed(e));
 const next=()=>Promise.race([new Promise<{code:number;text:string}>(resolve=>{const r=replies.shift();if(r)resolve(r);else waiters.push(resolve);}),failure]);
 try{
  await Promise.race([new Promise<void>(r=>socket.once('secureConnect',()=>r())),failure]);if(!socket.authorized)throw Error('SMTP_TLS_VERIFICATION_FAILED');
  if((await next()).code!==220)throw Error('SMTP_GREETING_FAILED');socket.write('EHLO rally.gowthamsarveswaran.com\r\n');const capabilities=await next();if(capabilities.code!==250||!capabilities.text.includes('AUTH'))throw Error('SMTP_AUTH_NOT_SUPPORTED');
  socket.write('AUTH PLAIN '+Buffer.from('\0resend\0'+key).toString('base64')+'\r\n');const result=await next();if(result.code!==235)throw Error(`SMTP_AUTH_${result.code}`);
  const report={observedAt:new Date().toISOString(),host:'smtp.resend.com',port:465,tlsCertificateVerified:true,tlsProtocol:socket.getProtocol(),smtpAuthenticationVerified:true,emailsSent:0,scope:'TLS handshake and SMTP AUTH only; no MAIL, RCPT or DATA command.'};
  socket.write('QUIT\r\n');await next();await writeFile('evidence/smtp-connection-2026-10-27.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{socket.destroy();}
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'SMTP_CONNECTION_FAILED');process.exitCode=1;}
