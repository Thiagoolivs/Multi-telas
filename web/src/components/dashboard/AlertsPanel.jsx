import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Skeleton, ErrorState, EmptyState } from '../ui/Feedback.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { relativeTime } from '../../lib/format.js';
import { api } from '../../lib/mockData.js';

const SEV = {
  critical: { icon: AlertCircle, cls: 'text-danger', bg: 'bg-danger-soft' },
  warning: { icon: AlertTriangle, cls: 'text-warn', bg: 'bg-warn-soft' },
  info: { icon: Info, cls: 'text-ink-2', bg: 'bg-surface-2' },
};

export function AlertsPanel() {
  const { data, loading, error, reload } = useAsync(api.getAlerts);
  const count = data ? data.length : 0;

  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader
        title="Alertas"
        description={count ? `${count} abertos` : undefined}
        actions={<Button size="sm" variant="ghost">Ver histórico</Button>}
      />
      <div className="flex-1">
        {loading && (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-7 w-7 rounded-md" />
                <div className="flex-1 space-y-1.5 py-0.5">
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-2.5 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <ErrorState description="Falha ao carregar alertas." onRetry={reload} />}

        {!loading && !error && count === 0 && (
          <EmptyState icon={CheckCircle2} title="Tudo certo" description="Nenhum alerta aberto no momento." />
        )}

        {!loading && !error && count > 0 && (
          <ul className="divide-y divide-line">
            {data.map((a) => {
              const s = SEV[a.severity];
              const Icon = s.icon;
              return (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3 transition hover:bg-surface-2">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${s.bg} ${s.cls}`}>
                    <Icon size={15} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{a.title}</p>
                    <p className="mt-0.5 text-2xs text-ink-3">{relativeTime(a.ts)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
