import {applicationDatabase} from '../../../src/web/services';
import {rateLimitKey} from '../../../src/web/rate-limits';
import {migrationVersions} from '../../../src/migrations';
export const dynamic='force-dynamic';
// Only process/database readiness; provider outages do not restart the app.
export async function GET(){
 try {rateLimitKey();const result=await applicationDatabase().query('SELECT 1 FROM schema_migrations WHERE version=$1',[migrationVersions.at(-1)]);if(result.rowCount!==1)throw new Error('MIGRATION_REQUIRED');return Response.json({ready:true},{headers:{'Cache-Control':'no-store'}});}
 catch {return Response.json({ready:false},{status:503,headers:{'Cache-Control':'no-store'}});}
}
