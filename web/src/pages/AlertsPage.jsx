import React from 'react';
import { Bell, MonitorPlay, MonitorX, HardDrive, LayoutTemplate, CheckCircle2, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { devices, billing, media } from '../api.js';
import { deviceStatus } from '../lib/deviceStatus.js';
import { relativeTime } from '../lib/format.js';
import { cn } from '../lib/cn.js';

const TONE = {
  danger: { box: 'border-danger-soft bg-danger-soft', icon: 'text-danger', Icon: AlertTriangle },
  warn: { box: 'border-line bg-surface-2', icon: 'text-amber-500', Icon: AlertTriangle },
  info: { box: 'border-line bg-surface-2', icon: 'text-accent', Icon: Info },
};

/*
 * Alertas: nada de fila de notificações fabricada. Aqui só entra o que está
 * de fato errado agora — lido do estado real da frota, da mídia e do plano.
 */
export function AlertsPage({ onGoScreens, onGoStorage, onGoBilling }) {
  const { data: devData, loading: loadingDev, reload } = useAsync(devices.list);
  const { data: bill } = useAsync(billing.get);
  const { data: mediaData } = useAsync(media.list);
  const list = (devData && devData.devices) || [];

  const alerts = [];

  // 1) Telas que pararam de responder.
  const offline = list.filter((d) => d.lastSeen && deviceStatus(d.lastSeen).tone === 'danger');
  for (const d of offline) {
    alerts.push({
      id: 'off-' + d.id, tone: 'danger', Icon: MonitorX,
      title: `“${d.name || 'Tela sem nome'}” está offline`,
      desc: `Sem resposta ${relativeTime(d.lastSeen)}. Verifique a energia, a internet e se o player está aberto na TV.`,
      action: { label: 'Ver telas', on: onGoScreens },
    });
  }

  // 2) Telas pareadas que nunca chegaram a conectar.
  const nunca = list.filter((d) => !d.lastSeen);
  for (const d of nunca) {
    alerts.push({
      id: 'never-' + d.id, tone: 'warn', Icon: MonitorPlay,
      title: `“${d.name || 'Tela sem nome'}” nunca conectou`,
      desc: 'A tela foi pareada, mas o player ainda não abriu nela. Abra o player na TV para começar a exibir.',
      action: { label: 'Ver telas', on: onGoScreens },
    });
  }

  // 3) Telas sem programação: pareadas, mas sem nada para exibir.
  const semConteudo = list.filter((d) => !d.hasConfig);
  for (const d of semConteudo) {
    alerts.push({
      id: 'nocfg-' + d.id, tone: 'warn', Icon: LayoutTemplate,
      title: `“${d.name || 'Tela sem nome'}” está sem programação`,
      desc: 'Nada foi publicado nesta tela ainda. Adicione conteúdo para ela sair do ar em branco.',
      action: { label: 'Ver telas', on: onGoScreens },
    });
  }

  // 4) Armazenamento perto do limite do plano.
  const uso = mediaData && mediaData.usage;
  if (uso && uso.quota) {
    const pct = uso.used / uso.quota;
    if (pct >= 0.8) {
      alerts.push({
        id: 'storage', tone: pct >= 0.95 ? 'danger' : 'warn', Icon: HardDrive,
        title: `Armazenamento em ${Math.round(pct * 100)}% do limite`,
        desc: 'Apague mídias que não usa mais ou aumente o plano para continuar enviando arquivos.',
        action: { label: 'Ver armazenamento', on: onGoStorage },
      });
    }
  }

  // 5) Limite de telas do plano atingido.
  const limiteTelas = bill && bill.usage && bill.usage.limit;
  if (limiteTelas && list.length >= limiteTelas) {
    alerts.push({
      id: 'plan', tone: 'info', Icon: MonitorPlay,
      title: `Você usou ${limiteTelas === 1 ? 'a única tela' : `as ${limiteTelas} telas`} do seu plano`,
      desc: 'Para parear mais telas, é preciso mudar de plano.',
      action: { label: 'Ver planos', on: onGoBilling },
    });
  }

  const ordem = { danger: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => ordem[a.tone] - ordem[b.tone]);
  const criticos = alerts.filter((a) => a.tone === 'danger').length;

  return (
    <div>
      <PageHeader title="Alertas" subtitle="O que precisa da sua atenção agora na rede de telas."
        actions={<Button variant="secondary" onClick={reload}>Atualizar</Button>} />

      <Panel>
        <PanelHeader title="Situação da rede"
          description={loadingDev ? undefined
            : alerts.length ? `${alerts.length} ${alerts.length === 1 ? 'alerta' : 'alertas'}${criticos ? ` · ${criticos} crítico${criticos > 1 ? 's' : ''}` : ''}`
            : `${list.length} ${list.length === 1 ? 'tela' : 'telas'} · tudo certo`} />

        {loadingDev ? (
          <div className="p-6"><Spinner size={20} /></div>
        ) : list.length === 0 ? (
          <EmptyState icon={MonitorPlay} title="Nenhuma tela pareada"
            description="Assim que você parear uma TV, os avisos sobre ela aparecem aqui."
            action={<Button size="sm" variant="primary" onClick={onGoScreens}>Ir para Telas</Button>} />
        ) : alerts.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nenhum alerta"
            description="Todas as telas estão online e com programação. Nada precisa de você agora." />
        ) : (
          <div className="space-y-2.5 p-4">
            {alerts.map((a) => {
              const t = TONE[a.tone];
              const Icon = a.Icon || t.Icon;
              return (
                <div key={a.id} className={cn('flex flex-wrap items-start gap-3 rounded-lg border p-3', t.box)}>
                  <Icon size={18} className={cn('mt-0.5 shrink-0', t.icon)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{a.title}</div>
                    <div className="mt-0.5 text-xs leading-snug text-ink-2">{a.desc}</div>
                  </div>
                  {a.action && (
                    <Button size="sm" variant="secondary" icon={ArrowRight} onClick={a.action.on}>{a.action.label}</Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-3">
        <Bell size={12} /> Uma tela é considerada offline quando passa mais de 90 segundos sem responder.
      </p>
    </div>
  );
}
