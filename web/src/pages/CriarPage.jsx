import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Wand2, MessageSquare, RotateCcw, Zap, CloudOff } from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';
import { CartaoEscopo, linhaDoCusto } from '../components/criar/CartaoEscopo.jsx';
import { ResultadoCampanha } from '../components/criar/ResultadoCampanha.jsx';
import { PorPraRodar } from '../components/criar/PorPraRodar.jsx';
import { ProximoPasso } from '../components/layout/ProximoPasso.jsx';
import { ai, criar, devices, seasons } from '../api.js';
import { ideiaDaData } from '../lib/ideiaDaData.js';
import E from '../lib/escopo.js';
import { opcoesDoPerfil, opcaoDoPerfil } from './CriacaoRapidaPage.jsx';
import { usePerfil } from '../lib/perfil.js';
import { aviso } from '../lib/avisos.js';
import { cn } from '../lib/cn.js';

/*
 * CRIAR É A CONVERSA (EXECUTOR §2b, item 24).
 *
 * O dono, em 21/10: "clicou em criar > o que você quer exibir hoje? > o chat
 * de refinamento, sem limite de perguntas, a pessoa refina até o próprio
 * chat falar que entendeu > a IA gera o ecossistema inteiro > é salvo
 * automaticamente com a opção de já colocar pra rodar".
 *
 *   - A pessoa conta o que quer e para que. A IA pergunta, propõe, e o
 *     cartão "O que vou criar" mostra, zona por zona, o que vai sair.
 *   - O cartão se mexe à mão (mais, menos, que TV, quais redes): é o pedido.
 *   - As SUGESTÕES são da conta (o guia lê a marca, o segmento e a data) e
 *     as entradas de sempre viram começos de frase: um toque põe o texto na
 *     caixa e já monta um cartão, e a pessoa muda o que quiser.
 *   - "Gerar" acende quando a IA diz que entendeu; "Gerar já" é para quem
 *     não quer conversar.
 *
 * Os quatro passos de antes continuam em "Criação rápida" (Meus Designs ›
 * Mais), para quem já sabe o que quer.
 */

// A conversa aberta, para quem recarrega o app voltar no mesmo ponto.
const GUARDA = 'mt.criar.conversa';
const lerGuarda = () => { try { return localStorage.getItem(GUARDA) || ''; } catch (e) { return ''; } };
const guardar = (id) => { try { if (id) localStorage.setItem(GUARDA, id); else localStorage.removeItem(GUARDA); } catch (e) { /* sem armazenamento, sem retomar */ } };

const IMAGENS_DO_GUIA = { gerar: 'gerar', acervo: 'minhas', nenhuma: 'nenhuma' };

// Um cartão já montado a partir de um começo: o cliente gera direto, ou conversa e muda.
function cartaoInicial(nome, objetivo, telaId, imagens, zona) {
  const base = E.padrao();
  if (telaId) base.telas[0].alvo = { tipo: 'tela', id: telaId };
  // Vindo do Adicionar de uma zona (item 32): o cartão já pede só aquela zona.
  if (zona && base.telas[0].zonas[zona]) {
    for (const z of E.ZONAS) base.telas[0].zonas[z].pecas = z === zona ? (z === 'principal' ? 2 : 1) : 0;
    for (const r of E.REDES) base.redes[r] = false;
  }
  return E.normalizar({ ...base, nome, objetivo, imagens: imagens || base.imagens });
}

export function CriarPage({ opcaoInicial, telaInicial, zonaInicial, ideiaInicial, onIr }) {
  const [conversa, setConversa] = useState(null);   // { id, mensagens, escopo, estado, titulo }
  const [mensagens, setMensagens] = useState([]);
  const perfil = usePerfil();
  const [escopo, setEscopo] = useState(() => {
    const op = opcaoDoPerfil(opcaoInicial, perfil.id);
    return op ? cartaoInicial(op.titulo, op.pedido, telaInicial) : (telaInicial ? cartaoInicial('', '', telaInicial, undefined, zonaInicial) : E.vazio());
  });
  const [texto, setTexto] = useState(() => {
    const op = opcaoDoPerfil(opcaoInicial, perfil.id);
    return op ? op.pedido + ': ' : '';
  });
  const [pronto, setPronto] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [ideias, setIdeias] = useState(null);
  const [daData, setDaData] = useState(null);   // a data comemorativa de hoje, como ideia (item 35)
  const [recentes, setRecentes] = useState([]);
  const [telas, setTelas] = useState([]);
  const [gerando, setGerando] = useState(null);     // etapa do trabalho
  const [campanha, setCampanha] = useState(null);
  const [erro, setErro] = useState('');
  const caixa = useRef(null);
  const fim = useRef(null);
  const salvarCartao = useRef(null);

  const conversando = mensagens.length > 0;

  useEffect(() => {
    devices.list().then((r) => setTelas((r && r.devices) || [])).catch(() => setTelas([]));
    criar.conversas().then((r) => setRecentes((r && r.conversas) || [])).catch(() => {});
    // As sugestões da conta. Sem IA, o guia devolve um cardápio genérico — e isso já basta.
    ai.guia({}).then((r) => setIdeias((r && r.sugestoes) || [])).catch(() => setIdeias([]));
    seasons.list().then((r) => {
      const ideia = ideiaDaData(r && r.hoje);
      setDaData(ideia);
      // Veio do Início pelo "Criar para a data": a conversa já começa nela.
      if (ideia && ideiaInicial === 'data') usarIdeia(ideia);
    }).catch(() => {});
    const id = lerGuarda();
    // Quem veio de "Criar para a data" quer a data, não a conversa de ontem por cima dela (D3).
    if (id && !opcaoInicial && !telaInicial && !ideiaInicial) abrir(id);
    // Uma geração que estava rodando quando a aba fechou: volta a acompanhar.
    const pendente = criar.pendente();
    if (pendente) acompanhar(pendente.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (fim.current && conversando) fim.current.scrollIntoView({ block: 'end', behavior: 'instant' }); }, [mensagens, pensando]); // eslint-disable-line react-hooks/exhaustive-deps

  async function abrir(id) {
    try {
      const r = await criar.conversa(id);
      const c = r.conversa;
      setConversa(c); setMensagens(c.mensagens || []); setEscopo(E.normalizar(c.escopo || {}));
      setPronto(c.estado === 'entendido' || c.estado === 'gerado');
      guardar(c.id);
      if (c.campanhaId) {
        const k = await criar.campanha(c.campanhaId).catch(() => null);
        if (k && k.campanha) setCampanha(k.campanha);
      }
    } catch (e) {
      // Conversa que não existe mais é esquecida; falha de rede é dita (antes: silêncio, sem spinner).
      if (e && e.status === 404) guardar('');
      else aviso.erro('criar', 'Não deu para abrir a conversa: ' + (e.message || 'falha de conexão') + '.');
    }
  }

  async function enviar(t) {
    const frase = String(t == null ? texto : t).trim();
    if (!frase || pensando) return;
    setErro(''); setTexto(''); setCampanha(null);
    setMensagens((m) => m.concat({ papel: 'pessoa', texto: frase }));
    setPensando(true);
    try {
      const r = await criar.conversar(conversa && conversa.id, frase, escopo);
      setConversa(r.conversa);
      setMensagens(r.conversa.mensagens || []);
      setEscopo(E.normalizar(r.conversa.escopo || {}));
      setPronto(!!r.pronto);
      guardar(r.conversa.id);
      // A pessoa mandou gerar: começa sem esperar o clique (EXECUTOR §2d, item 37).
      if (r.gerar) gerar({ escopo: E.normalizar(r.conversa.escopo || {}), conversa: r.conversa });
    } catch (e) {
      setErro(e.message || 'A conversa falhou. Tente mandar de novo.');
      setMensagens((m) => m.slice(0, -1));
      setTexto(frase);
    } finally { setPensando(false); }
  }

  // Mexer no cartão é mexer no pedido: guarda (sem IA) para a conversa saber.
  function mudarCartao(novo) {
    setEscopo(novo);
    if (!conversa) return;
    clearTimeout(salvarCartao.current);
    // O ajuste no cartão não pode se perder calado: falhou, a pessoa sabe (D3).
    salvarCartao.current = setTimeout(() => {
      criar.salvarEscopo(conversa.id, novo).catch((e) => aviso.erro('criar', 'O ajuste do cartão não foi salvo: ' + (e.message || 'falha de conexão') + '.'));
    }, 600);
  }

  function usarIdeia(s) {
    setTexto(s.brief || s.titulo || '');
    if (!E.temOQueGerar(escopo)) setEscopo(cartaoInicial(s.titulo || '', s.brief || '', telaInicial, IMAGENS_DO_GUIA[s.imagens]));
    if (caixa.current) caixa.current.focus();
  }

  function usarComeco(op) {
    setTexto(op.pedido + ': ');
    if (!E.temOQueGerar(escopo)) setEscopo(cartaoInicial(op.titulo, op.pedido, telaInicial));
    if (caixa.current) caixa.current.focus();
  }

  async function acompanhar(jobId) {
    setGerando({ etapa: 'retomando a criação', segundos: 0 });
    try {
      const r = await criar.acompanhar(jobId, setGerando);
      if (r && r.campanha) terminou(r.campanha);
    } catch (e) { setErro(e.message || 'A criação não terminou.'); }
    finally { setGerando(null); }
  }

  function terminou(c) {
    setCampanha(c);
    criar.conversas().then((r) => setRecentes((r && r.conversas) || [])).catch(() => {});
    aviso.ok('Pronta e salva em Campanhas.');
  }

  // Do botão, usa o estado da tela; da conversa (a pessoa mandou gerar), o que acabou de voltar.
  async function gerar(daConversa) {
    const esc = (daConversa && daConversa.escopo) || escopo;
    const conv = (daConversa && daConversa.conversa) || conversa;
    if (!E.temOQueGerar(esc) || gerando) return;
    setErro('');
    // O texto que ficou na caixa vale como pedido, mesmo sem ter sido enviado.
    const extra = daConversa ? '' : texto.trim();
    const pedido = extra && !esc.objetivo ? { ...esc, objetivo: extra.slice(0, 300) } : esc;
    setGerando({ etapa: 'começando', segundos: 0 });
    try {
      const r = await criar.gerar({ conversaId: conv ? conv.id : undefined, escopo: pedido }, setGerando);
      if (r && r.campanha) terminou(r.campanha);
    } catch (e) { setErro(e.message || 'Não deu para criar agora. Tente de novo em instantes.'); }
    finally { setGerando(null); }
  }

  function nova() {
    guardar('');
    setConversa(null); setMensagens([]); setEscopo(E.vazio()); setPronto(false); setCampanha(null); setTexto(''); setErro('');
  }

  const podeGerar = E.temOQueGerar(escopo);
  const ultimaIa = [...mensagens].reverse().find((m) => m.papel === 'ia');

  const botaoGerar = (
    <div className="space-y-1.5">
      <Button variant={pronto || !conversando ? 'primary' : 'secondary'} size="lg" icon={pronto ? Wand2 : Zap} disabled={!podeGerar || !!gerando} onClick={() => gerar()} className="w-full justify-center">
        {pronto || !conversando ? 'Gerar' : 'Gerar já'}
      </Button>
      <p className="text-center text-2xs text-ink-3">
        {podeGerar ? linhaDoCusto(escopo) + '. Conversar não gasta nada.' : 'Conte o que você quer mostrar, ou toque numa ideia.'}
      </p>
    </div>
  );

  const entrada = (
    <div className="flex items-end gap-2">
      <textarea ref={caixa} rows={conversando ? 2 : 3} value={texto} onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
        placeholder={conversando ? 'Responda, peça uma mudança ou diga "pode gerar"' : perfil.exemplo}
        aria-label="O que você quer mostrar"
        className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
      <Button variant="primary" icon={Send} disabled={pensando || !texto.trim()} onClick={() => enviar()} aria-label="Enviar">
        <span className="hidden sm:inline">Enviar</span>
      </Button>
    </div>
  );

  if (gerando) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel>
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <Spinner size={26} />
            <div className="text-sm font-semibold text-ink">{gerando.etapa || 'criando'}</div>
            {gerando.detalhe && <div className="text-xs text-ink-3">{gerando.detalhe}</div>}
            <div className="tnum text-2xs text-ink-3">{gerando.segundos || 0}s · pode sair desta tela: a criação continua e fica salva.</div>
          </div>
        </Panel>
      </div>
    );
  }

  if (campanha) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        {!telas.length && (
          <ProximoPasso feito="A campanha está pronta." proximo="ligar a TV — ela já recebe esta campanha." acao="Ligar a TV"
            onIr={() => onIr && onIr('screens', { abrirParear: true })} />
        )}
        <ResultadoCampanha campanha={campanha} telas={telas} onIr={onIr}
          acoes={<PorPraRodar campanha={campanha} telas={telas} onMudou={setCampanha} />}
          onMudou={setCampanha} onNova={nova} />
      </div>
    );
  }

  return (
    <div className={cn('mx-auto', conversando ? 'max-w-5xl' : 'max-w-3xl')}>
      {!conversando && (
        <div className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight text-ink">O que você quer mostrar hoje?</h1>
          <p className="mt-1 text-sm text-ink-2">Um aviso, uma peça ou uma campanha inteira: conte o que você quer, eu sugiro e crio. Também respondo dúvidas sobre o sistema.</p>
        </div>
      )}

      {erro && <div className="mb-3 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{erro}</div>}

      {/* O cartão só aparece quando a conversa decidiu alguma coisa (D5): uma dúvida não monta pedido. */}
      <div className={cn(conversando && podeGerar && 'lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-4')}>
        <div className="space-y-3">
          {conversando && (
            <Panel>
              <div className="space-y-2.5 p-3" aria-live="polite">
                {mensagens.map((m, i) => (
                  <div key={i} className={m.papel === 'ia' ? 'flex gap-2' : 'flex justify-end'}>
                    {m.papel === 'ia' && (m.falha
                      ? <CloudOff size={14} className="mt-1 shrink-0 text-warn" aria-hidden />
                      : <MessageSquare size={14} className="mt-1 shrink-0 text-ink-3" />)}
                    {/* Falha da IA (m.falha) parece aviso, não resposta: a pessoa vê que foi a IA que caiu. */}
                    <div className={cn('max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-sm',
                      m.papel !== 'ia' ? 'rounded-tr-sm bg-accent text-accent-fg'
                        : m.falha ? 'rounded-tl-sm border border-warn/40 bg-warn-soft text-ink' : 'rounded-tl-sm bg-surface-2 text-ink')}>{m.texto}</div>
                  </div>
                ))}
                {pensando && <div className="flex items-center gap-2 text-xs text-ink-3"><Spinner size={13} /> pensando…</div>}
                {/* As respostas prontas da última fala da IA: na voz da pessoa, um toque manda. */}
                {!pensando && ultimaIa && (ultimaIa.sugestoes || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-6">
                    {ultimaIa.sugestoes.map((s) => (
                      <button key={s} type="button" onClick={() => enviar(s)}
                        className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 transition hover:border-accent hover:text-accent">{s}</button>
                    ))}
                  </div>
                )}
                <div ref={fim} />
              </div>
            </Panel>
          )}

          {/* No celular, o cartão fica entre a conversa e a caixa, recolhido numa linha. */}
          {podeGerar && (
            <div className="space-y-2 lg:hidden">
              <CartaoEscopo escopo={escopo} onChange={mudarCartao} telas={telas} recolhivel />
              {botaoGerar}
            </div>
          )}

          {entrada}

          {!conversando && (
            <>
              {podeGerar && <div className="hidden lg:block"><CartaoEscopo escopo={escopo} onChange={mudarCartao} telas={telas} />{<div className="mt-2">{botaoGerar}</div>}</div>}

              <div>
                <div className="mb-1.5 text-xs font-medium text-ink-3">Ideias para hoje</div>
                {ideias === null ? <Spinner size={16} /> : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(daData ? [daData, ...ideias] : ideias).slice(0, 3).map((s, i) => (
                      <button key={i} type="button" onClick={() => usarIdeia(s)}
                        className={cn('rounded-lg border p-3 text-left transition hover:border-accent/60', s.daData ? 'border-accent/40 bg-accent-soft/40' : 'border-line bg-surface')}>
                        <div className="text-sm font-semibold text-ink">{s.titulo}</div>
                        {s.porque && <div className="mt-0.5 line-clamp-2 text-xs text-ink-3">{s.porque}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-ink-3">Ou comece por</div>
                <div className="flex flex-wrap gap-1.5">
                  {opcoesDoPerfil(perfil.id).map((op) => (
                    <button key={op.id} type="button" onClick={() => usarComeco(op)}
                      className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-accent/60 hover:text-ink">
                      <op.icone size={13} /> {op.titulo}
                    </button>
                  ))}
                </div>
              </div>

              {recentes.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-ink-3">Continuar uma conversa</div>
                  <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                    {recentes.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => abrir(c.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2">
                          <MessageSquare size={14} className="shrink-0 text-ink-3" />
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.titulo || 'Sem título'}</span>
                          <span className="shrink-0 text-2xs text-ink-3">{c.estado === 'gerado' ? 'criada' : c.estado === 'entendido' ? 'pronta para gerar' : 'conversando'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-xs text-ink-3">
                Já sabe o que quer e prefere ir direto? Use a{' '}
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => onIr && onIr('rapida')}>Criação rápida</button>.
              </p>
            </>
          )}

          {conversando && (
            <button type="button" onClick={nova} className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2">
              <RotateCcw size={12} /> Começar outra conversa
            </button>
          )}
        </div>

        {conversando && podeGerar && (
          <aside className="hidden space-y-2 lg:sticky lg:top-4 lg:block">
            <CartaoEscopo escopo={escopo} onChange={mudarCartao} telas={telas} />
            {botaoGerar}
          </aside>
        )}
      </div>
    </div>
  );
}
