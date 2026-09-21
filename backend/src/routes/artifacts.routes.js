import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/db.js';
import { extractArtifact } from '../services/chatCore/artifactExtract.js';

export const artifactsRouter = Router();

// The public share-link lookup is the sole unauthenticated route here — it's
// keyed by an opaque, unguessable share_token on the artifact row itself
// (not the requester's JWT), since the viewer may not even have an account.
artifactsRouter.use((req, res, next) => {
  if (req.path.startsWith('/public/')) return next();
  return requireAuth(req, res, next);
});

function serializeArtifact(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    type: row.type,
    currentVersion: row.current_version,
    shareToken: row.share_token,
    content: row.content,
    previewContent: row.preview_content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadOwnedArtifactWithCurrentVersion(artifactId, userId) {
  const { rows } = await query(
    `SELECT a.*, v.content, v.preview_content
     FROM artifacts a
     JOIN conversations c ON c.id = a.conversation_id
     JOIN artifact_versions v ON v.artifact_id = a.id AND v.version = a.current_version
     WHERE a.id = $1 AND c.user_id = $2`,
    [artifactId, userId],
  );
  return rows[0] ?? null;
}

artifactsRouter.get('/conversations/:id/artifacts', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*, v.content, v.preview_content
       FROM artifacts a
       JOIN conversations c ON c.id = a.conversation_id
       JOIN artifact_versions v ON v.artifact_id = a.id AND v.version = a.current_version
       WHERE a.conversation_id = $1 AND c.user_id = $2
       ORDER BY a.created_at ASC`,
      [req.params.id, req.user.sub],
    );
    res.json(rows.map(serializeArtifact));
  } catch (err) {
    next(err);
  }
});

artifactsRouter.get('/artifacts/:id', async (req, res, next) => {
  try {
    const row = await loadOwnedArtifactWithCurrentVersion(req.params.id, req.user.sub);
    if (!row) return res.status(404).json({ error: 'Artifact not found' });
    res.json(serializeArtifact(row));
  } catch (err) {
    next(err);
  }
});

artifactsRouter.get('/artifacts/:id/versions', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT v.version, v.created_at
       FROM artifact_versions v
       JOIN artifacts a ON a.id = v.artifact_id
       JOIN conversations c ON c.id = a.conversation_id
       WHERE v.artifact_id = $1 AND c.user_id = $2
       ORDER BY v.version ASC`,
      [req.params.id, req.user.sub],
    );
    if (rows.length === 0) {
      const artifact = await loadOwnedArtifactWithCurrentVersion(req.params.id, req.user.sub);
      if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
    }
    res.json(rows.map((r) => ({ version: r.version, createdAt: r.created_at })));
  } catch (err) {
    next(err);
  }
});

artifactsRouter.get('/artifacts/:id/versions/:version', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*, v.version AS requested_version, v.content, v.preview_content, v.created_at AS version_created_at
       FROM artifact_versions v
       JOIN artifacts a ON a.id = v.artifact_id
       JOIN conversations c ON c.id = a.conversation_id
       WHERE v.artifact_id = $1 AND v.version = $2 AND c.user_id = $3`,
      [req.params.id, req.params.version, req.user.sub],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Version not found' });
    res.json({ ...serializeArtifact(rows[0]), currentVersion: rows[0].requested_version });
  } catch (err) {
    next(err);
  }
});

artifactsRouter.put('/artifacts/:id', async (req, res, next) => {
  try {
    const content = req.body?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'content is required' });
    }
    const artifact = await loadOwnedArtifactWithCurrentVersion(req.params.id, req.user.sub);
    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

    const nextVersion = artifact.current_version + 1;
    const previewContent = artifact.type === 'html' ? extractArtifact(content).previewContent : null;
    await query(
      `INSERT INTO artifact_versions (artifact_id, version, content, preview_content) VALUES ($1, $2, $3, $4)`,
      [artifact.id, nextVersion, content, previewContent],
    );
    await query(`UPDATE artifacts SET current_version = $2, updated_at = now() WHERE id = $1`, [artifact.id, nextVersion]);

    const updated = await loadOwnedArtifactWithCurrentVersion(req.params.id, req.user.sub);
    res.json(serializeArtifact(updated));
  } catch (err) {
    next(err);
  }
});

artifactsRouter.post('/artifacts/:id/share', async (req, res, next) => {
  try {
    const artifact = await loadOwnedArtifactWithCurrentVersion(req.params.id, req.user.sub);
    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
    const shareToken = artifact.share_token ?? crypto.randomBytes(24).toString('base64url');
    if (!artifact.share_token) {
      await query(`UPDATE artifacts SET share_token = $2 WHERE id = $1`, [artifact.id, shareToken]);
    }
    res.json({ shareToken });
  } catch (err) {
    next(err);
  }
});

artifactsRouter.delete('/artifacts/:id/share', async (req, res, next) => {
  try {
    const artifact = await loadOwnedArtifactWithCurrentVersion(req.params.id, req.user.sub);
    if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
    await query(`UPDATE artifacts SET share_token = NULL WHERE id = $1`, [artifact.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Public, unauthenticated: read-only lookup by share token, no ownership
// data (user id, conversation id) leaked back to the viewer.
artifactsRouter.get('/public/artifacts/:token', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.title, a.type, a.current_version, v.content, v.preview_content, a.updated_at
       FROM artifacts a
       JOIN artifact_versions v ON v.artifact_id = a.id AND v.version = a.current_version
       WHERE a.share_token = $1`,
      [req.params.token],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Artifact not found' });
    const r = rows[0];
    res.json({
      id: r.id,
      title: r.title,
      type: r.type,
      currentVersion: r.current_version,
      content: r.content,
      previewContent: r.preview_content,
      updatedAt: r.updated_at,
    });
  } catch (err) {
    next(err);
  }
});
