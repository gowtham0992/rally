import 'server-only';
import {applicationDatabase} from './services.ts';
import {RequestLimiter,rateLimitKey} from './rate-limits.ts';
export function requestLimiter(){return new RequestLimiter(applicationDatabase(),rateLimitKey());}
