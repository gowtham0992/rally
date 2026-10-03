'use client';
import {useEffect,useState} from 'react';
import {apiFetch,documentSession,type DocumentSession} from '../lib/api-fetch';
import {demoRoles} from '../../src/demo/roles';
export function DemoToolbar(){
 const [demo,setDemo]=useState<DocumentSession['demo']>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[changed,setChanged]=useState(false);
 useEffect(()=>{let active=true;documentSession().then(s=>{if(active)setDemo(s.demo??null);}).catch(e=>{if(active&&['VIEWER_CHANGED','DEMO_SESSION_EXPIRED','DEMO_SESSION_REQUIRED'].includes(e.code))setChanged(true);});return()=>{active=false;};},[]);
 async function change(role:string){if(busy||role===demo?.role)return;setBusy(true);setError('');try{const r=await apiFetch('/api/demo/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})}),p=await r.json();if(!r.ok)throw new Error('Could not switch friends. Your current view is still here.');location.assign(p.next);}catch(e){setError(e instanceof Error?e.message:'Could not switch friends.');}finally{setBusy(false);}}
 async function exit(){setBusy(true);setError('');try{const r=await fetch('/api/demo/exit',{method:'POST'});if(!r.ok)throw new Error('Could not exit this demo. Try again.');location.assign('/');}catch(e){setError(e instanceof Error?e.message:'Could not exit this demo.');setBusy(false);}}
 if(changed)return <aside className="demo-bar" aria-label="Demo session"><span>This demo session changed.</span><a className="text-button" href="/demo">Continue with the current friend →</a></aside>;
 if(!demo)return null;
 return <aside className="demo-bar" aria-label="Demo friends"><div><span className="demo-caption">Fictional group</span><label htmlFor="demo-role">Viewing as</label></div><select id="demo-role" value={demo.role} disabled={busy} onChange={e=>void change(e.target.value)}>{Object.entries(demoRoles).map(([role,name])=><option key={role} value={role}>{name}{role==='ORGANIZER'?' · Organizer':role==='STUDIO'?' · Studio':''}</option>)}</select><button className="text-button demo-exit" disabled={busy} onClick={exit}>Exit demo</button>{error&&<p className="error demo-error" role="alert">{error}</p>}</aside>;
}
