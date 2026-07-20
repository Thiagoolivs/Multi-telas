import React from 'react';
import { MonitorPlay, WifiOff, Megaphone, Bell } from 'lucide-react';
import { Stat } from '../ui/Stat.jsx';
import { Skeleton, ErrorState } from '../ui/Feedback.jsx';
import { StatusDot } from '../ui/Badge.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { relativeTime } from '../../lib/format.js';
import { api } from '../../lib/mockData.js';

export function KpiRow() {
  const { data, loading, error, reload } = useAsync(api.getOverview);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface p-4 shadow-xs">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-3 h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-line bg-surface">
        <ErrorState description="Não foi possível carregar os indicadores." onRetry={reload} />
      </div>
    );
  }

  const k = data.kpis;
  const onlinePct = Math.round((k.online / k.total) * 100);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Telas online"
        value={k.online}
        unit={`/ ${k.total}`}
        icon={MonitorPlay}
        delta={2}
        deltaTone="ok"
        footer={
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <StatusDot tone="ok" pulse />
            {onlinePct}% da frota ativa
          </span>
        }
      />
      <Stat
        label="Telas offline"
        value={k.offline}
        icon={WifiOff}
        delta={1}
        deltaTone={k.offline > 0 ? 'danger' : 'neutral'}
        hint={k.offline > 0 ? 'Requer atenção' : 'Nenhuma fora do ar'}
      />
      <Stat
        label="Campanhas ativas"
        value={k.activeCampaigns}
        icon={Megaphone}
        hint="Distribuídas na frota"
      />
      <Stat
        label="Alertas abertos"
        value={k.openAlerts}
        icon={Bell}
        deltaTone="warn"
        footer={<span className="text-xs text-ink-3">Última sinc. {relativeTime(k.lastSync)}</span>}
      />
    </div>
  );
}
