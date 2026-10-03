import type {Metadata} from 'next';
import Link from 'next/link';
import './globals.css';
import {DemoToolbar} from './demo/toolbar';
export const metadata:Metadata={title:'Rally · A plan that fits everyone',description:'Find a studio experience your whole group can agree to, then book with everyone paying their own share.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><header className="topbar"><Link className="wordmark" href="/" aria-label="Rally home"><img src="/brand/rally-logo-v1.png" alt="" width={1774} height={887}/></Link><nav aria-label="Main navigation"><Link href="/">Explore</Link><Link href="/groups/new">New plan <span aria-hidden="true">+</span></Link></nav><span className="environment"><span aria-hidden="true"/>Demo</span></header><DemoToolbar/>{children}<footer className="footer"><span>Made for your group.</span><span>Demo studio · PayPal sandbox</span></footer></body></html>;}
