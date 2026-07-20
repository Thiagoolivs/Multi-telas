import React from 'react';
import { MonitorPlay, ExternalLink } from 'lucide-react';
import { Panel, PanelHeader, PanelFooter } from '../ui/Panel.jsx';
import { Table, THead, TBody, TH, TR, TD } from '../ui/Table.jsx';
import { StatusDot } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { SkeletonRows, ErrorState, EmptyState } from '../ui/Feedback.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { relativeTime, formatPercent } from '../../lib/format.js';
import { api } from '../../lib/mockData.js';

const STATUS = {
  online: { tone: 'ok', label: 'Online', pulse: false },
  syncing: { tone: 'accent', label: 'Sincronizando', pulse: true },
  offline: { tone: 'danger', label: 'Offline', pulse: false },
  idle: { tone: 'neutral', label: 'Ociosa', pulse: false },
};

export function FleetTable() {
  const { data, loading, error, reload } = useAsync(api.getScreens);

  return (
    <Panel>
      <PanelHeader
        title="Frota de telas"
        description="Estado em tempo real de cada dispositivo"
        actions={<Button size="sm" variant="secondary" icon={ExternalLink}>Ver todas</Button>}
      />

      {loading && <SkeletonRows rows={6} cols={5} />}

      {error && <ErrorState description="Não foi possível obter o estado das telas." onRetry={reload} />}

      {!loading && !error && data && data.length === 0 && (
        <EmptyState icon={MonitorPlay} title="Nenhuma tela pareada" description="Pareie a primeira TV para começar a operar." />
      )}

      {!loading && !error && data && data.length > 0 && (
        <>
          <Table>
            <THead>
              <TH>Tela</TH>
              <TH>Local</TH>
              <TH>Status</TH>
              <TH>Campanha</TH>
              <TH align="right">Última sinc.</TH>
              <TH align="right">Uptime</TH>
            </THead>
            <TBody>
              {data.map((s) => {
                const st = STATUS[s.status];
                return (
                  <TR key={s.id}>
                    <TD className="font-medium text-ink">{s.name}</TD>
                    <TD>{s.group}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot tone={st.tone} pulse={st.pulse} />
                        <span className="text-ink-2">{st.label}</span>
                      </span>
                    </TD>
                    <TD>{s.campaign || <span className="text-ink-3">—</span>}</TD>
                    <TD align="right" className="tnum text-ink-3">{relativeTime(s.lastSync)}</TD>
                    <TD align="right" className="tnum">
                      <span className={s.uptime < 0.95 ? 'text-danger' : s.uptime < 0.99 ? 'text-warn' : 'text-ink-2'}>
                        {formatPercent(s.uptime, 1)}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <PanelFooter>
            <span>{data.length} telas</span>
            <span>Atualizado {relativeTime(Math.max(...data.map((s) => s.lastSync)))}</span>
          </PanelFooter>
        </>
      )}
    </Panel>
  );
}
