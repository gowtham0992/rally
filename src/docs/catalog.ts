// Public routes are a closed list. Never discover repository Markdown at runtime.
export const publicDocs=[
 {slug:'getting-started',title:'Getting started',group:'Use Rally',description:'Start a plan, invite your friends and add what works for you.'},
 {slug:'group-booking',title:'Group booking',group:'Use Rally',description:'Find a session, agree on pickup and get the studio’s offer.'},
 {slug:'payments',title:'Payments & recovery',group:'Use Rally',description:'Understand your hold, completed charge and what happens if a payment fails.'},
 {slug:'privacy',title:'Privacy & consent',group:'Use Rally',description:'Know who sees your answers and which decisions stay yours.'},
 {slug:'ai',title:'How AI helps',group:'Under the hood',description:'A bounded helper for wording that needs a closer look.'},
 {slug:'architecture',title:'Architecture',group:'Under the hood',description:'The boundaries between planning, interpretation and payments.'},
 {slug:'verification',title:'Verification',group:'Under the hood',description:'Recorded results, their scope and what remains untested.'}
] as const;
export type PublicDoc=typeof publicDocs[number];
export function publicDoc(slug:string):PublicDoc|undefined{return publicDocs.find(d=>d.slug===slug);}
export function headingId(text:string){return text.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');}
export function docHeadings(markdown:string){return [...markdown.matchAll(/^## ([^\n]+)$/gm)].map(m=>({title:m[1],id:headingId(m[1])}));}
const publicPaths=new Set(['/', '/plans','/login','/groups/new','/docs','/journey/index.html','/evidence/ai/index.html',...publicDocs.map(d=>`/docs/${d.slug}`)]);
export function publicDocLink(value:string|undefined):string|null{
 if(!value||/[\u0000-\u0020\\]/.test(value)||value.startsWith('//'))return null;
 if(value.startsWith('#'))return /^#[a-z][a-z0-9-]*$/.test(value)?value:null;
 // These guides need only named public app routes, never arbitrary source paths,
 // remote embeds, API endpoints, file URLs or repository links.
 if(!value.startsWith('/'))return null;
 try{const u=new URL(value,'https://rally.gowthamsarveswaran.com');
  if(u.origin!=='https://rally.gowthamsarveswaran.com'||u.search||!publicPaths.has(u.pathname)||u.hash&&!/^#[a-z][a-z0-9-]*$/.test(u.hash))return null;
  return u.pathname+u.hash;
 }catch{return null;}
}
