import React from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { EmptyState } from '../ui/Feedback.jsx';
import { relativeTime } from '../../lib/format.js';

const SEV = {
  critical: { icon: AlertCircle, cls: 'text-danger', bg: 'bg-danger-soft' },
  warning: { icon: AlertTriangle, cls: 'text-warn', bg: 'bg-warn-soft' },
  info: { icon: Info, cls: 'text-ink-2', bg: 'bg-surface-2' },
};

// Alertas derivados do estado real (telas offline, armazenamento cheio, etc.).
export function AlertsPanel({ alerts }) {
  return (
    <Panel className="flex h-full flex-col">
      <PanelHeader title="Alertas" description={alerts.length ? `${alerts.length} aberto(s)` : undefined} />
      <div className="flex-1">
        {alerts.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Tudo certo" description="Nenhum alerta no momento." />
        ) : (
          <ul className="divide-y divide-line">
            {alerts.map((a) => {
              const s = SEV[a.severity];
              const Icon = s.icon;
              return (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${s.bg} ${s.cls}`}>
                    <Icon size={15} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{a.title}</p>
                    {a.ts && <p className="mt-0.5 text-2xs text-ink-3">{relativeTime(a.ts)}</p>}
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
