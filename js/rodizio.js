/*
 * js/rodizio.js — o rodízio de uma zona (fase 5 do plano de ação): quem
 * entra, quantas vezes por volta e por quanto tempo.
 *
 * Puro: sem DOM e sem relógio próprio (o "agora" vem de fora). A TV usa
 * (js/player.js) e a semana simulada também (test/semana-simulada.test.js) —
 * o que o teste mede é o que a parede mostra.
 *
 * As regras (docs/qa-total/BLOCO-3-RESULTADO.md, o que a semana simulada achou):
 *   - TETOS por TEMPO de tela, não por contagem: o urgente fica com no
 *     máximo 25% da volta, dividido entre todos os urgentes; a Alta, 40%.
 *     Antes, dois urgentes ficavam com 60% da tela a semana inteira.
 *   - PRAZO: a peça normal que sai em menos de 24 h passa a valer Alta.
 *   - TEMPO pela leitura: 1 s por palavra, de 6 a 25 s — a não ser que a
 *     pessoa tenha posto o tempo à mão (meta.duracaoManual).
 *   - As FONTES se revezam (uma campanha não passa toda em fila) e a mesma
 *     peça não sai duas vezes seguidas quando há outra para pôr entre elas.
 */
(function (global) {
  'use strict';

  const TETO = { urgente: 0.25, alta: 0.4 };
  const PESO = { urgente: 3, alta: 2, normal: 1 };
  const DUR_MIN = 6;
  const DUR_MAX = 25;
  const DIA_MS = 24 * 60 * 60 * 1000;

  // O que a pessoa lê na peça. Mídia, relógio, clima e quiz têm o tempo deles.
  const CAMPOS = ['etiqueta', 'kicker', 'selo', 'titulo', 'corpo', 'texto', 'autor', 'info', 'cta', 'caption',
    'rotulo', 'valor', 'variacao', 'detalhe', 'legenda', 'chamada', 'handle', 'precoDe', 'precoPor', 'linhas', 'rodape'];
  const TEMPO_PROPRIO = { image: 1, video: 1, youtube: 1, pptx: 1, web: 1, screen: 1, livesource: 1, weatherpro: 1,
    birthdayauto: 1, mural: 1, quiz: 1, composicao: 1, clock: 1 };

  function palavras(txt) {
    const s = String(txt || '').replace(/[;|·•—–-]+/g, ' ').trim();
    return s ? s.split(/\s+/).filter(function (p) { return /[A-Za-zÀ-ÿ0-9]/.test(p); }).length : 0;
  }
  function palavrasDe(it) {
    if (!it) return 0;
    let n = 0;
    CAMPOS.forEach(function (k) { if (typeof it[k] === 'string' || typeof it[k] === 'number') n += palavras(it[k]); });
    // A peça da IA: o texto está nos campos dela.
    if (it.campos && typeof it.campos === 'object') {
      Object.keys(it.campos).forEach(function (k) {
        const v = it.campos[k];
        if (typeof v === 'string' && !/^(https?:|data:|\/)/.test(v)) n += palavras(v);
      });
    }
    return n;
  }

  /*
   * Quanto a peça fica no ar, em segundos. `padrao` é o que o desenhista
   * devolveu (o duracao do item, ou o do tipo). 0 = a peça controla o
   * próprio avanço (vídeo até o fim, live): fica 0.
   */
  function duracaoDe(it, padrao) {
    const d = Number(it && it.duracao);
    const base = Number(padrao) > 0 ? Number(padrao) : (d > 0 ? d : 10);
    if (!it) return base;
    if (d === 0 && it.duracao !== undefined && it.duracao !== '') return 0;
    if ((it.meta && it.meta.duracaoManual && d > 0) || TEMPO_PROPRIO[it.type]) return base;
    const n = palavrasDe(it);
    if (!n) return base;
    return Math.max(DUR_MIN, Math.min(DUR_MAX, n));
  }

  /*
   * A importância AGORA. A peça normal com prazo (o fim marcado, ou o
   * último dia do agendamento) que sai em menos de 24 h vale Alta.
   * ctx: { agoraMs, hoje: 'AAAA-MM-DD' na loja }.
   */
  function nivelDe(it, ctx) {
    const p = it && it.meta && it.meta.prioridade;
    if (p === 'urgente' || p === 'alta') return p;
    const c = ctx || {};
    const fim = Number(it && it.meta && it.meta.expiraEm);
    if (fim > 0 && c.agoraMs && fim - c.agoraMs > 0 && fim - c.agoraMs <= DIA_MS) return 'alta';
    const a = it && it.agendamento;
    if (a && a.ativo && a.dataFim && c.hoje && a.dataFim === c.hoje) return 'alta';
    return 'normal';
  }

  function fonteDe(it, i) {
    if (it && it._campanha) return 'c:' + it._campanha;
    if (it && it._calendario) return 'calendario';
    return 'i:' + i;
  }

  // As fontes se revezam: uma de cada por vez, na ordem em que aparecem na zona.
  function intercalar(lista) {
    const grupos = [];
    const porFonte = {};
    lista.forEach(function (it, i) {
      const f = fonteDe(it, i);
      if (!porFonte[f]) { porFonte[f] = []; grupos.push(porFonte[f]); }
      porFonte[f].push(it);
    });
    const base = [];
    for (let r = 0; base.length < lista.length; r++) grupos.forEach(function (g) { if (r < g.length) base.push(g[r]); });
    return base;
  }

  /*
   * Quantas vezes cada peça entra numa volta, com os tetos de tempo.
   * Devolve { contas, voltas }: `voltas` é quantas voltas "normais" a
   * sequência cobre (o urgente que só cabe uma vez a cada duas voltas faz a
   * sequência dobrar, com as outras peças duas vezes).
   */
  function contasDe(base, ctx, durDe) {
    const nivel = base.map(function (it) { return nivelDe(it, ctx); });
    const dur = base.map(function (it) { return Math.max(1, durDe(it) || 10); });
    const w = nivel.map(function (n) { return PESO[n]; });
    const tempo = function (qual) {
      return base.reduce(function (s, it, i) { return s + (qual(nivel[i]) ? w[i] * dur[i] : 0); }, 0);
    };
    // O urgente: no máximo 25% da volta, contando o resto como está.
    const tu = tempo(function (n) { return n === 'urgente'; });
    const resto = tempo(function (n) { return n !== 'urgente'; });
    if (tu > 0 && resto > 0 && tu / (tu + resto) > TETO.urgente) {
      const f = (TETO.urgente / (1 - TETO.urgente)) * resto / tu;
      nivel.forEach(function (n, i) { if (n === 'urgente') w[i] *= f; });
    }
    // A Alta: no máximo 40% da volta inteira (com o urgente já no teto).
    const ta = tempo(function (n) { return n === 'alta'; });
    const tu2 = tempo(function (n) { return n === 'urgente'; });
    const tn = tempo(function (n) { return n === 'normal'; });
    if (ta > 0 && tn > 0 && ta / (ta + tu2 + tn) > TETO.alta) {
      // ta·f / (ta·f + tu2 + tn) = 0,4  →  f = 0,4·(tu2 + tn) / (0,6·ta)
      const f = (TETO.alta * (tu2 + tn)) / ((1 - TETO.alta) * ta);
      nivel.forEach(function (n, i) { if (n === 'alta') w[i] *= f; });
    }
    // Peso fracionado (o urgente que só cabe uma vez a cada duas voltas): a sequência cobre mais voltas.
    const menor = Math.min.apply(null, w);
    const voltas = menor >= 1 ? 1 : Math.min(8, Math.ceil(1 / menor - 1e-9));
    // O que tem teto arredonda para baixo (nunca passa dele); o normal, para o mais perto.
    const contas = w.map(function (x, i) {
      return Math.max(1, nivel[i] === 'normal' ? Math.round(x * voltas) : Math.floor(x * voltas + 1e-9));
    });
    /*
     * O arredondamento pode empurrar um nível para cima do teto (o urgente
     * arredonda para baixo e a fatia dele vai para a Alta). Confere com as
     * contas inteiras e tira uma passada de quem passou, até caber.
     */
    const fatia = function (qual) {
      let t = 0, todo = 0;
      contas.forEach(function (n, i) { todo += n * dur[i]; if (nivel[i] === qual) t += n * dur[i]; });
      return todo ? t / todo : 0;
    };
    ['urgente', 'alta'].forEach(function (qual) {
      const outros = nivel.some(function (n) { return qual === 'urgente' ? n !== 'urgente' : n === 'normal'; });
      for (let k = 0; k < 50 && outros && fatia(qual) > TETO[qual] + 1e-9; k++) {
        let maior = -1;
        contas.forEach(function (n, i) { if (nivel[i] === qual && n > 1 && (maior < 0 || n > contas[maior])) maior = i; });
        if (maior < 0) break;
        contas[maior]--;
      }
    });
    return { contas: contas, voltas: voltas, nivel: nivel, dur: dur };
  }

  /*
   * A sequência de uma volta: round-robin ponderado suave (o do nginx), que
   * espalha as repetições, e a mesma peça nunca duas vezes seguidas quando
   * há outra para pôr entre elas — nem na emenda de uma volta com a outra.
   */
  function distribuir(lista, ctx, durDe) {
    if (!lista || lista.length < 2) return lista || [];
    const base = intercalar(lista);
    const c = contasDe(base, ctx || {}, durDe || function (it) { return duracaoDe(it); });
    const total = c.contas.reduce(function (s, x) { return s + x; }, 0);
    if (total === base.length) return base;
    const atual = base.map(function () { return 0; });
    const saida = [];
    for (let k = 0; k < total; k++) {
      let melhor = 0;
      base.forEach(function (it, i) { atual[i] += c.contas[i]; if (atual[i] > atual[melhor]) melhor = i; });
      atual[melhor] -= total;
      saida.push(base[melhor]);
    }
    /*
     * A mesma peça duas vezes seguidas: troca com uma adiante que não crie
     * outra dupla. Quando não há troca possível (o teto do urgente pede o
     * normal por mais tempo e só há um normal), a dupla fica — e a TV
     * mantém a peça no ar em vez de entrar com ela de novo (js/player.js).
     */
    const dupla = function (q, i) { return i > 0 && i < q.length && q[i] === q[i - 1]; };
    for (let i = 1; i < saida.length; i++) {
      if (saida[i] !== saida[i - 1]) continue;
      for (let j = i + 1; j < saida.length; j++) {
        if (saida[j] === saida[i]) continue;
        const q = saida.slice();
        const t = q[i]; q[i] = q[j]; q[j] = t;
        if (!dupla(q, i) && !dupla(q, i + 1) && !dupla(q, j) && !dupla(q, j + 1)) { for (let z = 0; z < q.length; z++) saida[z] = q[z]; break; }
      }
    }
    // A volta seguinte começa onde esta terminou: a mesma peça no fim e no começo passaria duas vezes seguidas.
    if (saida.length > 3 && saida[0] === saida[saida.length - 1]) {
      const it = saida.pop();
      for (let p = 1; p < saida.length; p++) {
        if (saida[p - 1] !== it && saida[p] !== it) { saida.splice(p, 0, it); return saida; }
      }
      saida.push(it);
    }
    return saida;
  }

  /*
   * A peça está na janela agendada? `loja` = { data: 'AAAA-MM-DD', dia: 0–6,
   * hm: 'HH:MM' } NA LOJA (js/player.js, agoraNaLoja: o fuso da loja, não o
   * relógio da TV). A janela que cruza a meia-noite vale.
   */
  function naJanela(item, loja) {
    const a = item && item.agendamento;
    if (!a || !a.ativo) return true;
    if (a.dataInicio && loja.data < a.dataInicio) return false;
    if (a.dataFim && loja.data > a.dataFim) return false;
    if (Array.isArray(a.dias) && a.dias.length && a.dias.indexOf(loja.dia) === -1) return false;
    if (a.horaInicio || a.horaFim) {
      const ini = a.horaInicio || '00:00';
      const fim = a.horaFim || '23:59';
      if (ini <= fim) { if (loja.hm < ini || loja.hm > fim) return false; }
      else if (loja.hm < ini && loja.hm > fim) return false;
    }
    return true;
  }

  // Quanto tempo uma volta leva, em segundos (o que a pessoa que espera vê antes de repetir).
  function tempoDaVolta(seq, durDe) {
    const f = durDe || function (it) { return duracaoDe(it); };
    return (seq || []).reduce(function (s, it) { return s + Math.max(0, f(it) || 0); }, 0);
  }

  // O tamanho certo da volta para o lugar (o tempo que a pessoa fica ali), em segundos.
  const VOLTA_DO_LOCAL = { balcao: [120, 300], recepcao: [480, 720], escritorio: [180, 600] };

  const api = {
    TETO: TETO, PESO: PESO, DUR_MIN: DUR_MIN, DUR_MAX: DUR_MAX, VOLTA_DO_LOCAL: VOLTA_DO_LOCAL,
    palavrasDe: palavrasDe, duracaoDe: duracaoDe, nivelDe: nivelDe, fonteDe: fonteDe,
    intercalar: intercalar, contasDe: contasDe, distribuir: distribuir, tempoDaVolta: tempoDaVolta, naJanela: naJanela,
  };
  global.MTRodizio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
