import { getCostSummary } from '../../metrics/usageTracker.js';

export const kosztDzisiajCommand = {
  mode: 'bypass',
  async run() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rows = await getCostSummary({ from: startOfDay.toISOString(), to: new Date().toISOString() });
    if (rows.length === 0) {
      return { mode: 'bypass', reply: 'Brak zapytań dzisiaj.' };
    }

    const totalCost = rows.reduce((sum, r) => sum + Number(r.cost_usd), 0);
    const totalRequests = rows.reduce((sum, r) => sum + Number(r.requests), 0);
    return {
      mode: 'bypass',
      reply: `Dzisiaj: ${totalRequests} zapytań, koszt łączny $${totalCost.toFixed(4)}.`,
    };
  },
};
