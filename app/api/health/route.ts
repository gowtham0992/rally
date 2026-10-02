import {applicationDatabase} from '../../../src/web/services';
export const dynamic='force-dynamic';
// Only process/database readiness; provider outages do not restart the app.
export async function GET(){
 try {await applicationDatabase().query('SELECT 1');return Response.json({ready:true},{headers:{'Cache-Control':'no-store'}});}
 catch {return Response.json({ready:false},{status:503,headers:{'Cache-Control':'no-store'}});}
}
