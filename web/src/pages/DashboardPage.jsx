import React from 'react';
import { RefreshCw, AlertTriangle, CircleAlert } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Panel } from '../components/ui/Panel.jsx';
import { ErrorState, Spinner } from '../components/ui/Feedback.jsx';
import { KpiRow } from '../components/dashboard/KpiRow.jsx';
import { FleetTable } from '../components/dashboard/FleetTable.jsx';
import { AlertsPanel } from '../components/dashboard/AlertsPanel.jsx';
import { PrimeirosPassos } from '../components/dashboard/PrimeirosPassos.jsx';
import { useAsync } from '../lib/useAsync.js';
import { devices as devicesApi, media as mediaApi, sistema } from '../api.js';
import { deviceStatus, ONLINE_WINDOW_MS } from '../lib/deviceStatus.js';
import { formatBytes } from '../lib/format.js';

const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  .format(new Date()).replace(/^\w/, (c) => c.toUpperCase());

// Dashboard 100% real: frota (via heartbeat) + armazenamento (mídia). Alertas
// são derivados do estado real. Nada de dado fictício.
/*
 * O aviso de sistema mal configurado entra AQUI, na primeira tela, e não só
 * na página de estado. Um problema que destrói a mídia do cliente não pode
 * depender de alguém clicar no menu para descobri-lo — e quem acabou de
 * publicar uma peça não vai clicar.
 *
 * Só OPERADOR DA PLATAFORMA recebe o diagnóstico — o servidor responde 404 aos
 * demais. Aqui a falha é silenciosa de propósito, e é o que faz o aviso
 * desaparecer sozinho para quem usa uma conta: o que ele descreve (bucket,
 * banco, chave de IA) só quem opera o MultiTelas pode resolver, e avisar quem
 * não pode agir é só assustar.
 */
function AvisoDoSistema({ onAbrir, operador }) {
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    /*
     * NÃO PERGUNTA quando não é operador.
     *
     * A porta já era do servidor — ele responde 404 a quem não opera a
     * plataforma, e o `.catch` fazia o aviso sumir. Só que a pergunta era
     * feita assim mesmo: TODO cliente disparava um 404 a cada visita ao
     * painel. Aparecia no console dele como erro, subia no nosso log como
     * rota não encontrada, e enterrava o 404 que importa no meio do ruído.
     *
     * Perguntar só quando pode agir também é a regra que o resto da tela já
     * segue: o aviso fala de banco, bucket e chave de IA — coisas que só
     * quem opera o MultiTelas resolve.
     */
    if (!operador) return;
    sistema.diagnostico().then(setD).catch(() => {});
  }, [operador]);
  if (!operador || !d || d.nivel === 'ok') return null;
  const grave = d.nivel === 'critico';
  const primeiro = d.itens[0];
  return (
    <button type="button" onClick={onAbrir}
      className={'mb-4 flex w-full items-start gap-3 rounded-lg border p-4 text-left transition hover:brightness-110 '
        + (grave ? 'border-danger/40 bg-danger/5' : 'border-warn/40 bg-warn/5')}>
      {grave ? <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" />
             : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />}
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{d.resumo}</span>
        <span className="mt-0.5 block text-sm text-ink-2">
          {primeiro.titulo}: {primeiro.consequencia}
        </span>
        <span className="mt-1 block text-xs text-ink-3">Clique para ver o que fazer.</span>
      </span>
    </button>
  );
}

export function DashboardPage({ onGoSystem, onIr, operador }) {
  const { data, loading, error, reload } = useAsync(async () => {
    const [d, m] = await Promise.all([devicesApi.list(), mediaApi.list()]);
    return { devices: d.devices || [], storage: m.usage || { used: 0, quota: 1 } };
  });

  return (
    <div>
      <PageHeader
        title="Visão geral"
        subtitle={`${today} · operação da rede em tempo real`}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload}>Atualizar</Button>}
      />
      <AvisoDoSistema onAbrir={onGoSystem} operador={operador} />
      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={22} /></div>
      ) : error ? (
        <Panel><ErrorState description="Não foi possível carregar a operação." onRetry={reload} /></Panel>
      ) : (
        <Body data={data} onIr={onIr} />
      )}
    </div>
  );
}

function Body({ data, onIr }) {
  const now = Date.now();
  const screens = data.devices;
  const online = screens.filter((d) => d.lastSeen && now - d.lastSeen < ONLINE_WINDOW_MS);
  const offline = screens.filter((d) => d.lastSeen && now - d.lastSeen >= ONLINE_WINDOW_MS);
  const never = screens.filter((d) => !d.lastSeen);
  const storeFrac = data.storage.quota ? data.storage.used / data.storage.quota : 0;

  const kpis = {
    total: screens.length,
    online: online.length,
    offline: offline.length + never.length,
    storageUsed: data.storage.used,
    storageQuota: data.storage.quota,
    storageFrac: storeFrac,
    lastSeen: screens.reduce((m, d) => Math.max(m, d.lastSeen || 0), 0) || null,
  };

  // Alertas derivados do estado real.
  const alerts = [];
  offline.forEach((d) => alerts.push({ id: 'off_' + d.id, severity: 'critical', title: `${d.name || 'Tela'} offline`, ts: d.lastSeen }));
  if (storeFrac >= 0.8) alerts.push({ id: 'store', severity: 'warning', title: `Armazenamento em ${Math.round(storeFrac * 100)}% (${formatBytes(data.storage.used)})`, ts: now });
  if (never.length) alerts.push({ id: 'never', severity: 'info', title: `${never.length} tela(s) aguardando primeira conexão`, ts: now });

  return (
    <>
      <PrimeirosPassos devices={screens} onIr={onIr} />
      <KpiRow kpis={kpis} />
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2"><FleetTable screens={screens} /></div>
        <div><AlertsPanel alerts={alerts} /></div>
      </div>
    </>
  );
}
