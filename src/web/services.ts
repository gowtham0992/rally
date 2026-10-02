import 'server-only';
import {database} from '../db.ts';
import {ClarificationService} from '../intake/clarifications.ts';
import {IntakeService} from '../intake/service.ts';
import {catalogSchema} from '../planning/domain.ts';
import fixture from '../../fixtures/studio.json';
// The browser cannot choose prices or pass a catalog. This is a labeled synthetic
// studio until real merchant onboarding/validation provides a published catalog.
export const publicCatalog=catalogSchema.parse(fixture);
const globalDb=globalThis as typeof globalThis&{rallyPool?:ReturnType<typeof database>};
export function applicationDatabase(){return globalDb.rallyPool??=database();}
export function intake(){return new IntakeService(applicationDatabase());}

export function clarifications(){return new ClarificationService(applicationDatabase());}
