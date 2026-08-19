import React, { useRef, useState, useCallback, useEffect, useMemo, useLayoutEffect } from 'react';
import Moveable from 'react-moveable';
import {
  ImagePlus, Type, Trash2, RotateCcw, Save, X, Square, RectangleHorizontal, RectangleVertical,
  Columns2, Sparkles, Shapes, Star, Undo2, Redo2, Copy, ZoomIn, ZoomOut, Maximize2,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Layers, ChevronDown, Italic, CaseUpper, Group, Ungroup, LayoutTemplate,
  Ruler, Paintbrush,
} from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Select } from '../ui/Field.jsx';
import { media, ai, brand as brandApi } from '../../api.js';
import { fillToCss, bgGradient, shapeClip, SHAPE_POLY, textFontCqw, estiloCaixa, recortada, raioCss, SOMBRA_PADRAO, SOMBRA_LIMITES, BORDA_MAX } from '../../lib/composition.js';
import { ICONS, ICON_NAMES } from '../../lib/icons.js';
import { criarHistorico, agora, empilhar, desfazer, refazer, selar, podeDesfazer, podeRefazer } from '../../lib/historico.js';
import { encaixar, encaixarRedimensionamento, alinhar, distribuir, envolvente } from '../../lib/alinhar.js';
import { decidirColagem } from '../../lib/colar.js';
import { lerFormato, aplicarFormato } from '../../lib/formato.js';
import {
  estiloTexto, listar as listarFontes, pesosDe, pesoValido, dados as dadosDaFonte,
  carregarFonte, carregarDaComposicao, ESPACAMENTO, ENTRELINHA,
} from '../../lib/fontes.js';
import {
  agrupar, desagrupar, expandirSelecao, podeAgrupar, podeDesagrupar,
  unidades, caixaDe, reordenarLinhas, linhaDe, grupoDe,
} from '../../lib/grupos.js';
import { PainelCamadas } from './PainelCamadas.jsx';
import { EscolherModelo } from './EscolherModelo.jsx';

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
// Uma casa decimal. Em % da peça, 0,1% já é sub-pixel numa TV Full HD: guardar
// 43,283746% só engorda o JSON e faz dois elementos "iguais" nunca baterem.
const arred = (v) => Math.round(v * 10) / 10;
const round = (n) => Math.round((Number(n) || 0) * 10) / 10;
// A caixa de um grupo, no formato que alinhar.js espera de um elemento.
const pontoDaCaixa = (c) => ({ x: c.esq, y: c.topo, w: c.w, h: c.h });

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
  /*
   * Guias e medida NÃO moram em estado. Isto não é micro-otimização.
   *
   * O Moveable calcula o gesto a partir do elemento no DOM. Toda vez que um
   * `setState` acontecia no meio de um redimensionamento, o React redesenhava
   * o elemento e o Moveable recomeçava a conta do zero: para cada movimento do
   * mouse chegavam DOIS eventos, um com o tamanho novo e outro com o tamanho
   * original logo atrás, e o segundo desfazia o primeiro. O resultado era um
   * elemento que tremia sob o cursor e voltava exatamente ao tamanho em que
   * estava — redimensionar simplesmente não funcionava, e o motivo era
   * invisível porque cada peça isolada parecia certa.
   *
   * Enquanto a alça está presa, quem manda é o DOM. O estado do React recebe o
   * resultado uma vez, ao soltar.
   */
  const guiaXRef = useRef(null);
  const guiaYRef = useRef(null);
  const medidaRef = useRef(null);
  const gesto = useRef(null);      // a caixa em construção, em % da peça

  const pintarGuias = useCallback((gx, gy) => {
    const ex = guiaXRef.current, ey = guiaYRef.current;
    if (ex) { ex.style.display = gx == null ? 'none' : 'block'; if (gx != null) ex.style.left = gx + '%'; }
    if (ey) { ey.style.display = gy == null ? 'none' : 'block'; if (gy != null) ey.style.top = gy + '%'; }
  }, []);

  const pintarMedida = useCallback((caixa) => {
    const n = medidaRef.current;
    if (!n) return;
    if (!caixa) { n.style.display = 'none'; return; }
    n.style.display = 'block';
    n.style.left = (caixa.x + caixa.w / 2) + '%';
    n.style.top = `calc(${caixa.y + caixa.h}% + 8px)`;
    n.textContent = `${arred(caixa.w)} × ${arred(caixa.h)} %`;
  }, []);
  const [editandoTexto, setEditandoTexto] = useState(null);
  /*
   * O grupo "aberto": aquele em que se entrou com dois cliques, e onde os
   * membros voltam a ser clicáveis um a um. Fora dele, tocar num membro é
   * tocar no grupo inteiro — que é o que faz o grupo parecer uma coisa só.
   */
  const [grupoAberto, setGrupoAberto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [modeloAberto, setModeloAberto] = useState(false);
  /*
   * Guias do palco: margem de segurança, centro e terços.
   *
   * A margem NÃO é decoração. Uma parte das TVs come alguns por cento de cada
   * lado (overscan), e é justamente nas telas mais baratas — as que acabam
   * numa recepção — que isso acontece. Sem a linha desenhada, o jeito de
   * descobrir que o texto encostou demais na borda é ver a peça cortada na
   * parede, depois de publicada.
   */
  const [guiasFixas, setGuiasFixas] = useState(false);

  /*
   * O pincel de formatação fica ARMADO entre dois cliques: um pega o molde,
   * o outro aplica. É estado e não gesto porque o segundo clique pode demorar
   * — rolar a lista de camadas, dar zoom, procurar o elemento.
   */
  const [pincel, setPincel] = useState(null);
  /*
   * A cor da marca da conta, buscada uma vez.
   *
   * A IA recebia como "marca" a cor de FUNDO da peça — e só quando o fundo era
   * cor chapada. Com gradiente ou imagem, ia vazio e a peça voltava sem marca
   * nenhuma. O kit da empresa é onde a marca mora; é de lá que ela sai.
   */
  const [marcaDaConta, setMarcaDaConta] = useState('');
  useEffect(() => {
    let vivo = true;
    brandApi.get()
      .then((r) => { if (vivo) setMarcaDaConta(((r && r.kit && r.kit.cores) || [])[0] || ''); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  const [aiBrief, setAiBrief] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [g1, setG1] = useState('#1e3a8a');
  const [g2, setG2] = useState('#0a1020');
  const [gType, setGType] = useState('linear');

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const nodes = useRef({});
  /*
   * A caixa da seleção múltipla vive em ESTADO, não em ref.
   *
   * Estava em `useRef`, e o Moveable do grupo era desenhado sob a condição
   * `caixaGrupo && grupoRef.current`. No render em que a caixa nasce, a ref
   * ainda é nula — e como preencher uma ref não redesenha nada, a condição
   * nunca voltava a ser avaliada: o Moveable do grupo NUNCA montava. O efeito
   * era que arrastar dois elementos selecionados não fazia absolutamente nada,
   * em silêncio, desde que a seleção múltipla existe. Apareceu ao arrastar um
   * grupo no navegador — nenhum teste de unidade alcançaria isto.
   *
   * Uma ref de callback que guarda em estado força o segundo render, e aí a
   * moldura monta.
   */
  const [grupoNo, setGrupoNo] = useState(null);
  const imgInput = useRef(null);
  const bgInput = useRef(null);
  const areaTransf = useRef(null);   // { x, y } no começo do arrasto de grupo
  /*
   * Shift, acompanhado por conta própria.
   *
   * O clique que chega pelo dragArea do Moveable vem embrulhado, e o evento
   * que ele repassa nem sempre traz os modificadores — somar à seleção com
   * Shift simplesmente TROCAVA a seleção. Guardar a tecla aqui não depende do
   * formato do evento de ninguém.
   */
  const shift = useRef(false);

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
  // 1 cqw em pixels do palco. Sombra, borda e canto são medidos em cqw para
  // saírem iguais no editor, na TV e no PNG; aqui viram pixels desta tela.
  const cqwPx = palco.w / 100;

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
    // Dentro do grupo aberto, cada membro responde por si; fora dele, o toque
    // alcança o grupo inteiro.
    const dentro = grupoAberto && grupoDe(els, id) === grupoAberto;
    const alvo = dentro ? [id] : expandirSelecao(els, [id]);
    if (!dentro && grupoDe(els, id) !== grupoAberto) setGrupoAberto(null);
    setSel((s) => {
      if (!somar) return alvo;
      const juntos = new Set(s);
      const jaTinha = alvo.every((x) => juntos.has(x));
      alvo.forEach((x) => (jaTinha ? juntos.delete(x) : juntos.add(x)));
      return [...juntos];
    });
  };
  const limparSel = () => { setSel([]); setEditandoTexto(null); setGrupoAberto(null); };

  /* ---------------- Agrupar ---------------- */

  const juntar = useCallback(() => {
    if (!podeAgrupar(els, sel)) return;
    const novos = agrupar(els, sel);
    setEls(novos, null);
    setSel(expandirSelecao(novos, sel));
    setGrupoAberto(null);
  }, [els, sel, setEls]);

  const separar = useCallback(() => {
    if (!podeDesagrupar(els, sel)) return;
    setEls(desagrupar(els, sel), null);
    setGrupoAberto(null);
  }, [els, sel, setEls]);

  const cliqueAtravesDaArea = (ev, duplo) => {
    const alvo = document.elementsFromPoint(ev.clientX, ev.clientY)
      .find((n) => n.hasAttribute && n.hasAttribute('data-el'));
    const id = alvo && alvo.getAttribute('data-el');
    if (!id) { limparSel(); return; }
    if (duplo) {
      const g = grupoDe(els, id);
      if (g) { setGrupoAberto(g); setSel([id]); return; }
      if (els.find((e) => e.id === id && e.tipo === 'texto')) { setSel([id]); setEditandoTexto(id); return; }
    }
    escolher(id, !!(ev && ev.shiftKey) || shift.current);
  };

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

  /* ---------------- Pincel de formatação ---------------- */

  /*
   * Pega o molde do elemento selecionado. Só faz sentido com UM selecionado:
   * com vários não existe "a" formatação, existem várias.
   */
  const pegarFormato = useCallback(() => {
    if (pincel) { setPincel(null); return; }   // clicar de novo desarma
    if (sel.length !== 1) return;
    const el = els.find((e) => e.id === sel[0]);
    if (el) setPincel(lerFormato(el));
  }, [pincel, sel, els]);

  /*
   * Aplica e desarma — a menos que Alt esteja pressionado, que é o gesto do
   * Canva e do Office para "continuar pintando". Sem ele, formatar seis
   * textos seria seis idas ao botão.
   */
  const pintarFormato = useCallback((id, manter) => {
    const el = els.find((e) => e.id === id);
    if (!el || !pincel || el.id === pincel.id) return false;
    const p = aplicarFormato(el, pincel);
    if (!p) return false;
    patch(id, p, null);
    if (!manter) setPincel(null);
    return true;
  }, [els, pincel, patch]);

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

  /*
   * Camada: mover na pilha é mover uma LINHA, e um grupo é uma linha só. Assim
   * "para a frente" leva o grupo inteiro, e nunca deixa um estranho no meio
   * dele.
   */
  const moverCamada = useCallback((d) => {
    if (!sel.length) return;
    setEls((a) => {
      const i = linhaDe(a, sel[0]);
      if (i < 0) return a;
      return reordenarLinhas(a, i, clamp(i + d, 0, a.length - 1));
    });
  }, [sel, setEls]);

  const reordenar = useCallback((de, para) => {
    setEls((a) => reordenarLinhas(a, de, para));
  }, [setEls]);

  const empurrar = useCallback((dx, dy) => {
    if (!sel.length) return;
    patch(sel, (e) => ({ x: (Number(e.x) || 0) + dx, y: (Number(e.y) || 0) + dy }), 'empurrar');
  }, [sel, patch]);

  /*
   * Alinhar e distribuir trabalham por UNIDADE: um grupo é uma caixa só.
   *
   * Sem isto, alinhar à esquerda uma seleção com um logotipo agrupado
   * empilharia as partes do logotipo umas sobre as outras — cada pedaço iria
   * para a esquerda por conta própria, e o desenho que a pessoa montou seria
   * desmontado por um botão de alinhar. A matemática continua sendo a de
   * alinhar.js: o que muda é o que se entrega a ela, e o deslocamento de cada
   * caixa é repassado aos membros dela.
   */
  const porUnidade = (fn, minimo) => {
    const us = unidades(els, sel);
    if (us.length < minimo) return;
    const caixas = us.map((u, i) => ({ id: 'u' + i, ...pontoDaCaixa(caixaDe(u.els)) }));
    const movidas = fn(caixas);
    const desloc = new Map();
    movidas.forEach((c, i) => {
      const dx = c.x - caixas[i].x;
      const dy = c.y - caixas[i].y;
      if (dx || dy) us[i].els.forEach((e) => desloc.set(e.id, { dx, dy }));
    });
    if (!desloc.size) return;
    setEls((a) => a.map((e) => {
      const d = desloc.get(e.id);
      return d ? { ...e, x: (Number(e.x) || 0) + d.dx, y: (Number(e.y) || 0) + d.dy } : e;
    }));
  };
  const aplicarAlinhar = (como) => porUnidade((caixas) => alinhar(caixas, como), 1);
  const aplicarDistribuir = (eixo) => porUnidade((caixas) => distribuir(caixas, eixo), 3);

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
      shift.current = ev.shiftKey;

      if (ev.key === 'Escape') {
        if (pincel) { setPincel(null); return; }
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
      if (cmd && ev.key.toLowerCase() === 'g') {
        ev.preventDefault();
        if (ev.shiftKey) separar(); else juntar();
        return;
      }
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
    function onKeyUp(ev) {
      shift.current = ev.shiftKey;
      if (String(ev.key).startsWith('Arrow')) fecharPasso();
    }

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [els, sel, editandoTexto, pincel, duplicar, copiar, colar, remover, moverCamada, empurrar, fecharPasso, saltar, juntar, separar]);

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
  /*
   * Trocar a peça por um modelo, de dentro do editor.
   *
   * Existe porque a decisão de "começar de um modelo" quase nunca acontece
   * antes de abrir o editor: acontece três minutos depois, olhando a tela em
   * branco. Ter que fechar, voltar à biblioteca e recomeçar é onde a pessoa
   * desiste e faz a peça com um texto no meio.
   *
   * Com trabalho em cima da mesa, pergunta antes. Não é excesso de zelo: o
   * modelo substitui TUDO, e um clique sem volta em cima de vinte minutos de
   * trabalho é o tipo de coisa que faz alguém parar de confiar no editor.
   * (Ainda assim entra como um passo do histórico, então Ctrl+Z devolve.)
   */
  function aplicarModelo(peca, formato) {
    setModeloAberto(false);
    setSel([]);
    if (!peca) { editar((d) => ({ ...d, aspect: formato }), null); return; }
    editar((d) => ({
      ...d,
      aspect: peca.formato || d.aspect,
      bg: peca.bg && peca.bg.kind ? peca.bg : d.bg,
      els: entrar(peca.elementos),
      dur: peca.duracao != null ? peca.duracao : d.dur,
    }), null);
  }

  function pedirModelo() {
    if (els.length && !window.confirm('Começar de um modelo substitui o que está no palco. Continuar?')) return;
    setModeloAberto(true);
  }

  /*
   * A IA do editor.
   *
   * A versão anterior fazia duas coisas que ninguém pediu e que custavam
   * trabalho de verdade:
   *
   * 1. APAGAVA TODOS OS TEXTOS DA PEÇA — `els.filter(e => e.tipo !== 'texto')`
   *    — sem aviso e sem pergunta. Rodar a IA numa peça em andamento jogava
   *    fora a copy inteira que a pessoa tinha escrito.
   *
   * 2. FORÇAVA TUDO A VIRAR TEXTO: `.map(e => ({ ...e, tipo: 'texto' }))`.
   *    Qualquer forma ou ícone que voltasse era reetiquetado. É por isso que
   *    "peça uma imagem ou um SVG" nunca funcionou — o editor não conseguia
   *    produzir outra coisa a partir da IA, por construção.
   *
   * Agora ela ACRESCENTA por padrão, e substituir é uma escolha explícita.
   * Como tudo entra num passo só do histórico, Ctrl+Z desfaz a geração
   * inteira — o que torna experimentar barato, que é o ponto de ter IA aqui.
   */
  const TIPOS_DA_IA = ['texto', 'forma', 'icone'];

  async function runAi(substituir) {
    if (!aiBrief.trim()) return;
    setAiBusy(true);
    try {
      /*
       * O que a IA precisa saber para não compor às cegas.
       *
       * `brand` era a cor de fundo, e só quando o fundo era cor chapada — com
       * gradiente ou imagem, ia string vazia e a peça voltava sem marca
       * nenhuma. Agora vem do kit da empresa, que é onde a marca mora de
       * verdade, e o fundo atual entra só como reserva.
       *
       * O formato nunca era enviado: a IA compunha sempre como se a tela
       * fosse deitada, e numa peça 9/16 o layout voltava errado.
       */
      const res = await ai.composition({
        brief: aiBrief,
        brand: marcaDaConta || (bg.kind === 'cor' ? bg.cor : ''),
        formato: aspect,
      });
      const vindos = (res.elementos || [])
        // Honra o tipo que veio; descarta o que o editor não sabe desenhar,
        // em vez de reetiquetar como texto e produzir uma peça sem sentido.
        .filter((e) => TIPOS_DA_IA.includes(e.tipo || 'texto'))
        .map((e) => ({ ...e, tipo: e.tipo || 'texto' }));

      editar((d) => ({
        ...d,
        bg: res.bg && res.bg.cor ? { kind: 'cor', cor: res.bg.cor } : d.bg,
        els: substituir ? entrar(vindos) : [...d.els, ...entrar(vindos)],
      }), null);
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
        <Button size="sm" variant="secondary" icon={LayoutTemplate} onClick={pedirModelo}>Modelos</Button>
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
        <IconBtn title="Agrupar (Ctrl+G)" icon={Group} disabled={!podeAgrupar(els, sel)} onClick={juntar} />
        <IconBtn title="Desagrupar (Ctrl+Shift+G)" icon={Ungroup} disabled={!podeDesagrupar(els, sel)} onClick={separar} />
        <IconBtn title="Duplicar (Ctrl+D, ou Alt+arrastar)" icon={Copy} disabled={!sel.length} onClick={duplicar} />
        <IconBtn
          title={pincel ? 'Clique no elemento que vai receber (Alt para pintar vários)' : 'Copiar formatação de um elemento'}
          icon={Paintbrush} ativo={!!pincel} disabled={!pincel && sel.length !== 1} onClick={pegarFormato} />
        <IconBtn title="Remover (Delete)" icon={Trash2} disabled={!sel.length} onClick={remover} />

        <div className="mx-1 h-5 w-px bg-line" />
        {ASPECTS.map((a) => (
          <button key={a.id} onClick={() => editar((d) => ({ ...d, aspect: a.id }))} title={a.label}
            className={'flex h-8 w-8 items-center justify-center rounded-md border ' + (aspect === a.id ? 'border-accent text-accent' : 'border-line text-ink-3 hover:text-ink')}>
            <a.icon size={16} />
          </button>
        ))}

        <div className="mx-1 h-5 w-px bg-line" />
        <IconBtn title="Margem de segurança, centro e terços" icon={Ruler} ativo={guiasFixas} onClick={() => setGuiasFixas((g) => !g)} />
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

      {modeloAberto && (
        <EscolherModelo
          aberto
          formatoSugerido={aspect}
          onFechar={() => setModeloAberto(false)}
          onEscolher={aplicarModelo}
        />
      )}
      </div>

      {aiOpen && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2">
          <Sparkles size={15} className="text-accent" />
          <input autoFocus value={aiBrief} onChange={(e) => setAiBrief(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runAi(); }}
            placeholder="Descreva a peça (ex.: promoção de skate 30% OFF, jovem e vibrante)"
            className="flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3" />
          {/*
            Dois botões, e o destrutivo é o segundo.

            "Acrescentar" é o padrão porque é o que não custa nada desfazer.
            "Substituir" só aparece quando há algo para substituir — num palco
            vazio ele seria uma pergunta sem sentido.
          */}
          <Button size="sm" variant="primary" icon={Sparkles} disabled={aiBusy || !aiBrief.trim()}
            onClick={() => runAi(false)}>{aiBusy ? 'Gerando…' : 'Acrescentar'}</Button>
          {els.length > 0 && (
            <Button size="sm" variant="secondary" disabled={aiBusy || !aiBrief.trim()}
              title="Apaga o que está no palco e põe o que a IA gerar. Ctrl+Z devolve."
              onClick={() => runAi(true)}>Substituir tudo</Button>
          )}
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

            className="relative shrink-0 shadow-2xl"
            style={{ ...bgStyle, width: palco.w, height: palco.h, cursor: pincel ? 'copy' : 'default' }}>

            {els.map((e) => e.oculto ? null : (
              <div key={e.id} data-el={e.id} ref={(n) => { if (n) nodes.current[e.id] = n; }}
                onMouseDown={(ev) => {
                  if (e.travado) return;
                  ev.stopPropagation();
                  // Com o pincel armado, o clique PINTA em vez de selecionar:
                  // é o gesto inteiro do pincel, e trocar a seleção no meio
                  // dele só faria perder o alvo de vista.
                  if (pincel && pintarFormato(e.id, ev.altKey)) return;
                  escolher(e.id, ev.shiftKey);
                }}
                onDoubleClick={() => {
                  if (e.travado) return;
                  /*
                   * Dois cliques ENTRAM no grupo antes de qualquer outra coisa.
                   * É a ordem do Canva, e é a única que deixa os dois gestos
                   * conviverem: sem ela, dois cliques num texto agrupado
                   * abririam a edição do texto e não haveria como alcançar o
                   * elemento sozinho.
                   */
                  if (e.grupo && grupoAberto !== e.grupo) { setGrupoAberto(e.grupo); setSel([e.id]); return; }
                  if (e.tipo === 'texto') setEditandoTexto(e.id);
                }}
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
                      ...estiloTexto(e), fontSize: fontePx(e), ...estiloCaixa(e, cqwPx),
                      overflow: 'hidden', whiteSpace: 'pre-wrap',
                      outline: editandoTexto === e.id ? '1px dashed rgba(120,160,255,.9)' : 'none',
                      cursor: editandoTexto === e.id ? 'text' : 'inherit',
                    }}
                    onTexto={(t) => patch(e.id, { text: t }, 'texto:' + e.id)}
                    onFim={() => { setEditandoTexto(null); fecharPasso(); }}
                  />
                ) : e.tipo === 'icone' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke={e.cor || '#fff'} strokeWidth={e.peso || 1.6} strokeLinecap="round" strokeLinejoin="round"
                    style={{ width: '100%', height: '100%', pointerEvents: 'none', ...estiloCaixa(e, cqwPx) }}
                    dangerouslySetInnerHTML={{ __html: ICONS[e.name] || ICONS.star }} />
                ) : e.tipo === 'forma' ? (
                  <div style={{
                    width: '100%', height: '100%', background: fillToCss(e.fill),
                    borderRadius: e.shape === 'ellipse' ? '50%' : (SHAPE_POLY[e.shape] ? 0 : raioCss(e, cqwPx)),
                    clipPath: SHAPE_POLY[e.shape] ? shapeClip(e.shape) : 'none', pointerEvents: 'none',
                    ...estiloCaixa(e, cqwPx),
                  }} />
                ) : (
                  <img src={e.src} alt="" draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: e.fit || 'contain', display: 'block', pointerEvents: 'none',
                      borderRadius: raioCss(e, cqwPx), ...estiloCaixa(e, cqwPx) }} />
                )}
              </div>
            ))}

            {/*
              Guias de encaixe e leitura de tamanho.

              Sempre no ar, escondidas por `display`, e escritas à mão durante
              o gesto — nunca por estado. Ver o comentário lá em cima: um
              `setState` no meio do arrasto reinicia a conta do Moveable, e o
              elemento volta ao tamanho em que estava.
            */}
            {/*
              Margem de segurança, centro e terços. Fica ABAIXO dos elementos
              (zIndex 1) para não cobrir a peça — quem precisa aparecer por
              cima é a guia de encaixe, que é momentânea.
            */}
            {guiasFixas && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
                {/* Área segura: 5% de cada lado, que é o overscan típico. */}
                <div style={{
                  position: 'absolute', left: '5%', top: '5%', right: '5%', bottom: '5%',
                  border: '1px dashed rgba(255,180,80,.55)',
                }} />
                {/* Centro */}
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(120,160,255,.35)' }} />
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(120,160,255,.35)' }} />
                {/* Terços */}
                {[33.333, 66.667].map((v) => (
                  <React.Fragment key={v}>
                    <div style={{ position: 'absolute', left: v + '%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.12)' }} />
                    <div style={{ position: 'absolute', top: v + '%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,.12)' }} />
                  </React.Fragment>
                ))}
              </div>
            )}

            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9 }}>
              <div ref={guiaXRef} style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: '#ff3d9a', display: 'none' }} />
              <div ref={guiaYRef} style={{ position: 'absolute', left: 0, right: 0, height: 1, background: '#ff3d9a', display: 'none' }} />
              <div ref={medidaRef}
                style={{
                  position: 'absolute', display: 'none', transform: 'translateX(-50%)',
                  background: 'rgba(17,20,32,.92)', color: '#fff',
                  padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                  font: '600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
                  boxShadow: '0 2px 10px rgba(0,0,0,.35)',
                }} />
            </div>

            {/* Caixa invisível que representa a seleção múltipla — é ela que o
                Moveable arrasta, e o deslocamento é repassado a cada elemento. */}
            {caixaGrupo && (
              <div ref={setGrupoNo} style={{
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
                origin={false}
                throttleDrag={0} throttleResize={0} throttleRotate={0}
                /*
                 * ALT + ARRASTAR DUPLICA.
                 *
                 * O gesto que todo mundo traz do Figma e do Canva, e cuja
                 * ausência obriga a um ritual de três passos (duplicar, achar
                 * a cópia empilhada, arrastar) para uma coisa que devia ser
                 * um gesto só.
                 *
                 * A cópia fica PARADA no lugar de origem e quem viaja é o
                 * elemento original. Visualmente é indistinguível de duplicar
                 * e arrastar a cópia, e evita o problema de trocar o alvo do
                 * Moveable no meio do gesto — que reinicia a conta dele, como
                 * já custou caro no redimensionamento.
                 */
                onDragStart={({ inputEvent }) => {
                  if (!inputEvent || !inputEvent.altKey) return;
                  const alvo = movivel[0];
                  if (!alvo) return;
                  setEls((a) => {
                    const i = a.findIndex((e) => e.id === alvo.id);
                    if (i < 0) return a;
                    const copia = { ...a[i], id: uid() };
                    // Entra logo ABAIXO do original na pilha: a cópia fica onde
                    // o original estava, e o original continua por cima.
                    return [...a.slice(0, i), copia, ...a.slice(i)];
                  }, 'duplicar:' + alvo.id);
                }}
                onDrag={({ left, top }) => {
                  const r = rect();
                  const alvo = movivel[0];
                  const bruto = { x: (left / r.width) * 100, y: (top / r.height) * 100, w: alvo.w, h: alvo.h };
                  const fixo = encaixar(bruto, els.filter((e) => e.id !== alvo.id && !e.oculto));
                  pintarGuias(fixo.guias.x, fixo.guias.y);
                  patch(alvo.id, { x: clamp(fixo.x, -40, 140), y: clamp(fixo.y, -40, 140) }, 'mover:' + alvo.id);
                }}
                onDragEnd={() => { pintarGuias(null, null); fecharPasso(); }}
                /*
                 * Proporção travada em imagem e ícone, solta no resto.
                 *
                 * Puxar o canto de uma foto e ela sair achatada não é uma
                 * escolha que alguém faz de propósito — é um acidente que só
                 * se percebe na parede. Texto e forma continuam livres, porque
                 * ali esticar é o uso normal. Segurar Shift inverte a regra,
                 * para o caso em que a distorção é mesmo o que se quer.
                 */
                /*
                 * A GEOMETRIA DO REDIMENSIONAMENTO É CALCULADA AQUI, e não
                 * lida do Moveable.
                 *
                 * O Moveable deriva `width` do elemento que está no DOM. Como
                 * quem escreve no DOM durante o gesto somos nós, formava-se um
                 * laço: escrevíamos a largura já encaixada, ele relia aquele
                 * valor como se fosse o do ponteiro, e o encaixe se
                 * confirmava sozinho a cada quadro. Na prática a peça GRUDAVA
                 * na primeira âncora e não saía mais — dava para arrastar o
                 * mouse meia tela e o elemento ficava parado na borda do
                 * vizinho.
                 *
                 * Guardando a caixa e o ponteiro do início do gesto, a conta
                 * passa a depender só de onde o dedo está. O encaixe vira
                 * enfeite por cima de um número que continua andando, e soltar
                 * da âncora é só continuar movendo.
                 */
                onResizeStart={({ inputEvent, direction }) => {
                  const e = movivel[0];
                  gesto.current = {
                    px: inputEvent.clientX, py: inputEvent.clientY, dir: direction,
                    x: Number(e.x) || 0, y: Number(e.y) || 0,
                    w: Number(e.w) || 0, h: Number(e.h) || 0,
                    caixa: null,
                  };
                }}
                onResize={({ inputEvent, target }) => {
                  const g = gesto.current;
                  if (!g) return;
                  const r = rect();
                  const alvo = movivel[0];
                  const dx = ((inputEvent.clientX - g.px) / r.width) * 100;
                  const dy = ((inputEvent.clientY - g.py) / r.height) * 100;

                  let { x, y, w, h } = g;
                  if (g.dir[0] > 0) w = g.w + dx;
                  else if (g.dir[0] < 0) { x = g.x + dx; w = g.w - dx; }
                  if (g.dir[1] > 0) h = g.h + dy;
                  else if (g.dir[1] < 0) { y = g.y + dy; h = g.h - dy; }

                  /*
                   * Proporção travada em imagem e ícone, solta no resto.
                   * Puxar o canto de uma foto e ela sair achatada não é uma
                   * escolha que alguém faz de propósito — é um acidente que só
                   * se percebe na parede. Shift inverte a regra.
                   */
                  const travada = (alvo.tipo === 'imagem' || alvo.tipo === 'icone') !== shift.current;
                  if (travada && g.w > 0 && g.h > 0) {
                    // O eixo que a alça manda comanda; o outro segue.
                    if (g.dir[0] === 0) w = h * (g.w / g.h);
                    else h = w * (g.h / g.w);
                    if (g.dir[0] < 0) x = g.x + (g.w - w);
                    if (g.dir[1] < 0) y = g.y + (g.h - h);
                  }

                  const bruto = { x, y, w, h };
                  const fixo = encaixarRedimensionamento(
                    bruto, els.filter((e) => e.id !== alvo.id && !e.oculto), g.dir,
                  );
                  // Com a proporção presa, encaixar um eixo entortaria o outro:
                  // aqui o encaixe vale, e o eixo companheiro é refeito.
                  if (travada && g.w > 0 && g.h > 0) {
                    if (g.dir[0] === 0) { fixo.w = fixo.h * (g.w / g.h); }
                    else { fixo.h = fixo.w * (g.h / g.w); fixo.guias.y = null; }
                  }

                  /*
                   * Um mínimo medido em PIXELS DO PALCO, e não em % da peça.
                   * Em porcento, um mínimo que ainda permita a faixa fina que
                   * os modelos usam (1,2% de altura) é pequeno demais para se
                   * pegar de volta com o mouse. Oito pixels na tela mantêm a
                   * alça alcançável em qualquer zoom.
                   */
                  const caixa = {
                    x: clamp(fixo.x, -40, 140), y: clamp(fixo.y, -40, 140),
                    w: Math.max((8 / r.width) * 100, fixo.w),
                    h: Math.max((8 / r.height) * 100, fixo.h),
                  };
                  g.caixa = caixa;

                  // Escrito em % — a mesma unidade que o React usa ao
                  // comprometer, para não haver salto na hora de soltar.
                  target.style.left = caixa.x + '%';
                  target.style.top = caixa.y + '%';
                  target.style.width = caixa.w + '%';
                  target.style.height = caixa.h + '%';
                  // Texto com corpo preso à diagonal do bloco acompanha ao vivo;
                  // sem isto ele só cresceria depois de soltar a alça.
                  if (alvo.tipo === 'texto' && alvo.auto && target.firstElementChild) {
                    const corpo = textFontCqw({ ...alvo, w: caixa.w, h: caixa.h }, aspect);
                    target.firstElementChild.style.fontSize = ((corpo / 100) * palco.w) + 'px';
                  }

                  pintarGuias(fixo.guias.x, fixo.guias.y);
                  pintarMedida(caixa);
                }}
                onResizeEnd={() => {
                  const caixa = gesto.current && gesto.current.caixa;
                  gesto.current = null;
                  pintarGuias(null, null);
                  pintarMedida(null);
                  // Uma única entrada no histórico para o gesto inteiro: quem
                  // desfaz espera voltar ao tamanho de antes, não meio pixel.
                  if (caixa) {
                    patch(movivel[0].id, {
                      x: arred(caixa.x), y: arred(caixa.y), w: arred(caixa.w), h: arred(caixa.h),
                    }, 'redim:' + movivel[0].id);
                  }
                  fecharPasso();
                }}
                onRotate={({ rotation }) => patch(movivel[0].id, { rot: Math.round(rotation) }, 'girar:' + movivel[0].id)}
                onRotateEnd={fecharPasso}
              />
            )}

            {/* Vários selecionados: arrastar o conjunto. Redimensionar em grupo
                fica de fora de propósito — em coordenadas percentuais ele
                distorce texto e imagem de formas difíceis de desfazer. */}
            {caixaGrupo && grupoNo && (
              <Moveable
                target={grupoNo}
                draggable resizable={false} rotatable={false}
                /*
                 * `dragArea` é o que faltava para o arrasto existir: a caixa da
                 * seleção é `pointer-events: none` (senão ela roubaria o clique
                 * dos elementos que estão embaixo), e sem redimensionar não há
                 * alça nenhuma para pegar. O dragArea é uma superfície que o
                 * próprio Moveable desenha por cima só para receber o arrasto.
                 */
                dragArea
                /*
                 * O dragArea cobre os elementos, então TODO clique passa a
                 * chegar aqui — inclusive o de quem queria escolher outro
                 * elemento, ou sair da seleção. Sem devolver esses cliques ao
                 * seu dono, selecionar um grupo prenderia a pessoa nele.
                 *
                 * `elementsFromPoint` devolve tudo o que está naquele ponto,
                 * em ordem, e daí se acha o elemento que estava por baixo.
                 */
                onClick={({ inputEvent, isDouble }) => cliqueAtravesDaArea(inputEvent, isDouble)}
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

            {/*
              O pincel armado precisa DIZER que está armado. Um botão aceso e
              um cursor diferente são pistas fracas: quem armou sem querer fica
              clicando e vendo a formatação mudar sem entender por quê.
            */}
            {pincel && (
              <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs text-ink-2">
                <strong className="text-ink">Pincel de formatação ligado.</strong> Clique no elemento que
                vai receber. Segure <span className="text-ink">Alt</span> para pintar vários, ou aperte{' '}
                <span className="text-ink">Esc</span> para desligar.
              </div>
            )}

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
                    <PainelSombra el={selEl} onChange={(sm) => patch(selEl.id, { sombra: sm }, 'sombra:' + selEl.id)} onSoltar={fecharPasso} />
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
                    <PainelSombra el={selEl} onChange={(sm) => patch(selEl.id, { sombra: sm }, 'sombra:' + selEl.id)} onSoltar={fecharPasso} />
                    <PainelBorda el={selEl} onChange={(bd) => patch(selEl.id, { borda: bd }, 'borda:' + selEl.id)} onSoltar={fecharPasso} />
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
                    <PainelSombra el={selEl} onChange={(sm) => patch(selEl.id, { sombra: sm }, 'sombra:' + selEl.id)} onSoltar={fecharPasso} />
                  </>
                ) : (
                  <>
                    <Field label="Ajuste da imagem">
                      <Select value={selEl.fit || 'contain'} onChange={(e) => patch(selEl.id, { fit: e.target.value })}>
                        <option value="contain">Inteira (sem cortar)</option><option value="cover">Preencher (corta)</option>
                      </Select>
                    </Field>
                    <Button size="sm" variant="secondary" icon={ImagePlus} disabled={busy} onClick={() => imgInput.current.click()}>Trocar imagem</Button>
                    <Field label={`Cantos (${selEl.radius || 0})`}>
                      <input type="range" min="0" max="20" step="0.5" value={selEl.radius || 0}
                        onChange={(e) => patch(selEl.id, { radius: Number(e.target.value) }, 'raio:' + selEl.id)}
                        onMouseUp={fecharPasso} onTouchEnd={fecharPasso} className="w-full" />
                    </Field>
                    <Opacidade el={selEl} onChange={(o) => patch(selEl.id, { opacidade: o })} />
                    <PainelSombra el={selEl} onChange={(sm) => patch(selEl.id, { sombra: sm }, 'sombra:' + selEl.id)} onSoltar={fecharPasso} />
                    <PainelBorda el={selEl} onChange={(bd) => patch(selEl.id, { borda: bd }, 'borda:' + selEl.id)} onSoltar={fecharPasso} />
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

/* ---------------- Sombra e borda ---------------- */

/*
 * Sombra.
 *
 * Duas decisões que valem o comentário:
 *
 * 1. Os números são em cqw — por cento da LARGURA da peça — e não em pixel.
 *    A mesma peça é desenhada num palco de 400px aqui, 1920px na TV e 1080px
 *    no PNG; uma sombra de 14px seria discreta lá e um borrão na miniatura.
 * 2. `sombra: true` é como as peças antigas guardam "tem sombra". Ligar o
 *    painel em cima de uma delas mostra o padrão, e o primeiro ajuste
 *    converte para objeto — ninguém perde a sombra que já tinha.
 */
function PainelSombra({ el, onChange, onSoltar }) {
  const ligada = !!el.sombra;
  const v = (el.sombra && typeof el.sombra === 'object') ? { ...SOMBRA_PADRAO, ...el.sombra } : SOMBRA_PADRAO;
  const mexer = (campo, valor) => onChange({ ...v, [campo]: valor });

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <label className="flex items-center gap-2 text-xs text-ink-2">
        <input type="checkbox" checked={ligada} onChange={(e) => { onChange(e.target.checked ? { ...SOMBRA_PADRAO } : false); onSoltar(); }} />
        Sombra
      </label>
      {ligada && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cor">
              <input type="color" value={v.cor} onChange={(e) => mexer('cor', e.target.value)} onBlur={onSoltar}
                className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" />
            </Field>
            <Field label={`Opacidade (${Math.round(v.opacidade * 100)}%)`}>
              <input type="range" min="0" max="1" step="0.05" value={v.opacidade}
                onChange={(e) => mexer('opacidade', Number(e.target.value))}
                onMouseUp={onSoltar} onTouchEnd={onSoltar} className="w-full" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Horizontal (${v.x})`}>
              <input type="range" min={-SOMBRA_LIMITES.desloc} max={SOMBRA_LIMITES.desloc} step="0.05" value={v.x}
                onChange={(e) => mexer('x', Number(e.target.value))}
                onMouseUp={onSoltar} onTouchEnd={onSoltar} className="w-full" />
            </Field>
            <Field label={`Vertical (${v.y})`}>
              <input type="range" min={-SOMBRA_LIMITES.desloc} max={SOMBRA_LIMITES.desloc} step="0.05" value={v.y}
                onChange={(e) => mexer('y', Number(e.target.value))}
                onMouseUp={onSoltar} onTouchEnd={onSoltar} className="w-full" />
            </Field>
          </div>
          <Field label={`Desfoque (${v.desfoque})`} hint="Sombra dura e deslocada dá cara de adesivo; aberta e rente, dá relevo.">
            <input type="range" min="0" max={SOMBRA_LIMITES.desfoque} step="0.05" value={v.desfoque}
              onChange={(e) => mexer('desfoque', Number(e.target.value))}
              onMouseUp={onSoltar} onTouchEnd={onSoltar} className="w-full" />
          </Field>
        </>
      )}
    </div>
  );
}

/*
 * Borda.
 *
 * Não aparece em forma recortada (triângulo, losango, diagonal): o recorte
 * corta a borda junto, e o resultado é um traço que aparece de um lado e some
 * do outro. Melhor não oferecer do que oferecer quebrado.
 */
function PainelBorda({ el, onChange, onSoltar }) {
  if (recortada(el)) {
    return (
      <div className="border-t border-line pt-3 text-2xs text-ink-3">
        Triângulo, losango e diagonal não aceitam borda — o recorte da forma cortaria o traço pela metade.
      </div>
    );
  }
  const b = el.borda || {};
  const largura = Number(b.largura) || 0;
  const mexer = (campo, valor) => onChange({ largura, cor: b.cor || '#ffffff', estilo: b.estilo || 'solid', [campo]: valor });

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <Field label={`Borda (${largura || 'sem'})`}>
        <input type="range" min="0" max={BORDA_MAX} step="0.05" value={largura}
          onChange={(e) => mexer('largura', Number(e.target.value))}
          onMouseUp={onSoltar} onTouchEnd={onSoltar} className="w-full" />
      </Field>
      {largura > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cor">
            <input type="color" value={b.cor || '#ffffff'} onChange={(e) => mexer('cor', e.target.value)} onBlur={onSoltar}
              className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" />
          </Field>
          <Field label="Traço">
            <Select value={b.estilo || 'solid'} onChange={(e) => { mexer('estilo', e.target.value); onSoltar(); }}>
              <option value="solid">Contínuo</option><option value="dashed">Tracejado</option><option value="dotted">Pontilhado</option>
            </Select>
          </Field>
        </div>
      )}
    </div>
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

function IconBtn({ icon: Icone, title, onClick, disabled, ativo }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} aria-pressed={ativo ? 'true' : undefined}
      className={'flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-35 '
        + (ativo ? 'border-accent text-accent' : 'border-line text-ink-2 hover:text-ink')}>
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
