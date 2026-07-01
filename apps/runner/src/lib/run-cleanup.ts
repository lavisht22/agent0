import { runs, workspaces } from "@repo/database";
import { and, asc, count, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "./pg.js";
import { runLogStore } from "./storage.js";

/**
 * Run-retention cleanup.
 *
 * Two independent windows per workspace (both optional; null = keep forever):
 *   - logs:    delete the S3 log object, keep the metrics row (sets log_deleted_at)
 *   - metrics: delete the metrics row entirely (and its S3 object)
 *
 * Ordering invariant: the S3 object is always deleted BEFORE the Postgres row,
 * never after. A crash mid-cleanup can leave an orphan row pointing at a missing
 * object (the detail endpoint tolerates that, returning run_data: null), but can
 * never leave a row-less object stranded in S3.
 *
 * The two eligibility sets are disjoint: a run old enough for full deletion is
 * handled by the metrics phase (which also removes its object), so the logs
 * phase only touches runs in the window between the two cutoffs.
 */

const MS_PER_DAY = 86_400_000;

// Rows processed per batch. Bounds memory and the size of each S3/DB round-trip.
const BATCH_SIZE = 500;

export interface RetentionSettings {
	logsRetentionDays: number | null;
	metricsRetentionDays: number | null;
}

export interface CleanupPreview {
	logs_eligible: number;
	runs_eligible: number;
}

export type CleanupEvent =
	| {
			type: "progress";
			phase: "logs" | "runs";
			processed: number;
			total: number;
	  }
	| { type: "done"; logs_deleted: number; runs_deleted: number };

const cutoff = (days: number | null): string | null =>
	days === null ? null : new Date(Date.now() - days * MS_PER_DAY).toISOString();

/** Load a workspace's retention windows. Returns null if the workspace is gone. */
export async function getRetentionSettings(
	workspaceId: string,
): Promise<RetentionSettings | null> {
	const [row] = await db
		.select({
			logsRetentionDays: workspaces.run_logs_retention_days,
			metricsRetentionDays: workspaces.run_metrics_retention_days,
		})
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.limit(1);
	return row ?? null;
}

// Runs whose metrics row (and object) should be deleted: older than the metrics
// cutoff. Undefined when metrics retention is disabled.
function fullDeleteWhere(workspaceId: string, metricsCutoff: string | null) {
	if (metricsCutoff === null) return undefined;
	return and(
		eq(runs.workspace_id, workspaceId),
		lt(runs.created_at, metricsCutoff),
	);
}

// Runs whose log object should be purged but metrics retained: older than the
// logs cutoff, not yet purged, and not already in the full-delete window.
// Undefined when logs retention is disabled.
function logsPurgeWhere(
	workspaceId: string,
	logsCutoff: string | null,
	metricsCutoff: string | null,
) {
	if (logsCutoff === null) return undefined;
	return and(
		eq(runs.workspace_id, workspaceId),
		lt(runs.created_at, logsCutoff),
		isNull(runs.log_deleted_at),
		metricsCutoff === null ? undefined : gte(runs.created_at, metricsCutoff),
	);
}

export async function previewCleanup(
	workspaceId: string,
	settings: RetentionSettings,
): Promise<CleanupPreview> {
	const logsCutoff = cutoff(settings.logsRetentionDays);
	const metricsCutoff = cutoff(settings.metricsRetentionDays);

	const logsWhere = logsPurgeWhere(workspaceId, logsCutoff, metricsCutoff);
	const runsWhere = fullDeleteWhere(workspaceId, metricsCutoff);

	const logs_eligible = logsWhere
		? ((await db.select({ n: count() }).from(runs).where(logsWhere))[0]?.n ?? 0)
		: 0;
	const runs_eligible = runsWhere
		? ((await db.select({ n: count() }).from(runs).where(runsWhere))[0]?.n ?? 0)
		: 0;

	return { logs_eligible, runs_eligible };
}

/**
 * Execute cleanup for a workspace, yielding progress events. Idempotent and
 * resumable: eligibility is keyed off age and log_deleted_at, so re-running after
 * an interruption simply continues. Pass a signal to stop between batches (e.g.
 * on client disconnect) — no partial batch is ever left half-applied.
 */
export async function* runCleanup(
	workspaceId: string,
	settings: RetentionSettings,
	signal?: AbortSignal,
): AsyncGenerator<CleanupEvent> {
	const logsCutoff = cutoff(settings.logsRetentionDays);
	const metricsCutoff = cutoff(settings.metricsRetentionDays);

	const { logs_eligible, runs_eligible } = await previewCleanup(
		workspaceId,
		settings,
	);

	let logs_deleted = 0;
	let runs_deleted = 0;

	// Phase 1: purge log objects, retain metrics rows.
	const logsWhere = logsPurgeWhere(workspaceId, logsCutoff, metricsCutoff);
	while (logsWhere && !signal?.aborted) {
		const batch = await db
			.select({ id: runs.id })
			.from(runs)
			.where(logsWhere)
			.orderBy(asc(runs.created_at))
			.limit(BATCH_SIZE);
		if (batch.length === 0) break;

		const ids = batch.map((r) => r.id);
		await runLogStore.deleteMany(ids); // S3 first
		await db
			.update(runs)
			.set({ log_deleted_at: new Date().toISOString() })
			.where(inArray(runs.id, ids)); // then DB

		logs_deleted += ids.length;
		yield {
			type: "progress",
			phase: "logs",
			processed: logs_deleted,
			total: logs_eligible,
		};
	}

	// Phase 2: delete metrics rows (and their objects).
	const runsWhere = fullDeleteWhere(workspaceId, metricsCutoff);
	while (runsWhere && !signal?.aborted) {
		const batch = await db
			.select({ id: runs.id })
			.from(runs)
			.where(runsWhere)
			.orderBy(asc(runs.created_at))
			.limit(BATCH_SIZE);
		if (batch.length === 0) break;

		const ids = batch.map((r) => r.id);
		await runLogStore.deleteMany(ids); // S3 first
		await db.delete(runs).where(inArray(runs.id, ids)); // then DB

		runs_deleted += ids.length;
		yield {
			type: "progress",
			phase: "runs",
			processed: runs_deleted,
			total: runs_eligible,
		};
	}

	yield { type: "done", logs_deleted, runs_deleted };
}
