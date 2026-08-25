import React, { useState, useEffect, Suspense, lazy, useMemo } from 'react';
import {
  Plus, Wand2, ImagePlus, Upload, Pencil, Download, Send, Trash2, Sparkles, Check,
  MonitorPlay, Search, FolderOpen, Copy, Type, CalendarClock, ShieldCheck, Rocket, MessagesSquare,
} from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { useAsync } from '../lib/useAsync.js';
import { ai, library, devices, deviceConfig, media } from '../api.js';
import { primaryZoneKey, defaultConfig, CONTENT_TYPES } from '../lib/contentTypes.js';
import { aplicarConteudo, distribuirPorZona, agendarPeca, FAIXAS } from '../lib/aplicarConteudo.js';
import { zonesOf } from '../lib/screenConfig.js';
import { downloadComposition } from '../lib/exportPng.js';
import { DesignThumb } from '../components/content/DesignThumb.jsx';
import { BriefingChat } from '../components/content/BriefingChat.jsx';
import { SalvarEm } from '../components/content/SalvarEm.jsx';
import { aviso } from '../lib/avisos.js';
import { guardar as guardarNaBandeja, inscrever as inscreverBandeja, limpar as limparBandeja } from '../lib/bandeja.js';

const CompositionEditor = lazy(() => import('../components/content/CompositionEditor.jsx').then((m) => ({ default: m.CompositionEditor })));
const EscolherModelo = lazy(() => import('../components/content/EscolherModelo.jsx').then((m) => ({ default: m.EscolherModelo })));

// Formatos que fazem sentido numa TV deitada. Não sabemos a orientação de cada
// tela pareada, então este é só o PADRÃO da seleção — o usuário destrava os
// verticais quando a tela dele for de retrato.
const DEITADOS = ['16/9', '21/9'];

/*
 * ONDE a campanha vai aparecer, em linguagem de quem usa.
 *
 * Antes ninguém perguntava: o modelo decidia os formatos sozinho, e vinha
 * Story para quem só tem TV na recepção. Peça de formato que ninguém pediu é
 * peça que não vai ser usada — e, quando ela precisa de imagem, é dinheiro
 * gasto em algo que ninguém vai ver.
 *
 * O rótulo é o lugar, não a proporção: "TV deitada" quer dizer mais do que
 * "16/9" para o dono de uma padaria.
 */
const ONDE = [
  { id: '16/9', rotulo: 'TV deitada', nota: 'a da recepção' },
  { id: '9/16', rotulo: 'TV em pé · Story', nota: 'totem, Instagram' },
  { id: '1/1', rotulo: 'Post quadrado', nota: 'feed' },
  { id: '21/9', rotulo: 'Faixa larga', nota: 'painel comprido' },
];

/*
 * O que fazer com foto. É a escolha que mais mexe no custo: cada imagem que a
 * IA desenha é um crédito, e as fotos que a empresa já subiu não custam nada.
 */
const IMAGENS = [
  { id: 'gerar', rotulo: 'A IA desenha quando precisar', nota: 'usa suas fotos primeiro; gera só o que faltar' },
  { id: 'acervo', rotulo: 'Só as minhas fotos', nota: 'não gera imagem nenhuma — sem custo de crédito' },
  { id: 'nenhuma', rotulo: 'Sem foto', nota: 'peças com cor, forma e tipografia' },
];

/*
 * O que o cliente vai receber, antes de pagar por isso.
 *
 * Mostra peça a peça o que a IA planejou, marca quais custam crédito, e soma.
 * A conta é simples de propósito: uma imagem gerada = um crédito. Peça que
 * reaproveita foto do acervo, ou que é só tipografia, não custa nada — e isso
 * precisa estar visível, senão a pessoa acha que toda peça é paga e pede
 * menos do que precisaria.
 */
/*
 * O CARDÁPIO — o que a pessoa vê antes do campo de texto vazio.
 *
 * O briefing que existia perguntava uma coisa aberta por vez: "para quem é?",
 * "por que agora?". Isso exige que ela JÁ TENHA a resposta formulada, e quem
 * tem padaria não pensa em campanha nesses termos. Trava, escreve "sei lá,
 * promoção", e a IA decide tudo.
 *
 * Reconhecer é muito mais fácil que lembrar. Cada sugestão aqui já traz o
 * formulário preenchido: clicar numa é escolher onde, quantas, o que fazer com
 * imagem e como anima — sem precisar saber que essas perguntas existem.
 */
function Guia({ empresa, onEscolher, onPular }) {
  const [dados, setDados] = React.useState(null);
  const [erro, setErro] = React.useState('');

  React.useEffect(() => {
    let vivo = true;
    ai.guia({ empresa })
      .then((r) => { if (vivo) setDados(r); })
      .catch((e) => { if (vivo) setErro(e.message || 'não consegui buscar sugestões'); });
    return () => { vivo = false; };
  }, [empresa]);

  if (erro) {
    // O guia é facilitador: se ele cair, escrever à mão continua valendo.
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-ink-2">{erro}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={onPular}>Escrever eu mesmo</Button>
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Spinner size={22} />
        <div className="text-sm text-ink-2">Pensando em ideias para {empresa || 'o seu negócio'}…</div>
      </div>
    );
  }

  const ONDE = { '16/9': 'TV deitada', '9/16': 'TV em pé · Story', '1/1': 'Post quadrado', '21/9': 'Faixa larga' };
  const CUSTO = {
    gerar: { texto: 'foto por IA', tom: 'accent' },
    acervo: { texto: 'suas fotos · sem custo', tom: 'ok' },
    nenhuma: { texto: 'só texto · sem custo', tom: 'ok' },
  };

  return (
    <div>
      {dados.abertura && <p className="mb-3 text-sm text-ink-2">{dados.abertura}</p>}
      <div className="space-y-2">
        {dados.sugestoes.map((s, i) => {
          const c = CUSTO[s.imagens] || CUSTO.nenhuma;
          const creditos = s.imagens === 'gerar' ? s.quantidade : 0;
          return (
            <button key={i} type="button" onClick={() => onEscolher(s)}
              className="block w-full rounded-lg border border-line bg-surface-2 p-3 text-left transition hover:border-accent hover:bg-accent-soft/20">
              <span className="block text-sm font-semibold text-ink">{s.titulo}</span>
              <span className="mt-0.5 block text-xs text-ink-2">{s.porque}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs">
                <Badge tone="neutral">{s.formatos.map((f) => ONDE[f] || f).join(' + ')}</Badge>
                <Badge tone="neutral">{s.quantidade} {s.quantidade === 1 ? 'peça' : 'peças'}</Badge>
                <Badge tone={c.tom}>{creditos ? c.texto + ' · ' + creditos + (creditos === 1 ? ' crédito' : ' créditos') : c.texto}</Badge>
              </span>
            </button>
          );
        })}
      </div>
      {/*
        Sair do cardápio nunca pode ser escondido: quem já sabe o que quer não
        deve ser obrigado a passar por aqui.
      */}
      <button onClick={onPular}
        className="mt-3 text-xs font-medium text-ink-3 underline-offset-2 hover:text-ink hover:underline">
        Nenhuma dessas — quero escrever
      </button>
    </div>
  );
}


function PlanoParaConfirmar({ plano, onGerar, onVoltar }) {
  const pecas = (plano.plano && plano.plano.pecas) || [];
  const [fora, setFora] = React.useState(() => new Set());

  const ativas = pecas.filter((_, i) => !fora.has(i));
  const custo = ativas.filter((p) => p.precisaImagem && p.promptImagem).length;

  function alternar(i) {
    setFora((antes) => {
      const n = new Set(antes);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }

  const ONDE = { '16/9': 'TV deitada', '9/16': 'TV em pé · Story', '1/1': 'Post quadrado', '21/9': 'Faixa larga' };

  return (
    <div>
      <div className="mb-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
        Isto é o que a IA entendeu. <b className="text-ink">Nada foi gerado ainda</b> — nenhum
        crédito saiu. Confira, tire o que não quiser, e só então gere.
      </div>

      <div className="space-y-2">
        {pecas.map((p, i) => {
          const cortada = fora.has(i);
          const paga = p.precisaImagem && p.promptImagem;
          return (
            <label key={i}
              className={'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition '
                + (cortada ? 'border-line bg-surface opacity-45' : 'border-line bg-surface-2')}>
              <input type="checkbox" checked={!cortada} onChange={() => alternar(i)} className="mt-1" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{p.headline || '(sem manchete)'}</span>
                {p.sub && <span className="mt-0.5 block text-xs text-ink-2">{p.sub}</span>}
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
                  <Badge tone="neutral">{ONDE[p.formato] || p.formato}</Badge>
                  {paga
                    ? <Badge tone="accent">foto por IA · 1 crédito</Badge>
                    : p.bgImagem || p.imagemBase != null
                      ? <Badge tone="ok">foto sua · sem custo</Badge>
                      : <Badge tone="ok">só texto · sem custo</Badge>}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="text-sm text-ink-2">
          <b className="text-ink">{ativas.length}</b> {ativas.length === 1 ? 'peça' : 'peças'}
          {' · '}
          {custo === 0
            ? <span className="text-ok">nenhum crédito</span>
            : <><b className="text-ink">{custo}</b> {custo === 1 ? 'crédito' : 'créditos'}</>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onVoltar}>Voltar e corrigir</Button>
          <Button variant="primary" size="sm" disabled={!ativas.length}
            onClick={() => onGerar({
              ...plano,
              plano: { ...plano.plano, pecas: ativas },
            })}>
            Gerar {ativas.length === 1 ? 'a peça' : 'as ' + ativas.length + ' peças'}
          </Button>
        </div>
      </div>
    </div>
  );
}


export function MyDesignsPage({ onIr }) {
  const { data, loading, reload } = useAsync(library.list);
  const { data: devData } = useAsync(devices.list);
  const screens = (devData && devData.devices) || [];
  const saved = (data && data.items) || [];

  const collections = useMemo(() => Array.from(new Set(saved.map((i) => i.campaign))).filter(Boolean), [saved]);

  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);   // { id?, item } no editor
  const [modeloAberto, setModeloAberto] = useState(false);
  /*
   * O que está esperando para ser guardado: { item, nome, pasta, titulo }.
   * Nome e pasta são SUGESTÕES — quem decide é o diálogo, e ele pergunta.
   */
  const [saveItem, setSaveItem] = useState(null);

  /*
   * Recolhe o que o aviso tiver deixado na bandeja.
   *
   * Vale para os dois casos, e é por isso que a inscrição dispara na hora:
   * quem clicou "Ver e salvar" estando aqui já tem a página montada, e quem
   * clicou de outra tela chega aqui depois do depósito.
   */
  useEffect(() => inscreverBandeja((p) => {
    if (!p) return;
    if (p.tipo === 'campanha') { setGen(p.gen); setAiColl(p.nome || 'Campanha'); (setGuiando(true), setAiOpen(true)); }
    else setSaveItem(p);
    limparBandeja();
  }), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  /*
   * Publicar aceita uma peça só ou uma campanha inteira — o mesmo diálogo, para
   * o usuário não aprender dois fluxos. `pecas` é sempre uma lista.
   */
  const [pub, setPub] = useState(null); // { titulo, pecas: [{item, formato, label}] }
  const [alvos, setAlvos] = useState([]);         // ids de tela
  const [fmts, setFmts] = useState(DEITADOS);     // formatos incluídos
  const [substituir, setSubstituir] = useState(false);
  // Por quantos dias a campanha fica no ar. 0 = até alguém trocar.
  const [dias, setDias] = useState(0);

  // Criar campanha com IA (diretor)
  const [aiOpen, setAiOpen] = useState(false);
  /*
   * O pedido explícito: onde, quantas e o que fazer com imagem.
   *
   * O padrão é o caso comum — TV deitada, três peças, IA desenha o que faltar —
   * para quem tem pressa não precisar mexer em nada. O que muda é que agora dá
   * para mexer, e o custo aparece antes do clique.
   */
  const [onde, setOnde] = useState(['16/9']);
  const [quantas, setQuantas] = useState(3);
  const [imagens, setImagens] = useState('gerar');
  const [brief, setBrief] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [publico, setPublico] = useState('');
  const [tom, setTom] = useState('');
  const [oferta, setOferta] = useState('');
  const [gen, setGen] = useState(null);
  const [aiColl, setAiColl] = useState('');
  const [etapa, setEtapa] = useState(null); // progresso do trabalho em andamento
  const [conversando, setConversando] = useState(false); // chat de briefing aberto
  const [plano, setPlano] = useState(null); // plano esperando confirmação do cliente
  /*
   * O cardápio abre PRIMEIRO. Campo de texto vazio é onde quem não sabe o que
   * pedir desiste — e é a maioria de quem chega.
   */
  const [guiando, setGuiando] = useState(true);
  const [emAndamento, setEmAndamento] = useState(false); // campanha rodando no servidor

  // Gerar imagem
  const [imgOpen, setImgOpen] = useState(false);
  const [iPrompt, setIPrompt] = useState('');
  const [iFormato, setIFormato] = useState('16/9');
  const [iEstilo, setIEstilo] = useState('fotográfico');

  /*
   * "Criar na mão" passa por uma escolha antes do editor. A tela em branco
   * continua a um clique de distância — quem já sabe o que vai fazer não
   * precisa passar por uma galeria.
   */
  function novoNaMao() { setModeloAberto(true); }

  function comecarDe(peca, formato) {
    setModeloAberto(false);
    const base = CONTENT_TYPES.composicao.make();
    setEditing({ item: peca ? { ...base, ...peca } : { ...base, formato } });
  }

  // Editor salvou: peça existente atualiza; nova vai para o diálogo de salvar.
  function onEditorSave(item) {
    if (editing && editing.id) {
      setBusy(true);
      library.update(editing.id, item, editing.label || '').then(() => { reload(); setMsg('Design atualizado.'); }).finally(() => setBusy(false));
      setEditing(null);
    } else {
      setEditing(null);
      setSaveItem({ item, nome: '', pasta: '' });
    }
  }

  async function salvarDesign({ nome, pasta }) {
    if (!saveItem) return;
    setBusy(true); setMsg('');
    try {
      const it = saveItem.item;
      const nova = !collections.includes(pasta);
      await library.save(pasta, [{ formato: it.formato || '16/9', label: nome, item: it }]);
      setSaveItem(null);
      aviso.ok(nova ? 'Pasta “' + pasta + '” criada com “' + nome + '” dentro.' : '“' + nome + '” salvo em “' + pasta + '”.');
      reload();
    } catch (e) { setMsg(e.message || 'Falha ao salvar'); }
    setBusy(false);
  }

  /* ---------------- Publicar (peça ou campanha) ---------------- */

  function abrirPublicar(titulo, pecas) {
    setPub({ titulo, pecas });
    setAlvos(screens.length === 1 ? [screens[0].id] : []);
    // Se a seleção padrão não cobrir nada, abre com tudo marcado — melhor que
    // um diálogo que parece quebrado por não ter nenhuma peça elegível.
    const disponiveis = Array.from(new Set(pecas.map((p) => p.formato || '16/9')));
    const padrao = disponiveis.filter((f) => DEITADOS.includes(f));
    setFmts(padrao.length ? padrao : disponiveis);
    setSubstituir(false);
    setDias(0);
  }

  const pecasElegiveis = pub ? pub.pecas.filter((p) => fmts.includes(p.formato || '16/9')) : [];
  // Quais horas do dia esta campanha cobre — o que faz dela um programa e não
  // uma playlist plana.
  const faixasUsadas = Array.from(new Set(pecasElegiveis.map((p) => p.faixa).filter((f) => f && f !== 'dia')));
  const temFaixas = faixasUsadas.length > 0;
  const resumoFaixas = faixasUsadas.map((f) => (FAIXAS[f] ? FAIXAS[f].rotulo.toLowerCase() : f)).join(', ');

  async function publicar() {
    if (!pub || !alvos.length || !pecasElegiveis.length) return;
    setBusy(true); setMsg('');
    try {
      for (const id of alvos) {
        const dev = screens.find((s) => s.id === id);
        let cfg = null;
        try { cfg = await deviceConfig.get(id); } catch (e) { /* tela sem config ainda */ }
        if (!cfg) cfg = defaultConfig(dev ? dev.name : 'Tela');
        /*
         * Peça em pé vai para a zona em pé. Antes tudo caía na principal e a
         * lateral seguia com a cara de sempre enquanto a campanha rodava ao
         * lado — a queixa de "adicionou uma tela só na principal".
         */
        const zonas = zonesOf(cfg).filter((z) => z.type === 'playlist');
        let blocos = distribuirPorZona(pecasElegiveis, zonas, dias);
        if (!Object.keys(blocos).length) {
          blocos = { [primaryZoneKey(cfg)]: pecasElegiveis.map((p) => agendarPeca(p.item, p.faixa, dias)) };
        }
        /*
         * 'trocar' substitui só o que veio DESTA campanha; 'limpar' esvazia a
         * zona. Antes o padrão empilhava para sempre e a única alternativa
         * apagava também o que não era campanha.
         */
        const novaCfg = aplicarConteudo(cfg, blocos, { chave: '_campanha', valor: pub.titulo },
          substituir ? 'limpar' : 'trocar');
        await deviceConfig.save(id, novaCfg);
      }
      const nTelas = alvos.length;
      setMsg(`${pecasElegiveis.length} peça(s) ${substituir ? 'substituíram a playlist de' : 'publicadas em'} ${nTelas} tela(s).`);
      setPub(null);
    } catch (e) { setMsg(e.message || 'Falha ao publicar'); }
    setBusy(false);
  }

  /* ---------------- Campanha com IA ---------------- */

  /*
   * A campanha roda no servidor. Fechar o diálogo, ir mexer noutra tela ou
   * recarregar o navegador NÃO cancela nada — antes o resultado se perdia e
   * parecia que o trabalho tinha sido abortado.
   *
   * Aqui o acompanhamento é destacado da janela: `emAndamento` fica na página
   * inteira, e se o usuário voltar depois a página retoma sozinha.
   */
  async function acompanhar(id) {
    setEmAndamento(true); setMsg('');
    try {
      const out = await ai.directorAcompanhar(id, setEtapa);
      if (!out) return;
      setGen(out);
      setAiColl(out.campanha || empresa || 'Campanha');
      (setGuiando(true), setAiOpen(true)); // traz o resultado de volta mesmo se a janela foi fechada
      /*
       * A faixa de progresso vive nesta página. Quem foi mexer em Telas ou em
       * Marca enquanto esperava não vê nada — e a campanha fica pronta em
       * silêncio. O aviso é o que atravessa a navegação.
       */
      aviso.pronto('campanha:' + id, 'Sua campanha ficou pronta.',
        (out.pecas || []).length + ' peça(s) em “' + (out.campanha || 'Campanha') + '”.',
        {
          rotulo: 'Ver as peças',
          /*
           * Pela bandeja, pelo mesmo motivo da imagem: o polling continua
           * depois que a página sai de cena, e o servidor DESCARTA o trabalho
           * assim que entrega. Se o resultado não for depositado aqui, voltar
           * para "Meus Designs" não o traz de volta — a campanha inteira,
           * já paga, se perde.
           */
          on: () => {
            guardarNaBandeja({ tipo: 'campanha', gen: out, nome: out.campanha || empresa || 'Campanha' });
            if (onIr) onIr('designs');
          },
        });
    } catch (e) {
      setMsg(e.message || 'Falha ao gerar');
      aviso.erro('campanha:' + id, 'A campanha não saiu.', e.message || 'Tente de novo em instantes.');
    }
    finally { setEmAndamento(false); setEtapa(null); }
  }

  /*
   * Ao abrir a página: volta a acompanhar o que ficou rodando.
   *
   * São dois trabalhos diferentes, e os dois se perdiam do mesmo jeito. A
   * campanha já era retomada; a IMAGEM não era, e essa é a que dói — o aviso
   * dizia "pode sair desta tela", o que era verdade enquanto a aba vivesse.
   * Recarregar o navegador quebrava a promessa e a imagem, que é a única
   * geração que custa crédito de verdade, ficava paga e inalcançável.
   */
  useEffect(() => {
    const pend = ai.jobPendente();
    if (pend) acompanhar(pend.id);

    const img = ai.pendente('imagem');
    if (!img) return undefined;
    const sinal = { parado: false };
    const id = 'img:retomada';
    aviso.trabalho(id, 'Terminando sua imagem…', 'Ela continuou sendo feita enquanto você esteve fora.');
    ai.retomar('imagem', null, sinal)
      .then((out) => { if (out) avisarImagemPronta(id, out, img.brief || 'Imagem'); })
      .catch((e) => aviso.erro(id, 'A imagem não saiu.', e.message || 'Tente de novo em instantes.'));
    return () => { sinal.parado = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * O aviso de imagem pronta, num lugar só.
   *
   * Chamado por dois caminhos — a geração de agora e a retomada depois de
   * recarregar — e enquanto isto vivia dentro do `.then()` da geração, o
   * segundo caminho teria que repetir a mesma lógica. O segundo lugar é
   * sempre o que fica para trás.
   */
  function avisarImagemPronta(id, out, prompt) {
    const item = { type: 'composicao', formato: out.formato || iFormato, duracao: 12, bg: { kind: 'imagem', src: out.url }, elementos: [] };
    aviso.pronto(id, 'Sua imagem ficou pronta.', resumo(prompt), {
      rotulo: 'Ver e salvar',
      /*
       * Pela bandeja, e não por `setSaveItem` direto: quando o aviso é
       * clicado de outra tela, ESTA página está desmontada e o clique não
       * faria nada — o resultado de um trabalho já cobrado ficaria
       * inalcançável. A bandeja guarda; a navegação traz para cá.
       */
      on: () => {
        guardarNaBandeja({ item, nome: resumo(prompt), pasta: 'Imagens da IA', titulo: 'Sua imagem ficou pronta' });
        if (onIr) onIr('designs');
      },
    });
  }

  /*
   * O pedido é o mesmo nas duas fases — muda só o que se pede ao servidor:
   * primeiro o PLANO (texto, centavos), depois a EXECUÇÃO (imagens, crédito).
   */
  /*
   * Escolher no cardápio PREENCHE a refinaria — não pula ela.
   *
   * Pular seria mais rápido e mais errado: a pessoa perderia a única chance de
   * ver que "2 peças, TV deitada, foto por IA" era uma decisão, e não o
   * destino. Preenchido, ela vê o que foi escolhido por ela e muda o que
   * quiser antes de qualquer custo.
   */
  function escolherSugestao(s) {
    setBrief(s.brief || s.titulo || '');
    setOnde(s.formatos && s.formatos.length ? s.formatos : ['16/9']);
    setQuantas(s.quantidade || 2);
    setImagens(s.imagens || 'nenhuma');
    setGuiando(false);
  }

  function pedidoBase(briefingPronto) {
    return {
      brief: (briefingPronto && briefingPronto.briefing) || brief,
      empresa, publico, tom,
      oferta: (briefingPronto && briefingPronto.oferta) || oferta,
      briefingPronto: briefingPronto || null,
      /*
       * O que a pessoa escolheu. No servidor isto é LIMITE, não sugestão:
       * sem ele o modelo decidia quantidade e formatos, outra função somava
       * peças por cima, e cada uma podia custar uma imagem paga.
       */
      formatos: onde,
      pedido: { formatos: onde, quantidade: quantas, imagens },
    };
  }

  /*
   * FASE 1 — planeja e PARA. Nenhum crédito sai aqui.
   *
   * Antes o clique ia direto do briefing até a peça pronta, e o cliente só
   * descobria o que a IA tinha entendido quando o crédito já tinha saído. Se
   * ela entendeu errado — e entender errado um pedido de uma frase é o caso
   * comum — ele pagou pelo que não queria e ainda precisa refazer.
   */
  async function planejarCampanha(briefingPronto) {
    if (!brief.trim()) return;
    setConversando(false);
    setMsg(''); setPlano(null); setEtapa({ etapa: 'entendendo seu pedido', detalhe: '', segundos: 0 });
    try {
      const id = await ai.directorStart({ ...pedidoBase(briefingPronto), apenasPlano: true });
      const r = await ai.directorAcompanhar(id, (s) => setEtapa(s));
      setEtapa(null);
      setPlano({ ...r, briefingPronto: briefingPronto || null });
    } catch (e) { setMsg(e.message || 'Falha ao planejar'); setEtapa(null); }
  }

  /* FASE 2 — executa EXATAMENTE o plano aprovado. Aqui o crédito sai. */
  async function gerarCampanha(plan) {
    setMsg(''); setEtapa({ etapa: 'começando', detalhe: '', segundos: 0 });
    try {
      const id = await ai.directorStart({
        ...pedidoBase(plan.briefingPronto),
        // Sem replanejar: o que ele aprovou é o que ele recebe.
        planoAprovado: plan.plano,
      });
      setPlano(null);
      await acompanhar(id);
    } catch (e) { setMsg(e.message || 'Falha ao gerar'); setEtapa(null); }
  }

  function pecasDoGen() {
    if (!gen) return [];
    return gen.pecas.map((p) => ({ formato: p.formato, canal: p.canal, label: p.label, item: p.item }));
  }

  async function salvarCampanha(depoisPublicar) {
    if (!gen) return;
    setBusy(true);
    try {
      const nome = aiColl.trim() || 'Campanha';
      const pecas = pecasDoGen();
      await library.save(nome, pecas);
      setAiOpen(false); setBrief(''); reload();
      if (depoisPublicar) { setGen(null); abrirPublicar(nome, pecas); }
      else { setGen(null); aviso.ok('Pasta “' + nome + '” criada com ' + pecas.length + ' peça(s).'); }
    } catch (e) { setMsg(e.message || 'Falha ao salvar'); }
    setBusy(false);
  }

  /* ---------------- Ações de campanha inteira ---------------- */

  async function renomearCampanha(nome) {
    const novo = window.prompt('Novo nome da campanha:', nome);
    if (!novo || novo.trim() === nome) return;
    setBusy(true);
    try { await library.renameCampaign(nome, novo.trim()); reload(); setMsg('Campanha renomeada.'); }
    catch (e) { setMsg(e.message || 'Falha ao renomear'); }
    setBusy(false);
  }

  async function duplicarCampanha(nome) {
    setBusy(true);
    try { const r = await library.duplicateCampaign(nome); reload(); setMsg('Criada “' + r.campanha + '”.'); }
    catch (e) { setMsg(e.message || 'Falha ao duplicar'); }
    setBusy(false);
  }

  async function excluirCampanha(nome, quantas) {
    if (!window.confirm(`Excluir a campanha “${nome}” e suas ${quantas} peça(s)? Isso não pode ser desfeito.`)) return;
    setBusy(true);
    try { await library.removeCampaign(nome); reload(); setMsg('Campanha excluída.'); }
    catch (e) { setMsg(e.message || 'Falha ao excluir'); }
    setBusy(false);
  }

  /* ---------------- Imagem e importação ---------------- */

  /*
   * Gerar imagem NÃO trava mais a tela.
   *
   * A geração leva de dez a sessenta segundos. Antes isso segurava um diálogo
   * modal: quem esperava não podia fazer mais nada, e sair da página perdia o
   * trabalho E o crédito, que já tinha sido cobrado. Numa conta com plano por
   * créditos, isso é dinheiro jogado fora por causa de um clique no menu.
   *
   * Agora o diálogo fecha na hora, o trabalho segue em segundo plano e o
   * resultado VEM ATRÁS da pessoa: um aviso no canto, com o botão que abre a
   * pergunta "onde isto vai ficar?". É este o padrão para tudo que a conta
   * cria — avisar, mostrar, e só então perguntar onde guardar.
   */
  function gerarImagem() {
    const prompt = iPrompt.trim();
    if (!prompt) return;
    const formato = iFormato;
    const id = 'img:' + Date.now();

    setImgOpen(false); setIPrompt(''); setMsg('');
    aviso.trabalho(id, 'Gerando sua imagem…', 'Pode sair desta tela. Aviso aqui quando ficar pronta.');

    ai.image({ prompt, formato, estilo: iEstilo })
      .then((out) => avisarImagemPronta(id, out, prompt))
      .catch((e) => aviso.erro(id, 'A imagem não saiu.', e.message || 'Tente de novo em instantes.'));
  }

  // O prompt vira o nome sugerido: "banner de padaria ao amanhecer" é um nome
  // melhor do que "Imagem IA", que é o que todas as imagens se chamavam antes.
  function resumo(texto) {
    const limpo = String(texto).replace(/\s+/g, ' ').trim();
    if (limpo.length <= 40) return limpo;
    return limpo.slice(0, 40).replace(/\s\S*$/, '') + '…';
  }

  async function onImport(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setMsg('');
    try {
      const up = await media.upload(f);
      const isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
      const item = isPdf
        ? { type: 'pptx', src: up.url, duracao: 20 }
        : { type: 'composicao', formato: '16/9', duracao: 12, bg: { kind: 'imagem', src: up.url }, elementos: [] };
      setSaveItem({ item, nome: f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Importado', pasta: 'Importados' });
    } catch (err) { setMsg(err.message || 'Falha ao importar'); }
    setBusy(false);
  }

  // Agrupa por coleção e aplica busca.
  const groups = {};
  for (const it of saved) {
    if (q && !((it.label || '') + ' ' + (it.campaign || '')).toLowerCase().includes(q.toLowerCase())) continue;
    (groups[it.campaign] = groups[it.campaign] || []).push(it);
  }
  const groupNames = Object.keys(groups);

  const CREATE = [
    { key: 'ia', title: 'Criar campanha com IA', desc: 'Uma frase vira a campanha inteira: peças, legendas e quando postar.', icon: Wand2, on: () => (setGuiando(true), setAiOpen(true)), accent: 'text-violet-400', destaque: true },
    { key: 'mao', title: 'Criar na mão', desc: 'Editor visual: fundo, texto, formas, ícones e imagens.', icon: Plus, on: novoNaMao, accent: 'text-accent' },
    { key: 'img', title: 'Gerar imagem IA', desc: 'Crie uma imagem por prompt e use como arte ou fundo.', icon: ImagePlus, on: () => setImgOpen(true), accent: 'text-sky-400' },
    { key: 'imp', title: 'Importar arquivo', desc: 'Suba um design do Canva (PNG/JPG) ou um PDF.', icon: Upload, on: null, accent: 'text-emerald-400' },
  ];

  return (
    <div>
      <PageHeader title="Meus Designs" subtitle="Crie na mão, com IA, gere imagens ou importe — tudo fica aqui, pronto para reaproveitar e publicar." />

      {/* Formas de criar — espaçoso no desktop */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CREATE.map((c) => {
          const Icon = c.icon;
          const inner = (
            <>
              <div className={'flex h-11 w-11 items-center justify-center rounded-xl ' + (c.destaque ? 'bg-accent-soft' : 'bg-surface-2')}><Icon size={22} className={c.accent} /></div>
              <div className="mt-3 text-sm font-semibold text-ink">{c.title}</div>
              <div className="mt-1 text-xs leading-snug text-ink-3">{c.desc}</div>
            </>
          );
          const base = 'rounded-xl border p-5 text-left transition hover:bg-surface-2 ' + (c.destaque ? 'border-accent/40 bg-surface hover:border-accent' : 'border-line bg-surface hover:border-accent/50');
          return c.on ? (
            <button key={c.key} onClick={c.on} className={base}>{inner}</button>
          ) : (
            <label key={c.key} className={'cursor-pointer ' + base}>
              {inner}
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={onImport} />
            </label>
          );
        })}
      </div>

      {/*
        Fica na PÁGINA, não na janela: é o que permite fechar o diálogo e ir
        mexer noutra coisa sabendo que a campanha continua sendo feita.
      */}
      {emAndamento && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3">
          <Spinner size={16} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">
              Criando sua campanha{etapa && etapa.etapa ? ' · ' + etapa.etapa : ''}
            </div>
            <div className="truncate text-xs text-ink-3">
              {etapa && etapa.detalhe ? etapa.detalhe + ' · ' : ''}
              pode fechar e mexer em outra coisa — ela continua e aparece aqui quando ficar pronta
            </div>
          </div>
          {etapa && etapa.segundos != null && <span className="tnum text-xs text-ink-3">{etapa.segundos}s</span>}
        </div>
      )}

      {msg && <div className="mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}

      {/* Acervo */}
      <Panel>
        <PanelHeader title="Suas campanhas" description={saved.length ? `${saved.length} peça(s) em ${collections.length} campanha(s)` : undefined}
          actions={saved.length ? (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-44 rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-ink-3" />
            </div>
          ) : undefined} />
        {loading ? (
          <div className="p-6"><Spinner size={20} /></div>
        ) : saved.length === 0 ? (
          <EmptyState icon={Sparkles} title="Nada por aqui ainda"
            description="Comece por “Criar campanha com IA”: uma frase e você tem as peças prontas para colocar na TV." />
        ) : groupNames.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum resultado" description="Tente outro termo de busca." />
        ) : (
          <div className="space-y-5 p-4">
            {groupNames.map((camp) => {
              const doGrupo = groups[camp];
              return (
                <div key={camp} className="rounded-xl border border-line">
                  {/* Cabeçalho da pasta: a campanha inteira é gerenciada aqui */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                    <FolderOpen size={15} className="text-ink-3" />
                    <span className="text-sm font-semibold text-ink">{camp}</span>
                    <span className="tnum text-2xs text-ink-3">{doGrupo.length} peça(s)</span>
                    <div className="flex-1" />
                    <button onClick={() => abrirPublicar(camp, doGrupo.map((it) => ({ item: it.item, formato: it.formato || '16/9', label: it.label })))}
                      className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-2xs font-semibold text-white transition hover:opacity-90">
                      <Rocket size={12} /> Publicar campanha
                    </button>
                    <button title="Renomear" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => renomearCampanha(camp)}><Type size={13} /></button>
                    <button title="Duplicar campanha" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => duplicarCampanha(camp)}><Copy size={13} /></button>
                    <button title="Excluir campanha" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-danger" onClick={() => excluirCampanha(camp, doGrupo.length)}><Trash2 size={13} /></button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {doGrupo.map((it) => (
                      <div key={it.id} className="space-y-2 rounded-lg border border-line bg-surface p-2">
                        <DesignThumb item={it.item} />
                        <div className="truncate px-0.5 text-2xs font-medium text-ink-2">{it.label}</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => abrirPublicar(it.label || camp, [{ item: it.item, formato: it.formato || '16/9', label: it.label }])}
                            className="flex flex-1 items-center justify-center gap-1 rounded-md bg-surface-2 px-2 py-1.5 text-2xs font-semibold text-ink-2 transition hover:bg-accent hover:text-white">
                            <Send size={12} /> Publicar
                          </button>
                          <button title="Editar" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => setEditing({ id: it.id, item: it.item, label: it.label })}><Pencil size={13} /></button>
                          <button title="Baixar PNG" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => downloadComposition(it.item, it.formato, it.label)}><Download size={13} /></button>
                          <button title="Excluir" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-danger" onClick={async () => { if (window.confirm('Excluir este design?')) { await library.remove(it.id); reload(); } }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Por onde começar: modelo pronto ou tela vazia */}
      {modeloAberto && (
        <Suspense fallback={null}>
          <EscolherModelo aberto onFechar={() => setModeloAberto(false)} onEscolher={comecarDe} />
        </Suspense>
      )}

      {/* Editor de composição */}
      {editing && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/90"><Spinner size={22} /></div>}>
          <CompositionEditor value={editing.item} onClose={() => setEditing(null)} onSave={onEditorSave} />
        </Suspense>
      )}

      {/* Salvar design (nome + coleção) */}
      <SalvarEm
        aberto={!!saveItem}
        onFechar={() => setSaveItem(null)}
        onSalvar={salvarDesign}
        item={saveItem && saveItem.item}
        pastas={collections}
        ocupado={busy}
        titulo={(saveItem && saveItem.titulo) || 'Salvar design'}
        nomeSugerido={(saveItem && saveItem.nome) || ''}
        pastaSugerida={(saveItem && saveItem.pasta) || ''}
      />

      {/* Publicar — uma peça ou a campanha inteira, em uma ou várias telas */}
      <Dialog open={!!pub} onClose={() => setPub(null)} className="max-w-3xl"
        title={pub && pub.pecas.length > 1 ? 'Publicar campanha' : 'Publicar na tela'}
        description={pub && pub.pecas.length > 1
          ? 'Escolha as telas e quais formatos entram. Uma peça vertical não deve ir para uma TV deitada.'
          : 'Escolha em qual tela este design entra ao vivo.'}
        footer={<><Button variant="ghost" onClick={() => setPub(null)}>Cancelar</Button>
          <Button variant="primary" icon={Rocket} disabled={busy || !alvos.length || !pecasElegiveis.length} onClick={publicar}>
            {busy ? 'Publicando…' : `Publicar ${pecasElegiveis.length} peça(s)`}
          </Button></>}>
        {pub && (
          <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
            <div className="space-y-3">
              {/* Formatos: só aparece quando há mais de um em jogo */}
              {Array.from(new Set(pub.pecas.map((p) => p.formato || '16/9'))).length > 1 && (
                <div>
                  <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">Formatos a publicar</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(new Set(pub.pecas.map((p) => p.formato || '16/9'))).map((f) => {
                      const on = fmts.includes(f);
                      return (
                        <button key={f} onClick={() => setFmts((a) => (on ? a.filter((x) => x !== f) : a.concat(f)))}
                          className={'rounded-md border px-2.5 py-1 text-2xs font-semibold transition ' + (on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-3 hover:text-ink')}>
                          {f}{on && ' ✓'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {pecasElegiveis.slice(0, 6).map((p, i) => <DesignThumb key={i} item={p.item} />)}
              </div>
              {/*
                Quanto tempo no ar. A campanha sai sozinha no fim do prazo e a
                tela volta ao que era — sem isso, "roda por dias" dependia de
                alguém lembrar de tirar.
              */}
              <div className="rounded-lg border border-line p-2.5">
                <div className="mb-1.5 text-xs font-medium text-ink-2">Fica no ar por</div>
                <div className="flex flex-wrap gap-1.5">
                  {[[0, 'Até eu trocar'], [1, 'Hoje'], [3, '3 dias'], [7, '1 semana'], [30, '1 mês']].map(([d, rot]) => (
                    <button
                      key={d} type="button" onClick={() => setDias(d)}
                      className={'rounded-md border px-2.5 py-1 text-xs transition ' +
                        (dias === d ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-3 hover:text-ink')}
                    >{rot}</button>
                  ))}
                </div>
                {temFaixas && (
                  <p className="mt-2 text-2xs leading-relaxed text-ink-3">
                    As peças se revezam ao longo do dia: {resumoFaixas}. Isso vem do plano da campanha — não precisa mexer.
                  </p>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2.5 text-xs text-ink-2">
                <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="mt-0.5" />
                <span>
                  <b className="text-ink">Substituir a playlist</b>
                  <span className="block text-ink-3">Apaga o que já estava na tela e deixa só esta campanha. Sem marcar, troca apenas as peças desta mesma campanha e preserva o resto.</span>
                </span>
              </label>
            </div>
            <div>
              {screens.length ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Telas</div>
                    <div className="flex-1" />
                    <button className="text-2xs text-accent hover:underline"
                      onClick={() => setAlvos(alvos.length === screens.length ? [] : screens.map((s) => s.id))}>
                      {alvos.length === screens.length ? 'limpar' : 'todas'}
                    </button>
                  </div>
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {screens.map((s) => {
                      const on = alvos.includes(s.id);
                      return (
                        <button key={s.id} onClick={() => setAlvos((a) => (on ? a.filter((x) => x !== s.id) : a.concat(s.id)))}
                          className={'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ' + (on ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2 hover:bg-surface-2')}>
                          <MonitorPlay size={16} className={on ? 'text-accent' : 'text-ink-3'} />
                          <span className="flex-1 truncate">{s.name || s.code || s.id}</span>
                          {on && <Check size={15} className="text-accent" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-3">Nenhuma tela pareada. Pareie uma TV em <b>Telas</b> e volte aqui — a campanha continua salva.</div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* Criar campanha com IA — o diretor de arte */}
      <Dialog open={aiOpen} onClose={() => { setAiOpen(false); setGen(null); }} className="max-w-4xl"
        title="Criar campanha com IA"
        /*
          O subtítulo acompanha a etapa. "Descreva em uma frase" na tela do
          cardápio manda fazer algo que não há onde fazer — não existe campo
          ali, só três ideias para escolher.
        */
        description={guiando
          ? 'Escolha uma ideia para começar, ou escreva a sua. Nada é gerado antes de você confirmar.'
          : plano
            ? 'Confira o que a IA entendeu. Nenhum crédito saiu ainda.'
            : 'Descreva em uma frase. A IA lê a sua Marca, monta as peças, escreve as legendas e diz quando postar.'}
        footer={gen
          ? (<>
            <Button variant="ghost" onClick={() => setGen(null)}>Voltar</Button>
            <Button variant="secondary" icon={Check} disabled={busy} onClick={() => salvarCampanha(false)}>{busy ? 'Salvando…' : 'Só salvar'}</Button>
            <Button variant="primary" icon={Rocket} disabled={busy} onClick={() => salvarCampanha(true)}>Salvar e publicar</Button>
          </>)
          : guiando
            // O cardápio traz os próprios caminhos ("escolher" e "escrever").
            ? <Button variant="ghost" onClick={() => setAiOpen(false)}>Cancelar</Button>
            : plano
            /*
             * A tela de confirmação traz os próprios botões — e são outros:
             * "Voltar e corrigir" e "Gerar as N peças". Deixar o rodapé antigo
             * embaixo dela põe "Gerar direto" ao lado de "Gerar as 3 peças",
             * e o cliente não tem como saber que um deles pula a confirmação
             * que acabou de aparecer.
             */
            ? null
            : conversando
            ? <Button variant="ghost" onClick={() => setConversando(false)}>Voltar</Button>
            : (<>
              <Button variant="ghost" onClick={() => setAiOpen(false)}>Cancelar</Button>
              {/*
                Duas saídas: conversar melhora a campanha, gerar direto é mais
                rápido. Nenhuma das duas é escondida — quem tem pressa não pode
                ser obrigado a passar pela conversa.
              */}
              <Button variant="secondary" icon={Wand2} disabled={emAndamento || !brief.trim()} onClick={() => planejarCampanha(null)}>
                {emAndamento ? 'Dirigindo…' : 'Gerar direto'}
              </Button>
              <Button variant="primary" icon={MessagesSquare} disabled={emAndamento || !brief.trim()} onClick={() => setConversando(true)}>
                Refinar conversando
              </Button>
            </>)}>
        {emAndamento && etapa ? (
          /*
           * A campanha leva minutos. Mostrar a etapa em texto é o que separa
           * "está pensando" de "travou" — e é honesto: são as etapas reais.
           */
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Spinner size={26} />
            <div>
              <div className="text-sm font-semibold text-ink">{etapa.etapa || 'trabalhando'}</div>
              {etapa.detalhe && <div className="mt-0.5 text-xs text-ink-3">{etapa.detalhe}</div>}
            </div>
            <div className="tnum text-2xs text-ink-3">{etapa.segundos || 0}s · uma campanha completa leva um ou dois minutos</div>
          </div>
        ) : guiando ? (
          <Guia
            empresa={empresa}
            onEscolher={escolherSugestao}
            onPular={() => setGuiando(false)}
          />
        ) : plano ? (
          /*
           * A CERTEZA ANTES DO CRÉDITO.
           *
           * Nada aqui foi gerado ainda: o plano custou uma chamada de texto,
           * centavos. O que o cliente lê é o que a IA ENTENDEU — as manchetes
           * de verdade, os formatos de verdade, e quantas peças vão custar
           * imagem. Se entendeu errado, ele volta e corrige de graça.
           *
           * Desmarcar peça é o que torna isto uma decisão e não um aviso: sem
           * poder tirar nada, "confirmar" é só um clique a mais no caminho.
           */
          <PlanoParaConfirmar
            plano={plano}
            onGerar={(aprovado) => gerarCampanha(aprovado)}
            onVoltar={() => setPlano(null)}
          />
        ) : conversando ? (
          <BriefingChat
            empresa={empresa} segmento=""
            primeiraFala={brief}
            onPronto={(resumo) => planejarCampanha(resumo)}
            onPular={() => planejarCampanha(null)}
          />
        ) : !gen ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="O que você quer anunciar?" hint="Uma frase basta. A IA transforma isso num briefing antes de desenhar.">
                <Textarea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ex.: promoção de café da manhã até domingo" />
              </Field>
            </div>
            <Field label="Empresa"><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Sua empresa" /></Field>
            <Field label="Público-alvo"><Input value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Ex.: 25-45, classe A/B" /></Field>
            <Field label="Tom">
              <Select value={tom} onChange={(e) => setTom(e.target.value)}>
                <option value="">Usar o tom da minha Marca</option><option value="sofisticado">Sofisticado</option><option value="energético">Energético</option>
                <option value="corporativo">Corporativo</option><option value="divertido">Divertido</option><option value="minimalista">Minimalista</option>
              </Select>
            </Field>
            <Field label="Oferta / CTA"><Input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Ex.: 30% off até domingo" /></Field>

            {/*
              O CHECKLIST — onde, quantas, e o que fazer com foto.
              Fica ANTES do botão de gerar de propósito: era exatamente o que
              faltava. Sem ele o modelo decidia os três, e o que saía era "um
              monte de coisa" — peça em formato que a pessoa não usa, na
              quantidade que ela não pediu, cada uma podendo custar uma imagem.
            */}
            <div className="sm:col-span-2 rounded-lg border border-line bg-surface-2 p-3">
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Onde vai aparecer</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {ONDE.map((o) => {
                  const marcado = onde.includes(o.id);
                  return (
                    <button key={o.id} type="button"
                      onClick={() => setOnde((atual) => {
                        // Nunca deixa ficar sem nenhum: campanha para lugar
                        // nenhum não é uma escolha, é um beco.
                        if (!marcado) return [...atual, o.id];
                        return atual.length > 1 ? atual.filter((x) => x !== o.id) : atual;
                      })}
                      className={'flex items-start gap-2 rounded-md border p-2 text-left transition '
                        + (marcado ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-ink-3')}>
                      <span className={'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border '
                        + (marcado ? 'border-accent bg-accent text-accent-fg' : 'border-line')}>
                        {marcado && <Check size={11} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-ink">{o.rotulo}</span>
                        <span className="block text-2xs text-ink-3">{o.nota}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Quantas peças" hint="Cada peça é uma arte diferente.">
                  <Select value={String(quantas)} onChange={(e) => setQuantas(Number(e.target.value))}>
                    {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                      <option key={n} value={n}>{n} peça{n > 1 ? 's' : ''}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Fotos">
                  <Select value={imagens} onChange={(e) => setImagens(e.target.value)}>
                    {IMAGENS.map((i) => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="mt-1 text-2xs text-ink-3">
                {(IMAGENS.find((i) => i.id === imagens) || {}).nota}
              </div>

              {/*
                O custo ANTES do clique.
                É um teto, e a frase diz isso: o diretor usa as fotos da empresa
                antes de desenhar, então o gasto real costuma ser menor. Prometer
                um número exato que depois vem menor seria mentir para baixo — e
                prometer para baixo e cobrar mais seria pior ainda.
              */}
              <div className="mt-2.5 flex items-start gap-1.5 border-t border-line pt-2.5 text-2xs leading-snug text-ink-2">
                <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />
                <span>
                  {imagens === 'gerar' ? (
                    <>Vai usar <b className="text-ink">até {quantas} crédito{quantas > 1 ? 's' : ''}</b> de IA —
                    um por foto que precisar ser desenhada. Suas fotos do acervo entram primeiro e não custam nada.</>
                  ) : (
                    <>Não usa crédito de IA: {imagens === 'acervo' ? 'só entram fotos que você já subiu' : 'as peças saem sem foto'}.</>
                  )}
                </span>
              </div>
            </div>

            <div className="sm:col-span-2 flex items-start gap-1.5 rounded-lg border border-line bg-surface-2 p-2.5 text-2xs leading-snug text-ink-3">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-ink-3" />
              As cores, fontes, logo e fotos vêm da sua <b className="text-ink-2">Marca</b>. O que você preencher aqui tem prioridade sobre ela.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Nome da campanha"><Input value={aiColl} onChange={(e) => setAiColl(e.target.value)} /></Field>

            {gen.briefing && (gen.briefing.objetivo || gen.briefing.argumento) && (
              <div className="rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
                <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">O que a IA entendeu</div>
                {gen.briefing.objetivo && <div><b className="text-ink">Objetivo:</b> {gen.briefing.objetivo}</div>}
                {gen.briefing.publico && <div><b className="text-ink">Público:</b> {gen.briefing.publico}</div>}
                {gen.briefing.argumento && <div><b className="text-ink">Argumento:</b> {gen.briefing.argumento}</div>}
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">
                Peças
                {gen.revisao && gen.revisao.refeitas > 0 && (
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium normal-case tracking-normal text-ink-3">
                    a IA refez {gen.revisao.refeitas} de {gen.revisao.avaliadas} para melhorar a leitura
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gen.pecas.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <DesignThumb item={p.item} />
                    <span className="block truncate text-2xs text-ink-3">{p.canal} · {p.formato}{p.usouAcervo ? ' · foto sua' : ''}</span>
                    {/*
                      O que a IA viu de errado e não conseguiu resolver. Mostrar
                      é o que permite ao usuário editar em vez de publicar torto
                      — esconder seria mentir sobre a qualidade da peça.
                    */}
                    {p.problemas && p.problemas.length > 0 && (
                      <div className="rounded border border-line bg-surface-2 px-1.5 py-1 text-2xs leading-snug text-ink-3">
                        <span className="font-semibold text-ink-2">revisar:</span> {p.problemas[0]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {gen.social && (gen.social.instagram || gen.social.whatsapp) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {['instagram', 'whatsapp', 'linkedin'].filter((k) => gen.social[k]).map((k) => (
                  <div key={k} className="rounded-lg border border-line p-2.5">
                    <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">
                      {k}
                      <button className="ml-auto font-medium normal-case tracking-normal text-accent hover:underline"
                        onClick={() => navigator.clipboard && navigator.clipboard.writeText(gen.social[k])}>copiar</button>
                    </div>
                    <div className="max-h-24 overflow-y-auto whitespace-pre-wrap text-2xs leading-relaxed text-ink-2">{gen.social[k]}</div>
                  </div>
                ))}
              </div>
            )}

            {gen.agenda && gen.agenda.length > 0 && (
              <div className="rounded-lg border border-line p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3"><CalendarClock size={12} /> Quando postar</div>
                <ul className="space-y-1 text-2xs text-ink-2">
                  {gen.agenda.map((a, i) => (
                    <li key={i}><b className="text-ink">{a.quando}</b> · {a.canal} — <span className="text-ink-3">{a.motivo}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Gerar imagem */}
      <Dialog open={imgOpen} onClose={() => setImgOpen(false)} title="Gerar imagem com IA" description="A imagem gerada vira um design (você nomeia e salva)."
        footer={<><Button variant="ghost" onClick={() => setImgOpen(false)}>Cancelar</Button><Button variant="primary" icon={ImagePlus} disabled={busy || !iPrompt.trim()} onClick={gerarImagem}>{busy ? 'Gerando…' : 'Gerar'}</Button></>}>
        <div className="grid gap-3">
          <Field label="Descrição"><Textarea rows={3} value={iPrompt} onChange={(e) => setIPrompt(e.target.value)} placeholder="Ex.: xícara de café fumegante, luz quente, fundo desfocado." /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Formato">
              <Select value={iFormato} onChange={(e) => setIFormato(e.target.value)}>
                <option value="16/9">TV paisagem (16:9)</option><option value="9/16">TV retrato (9:16)</option><option value="1/1">Quadrado (1:1)</option><option value="21/9">Banner (21:9)</option>
              </Select>
            </Field>
            <Field label="Estilo">
              <Select value={iEstilo} onChange={(e) => setIEstilo(e.target.value)}>
                {['fotográfico', 'ilustração', '3D', 'flat/vetorial', 'minimalista', 'vibrante'].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
