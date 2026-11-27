import React, { useState } from 'react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { EmptyState, Spinner } from '../ui/Feedback.jsx';
import { Button } from '../ui/Button.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { agente } from '../../api.js';
import { formatNumber, relativeTime } from '../../lib/format.js';
import { aviso } from '../../lib/avisos.js';

/*
 * O AGENTE DO CRIAR na Plataforma (server/agente/registro.js).
 *
 * AgenteResumo: as contagens, ao lado da Qualidade das gerações — quantas
 * voltas viraram plano, pergunta, recusa (e de que tipo), quantas caíram
 * para o fluxo de antes, quanto foi para as TVs e o gasto médio. Só
 * contagens: nem conta, nem pessoa, nem texto.
 *
 * AgenteDaConta: dentro da ficha de uma conta, o freio dela (desligar o
 * agente só nesta conta, sem deploy) e as últimas voltas, com os passos, o
 * gasto, a conferência e o que foi publicado — o que o suporte precisa
 * para entender um caso.
 */
const MOTIVO = {
  'recusa:fora': 'fora do escopo', 'recusa:injecao': 'tentou mudar as regras', 'recusa:privacidade': 'privacidade', 'recusa:regra': 'regra de conteúdo',
  'recusa:laco': 'pedido em laço', 'recusa:proibido': 'apagar, plano ou equipe', 'recusa:freio': 'freio de pedidos', 'recusa:ia': 'a IA recusou',
  'queda:prazo': 'caiu: prazo', 'queda:passos': 'caiu: passos', 'queda:orcamento': 'caiu: gasto', 'queda:ia-fora': 'caiu: IA fora', 'queda:erro': 'caiu: erro', 'queda:execucao': 'caiu na execução',
};
const centavos = (c) => 'R$ ' + ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');

export function AgenteResumo({ dias }) {
  const { data, loading } = useAsync(() => agente.resumo(dias), [dias]);
  return (
    <Panel>
      <PanelHeader title="Agente do Criar"
        description={'O que o agente fez: planos, perguntas, recusas, quedas para o fluxo de antes e o que foi para as TVs.'
          + (data && data.desligadoGlobal ? ' Desligado para todas as contas (MT_AGENTE=desligado).' : '')} />
      <div className="p-4">
        {loading && !data && <div className="py-6 text-center"><Spinner size={18} /></div>}
        {data && !data.voltas && <EmptyState title="Nada na janela" description="As voltas do agente aparecem aqui a partir deste deploy." />}
        {data && !!data.voltas && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[['Voltas', data.voltas], ['Planos', data.planos], ['Perguntas', data.perguntas], ['Recusas', data.recusas], ['Quedas', data.quedas], ['Execuções', data.execucoes],
                ['Na TV', data.publicados], ['Para aprovação', data.paraAprovacao], ['Passos (média)', data.passosMedios]].map(([r, v]) => (
                <div key={r} className="rounded-md border border-line bg-surface-2 px-2 py-1.5">
                  <div className="text-2xs text-ink-3">{r}</div>
                  <div className="tnum text-sm font-semibold text-ink">{typeof v === 'number' && !Number.isInteger(v) ? v : formatNumber(v)}</div>
                </div>
              ))}
              <div className="col-span-3 text-2xs text-ink-3">Gasto de texto: {centavos(data.gastoCentavos)} no total · {centavos(data.gastoMedioCentavos)} por volta</div>
            </div>
            <div>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-3">Recusas e quedas</div>
              {!data.porMotivo.length && <p className="text-xs text-ink-3">Nenhuma.</p>}
              {data.porMotivo.slice(0, 8).map((x) => (
                <div key={x.chave} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-ink">{MOTIVO[x.chave] || x.chave}</span>
                  <span className="tnum text-ink-3">{formatNumber(x.n)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

const TIPO = { plano: 'plano', pergunta: 'pergunta', resposta: 'resposta', recusa: 'recusa', queda: 'caiu', execucao: 'execução' };

export function AgenteDaConta({ id }) {
  const { data, loading, reload } = useAsync(() => agente.daConta(id), [id]);
  const [busy, setBusy] = useState(false);
  const [aberta, setAberta] = useState(null);
  async function alternar() {
    setBusy(true);
    try {
      await agente.desligarConta(id, !data.desligado);
      aviso.ok(data.desligado ? 'Agente ligado de novo nesta conta.' : 'Agente desligado nesta conta: o Criar volta ao fluxo de antes.');
      reload();
    } catch (e) { aviso.erro('agente-conta', e.message || 'Não deu.'); }
    finally { setBusy(false); }
  }
  if (loading && !data) return <div className="py-2"><Spinner size={14} /></div>;
  if (!data) return null;
  return (
    <div>
      <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">Agente do Criar</div>
      <div className="space-y-2 rounded-md border border-line bg-surface-2 p-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-2">
            {!data.ligadoGlobal ? 'Desligado para todas as contas.' : data.desligado ? 'Desligado nesta conta' + (data.desligadoPor ? ' por ' + data.desligadoPor : '') + '.' : 'Ligado nesta conta.'}
          </span>
          <Button size="sm" variant={data.desligado ? 'primary' : 'secondary'} disabled={busy} onClick={alternar} className="ml-auto">
            {data.desligado ? 'Ligar nesta conta' : 'Desligar nesta conta'}
          </Button>
        </div>
        {!data.voltas.length && <p className="text-ink-3">Nenhuma volta do agente ainda.</p>}
        {data.voltas.slice(0, 15).map((v) => (
          <div key={v.id || v.criadoEm} className="border-t border-line pt-1.5 first:border-0 first:pt-0">
            <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setAberta(aberta === v.criadoEm ? null : v.criadoEm)}>
              <span className="shrink-0 font-medium text-ink">{TIPO[v.tipo] || v.tipo}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{v.resumo || v.pedido}</span>
              <span className="shrink-0 text-2xs text-ink-3">{centavos(v.custoCentavos)} · {relativeTime(v.criadoEm)}</span>
            </button>
            {aberta === v.criadoEm && (
              <div className="mt-1 space-y-0.5 pl-2 text-2xs text-ink-3">
                {v.pedido && <p>Pedido: “{v.pedido}”</p>}
                {v.motivo && <p>Motivo: {v.motivo}</p>}
                {(v.passos || []).map((p) => <p key={p.n}>{p.n}. {p.ferramenta || '—'} · {String(p.resultado || '').slice(0, 140)} · {p.ms} ms</p>)}
                {v.publicado && <p>Publicado: {(v.publicado.itens || []).map((i) => i.tipo + ' ' + i.estado + (i.telas ? ' (' + i.telas + ' TVs)' : '')).join(' · ')}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
