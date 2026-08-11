import React, { useRef, useState, useCallback, useEffect, useMemo, useLayoutEffect } from 'react';
import Moveable from 'react-moveable';
import {
  ImagePlus, Type, Trash2, RotateCcw, Save, X, Square, RectangleHorizontal, RectangleVertical,
  Columns2, Sparkles, Shapes, Star, Undo2, Redo2, Copy, ZoomIn, ZoomOut, Maximize2,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Layers, ChevronDown, Italic, CaseUpper,
} from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Select } from '../ui/Field.jsx';
import { media, ai } from '../../api.js';
import { fillToCss, bgGradient, shapeClip, SHAPE_POLY, textFontCqw } from '../../lib/composition.js';
import { ICONS, ICON_NAMES } from '../../lib/icons.js';
import { criarHistorico, agora, empilhar, desfazer, refazer, selar, podeDesfazer, podeRefazer } from '../../lib/historico.js';
import { encaixar, alinhar, distribuir, envolvente } from '../../lib/alinhar.js';
import { decidirColagem } from '../../lib/colar.js';
import {
  estiloTexto, listar as listarFontes, pesosDe, pesoValido, dados as dadosDaFonte,
  carregarFonte, carregarDaComposicao, ESPACAMENTO, ENTRELINHA,
} from '../../lib/fontes.js';
import { PainelCamadas } from './PainelCamadas.jsx';

const ASPECTS = [
  { id: '16/9', label: 'Retangular', icon: RectangleHorizontal },
  { id: '1/1', label: 'Quadrada', icon: Square },
  { id: '9/16', label: 'Vertical', icon: RectangleVertical },
  { id: '21/9', label: 'Banner largo', icon: Columns2 },
];
const RESPIRO = 48;            // margem do palco dentro da área disponível, em px
const PASSO = 0.5;             // empurrão de seta, em % da peça
const PASSO_GRANDE = 3;

let _uid = 1;
const uid = () => 'e' + (_uid++) + Math.random().toString(36).slice(2, 6);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (n) => Math.round((Number(n) || 0) * 10) / 10;

/*
 * A ORDEM DO ARRAY é a ordem de empilhamento, e o último desenha por cima.
 * O player, porém, ordena por `z` (js/render.js) — então na entrada ordenamos
 * pelo z que veio salvo, e na saída regravamos z pelo índice. Assim o editor
 * trabalha com uma lista, que é o que o painel de camadas precisa, e o
 * formato do arquivo continua o mesmo.
 */
function entrar(els) {
  return [...(els || [])]
    .sort((a, b) => (a.z || 0) - (b.z || 0))
    .map((e) => ({ ...e, id: e.id || uid() }));
}
function sair(els) {
  return els.map(({ id, ...resto }, i) => ({
    ...resto, z: i,
    x: round(resto.x), y: round(resto.y), w: round(resto.w), h: round(resto.h), rot: round(resto.rot || 0),
  }));
}

export function CompositionEditor({ value, onClose, onSave }) {
  const v = value || {};

  /*
   * Tudo o que dá para desfazer vive num documento só. Fundo, elementos,
   * formato e duração entram; seleção e zoom ficam de fora — desfazer não pode
   * mexer no que a pessoa está olhando, só no que ela fez.
   */
  const [hist, setHist] = useState(() => criarHistorico({
    bg: v.bg && v.bg.kind ? v.bg : { kind: 'cor', cor: '#0a1020' },
    els: entrar(v.elementos),
    aspect: v.formato || '16/9',
    dur: v.duracao != null ? v.duracao : 12,
  }));
  const doc = agora(hist);
  const { bg, els, aspect, dur } = doc;

  const [sel, setSel] = useState([]);          // ids selecionados
  const [zoom, setZoom] = useState(1);
  const [guias, setGuias] = useState({ x: null, y: null });
  const [editandoTexto, setEditandoTexto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [g1, setG1] = useState('#1e3a8a');
  const [g2, setG2] = useState('#0a1020');
  const [gType, setGType] = useState('linear');

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const nodes = useRef({});
  const grupoRef = useRef(null);
  const imgInput = useRef(null);
  const bgInput = useRef(null);
  const areaTransf = useRef(null);   // { x, y } no começo do arrasto de grupo

  /* ---------------- Editar o documento ---------------- */

  const editar = useCallback((fn, etiqueta) => {
    setHist((h) => {
      const atual = agora(h);
      const novo = fn(atual);
      return novo === atual ? h : empilhar(h, novo, etiqueta);
    });
  }, []);
  const fecharPasso = useCallback(() => setHist((h) => selar(h)), []);

  /*
   * Desfazer e refazer mantêm selecionado tudo o que ainda existe depois do
   * salto. A primeira versão limpava a seleção inteira, por medo de apontar
   * para um elemento apagado — e o efeito era irritante: desfazer e em seguida
   * duplicar não fazia nada, porque não havia mais nada selecionado. Filtrar
   * pelo que sobrou resolve as duas coisas.
   */
  const saltar = useCallback((direcao) => {
    setHist((h) => {
      const novo = direcao > 0 ? refazer(h) : desfazer(h);
      if (novo === h) return h;
      const vivos = new Set(agora(novo).els.map((e) => e.id));
      setSel((s) => s.filter((id) => vivos.has(id)));
      setEditandoTexto(null);
      return novo;
    });
  }, []);

  const setEls = useCallback((fn, etiqueta) => {
    editar((d) => ({ ...d, els: typeof fn === 'function' ? fn(d.els) : fn }), etiqueta);
  }, [editar]);

  const patch = useCallback((ids, p, etiqueta) => {
    const alvo = new Set(Array.isArray(ids) ? ids : [ids]);
    setEls((arr) => arr.map((e) => (alvo.has(e.id) ? { ...e, ...(typeof p === 'function' ? p(e) : p) } : e)), etiqueta);
  }, [setEls]);

  const selEls = useMemo(() => els.filter((e) => sel.includes(e.id)), [els, sel]);
  const selEl = selEls.length === 1 ? selEls[0] : null;
  const patchSel = (p, etiqueta) => sel.length && patch(sel, p, etiqueta);

  /* ---------------- O palco, medido ----------------
   *
   * O palco é MEDIDO, não descrito em CSS: empilhar aspect-ratio com largura
   * fixa e max-height faz o navegador respeitar a largura e cortar a altura, e
   * a peça 9/16 saía achatada. O zoom multiplica o tamanho medido em vez de
   * aplicar `transform: scale`, porque um transform no meio do caminho
   * desalinha as contas de posição do Moveable.
   */
  const [ajuste, setAjuste] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const box = wrapRef.current;
    if (!box) return undefined;
    const medir = () => {
      const r = box.getBoundingClientRect();
      const dispW = Math.max(1, r.width - RESPIRO);
      const dispH = Math.max(1, r.height - RESPIRO);
      const [aw, ah] = String(aspect).split('/').map(Number);
      const ratio = (aw && ah) ? aw / ah : 16 / 9;
      let w = dispW, h = dispW / ratio;
      if (h > dispH) { h = dispH; w = dispH * ratio; }
      setAjuste({ w: Math.round(w), h: Math.round(h) });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(box);
    return () => ro.disconnect();
  }, [aspect]);
  const palco = { w: Math.round(ajuste.w * zoom), h: Math.round(ajuste.h * zoom) };

  const rect = () => canvasRef.current.getBoundingClientRect();
  const fontePx = (e) => Math.max(1, (textFontCqw(e, aspect) / 100) * palco.w);

  /* ---------------- Adicionar ---------------- */

  const acrescentar = (e) => { setEls((a) => [...a, e]); setSel([e.id]); };
  const addImage = (url) => acrescentar({ id: uid(), tipo: 'imagem', src: url, x: 30, y: 25, w: 40, h: 40, rot: 0, fit: 'contain' });
  const addText = () => acrescentar({ id: uid(), tipo: 'texto', text: 'Texto', x: 20, y: 40, w: 60, h: 18, rot: 0, cor: '#ffffff', fonte: 'sans', peso: 800, tamanho: 6, align: 'center' });

  /*
   * As fontes da peça são baixadas assim que ela abre. Sem isto, o palco
   * desenharia o texto com a fonte do sistema até alguém abrir o seletor — e a
   * peça pareceria errada exatamente na hora em que se decide se ela está boa.
   */
  useEffect(() => { carregarDaComposicao(els); }, [els]);
  const addIcon = () => acrescentar({ id: uid(), tipo: 'icone', name: 'star', x: 42, y: 20, w: 16, h: 16, rot: 0, cor: '#ffffff', peso: 1.6, opacidade: 1 });
  // Forma nasce ATRÁS de tudo: quase sempre ela é fundo de alguma coisa.
  const addShape = () => {
    const e = { id: uid(), tipo: 'forma', shape: 'rect', x: 12, y: 12, w: 45, h: 35, rot: 0, fill: '#3b82f6', opacidade: 1, radius: 0 };
    setEls((a) => [e, ...a]); setSel([e.id]);
  };

  /* ---------------- Seleção ---------------- */

  const escolher = (id, somar) => {
    setSel((s) => {
      if (!somar) return [id];
      return s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
    });
  };
  const limparSel = () => { setSel([]); setEditandoTexto(null); };

  /* ---------------- Ações ---------------- */

  const remover = useCallback(() => {
    if (!sel.length) return;
    setEls((a) => a.filter((e) => !sel.includes(e.id)));
    setSel([]);
  }, [sel, setEls]);

  const duplicar = useCallback(() => {
    if (!sel.length) return;
    const copias = els.filter((e) => sel.includes(e.id))
      .map((e) => ({ ...e, id: uid(), x: (Number(e.x) || 0) + 3, y: (Number(e.y) || 0) + 3 }));
    setEls((a) => [...a, ...copias]);
    setSel(copias.map((e) => e.id));
  }, [els, sel, setEls]);

  // Área de transferência própria: a do sistema não carrega objeto, e depender
  // dela quebraria a colagem entre uma peça e outra dentro do mesmo editor.
  const areaCopia = useRef([]);
  const copiar = useCallback(() => {
    if (sel.length) areaCopia.current = els.filter((e) => sel.includes(e.id));
  }, [els, sel]);
  const colar = useCallback(() => {
    const guardado = areaCopia.current;
    if (!guardado.length) return;
    const copias = guardado.map((e) => ({ ...e, id: uid(), x: (Number(e.x) || 0) + 3, y: (Number(e.y) || 0) + 3 }));
    setEls((a) => [...a, ...copias]);
    setSel(copias.map((e) => e.id));
  }, [setEls]);

  // Camada: mover na lista é mover na pilha.
  const moverCamada = useCallback((d) => {
    if (sel.length !== 1) return;
    setEls((a) => {
      const i = a.findIndex((e) => e.id === sel[0]);
      const j = clamp(i + d, 0, a.length - 1);
      if (i < 0 || i === j) return a;
      const copia = [...a];
      const [item] = copia.splice(i, 1);
      copia.splice(j, 0, item);
      return copia;
    });
  }, [sel, setEls]);

  const reordenar = useCallback((de, para) => {
    setEls((a) => {
      const copia = [...a];
      const [item] = copia.splice(de, 1);
      copia.splice(para, 0, item);
      return copia;
    });
  }, [setEls]);

  const empurrar = useCallback((dx, dy) => {
    if (!sel.length) return;
    patch(sel, (e) => ({ x: (Number(e.x) || 0) + dx, y: (Number(e.y) || 0) + dy }), 'empurrar');
  }, [sel, patch]);

  const aplicarAlinhar = (como) => {
    if (!sel.length) return;
    const novos = alinhar(selEls, como);
    const mapa = new Map(novos.map((e) => [e.id, e]));
    setEls((a) => a.map((e) => mapa.get(e.id) || e));
  };
  const aplicarDistribuir = (eixo) => {
    if (sel.length < 3) return;
    const novos = distribuir(selEls, eixo);
    const mapa = new Map(novos.map((e) => [e.id, e]));
    setEls((a) => a.map((e) => mapa.get(e.id) || e));
  };

  /* ---------------- Teclado ----------------
   *
   * Um editor sem atalho é um editor que ninguém usa duas vezes. O cuidado é
   * não roubar a tecla de quem está digitando: qualquer campo de texto em foco
   * (inclusive o texto editado direto no palco) devolve o controle ao navegador.
   */
  useEffect(() => {
    function digitando() {
      const a = document.activeElement;
      if (!a) return false;
      const t = (a.tagName || '').toLowerCase();
      return t === 'input' || t === 'textarea' || t === 'select' || a.isContentEditable;
    }

    function onKey(ev) {
      const cmd = ev.metaKey || ev.ctrlKey;

      if (ev.key === 'Escape') {
        if (editandoTexto) { setEditandoTexto(null); return; }
        if (!digitando()) { limparSel(); return; }
        return;
      }
      if (digitando()) return;

      if (cmd && ev.key.toLowerCase() === 'z') { ev.preventDefault(); saltar(ev.shiftKey ? 1 : -1); return; }
      if (cmd && ev.key.toLowerCase() === 'y') { ev.preventDefault(); saltar(1); return; }
      if (cmd && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicar(); return; }
      if (cmd && ev.key.toLowerCase() === 'c') { copiar(); return; }
      if (cmd && ev.key.toLowerCase() === 'v') { ev.preventDefault(); colar(); return; }
      if (cmd && ev.key.toLowerCase() === 'a') { ev.preventDefault(); setSel(els.map((e) => e.id)); return; }
      if (cmd && ev.key === ']') { ev.preventDefault(); moverCamada(1); return; }
      if (cmd && ev.key === '[') { ev.preventDefault(); moverCamada(-1); return; }

      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); remover(); return; }

      const p = ev.shiftKey ? PASSO_GRANDE : PASSO;
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); empurrar(-p, 0); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); empurrar(p, 0); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); empurrar(0, -p); }
      else if (ev.key === 'ArrowDown') { ev.preventDefault(); empurrar(0, p); }
      else return;
    }

    // Soltar a seta fecha o passo: segurar a seta empurra num passo só, mas
    // dois toques separados são dois desfazeres.
    function onKeyUp(ev) { if (String(ev.key).startsWith('Arrow')) fecharPasso(); }

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [els, sel, editandoTexto, duplicar, copiar, colar, remover, moverCamada, empurrar, fecharPasso, saltar]);

  /* ---------------- Colar e arrastar ----------------
   *
   * "Dá pra eu copiar algo no Canva e colar dentro do meu editor?" — dá, e a
   * resposta honesta tem duas metades:
   *
   *   Do CANVA vem IMAGEM. Ele põe na área de transferência um PNG da seleção
   *   e um formato interno proprietário; não existe como abrir aquilo em
   *   camadas, e fingir que existe seria pior que dizer não.
   *
   *   Do FIGMA e do ILLUSTRATOR vem SVG, e daí saem formas e textos
   *   EDITÁVEIS.
   *
   * E de qualquer lugar vem texto, que vira bloco de texto.
   */
  const [avisoColagem, setAvisoColagem] = useState('');

  const acrescentarVarios = useCallback((novos) => {
    const comId = novos.map((e) => ({ ...e, id: uid() }));
    setEls((a) => [...a, ...comId]);
    setSel(comId.map((e) => e.id));
  }, [setEls]);

  const colarArquivo = useCallback(async (arquivo) => {
    setBusy(true);
    try {
      const up = await media.upload(arquivo);
      acrescentarVarios([{ tipo: 'imagem', src: up.url, x: 20, y: 20, w: 60, h: 60, rot: 0, fit: 'contain' }]);
    } catch (err) { alert(err.message || 'Não consegui subir a imagem'); }
    setBusy(false);
  }, [acrescentarVarios]);

  const aplicarColagem = useCallback(async (dados) => {
    const plano = dados.getData ? dados.getData('text/plain') : '';
    const html = dados.getData ? dados.getData('text/html') : '';
    let arquivo = null;
    for (const it of dados.items || []) {
      if (it.kind === 'file' && String(it.type).startsWith('image/')) { arquivo = it.getAsFile(); break; }
    }
    for (const f of dados.files || []) {
      if (!arquivo && String(f.type).startsWith('image/')) arquivo = f;
    }

    // A proporção da peça vai junto: sem ela, um círculo colado de um SVG
    // quadrado sai como elipse numa peça 16/9.
    const [aw, ah] = String(aspect).split('/').map(Number);
    const razao = (aw && ah) ? aw / ah : 16 / 9;
    const r = decidirColagem({ arquivoImagem: arquivo, textoHtml: html, textoPlano: plano }, document, razao);
    if (r.acao === 'imagem') { await colarArquivo(r.arquivo); return true; }
    if (r.acao === 'elementos') {
      acrescentarVarios(r.elementos);
      setAvisoColagem(r.elementos.length > 1 ? r.elementos.length + ' camadas coladas' : '');
      return true;
    }
    if (r.acao === 'svg-como-imagem') {
      /*
       * Tem traçado que não sabemos abrir em camadas. Vai inteiro, como
       * imagem: melhor colar certo e não editável do que colar editável e
       * errado — a pessoa só descobriria o pedaço faltando na parede.
       */
      const blob = new Blob([r.svg], { type: 'image/svg+xml' });
      await colarArquivo(new File([blob], 'colado.svg', { type: 'image/svg+xml' }));
      setAvisoColagem('Colado como imagem — ' + r.motivo + '.');
      return true;
    }
    return false;
  }, [acrescentarVarios, colarArquivo, aspect]);

  useEffect(() => {
    function onPaste(ev) {
      // Quem está digitando num campo (ou no texto do palco) cola texto ali,
      // e não uma camada nova.
      const a = document.activeElement;
      const t = (a && a.tagName || '').toLowerCase();
      if (t === 'input' || t === 'textarea' || (a && a.isContentEditable)) return;
      if (!ev.clipboardData) return;
      ev.preventDefault();
      aplicarColagem(ev.clipboardData);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [aplicarColagem]);

  useEffect(() => {
    if (!avisoColagem) return undefined;
    const t = setTimeout(() => setAvisoColagem(''), 5000);
    return () => clearTimeout(t);
  }, [avisoColagem]);

  /* ---------------- Upload e IA ---------------- */

  async function onPickImage(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { const up = await media.upload(f); addImage(up.url); } catch (err) { alert(err.message || 'Falha no upload'); }
    setBusy(false);
  }
  async function onPickBg(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { const up = await media.upload(f); editar((d) => ({ ...d, bg: { kind: 'imagem', src: up.url } })); }
    catch (err) { alert(err.message || 'Falha no upload'); }
    setBusy(false);
  }
  async function runAi() {
    if (!aiBrief.trim()) return;
    setAiBusy(true);
    try {
      const brand = bg.kind === 'cor' ? bg.cor : '';
      const res = await ai.composition({ brief: aiBrief, brand });
      editar((d) => ({
        ...d,
        bg: res.bg && res.bg.cor ? { kind: 'cor', cor: res.bg.cor } : d.bg,
        // Mantém o que a pessoa trouxe; troca só os textos pelos gerados.
        els: [...d.els.filter((e) => e.tipo !== 'texto'), ...entrar((res.elementos || []).map((e) => ({ ...e, tipo: 'texto' })))],
      }));
      setSel([]); setAiOpen(false);
    } catch (err) { alert(err.message || 'Falha na IA'); }
    setAiBusy(false);
  }

  /* ---------------- Fundo ---------------- */

  const setBg = (b) => editar((d) => ({ ...d, bg: b }));
  const applyGrad = (a = g1, b = g2, t = gType) => setBg({ kind: 'cor', cor: bgGradient(t, a, b, 150) });

  const shapeFill = selEl && selEl.tipo === 'forma'
    ? (typeof selEl.fill === 'object' ? selEl.fill : { grad: '', cores: [selEl.fill || '#3b82f6', '#1e3a8a'], ang: 150 })
    : null;
  const setFillMode = (mode) => {
    const c = shapeFill.cores;
    patchSel({ fill: mode ? { grad: mode === 'radial' ? 'radial' : 'linear', cores: c, ang: shapeFill.ang } : c[0] });
  };

  function salvar() {
    onSave({ ...v, type: 'composicao', bg, elementos: sair(els), formato: aspect, duracao: Number(dur) || 0 });
  }

  const bgStyle = bg.kind === 'imagem' && bg.src
    ? { backgroundImage: `url("${bg.src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : bg.kind === 'cor' ? { background: bg.cor } : { background: '#0a1020' };

  // Alvos do Moveable: só os que estão selecionados, visíveis e destravados.
  const movivel = selEls.filter((e) => !e.travado && !e.oculto);
  const alvos = movivel.map((e) => nodes.current[e.id]).filter(Boolean);
  const caixaGrupo = movivel.length > 1 ? envolvente(movivel) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur">
      {/* ---------------- Barra superior ---------------- */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
        <span className="mr-1 text-sm font-semibold text-ink">Editor</span>

        <IconBtn title="Desfazer (Ctrl+Z)" icon={Undo2} disabled={!podeDesfazer(hist)} onClick={() => saltar(-1)} />
        <IconBtn title="Refazer (Ctrl+Shift+Z)" icon={Redo2} disabled={!podeRefazer(hist)} onClick={() => saltar(1)} />

        <div className="mx-1 h-5 w-px bg-line" />
        <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => setAiOpen((o) => !o)}>IA</Button>
        <Button size="sm" variant="secondary" icon={ImagePlus} disabled={busy} onClick={() => imgInput.current.click()}>Imagem</Button>
        <Button size="sm" variant="secondary" icon={Type} onClick={addText}>Texto</Button>
        <Button size="sm" variant="secondary" icon={Shapes} onClick={addShape}>Forma</Button>
        <Button size="sm" variant="secondary" icon={Star} onClick={addIcon}>Ícone</Button>

        <div className="mx-1 h-5 w-px bg-line" />
        {/* Alinhar: com um selecionado alinha pela peça, com vários entre eles. */}
        <IconBtn title="Alinhar à esquerda" icon={AlignStartVertical} disabled={!sel.length} onClick={() => aplicarAlinhar('esq')} />
        <IconBtn title="Centralizar na horizontal" icon={AlignCenterVertical} disabled={!sel.length} onClick={() => aplicarAlinhar('centroH')} />
        <IconBtn title="Alinhar à direita" icon={AlignEndVertical} disabled={!sel.length} onClick={() => aplicarAlinhar('dir')} />
        <IconBtn title="Alinhar ao topo" icon={AlignStartHorizontal} disabled={!sel.length} onClick={() => aplicarAlinhar('topo')} />
        <IconBtn title="Centralizar na vertical" icon={AlignCenterHorizontal} disabled={!sel.length} onClick={() => aplicarAlinhar('centroV')} />
        <IconBtn title="Alinhar à base" icon={AlignEndHorizontal} disabled={!sel.length} onClick={() => aplicarAlinhar('base')} />
        <IconBtn title="Distribuir na horizontal (3+)" icon={AlignHorizontalDistributeCenter} disabled={sel.length < 3} onClick={() => aplicarDistribuir('h')} />
        <IconBtn title="Distribuir na vertical (3+)" icon={AlignVerticalDistributeCenter} disabled={sel.length < 3} onClick={() => aplicarDistribuir('v')} />

        <div className="mx-1 h-5 w-px bg-line" />
        <IconBtn title="Duplicar (Ctrl+D)" icon={Copy} disabled={!sel.length} onClick={duplicar} />
        <IconBtn title="Remover (Delete)" icon={Trash2} disabled={!sel.length} onClick={remover} />

        <div className="mx-1 h-5 w-px bg-line" />
        {ASPECTS.map((a) => (
          <button key={a.id} onClick={() => editar((d) => ({ ...d, aspect: a.id }))} title={a.label}
            className={'flex h-8 w-8 items-center justify-center rounded-md border ' + (aspect === a.id ? 'border-accent text-accent' : 'border-line text-ink-3 hover:text-ink')}>
            <a.icon size={16} />
          </button>
        ))}

        <div className="mx-1 h-5 w-px bg-line" />
        <IconBtn title="Menos zoom" icon={ZoomOut} onClick={() => setZoom((z) => clamp(z - 0.25, 0.25, 3))} />
        <button onClick={() => setZoom(1)} title="Ajustar à tela"
          className="tnum flex h-8 min-w-[3.2rem] items-center justify-center rounded-md border border-line px-1 text-xs text-ink-2 hover:text-ink">
          {Math.round(zoom * 100)}%
        </button>
        <IconBtn title="Mais zoom" icon={ZoomIn} onClick={() => setZoom((z) => clamp(z + 0.25, 0.25, 3))} />
        <IconBtn title="Ajustar à tela" icon={Maximize2} onClick={() => setZoom(1)} />

        <div className="flex-1" />
        <Button size="sm" variant="ghost" icon={X} onClick={onClose}>Cancelar</Button>
        <Button size="sm" variant="primary" icon={Save} onClick={salvar}>Salvar</Button>
        <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickImage} />
      </div>

      {aiOpen && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2">
          <Sparkles size={15} className="text-accent" />
          <input autoFocus value={aiBrief} onChange={(e) => setAiBrief(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runAi(); }}
            placeholder="Descreva a peça (ex.: promoção de skate 30% OFF, jovem e vibrante)"
            className="flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3" />
          <span className="text-2xs text-ink-3">a IA monta fundo + textos; sua imagem fica por cima</span>
          <Button size="sm" variant="primary" icon={Sparkles} disabled={aiBusy || !aiBrief.trim()} onClick={runAi}>{aiBusy ? 'Gerando…' : 'Gerar'}</Button>
        </div>
      )}

      {avisoColagem && (
        <div className="border-b border-line bg-accent-soft px-4 py-1.5 text-xs text-ink-2">{avisoColagem}</div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ---------------- Palco ---------------- */}
        <div ref={wrapRef} className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-6"
          onMouseDown={(e) => { if (e.target === e.currentTarget) limparSel(); }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); aplicarColagem(e.dataTransfer); }}>
          <div ref={canvasRef} data-palco
            onMouseDown={(e) => { if (e.target === canvasRef.current) limparSel(); }}
            className="relative shrink-0 shadow-2xl" style={{ ...bgStyle, width: palco.w, height: palco.h }}>

            {els.map((e) => e.oculto ? null : (
              <div key={e.id} data-el={e.id} ref={(n) => { if (n) nodes.current[e.id] = n; }}
                onMouseDown={(ev) => { if (!e.travado) { ev.stopPropagation(); escolher(e.id, ev.shiftKey); } }}
                onDoubleClick={() => { if (e.tipo === 'texto' && !e.travado) setEditandoTexto(e.id); }}
                style={{
                  position: 'absolute', left: e.x + '%', top: e.y + '%', width: e.w + '%', height: e.h + '%',
                  transform: `rotate(${e.rot || 0}deg)`, cursor: e.travado ? 'default' : 'move',
                  opacity: e.opacidade != null ? e.opacidade : 1,
                  outline: sel.includes(e.id) ? '1px solid rgba(120,160,255,.9)' : 'none',
                }}>
                {e.tipo === 'texto' ? (
                  <TextoEditavel
                    el={e}
                    editando={editandoTexto === e.id}
                    estilo={{
                      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      // Mesma função que o player usa — o palco não inventa estilo próprio.
                      ...estiloTexto(e), fontSize: fontePx(e),
                      overflow: 'hidden', whiteSpace: 'pre-wrap',
                      outline: editandoTexto === e.id ? '1px dashed rgba(120,160,255,.9)' : 'none',
                      cursor: editandoTexto === e.id ? 'text' : 'inherit',
                    }}
                    onTexto={(t) => patch(e.id, { text: t }, 'texto:' + e.id)}
                    onFim={() => { setEditandoTexto(null); fecharPasso(); }}
                  />
                ) : e.tipo === 'icone' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke={e.cor || '#fff'} strokeWidth={e.peso || 1.6} strokeLinecap="round" strokeLinejoin="round"
                    style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
                    dangerouslySetInnerHTML={{ __html: ICONS[e.name] || ICONS.star }} />
                ) : e.tipo === 'forma' ? (
                  <div style={{
                    width: '100%', height: '100%', background: fillToCss(e.fill),
                    borderRadius: e.shape === 'ellipse' ? '50%' : (SHAPE_POLY[e.shape] ? 0 : (e.radius || 0) + '%'),
                    clipPath: SHAPE_POLY[e.shape] ? shapeClip(e.shape) : 'none', pointerEvents: 'none',
                  }} />
                ) : (
                  <img src={e.src} alt="" draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: e.fit || 'contain', display: 'block', pointerEvents: 'none' }} />
                )}
              </div>
            ))}

            {/* Guias de encaixe: sem a linha aparecendo, o elemento "pula" e
                ninguém entende por quê. */}
            {guias.x != null && (
              <div style={{ position: 'absolute', left: guias.x + '%', top: 0, bottom: 0, width: 1, background: '#ff3d9a', pointerEvents: 'none', zIndex: 9 }} />
            )}
            {guias.y != null && (
              <div style={{ position: 'absolute', top: guias.y + '%', left: 0, right: 0, height: 1, background: '#ff3d9a', pointerEvents: 'none', zIndex: 9 }} />
            )}

            {/* Caixa invisível que representa a seleção múltipla — é ela que o
                Moveable arrasta, e o deslocamento é repassado a cada elemento. */}
            {caixaGrupo && (
              <div ref={grupoRef} style={{
                position: 'absolute', left: caixaGrupo.esq + '%', top: caixaGrupo.topo + '%',
                width: caixaGrupo.w + '%', height: caixaGrupo.h + '%',
                outline: '1px dashed rgba(120,160,255,.8)', pointerEvents: 'none', zIndex: 8,
              }} />
            )}

            {/* Um selecionado: mover, redimensionar e girar, com encaixe. */}
            {movivel.length === 1 && alvos.length === 1 && editandoTexto !== movivel[0].id && (
              <Moveable
                target={alvos[0]}
                draggable resizable rotatable
                origin={false} keepRatio={false}
                throttleDrag={0} throttleResize={0} throttleRotate={0}
                onDrag={({ left, top }) => {
                  const r = rect();
                  const alvo = movivel[0];
                  const bruto = { x: (left / r.width) * 100, y: (top / r.height) * 100, w: alvo.w, h: alvo.h };
                  const fixo = encaixar(bruto, els.filter((e) => e.id !== alvo.id && !e.oculto));
                  setGuias(fixo.guias);
                  patch(alvo.id, { x: clamp(fixo.x, -40, 140), y: clamp(fixo.y, -40, 140) }, 'mover:' + alvo.id);
                }}
                onDragEnd={() => { setGuias({ x: null, y: null }); fecharPasso(); }}
                onResize={({ width, height, drag }) => {
                  const r = rect();
                  patch(movivel[0].id, {
                    w: (width / r.width) * 100, h: (height / r.height) * 100,
                    x: (drag.left / r.width) * 100, y: (drag.top / r.height) * 100,
                  }, 'redim:' + movivel[0].id);
                }}
                onResizeEnd={fecharPasso}
                onRotate={({ rotation }) => patch(movivel[0].id, { rot: Math.round(rotation) }, 'girar:' + movivel[0].id)}
                onRotateEnd={fecharPasso}
              />
            )}

            {/* Vários selecionados: arrastar o conjunto. Redimensionar em grupo
                fica de fora de propósito — em coordenadas percentuais ele
                distorce texto e imagem de formas difíceis de desfazer. */}
            {caixaGrupo && grupoRef.current && (
              <Moveable
                target={grupoRef.current}
                draggable resizable={false} rotatable={false}
                origin={false} throttleDrag={0}
                onDragStart={() => { areaTransf.current = { x: caixaGrupo.esq, y: caixaGrupo.topo }; }}
                onDrag={({ left, top }) => {
                  const r = rect();
                  const nx = (left / r.width) * 100;
                  const ny = (top / r.height) * 100;
                  const dx = nx - areaTransf.current.x;
                  const dy = ny - areaTransf.current.y;
                  if (!dx && !dy) return;
                  areaTransf.current = { x: nx, y: ny };
                  patch(movivel.map((e) => e.id), (e) => ({
                    x: (Number(e.x) || 0) + dx, y: (Number(e.y) || 0) + dy,
                  }), 'mover-grupo');
                }}
                onDragEnd={fecharPasso}
              />
            )}
          </div>
        </div>

        {/* ---------------- Painel lateral ---------------- */}
        <div className="flex w-80 shrink-0 flex-col border-l border-line bg-surface">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Fundo</div>
              <div className="flex items-center gap-2">
                <input type="color" value={bg.kind === 'cor' && /^#[0-9a-f]{6}$/i.test(bg.cor) ? bg.cor : '#0a1020'}
                  onChange={(ev) => setBg({ kind: 'cor', cor: ev.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border border-line bg-transparent" />
                <Button size="sm" variant="secondary" icon={ImagePlus} disabled={busy} onClick={() => bgInput.current.click()}>Imagem</Button>
                {bg.kind === 'imagem' && <Button size="sm" variant="ghost" onClick={() => setBg({ kind: 'cor', cor: '#0a1020' })}>Limpar</Button>}
                <input ref={bgInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickBg} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-2xs text-ink-3">Gradiente</span>
                <input type="color" value={g1} onChange={(e) => { setG1(e.target.value); applyGrad(e.target.value, g2, gType); }} className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent" />
                <input type="color" value={g2} onChange={(e) => { setG2(e.target.value); applyGrad(g1, e.target.value, gType); }} className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent" />
                <Select value={gType} onChange={(e) => { setGType(e.target.value); applyGrad(g1, g2, e.target.value); }} className="h-8 flex-1 text-xs">
                  <option value="linear">Linear</option><option value="radial">Radial</option>
                </Select>
              </div>
            </div>

            {sel.length > 1 ? (
              <div className="border-t border-line pt-4 text-xs text-ink-2">
                <strong className="text-ink">{sel.length} elementos selecionados.</strong> Arraste para mover
                o conjunto, use os botões de alinhar, ou <span className="text-ink">Ctrl+D</span> para duplicar.
              </div>
            ) : selEl ? (
              <div className="space-y-3 border-t border-line pt-4">
                <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">
                  {selEl.tipo === 'texto' ? 'Texto' : selEl.tipo === 'forma' ? 'Forma' : selEl.tipo === 'icone' ? 'Ícone' : 'Imagem'}
                </div>

                {selEl.tipo === 'texto' ? (
                  <>
                    <Field label="Texto" hint="Ou dê dois cliques no palco para editar ali mesmo.">
                      <Input value={selEl.text} onChange={(e) => patch(selEl.id, { text: e.target.value }, 'texto:' + selEl.id)} onBlur={fecharPasso} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Cor"><input type="color" value={selEl.cor} onChange={(e) => patch(selEl.id, { cor: e.target.value })} className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" /></Field>
                      <Field label="Tamanho"><Input type="number" value={selEl.tamanho} disabled={!!selEl.auto} onChange={(e) => patch(selEl.id, { tamanho: Number(e.target.value) })} /></Field>
                    </div>
                    <SeletorFonte
                      valor={selEl.fonte}
                      onEscolher={(id) => patch(selEl.id, { fonte: id, peso: pesoMaisProximo(id, selEl.peso) })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Peso">
                        <Select value={pesoMaisProximo(selEl.fonte, selEl.peso)} onChange={(e) => patch(selEl.id, { peso: Number(e.target.value) })}>
                          {pesosDe(selEl.fonte).map((p) => <option key={p} value={p}>{ROTULO_PESO[p] || p}</option>)}
                        </Select>
                      </Field>
                      <Field label="Estilo">
                        <div className="flex gap-1">
                          <BotaoEstilo ativo={!!selEl.italico} titulo="Itálico" onClick={() => patch(selEl.id, { italico: !selEl.italico })}>
                            <Italic size={15} />
                          </BotaoEstilo>
                          <BotaoEstilo ativo={!!selEl.caixaAlta} titulo="Tudo em maiúsculas" onClick={() => patch(selEl.id, { caixaAlta: !selEl.caixaAlta })}>
                            <CaseUpper size={17} />
                          </BotaoEstilo>
                        </div>
                      </Field>
                    </div>
                    <Ajuste
                      rotulo="Espaçamento entre letras" unidade="em" casas={2}
                      valor={selEl.espacamento} padrao={-0.01}
                      min={ESPACAMENTO.min} max={ESPACAMENTO.max} passo={0.01}
                      onChange={(n) => patch(selEl.id, { espacamento: n }, 'espacamento:' + selEl.id)}
                      onSoltar={fecharPasso}
                    />
                    <Ajuste
                      rotulo="Altura da linha" unidade="" casas={2}
                      valor={selEl.entrelinha} padrao={entrelinhaPadrao(selEl.fonte)}
                      min={ENTRELINHA.min} max={ENTRELINHA.max} passo={0.01}
                      onChange={(n) => patch(selEl.id, { entrelinha: n }, 'entrelinha:' + selEl.id)}
                      onSoltar={fecharPasso}
                    />
                    <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={!!selEl.auto} onChange={(e) => patch(selEl.id, { auto: e.target.checked })} /> Ajustar à diagonal do bloco</label>
                    {selEl.auto && (
                      <Field label={`Proporção (${Math.round((selEl.escala != null ? selEl.escala : 0.16) * 100)}%)`}>
                        <input type="range" min="5" max="40" value={Math.round((selEl.escala != null ? selEl.escala : 0.16) * 100)} onChange={(e) => patch(selEl.id, { escala: Number(e.target.value) / 100 })} className="w-full" />
                      </Field>
                    )}
                    <Field label="Alinhamento">
                      <Select value={selEl.align} onChange={(e) => patch(selEl.id, { align: e.target.value })}>
                        <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
                      </Select>
                    </Field>
                    <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={!!selEl.sombra} onChange={(e) => patch(selEl.id, { sombra: e.target.checked })} /> Sombra no texto</label>
                  </>
                ) : selEl.tipo === 'forma' ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Formato">
                        <Select value={selEl.shape || 'rect'} onChange={(e) => patch(selEl.id, { shape: e.target.value })}>
                          <option value="rect">Retângulo</option><option value="ellipse">Elipse</option>
                          <option value="triangle">Triângulo</option><option value="diamond">Losango</option><option value="diag">Diagonal</option>
                        </Select>
                      </Field>
                      <Field label="Preenchimento">
                        <Select value={typeof selEl.fill === 'object' ? (selEl.fill.grad || 'linear') : ''} onChange={(e) => setFillMode(e.target.value)}>
                          <option value="">Sólido</option><option value="linear">Grad. linear</option><option value="radial">Grad. radial</option>
                        </Select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Cor 1">
                        <input type="color" value={(typeof selEl.fill === 'object' ? shapeFill.cores[0] : selEl.fill) || '#3b82f6'}
                          onChange={(e) => { if (typeof selEl.fill === 'object') { const c = [...shapeFill.cores]; c[0] = e.target.value; patch(selEl.id, { fill: { ...selEl.fill, cores: c } }); } else patch(selEl.id, { fill: e.target.value }); }}
                          className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" />
                      </Field>
                      {typeof selEl.fill === 'object' && (
                        <Field label="Cor 2">
                          <input type="color" value={shapeFill.cores[1] || '#1e3a8a'}
                            onChange={(e) => { const c = [...shapeFill.cores]; c[1] = e.target.value; patch(selEl.id, { fill: { ...selEl.fill, cores: c } }); }}
                            className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" />
                        </Field>
                      )}
                    </div>
                    {typeof selEl.fill === 'object' && selEl.fill.grad !== 'radial' && (
                      <Field label={`Ângulo (${shapeFill.ang || 150}°)`}>
                        <input type="range" min="0" max="360" value={shapeFill.ang || 150} onChange={(e) => patch(selEl.id, { fill: { ...selEl.fill, ang: Number(e.target.value) } })} className="w-full" />
                      </Field>
                    )}
                    {selEl.shape !== 'ellipse' && (
                      <Field label={`Cantos (${selEl.radius || 0}%)`}>
                        <input type="range" min="0" max="50" value={selEl.radius || 0} onChange={(e) => patch(selEl.id, { radius: Number(e.target.value) })} className="w-full" />
                      </Field>
                    )}
                    <Opacidade el={selEl} onChange={(o) => patch(selEl.id, { opacidade: o })} />
                  </>
                ) : selEl.tipo === 'icone' ? (
                  <>
                    <div className="grid grid-cols-6 gap-1">
                      {ICON_NAMES.map((n) => (
                        <button key={n} type="button" title={n} onClick={() => patch(selEl.id, { name: n })}
                          className={'flex aspect-square items-center justify-center rounded border ' + (selEl.name === n ? 'border-accent text-accent' : 'border-line text-ink-2 hover:text-ink')}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[n] }} />
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Cor"><input type="color" value={selEl.cor || '#ffffff'} onChange={(e) => patch(selEl.id, { cor: e.target.value })} className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" /></Field>
                      <Field label={`Traço (${selEl.peso || 1.6})`}><input type="range" min="1" max="3" step="0.1" value={selEl.peso || 1.6} onChange={(e) => patch(selEl.id, { peso: Number(e.target.value) })} className="w-full" /></Field>
                    </div>
                    <Opacidade el={selEl} onChange={(o) => patch(selEl.id, { opacidade: o })} />
                  </>
                ) : (
                  <>
                    <Field label="Ajuste da imagem">
                      <Select value={selEl.fit || 'contain'} onChange={(e) => patch(selEl.id, { fit: e.target.value })}>
                        <option value="contain">Inteira (sem cortar)</option><option value="cover">Preencher (corta)</option>
                      </Select>
                    </Field>
                    <Button size="sm" variant="secondary" icon={ImagePlus} disabled={busy} onClick={() => imgInput.current.click()}>Trocar imagem</Button>
                    <Opacidade el={selEl} onChange={(o) => patch(selEl.id, { opacidade: o })} />
                  </>
                )}

                <div className="grid grid-cols-4 gap-1.5 border-t border-line pt-3">
                  <Num rotulo="X" valor={selEl.x} onChange={(n) => patch(selEl.id, { x: n })} />
                  <Num rotulo="Y" valor={selEl.y} onChange={(n) => patch(selEl.id, { y: n })} />
                  <Num rotulo="L" valor={selEl.w} onChange={(n) => patch(selEl.id, { w: n })} />
                  <Num rotulo="A" valor={selEl.h} onChange={(n) => patch(selEl.id, { h: n })} />
                </div>
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => patch(selEl.id, { rot: 0 })}>Zerar rotação ({Math.round(selEl.rot || 0)}°)</Button>
              </div>
            ) : (
              <div className="border-t border-line pt-4 text-xs text-ink-3">
                Clique num elemento para editar. Shift+clique soma à seleção; dois cliques num
                texto edita direto no palco.
              </div>
            )}

            <div className="border-t border-line pt-4">
              <Field label="Duração (s)" hint="0 = fica fixo">
                <Input type="number" value={dur} onChange={(e) => editar((d) => ({ ...d, dur: e.target.value }), 'duracao')} onBlur={fecharPasso} />
              </Field>
            </div>
          </div>

          {/* Camadas: altura fixa e rolagem própria, para não empurrar as
              propriedades para fora da tela numa peça com muitos elementos. */}
          <div className="flex max-h-[38%] min-h-[8rem] shrink-0 flex-col border-t border-line">
            <div className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-ink-3">
              <Layers size={12} /> Camadas
              <span className="ml-auto font-normal normal-case tracking-normal">{els.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <PainelCamadas
                els={els} sel={sel}
                onSelecionar={escolher}
                onReordenar={reordenar}
                onAlternar={(id, campo) => patch(id, (e) => ({ [campo]: !e[campo] }))}
                onRenomear={(id, nome) => patch(id, { nome: String(nome || '').trim() || undefined })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Tipografia ---------------- */

const ROTULO_PESO = {
  300: 'Leve', 400: 'Normal', 500: 'Médio', 600: 'Semi',
  700: 'Negrito', 800: 'Extra negrito', 900: 'Máximo',
};
const pesoMaisProximo = (fonte, peso) => pesoValido(fonte, peso != null ? peso : 800);
const entrelinhaPadrao = (fonte) => dadosDaFonte(fonte).entrelinha;

/*
 * O seletor de fonte desenha CADA opção na própria fonte.
 *
 * É a única forma que funciona: ninguém sabe o que é "Alfa Slab One" pelo nome,
 * e uma lista de nomes todos na mesma letra obriga a testar um por um no palco
 * para descobrir. Vendo a letra, a escolha é imediata — é assim no Canva, e é
 * assim porque é o certo.
 */
function SeletorFonte({ valor, onEscolher }) {
  const lista = React.useMemo(() => listarFontes(), []);
  // As fontes só chegam se forem pedidas; sem isto a lista inteira sairia na
  // fonte do sistema, que é justamente o que o seletor existe para evitar.
  React.useEffect(() => { lista.forEach((f) => carregarFonte(f.id)); }, [lista]);
  const atual = valor || 'sans';
  const escolhida = lista.find((f) => f.id === atual) || lista[0];
  /*
   * Fechada por padrão. Doze famílias abertas empurram peso, alinhamento e
   * posição para fora da tela — e a fonte é escolhida uma vez, enquanto o
   * resto se mexe o tempo todo.
   */
  const [aberta, setAberta] = React.useState(false);

  return (
    <Field label="Fonte">
      <button type="button" onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-left transition hover:border-accent/50">
        <span className="truncate text-base leading-tight" style={{ fontFamily: escolhida.css }}>{escolhida.rotulo}</span>
        <ChevronDown size={14} className={'shrink-0 text-ink-3 transition ' + (aberta ? 'rotate-180' : '')} />
      </button>
      {aberta && (
        /*
          Sem rolagem própria: o painel de propriedades já rola, e uma caixa que
          rola dentro de outra que rola é das coisas mais irritantes de usar — a
          roda do mouse mexe na de dentro quando se queria a de fora.
        */
        <div className="mt-1 space-y-0.5 rounded-md border border-line bg-surface p-1">
          {lista.map((f) => (
            <button key={f.id} type="button" onClick={() => { onEscolher(f.id); setAberta(false); }}
              className={'flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left transition '
                + (atual === f.id ? 'bg-accent/15 text-accent ring-1 ring-accent/40' : 'text-ink hover:bg-white/5')}>
              <span className="truncate text-base leading-tight" style={{ fontFamily: f.css }}>{f.rotulo}</span>
              <span className="shrink-0 text-2xs text-ink-3">{f.papel}</span>
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}

function BotaoEstilo({ ativo, titulo, onClick, children }) {
  return (
    <button type="button" title={titulo} onClick={onClick}
      className={'flex h-9 flex-1 items-center justify-center rounded border transition '
        + (ativo ? 'border-accent bg-accent/15 text-accent' : 'border-line text-ink-2 hover:text-ink')}>
      {children}
    </button>
  );
}

/*
 * Um ajuste fino com valor visível e volta ao padrão.
 *
 * O "voltar ao padrão" não é enfeite: espaçamento e entrelinha são justamente
 * os controles em que se mexe sem querer e depois não se sabe mais qual era o
 * número bom. Enquanto ninguém mexe, o campo fica NULO — e aí a peça segue o
 * padrão da família, que muda quando se troca a fonte.
 */
function Ajuste({ rotulo, unidade, casas, valor, padrao, min, max, passo, onChange, onSoltar }) {
  const definido = valor != null && Number.isFinite(Number(valor));
  const v = definido ? Number(valor) : padrao;
  return (
    <Field label={`${rotulo} (${v.toFixed(casas)}${unidade})`}>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={passo} value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseUp={onSoltar} onTouchEnd={onSoltar} onKeyUp={onSoltar}
          className="w-full" />
        <button type="button" title="Voltar ao padrão da fonte" onClick={() => { onChange(null); onSoltar(); }}
          disabled={!definido}
          className="shrink-0 rounded border border-line px-1.5 py-1 text-2xs text-ink-3 transition hover:text-ink disabled:opacity-30">
          padrão
        </button>
      </div>
    </Field>
  );
}

/* ---------------- Peças pequenas ---------------- */

/*
 * Texto editado direto no palco.
 *
 * Duas armadilhas do contentEditable, e as duas custaram caro:
 *
 * 1. Salvar só no `blur` PERDE o que foi digitado. Clicar fora limpa o modo de
 *    edição, o React volta a renderizar o texto antigo como filho da div, e o
 *    blur — que chega depois — lê do DOM justamente o texto antigo. A pessoa
 *    via "OFERTA" na tela, salvava, e a TV exibia "Texto". Por isso o estado é
 *    atualizado a cada tecla, no `onInput`.
 *
 * 2. Atualizar o estado a cada tecla, com o React controlando os filhos da
 *    div, joga o cursor para o começo a cada letra. Por isso, ENQUANTO edita,
 *    esta div não recebe filhos nenhum do React: o texto inicial é escrito uma
 *    vez pelo efeito, e daí em diante o DOM é dono do que está escrito.
 *
 * As duas juntas: o estado sempre certo, o cursor sempre no lugar.
 */
function TextoEditavel({ el, editando, estilo, onTexto, onFim }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const n = ref.current;
    if (!editando || !n) return;
    n.textContent = el.text || '';
    n.focus();
    // Cursor no fim, e não no começo: quem deu dois cliques quer continuar
    // escrevendo, não empurrar o que já estava lá.
    const s = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(n);
    r.collapse(false);
    s.removeAllRanges();
    s.addRange(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  if (editando) {
    return (
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        style={estilo}
        onInput={(ev) => onTexto(ev.currentTarget.textContent)}
        onBlur={onFim}
        onKeyDown={(ev) => {
          ev.stopPropagation();                       // não deixa o atalho global comer a tecla
          if (ev.key === 'Escape') { ev.preventDefault(); onFim(); }
        }}
      />
    );
  }
  return <div style={estilo}>{el.text}</div>;
}

function IconBtn({ icon: Icone, title, onClick, disabled }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-2 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-35">
      <Icone size={15} />
    </button>
  );
}

function Opacidade({ el, onChange }) {
  const v = el.opacidade != null ? el.opacidade : 1;
  return (
    <Field label={`Opacidade (${Math.round(v * 100)}%)`}>
      <input type="range" min="0" max="1" step="0.05" value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </Field>
  );
}

// Posição e tamanho numéricos: às vezes a pessoa quer 50 exato, e nenhum mouse
// acerta 50 exato.
function Num({ rotulo, valor, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-2xs text-ink-3">{rotulo}</span>
      <input type="number" step="0.5" value={Math.round((Number(valor) || 0) * 10) / 10}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tnum w-full rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink outline-none focus:border-accent" />
    </label>
  );
}
