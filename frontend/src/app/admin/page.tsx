'use client';

import useSWR from 'swr';
import { Download } from 'lucide-react';
import clsx from 'clsx';
import { apiFetch, type CostRow, type QualityRow, type EnterpriseComparison } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';

function AdminView() {
  const { data: costs } = useSWR<CostRow[]>('/metrics/costs', apiFetch);
  const { data: quality } = useSWR<QualityRow[]>('/metrics/quality', apiFetch);
  const { data: comparison } = useSWR<EnterpriseComparison>('/metrics/enterprise-comparison', apiFetch);

  const totalCost = (costs ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0);

  return (
    <div>
      <BrandHeader />
      <div className="grid gap-6 p-6">
        <section>
          <h2 className="mb-3 text-xl font-bold">Nasze narzędzie vs. plan enterprise</h2>
          {comparison ? (
            comparison.enterpriseSeats === 0 ? (
              <p className="text-sm text-brand-dark/70">
                Ustaw <code>ENTERPRISE_SEAT_COST_USD</code> i <code>ENTERPRISE_SEATS</code> w konfiguracji backendu,
                żeby zobaczyć porównanie.
              </p>
            ) : (
              <div className="flex gap-6">
                <div className="rounded-md bg-brand-white p-4">
                  <div className="text-sm text-brand-dark/70">Nasze narzędzie (30 dni)</div>
                  <div className="text-2xl font-bold">${comparison.ourToolCostUsd.toFixed(2)}</div>
                </div>
                <div className="rounded-md bg-brand-white p-4">
                  <div className="text-sm text-brand-dark/70">
                    Enterprise ({comparison.enterpriseSeats} seatów × ${comparison.enterpriseSeatCostUsd})
                  </div>
                  <div className="text-2xl font-bold">${comparison.enterpriseCostUsd.toFixed(2)}</div>
                </div>
                <div
                  className={clsx(
                    'flex items-center rounded-md px-4 py-2 font-bold text-brand-white',
                    comparison.cheaperOption === 'our_tool' ? 'bg-brand-purple' : 'bg-brand-magenta',
                  )}
                >
                  Taniej: {comparison.cheaperOption === 'our_tool' ? 'nasze narzędzie' : 'enterprise'}
                </div>
              </div>
            )
          ) : (
            <p>Ładowanie…</p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">Koszt łączny (30 dni): ${totalCost.toFixed(4)}</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-brand-dark text-brand-white">
                <th className="p-2 text-left">Model</th>
                <th className="p-2 text-left">Komenda</th>
                <th className="p-2 text-left">Zapytania</th>
                <th className="p-2 text-left">Koszt (USD)</th>
                <th className="p-2 text-left">Śr. czas (ms)</th>
              </tr>
            </thead>
            <tbody>
              {(costs ?? []).map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-brand-white' : 'bg-brand-lavender'}>
                  <td className="p-2">{row.model}</td>
                  <td className="p-2">{row.command_used ?? '—'}</td>
                  <td className="p-2">{row.requests}</td>
                  <td className="p-2">{Number(row.cost_usd).toFixed(4)}</td>
                  <td className="p-2">{Math.round(Number(row.avg_latency_ms))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">Jakość odpowiedzi (LLM-judge)</h2>
          <ul className="list-disc pl-5">
            {(quality ?? []).map((row, i) => (
              <li key={i}>
                {row.judge_model}: średnia {row.avg_score}/5 ({row.scored_messages} ocenionych odpowiedzi)
              </li>
            ))}
          </ul>
        </section>

        <div className="flex gap-3">
          <a
            href="/api/export/xlsx"
            className="flex items-center gap-1 rounded-md bg-brand-orange px-4 py-2 font-bold text-brand-white hover:brightness-95"
          >
            <Download size={16} />
            Eksport XLSX
          </a>
          <a
            href="/api/export/pptx"
            className="flex items-center gap-1 rounded-md bg-brand-orange px-4 py-2 font-bold text-brand-white hover:brightness-95"
          >
            <Download size={16} />
            Eksport PPTX
          </a>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <AdminView />
    </RequireAuth>
  );
}
