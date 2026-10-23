import React from 'react';
import { Loader2, Check, AlertTriangle, Plus, Sparkles, ArrowRight } from 'lucide-react';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { useTrabalhos, nomeDoTipo, frasePronto, destino } from '../lib/trabalhos.js';
import { cn } from '../lib/cn.js';

/*
 * CRIANDO (EXECUTOR D11): o que a IA está fazendo agora e o que terminou nas
 * últimas 24 horas. Antes, quem saía do Criar no meio de uma campanha não
 * tinha onde ver o andamento — a geração continuava no servidor, mas para a
 * pessoa ela tinha sumido. Daqui dá para acompanhar e abrir o que ficou
 * pronto; o aviso de "ficou pronta" aparece em qualquer página
 * (lib/trabalhos.js).
 */

const quando = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const duracao = (s) => (s >= 60 ? Math.floor(s / 60) + ' min ' + (s % 60) + ' s' : (s || 0) + ' s');
const ROTULO_ABRIR = { campanhas: 'Abrir a campanha', ia: 'Ver a imagem', designs: 'Abrir em Meus Designs' };

export function CriandoPage({ onIr }) {
  const lista = useTrabalhos();
  if (lista === null) return <div className="flex justify-center py-16"><Spinner size={20} /></div>;

  const rodando = lista.filter((j) => j.estado === 'rodando');
  const feitos = lista.filter((j) => j.estado !== 'rodando');

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Criando</h1>
        <p className="mt-1 text-sm text-ink-2">O que a IA está fazendo agora e o que terminou hoje. Pode sair desta tela: a criação continua, e você é avisado quando terminar.</p>
      </div>

      {!lista.length ? (
        <Panel>
          <EmptyState icon={Sparkles} title="Nada sendo criado agora"
            description="Quando você pedir uma campanha ou uma imagem, ela aparece aqui enquanto fica pronta."
            action={<Button variant="primary" icon={Plus} onClick={() => onIr && onIr('criar')}>Criar</Button>} />
        </Panel>
      ) : (
        <>
          {rodando.length > 0 && (
            <Panel>
              <PanelHeader title={'Em andamento (' + rodando.length + ')'} />
              <ul className="divide-y divide-line">
                {rodando.map((j) => (
                  <li key={j.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-accent" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">{(j.pedido && j.pedido.brief) || nomeDoTipo(j.tipo)}</div>
                        <div className="truncate text-xs text-ink-3">{j.etapa ? j.etapa + (j.detalhe ? ' · ' + j.detalhe : '') : 'começando'}</div>
                      </div>
                      <span className="tnum shrink-0 text-2xs text-ink-3">{duracao(j.segundos)}</span>
                    </div>
                    {/* Barra que anda sem prometer porcentagem: a IA não sabe quanto falta. */}
                    <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="mt-andando h-full w-1/3 rounded-full bg-accent" />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {feitos.length > 0 && (
            <Panel>
              <PanelHeader title="Terminaram hoje" />
              <ul className="divide-y divide-line">
                {feitos.map((j) => {
                  const ok = j.estado === 'pronto';
                  const [pagina, params] = destino(j);
                  return (
                    <li key={j.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', ok ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')}>
                        {ok ? <Check size={14} /> : <AlertTriangle size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">{(j.campanha && j.campanha.nome) || (j.pedido && j.pedido.brief) || nomeDoTipo(j.tipo)}</div>
                        <div className="truncate text-xs text-ink-3">
                          {ok ? frasePronto(j.tipo).replace(/\.$/, '') : (j.erro || 'Não saiu')} · {quando(j.criadoEm)} · {duracao(j.segundos)}
                        </div>
                      </div>
                      {ok && onIr && (
                        <Button size="sm" variant="secondary" onClick={() => onIr(pagina, params)}>
                          <span className="hidden sm:inline">{ROTULO_ABRIR[pagina]}</span><ArrowRight size={14} className="sm:ml-1" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
