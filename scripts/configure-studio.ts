import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {database,transaction} from '../src/db.ts';
import {catalogSchema} from '../src/planning/domain.ts';
import {fingerprint} from '../src/payments/types.ts';
// Server-only demo setup. There is deliberately no browser route that grants a
// studio role, no automatic first-user assignment, and no live PayPal setting.
const owner=z.uuid().parse(process.env.DEMO_STUDIO_OPERATOR_USER_ID);
const merchant=z.string().regex(/^[A-Z0-9]{5,127}$/).parse(process.env.PAYPAL_MERCHANT_ID);
if(process.env.ENABLE_DEMO_STUDIO_SETUP!=='true')throw new Error('EXPLICIT_DEMO_STUDIO_SETUP_REQUIRED');
const catalog=catalogSchema.parse(JSON.parse(await readFile('fixtures/studio.json','utf8')));
if(!catalog.synthetic)throw new Error('DEMO_CATALOG_REQUIRED');
const resource='willow-exclusive',setup=15,cleanup=20,pool=database();
try{
 await transaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[catalog.studioId]);
  const existing=(await c.query('SELECT * FROM merchant_studios WHERE studio_id=$1',[catalog.studioId])).rows[0];
  if(existing){if(existing.owner_user_id!==owner||existing.paypal_merchant_id!==merchant||existing.resource_id!==resource||existing.setup_minutes!==setup||existing.cleanup_minutes!==cleanup)throw new Error('EXISTING_STUDIO_CONFIGURATION_MISMATCH');}
  else await c.query('INSERT INTO merchant_studios VALUES($1,$2,$3,$4,$5,$6)',[catalog.studioId,owner,merchant,resource,setup,cleanup]);
  const version=(await c.query('SELECT catalog FROM merchant_catalog_versions WHERE studio_id=$1 AND version_id=$2',[catalog.studioId,catalog.versionId])).rows[0];
  if(version){if(fingerprint(catalogSchema.parse(version.catalog))!==fingerprint(catalog))throw new Error('PUBLISHED_CATALOG_MISMATCH');}
  else await c.query('INSERT INTO merchant_catalog_versions(studio_id,version_id,catalog) VALUES($1,$2,$3)',[catalog.studioId,catalog.versionId,JSON.stringify(catalog)]);
 });
 console.log('Demo studio and immutable catalog configured. Operator access is limited to the supplied verified account ID.');
}catch{console.error('Studio configuration failed. Check the explicit operator, sandbox merchant and existing immutable configuration.');process.exitCode=1;}finally{await pool.end();}
