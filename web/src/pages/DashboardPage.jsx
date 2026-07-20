import React from 'react';
import { RefreshCw, ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { KpiRow } from '../components/dashboard/KpiRow.jsx';
import { FleetTable } from '../components/dashboard/FleetTable.jsx';
import { AlertsPanel } from '../components/dashboard/AlertsPanel.jsx';
import { StorageCard } from '../components/dashboard/StorageCard.jsx';
import { SyncActivity } from '../components/dashboard/SyncActivity.jsx';
import { CampaignsPanel } from '../components/dashboard/CampaignsPanel.jsx';

const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  .format(new Date())
  .replace(/^\w/, (c) => c.toUpperCase());

export function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Visão geral"
        subtitle={`${today} · operação da rede em tempo real`}
        actions={
          <>
            <Button variant="secondary" icon={ChevronDown} className="flex-row-reverse">
              Últimas 24 h
            </Button>
            <Button variant="primary" icon={RefreshCw}>Sincronizar tudo</Button>
          </>
        }
      />

      <KpiRow />

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <FleetTable />
          <div className="grid gap-4 md:grid-cols-2">
            <CampaignsPanel />
            <StorageCard />
          </div>
        </div>
        <div className="space-y-4">
          <AlertsPanel />
          <SyncActivity />
        </div>
      </div>
    </div>
  );
}
