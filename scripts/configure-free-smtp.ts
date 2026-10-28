import {readFile,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fields=['smtp_host','smtp_port','smtp_user','smtp_pass','smtp_admin_email','smtp_sender_name','rate_limit_email_sent'] as const;
async function run(){
 if(process.env.ENABLE_RALLY_SMTP_SETUP!=='true')throw Error('EXPLICIT_SMTP_SETUP_REQUIRED');
 const checkpoint='evidence/private/hosted-role-checkpoint.json';if(((await stat(checkpoint)).mode&0o777)!==0o600)throw Error('PRIVATE_CHECKPOINT_MODE_REQUIRED');
 const saved=JSON.parse(await readFile(checkpoint,'utf8')),projectUrl=new URL(process.env.SUPABASE_URL??''),token=process.env.SUPABASE_MANAGEMENT_TOKEN;
 if(projectUrl.protocol!=='https:'||projectUrl.hostname!==`${saved.ref}.supabase.co`||!token?.startsWith('sbp_'))throw Error('SMTP_PROJECT_CHECKPOINT_MISMATCH');
 const password=process.env.RALLY_SMTP_PASSWORD,from=process.env.RALLY_SMTP_FROM;
 if(!password?.startsWith('re_')||password.length<20||from!=='signin@mail.rally.gowthamsarveswaran.com')throw Error('SMTP_PRIVATE_CONFIGURATION_REQUIRED');
 const endpoint=`https://api.supabase.com/v1/projects/${saved.ref}`,request=async(path:string,value?:unknown)=>{const r=await fetch(endpoint+path,{method:value?'PATCH':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok){await writeFile('evidence/private/smtp-config-error.json',await r.text(),{mode:0o600});throw Error(`SMTP_CONFIG_HTTP_${r.status}`);}return r.json();};
 const project=await request('');if(project.name!=='Rally'||project.status!=='ACTIVE_HEALTHY')throw Error('SMTP_PROJECT_CHECK_FAILED');
 const before=await request('/config/auth');
 if(before.smtp_host&&!(before.smtp_host==='smtp.resend.com'&&before.smtp_admin_email===from))throw Error('EXISTING_SMTP_REVIEW_REQUIRED');
 if(before.external_email_enabled!==true||before.mailer_autoconfirm!==false)throw Error('EMAIL_IDENTITY_PROTECTION_REQUIRED');
 const patch={smtp_host:'smtp.resend.com',smtp_port:'465',smtp_user:'resend',smtp_pass:password,smtp_admin_email:from,smtp_sender_name:'Rally',rate_limit_email_sent:30};
 const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),unrelated=(v:Record<string,unknown>)=>Object.fromEntries(Object.entries(v).filter(([k])=>!(fields as readonly string[]).includes(k)));
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,provider:'Resend',smtpHost:patch.smtp_host,port:465,from,senderName:'Rally',authEmailLimitPerHour:30,changedFields:fields,emailVerificationPreserved:true,emailsSent:0}));return;}
 const backup='evidence/private/smtp-before.json';await writeFile(backup,JSON.stringify({ref:saved.ref,values:Object.fromEntries(fields.map(k=>[k,before[k]??null]))},null,2)+'\n',{mode:0o600,flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 await request('/config/auth',patch);const after=await request('/config/auth');
 if(after.smtp_host!==patch.smtp_host||Number(after.smtp_port)!==465||after.smtp_user!=='resend'||after.smtp_admin_email!==from||after.smtp_sender_name!=='Rally'||Number(after.rate_limit_email_sent)!==30||digest(unrelated(before))!==digest(unrelated(after)))throw Error('SMTP_CONFIG_AUDIT_FAILED');
 const report={observedAt:new Date().toISOString(),provider:'Resend',providerPlan:'Free',smtpHost:patch.smtp_host,port:465,from,senderName:'Rally',authEmailLimitPerHour:30,allOtherAuthSettingsUnchanged:true,emailVerificationPreserved:true,magicLinkTemplatesPreserved:true,credentialsStored:'Supabase private Auth configuration; ignored local .env.smtp only',credentialsInAppRuntime:false,emailsSentBySetup:0,deliveryVerified:false};
 await writeFile('evidence/free-smtp-setup-2026-10-27.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'FREE_SMTP_SETUP_FAILED');process.exitCode=1;}
