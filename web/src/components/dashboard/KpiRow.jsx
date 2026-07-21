import React from 'react';
import { MonitorPlay, Wifi, WifiOff, HardDrive } from 'lucide-react';
import { Stat } from '../ui/Stat.jsx';
import { StatusDot } from '../ui/Badge.jsx';
import { Progress } from '../ui/Feedback.jsx';
import { relativeTime, formatBytes, formatPercent } from '../../lib/format.js';

// KPIs reais da operação: telas online/offline, total e armazenamento.
export function KpiRow({ kpis }) {
  const onlinePct = kpis.total ? Math.round((kpis.online / kpis.total) * 100) : 0;
  const storeTone = kpis.storageFrac > 0.9 ? 'danger' : kpis.storageFrac > 0.8 ? 'warn' : 'accent';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Telas online" value={kpis.online} unit={`/ ${kpis.total}`} icon={Wifi}
        footer={<span className="inline-flex items-center gap-1.5 text-xs text-ink-3"><StatusDot tone="ok" pulse />{onlinePct}% da frota ativa</span>}
      />
      <Stat
        label="Telas offline" value={kpis.offline} icon={WifiOff}
        deltaTone={kpis.offline > 0 ? 'danger' : 'neutral'}
        hint={kpis.offline > 0 ? 'Requer atenção' : 'Nenhuma fora do ar'}
      />
      <Stat
        label="Total de telas" value={kpis.total} icon={MonitorPlay}
        footer={<span className="text-xs text-ink-3">{kpis.lastSeen ? 'Últ. atividade ' + relativeTime(kpis.lastSeen) : 'Sem atividade ainda'}</span>}
      />
      <Stat
        label="Armazenamento" value={formatBytes(kpis.storageUsed)} icon={HardDrive}
        footer={
          <div>
            <Progress value={kpis.storageFrac * 100} tone={storeTone} className="h-1.5" />
            <span className="mt-1.5 block text-xs text-ink-3">{formatPercent(kpis.storageFrac)} de {formatBytes(kpis.storageQuota)}</span>
          </div>
        }
      />
    </div>
  );
}
