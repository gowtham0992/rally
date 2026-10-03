import type {IntakeActor} from '../intake/service.ts';
import {DomainError} from '../payments/types.ts';
export function assertWorkspaceScope(actor:IntakeActor,group:{demo_workspace_id?:string|null}){
 if((actor.demoWorkspaceId??null)!==(group.demo_workspace_id??null))throw new DomainError('NOT_FOUND',404);
}
