import { query, runWithDbContext } from '../../config/db.js';
import { logger } from '../../config/logger.js';

const RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS ?? 365);
const RETENTION_ENABLED = process.env.DATA_RETENTION_ENABLED === 'true';

/**
 * Point 8 (compliance plan): conversations had no retention policy, growing
 * unbounded. A conversation is expired when its most recent message (or its
 * own creation, if it has none) is older than DATA_RETENTION_DAYS. Deleting
 * it cascades to messages/usage_metrics/quality_scores/precheck_results/
 * artifacts etc. (all ON DELETE CASCADE on conversation_id) but leaves
 * leak_alerts intact with conversation_id set to NULL (025 migration) --
 * incident evidence must outlive the conversation it was raised in.
 * Disabled by default (DATA_RETENTION_ENABLED=true to turn on) since this
 * is a destructive, unbounded-scope deletion.
 */
export async function findExpiredConversationIds() {
  const { rows } = await query(
    `SELECT c.id
     FROM conversations c
     LEFT JOIN messages m ON m.conversation_id = c.id
     GROUP BY c.id, c.created_at
     HAVING COALESCE(MAX(m.created_at), c.created_at) < now() - ($1 || ' days')::interval`,
    [RETENTION_DAYS],
  );
  return rows.map((r) => r.id);
}

export async function runRetentionCleanup({ dryRun = !RETENTION_ENABLED } = {}) {
  // Never let a caller-supplied dryRun:false force a real delete while the
  // feature is disabled -- DATA_RETENTION_ENABLED is the actual on/off
  // switch for this destructive, unbounded-scope operation.
  const effectiveDryRun = dryRun || !RETENTION_ENABLED;
  const ids = await findExpiredConversationIds();

  if (effectiveDryRun) {
    logger.info('Retention cleanup (dry run) — would delete conversations', {
      count: ids.length,
      retentionDays: RETENTION_DAYS,
    });
    return { deletedCount: 0, wouldDeleteCount: ids.length, dryRun: true };
  }

  if (ids.length === 0) {
    return { deletedCount: 0, wouldDeleteCount: 0, dryRun: effectiveDryRun };
  }

  await query('DELETE FROM conversations WHERE id = ANY($1)', [ids]);
  logger.info('Retention cleanup deleted expired conversations', {
    count: ids.length,
    retentionDays: RETENTION_DAYS,
  });
  return { deletedCount: ids.length, wouldDeleteCount: ids.length, dryRun: false };
}

export function scheduleRetentionCleanup() {
  if (!RETENTION_ENABLED) {
    logger.info('Retention cleanup disabled (set DATA_RETENTION_ENABLED=true to enable)', {
      retentionDays: RETENTION_DAYS,
    });
    return;
  }

  // No HTTP request here to carry the usual per-user RLS context (point 6),
  // and this job legitimately spans every user's conversations -- run it
  // under an explicit admin context, or the isolation policy would silently
  // hide everything from it and the "cleanup" would delete nothing.
  const runAsAdmin = () =>
    runWithDbContext({ userId: null, isAdmin: true }, () => runRetentionCleanup()).catch((err) =>
      logger.error('Retention cleanup failed', { error: err.message }),
    );

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  runAsAdmin();
  setInterval(runAsAdmin, ONE_DAY_MS);
}
