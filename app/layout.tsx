import type {Metadata} from 'next';
import Link from 'next/link';
import './globals.css';
import {DemoToolbar} from './demo/toolbar';
export const metadata:Metadata={title:'Rally · A plan that fits everyone',description:'Private choices, one studio offer, individual PayPal holds. Rally starts charging after every required payment approval is checked and confirms the booking after every payment completes.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><header className="topbar"><Link className="wordmark" href="/" aria-label="Rally home"><img src="/brand/rally-logo-v1.png" alt="" width={1774} height={887}/></Link><nav aria-label="Main navigation"><Link href="/">Explore</Link><Link href="/plans">Your plans</Link><Link href="/groups/new">New plan <span aria-hidden="true">+</span></Link></nav><span className="environment"><span aria-hidden="true"/>Demo</span></header><DemoToolbar/>{children}<footer className="footer"><div className="footer-links"><Link href="/docs">Rally guides →</Link><a href="/journey/index.html">See a recorded booking →</a></div><span>Demo studio · PayPal sandbox</span></footer></body></html>;}
