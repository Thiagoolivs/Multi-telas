import React from 'react';
import { MonitorPlay } from 'lucide-react';
import { Panel, PanelHeader, PanelFooter } from '../ui/Panel.jsx';
import { Table, THead, TBody, TH, TR, TD } from '../ui/Table.jsx';
import { StatusDot } from '../ui/Badge.jsx';
import { EmptyState } from '../ui/Feedback.jsx';
import { relativeTime } from '../../lib/format.js';
import { deviceStatus } from '../../lib/deviceStatus.js';

// Frota real: uma linha por dispositivo, status via heartbeat.
export function FleetTable({ screens }) {
  return (
    <Panel>
      <PanelHeader title="Frota de telas" description="Estado em tempo real de cada dispositivo" />
      {screens.length === 0 ? (
        <EmptyState icon={MonitorPlay} title="Nenhuma tela pareada" description="Pareie a primeira TV na aba Telas para começar a operar." />
      ) : (
        <>
          <Table>
            <THead>
              <TH>Tela</TH>
              <TH>Status</TH>
              <TH>Conteúdo</TH>
              <TH align="right">Última atividade</TH>
            </THead>
            <TBody>
              {screens.map((s) => {
                const st = deviceStatus(s.lastSeen);
                return (
                  <TR key={s.id}>
                    <TD className="font-medium text-ink">{s.name || 'Tela sem nome'}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot tone={st.tone} pulse={st.pulse} />
                        <span className="text-ink-2">{st.label}</span>
                      </span>
                    </TD>
                    <TD>{s.hasConfig ? 'Publicado' : <span className="text-ink-3">Aguardando</span>}</TD>
                    <TD align="right" className="tnum text-ink-3">{st.seen || '—'}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <PanelFooter><span>{screens.length} {screens.length === 1 ? 'tela' : 'telas'}</span></PanelFooter>
        </>
      )}
    </Panel>
  );
}
