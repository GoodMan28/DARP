/**
 * Compile-time only: proves the services still return what the web tier was promised in
 * `@darp/shared/contracts`. Nothing here runs. If a service's result changes shape, the
 * matching line below stops compiling and `npm run typecheck` fails — before a page does.
 *
 * Routes whose payload is assembled in the route itself (dashboard, schema) are checked
 * where they are built, by passing the contract type to `ok<T>()`.
 */
import type {
  ActiveCycleInfo, Capability, CurrentUser, Jsonify, PeriodOption,
  RecordDetail, RecordListPayload, StatusCounts,
} from '@darp/shared/contracts';
import type { SessionUser } from '@/server/auth/session';
import type { ROLE_CAPABILITIES } from '@/server/auth/permissions';
import type { getActiveCycle } from '@/server/records/navigation';
import type { periodOptions } from '@/server/records/periods';
import type { getRecord, listRecords, statusCounts } from '@/server/records/service';

type Wire<F extends (...args: never[]) => unknown> = Jsonify<Awaited<ReturnType<F>>>;
type Holds<Actual, Promised> = [Actual] extends [Promised] ? true : false;

export type ContractChecks = [
  Holds<Omit<SessionUser, 'sessionId'>, CurrentUser>,
  Holds<(typeof ROLE_CAPABILITIES)[keyof typeof ROLE_CAPABILITIES], Record<Capability, boolean>>,
  Holds<Wire<typeof getActiveCycle>, ActiveCycleInfo>,
  Holds<Wire<typeof periodOptions>, PeriodOption[]>,
  Holds<Wire<typeof statusCounts>, StatusCounts>,
  Holds<Wire<typeof listRecords>, RecordListPayload>,
  Holds<Wire<typeof getRecord>, RecordDetail>,
];

// Every element must be `true`; a `false` here is a broken contract.
export const contractsHold: ContractChecks = [true, true, true, true, true, true, true];
