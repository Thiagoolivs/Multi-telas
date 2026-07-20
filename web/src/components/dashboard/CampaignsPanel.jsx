import React from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { SkeletonRows, ErrorState, EmptyState } from '../ui/Feedback.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { relativeTime } from '../../lib/format.js';
import { api } from '../../lib/mockData.js';

export function CampaignsPanel() {
  const { data, loading, error, reload } = useAsync(api.getCampaigns);

  return (
    <Panel>
      <PanelHeader
        title="Campanhas ativas"
        description="No ar agora, com alcance na frota"
        actions={<Button size="sm" variant="primary" icon={Plus}>Nova campanha</Button>}
      />

      {loading && <SkeletonRows rows={4} cols={3} />}
      {error && <ErrorState description="Falha ao carregar campanhas." onRetry={reload} />}
      {!loading && !error && data && data.length === 0 && (
        <EmptyState icon={Megaphone} title="Nenhuma campanha ativa" description="Crie uma campanha para publicar nas telas."
          action={<Button size="sm" variant="primary" icon={Plus}>Nova campanha</Button>} />
      )}

      {!loading && !error && data && data.length > 0 && (
        <ul className="divide-y divide-line">
          {data.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Megaphone size={15} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                  <Badge tone="ok">no ar</Badge>
                </div>
                <p className="mt-0.5 text-2xs text-ink-3">Atualizada {relativeTime(c.updatedAt)}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="tnum text-sm font-medium text-ink">{c.screens}</div>
                <div className="text-2xs text-ink-3">{c.screens === 1 ? 'tela' : 'telas'}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
