// Offline deployment setup. Preserve local and existing redirects; no email sent.
export {};
async function run(){
 if(process.env.ENABLE_HOSTED_AUTH_CONFIG!=='true')throw new Error('EXPLICIT_HOSTED_AUTH_SETUP_REQUIRED');
 const url=new URL(process.env.SUPABASE_URL??''),token=process.env.SUPABASE_MANAGEMENT_TOKEN;
 if(url.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(url.hostname)||!token?.startsWith('sbp_'))throw new Error('AUTH_MANAGEMENT_CONFIG_REQUIRED');
 const origin='https://rally.gowthamsarveswaran.com',base=`https://api.supabase.com/v1/projects/${url.hostname.split('.')[0]}`;
 const request=async(path:string,value?:unknown)=>{const r=await fetch(base+path,{method:value?'PATCH':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined});if(!r.ok)throw new Error(`AUTH_MANAGEMENT_HTTP_${r.status}`);return r.json();};
 const project=await request('');if(project.name!=='Rally'||project.status!=='ACTIVE_HEALTHY')throw new Error('AUTH_PROJECT_CHECK_FAILED');
 const health=await fetch(origin+'/api/health',{redirect:'error',signal:AbortSignal.timeout(30000)});if(!health.ok||(await health.json()).ready!==true)throw new Error('VERIFIED_DEPLOYMENT_REQUIRED');
 const before=await request('/config/auth');if(typeof before.uri_allow_list!=='string')throw new Error('AUTH_REDIRECT_SCHEMA_REQUIRED');
 const existing=before.uri_allow_list.split(',').map((s:string)=>s.trim()).filter(Boolean),next=[...new Set([...existing,origin+'/auth/callback','http://localhost:3000/auth/callback'])];
 await request('/config/auth',{site_url:origin,uri_allow_list:next.join(',')});
 const after=await request('/config/auth'),actual=after.uri_allow_list.split(',').map((s:string)=>s.trim());
 if(after.site_url!==origin||next.some(s=>!actual.includes(s)))throw new Error('AUTH_REDIRECT_AUDIT_FAILED');
 console.log(JSON.stringify({siteUrl:origin,hostedCallbackConfigured:true,existingRedirectsPreserved:true,localCallbackConfigured:true,emailsSent:0}));
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'HOSTED_AUTH_SETUP_FAILED');process.exitCode=1;}
