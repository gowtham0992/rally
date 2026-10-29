/** Invite tokens stay in request bodies; names are never trusted from URL parameters. */
export function invitationToken(next:string):string|null {
 try{const u=new URL(next,'https://rally.invalid');if(u.origin!=='https://rally.invalid'||u.pathname!=='/join')return null;
 const token=u.searchParams.get('invite');return token&&/^[a-f0-9]{64}$/.test(token)?token:null;
 }catch{return null;}
}
