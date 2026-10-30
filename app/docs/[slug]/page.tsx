import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {publicDocs,publicDoc} from '../../../src/docs/catalog';
import {readPublicDoc} from '../../../src/docs/content';
import PublicMarkdown from '../markdown';
// Known guides are prerendered. Unknown slugs only render the docs 404;
// readPublicDoc rejects them before any filesystem access.
export const dynamicParams=true;
export function generateStaticParams(){return publicDocs.map(d=>({slug:d.slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{const {slug}=await params,d=publicDoc(slug);if(!d)notFound();return {title:`${d.title} · Rally guides`,description:d.description};}
export default async function Guide({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params,doc=await readPublicDoc(slug);if(!doc)notFound();const {entry,markdown,headings,minutes}=doc,index=publicDocs.findIndex(d=>d.slug===slug),previous=index>0?publicDocs[index-1]:null,next=publicDocs[index+1];
 return <div className="docs-reading"><article className="docs-article"><header><p className="eyebrow">{entry.group}<span aria-hidden="true"> · </span><span className="docs-read-time">{minutes} min read</span></p><h1>{entry.title}</h1><p className="docs-article-description">{entry.description}</p></header><div className="docs-prose"><PublicMarkdown>{markdown}</PublicMarkdown></div><nav className="docs-pagination" aria-label="Next guide"><a href={previous?`/docs/${previous.slug}`:'/docs'}><span>Previous</span><strong><span aria-hidden="true">← </span>{previous?.title??'Overview'}</strong></a>{next&&<a href={`/docs/${next.slug}`}><span>Next</span><strong>{next.title}<span aria-hidden="true"> →</span></strong></a>}</nav><p className="docs-article-footnote">Rally sandbox · Fictional studio · Individual approvals</p></article><aside className="docs-toc"><nav aria-label="On this page"><p>On this page</p><ul>{headings.map(h=><li key={h.id}><a href={`#${h.id}`}>{h.title}</a></li>)}</ul></nav></aside></div>;
}
