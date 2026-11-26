import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, Megaphone, Palette, Pencil, Check, Image as ImageIcon, LayoutTemplate, Ban, CheckCircle2, Clock, XCircle, AlertTriangle, Undo2, Circle, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { MudarAparencia } from '../tela/MudarAparencia.jsx';
import { agente as agenteApi, lote as loteApi } from '../../api.js';
import { aviso } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';

/*
 * O PLANO DO AGENTE (server/agente/), embaixo da mensagem da IA no Criar.
 *
 * O agente divide o pedido em itens, monta o rascunho de cada um e mostra
 * aqui: o que vai, onde e até quando, com o texto que vai para a TV. Nada vai
 * ao ar antes do "Validar e pôr no ar" — esse toque é a validação (o
 * servidor confere a chave DESTE plano). Depois, o agente gera, confere e
 * publica sozinho, e esta caixa mostra o andamento item por item e, no fim,
 * o que foi para as TVs, os avisos e o Desfazer.
 *
 *   mensagem.agente.estado:
 *     esperando    o plano para validar (só o mais novo tem o botão)
 *     perguntando  o que já ficou pronto enquanto a IA pergunta o resto
 *     validado     validado, rodando (quem recarregou volta a acompanhar)
 *     executado    já rodou (o resultado vem na mensagem seguinte)
 *     resultado    o que foi feito, com o Desfazer
 */
const ICONE = { aviso: Megaphone, quiz: HelpCircle, peca: ImageIcon, campanha: LayoutTemplate, tela: Palette, ajuste: Pencil };
const FASE = { espera: 'na fila', fazendo: 'fazendo', feito: 'pronto', barrado: 'não foi', erro: 'não foi', 'nao-mudou': 'não mudou', manual: 'você aplica', salvo: 'salvo' };

export function PlanoDoAgente({ mensagem, conversaId, ativo, onConversa, onIr }) {
  const ag = mensagem && mensagem.agente;
  if (!ag || ag.estado === 'respondido') return null;
  if (ag.estado === 'resultado') return <ResultadoDoAgente resultado={ag.resultado} onIr={onIr} />;
  if (ag.estado === 'perguntando') {
    if (!(ag.itens || []).length) return null;
    return (
      <Caixa>
        <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-ink-3">Já pronto</p>
        {(ag.itens || []).map((i) => <Item key={i.indice} item={i} compacto />)}
      </Caixa>
    );
  }
  return <Plano plano={ag} conversaId={conversaId} ativo={ativo} onConversa={onConversa} />;
}

function Plano({ plano, conversaId, ativo, onConversa }) {
  const [rodando, setRodando] = useState(null);   // { etapa, estados: [] }
  const [erro, setErro] = useState('');
  const [tela, setTela] = useState(null);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);
  const itens = plano.itens || [];
  const vaoAoAr = itens.filter((i) => !i.recusa && !i.manual && !(i.problemas || []).length);
  const podeValidar = ativo && plano.estado === 'esperando' && vaoAoAr.length > 0;

  const acompanhar = (job) => {
    if (!montado.current) return;
    const estados = String(job.detalhe || '').split('|').map((x) => x.split(':')[1]).filter(Boolean);
    setRodando({ etapa: job.etapa || 'trabalhando', estados, segundos: job.segundos || 0 });
  };
  const terminou = (r) => {
    if (!montado.current) return;
    setRodando(null);
    if (r && r.conversa && onConversa) onConversa(r.conversa);
  };

  // Validado e ainda rodando (a pessoa recarregou a página): volta a acompanhar.
  useEffect(() => {
    if (plano.estado !== 'validado') return;
    const p = agenteApi.pendente();
    if (!p) return;
    setRodando({ etapa: 'retomando', estados: [] });
    agenteApi.acompanhar(p.id, acompanhar).then(terminou).catch((e) => { if (montado.current) { setRodando(null); setErro(e.message || 'Não terminou.'); } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function validar() {
    if (!podeValidar || rodando) return;
    setErro('');
    setRodando({ etapa: 'começando', estados: itens.map(() => 'espera') });
    try { terminou(await agenteApi.validar(conversaId, plano.chave, acompanhar)); }
    catch (e) { if (montado.current) { setRodando(null); setErro(e.message || 'Não deu para pôr no ar. Tente de novo.'); } }
  }

  return (
    <Caixa>
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
        <CheckCircle2 size={14} className="shrink-0 text-accent" />
        {itens.length === 1 ? 'O plano' : 'O plano · ' + itens.length + ' itens'}
      </div>
      <ol className="space-y-2">
        {itens.map((i, k) => (
          <Item key={i.indice} item={i} fase={rodando ? rodando.estados[k] || 'espera' : ''}
            onAplicar={i.manual && i.rascunho && i.rascunho.tv ? () => setTela(i.rascunho) : null} />
        ))}
      </ol>
      {rodando && (
        <div className="mt-2 flex items-center gap-2 text-xs text-ink-2" aria-live="polite">
          <Loader2 size={13} className="animate-spin text-accent" /> {rodando.etapa}
        </div>
      )}
      {erro && <p className="mt-2 text-xs text-danger" role="alert">{erro}</p>}
      {podeValidar && !rodando && (
        <div className="mt-2.5 space-y-1">
          <Button size="sm" variant="primary" icon={Check} onClick={validar}>
            {plano.precisaAprovar ? 'Validar e mandar para aprovação' : 'Validar e pôr no ar'}
          </Button>
          <p className="text-2xs text-ink-3">
            {plano.precisaAprovar ? 'Vai para o dono aprovar antes de entrar nas TVs.' : 'Nada vai para as TVs antes deste toque. Depois, dá para desfazer.'}
            {plano.fotos ? ' Gasta ' + plano.fotos + (plano.fotos === 1 ? ' criação' : ' criações') + ' do plano (fotos geradas pela IA).' : ''}
            {' '}Quer mudar algo? É só dizer aqui embaixo.
          </p>
        </div>
      )}
      {!ativo && plano.estado === 'esperando' && <p className="mt-1.5 text-2xs text-ink-3">Este plano foi trocado por um mais novo.</p>}
      {plano.estado === 'executado' && <p className="mt-1.5 text-2xs text-ink-3">Validado e feito: o resultado está logo abaixo.</p>}
      {tela && <MudarAparencia tv={tela.tv} mudancas={tela.mudancas || []} notas={tela.notas || []} onFechar={() => setTela(null)} />}
    </Caixa>
  );
}

// Um item do plano: o que vai, onde e até quando, e o rascunho para conferir.
function Item({ item, fase, compacto, onAplicar }) {
  const Icone = item.recusa ? Ban : ICONE[item.tipo] || ImageIcon;
  const r = item.rascunho || {};
  return (
    <li className="text-xs">
      <div className="flex items-start gap-1.5">
        {fase ? <IconeDaFase fase={fase} /> : <Icone size={13} className={cn('mt-0.5 shrink-0', item.recusa ? 'text-warn' : 'text-ink-3')} />}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{item.titulo}</p>
          {!item.recusa && <p className="text-ink-3">{[item.onde, item.tipo !== 'tela' && item.tipo !== 'ajuste' ? item.quandoTexto : ''].filter(Boolean).join(' · ')}{fase ? ' · ' + (FASE[fase] || fase) : ''}</p>}
        </div>
      </div>
      {!compacto && (
        <div className="mt-1 space-y-1 pl-5">
          {item.recusa && <p className="text-warn">{item.recusa.texto}</p>}
          {r.aviso && <p className="text-ink-2">“{r.aviso.titulo}”{r.aviso.detalhe ? ' — ' + r.aviso.detalhe : ''}{r.aviso.prioridade === 'urgente' ? ' · urgente' : ''}</p>}
          {r.textos && (
            <div className="rounded border border-line bg-surface-2 px-2 py-1.5">
              {r.textos.kicker && <p className="text-2xs uppercase tracking-wider text-ink-3">{r.textos.kicker}</p>}
              <p className="text-sm font-semibold text-ink">{r.textos.titulo}</p>
              {r.textos.apoio && <p className="text-ink-2">{r.textos.apoio}</p>}
              {r.textos.cta && <p className="text-ink-3">{r.textos.cta}</p>}
              {r.foto && <p className="mt-0.5 text-2xs text-ink-3">Com uma foto gerada pela IA (gasta 1 criação).</p>}
            </div>
          )}
          {r.quiz && <Perguntas perguntas={r.quiz.perguntas || []} />}
          {r.descricao && (
            <ul className="space-y-0.5 text-ink-2">
              {r.descricao.map((d, k) => <li key={k}><span className="font-medium">{d.titulo}:</span> {(d.itens || []).join('; ')}</li>)}
            </ul>
          )}
          {r.descricoes && <ul className="list-disc pl-4 text-ink-2">{r.descricoes.map((d, k) => <li key={k}>{d}</li>)}</ul>}
          {r.mudancas && item.tipo === 'tela' && <p className="text-ink-2">{r.mudancas.length + (r.mudancas.length === 1 ? ' mudança' : ' mudanças')} na aparência da TV.</p>}
          {onAplicar && <Button size="sm" variant="secondary" onClick={onAplicar}>Ver como fica e aplicar</Button>}
          {(item.problemas || []).filter((p) => !item.recusa).map((p, k) => <p key={k} className="text-danger">Não vai ao ar: {p.texto}{p.sugestao ? ' Pode ser: “' + p.sugestao + '”.' : ''}</p>)}
          {(item.avisos || []).map((a, k) => <p key={k} className="flex items-start gap-1 text-warn"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{a}</p>)}
        </div>
      )}
    </li>
  );
}

function IconeDaFase({ fase }) {
  if (fase === 'feito') return <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-ok" />;
  if (fase === 'fazendo') return <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-accent" />;
  if (fase === 'barrado' || fase === 'erro' || fase === 'nao-mudou') return <XCircle size={13} className="mt-0.5 shrink-0 text-danger" />;
  return <Circle size={13} className="mt-0.5 shrink-0 text-ink-3" />;
}

// As perguntas do quiz com a certa marcada: validar o plano é o "conferi".
function Perguntas({ perguntas }) {
  return (
    <ol className="space-y-1.5">
      {perguntas.map((p, i) => (
        <li key={i}>
          <p className="font-medium text-ink">{i + 1}. {p.pergunta}</p>
          <ul className="pl-3">
            {(p.alternativas || []).map((a, j) => (
              <li key={j} className={cn('flex items-start gap-1', j === p.certa ? 'font-medium text-accent' : 'text-ink-2')}>
                {j === p.certa ? <Check size={11} className="mt-0.5 shrink-0" /> : <span className="w-[11px] shrink-0" />}{a}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/*
 * O que foi feito: na TV, esperando a aprovação, o que não foi (e por quê),
 * os avisos (o fato que ninguém disse) e o Desfazer de tudo o que foi para
 * as TVs (cada envio em lote volta ao que era).
 */
function ResultadoDoAgente({ resultado, onIr }) {
  const [desfeito, setDesfeito] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const itens = (resultado && resultado.itens) || [];
  const lotes = (resultado && resultado.lotes) || [];
  const avisos = [...new Set([].concat(...itens.map((i) => i.avisos || [])))];
  async function desfazer() {
    setDesfazendo(true);
    const mudaram = [];
    let falhou = '';
    for (const id of lotes) {
      try { const r = await loteApi.desfazer(id); for (const t of (r && r.mudaram) || []) mudaram.push(t.nome || 'Uma TV'); }
      catch (e) { if (e.codigo !== 'ja-desfeito' && e.code !== 'ja-desfeito') falhou = e.message || 'falha de conexão'; }
    }
    setDesfazendo(false);
    if (falhou) { aviso.erro('agente-desfazer', 'Não deu para desfazer tudo: ' + falhou); return; }
    setDesfeito(true);
    aviso.ok(mudaram.length ? 'Desfeito. ' + [...new Set(mudaram)].join(', ') + ' foi mudada depois e ficou como está.' : 'Desfeito: as TVs voltaram ao que eram.');
  }
  return (
    <Caixa>
      <ul className="space-y-1.5 text-xs">
        {itens.map((i) => (
          <li key={i.indice} className="flex items-start gap-1.5">
            {i.estado === 'no-ar' ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-ok" />
              : i.estado === 'aprovacao' ? <Clock size={13} className="mt-0.5 shrink-0 text-warn" />
                : i.estado === 'manual' || i.estado === 'salvo' ? <Circle size={13} className="mt-0.5 shrink-0 text-ink-3" />
                  : <XCircle size={13} className="mt-0.5 shrink-0 text-danger" />}
            <div className="min-w-0">
              <p className="text-ink">
                <span className="font-medium">{i.titulo}</span>
                {i.estado === 'no-ar' && <span className="text-ink-3"> · {desfeito ? 'desfeito' : 'na TV ' + (i.onde || '')}</span>}
                {i.estado === 'aprovacao' && <span className="text-ink-3"> · esperando a aprovação do dono</span>}
              </p>
              {i.motivo && i.estado !== 'no-ar' && <p className="text-ink-3">{i.motivo}</p>}
            </div>
          </li>
        ))}
      </ul>
      {!!avisos.length && (
        <div className="mt-2 rounded border border-warn/40 bg-warn-soft px-2 py-1.5 text-xs text-ink">
          <p className="mb-0.5 flex items-center gap-1 font-medium"><AlertTriangle size={12} className="text-warn" /> Confira</p>
          <ul className="list-disc space-y-0.5 pl-4">{avisos.slice(0, 6).map((a, k) => <li key={k}>{a}</li>)}</ul>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {!!lotes.length && !desfeito && <Button size="sm" variant="secondary" icon={Undo2} disabled={desfazendo} onClick={desfazer}>{desfazendo ? 'Desfazendo…' : 'Desfazer'}</Button>}
        {itens.some((i) => i.estado === 'aprovacao') && onIr && <button type="button" onClick={() => onIr('aprovacoes')} className="text-xs font-medium text-accent hover:underline">Ver em Aprovações</button>}
        {itens.some((i) => i.campanhaId) && onIr && <button type="button" onClick={() => onIr('campanhas', { campanha: (itens.find((i) => i.campanhaId) || {}).campanhaId })} className="text-xs font-medium text-accent hover:underline">Abrir em Biblioteca › Campanhas</button>}
      </div>
    </Caixa>
  );
}

function Caixa({ children }) {
  return <div className="ml-6 max-w-[85%] rounded-lg border border-line bg-surface px-3 py-2">{children}</div>;
}
