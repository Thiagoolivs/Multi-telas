import React from 'react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { StatusDot } from '../ui/Badge.jsx';
import { Skeleton, ErrorState, EmptyState } from '../ui/Feedback.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { relativeTime } from '../../lib/format.js';
import { api } from '../../lib/mockData.js';

const SYNC = {
  ok: { tone: 'ok', label: 'Sincronizada' },
  partial: { tone: 'warn', label: 'Parcial' },
  failed: { tone: 'danger', label: 'Falhou' },
};

export function SyncActivity() {
  const { data, loading, error, reload } = useAsync(api.getSyncActivity);
  const items = data ? [...data].sort((a, b) => b.ts - a.ts) : [];

  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader title="Sincronizações recentes" description="Últimas publicações enviadas às telas" />
      <div className="flex-1">
        {loading && (
          <div className="space-y-4 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="mt-1 h-2 w-2 rounded-full" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-2.5 w-2/5" /></div>
              </div>
            ))}
          </div>
        )}

        {error && <ErrorState description="Falha ao carregar atividade." onRetry={reload} />}

        {!loading && !error && items.length === 0 && (
          <EmptyState title="Sem atividade" description="As sincronizações aparecerão aqui." />
        )}

        {!loading && !error && items.length > 0 && (
          <ol className="relative px-4 py-3">
            <span className="absolute bottom-4 left-[1.30rem] top-4 w-px bg-line" aria-hidden />
            {items.map((it) => {
              const s = SYNC[it.status];
              return (
                <li key={it.id} className="relative flex gap-3 py-2">
                  <span className="relative z-10 mt-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-surface">
                    <StatusDot tone={s.tone} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{it.screen}</span>
                      <span className="tnum shrink-0 text-2xs text-ink-3">{relativeTime(it.ts)}</span>
                    </div>
                    <p className="text-xs text-ink-3">
                      <span className={s.tone === 'danger' ? 'text-danger' : s.tone === 'warn' ? 'text-warn' : 'text-ink-2'}>{s.label}</span>
                      {' · '}{it.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Panel>
  );
}
