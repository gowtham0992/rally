'use client';
import {usePathname} from 'next/navigation';
import {publicDocs} from '../../src/docs/catalog';
export default function DocsNavigation(){
 const path=usePathname();
 return <nav aria-label="Documentation"><a className="docs-overview-link" href="/docs" aria-current={path==='/docs'?'page':undefined}>Overview</a>{['Use Rally','Under the hood'].map(group=><div className="docs-nav-group" key={group}><p>{group}</p><ul>{publicDocs.filter(d=>d.group===group).map(d=><li key={d.slug}><a href={`/docs/${d.slug}`} aria-current={path===`/docs/${d.slug}`?'page':undefined}>{d.title}</a></li>)}</ul></div>)}<a className="docs-back" href="/">Back to Rally <span aria-hidden="true">↗</span></a></nav>;
}
