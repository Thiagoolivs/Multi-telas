import React, { useEffect, useMemo, useState, useRef, Suspense, lazy } from 'react';
import {
  ArrowLeft, Plus, ChevronUp, ChevronDown, Copy, Trash2, Check, Clock, GripVertical, LayoutGrid, Settings2, Info, CalendarClock, MessageSquare, LayoutTemplate } from 'lucide-react';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { QuandoMostrar } from '../components/content/QuandoMostrar.jsx';
import { temAgenda, resumoAgenda } from '../lib/agenda.js';
import { emitir, aviso } from '../lib/avisos.js';
import { confirmar } from '../lib/confirmar.js';
import { ItemForm } from '../components/content/ItemForm.jsx';
import { ItemPreview } from '../components/content/ItemPreview.jsx';
import { PecaHtml } from '../components/content/PecaHtml.jsx';
import { TypePicker } from '../components/content/TypePicker.jsx';
import { SettingsForm } from '../components/content/SettingsForm.jsx';
import { aplicarConteudo } from '../lib/aplicarConteudo.js';
import { SeasonBanner } from '../components/content/SeasonBanner.jsx';
import { ScreenSummary } from '../components/content/ScreenSummary.jsx';
import { MapaDaTela } from '../components/tela/MapaDaTela.jsx';
import { FaixaDaTela, pecasDaFaixa, comPecas } from '../components/tela/FaixaDaTela.jsx';
import { papelDaZona, campanhasDaConfig } from '../lib/tela.js';
import { CampanhasNaTela, semCampanha } from '../components/tela/CampanhasNaTela.jsx';
import { criar } from '../api.js';
// Editor visual (react-moveable) carregado sob demanda — não pesa o painel.
const CompositionEditor = lazy(() => import('../components/content/CompositionEditor.jsx').then((m) => ({ default: m.CompositionEditor })));
const EscolherModelo = lazy(() => import('../components/content/EscolherModelo.jsx').then((m) => ({ default: m.EscolherModelo })));
import { useAsync } from '../lib/useAsync.js';
import { deviceConfig, brand as brandApi } from '../api.js';
import { Sparkles, Wand2 } from 'lucide-react';
import { Field, Input, Textarea } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { ai } from '../api.js';
import { CONTENT_TYPES, typeLabel, itemSummary, defaultConfig } from '../lib/contentTypes.js';
import { zonesOf, ensureZone, formatoDoLayout } from '../lib/screenConfig.js';
import { cn } from '../lib/cn.js';

// Zona inicial: prefere a "principal" (o destaque), senão a 1ª playlist.
/*
 * O RASCUNHO da tela (EXECUTOR D14). Antes cada tecla publicava: a TV
 * redesenhava a tela inteira enquanto a pessoa digitava, e escolher "Aviso"
 * punha um aviso vazio na parede. Agora o que se edita fica aqui (e no
 * navegador, para não se perder ao sair), e a TV só recebe no "Publicar".
 */
const chaveDoRascunho = (id) => 'mt.rascunho.' + id;
// Rascunho com mais de 30 dias não volta (revisão do consultor no #232): ninguém lembra do que era.
const VALIDADE_DO_RASCUNHO = 30 * 24 * 60 * 60 * 1000;
function lerRascunho(id) {
  try {
    const r = JSON.parse(localStorage.getItem(chaveDoRascunho(id)) || 'null');
    if (r && Date.now() - (Number(r.em) || 0) > VALIDADE_DO_RASCUNHO) { localStorage.removeItem(chaveDoRascunho(id)); return null; }
    return r;
  } catch (e) { return null; }
}
function guardarRascunho(id, cfg, versao) {
  try { localStorage.setItem(chaveDoRascunho(id), JSON.stringify({ cfg, versao, em: Date.now() })); } catch (e) { /* sem espaço: segue só na tela */ }
}
function apagarRascunho(id) {
  try { localStorage.removeItem(chaveDoRascunho(id)); } catch (e) { /* nada */ }
}
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function defaultZone(zones) {
  const z = zones.find((x) => x.id === 'principal') || zones.find((x) => x.type === 'playlist') || zones[0];
  return z ? z.id : null;
}

export function ContentEditorPage({ device, zonaInicial, onBack, onCriar, onIr }) {
  // A programação COM a versão (D0.5): quem grava devolve a versão lida.
  const { data, loading, error, reload } = useAsync(() => deviceConfig.ler(device.id), [device.id]);
  const versao = useRef(0);
  const [conflito, setConflito] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  const [cfg, setCfg] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoneId, setZoneId] = useState(null);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [compOpen, setCompOpen] = useState(false); // editor visual da composição
  const [modeloAberto, setModeloAberto] = useState(false); // galeria de modelos
  const [picker, setPicker] = useState(false);
  const [campOpen, setCampOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState(null);
  const [publishError, setPublishError] = useState('');
  const saveTimer = useRef(null);
  // { em, mudouNaTV, cfg? }: o rascunho que voltou ao abrir (D14).
  const [avisoRascunho, setAvisoRascunho] = useState(null);

  /*
   * Semeia o config de trabalho quando chega (config null = TV sem
   * programação ainda).
   *
   * FALHA AO CARREGAR NÃO É TELA VAZIA. Antes, `data || defaultConfig`
   * semeava a programação padrão também quando a leitura falhava (rede,
   * servidor): a tela aparecia "vazia", editável, e o primeiro toque salvava
   * o padrão POR CIMA da programação real da TV (EXECUTOR D0.5). Agora o
   * erro fica no lugar do editor, com "tentar de novo".
   */
  useEffect(() => {
    if (loading) return;
    if (error || !data) { setCfg(null); return; }
    const seeded = data.config || defaultConfig(device.name);
    versao.current = data.versao || 0;
    setConflito(false);
    setTentativa(0);
    /*
     * Rascunho guardado (D14): o que a pessoa editou e não publicou volta.
     * Se a TV mudou depois dele (outra aba, outra pessoa, uma campanha), não
     * entra sozinho por cima: a pessoa escolhe abrir o rascunho ou descartar.
     */
    const r = lerRascunho(device.id);
    if (r && r.cfg && JSON.stringify(r.cfg) !== JSON.stringify(seeded)) {
      if (r.versao === versao.current) {
        setCfg(r.cfg); setDirty(true); setAvisoRascunho({ em: r.em, mudouNaTV: false });
      } else {
        setCfg(seeded); setDirty(false); setAvisoRascunho({ em: r.em, mudouNaTV: true, cfg: r.cfg });
      }
    } else {
      if (r) apagarRascunho(device.id);
      setCfg(seeded); setDirty(false); setAvisoRascunho(null);
    }
    // Tocou numa parte da TV em Programação: abre nela (D3; antes ignorava e abria a principal).
    const zs = zonesOf(seeded);
    setZoneId(zonaInicial && zs.some((z) => z.id === zonaInicial) ? zonaInicial : defaultZone(zs));
  }, [data, loading, error, device.name]);

  const zones = useMemo(() => (cfg ? zonesOf(cfg) : []), [cfg]);
  const telaVazia = useMemo(() => !!cfg && zones.filter((z) => z.type === 'playlist')
    .every((z) => !((cfg.zonas[z.id] || {}).items || []).length), [cfg, zones]);

  /*
   * O formato que esta TELA pede.
   *
   * O layout escolhido já diz a orientação — um totem em pé, uma tela
   * quadrada. Começar uma peça em 16/9 para um totem produz arte que só se
   * descobre torta na parede, e ninguém confere isso antes de publicar.
   */
  const formatoDaTela = useMemo(
    () => formatoDoLayout(cfg && cfg.settings && cfg.settings.layoutId),
    [cfg],
  );
  const activeZone = zones.find((z) => z.id === zoneId) || zones[0];
  const layoutCanonico = useMemo(() => {
    const id = cfg && cfg.settings && cfg.settings.layoutId;
    return globalThis.MT_getLayout ? globalThis.MT_getLayout(id) : null;
  }, [cfg]);

  // O que gira em cada zona, em poucas palavras, para o desenho da TV.
  function resumoDaZona(z) {
    const d = (cfg && cfg.zonas[z.id]) || {};
    if (z.type === 'header') { const n = pecasDaFaixa(d).length; return n ? n + (n === 1 ? ' peça' : ' estilos') : 'automático'; }
    if (z.type === 'ticker') { const n = pecasDaFaixa(d).length; return n ? n + (n === 1 ? ' peça' : ' peças') : (Array.isArray(d.fontes) && d.fontes.length ? 'notícias' : 'avisos'); }
    const n = (d.items || []).length;
    return n ? n + (n === 1 ? ' conteúdo' : ' conteúdos') : 'vazia';
  }

  /*
   * Campanhas nesta TV (item 30): tirar daqui também tira esta TV da lista
   * da campanha; sem TV nenhuma, ela fica pausada.
   */
  async function campanhaPeloNome(nome) {
    const r = await criar.campanhas().catch(() => null);
    return ((r && r.campanhas) || []).find((c) => c.nome === nome) || null;
  }
  async function tirarCampanha(nome) {
    const antes = cfg;
    /*
     * Tirar uma campanha é ação explícita, e a campanha também sai da lista
     * desta TV no servidor: publica já (D14), senão a campanha diria "fora"
     * enquanto a TV ainda a mostra.
     */
    const novo = structuredClone(cfg);
    novo.zonas = semCampanha(novo, nome).zonas;
    setCfg(novo);
    if (!(await publish(novo))) setDirty(true);
    const c = await campanhaPeloNome(nome);
    const listaAntes = c ? { estado: c.estado, telas: (c.telas || []).slice() } : null;
    /*
     * O "Desfazer" devolve a programação E a TV à lista da campanha (D3).
     * Antes só a programação voltava: a campanha seguia sem esta TV, ou
     * pausada, se era a última.
     */
    emitir({
      tom: 'desfazer', texto: 'A campanha "' + nome + '" saiu desta TV.',
      acao: {
        rotulo: 'Desfazer',
        on: () => {
          setCfg(antes); publish(antes).then((ok) => { if (!ok) setDirty(true); });
          if (c && listaAntes) criar.marcar(c.id, listaAntes.estado, listaAntes.telas).catch((e) => aviso.erro('campanha', e.message || 'A campanha não voltou a listar esta TV.'));
        },
      },
    });
    if (c && (c.telas || []).includes(device.id)) {
      const resto = c.telas.filter((x) => x !== device.id);
      criar.marcar(c.id, resto.length ? c.estado : 'pausada', resto).catch((e) => aviso.erro('campanha', e.message || 'A campanha não foi atualizada.'));
    }
  }
  async function abrirCampanha(nome) {
    const c = await campanhaPeloNome(nome);
    if (c && onIr) onIr('campanhas', { campanha: c.id });
    else if (onIr) onIr('campanhas');
  }

  // Se o layout mudou e a zona ativa sumiu, volta para a primeira.
  useEffect(() => {
    if (!cfg || !zones.length) return;
    if (!zones.find((z) => z.id === zoneId)) {
      setZoneId(defaultZone(zones));
      setSelected(0);
    }
  }, [zones]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchCfg(fn) {
    setCfg((prev) => { const next = structuredClone(prev); fn(next); return next; });
    setDirty(true);
  }

  /*
   * Veste a tela com a PROGRAMAÇÃO da data — não com uma mensagem só.
   *
   * Antes isto punha a saudação na zona principal e pronto: a lateral ficava
   * vazia, o rodapé com o texto de sempre e nenhuma decoração. O cliente
   * aplicava a data e a tela continuava com cara de nada.
   *
   * Agora entra conteúdo em toda zona que o layout tiver, mais tema, decoração
   * e os avisos do rodapé. Nada é apagado: o que já existia continua depois.
   */
  function aplicarSeason(season, programa) {
    patchCfg((next) => {
      const t = programa.theme || season.theme;
      if (t) {
        const atual = next.settings.theme || {};
        next.settings.theme = {
          ...atual,
          preset: t.preset || atual.preset,
          overrides: { ...(atual.overrides || {}), ...(t.overrides || {}) },
        };
      }
      if (programa.decoracao) next.settings.decoracao = programa.decoracao;

      const zonas = zonesOf(next);
      const porTipo = (id) => zonas.find((z) => z.id === id);

      /*
       * Mesma função que a campanha usa (lib/aplicarConteudo.js). As duas
       * marcavam origem e se comportavam ao contrário: a data trocava, a
       * campanha empilhava. Agora a política é explícita e igual para ambas.
       */
      const principal = porTipo('principal') || zonas.find((z) => z.type === 'playlist');
      const lateral = porTipo('lateral');
      const blocos = {};
      if (principal && programa.principal && programa.principal.length) blocos[principal.id] = programa.principal;
      if (lateral && programa.lateral && programa.lateral.length) blocos[lateral.id] = programa.lateral;
      for (const id of Object.keys(blocos)) ensureZone(next, zonas.find((z) => z.id === id));
      const comConteudo = aplicarConteudo(next, blocos, { chave: '_season', valor: season.id }, 'trocar');
      next.zonas = comConteudo.zonas;

      const rod = zonas.find((z) => z.type === 'ticker');
      if (rod && programa.rodape && programa.rodape.messages.length) {
        ensureZone(next, rod);
        const z = next.zonas[rod.id];
        z.titulo = programa.rodape.titulo || z.titulo;
        const antigas = (z.messages || []).filter((m) => !programa.rodape.messages.includes(m));
        z.messages = programa.rodape.messages.concat(antigas);
      }
    });
  }

  const items = (activeZone && cfg && cfg.zonas[activeZone.id] && cfg.zonas[activeZone.id].items) || [];

  function selectZone(zone) {
    patchCfg((next) => ensureZone(next, zone));
    setZoneId(zone.id);
    setSelected(0);
  }

  function mutateItems(fn) {
    patchCfg((next) => {
      if (!next.zonas[activeZone.id]) next.zonas[activeZone.id] = { items: [] };
      const arr = [...(next.zonas[activeZone.id].items || [])];
      next.zonas[activeZone.id].items = fn(arr);
    });
  }
  /*
   * Criar do zero.
   *
   * Composição passa antes pela galeria de modelos. A porta daqui abria o
   * palco EM BRANCO, que é exatamente o que os modelos existem para evitar —
   * e eles só estavam alcançáveis pela biblioteca, do outro lado do painel.
   * Quem está montando a programação de uma tela é justamente quem tem menos
   * paciência para começar do zero.
   */
  const addItem = (type) => {
    if (type === 'composicao') { setModeloAberto(true); return; }
    // Atalho para um modelo pronto (TypePicker): já na cor da marca e no
    // formato desta tela, e abre o editor para trocar os itens.
    if (type.startsWith('modelo:')) {
      Promise.all([import('../../../js/modelos.js'), brandApi.get().catch(() => null)]).then(([, r]) => {
        const cores = (r && r.kit && r.kit.cores) || [];
        const peca = globalThis.MTModelos && globalThis.MTModelos.montar(type.slice(7), formatoDaTela, cores);
        comecarDe(peca, formatoDaTela);
      });
      return;
    }
    mutateItems((arr) => { arr.push(CONTENT_TYPES[type].make()); return arr; });
    setSelected(items.length);
  };

  /*
   * Saiu da galeria: abre o editor com a peça, mas ela só entra na
   * programação no SALVAR.
   *
   * Antes entrava na hora, e o salvamento automático a publicava enquanto a
   * pessoa ainda editava — com os preços de exemplo do modelo ("R$ 19,90",
   * "Café expresso R$ 6,00") na TV da loja. Preço exibido ao público pode ter
   * que ser honrado. Cancelar agora descarta sem ter ido ao ar.
   */
  const [novaPeca, setNovaPeca] = useState(null);
  function comecarDe(peca, formato) {
    setModeloAberto(false);
    const base = CONTENT_TYPES.composicao.make();
    setNovaPeca(peca ? { ...base, ...peca } : { ...base, formato });
    setCompOpen(true);
  }
  // Inserir um design salvo da biblioteca (Meus Designs).
  const addSaved = (item) => {
    mutateItems((arr) => { arr.push(structuredClone(item)); return arr; });
    setSelected(items.length);
  };
  const updateItem = (idx, item) => mutateItems((arr) => { arr[idx] = item; return arr; });
  const moveItem = (idx, dir) => {
    const j = idx + dir; if (j < 0 || j >= items.length) return;
    mutateItems((arr) => { const [x] = arr.splice(idx, 1); arr.splice(j, 0, x); return arr; });
    setSelected(j);
  };
  const dupItem = (idx) => { mutateItems((arr) => { arr.splice(idx + 1, 0, structuredClone(arr[idx])); return arr; }); setSelected(idx + 1); };
  /*
   * Remover publica na hora (salvamento automático): um toque errado na
   * lixeira tirava o conteúdo da TV sem volta. O aviso traz "Desfazer", que
   * devolve na MESMA zona e posição, mesmo que a pessoa já tenha trocado de
   * zona no painel.
   */
  const removeItem = (idx) => {
    const zona = activeZone.id;
    const removido = items[idx];
    mutateItems((arr) => { arr.splice(idx, 1); return arr; });
    setSelected((s) => Math.max(0, Math.min(s, items.length - 2)));
    if (!removido) return;
    emitir({
      tom: 'desfazer', texto: 'Conteúdo removido da tela.',
      acao: { rotulo: 'Desfazer', on: () => patchCfg((next) => {
        if (!next.zonas[zona]) next.zonas[zona] = { items: [] };
        const arr = [...(next.zonas[zona].items || [])];
        arr.splice(Math.min(idx, arr.length), 0, removido);
        next.zonas[zona].items = arr;
      }) },
    });
  };

  async function generateAI() {
    if (!aiBrief.trim()) return;
    setAiBusy(true); setAiErr('');
    try {
      const { items: gen } = await ai.generate(aiBrief, {
        empresa: (cfg && cfg.settings && cfg.settings.nome) || '',
        tema: (cfg && cfg.settings && cfg.settings.theme && cfg.settings.theme.preset) || '',
      });
      if (!gen || !gen.length) { setAiErr('A IA não retornou conteúdo. Tente outro briefing.'); return; }
      mutateItems((arr) => { gen.forEach((g) => arr.push(g)); return arr; });
      setSelected(items.length); setAiOpen(false); setAiBrief('');
    } catch (e) { setAiErr(e.message || 'Falha ao gerar.'); }
    finally { setAiBusy(false); }
  }

  /*
   * PUBLICAR (D14): a TV só recebe aqui. `qual` é a programação a publicar
   * (a da tela, por padrão — ou a que uma ação explícita acabou de montar).
   */
  async function publish(qual) {
    const alvo = qual || cfg;
    if (!alvo) return false;
    setPublishing(true); setPublishError('');
    try {
      const r = await deviceConfig.save(device.id, alvo, versao.current);
      if (r && r.updatedAt) versao.current = r.updatedAt;
      setDirty(false); setPublishedAt(Date.now()); setTentativa(0); setConflito(false); setAvisoRascunho(null);
      apagarRascunho(device.id);
      return true;
    } catch (e) {
      // Outra aba, outra pessoa ou uma campanha gravou no meio: não passa por cima — e não joga fora o rascunho.
      if (e.codigo === 'config-mudou') { setConflito(true); return false; }
      setPublishError(e.message || 'Não deu para publicar.');
      return false;
    } finally { setPublishing(false); }
  }

  /*
   * O conflito não joga o trabalho fora (revisão do consultor no D0.5): a
   * pessoa escolhe pôr o rascunho por cima da versão nova, ou ver a nova.
   */
  async function publicarPorCima() {
    try {
      const r = await deviceConfig.ler(device.id);
      /*
       * Diz o que vai sumir (revisão do #232): a versão nova pode ter uma
       * campanha que alguém pôs na TV; "por cima" a tira. Quem confirma
       * precisa saber disso antes.
       */
      const meu = new Set(campanhasDaConfig(cfg).map((c) => c.nome));
      const somem = campanhasDaConfig((r && r.config) || {}).map((c) => c.nome).filter((n) => !meu.has(n));
      const ok = await confirmar({
        titulo: 'Publicar o seu por cima?',
        texto: somem.length
          ? 'A versão nova tem ' + (somem.length === 1 ? 'a campanha "' + somem[0] + '"' : 'as campanhas ' + somem.map((n) => '"' + n + '"').join(', ')) + ', que sai' + (somem.length === 1 ? '' : 'm') + ' desta TV. O resto da TV fica como no seu rascunho.'
          : 'O que mudou na outra versão se perde: a TV fica como no seu rascunho.',
        botao: 'Publicar por cima', perigo: somem.length > 0,
      });
      if (!ok) return;
      versao.current = (r && r.versao) || 0;
      await publish();
    } catch (e) { setPublishError(e.message || 'Não deu para ler a versão nova.'); }
  }
  async function descartarRascunho() {
    apagarRascunho(device.id);
    setAvisoRascunho(null); setConflito(false); setDirty(false);
    reload();
  }

  // O rascunho fica guardado no navegador enquanto não é publicado: sair e voltar não perde nada.
  useEffect(() => {
    if (!cfg) return undefined;
    if (!dirty) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => guardarRascunho(device.id, cfg, versao.current), 400);
    return () => clearTimeout(saveTimer.current);
  }, [cfg, dirty, device.id]);

  /*
   * Saiu com rascunho: ele fica guardado (não vai para a TV sozinho) e a
   * pessoa é avisada. Antes, sair publicava o que estivesse no meio.
   */
  const pendente = useRef(null);
  useEffect(() => { pendente.current = dirty && cfg ? cfg : null; }, [cfg, dirty]);
  useEffect(() => () => {
    const c = pendente.current;
    if (!c) return;
    guardarRascunho(device.id, c, versao.current);
    aviso.ok('O rascunho de "' + (device.name || 'TV') + '" ficou guardado. Ele ainda não está na TV.');
  }, [device.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl/⌘+S publica.
  useEffect(() => {
    const atalho = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty && !publishing) publish(); }
    };
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  });

  // Aplica uma campanha da IA (tela inteira) ao config: substitui as zonas
  // geradas e, se veio, a cor da marca.
  function applyCampaign(camp) {
    patchCfg((next) => {
      next.zonas = next.zonas || {};
      for (const [zid, zdata] of Object.entries(camp.zonas || {})) {
        // Motor HTML: cabeçalho e rodapé ganham a peça da campanha (a pele); o rodapé, também as frases.
        if (zdata.peca) next.zonas[zid] = { ...(next.zonas[zid] || {}), peca: zdata.peca };
        if (zdata.messages) next.zonas[zid] = { ...(next.zonas[zid] || {}), modo: 'mensagens', messages: zdata.messages };
        else if (zdata.items) next.zonas[zid] = { ...(next.zonas[zid] || {}), items: zdata.items };
      }
      const brand = camp.settings && camp.settings.brand;
      if (brand) {
        const t = next.settings.theme || (next.settings.theme = { preset: 'dark-premium', font: 'system', overrides: {} });
        t.overrides = { ...(t.overrides || {}), brand };
      }
    });
    setSelected(0);
  }

  const current = items[selected];

  return (
    <div>
      {/* Cabeçalho: voltar + publicar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <IconButton icon={ArrowLeft} label="Voltar" onClick={onBack} />
          <div>
            {/* O nome da TV (o da lista de Telas). settings.nome é o do cabeçalho: desde o item 39, o da conta. */}
            <h1 className="text-xl font-semibold tracking-tight text-ink">{device.name || (cfg && cfg.settings && cfg.settings.nome) || 'Tela'}</h1>
            <p className="text-sm text-ink-3">O que aparece nesta tela · edite à vontade: a TV só muda quando você publica</p>
          </div>
        </div>
        {/* No celular os botões dividem uma linha sem quebrar texto. */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* O estado do rascunho (D14): a TV só recebe no Publicar. */}
          {dirty ? (
            <>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-warn">
                <span className="h-2 w-2 rounded-full bg-warn" aria-hidden /> Rascunho · ainda não está na TV
              </span>
              <Button variant="ghost" className="whitespace-nowrap" disabled={publishing}
                onClick={async () => { if (await confirmar({ titulo: 'Descartar o rascunho?', texto: 'A tela volta a ser o que está na TV agora.', botao: 'Descartar', perigo: true })) descartarRascunho(); }}>
                Descartar
              </Button>
              <Button variant="primary" icon={Check} className="whitespace-nowrap" disabled={publishing || conflito} onClick={() => publish()}>
                {publishing ? 'Publicando…' : 'Publicar na TV'}
              </Button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-emerald-500">
              <Check size={13} /> {publishedAt ? 'Publicado agora' : 'Igual ao que está na TV'}
            </span>
          )}
          {/*
            Um caminho de IA só (EXECUTOR item 28): "Campanha com IA" abria o
            formulário antigo, sem conversa nem escopo. Agora leva ao Criar com
            esta TV marcada. O CampaignDialog fica no código, sem botão, por 30 dias.
          */}
          {onCriar && <Button variant="secondary" icon={Plus} className="whitespace-nowrap" onClick={onCriar}>Criar para esta TV</Button>}
          <Button variant="secondary" icon={Settings2} className="whitespace-nowrap" onClick={() => setSettingsOpen(true)}>Ajustes da tela</Button>
        </div>
      </div>

      {conflito && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-ink">
          <span>Esta TV foi mudada em outro lugar (outra aba, outra pessoa ou uma campanha) enquanto você editava. Seu rascunho está guardado.</span>
          <span className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={async () => { if (await confirmar({ titulo: 'Ver a versão nova?', texto: 'O seu rascunho é descartado.', botao: 'Ver a nova', perigo: true })) descartarRascunho(); }}>Ver a versão nova</Button>
            <Button variant="primary" size="sm" disabled={publishing} onClick={publicarPorCima}>Publicar o meu por cima</Button>
          </span>
        </div>
      )}
      {avisoRascunho && !conflito && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-ink">
          <span>{avisoRascunho.mudouNaTV
            ? 'Você tem um rascunho de ' + hora(avisoRascunho.em) + ', mas a TV mudou depois dele.'
            : 'Rascunho de ' + hora(avisoRascunho.em) + ' aberto: ele ainda não está na TV.'}</span>
          {avisoRascunho.mudouNaTV ? (
            <span className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => { apagarRascunho(device.id); setAvisoRascunho(null); }}>Descartar o rascunho</Button>
              <Button variant="secondary" size="sm" onClick={() => { setCfg(avisoRascunho.cfg); setDirty(true); setAvisoRascunho({ em: avisoRascunho.em, mudouNaTV: false }); }}>Abrir o rascunho</Button>
            </span>
          ) : (
            <button type="button" className="text-xs text-ink-3 hover:text-ink" onClick={() => setAvisoRascunho(null)}>Entendi</button>
          )}
        </div>
      )}
      {publishError && !conflito && <div className="mb-4 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{publishError} A TV continua com o que estava; o rascunho está guardado — toque em Publicar de novo.</div>}

      {/*
        A data comemorativa saiu daqui (EXECUTOR §2c, item 35): virou ideia no
        Criar e no Início. Vestir a tela com a data mora em Ajustes › Aparência (item 44).
      */}
      {false && cfg && <SeasonBanner zonas={zones.map((z) => z.id)} onAplicar={aplicarSeason} />}
      {/*
        COMECE POR AQUI — só enquanto a tela inteira está vazia.

        Uma tela nova abria com três áreas vazias e três avisos, e a pergunta
        "por onde eu começo?" ficava sem resposta. Três caminhos, do mais
        automático ao mais manual; some sozinho no primeiro conteúdo.
      */}
      {cfg && telaVazia && (
        <Panel className="mb-4">
          <div className="p-4">
            <div className="text-sm font-semibold text-ink">Esta tela ainda está vazia. Como você quer começar?</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => onCriar && onCriar()}
                className="rounded-lg border border-accent bg-accent-soft p-3 text-left transition hover:brightness-95">
                <MessageSquare size={18} className="text-accent" />
                <div className="mt-1.5 text-sm font-semibold text-ink">Criar com a IA</div>
                <div className="text-xs text-ink-3">Conte o que quer mostrar; a IA conversa e monta a tela inteira com a sua marca.</div>
              </button>
              <button type="button" onClick={() => setPicker(true)}
                className="rounded-lg border border-line p-3 text-left transition hover:bg-surface-2">
                <Plus size={18} className="text-ink-2" />
                <div className="mt-1.5 text-sm font-semibold text-ink">Escolher um conteúdo pronto</div>
                <div className="text-xs text-ink-3">Cardápio, promoção, aviso, foto, vídeo, clima, QR code…</div>
              </button>
              {/* D18: a tela inteira pronta, com a marca — o layout vem junto (mudar só o layout fica em "Ajustes da tela"). */}
              <button type="button" onClick={() => onIr && onIr('telasprontas', { tela: device && device.id })}
                className="rounded-lg border border-line p-3 text-left transition hover:bg-surface-2">
                <LayoutTemplate size={18} className="text-ink-2" />
                <div className="mt-1.5 text-sm font-semibold text-ink">Usar uma tela pronta</div>
                <div className="text-xs text-ink-3">A tela inteira já montada, com a sua marca: é só trocar os textos.</div>
              </button>
            </div>
          </div>
        </Panel>
      )}
      {cfg && <ScreenSummary cfg={cfg} />}

      {error && !loading ? (
        <Panel><ErrorState description="Não deu para carregar a programação desta TV. Nada foi mudado nela." onRetry={reload} /></Panel>
      ) : loading || !cfg ? (
        <div className="flex justify-center py-20"><Spinner size={22} /></div>
      ) : (
        <>
          <div className="mb-4 space-y-3">
            <CampanhasNaTela cfg={cfg} onTirar={tirarCampanha} onAbrir={onIr ? abrirCampanha : null} />
            {layoutCanonico && (
              <MapaDaTela layout={layoutCanonico} ativa={activeZone && activeZone.id} onEscolher={selectZone} resumo={resumoDaZona} />
            )}
          </div>

          {activeZone && (activeZone.type === 'ticker' || activeZone.type === 'header') ? (
            <Panel>
              <PanelHeader title={activeZone.type === 'header' ? 'Cabeçalho' : 'Rodapé'}
                description={activeZone.type === 'header' ? 'A faixa de cima: a marca, a hora e as chamadas.' : 'A faixa de baixo: as peças e os avisos que passam, ou as notícias.'} />
              <FaixaDaTela key={activeZone.id} tipo={activeZone.type} zona={cfg.zonas[activeZone.id]}
                onAjustes={() => setSettingsOpen(true)} onAdicionar={() => setPicker(true)}
                onChange={(z) => patchCfg((next) => { next.zonas[activeZone.id] = z; })} />
            </Panel>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
              {/* Sequência */}
              <Panel className="flex flex-col">
                <PanelHeader title="Sequência" description={items.length ? `${items.length} ${items.length === 1 ? 'conteúdo' : 'conteúdos'}` : undefined}
                  actions={<>
                    {/*
                      "IA" aqui gerava texto solto numa caixa à parte. Criar é
                      um lugar só (PLANO §5.1): o botão leva ao Criar com esta
                      tela marcada. A caixa antiga fica escondida por 30 dias.
                    */}
                    {onCriar
                      ? <Button size="sm" variant="secondary" icon={Plus} onClick={() => onCriar(papelDaZona(activeZone))}>Criar</Button>
                      : <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => { setAiOpen((o) => !o); setAiErr(''); }}>IA</Button>}
                    <Button size="sm" variant="primary" icon={Plus} onClick={() => setPicker(true)}>Adicionar</Button>
                  </>} />
                {aiOpen && (
                  <div className="space-y-2 border-b border-line bg-surface-2/50 p-3">
                    <Textarea rows={2} value={aiBrief} onChange={(e) => setAiBrief(e.target.value)}
                      placeholder="Descreva o que você quer (ex.: campanha de segurança, tom firme)…" />
                    {aiErr && <p className="text-xs text-danger">{aiErr}</p>}
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setAiOpen(false)}>Cancelar</Button>
                      <Button size="sm" variant="primary" icon={Sparkles} disabled={aiBusy || !aiBrief.trim()} onClick={generateAI}>
                        {aiBusy ? 'Gerando…' : 'Gerar conteúdo'}
                      </Button>
                    </div>
                  </div>
                )}
                {items.length === 0 ? (
                  <EmptyState icon={Plus} title="Sem conteúdo" description="Adicione o primeiro conteúdo para esta zona."
                    action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setPicker(true)}>Adicionar conteúdo</Button>} />
                ) : (
                  <ul className="divide-y divide-line">
                    {items.map((it, idx) => (
                      <li key={idx}>
                        <button onClick={() => setSelected(idx)}
                          className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left transition', idx === selected ? 'bg-accent-soft/60' : 'hover:bg-surface-2')}>
                          <GripVertical size={14} className="shrink-0 text-ink-3" />
                          <span className="w-10 shrink-0"><ItemPreview item={it} className="!rounded" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{itemSummary(it)}</span>
                            <span className="block truncate text-2xs text-ink-3">
                              {typeLabel(it.type)} · {it.duracao === 0 ? 'fixo' : (it.duracao || 0) + 's'}
                              {/* De qual campanha veio (item 25): é ela que "Pausar" tira daqui. */}
                              {it._campanha ? ' · campanha ' + it._campanha : ''}
                            </span>
                            {temAgenda(it) && (
                              <span className="mt-0.5 flex items-center gap-1 truncate text-2xs text-accent" title={resumoAgenda(it.agendamento)}>
                                <CalendarClock size={11} className="shrink-0" /> {resumoAgenda(it.agendamento)}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {/* Editor do item */}
              <Panel className="flex flex-col">
                {!current ? (
                  <EmptyState title="Nada selecionado" description="Selecione um conteúdo na sequência para editar." />
                ) : (
                  <>
                    <PanelHeader title={typeLabel(current.type)}
                      actions={
                        <div className="flex items-center gap-0.5">
                          <IconButton icon={ChevronUp} label="Subir" size={15} onClick={() => moveItem(selected, -1)} />
                          <IconButton icon={ChevronDown} label="Descer" size={15} onClick={() => moveItem(selected, 1)} />
                          <IconButton icon={Copy} label="Duplicar" size={15} onClick={() => dupItem(selected)} />
                          <IconButton icon={Trash2} label="Remover" size={15} className="hover:text-danger" onClick={() => removeItem(selected)} />
                        </div>
                      } />
                    <div className="grid gap-5 p-4 md:grid-cols-2">
                      <div>
                        <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Prévia</div>
                        <ItemPreview item={current} />
                        <p className="mt-2 flex items-center gap-1.5 text-2xs text-ink-3"><Clock size={12} /> {current.duracao === 0 ? 'Fica fixo na tela' : `${current.duracao || 0}s em tela`}</p>
                      </div>
                      <div>
                        <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Conteúdo</div>
                        {current.type === 'composicao' && (
                          <Button variant="primary" icon={LayoutGrid} className="mb-3 w-full" onClick={() => setCompOpen(true)}>
                            Abrir editor visual ({(current.elementos && current.elementos.length) || 0} elemento(s))
                          </Button>
                        )}
                        <ItemForm item={current} onChange={(it) => updateItem(selected, it)} />
                        <div className="mt-4">
                          <QuandoMostrar agendamento={current.agendamento}
                            onChange={(ag) => updateItem(selected, { ...current, agendamento: ag })} />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </Panel>
            </div>
          )}
        </>
      )}

      {/*
        Adicionar numa zona (item 32): o seletor sabe a zona — peças prontas
        que cabem nela primeiro — e o Criar novo abre o chat com esta TV e esta
        zona. No cabeçalho e no rodapé, a peça entra na lista que gira.
      */}
      <TypePicker open={picker} onClose={() => setPicker(false)} onPick={addItem} zona={activeZone}
        onPickItem={(item) => {
          if (activeZone && (activeZone.type === 'header' || activeZone.type === 'ticker')) {
            patchCfg((next) => { const z = next.zonas[activeZone.id] || {}; next.zonas[activeZone.id] = comPecas(z, pecasDaFaixa(z).concat({ duracao: 20, ...item })); });
          } else addSaved(item);
        }}
        onCriar={onCriar ? () => onCriar(papelDaZona(activeZone)) : null} />

      {/* Ajustes da tela — fora do fluxo de conteúdo, sem roubar espaço */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Ajustes da tela"
        description="Aparência, encaixe, som e horário. Salva sozinho; o horário, no botão dele." className="max-w-3xl"
        footer={<Button variant="primary" icon={Check} onClick={() => setSettingsOpen(false)}>Concluir</Button>}>
        {cfg && (
          <SettingsForm
            settings={cfg.settings}
            deviceId={device.id} device={device} zonas={cfg.zonas}
            onChange={(settings) => patchCfg((next) => { next.settings = settings; })}
            dataDeHoje={<SeasonBanner zonas={zones.map((z) => z.id)} onAplicar={aplicarSeason} />}
          />
        )}
      </Dialog>

      {modeloAberto && (
        <Suspense fallback={null}>
          <EscolherModelo
            aberto
            formatoSugerido={formatoDaTela}
            onFechar={() => setModeloAberto(false)}
            onEscolher={comecarDe}
          />
        </Suspense>
      )}

      {compOpen && (novaPeca || (current && current.type === 'composicao')) && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/90"><Spinner size={22} /></div>}>
          <CompositionEditor
            value={novaPeca || current}
            onClose={() => { setCompOpen(false); setNovaPeca(null); }}
            onSave={(it) => {
              if (novaPeca) {
                mutateItems((arr) => { arr.push(it); return arr; });
                setSelected(items.length);
                setNovaPeca(null);
              } else {
                updateItem(selected, it);
              }
              setCompOpen(false);
            }}
          />
        </Suspense>
      )}
      <CampaignDialog
        open={campOpen} onClose={() => setCampOpen(false)}
        empresa={(cfg && cfg.settings && cfg.settings.nome) || ''}
        tema={(cfg && cfg.settings && cfg.settings.theme && cfg.settings.theme.preset) || ''}
        zones={zones.map((z) => ({ id: z.id, type: z.type }))}
        onApply={(camp) => { applyCampaign(camp); setCampOpen(false); }}
      />
    </div>
  );
}

// Campanha com IA: formulário guiado (híbrido) → gera a TELA INTEIRA.
function CampaignDialog({ open, onClose, empresa, tema, zones, onApply }) {
  const [f, setF] = useState({ objetivo: '', publico: '', tom: '', oferta: '', prazo: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [followup, setFollowup] = useState('');
  const [answer, setAnswer] = useState('');
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function gen() {
    if (!f.objetivo.trim()) { setErr('Descreva o objetivo da campanha.'); return; }
    setBusy(true); setErr('');
    try {
      const answers = { ...f, extra: answer };
      const camp = await ai.campaign({ answers, empresa, tema, zones });
      if (camp.followupQuestion && !answer) { setFollowup(camp.followupQuestion); setBusy(false); return; }
      onApply(camp);
    } catch (e) { setErr(e.message || 'Falha ao gerar.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Campanha com IA"
      description="Responda o essencial; a IA cria o conteúdo da tela inteira."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" icon={Wand2} disabled={busy || !f.objetivo.trim()} onClick={gen}>{busy ? 'Gerando…' : 'Gerar campanha'}</Button>
      </>}>
      <div className="space-y-3">
        <Field label="Objetivo *" hint="O que a campanha precisa alcançar.">
          <Input value={f.objetivo} onChange={(e) => set('objetivo', e.target.value)} placeholder="Ex.: promover skate com 30% OFF esta semana" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Público"><Input value={f.publico} onChange={(e) => set('publico', e.target.value)} placeholder="jovens, clientes…" /></Field>
          <Field label="Tom"><Input value={f.tom} onChange={(e) => set('tom', e.target.value)} placeholder="animado, sóbrio…" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Oferta / CTA"><Input value={f.oferta} onChange={(e) => set('oferta', e.target.value)} placeholder="30% OFF · Ver ofertas" /></Field>
          <Field label="Prazo"><Input value={f.prazo} onChange={(e) => set('prazo', e.target.value)} placeholder="até domingo" /></Field>
        </div>
        {followup && (
          <Field label={`A IA perguntou: ${followup}`}>
            <Textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Responda para refinar…" />
          </Field>
        )}
        {err && <p className="text-xs text-danger">{err}</p>}
        <p className="text-2xs text-ink-3">Vai substituir o conteúdo das zonas desta tela. Você ajusta e publica depois.</p>
      </div>
    </Dialog>
  );
}
