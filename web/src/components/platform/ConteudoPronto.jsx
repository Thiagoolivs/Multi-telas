import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, RotateCcw } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner, ErrorState, EmptyState } from '../ui/Feedback.jsx';
import { Badge } from '../ui/Badge.jsx';
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

export function ConteudoPronto() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState('telas');
  const [filtro, setFiltro] = useState('proposta');
  const [decidindo, setDecidindo] = useState('');

  async function carregar() {
    setErro('');
    try {
      await carregarDesenhista();
      const m = await plataforma.conteudo();
      // Todas as peças, de qualquer estado: a galeria mostra também as que ainda não foram aprovadas.
      const abertas = await Promise.all((m.pecas || []).map((p) => fetch('/pecas-ouro/' + p.id + '.html')
        .then((r) => (r.ok ? r.text() : '')).then((t) => (t ? { ...p, arq: globalThis.MTPecaHtml.doArquivo(t) } : null)).catch(() => null)));
      setDados({ m, modelos: new Map(abertas.filter(Boolean).map((x) => [x.id, x])), exemplos: nomesDeExemplo(m.marcas) });
    } catch (e) { setErro(e.message || 'Não deu para abrir o conteúdo pronto.'); }
  }
  useEffect(() => { carregar(); }, []);

  const marcaDe = (id) => { const k = ((dados && dados.m.marcas) || []).find((x) => x.id === id) || {}; return { nome: k.nome || '', cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '' }; };
  const lista = useMemo(() => {
    if (!dados) return [];
    const itens = tipo === 'telas' ? dados.m.telas || [] : dados.m.pecas || [];
    return itens.filter((x) => filtro === 'todas' || (filtro === 'proposta' ? esperando(x.estado) : x.estado === filtro));
  }, [dados, tipo, filtro]);
  const contar = (e) => (dados ? ((tipo === 'telas' ? dados.m.telas : dados.m.pecas) || []).filter((x) => (e === 'proposta' ? esperando(x.estado) : e === 'todas' ? true : x.estado === e)).length : 0);

  async function decidir(qual, item, estado) {
    setDecidindo(qual + ':' + item.id);
    try {
      await plataforma.decidirConteudo(qual, item.id, estado);
      setDados((d) => {
        const chave = qual === 'tela' ? 'telas' : 'pecas';
        return { ...d, m: { ...d.m, [chave]: d.m[chave].map((x) => (x.id === item.id ? { ...x, estado } : x)) } };
      });
      aviso.ok((qual === 'tela' ? 'Tela' : 'Peça') + ' "' + (item.nome || item.id) + '": ' + (estado === 'aprovada' ? 'aprovada. Já aparece para as contas.' : estado === 'recusada' ? 'recusada.' : 'de volta à espera.'));
    } catch (e) { aviso.erro('conteudo', e.message || 'Não deu para salvar a decisão.'); }
    finally { setDecidindo(''); }
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
        {erro ? <ErrorState description={erro} onRetry={carregar} /> : !dados ? (
          <div className="flex justify-center py-10"><Spinner size={20} /></div>
        ) : !lista.length ? (
          <EmptyState title={filtro === 'proposta' ? 'Nada esperando você' : 'Nada aqui'} description="Quando chegar um lote novo, ele aparece em “Esperando você”." />
        ) : (
          <div className={cn('grid gap-3', tipo === 'telas' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-3 xl:grid-cols-4')}>
            {lista.map((x) => {
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
                    <div className="mt-auto flex flex-wrap gap-1.5">
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
