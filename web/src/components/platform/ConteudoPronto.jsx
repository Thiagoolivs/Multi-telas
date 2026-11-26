import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, RotateCcw, ListChecks } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner, ErrorState, EmptyState } from '../ui/Feedback.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Checkbox } from '../ui/Field.jsx';
import { Partes } from '../ui/Partes.jsx';
import { Palco } from '../content/VerTelaAgora.jsx';
import { PecaHtml } from '../content/PecaHtml.jsx';
import { plataforma } from '../../api.js';
import { carregarDesenhista } from '../../lib/pecaHtml.js';
import { itemDoModelo } from '../../lib/modelosOuro.js';
import { montarTela, estadoDaPrevia, nomesDeExemplo, perfilDaTela, emPe } from '../../lib/telasProntas.js';
import { PERFIS } from '../../lib/perfil.js';
import { aviso } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';
import { idsDaLista } from '../../lib/marcarPorLista.js';

/*
 * A GALERIA DO CONTEÚDO PRONTO (fase 9; o dono, em 05/11: "galeria para eu
 * aprovar cada lote. O que aprovo vai para as TVs novas").
 *
 * Mostra cada tela pronta e cada peça-ouro desenhada de verdade, na marca de
 * exemplo dela, com Aprovar e Recusar. A decisão vai para o servidor
 * (server/conteudoPronto.js) e vale na hora: o manifesto que o painel das
 * contas lê já sai com ela. Antes, aprovar era editar o arquivo à mão.
 */
const ESTADOS = [['proposta', 'Esperando você'], ['aprovada', 'Aprovadas'], ['recusada', 'Recusadas'], ['todas', 'Todas']];
const NOME_DA_FRENTE = Object.fromEntries(Object.values(PERFIS).map((p) => [p.id, p.marca ? p.marca.replace(/^MultiTelas\s*/, '') : p.id]));
const esperando = (e) => !e || e === 'proposta' || e === 'rascunho';
const FORMATO_DA_PECA = { destaque: '16/9', lateral: '9/16', cabecalho: 'cabecalho', rodape: 'rodape' };

/*
 * APROVAR SELECIONADOS (reteste 4, 22/11). O dono recebe a lista do que está
 * pronto (docs/qa-total/galeria-para-aprovar/) e aprovava cartão a cartão.
 * Agora marca os cartões (ou cola a lista de ids) e aprova tudo num toque,
 * num pedido só (server/conteudoPronto.js, conferirLote). A marca vale entre
 * "Telas inteiras" e "Peças": a chave leva o tipo ("tela:id", "peca:id").
 */
export function ConteudoPronto() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState('telas');
  const [filtro, setFiltro] = useState('proposta');
  const [decidindo, setDecidindo] = useState('');
  const [marcados, setMarcados] = useState(() => new Set());
  const [colando, setColando] = useState(false);
  const [lista, setLista] = useState('');
  const [emLote, setEmLote] = useState(false);

  async function carregar() {
    setErro('');
    try {
      await carregarDesenhista();
      const m = await plataforma.conteudo();
      // Todas as peças, de qualquer estado: a galeria mostra também as que ainda não foram aprovadas.
      const abertas = await Promise.all((m.pecas || []).map((p) => fetch('/pecas-ouro/' + p.id + '.html')
        .then((r) => (r.ok ? r.text() : '')).then((t) => (t ? { ...p, arq: globalThis.MTPecaHtml.doArquivo(t) } : null)).catch(() => null)));
      setDados({ m, modelos: new Map(abertas.filter(Boolean).map((x) => [x.id, x])), exemplos: nomesDeExemplo(m.marcas, m.dadosDeExemplo) });
    } catch (e) { setErro(e.message || 'Não deu para abrir o conteúdo pronto.'); }
  }
  useEffect(() => { carregar(); }, []);

  const marcaDe = (id) => { const k = ((dados && dados.m.marcas) || []).find((x) => x.id === id) || {}; return { nome: k.nome || '', cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '' }; };
  const itensVistos = useMemo(() => {
    if (!dados) return [];
    const itens = tipo === 'telas' ? dados.m.telas || [] : dados.m.pecas || [];
    return itens.filter((x) => filtro === 'todas' || (filtro === 'proposta' ? esperando(x.estado) : x.estado === filtro));
  }, [dados, tipo, filtro]);
  const contar = (e) => (dados ? ((tipo === 'telas' ? dados.m.telas : dados.m.pecas) || []).filter((x) => (e === 'proposta' ? esperando(x.estado) : e === 'todas' ? true : x.estado === e)).length : 0);

  async function decidir(qual, item, estado) {
    setDecidindo(qual + ':' + item.id);
    try {
      const r = await plataforma.decidirConteudo(qual, item.id, estado);
      // Aprovar a tela aprova as peças dela que esperavam (o servidor diz quais).
      const junto = new Set((r && r.pecas) || []);
      setDados((d) => {
        const chave = qual === 'tela' ? 'telas' : 'pecas';
        const m = { ...d.m, [chave]: d.m[chave].map((x) => (x.id === item.id ? { ...x, estado } : x)) };
        if (junto.size) m.pecas = m.pecas.map((x) => (junto.has(x.id) ? { ...x, estado: 'aprovada' } : x));
        return { ...d, m };
      });
      aviso.ok((qual === 'tela' ? 'Tela' : 'Peça') + ' "' + (item.nome || item.id) + '": ' + (estado === 'aprovada' ? 'aprovada' + (junto.size ? ', com ' + junto.size + (junto.size === 1 ? ' peça nova dela' : ' peças novas dela') : '') + '. Já aparece para as contas.' : estado === 'recusada' ? 'recusada.' : 'de volta à espera.'));
      setMarcados((s) => { const n = new Set(s); n.delete(qual + ':' + item.id); return n; });
    } catch (e) { aviso.erro('conteudo', e.message || 'Não deu para salvar a decisão.'); }
    finally { setDecidindo(''); }
  }

  const qualDoTipo = tipo === 'telas' ? 'tela' : 'peca';
  const marcar = (chave, sim) => setMarcados((s) => { const n = new Set(s); if (sim) n.add(chave); else n.delete(chave); return n; });
  // Só o que ainda não está aprovado entra na marca: aprovar de novo não muda nada.
  const marcaveis = itensVistos.filter((x) => x.estado !== 'aprovada').map((x) => qualDoTipo + ':' + x.id);
  const todosMarcados = marcaveis.length > 0 && marcaveis.every((k) => marcados.has(k));

  function marcarPelaLista() {
    const { achados, sobras } = idsDaLista(lista, dados && dados.m);
    const jaAprovados = new Set([...(dados.m.telas || []).filter((t) => t.estado === 'aprovada').map((t) => 'tela:' + t.id),
      ...(dados.m.pecas || []).filter((p) => p.estado === 'aprovada').map((p) => 'peca:' + p.id)]);
    const novos = achados.filter((k) => !jaAprovados.has(k));
    setMarcados((s) => new Set([...s, ...novos]));
    setColando(false); setLista('');
    aviso.ok(novos.length + (novos.length === 1 ? ' marcado' : ' marcados') + (achados.length > novos.length ? ' (' + (achados.length - novos.length) + ' já estavam aprovados)' : '')
      + (sobras.length ? '. Não achei: ' + sobras.slice(0, 5).join(', ') + (sobras.length > 5 ? '…' : '') : '.'));
  }

  async function aprovarMarcados() {
    const itens = [...marcados].map((k) => { const [t, ...resto] = k.split(':'); return { tipo: t, id: resto.join(':') }; });
    if (!itens.length) return;
    setEmLote(true);
    try {
      const r = await plataforma.decidirConteudoLote(itens, 'aprovada');
      const feitos = new Set(((r && r.decididos) || []).map((x) => x.tipo + ':' + x.id));
      const junto = new Set((r && r.pecas) || []);
      setDados((d) => ({ ...d, m: { ...d.m,
        telas: d.m.telas.map((x) => (feitos.has('tela:' + x.id) ? { ...x, estado: 'aprovada' } : x)),
        pecas: d.m.pecas.map((x) => (feitos.has('peca:' + x.id) || junto.has(x.id) ? { ...x, estado: 'aprovada' } : x)) } }));
      setMarcados(new Set());
      aviso.ok(feitos.size + (feitos.size === 1 ? ' aprovado' : ' aprovados') + (junto.size ? ', com ' + junto.size + (junto.size === 1 ? ' peça das telas' : ' peças das telas') : '') + '. Já aparecem para as contas.');
    } catch (e) { aviso.erro('conteudo', e.message || 'Não deu para aprovar os selecionados. Nada mudou.'); }
    finally { setEmLote(false); }
  }

  return (
    <Panel>
      <PanelHeader title="Conteúdo pronto"
        description="As telas prontas e as peças que as contas veem. Aprove o que pode ir para as TVs; o que você aprova aparece na hora para as contas daquela frente." />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Partes rotulo="O que ver" valor={tipo} onChange={setTipo} opcoes={[['telas', 'Telas inteiras'], ['pecas', 'Peças']]} />
          <Partes rotulo="Estado" valor={filtro} onChange={setFiltro} opcoes={ESTADOS.map(([id, nome]) => [id, nome + ' (' + contar(id) + ')'])} />
        </div>
        {dados && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
            {marcaveis.length > 0 && (
              <Checkbox label={'Marcar todos daqui (' + marcaveis.length + ')'} checked={todosMarcados}
                onChange={(e) => setMarcados((s) => { const n = new Set(s); marcaveis.forEach((k) => (e.target.checked ? n.add(k) : n.delete(k))); return n; })} />
            )}
            <Button size="sm" variant="ghost" icon={ListChecks} onClick={() => setColando((v) => !v)} aria-expanded={colando}>Marcar por lista</Button>
            {marcados.size > 0 && <Button size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>Desmarcar</Button>}
            <Button size="sm" variant="primary" icon={Check} className="ml-auto" disabled={!marcados.size || emLote} onClick={aprovarMarcados}>
              {emLote ? 'Aprovando…' : 'Aprovar selecionados (' + marcados.size + ')'}
            </Button>
            {colando && (
              <div className="w-full space-y-1.5">
                <textarea value={lista} onChange={(e) => setLista(e.target.value)} rows={3} aria-label="Lista de ids para marcar"
                  placeholder="Cole os ids da lista recomendada, um por linha ou separados por vírgula."
                  className="w-full rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-3" />
                <Button size="sm" variant="secondary" disabled={!lista.trim()} onClick={marcarPelaLista}>Marcar estes</Button>
              </div>
            )}
          </div>
        )}
        {erro ? <ErrorState description={erro} onRetry={carregar} /> : !dados ? (
          <div className="flex justify-center py-10"><Spinner size={20} /></div>
        ) : !itensVistos.length ? (
          <EmptyState title={filtro === 'proposta' ? 'Nada esperando você' : 'Nada aqui'} description="Quando chegar um lote novo, ele aparece em “Esperando você”." />
        ) : (
          <div className={cn('grid gap-3', tipo === 'telas' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-3 xl:grid-cols-4')}>
            {itensVistos.map((x) => {
              const qual = tipo === 'telas' ? 'tela' : 'peca';
              const ocupado = decidindo === qual + ':' + x.id;
              const frente = qual === 'tela' ? perfilDaTela(x) : '';
              let previa = null;
              try {
                if (qual === 'tela') previa = <Palco estado={estadoDaPrevia(montarTela(x, dados.modelos, marcaDe(x.marca), dados.exemplos))} alturaMaxima={emPe(x.layout) ? 300 : 200} />;
                else if (dados.modelos.has(x.id)) {
                  const papel = (x.papeis && x.papeis[0]) || 'destaque';
                  previa = <PecaHtml item={itemDoModelo(dados.modelos.get(x.id), marcaDe(x.marca))} formato={FORMATO_DA_PECA[papel] || '16/9'} />;
                }
              } catch (e) { previa = <p className="p-3 text-xs text-danger">Não deu para desenhar: {e.message}</p>; }
              return (
                <article key={x.id} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
                  <div className="pointer-events-none flex min-h-40 items-center justify-center bg-surface-2 p-2">{previa}</div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink">{x.nome || x.id}</span>
                        <Badge tone={x.estado === 'aprovada' ? 'ok' : x.estado === 'recusada' ? 'danger' : 'warn'}>{x.estado === 'aprovada' ? 'aprovada' : x.estado === 'recusada' ? 'recusada' : 'esperando'}</Badge>
                      </div>
                      <div className="truncate text-2xs text-ink-3">
                        {qual === 'tela'
                          ? [frente && (NOME_DA_FRENTE[frente] || frente), x.lote ? 'lote ' + x.lote : '', emPe(x.layout) ? 'em pé' : /^square/.test(x.layout || '') ? 'quadrada' : 'deitada', x.negocio ? 'pacote ' + x.negocio : '', 'exemplo: ' + (marcaDe(x.marca).nome || x.marca)].filter(Boolean).join(' · ')
                          : [x.familia, (x.papeis || []).join(', '), 'exemplo: ' + (marcaDe(x.marca).nome || x.marca)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-1.5">
                      {x.estado !== 'aprovada' && (
                        <Checkbox label="Marcar" className="mr-1 text-xs" checked={marcados.has(qual + ':' + x.id)} onChange={(e) => marcar(qual + ':' + x.id, e.target.checked)}
                          aria-label={'Marcar ' + (x.nome || x.id)} />
                      )}
                      {x.estado !== 'aprovada' && <Button size="sm" variant="secondary" icon={Check} className="border-ok/50 text-ok" disabled={ocupado} onClick={() => decidir(qual, x, 'aprovada')}>Aprovar</Button>}
                      {x.estado !== 'recusada' && <Button size="sm" variant="ghost" icon={X} disabled={ocupado} onClick={() => decidir(qual, x, 'recusada')}>Recusar</Button>}
                      {!esperando(x.estado) && <Button size="sm" variant="ghost" icon={RotateCcw} disabled={ocupado} onClick={() => decidir(qual, x, 'proposta')}>Voltar à espera</Button>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
