import {Suspense} from 'react';
import Join from './view';
export default function Page(){return <Suspense fallback={<main className="narrow">Opening invitation…</main>}><Join/></Suspense>;}
