'use client';
// One immutable viewer per document. A role switch hard-navigates; older tabs
// retain their original viewer and the server rejects requests under new cookies.
export type DocumentSession={signedIn:boolean;userId?:string;demo?:{workspaceId:string;groupId:string;role:string;displayName:string;expiresAt:string}|null};
export class SessionError extends Error {constructor(public code:string){super('Your session is unavailable. Reload this page to continue.');}}
let viewer:Promise<DocumentSession>|undefined;
export function documentSession(){return viewer??=fetch('/api/auth/session',{cache:'no-store'}).then(async r=>{
 const data=await r.json();if(!r.ok){viewer=undefined;throw new SessionError(typeof data.error==='string'?data.error:'SESSION_UNAVAILABLE');}
 return data as DocumentSession;
 }).catch(e=>{viewer=undefined;throw e;});}
export async function apiFetch(path:string,options:RequestInit={}){
 if(!path.startsWith('/api/'))throw new Error('Invalid application request');
 const session=await documentSession(),headers=new Headers(options.headers);if(session.signedIn&&session.userId)headers.set('X-Rally-Viewer',session.userId);
 const response=await fetch(path,{...options,headers,cache:'no-store'});
 if(response.status===409){const result=await response.clone().json();if(result.error==='VIEWER_CHANGED')throw new Error('You switched friends in another tab. Your edits are still here. Reload to use the current friend.');}
 return response;
}
