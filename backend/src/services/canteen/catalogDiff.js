import { pool } from '../../config/db.js';
import { isImplausiblePriceChange, isMassRemoval } from './confidence.js';

function normalizeName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Upserts the parsed item as the product's new current state, or deactivates it for a 'removed' change. */
async function applyChangeToProducts(client, facilityId, change) {
  if (change.type === 'removed') {
    await client.query(`UPDATE canteen_products SET active = false, updated_at = now() WHERE id = $1`, [change.existing.id]);
    return;
  }
  await client.query(
    `INSERT INTO canteen_products (facility_id, normalized_name, display_name, price, unit, active)
     VALUES ($1,$2,$3,$4,$5,true)
     ON CONFLICT (facility_id, normalized_name) DO UPDATE SET
       display_name = EXCLUDED.display_name, price = EXCLUDED.price, unit = EXCLUDED.unit, active = true, updated_at = now()`,
    [facilityId, change.normalizedName, change.item.name, change.item.price, change.item.unit],
  );
}

/**
 * Diffs a freshly parsed catalog against the current materialized state for
 * one facility, inside a single transaction: ordinary changes are applied to
 * canteen_products immediately; a price jump confidence.js calls implausible,
 * or a removal batch big enough to look like mass deletion, is logged into
 * canteen_catalog_changes with applied=false instead -- held for a human to
 * confirm via applyPendingChange below, never silently dropped or silently
 * trusted. An item absent from canteen_products but present-and-inactive
 * (previously removed, now back) is recorded as 'reappeared' rather than
 * 'added', for a clearer audit trail.
 */
export async function diffAndApplyCatalog({ facilityId, extractionRunId, parsedItems }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query(
      `SELECT id, normalized_name, price, active FROM canteen_products WHERE facility_id = $1`,
      [facilityId],
    );
    const existingByName = new Map(existingRows.map((r) => [r.normalized_name, r]));

    // Last line wins on a duplicate product name within one import -- not
    // worth failing the whole import over a repeated catalog line.
    const parsedByName = new Map();
    for (const item of parsedItems) {
      parsedByName.set(normalizeName(item.name), item);
    }

    const previousActiveCount = existingRows.filter((r) => r.active).length;
    const changes = [];

    for (const [normalizedName, item] of parsedByName) {
      const existing = existingByName.get(normalizedName);
      if (!existing) {
        changes.push({ type: 'added', normalizedName, item, existing: null });
      } else if (!existing.active) {
        changes.push({ type: 'reappeared', normalizedName, item, existing });
      } else if (Number(existing.price) !== item.price) {
        changes.push({ type: 'price_changed', normalizedName, item, existing });
      }
    }
    for (const [normalizedName, existing] of existingByName) {
      if (existing.active && !parsedByName.has(normalizedName)) {
        changes.push({ type: 'removed', normalizedName, item: null, existing });
      }
    }

    const removedCount = changes.filter((c) => c.type === 'removed').length;
    const massRemoval = isMassRemoval(removedCount, previousActiveCount);

    const saved = [];
    for (const change of changes) {
      const priceJump =
        change.type === 'price_changed' && isImplausiblePriceChange(Number(change.existing.price), change.item.price);
      const flagged = priceJump || (change.type === 'removed' && massRemoval);
      const flagReason = priceJump
        ? `Podejrzany skok ceny: ${change.existing.price} zł → ${change.item.price} zł`
        : change.type === 'removed' && massRemoval
          ? `Masowe usunięcie: ${removedCount}/${previousActiveCount} pozycji zniknęło w jednym imporcie`
          : null;
      const applied = !flagged;

      if (applied) await applyChangeToProducts(client, facilityId, change);

      const { rows } = await client.query(
        `INSERT INTO canteen_catalog_changes
           (extraction_run_id, facility_id, product_id, normalized_name, display_name, change_type, old_price, new_price, unit, flagged_implausible, flag_reason, applied)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          extractionRunId,
          facilityId,
          change.existing?.id ?? null,
          change.normalizedName,
          change.item?.name ?? null,
          change.type,
          change.existing ? Number(change.existing.price) : null,
          change.item ? change.item.price : null,
          change.item?.unit ?? null,
          flagged,
          flagReason,
          applied,
        ],
      );
      saved.push({ id: rows[0].id, type: change.type, normalizedName: change.normalizedName, flagged, flagReason, applied });
    }

    await client.query('COMMIT');
    return saved;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Applies a single change that diffAndApplyCatalog held back (applied=false)
 * after a human has reviewed it -- reconstructs the product update entirely
 * from the stored change row (display_name/unit/new_price), no re-parse of
 * the original document needed. Returns false for an unknown id or one
 * that's already applied, so the route can answer 404 instead of silently
 * no-op'ing.
 */
export async function applyPendingChange(changeId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM canteen_catalog_changes WHERE id = $1 AND applied = false FOR UPDATE`,
      [changeId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    const row = rows[0];
    if (row.change_type === 'removed') {
      await client.query(`UPDATE canteen_products SET active = false, updated_at = now() WHERE id = $1`, [row.product_id]);
    } else {
      await client.query(
        `INSERT INTO canteen_products (facility_id, normalized_name, display_name, price, unit, active)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (facility_id, normalized_name) DO UPDATE SET
           display_name = EXCLUDED.display_name, price = EXCLUDED.price, unit = EXCLUDED.unit, active = true, updated_at = now()`,
        [row.facility_id, row.normalized_name, row.display_name, Number(row.new_price), row.unit],
      );
    }
    await client.query(`UPDATE canteen_catalog_changes SET applied = true WHERE id = $1`, [changeId]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
