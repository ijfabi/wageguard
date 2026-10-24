/** Raw output of the Benchmark C measurement process (apps/api/scripts/bench-database.ts). */

export interface PlanSummary {
  readonly sql: string;
  readonly planningMs: number;
  readonly executionMs: number;
  /** Plan nodes in depth-first order, with the index or table each one reads. */
  readonly nodes: readonly string[];
  readonly sequentialScans: readonly { readonly relation: string; readonly rows: number }[];
  readonly sharedBuffersHit: number;
  readonly sharedBuffersRead: number;
}

export interface RawOperation {
  readonly operation: string;
  readonly latenciesMs: readonly number[];
  /** Statements sent through node-postgres during the first measured call. */
  readonly queryCount: number;
  readonly statementKinds: Readonly<Record<string, number>>;
  readonly plans: readonly PlanSummary[];
}

export interface RawStep {
  readonly measuredUserAudits: number;
  readonly rows: {
    readonly audits: number;
    readonly findings: number;
    readonly shifts: number;
    readonly payslips: number;
    readonly bytes: number;
  };
  readonly seedSeconds: number;
  readonly operations: readonly RawOperation[];
}

export interface RawOutput {
  readonly postgresVersion: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly steps: readonly RawStep[];
}
