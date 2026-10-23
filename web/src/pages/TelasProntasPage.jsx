import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, LayoutTemplate, MonitorPlay, Pencil, Plus, X } from 'lucide-react';
import '../../../js/templates.js';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/ui/Feedback.jsx';
import { PecaHtml } from '../components/content/PecaHtml.jsx';
import { EditarPeca } from '../components/content/EditarPeca.jsx';
import { Palco } from '../components/content/VerTelaAgora.jsx';
import { brand, devices } from '../api.js';
import { usePerfil } from '../lib/perfil.js';
import { gravarEmLote, avisarComDesfazer } from '../lib/rodar.js';
import { AtalhosDeGrupo } from '../components/tela/AtalhosDeGrupo.jsx';
import { aviso } from '../lib/avisos.js';
import { cn } from '../lib/cn.js';
import {
  carregarTelasProntas, montarTela, estadoDaPrevia, aplicarTelaPronta, medirZonas, perfilDaTela, emPe,
} from '../lib/telasProntas.js';

/*
 * MÍDIAS › TELAS PRONTAS (EXECUTOR D18): a tela inteira — cabeçalho,
 * principal, lateral e rodapé — pronta, com a marca da conta. O cliente
 * escolhe, troca os textos de exemplo pelos dele e põe na TV. Nada de IA,
 * nada cobrado: é o caminho mais curto entre "comprei a TV" e "tem coisa
 * boa passando".
 */
const ORDEM = ['cabecalho', 'principal', 'lateral', 'rodape'];
const NOME_DO_GRUPO = { cabecalho: 'Cabeçalho', principal: 'Principal', lateral: 'Lateral', rodape: 'Rodapé' };
const MAX_FRASES = 8;

// A TV está em pé? Pelo que ela contou de si (largura e altura); sem isso, não se sabe.
function tvEmPe(d) {
  const i = d && d.info;
  return i && i.w > 0 && i.h > 0 ? i.h > i.w : null;
}

export function TelasProntasPage({ onIr, telaAlvo }) {
  const perfil = usePerfil();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [marca, setMarca] = useState(null);
  const [tvs, setTvs] = useState([]);
  const [todas, setTodas] = useState(false);
  const [escolhida, setEscolhida] = useState(null);   // a tela montada, com os textos que a pessoa trocou
  const [editadas, setEditadas] = useState(new Set());
  const [editando, setEditando] = useState(null);     // { grupo, indice }
  const [porNaTv, setPorNaTv] = useState(false);
  const [alvos, setAlvos] = useState([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setErro(''); setDados(null);
    carregarTelasProntas().then(setDados).catch((e) => setErro(e.message || 'Não deu para abrir as telas prontas.'));
    brand.get().then((r) => {
      const k = (r && r.kit) || {};
      const local = k.local || {};
      // O site e o endereço da Marca entram onde a tela de exemplo tinha os dela.
      setMarca({ cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '', nome: (k.nome && k.nome !== 'Marca principal' ? k.nome : (r && r.empresa)) || '',
        site: k.site || '', endereco: [local.endereco, local.bairro].filter(Boolean).join(' · ') });
    }).catch(() => setMarca({}));
    devices.list().then((r) => setTvs((r && r.devices) || [])).catch(() => setTvs([]));
  }, [tentativa]);

  // Primeiro as do tipo de negócio da conta; "Ver todas" mostra as outras também.
  const lista = useMemo(() => {
    if (!dados || !marca) return [];
    const doPerfil = (t) => perfilDaTela(t) === perfil.id;
    return dados.telas.filter((t) => todas || doPerfil(t))
      .sort((a, b) => Number(doPerfil(b)) - Number(doPerfil(a)))
      .map((t) => ({ tela: t, montada: montarTela(t, dados.modelos, marca, dados.exemplos) }));
  }, [dados, marca, perfil.id, todas]);

  const zonas = useMemo(() => (escolhida ? medirZonas(escolhida.layout) : {}), [escolhida && escolhida.layout]); // eslint-disable-line react-hooks/exhaustive-deps

  function usar(montada) {
    setEscolhida(JSON.parse(JSON.stringify(montada)));
    setEditadas(new Set());
    window.scrollTo({ top: 0 });
  }

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

  if (erro) return <ErrorState title="Não deu para abrir as telas prontas" description={erro} onRetry={() => setTentativa((n) => n + 1)} />;
  if (!dados || !marca) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;

  /* ---------------- Personalizar a tela escolhida ---------------- */
  if (escolhida) {
    const grupos = ORDEM.filter((g) => (escolhida.grupos[g] || []).length || (g === 'rodape' && zonas.rodape));
    const faltam = ORDEM.reduce((n, g) => n + (escolhida.grupos[g] || []).filter((_, i) => !editadas.has(g + i)).length, 0);
    // As peças em que a limpeza do exemplo deixou um contato vazio (telas prontas: nada da empresa de exemplo na TV).
    const completar = ORDEM.reduce((n, g) => n + (escolhida.grupos[g] || []).filter((p, i) => !editadas.has(g + i) && p._pendentes && p._pendentes.length).length, 0);
    const pecaEmEdicao = editando && escolhida.grupos[editando.grupo][editando.indice];
    const nomeDaPeca = (p) => ((dados.modelos.get(p.origem && p.origem.base) || {}).nome) || 'Peça';
    const trocarFrase = (i, v) => setEscolhida((t) => ({ ...t, mensagens: t.mensagens.map((m, j) => (j === i ? v : m)) }));

    return (
      <div className="max-w-6xl">
        <button type="button" onClick={() => setEscolhida(null)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
          <ArrowLeft size={15} /> Telas prontas
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

  /* ---------------- A galeria ---------------- */
  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Telas prontas</h1>
          <p className="mt-1 text-sm text-ink-2">A tela inteira, já com a sua marca. Escolha, troque os textos e ponha na TV.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {[[false, 'Para a ' + (perfil.lugar || 'sua empresa')], [true, 'Todas']].map(([v, nome]) => (
            <button key={String(v)} type="button" onClick={() => setTodas(v)} aria-pressed={todas === v}
              className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition', todas === v ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>{nome}</button>
          ))}
        </div>
      </div>

      {!lista.length ? (
        <EmptyState icon={LayoutTemplate} title="As telas prontas do seu tipo de negócio estão chegando"
          description={dados.telas.length ? 'Enquanto isso, veja as que já estão prontas para outros negócios.' : 'Enquanto isso, as peças prontas já estão com a sua marca.'}
          action={dados.telas.length
            ? <Button variant="secondary" onClick={() => setTodas(true)}>Ver todas</Button>
            : <Button variant="secondary" onClick={() => onIr && onIr('pecas')}>Ver peças prontas</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map(({ tela, montada }) => (
            <div key={tela.id} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex min-h-[13rem] items-center justify-center bg-surface-2 p-2">
                <Palco estado={estadoDaPrevia(montada)} alturaMaxima={192} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-ink">{tela.nome}</h3>
                    {emPe(tela.layout) && <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-2xs text-ink-3">TV em pé</span>}
                  </div>
                  {tela.sobre && <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{tela.sobre}</p>}
                </div>
                <Button className="mt-auto" variant="secondary" onClick={() => usar(montada)}>Usar esta tela</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
