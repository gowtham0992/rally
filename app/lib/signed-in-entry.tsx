'use client';
import Link from 'next/link';
import {useResource} from './use-resource';
export default function SignedInEntry({next,children}:{next:string;children:React.ReactNode}){
 const {data,loading,error,refresh}=useResource<{signedIn:boolean}>('/api/auth/session',next);
 if(loading)return <main className="narrow"><section className="card" aria-busy="true"><p>Opening your plan…</p></section></main>;
 if(error)return <main className="narrow"><section className="card"><p className="error" role="alert">{error}</p><button className="secondary" onClick={refresh}>Try again</button></section></main>;
 if(!data?.signedIn)return <main className="narrow"><section className="card"><p className="eyebrow">Plans with friends</p><h1 className="page-title">Let’s get you in.</h1><p className="muted">Sign in first. Then choose the name your friends will see.</p><Link className="button full" href={`/login?next=${encodeURIComponent(next)}`}>Sign in to continue →</Link></section></main>;
 return children;
}
