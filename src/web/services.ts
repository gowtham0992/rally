import 'server-only';
import {database} from '../db.ts';
import {PaymentEngine} from '../payments/engine.ts';
import {sandboxProvider} from '../payments/config.ts';
import {BookingService} from '../bookings/service.ts';
import {workerClarifier} from '../ai/worker-client.ts';
import {MessageDraftService} from '../intake/message-drafts.ts';
import {clarify} from '../ai/clarifier.ts';
import {ClarificationService} from '../intake/clarifications.ts';
import {budgetedClarifier} from '../ai/request-budget.ts';
import {IntakeService} from '../intake/service.ts';
import {StudioQuestionService} from '../intake/studio-questions.ts';
import {draftStudioQuestion,workerQuestionDrafter} from '../ai/studio-question.ts';
import {RequestLimiter,rateLimitKey} from './rate-limits.ts';
import {catalogSchema} from '../planning/domain.ts';
import fixture from '../../fixtures/studio.json';
// The browser cannot choose prices or pass a catalog. This is a labeled synthetic
// studio until real merchant onboarding/validation provides a published catalog.
export const publicCatalog=catalogSchema.parse(fixture);
const globalDb=globalThis as typeof globalThis&{rallyPool?:ReturnType<typeof database>};
export function applicationDatabase(){return globalDb.rallyPool??=database();}
export function intake(){return new IntakeService(applicationDatabase());}
export function studioQuestions(){const pool=applicationDatabase();return new StudioQuestionService(pool,async input=>{
 await new RequestLimiter(pool,rateLimitKey()).reserve('MODEL_GLOBAL','application');
 return process.env.RALLY_AI_WORKER_URL?workerQuestionDrafter()(input):draftStudioQuestion(input);
},process.env.RALLY_STUDIO_QUESTION_AI_ENABLED==='true',process.env.RALLY_STUDIO_QUESTIONS_ENABLED!=='false');}

export function clarifications(){
 const pool=applicationDatabase();
 return new ClarificationService(pool,budgetedClarifier(pool,process.env.RALLY_AI_WORKER_URL?workerClarifier('CLARIFICATION'):clarify));
}

export function bookings(){return new BookingService(applicationDatabase());}

export function payments(){return new PaymentEngine(applicationDatabase(),sandboxProvider());}

export function messageDrafts(){const pool=applicationDatabase();return new MessageDraftService(pool,budgetedClarifier(pool,process.env.RALLY_AI_WORKER_URL?workerClarifier('DRAFT'):input=>clarify(input,undefined,fetch,undefined,true)));}
