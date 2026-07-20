import React from 'react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Skeleton, ErrorState, Progress } from '../ui/Feedback.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { formatBytes, formatPercent } from '../../lib/format.js';
import { api } from '../../lib/mockData.js';
import { cn } from '../../lib/cn.js';

const DOT = { accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', neutral: 'bg-ink-3' };

export function StorageCard() {
  const { data, loading, error, reload } = useAsync(api.getOverview);
  const storage = data && data.storage;
  const used = storage ? storage.usedBytes / storage.totalBytes : 0;
  const tone = used > 0.9 ? 'danger' : used > 0.8 ? 'warn' : 'accent';

  return (
    <Panel>
      <PanelHeader title="Armazenamento" actions={<Button size="sm" variant="secondary">Gerenciar</Button>} />
      <div className="p-4">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <div className="grid grid-cols-2 gap-2 pt-1">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4" />)}
            </div>
          </div>
        )}

        {error && <ErrorState description="Falha ao carregar uso de armazenamento." onRetry={reload} />}

        {!loading && !error && storage && (
          <>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="tnum text-xl font-semibold text-ink">{formatBytes(storage.usedBytes)}</span>
                <span className="text-sm text-ink-3"> / {formatBytes(storage.totalBytes)}</span>
              </div>
              <span className={cn('tnum text-sm font-medium', tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink-2')}>
                {formatPercent(used)}
              </span>
            </div>
            <Progress value={used * 100} tone={tone} className="mt-3 h-2" />

            <ul className="mt-4 space-y-2">
              {storage.breakdown.map((b) => (
                <li key={b.label} className="flex items-center gap-2 text-sm">
                  <span className={cn('h-2 w-2 rounded-sm', DOT[b.tone])} />
                  <span className="text-ink-2">{b.label}</span>
                  <span className="tnum ml-auto text-ink-3">{formatBytes(b.bytes)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}
