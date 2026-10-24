import React, { useEffect, useRef, useState } from 'react';
import { Send, Wand2, MessageSquare, Zap, CloudOff, Plus, MessagesSquare, CheckCircle2, ArrowRight } from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { CartaoEscopo, linhaDoCusto } from '../components/criar/CartaoEscopo.jsx';
import { ListaDeConversas } from '../components/criar/ListaDeConversas.jsx';
import { Combinado } from '../components/criar/Combinado.jsx';
import { BotaoAnexar, ReferenciasDoChat, imagensDoColar } from '../components/criar/ReferenciasDoChat.jsx';
import { AprovarEsboco } from '../components/criar/AprovarEsboco.jsx';
import { prepararFoto } from '../lib/subir.js';
import { ai, criar, devices, seasons, brand } from '../api.js';
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
 *     as entradas de sempre viram começos de frase.
 *   - "Gerar" acende quando a IA diz que entendeu; "Gerar já" é para quem
 *     não quer conversar.
 *
 * CRIAR · CRIANDO · CRIADOS (D47, o dono em 23/10): "aparece sempre a última
 * campanha, mas se ela estiver pronta, tem que ficar na aba criados". Agora:
 *   - o Criar começa limpo; só a conversa que ainda não gerou é retomada;
 *   - todas as conversas ficam ao lado (no celular, num botão), com busca;
 *   - terminou de gerar: vai para Criados, com a campanha aberta, e o Criar
 *     volta limpo para a próxima;
 *   - a conversa que já virou campanha abre só para ler, com o caminho para
 *     ela em Criados (é lá que se edita, à mão ou com a IA).
 *
 * SÓ GERA COM O ESBOÇO APROVADO (D42): "Gerar" (ou "pode gerar" na conversa)
 * abre a planta de cada TV com o que vai em cada parte; "Aprovar e gerar"
 * grava a aprovação DESTE escopo no servidor, que recusa gerar qualquer outro.
 *
 * Os quatro passos de antes continuam em "Criação rápida", para quem já
 * sabe o que quer.
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

export function CriarPage({ opcaoInicial, telaInicial, zonaInicial, ideiaInicial, conversaInicial, aprovarInicial, textoInicial, onIr }) {
  const [conversa, setConversa] = useState(null);   // { id, mensagens, escopo, estado, titulo, campanhaId }
  const [mensagens, setMensagens] = useState([]);
  const perfil = usePerfil();
  const [escopo, setEscopo] = useState(() => {
    const op = opcaoDoPerfil(opcaoInicial, perfil.id);
    return op ? cartaoInicial(op.titulo, op.pedido, telaInicial) : (telaInicial ? cartaoInicial('', '', telaInicial, undefined, zonaInicial) : E.vazio());
  });
  const [texto, setTexto] = useState(() => {
    const op = opcaoDoPerfil(opcaoInicial, perfil.id);
    // Do "Pedir à IA" da Programação (D51): o pedido já vem escrito.
    return op ? op.pedido + ': ' : (textoInicial || '');
  });
  const [pronto, setPronto] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [ideias, setIdeias] = useState(null);
  const [daData, setDaData] = useState(null);   // a data comemorativa de hoje, como ideia (item 35)
  const [telas, setTelas] = useState([]);
  // A marca para a prévia (D13): cores, nome e logo, e o ramo para sugerir cores.
  const [marca, setMarca] = useState(null);
  const [gerando, setGerando] = useState(null);     // etapa do trabalho
  const [erro, setErro] = useState('');
  // D47: a lista de conversas se refaz quando uma muda; no celular ela abre num diálogo.
  const [versaoDaLista, setVersaoDaLista] = useState(0);
  const [verConversas, setVerConversas] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  // D42: o esboço esperando a aprovação ({ escopo, conversa }) e o aprovar em andamento.
  const [paraAprovar, setParaAprovar] = useState(null);
  const [aprovando, setAprovando] = useState(false);
  const caixa = useRef(null);
  const fim = useRef(null);
  const salvarCartao = useRef(null);
  // A geração continua no servidor se a pessoa sair: sem a página, nada de levar a Criados no meio de outra tela.
  const montada = useRef(true);
  useEffect(() => () => { montada.current = false; }, []);

  const conversando = mensagens.length > 0;
  // A conversa que já virou campanha só se lê aqui: editar é em Criados (D47).
  const criada = !!(conversa && conversa.estado === 'gerado');

  useEffect(() => {
    devices.list().then((r) => setTelas((r && r.devices) || [])).catch(() => setTelas([]));
    brand.get().then((r) => {
      const k = (r && r.kit) || {};
      const de = (kind) => (((r && r.assets) || []).find((a) => a.kind === kind) || {}).url || '';
      setMarca({ cores: k.cores || [], nome: (k.nome && k.nome !== 'Marca principal' ? k.nome : (r && r.empresa)) || '', logo: de('logo') ? { url: de('logo'), clara: de('logo-clara'), escura: de('logo-escura') } : null, ramo: r && r.ramo });
    }).catch(() => setMarca(null));
    // As sugestões da conta. Sem IA, o guia devolve um cardápio genérico — e isso já basta.
    ai.guia({}).then((r) => setIdeias((r && r.sugestoes) || [])).catch(() => setIdeias([]));
    seasons.list().then((r) => {
      const ideia = ideiaDaData(r && r.hoje);
      setDaData(ideia);
      // Veio do Início pelo "Criar para a data": a conversa já começa nela.
      if (ideia && ideiaInicial === 'data') usarIdeia(ideia);
    }).catch(() => {});
    const id = lerGuarda();
    // Vindo de Criando (D42): a conversa que espera a aprovação, já com o esboço aberto.
    if (conversaInicial) abrir(conversaInicial, { aprovar: !!aprovarInicial });
    // Quem veio de "Criar para a data" quer a data, não a conversa de ontem por cima dela (D3).
    else if (id && !opcaoInicial && !telaInicial && !ideiaInicial && !textoInicial) abrir(id, { sozinha: true });
    // Uma geração que estava rodando quando a aba fechou: volta a acompanhar.
    const pendente = criar.pendente();
    if (pendente) acompanhar(pendente.id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (fim.current && conversando) fim.current.scrollIntoView({ block: 'end', behavior: 'instant' }); }, [mensagens, pensando]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * `sozinha`: o Criar abrindo a conversa guardada, sem a pessoa pedir. Se ela
   * já virou campanha, não abre: o Criar começa limpo e a campanha está em
   * Criados (D47).
   */
  async function abrir(id, o) {
    setVerConversas(false);
    try {
      const r = await criar.conversa(id);
      const c = r.conversa;
      if (o && o.sozinha && c.estado === 'gerado') { guardar(''); return; }
      setErro('');
      setConversa(c); setMensagens(c.mensagens || []); setEscopo(E.normalizar(c.escopo || {}));
      setPronto(c.estado === 'entendido' || c.estado === 'gerado');
      setTexto('');
      guardar(c.estado === 'gerado' ? '' : c.id);
      if (o && o.aprovar && c.estado !== 'gerado' && E.temOQueGerar(c.escopo || {})) setParaAprovar({ escopo: E.normalizar(c.escopo), conversa: c });
    } catch (e) {
      // Conversa que não existe mais é esquecida; falha de rede é dita (antes: silêncio, sem spinner).
      if (e && e.status === 404) guardar('');
      else aviso.erro('criar', 'Não deu para abrir a conversa: ' + (e.message || 'falha de conexão') + '.');
    }
  }

  async function enviar(t) {
    const frase = String(t == null ? texto : t).trim();
    if (!frase || pensando || criada) return;
    setErro(''); setTexto('');
    setMensagens((m) => m.concat({ papel: 'pessoa', texto: frase }));
    setPensando(true);
    try {
      const r = await criar.conversar(conversa && conversa.id, frase, escopo);
      setConversa(r.conversa);
      setMensagens(r.conversa.mensagens || []);
      setEscopo(E.normalizar(r.conversa.escopo || {}));
      setPronto(!!r.pronto);
      guardar(r.conversa.id);
      if (!conversa) setVersaoDaLista((v) => v + 1);
      // A pessoa mandou gerar (item 37): o esboço abre para ela aprovar — gerar só depois (D42).
      if (r.gerar) setParaAprovar({ escopo: E.normalizar(r.conversa.escopo || {}), conversa: r.conversa });
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
    setConversa((c) => (c ? { ...c, esboco: null } : c));
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

  /*
   * Pronta: vai para Criados com ela aberta (Pôr pra rodar, editar), e o
   * Criar fica limpo para a próxima (D47). Se a pessoa saiu da página, o
   * aviso de "ficou pronta" (lib/trabalhos.js) é quem leva.
   */
  function terminou(c) {
    guardar('');
    setVersaoDaLista((v) => v + 1);
    if (!montada.current) return;
    nova();
    aviso.ok('Pronta e salva em Criados.');
    if (onIr) onIr('campanhas', { campanha: c.id });
  }

  // "Gerar": primeiro o esboço (D42). O texto que ficou na caixa vale como pedido, como antes.
  function pedirAprovacao() {
    if (!E.temOQueGerar(escopo) || gerando || criada) return;
    const extra = texto.trim();
    const pedido = extra && !escopo.objetivo ? { ...escopo, objetivo: extra.slice(0, 300) } : escopo;
    setParaAprovar({ escopo: E.normalizar(pedido), conversa });
  }
  // "Aprovar e gerar": grava a aprovação deste escopo e começa.
  async function aprovarEGerar() {
    if (!paraAprovar || aprovando) return;
    setAprovando(true); setErro('');
    try {
      const r = await criar.aprovarEsboco(paraAprovar.conversa && paraAprovar.conversa.id, paraAprovar.escopo);
      setConversa(r.conversa);
      guardar(r.conversa.id);
      if (!paraAprovar.conversa) setVersaoDaLista((v) => v + 1);
      const esc = paraAprovar.escopo;
      setParaAprovar(null);
      gerar({ escopo: esc, conversa: r.conversa });
    } catch (e) { setErro(e.message || 'Não deu para aprovar o esboço. Tente de novo.'); setParaAprovar(null); }
    finally { setAprovando(false); }
  }

  // Só com o esboço aprovado (D42): o escopo e a conversa que acabaram de ser aprovados.
  async function gerar(daConversa) {
    const esc = (daConversa && daConversa.escopo) || escopo;
    const conv = (daConversa && daConversa.conversa) || conversa;
    if (!E.temOQueGerar(esc) || gerando || criada) return;
    setErro('');
    const pedido = esc;
    setGerando({ etapa: 'começando', segundos: 0 });
    try {
      const r = await criar.gerar({ conversaId: conv ? conv.id : undefined, escopo: pedido }, setGerando);
      if (r && r.campanha) terminou(r.campanha);
    } catch (e) {
      // O esboço mudou (ou não foi aprovado) entre o aprovar e o gerar: mostra de novo.
      if (e.codigo === 'esboco-nao-aprovado') setParaAprovar({ escopo: E.normalizar(pedido), conversa: conv });
      else setErro(e.message || 'Não deu para criar agora. Tente de novo em instantes.');
    }
    finally { setGerando(null); }
  }

  function nova() {
    guardar('');
    setVerConversas(false);
    setConversa(null); setMensagens([]); setEscopo(E.vazio()); setPronto(false); setTexto(''); setErro('');
  }

  const podeGerar = E.temOQueGerar(escopo) && !criada;
  const decisoes = (conversa && conversa.decisoes) || [];

  // D48: tirar uma decisão que não vale mais (a IA deixa de considerar na próxima volta).
  async function tirarDecisao(d) {
    if (!conversa) return;
    const ficam = decisoes.filter((x) => x !== d);
    setConversa({ ...conversa, decisoes: ficam });
    try { const r = await criar.salvarDecisoes(conversa.id, ficam); setConversa(r.conversa); }
    catch (e) { setConversa(conversa); aviso.erro('criar', 'Não deu para tirar: ' + (e.message || 'falha de conexão') + '.'); }
  }
  const combinado = <Combinado decisoes={decisoes} onTirar={criada ? null : tirarDecisao} />;
  const referencias = (conversa && conversa.referencias) || [];

  /*
   * D45: imagem de referência — anexar (o clipe) ou colar. Sem conversa ainda,
   * a primeira imagem cria uma. Grande demais encolhe antes de subir (a
   * mesma régua das fotos); o tipo quem confere é o servidor, pelos bytes.
   */
  async function anexar(arquivos) {
    if (criada || enviandoImagem) return;
    setEnviandoImagem(true); setErro('');
    let atual = conversa;
    try {
      for (const f of arquivos.slice(0, 10 - referencias.length)) {
        const envio = await prepararFoto(f).then((p) => { URL.revokeObjectURL(p.previa); return p.envio; }).catch(() => f);
        const r = await criar.referencia(atual && atual.id, envio, 'estilo');
        if (!atual) setVersaoDaLista((v) => v + 1);
        atual = r.conversa;
        setConversa(r.conversa);
        guardar(r.conversa.id);
      }
    } catch (e) { setErro('A imagem não foi: ' + (e.message || 'falha de conexão') + '.'); }
    finally { setEnviandoImagem(false); }
  }
  async function mudarReferencias(lista) {
    if (!conversa) return;
    const antes = conversa;
    setConversa({ ...conversa, referencias: lista });
    try { const r = await criar.salvarReferencias(conversa.id, lista); setConversa(r.conversa); }
    catch (e) { setConversa(antes); aviso.erro('criar', 'Não deu para mudar a imagem: ' + (e.message || 'falha de conexão') + '.'); }
  }
  const ultimaIa = [...mensagens].reverse().find((m) => m.papel === 'ia');

  const lista = (
    <ListaDeConversas atual={conversa && conversa.id} versao={versaoDaLista}
      onAbrir={(c) => abrir(c.id)} onNova={nova}
      // Excluiu a conversa que está aberta: o Criar volta para uma conversa nova.
      onExcluiu={(id) => { if (conversa && conversa.id === id) nova(); }} className="h-full" />
  );

  const botaoGerar = (
    <div className="space-y-1.5">
      <Button variant={pronto || !conversando ? 'primary' : 'secondary'} size="lg" icon={pronto ? Wand2 : Zap} disabled={!podeGerar || !!gerando} onClick={pedirAprovacao} className="w-full justify-center">
        {pronto || !conversando ? 'Gerar' : 'Gerar já'}
      </Button>
      <p className="text-center text-2xs text-ink-3">
        {podeGerar ? linhaDoCusto(escopo) + '. Antes de gerar, você confere o esboço.' : 'Conte o que você quer mostrar, ou toque numa ideia.'}
      </p>
    </div>
  );

  const entrada = criada ? (
    // A conversa que virou campanha não continua aqui: mudar é em Criados (D47).
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ok/30 bg-ok-soft px-3 py-2.5 text-sm text-ink">
      <CheckCircle2 size={16} className="shrink-0 text-ok" />
      <span className="min-w-0 flex-1">Esta conversa virou uma campanha. Para mudar alguma coisa, abra em Criados.</span>
      {conversa.campanhaId && onIr && (
        <Button size="sm" variant="primary" onClick={() => onIr('campanhas', { campanha: conversa.campanhaId })}>
          Abrir em Criados <ArrowRight size={14} className="ml-1" />
        </Button>
      )}
    </div>
  ) : (
    <div className="space-y-2">
    {/* D45: as imagens de referência desta conversa, com o uso de cada uma. */}
    <ReferenciasDoChat lista={referencias} onMudar={mudarReferencias} />
    <div className="flex items-end gap-2">
      <BotaoAnexar onArquivos={anexar} enviando={enviandoImagem} />
      <textarea ref={caixa} rows={conversando ? 2 : 3} value={texto} onChange={(e) => setTexto(e.target.value)}
        onPaste={(e) => { const imgs = imagensDoColar(e); if (imgs.length) { e.preventDefault(); anexar(imgs); } }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
        placeholder={conversando ? 'Responda, peça uma mudança ou diga "pode gerar"' : perfil.exemplo}
        aria-label="O que você quer mostrar"
        className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
      <Button variant="primary" icon={Send} disabled={pensando || !texto.trim()} onClick={() => enviar()} aria-label="Enviar">
        <span className="hidden sm:inline">Enviar</span>
      </Button>
    </div>
    </div>
  );

  // A barra de cima da conversa: o nome, as conversas (celular) e começar outra.
  const barra = (
    <div className="mb-3 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        {conversando
          ? <h1 className="truncate text-base font-semibold text-ink">{(conversa && conversa.titulo) || 'Nova conversa'}</h1>
          : <h1 className="text-xl font-semibold tracking-tight text-ink">O que você quer mostrar hoje?</h1>}
      </div>
      <Button size="sm" variant="secondary" icon={MessagesSquare} className="xl:hidden" onClick={() => setVerConversas(true)}>Conversas</Button>
      {conversando && <Button size="sm" variant="secondary" icon={Plus} onClick={nova}>Nova</Button>}
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
            <div className="tnum text-2xs text-ink-3">{gerando.segundos || 0}s · pode sair desta tela: a criação continua e fica salva em Criados.</div>
            {/* D11: o andamento também fica em Criando, e o aviso chega em qualquer página. */}
            {onIr && <button type="button" onClick={() => onIr('criando')} className="text-xs font-medium text-accent hover:underline">Acompanhar em Criando e seguir usando o painel</button>}
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl xl:grid xl:grid-cols-[15rem_minmax(0,1fr)] xl:items-start xl:gap-6">
      {/* No computador, as conversas ficam sempre à mão (D47). */}
      <aside className="hidden xl:sticky xl:top-4 xl:block xl:h-[calc(100vh-9rem)]" aria-label="Conversas">{lista}</aside>
      <AprovarEsboco aberto={!!paraAprovar} escopo={paraAprovar && paraAprovar.escopo} marca={marca} telas={telas} decisoes={decisoes}
        ocupado={aprovando} onAprovar={aprovarEGerar} onFechar={() => setParaAprovar(null)} />
      <Dialog open={verConversas} onClose={() => setVerConversas(false)} title="Conversas" description="Continue de onde parou, ou veja as que viraram campanha.">
        <div className="h-[60vh]">{lista}</div>
      </Dialog>

      <div className={cn('mx-auto w-full', conversando ? 'max-w-5xl' : 'max-w-3xl')}>
        {barra}
        {!conversando && (
          <p className="-mt-1 mb-4 text-sm text-ink-2">Um aviso, uma peça ou uma campanha inteira: conte o que você quer, eu sugiro e crio. Também respondo dúvidas sobre o sistema.</p>
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
                  {!pensando && !criada && ultimaIa && (ultimaIa.sugestoes || []).length > 0 && (
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
            {podeGerar && conversando && (
              <div className="space-y-2 lg:hidden">
                {combinado}
                <CartaoEscopo escopo={escopo} onChange={mudarCartao} telas={telas} marca={marca} recolhivel />
                {botaoGerar}
              </div>
            )}

            {entrada}

            {!conversando && (
              <>
                {podeGerar && <div><CartaoEscopo escopo={escopo} onChange={mudarCartao} telas={telas} marca={marca} />{<div className="mt-2">{botaoGerar}</div>}</div>}

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

                <p className="text-xs text-ink-3">
                  Já sabe o que quer e prefere ir direto? Use a{' '}
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => onIr && onIr('rapida')}>Criação rápida</button>.
                  {' '}O que ficou pronto está em{' '}
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => onIr && onIr('campanhas')}>Criados</button>.
                </p>
              </>
            )}
          </div>

          {conversando && podeGerar && (
            <aside className="hidden space-y-2 lg:sticky lg:top-4 lg:block">
              {combinado}
              <CartaoEscopo escopo={escopo} onChange={mudarCartao} telas={telas} marca={marca} />
              {botaoGerar}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
