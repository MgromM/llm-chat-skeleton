import PptxGenJS from 'pptxgenjs';

// Sales&More brand colors (see BrandGuidelines-Sales&More v3.pdf)
const BRAND = {
  dark: '29272E',
  orange: 'F8502C',
  white: 'FFFFFF',
  lavender: 'EDEDF5',
};

export async function buildCostQualityReportPptx(rows, { periodLabel } = {}) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'S&M', width: 10, height: 5.63 });
  pptx.layout = 'S&M';

  const cover = pptx.addSlide();
  cover.background = { color: BRAND.orange };
  cover.addText('Sales&More LLM MVP', {
    x: 0.5, y: 2, w: 9, h: 1, fontSize: 36, bold: true, color: BRAND.white,
  });
  cover.addText(`Raport kosztu i jakości${periodLabel ? ` — ${periodLabel}` : ''}`, {
    x: 0.5, y: 3, w: 9, h: 0.6, fontSize: 18, color: BRAND.white,
  });

  const slide = pptx.addSlide();
  slide.background = { color: BRAND.lavender };
  slide.addText('Koszt i jakość per model / komenda', {
    x: 0.4, y: 0.3, w: 9, h: 0.5, fontSize: 20, bold: true, color: BRAND.dark,
  });

  const tableRows = [
    ['Model', 'Komenda', 'Zapytania', 'Koszt (USD)', 'Śr. czas (ms)', 'Śr. jakość (1-5)'].map((t) => ({
      text: t,
      options: { bold: true, color: BRAND.white, fill: BRAND.dark },
    })),
    ...rows.map((r) => [
      String(r.model),
      String(r.command_used ?? '—'),
      String(r.requests),
      Number(r.cost_usd).toFixed(4),
      String(Math.round(r.avg_latency_ms)),
      r.avg_quality_score != null ? String(r.avg_quality_score) : '—',
    ]),
  ];

  slide.addTable(tableRows, { x: 0.4, y: 1, w: 9.2, fontSize: 12, color: BRAND.dark });

  return pptx.write({ outputType: 'nodebuffer' });
}
