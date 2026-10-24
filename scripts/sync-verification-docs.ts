import {readFile,writeFile} from 'node:fs/promises';
const current=JSON.parse(await readFile('evidence/current-verification.json','utf8')) as {date:string;truthRows:{claim:string;result:string;scope:string}[]};
const section=`Verified ${current.date}. Historical provider and AI runs retain their own dates.\n\n| Claim | Result | Scope |\n| --- | --- | --- |\n${current.truthRows.map(r=>`| ${r.claim} | ${r.result} | ${r.scope} |`).join('\n')}`;
for(const path of ['README.md','evidence/README.md']){
 const source=await readFile(path,'utf8'),next=source.replace(/<!-- BEGIN CURRENT TRUTH -->[\s\S]*?<!-- END CURRENT TRUTH -->/,`<!-- BEGIN CURRENT TRUTH -->\n${section}\n<!-- END CURRENT TRUTH -->`);
 if(!source.includes('<!-- BEGIN CURRENT TRUTH -->'))throw Error('TRUTH_MARKER_REQUIRED');
 if(process.argv.includes('--check')){if(source!==next)throw Error(`VERIFICATION_DOC_DRIFT:${path}`);}else await writeFile(path,next);
}
console.log(JSON.stringify({documents:2,synchronized:true}));
