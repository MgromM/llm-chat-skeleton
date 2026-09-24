import { getCampaignPerformance, isGoogleAdsConfigured } from '../../integrations/googleAdsClient.js';
import { getCampaignInsights, isMetaAdsConfigured } from '../../integrations/metaAdsClient.js';

function formatGoogleRows(rows) {
  if (!rows.length) return '_(brak kampanii w tym okresie)_';
  return rows
    .map(
      (r) =>
        `- **${r.name}** (${r.status}) — ${r.impressions} wyświetleń, ${r.clicks} kliknięć, ` +
        `$${r.costUsd.toFixed(2)}, ${r.conversions} konwersji`
    )
    .join('\n');
}

function formatMetaRows(rows) {
  if (!rows.length) return '_(brak kampanii w tym okresie)_';
  return rows
    .map(
      (r) =>
        `- **${r.name}** — ${r.impressions} wyświetleń, ${r.clicks} kliknięć (CTR ${r.ctr.toFixed(2)}%), ` +
        `$${r.spendUsd.toFixed(2)}, ${r.conversions} konwersji`
    )
    .join('\n');
}

// Read-only reporting command: pulls campaign performance directly from the
// Google Ads / Meta Ads APIs and returns a formatted summary. No LLM call
// needed, so this always runs in "bypass" mode, same as /koszt-dzisiaj.
export const kampanieAdsCommand = {
  mode: 'bypass',
  async run() {
    const googleConfigured = isGoogleAdsConfigured();
    const metaConfigured = isMetaAdsConfigured();

    if (!googleConfigured && !metaConfigured) {
      return {
        mode: 'bypass',
        reply:
          'Ani Google Ads, ani Meta Ads nie są skonfigurowane. Ustaw zmienne środowiskowe ' +
          '`GOOGLE_ADS_*` i/lub `META_ADS_*` (patrz `.env.example`), aby włączyć tę komendę.',
      };
    }

    const sections = [];

    if (googleConfigured) {
      try {
        const rows = await getCampaignPerformance({ days: 7 });
        sections.push(`**Google Ads — ostatnie 7 dni**\n${formatGoogleRows(rows)}`);
      } catch (err) {
        sections.push(`**Google Ads** — błąd pobierania danych: ${err.message}`);
      }
    }

    if (metaConfigured) {
      try {
        const rows = await getCampaignInsights({ datePreset: 'last_7d' });
        sections.push(`**Meta Ads — ostatnie 7 dni**\n${formatMetaRows(rows)}`);
      } catch (err) {
        sections.push(`**Meta Ads** — błąd pobierania danych: ${err.message}`);
      }
    }

    return { mode: 'bypass', reply: sections.join('\n\n') };
  },
};
