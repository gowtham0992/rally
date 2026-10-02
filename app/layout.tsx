import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Rally · A plan that fits everyone',description:'Find a studio experience your whole group can agree to, then book with everyone paying their own share.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><header className="topbar"><a className="wordmark" href="/" aria-label="Rally home">rally<span className="brand-dot">.</span></a><span className="environment"><span aria-hidden="true"/>Demo</span></header>{children}<footer className="footer"><span>See you there.</span><span>Demo studio · PayPal sandbox</span></footer></body></html>;}
