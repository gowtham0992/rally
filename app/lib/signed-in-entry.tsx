'use client';
import Link from 'next/link';
import {useResource} from './use-resource';
import StudioOptions from '../components/studio-options';
import {catalogSchema} from '../../src/planning/domain';
import fixture from '../../fixtures/studio.json';
const catalog=catalogSchema.parse(fixture);
export default function SignedInEntry({next,children}:{next:string;children:React.ReactNode}){
 const {data,loading,error,refresh}=useResource<{signedIn:boolean}>('/api/auth/session',next);
 if(loading||error||!data?.signedIn)return <main className="entry-layout"><section><p className="eyebrow">Plans with friends</p><h1 className="page-title">Pottery with friends.</h1><p className="muted">Find a session that works for your group. Your spending limit stays private, and everyone approves their own share.</p><StudioOptions catalog={catalog}/></section><section className="entry-action" aria-label="Continue to your plan">
  <h2>{next.startsWith('/join?')?'Your invitation starts here.':'Bring your people.'}</h2><p className="muted">Sign in, choose the name your friends will see, then add what works for you.</p>
  {loading?<p className="field-help" aria-busy="true">Checking your sign-in…</p>:error?<><p className="error" role="alert">{error}</p><button className="secondary full" onClick={refresh}>Try again</button></>:<Link className="button full" href={`/login?next=${encodeURIComponent(next)}`}>{next.startsWith('/join?')?'Continue to your invitation':'Start your plan'} <span aria-hidden="true">→</span></Link>}
  <p className="field-help">Checking options doesn’t authorize a payment. You’ll review the studio’s exact offer before approving your share.</p>
 </section></main>;
 return children;
}
