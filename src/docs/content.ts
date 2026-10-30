import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {publicDoc,docHeadings} from './catalog.ts';
export async function readPublicDoc(slug:string){
 const entry=publicDoc(slug);if(!entry)return null;
 // Only the matched manifest entry chooses a filename. URL text is never a path.
 const markdown=await readFile(join(process.cwd(),'docs','site',`${entry.slug}.md`),'utf8');
 return {entry,markdown,headings:docHeadings(markdown),minutes:Math.max(1,Math.ceil(markdown.split(/\s+/).length/200))};
}
