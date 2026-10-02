import {Suspense} from 'react';
import {Login} from './view';
export default function Page(){return <Suspense fallback={<main className="narrow"><p>Opening your group…</p></main>}><Login/></Suspense>;}
