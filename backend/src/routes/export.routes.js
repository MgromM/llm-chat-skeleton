import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getCostAndQualitySummary } from '../services/metrics/usageTracker.js';
import { buildCostQualityReportXlsx } from '../services/export/xlsxExport.js';
import { buildCostQualityReportPptx } from '../services/export/pptxExport.js';

export const exportRouter = Router();
exportRouter.use(requireAuth, requireRole('manager', 'admin'));

function parseRange(req) {
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

exportRouter.get('/xlsx', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const rows = await getCostAndQualitySummary({ from: from.toISOString(), to: to.toISOString() });
    const buffer = await buildCostQualityReportXlsx(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="raport-koszty.xlsx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

exportRouter.get('/pptx', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req);
    const rows = await getCostAndQualitySummary({ from: from.toISOString(), to: to.toISOString() });
    const buffer = await buildCostQualityReportPptx(rows, {
      periodLabel: `${from.toLocaleDateString('pl-PL')} – ${to.toLocaleDateString('pl-PL')}`,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="raport-koszty.pptx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});
