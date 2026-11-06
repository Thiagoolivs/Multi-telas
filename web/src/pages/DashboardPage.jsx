import React from 'react';
import { RefreshCw, AlertTriangle, CircleAlert, ImagePlus, Sparkles, CalendarDays, Repeat, ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Panel } from '../components/ui/Panel.jsx';
import { ErrorState, Spinner } from '../components/ui/Feedback.jsx';
import { StatusDot } from '../components/ui/Badge.jsx';
import { MiniaturaDaTela } from '../components/tela/MiniaturaDaTela.jsx';
import { PrimeirosPassos } from '../components/dashboard/PrimeirosPassos.jsx';
import { abrirSubir } from '../lib/subir.js';
import { useAsync } from '../lib/useAsync.js';
import { devices as devicesApi, media as mediaApi, sistema, seasons } from '../api.js';
import { ideiaDaData } from '../lib/ideiaDaData.js';
import { deviceStatus, ONLINE_WINDOW_MS } from '../lib/deviceStatus.js';
import { formatBytes } from '../lib/format.js';
import { ResumoDasPessoas } from '../components/pessoas/ResumoDasPessoas.jsx';

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

  /*
   * O Início mostra o que está passando agora em cada TV (QA de 26/10: "a
   * home é um checklist de boas-vindas e atalhos"). O título não repete a
   * aba ("Visão geral" em cima de "Visão geral"), e a grade de doze atalhos,
   * que era a mesma da página Criar, deu lugar a um botão que leva até lá.
   */
  return (
    <div>
      <PageHeader
        title="Suas TVs agora"
        subtitle={today}
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload}>Atualizar</Button>}
      />
      <AvisoDoSistema onAbrir={onGoSystem} operador={operador} />
      {/* Conta nova: o caminho até a primeira peça na TV vem ANTES de tudo (PLANO §5.3). Some quando termina. */}
      {data && <PrimeirosPassos devices={data.devices} onIr={onIr} />}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size={22} /></div>
      ) : error ? (
        <Panel><ErrorState description="Não foi possível carregar as suas TVs." onRetry={reload} /></Panel>
      ) : (
        <TvsAoVivo data={data} onIr={onIr} />
      )}
      <section className="mb-4">
        <h2 className="mb-2 text-base font-semibold text-ink">O que você quer mostrar hoje?</h2>
        <IdeiaDeHoje onIr={onIr} />
        <div className="grid gap-2.5 sm:grid-cols-2">
          <button type="button" onClick={() => onIr && onIr('criar')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-fg transition hover:brightness-110">
            <Sparkles size={17} /> Criar com a IA
          </button>
          {/* A foto que já existe vai direto, sem passar pela IA: três toques até a TV. */}
          <button type="button" onClick={() => abrirSubir()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-accent/60 hover:bg-surface-2">
            <ImagePlus size={17} className="text-accent" /> Pôr foto ou vídeo na TV
          </button>
        </div>
      </section>
      {/* D34: com equipe cadastrada, o RH vê pessoas, fotos para aprovar e próximos aniversários logo no Início. */}
      <ResumoDasPessoas soComEquipe onIr={() => onIr && onIr('birthdays')} />
    </div>
  );
}

function IdeiaDeHoje({ onIr }) {
  const [ideia, setIdeia] = React.useState(null);
  React.useEffect(() => { seasons.list().then((r) => setIdeia(ideiaDaData(r && r.hoje))).catch(() => {}); }, []);
  if (!ideia) return null;
  return (
    <button type="button" onClick={() => onIr && onIr('criar', { ideia: 'data' })}
      className="mb-2.5 flex w-full items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3 text-left transition hover:border-accent/70">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">Hoje: {ideia.titulo}</div>
        <div className="text-xs text-ink-3">{ideia.porque}</div>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent"><CalendarDays size={15} /> Criar para a data</span>
    </button>
  );
}

const MAX_NO_INICIO = 6;

/*
 * Cada TV em miniatura, com o que está passando, o estado em palavras e
 * "Trocar agora" — que abre a programação daquela TV. Os avisos (TV fora do
 * ar, armazenamento quase cheio, TV esperando a primeira conexão) vêm em
 * cima, em uma linha cada, só quando existem.
 */
function TvsAoVivo({ data, onIr }) {
  const now = Date.now();
  const screens = data.devices;
  const offline = screens.filter((d) => d.lastSeen && now - d.lastSeen >= ONLINE_WINDOW_MS);
  const never = screens.filter((d) => !d.lastSeen);
  const storeFrac = data.storage.quota ? data.storage.used / data.storage.quota : 0;
  if (!screens.length) return null;

  const avisos = [];
  const ultimo = (d) => (deviceStatus(d.lastSeen).seen ? 'último sinal ' + deviceStatus(d.lastSeen).seen : '');
  /*
   * Várias TVs fora do ar viram UMA linha (reteste da fase 10: eram 25 linhas
   * vermelhas iguais no Início). "25 TVs fora do ar", e "Quais?" abre a lista.
   */
  if (offline.length > 1) {
    avisos.push({ id: 'off', tom: 'danger', texto: offline.length + ' TVs fora do ar', acao: 'Ver', on: () => onIr && onIr('screens'),
      itens: offline.map((d) => ({ id: d.id, nome: d.name || 'Tela sem nome', detalhe: ultimo(d) })) });
  } else {
    offline.forEach((d) => avisos.push({ id: 'off_' + d.id, tom: 'danger', texto: (d.name || 'Uma TV') + ' está fora do ar' + (ultimo(d) ? ' (' + ultimo(d) + ')' : ''), acao: 'Ver', on: () => onIr && onIr('screens') }));
  }
  if (never.length) avisos.push({ id: 'never', tom: 'neutral', texto: never.length + (never.length === 1 ? ' TV esperando' : ' TVs esperando') + ' a primeira conexão', acao: 'Ver', on: () => onIr && onIr('screens') });
  if (storeFrac >= 0.8) avisos.push({ id: 'store', tom: 'warn', texto: 'Armazenamento em ' + Math.round(storeFrac * 100) + '% (' + formatBytes(data.storage.used) + ')', acao: 'Ver', on: () => onIr && onIr('storage') });
  const resumo = { total: screens.length, offline: offline.length };

  return (
    <section className="mb-5" aria-label="Suas TVs">
      {avisos.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {avisos.map((a) => <LinhaDeAviso key={a.id} a={a} />)}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {screens.slice(0, MAX_NO_INICIO).map((d) => {
          const st = deviceStatus(d.lastSeen, now);
          const online = st.tone === 'ok';
          return (
            <div key={d.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="relative flex aspect-video items-center justify-center overflow-hidden border-b border-line bg-gradient-to-br from-surface-2 to-accent-soft/40">
                <MiniaturaDaTela d={d} online={online} vazia={!d.hasConfig} />
                <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-2 py-0.5 text-xs font-medium text-ink backdrop-blur">
                  <StatusDot tone={st.tone} pulse={st.pulse} />{st.label}
                </span>
              </div>
              <div className="flex items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{d.name || 'Tela sem nome'}</div>
                  <div className="truncate text-xs text-ink-3">{online ? 'Deu sinal ' + (st.seen || 'agora') : st.seen ? 'Último sinal ' + st.seen : 'Ainda não deu sinal'}</div>
                </div>
                {/* Secundário (QA de lançamento, 03/11): eram três botões violeta no Início; o principal é "Criar com a IA". */}
                <Button size="sm" variant="secondary" icon={Repeat} onClick={() => onIr && onIr('content', { device: d })}>
                  {d.hasConfig ? 'Abrir a TV' : 'Pôr conteúdo'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {screens.length > MAX_NO_INICIO && (
        <button type="button" onClick={() => onIr && onIr('screens')} className="mt-2 text-sm font-semibold text-accent hover:underline">
          Ver as {resumo.total} TVs
        </button>
      )}
    </section>
  );
}

// Uma linha de aviso do Início. Com `itens`, "Quais?" abre a lista das TVs embaixo.
function LinhaDeAviso({ a }) {
  const [aberto, setAberto] = React.useState(false);
  const id = 'aviso-' + a.id;
  return (
    <li className={'rounded-lg border px-3 py-2 text-sm ' + (a.tom === 'danger' ? 'border-danger/30 bg-danger-soft text-ink' : a.tom === 'warn' ? 'border-warn/30 bg-warn-soft text-ink' : 'border-line bg-surface-2 text-ink-2')}>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">{a.texto}</span>
        {a.itens && (
          <button type="button" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent hover:underline">
            {aberto ? 'Esconder' : 'Quais?'} <ChevronDown size={14} className={aberto ? 'rotate-180 transition' : 'transition'} />
          </button>
        )}
        <button type="button" onClick={a.on} className="shrink-0 font-semibold text-accent hover:underline">{a.acao}</button>
      </div>
      {a.itens && aberto && (
        <ul id={id} className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
          {a.itens.map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-ink" title={i.nome}>{i.nome}</span>
              {i.detalhe && <span className="shrink-0 text-xs text-ink-3">{i.detalhe}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
