import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, LayoutTemplate, MonitorPlay, Pencil, Plus, X } from 'lucide-react';
import '../../../js/templates.js';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { EmptyState } from '../components/ui/Feedback.jsx';
import { PecaHtml } from '../components/content/PecaHtml.jsx';
import { EditarPeca } from '../components/content/EditarPeca.jsx';
import { Palco } from '../components/content/VerTelaAgora.jsx';
import { MARCAS_DO_RAMO } from '../lib/modelosOuro.js';
import { gravarEmLote, avisarComDesfazer } from '../lib/rodar.js';
import { AtalhosDeGrupo } from '../components/tela/AtalhosDeGrupo.jsx';
import { aviso } from '../lib/avisos.js';
import { cn } from '../lib/cn.js';
import {
  montarTela, estadoDaPrevia, aplicarTelaPronta, medirZonas, perfilDaTela, emPe, tvEmPe, ordemDasTelas,
} from '../lib/telasProntas.js';

/*
 * AS TELAS PRONTAS (EXECUTOR D18): a tela inteira — cabeçalho, principal,
 * lateral e rodapé — pronta, com a marca da conta. O cliente escolhe, troca
 * os textos de exemplo pelos dele e põe na TV. Nada de IA, nada cobrado: é o
 * caminho mais curto entre "comprei a TV" e "tem coisa boa passando".
 *
 * Fase 10 (reteste do bloco 8: "a Biblioteca tem até 4 níveis"): a galeria
 * deixou de ser uma página à parte, sob a parte "Telas inteiras". As telas
 * entram na mesma grade das peças, em Biblioteca › Prontos para você
 * (PecasProntasPage.jsx), com o filtro "Telas inteiras". Aqui ficam a lista
 * da conta, o vazio e a tela escolhida, para trocar os textos e pôr na TV.
 */
const ORDEM = ['cabecalho', 'principal', 'lateral', 'rodape'];
const NOME_DO_GRUPO = { cabecalho: 'Cabeçalho', principal: 'Principal', lateral: 'Lateral', rodape: 'Rodapé' };
const MAX_FRASES = 8;

/*
 * As telas da conta, na ordem: primeiro as do tipo de negócio dela; com
 * `todas`, as de outros negócios também ("Ver também os de outros negócios").
 */
export function telasDaConta(dados, marca, perfilId, tvs, todas) {
  if (!dados || !marca) return [];
  const doPerfil = (t) => perfilDaTela(t) === perfilId;
  /*
   * Fase 10: a tela de outro negócio (a "Semana do sol" da ótica, na
   * padaria) só aparece em "Todas". Vale quando a Marca sabe o ramo da conta.
   */
  const doRamo = MARCAS_DO_RAMO[marca.ramo];
  const deOutroNegocio = (t) => !!doRamo && !doRamo.includes(t.marca) && !(t.ramos || []).includes(marca.ramo);
  // Fase 9: o pacote do negócio da conta primeiro, na orientação das TVs dela (lib/telasProntas.js).
  const emPeAsTvs = tvs.length ? tvs.every((d) => tvEmPe(d) === true) : null;
  return ordemDasTelas(dados.telas.filter((t) => todas || (doPerfil(t) && !deOutroNegocio(t))), marca.ramo, emPeAsTvs)
    .sort((a, b) => Number(doPerfil(b)) - Number(doPerfil(a)));
}

// A tela montada com a marca da conta (as peças e as frases do rodapé), para a prévia e para usar.
export const montar = (tela, dados, marca) => montarTela(tela, dados.modelos, marca, dados.exemplos);

// O vazio do filtro "Telas inteiras": a TV desenhada e o próximo passo.
export function SemTelasProntas({ temOutras, onVerOutras, onVerPecas }) {
  return (
    <EmptyState icon={LayoutTemplate} title="As telas prontas do seu tipo de negócio estão chegando" exemplo={['Tela pronta', 'A TV inteira, com a sua marca', 'é só trocar o texto']}
      description={temOutras ? 'Enquanto isso, veja as que já estão prontas para outros negócios.' : 'Enquanto isso, as peças prontas já estão com a sua marca.'}
      action={temOutras
        ? <Button variant="secondary" onClick={onVerOutras}>Ver as de outros negócios</Button>
        : <Button variant="secondary" onClick={onVerPecas}>Ver as peças prontas</Button>} />
  );
}

/*
 * A tela escolhida: trocar os textos de exemplo pelos da conta e pôr na TV.
 * `inicial` é a tela montada (montar); `tvs`, as TVs da conta; `telaAlvo`,
 * a TV de onde a pessoa veio (já marcada).
 */
export function PersonalizarTela({ inicial, dados, tvs, telaAlvo, onVoltar, voltarPara, onIr }) {
  const [escolhida, setEscolhida] = useState(() => JSON.parse(JSON.stringify(inicial)));   // a tela montada, com os textos que a pessoa trocou
  const [editadas, setEditadas] = useState(new Set());
  const [editando, setEditando] = useState(null);     // { grupo, indice }
  const [porNaTv, setPorNaTv] = useState(false);
  const [alvos, setAlvos] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const zonas = useMemo(() => (escolhida ? medirZonas(escolhida.layout) : {}), [escolhida && escolhida.layout]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirPorNaTv() {
    const cabem = tvs.filter((d) => tvEmPe(d) == null || tvEmPe(d) === emPe(escolhida.layout)).map((d) => d.id);
    setAlvos(telaAlvo && cabem.includes(telaAlvo) ? [telaAlvo] : cabem.length === 1 ? cabem : []);
    setPorNaTv(true);
  }

  async function enviar() {
    setEnviando(true);
    try {
      // D26: todas as TVs de uma vez (tudo ou nada), com Desfazer.
      const r = await gravarEmLote(alvos.map((id) => tvs.find((d) => d.id === id) || { id, name: 'Tela' }),
        (cfg) => aplicarTelaPronta(cfg, escolhida), 'Tela pronta: ' + escolhida.nome);
      avisarComDesfazer('“' + escolhida.nome + '” na TV: ' + alvos.length + (alvos.length === 1 ? ' tela.' : ' telas.'), r.lote);
      setPorNaTv(false);
    } catch (e) { aviso.erro('tela-pronta', e.message || 'Não deu para pôr na TV.'); }
    finally { setEnviando(false); }
  }

  const grupos = ORDEM.filter((g) => (escolhida.grupos[g] || []).length || (g === 'rodape' && zonas.rodape));
  const faltam = ORDEM.reduce((n, g) => n + (escolhida.grupos[g] || []).filter((_, i) => !editadas.has(g + i)).length, 0);
  // As peças em que a limpeza do exemplo deixou um contato vazio (telas prontas: nada da empresa de exemplo na TV).
  const completar = ORDEM.reduce((n, g) => n + (escolhida.grupos[g] || []).filter((p, i) => !editadas.has(g + i) && p._pendentes && p._pendentes.length).length, 0);
  const pecaEmEdicao = editando && escolhida.grupos[editando.grupo][editando.indice];
  const nomeDaPeca = (p) => ((dados.modelos.get(p.origem && p.origem.base) || {}).nome) || 'Peça';
  const trocarFrase = (i, v) => setEscolhida((t) => ({ ...t, mensagens: t.mensagens.map((m, j) => (j === i ? v : m)) }));

  return (
    <div className="max-w-6xl">
      <button type="button" onClick={onVoltar} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft size={15} /> {voltarPara || 'Prontos para você'}
      </button>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{escolhida.nome}</h1>
          <p className="mt-1 text-sm text-ink-2">Troque os textos de exemplo pelos seus e ponha na TV.</p>
        </div>
        <Button variant="primary" icon={MonitorPlay} onClick={abrirPorNaTv}>Pôr na TV</Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Palco estado={estadoDaPrevia(escolhida)} alturaMaxima={560} />
          {faltam > 0 && (
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-ink">
              Os textos vieram de uma empresa de exemplo. Troque preços, nomes e horários pelos seus antes de pôr na TV
              {' '}({faltam === 1 ? 'falta 1 peça' : 'faltam ' + faltam + ' peças'}).
              {completar > 0 && ' Telefone, endereço e link do QR do exemplo já saíram: complete os seus em ' + (completar === 1 ? '1 peça.' : completar + ' peças.')}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {grupos.map((g) => {
            const pecas = escolhida.grupos[g] || [];
            const lugar = zonas[g];
            return (
              <section key={g}>
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">
                  {NOME_DO_GRUPO[g]}{pecas.length > 1 ? ' · ' + pecas.length + ' peças que se revezam' : ''}
                </h2>
                <div className="space-y-2">
                  {pecas.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
                      {/* Uma caixa só para toda miniatura: a faixa fica larga e baixa, a lateral estreita e alta. */}
                      <div className="flex h-14 w-20 shrink-0 items-center justify-center sm:w-36">
                        <PecaHtml item={p} tamanho={lugar && lugar.tamanho} fitHeight mensagens={g === 'rodape' ? escolhida.mensagens : undefined} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">{nomeDaPeca(p)}</div>
                        {editadas.has(g + i)
                          ? <div className="flex items-center gap-1 text-2xs text-ok"><Check size={12} /> textos seus</div>
                          : <div className="text-2xs text-ink-3">textos de exemplo</div>}
                      </div>
                      <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditando({ grupo: g, indice: i })}>Trocar textos</Button>
                    </div>
                  ))}
                </div>
                {g === 'rodape' && (
                  <div className="mt-2 space-y-1.5">
                    <span className="block text-xs font-medium text-ink-2">Frases que passam no rodapé</span>
                    {escolhida.mensagens.map((m, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input value={m} maxLength={80} onChange={(e) => trocarFrase(i, e.target.value)} aria-label={'Frase ' + (i + 1)}
                          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink" />
                        <button type="button" aria-label={'Tirar a frase ' + (i + 1)} onClick={() => setEscolhida((t) => ({ ...t, mensagens: t.mensagens.filter((_, j) => j !== i) }))}
                          className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"><X size={15} /></button>
                      </div>
                    ))}
                    {escolhida.mensagens.length < MAX_FRASES && (
                      <button type="button" onClick={() => setEscolhida((t) => ({ ...t, mensagens: t.mensagens.concat('') }))}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"><Plus size={13} /> Pôr outra frase</button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {pecaEmEdicao && (
        <EditarPeca item={pecaEmEdicao} label={nomeDaPeca(pecaEmEdicao)} lugar={zonas[editando.grupo]}
          onFechar={() => setEditando(null)}
          onSalvar={async (novo) => {
            const { grupo, indice } = editando;
            const { _pendentes, ...editado } = novo; // eslint-disable-line no-unused-vars
            setEscolhida((t) => ({ ...t, grupos: { ...t.grupos, [grupo]: t.grupos[grupo].map((p, i) => (i === indice ? editado : p)) } }));
            setEditadas((s) => new Set(s).add(grupo + indice));
            setEditando(null);
          }} />
      )}

      {porNaTv && (
        <Dialog open onClose={() => setPorNaTv(false)} title="Pôr na TV"
          description="A TV passa a mostrar esta tela inteira. O que ela mostra hoje sai da tela (as campanhas continuam guardadas)."
          footer={<>
            <Button variant="ghost" onClick={() => setPorNaTv(false)}>Cancelar</Button>
            <Button variant="primary" icon={MonitorPlay} disabled={!alvos.length || enviando} onClick={enviar}>
              {enviando ? 'Pondo…' : alvos.length > 1 ? 'Pôr em ' + alvos.length + ' TVs' : 'Pôr na TV'}
            </Button>
          </>}>
          {!tvs.length ? (
            <div className="space-y-2 text-sm text-ink-2">
              <p>Você ainda não conectou uma TV.</p>
              <Button size="sm" variant="secondary" onClick={() => onIr && onIr('screens')}>Conectar uma TV</Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <AtalhosDeGrupo telas={tvs} alvos={alvos} onEscolher={setAlvos} podeIr={(d) => tvEmPe(d) == null || tvEmPe(d) === emPe(escolhida.layout)} />
              {tvs.map((d) => {
                const pe = tvEmPe(d);
                const naoCabe = pe != null && pe !== emPe(escolhida.layout);
                const sel = alvos.includes(d.id);
                return (
                  <button key={d.id} type="button" disabled={naoCabe} aria-pressed={sel}
                    onClick={() => setAlvos((a) => (sel ? a.filter((x) => x !== d.id) : a.concat(d.id)))}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                      naoCabe ? 'cursor-not-allowed border-line text-ink-3 opacity-60' : sel ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2 hover:border-ink-3')}>
                    <span className="truncate">{d.name || 'TV'}</span>
                    <span className="shrink-0 text-2xs">{naoCabe ? (pe ? 'esta TV está em pé' : 'esta TV está deitada') : sel ? <Check size={15} /> : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
