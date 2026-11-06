import React, { useEffect, useState } from 'react';
import { Store, ShieldCheck } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { Checkbox } from '../ui/Field.jsx';
import { aviso } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';
import { avisarMudanca } from '../layout/SinoAprovacoes.jsx';
import { aprovacoes, lojas } from '../../api.js';

/*
 * FASE 13 na página da Equipe: a chave da aprovação antes de ir ao ar e as
 * lojas de cada membro. Quem obedece é o servidor (server/permissoes.js e
 * server/aprovacao.js); aqui o dono só escolhe.
 */

// As lojas da conta e de quem é cada uma; o dono e o admin leem, o membro vê só as dele.
export function useLojas() {
  const [data, setData] = useState(null);
  const ler = () => lojas.listar().then(setData).catch(() => setData(null));
  useEffect(() => { ler(); }, []);
  return { data, reload: ler };
}

/* A chave: desligada por padrão. Ligada, o que o membro põe na TV vira pedido. */
export function ChaveAprovacao({ podeMudar }) {
  const [ligada, setLigada] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { aprovacoes.contagem().then((r) => setLigada(!!r.ligada)).catch(() => setLigada(false)); }, []);

  async function trocar() {
    setOcupado(true);
    try {
      const r = await aprovacoes.regra(!ligada);
      setLigada(!!r.ligada);
      aviso.ok(r.ligada ? 'Aprovação ligada: o que um membro puser na TV espera o seu OK.' : 'Aprovação desligada: a equipe põe na TV direto.');
      avisarMudanca();
    } catch (e) { aviso.erro('equipe', 'Não deu para mudar a aprovação.', e.message || ''); }
    finally { setOcupado(false); }
  }

  if (ligada === null) return null;
  if (!podeMudar && !ligada) return null;
  return (
    <Panel className="mt-4">
      <PanelHeader title="Aprovação antes de ir ao ar"
        description={podeMudar
          ? 'Ligada, o que um membro põe na TV espera o OK do dono ou de um admin. Você aprova pelo celular, no sino lá em cima. Dono e admin põem direto.'
          : 'Ligada nesta conta: o que você põe na TV espera o OK do dono. A resposta aparece no sino, lá em cima.'} />
      {podeMudar && (
        <div className="flex items-center gap-3 px-4 pb-4">
          <button type="button" role="switch" aria-checked={ligada} aria-label="Aprovação antes de ir ao ar" disabled={ocupado} onClick={trocar}
            className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition disabled:opacity-60',
              ligada ? 'border-transparent bg-ok' : 'border-line-strong bg-surface-2')}>
            <span aria-hidden="true" className={cn('inline-block h-5 w-5 rounded-full bg-white shadow-xs transition', ligada ? 'translate-x-6' : 'translate-x-1')} />
          </button>
          <span className="text-sm text-ink-2">{ligada ? 'Ligada' : 'Desligada'}</span>
        </div>
      )}
    </Panel>
  );
}

const TODAS = 'Todas as TVs';
export function rotuloDasLojas(grupos) {
  return Array.isArray(grupos) ? (grupos.length ? grupos.join(', ') : 'Nenhuma loja') : TODAS;
}

/* A linha de lojas de um membro, com o botão para escolher (dono e admin). */
export function LojasDoMembro({ membro, dados, podeMudar, onMudou }) {
  const [aberto, setAberto] = useState(false);
  if (membro.role !== 'member' || !dados || !dados.membros) return null;
  const grupos = dados.membros[membro.id] || null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-sm text-ink-2"><Store size={13} aria-hidden="true" className="text-ink-3" />Lojas: {rotuloDasLojas(grupos)}</span>
      {podeMudar && <Button size="sm" variant="ghost" onClick={() => setAberto(true)} aria-label={'Escolher as lojas de ' + (membro.name || membro.email)}>Escolher lojas</Button>}
      {aberto && <EscolherLojas membro={membro} atuais={grupos} todas={dados.grupos || []} onFechar={() => setAberto(false)} onSalvo={() => { setAberto(false); onMudou(); }} />}
    </div>
  );
}

function EscolherLojas({ membro, atuais, todas, onFechar, onSalvo }) {
  const [modo, setModo] = useState(Array.isArray(atuais) ? 'algumas' : 'todas');
  const [marcadas, setMarcadas] = useState(() => new Set((atuais || []).map((g) => g.toLowerCase())));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const nome = membro.name || membro.email;

  function alternar(g) {
    setMarcadas((m) => { const n = new Set(m); const k = g.toLowerCase(); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  async function salvar() {
    const escolhidas = todas.map((g) => g.nome).filter((g) => marcadas.has(g.toLowerCase()));
    if (modo === 'algumas' && !escolhidas.length) { setErro('Marque ao menos uma loja, ou escolha "Todas as TVs".'); return; }
    setOcupado(true); setErro('');
    try {
      await lojas.salvar(membro.id, modo === 'todas' ? null : escolhidas);
      aviso.ok(modo === 'todas' ? nome + ' vê todas as TVs.' : nome + ' vê só: ' + escolhidas.join(', ') + '.');
      onSalvo();
    } catch (e) { setErro(e.message || 'Não deu para salvar.'); }
    finally { setOcupado(false); }
  }

  return (
    <Dialog open onClose={onFechar} title={'Lojas de ' + nome}
      description="A pessoa vê e muda só as TVs das lojas marcadas — na lista, no Pôr na TV, nas campanhas, na Agenda e no relatório."
      footer={<>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" icon={ShieldCheck} disabled={ocupado} onClick={salvar}>{ocupado ? 'Salvando…' : 'Salvar'}</Button>
      </>}>
      <fieldset className="space-y-3">
        <legend className="sr-only">O que {nome} alcança</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input type="radio" name="modo-lojas" className="h-4 w-4 accent-accent" checked={modo === 'todas'} onChange={() => setModo('todas')} />
          {TODAS}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input type="radio" name="modo-lojas" className="h-4 w-4 accent-accent" checked={modo === 'algumas'} onChange={() => setModo('algumas')} />
          Só as lojas marcadas
        </label>
        {modo === 'algumas' && (
          todas.length ? (
            <div className="ml-6 space-y-2">
              {todas.map((g) => (
                <Checkbox key={g.nome} checked={marcadas.has(g.nome.toLowerCase())} onChange={() => alternar(g.nome)}
                  label={g.nome + ' (' + g.telas + (g.telas === 1 ? ' TV)' : ' TVs)')} />
              ))}
            </div>
          ) : (
            <p className="ml-6 text-sm text-ink-2">Ainda não há lojas. Dê um grupo às TVs em Telas › Mais opções › Nome e grupo.</p>
          )
        )}
        {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      </fieldset>
    </Dialog>
  );
}
