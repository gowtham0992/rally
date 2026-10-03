import type {SupabaseClient} from '@supabase/supabase-js';
import {assertDemoAccount,demoMetadata,type DemoAccount,type DemoAccounts} from './provision.ts';

// Imported only by the offline provisioning CLI, never by application services.
export class ManagedDemoAccounts implements DemoAccounts {
 constructor(private admin:SupabaseClient){}
 private async find(email:string){
  // Bounded recovery of an unknown create outcome. Never print the user list,
  // adopt an unrelated account, reset a password, or send an invitation email.
  for(let page=1;page<=10;page++){
   const {data,error}=await this.admin.auth.admin.listUsers({page,perPage:100});
   if(error)throw new Error('DEMO_ACCOUNT_LOOKUP_FAILED');
   const matching=data.users.filter(u=>u.email===email);
   if(matching.length>1)throw new Error('DEMO_ACCOUNT_DUPLICATE');
   if(matching[0])return matching[0];
   if(data.users.length<100)return null;
  }
  throw new Error('DEMO_ACCOUNT_LOOKUP_LIMIT');
 }
 async ensure(input:Parameters<DemoAccounts['ensure']>[0]):Promise<DemoAccount>{
  let user:DemoAccount|null=null;
  if(input.existingUserId){
   const result=await this.admin.auth.admin.getUserById(input.existingUserId);
   if(result.error||!result.data.user)throw new Error('DEMO_REGISTERED_ACCOUNT_MISSING');
   user=result.data.user;
  }else{
   user=await this.find(input.email);
   if(!user){
    try{
     const result=await this.admin.auth.admin.createUser({email:input.email,password:input.password,email_confirm:true,app_metadata:demoMetadata(input.workspaceId,input.role)});
     if(!result.error)user=result.data.user;
    }catch{/* Resolve only by looking up the exact deterministic synthetic email. */}
    if(!user)user=await this.find(input.email);
    if(!user)throw new Error('DEMO_ACCOUNT_CREATE_UNRESOLVED');
   }
  }
  assertDemoAccount(user,input);return user;
 }
}
