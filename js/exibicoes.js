/*
 * js/exibicoes.js — o que a TV exibiu, e por quanto tempo (proof-of-play).
 *
 * A pergunta que o cliente corporativo faz depois de publicar: "passou
 * mesmo? quantas vezes? em qual tela?". A TV é a única que sabe, então é
 * ela que conta.
 *
 * O desenho, e por quê:
 *
 *   - AGREGA POR HORA na própria TV. Um evento por exibição seria uma
 *     requisição a cada 10 segundos por tela; por hora é um punhado de
 *     linhas por dia, e o relatório nunca precisa de mais precisão que isso.
 *   - GUARDA OFFLINE (localStorage). A TV sem internet continua exibindo, e
 *     é justamente essa exibição que o relatório não pode perder.
 *   - ENVIA EM LOTES COM ID. Se a resposta do servidor se perder no caminho,
 *     a TV reenvia o mesmo lote e o servidor, que já o viu, ignora. Sem o id,
 *     cada falha de rede contaria as exibições duas vezes.
 *   - TEM TETO. Uma TV sem internet por um mês não pode encher o armazenamento
 *     do navegador: passado o teto, as horas mais antigas saem primeiro.
 *
 * Módulo duplo (navegador e Node), como js/cor.js: o teste roda a mesma
 * contagem que a TV roda.
 */
(function (global) {
  'use strict';

  const HORA = 60 * 60 * 1000;
  const CHAVE = 'mt.exibicoes';
  const CHAVE_LOTE = 'mt.exibicoes.lote';
  const MAX_LINHAS = 3000;   // ~ um mês de uma TV com 4 zonas e 25 conteúdos
  const MAX_SEGUNDOS = 3600; // uma exibição não passa de uma hora dentro de uma hora

  /* Identidade estável de um conteúdo: o id se houver; senão, o que ele mostra. */
  function chaveDoItem(item) {
    const i = item || {};
    if (i.id) return String(i.id).slice(0, 80);
    const base = [i.type || '', i.titulo || i.title || '', i.src || i.url || i.videoId || '', i.texto || i.corpo || ''].join('|');
    let h = 0;
    for (let k = 0; k < base.length; k++) h = (h * 31 + base.charCodeAt(k)) | 0;
    return (i.type || 'item') + ':' + (h >>> 0).toString(36);
  }

  /* O nome que o relatório mostra. */
  function rotuloDoItem(item) {
    const i = item || {};
    const t = i.titulo || i.title || i.nome || i.texto || i.corpo || i.legenda || '';
    return String(t || i.type || 'Conteúdo').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  /*
   * O contador. `guardar`/`ler` são o armazenamento (localStorage na TV,
   * memória no teste), `agora` o relógio.
   */
  function criar(opcoes) {
    const o = opcoes || {};
    const agora = o.agora || (() => Date.now());
    const ler = o.ler || (() => null);
    const guardar = o.guardar || (() => {});
    let linhas = {};
    try { linhas = JSON.parse(ler(CHAVE) || '{}') || {}; } catch (e) { linhas = {}; }

    function persistir() {
      const ks = Object.keys(linhas);
      if (ks.length > MAX_LINHAS) {
        // As horas mais antigas saem primeiro.
        ks.sort((a, b) => linhas[a].hora - linhas[b].hora);
        for (let i = 0; i < ks.length - MAX_LINHAS; i++) delete linhas[ks[i]];
      }
      try { guardar(CHAVE, JSON.stringify(linhas)); } catch (e) { /* cheio: segue em memória */ }
    }

    function somar(item, zona, inicio, fim, contarVez) {
      const chave = chaveDoItem(item);
      // Uma exibição que atravessa a virada da hora conta nas duas.
      let t = inicio;
      let primeira = contarVez;
      while (t < fim) {
        const hora = Math.floor(t / HORA) * HORA;
        const ate = Math.min(fim, hora + HORA);
        const id = hora + '|' + zona + '|' + chave;
        const l = linhas[id] || (linhas[id] = {
          hora, zona, chave, rotulo: rotuloDoItem(item), tipo: String((item && item.type) || ''), vezes: 0, segundos: 0,
        });
        if (primeira) l.vezes += 1;
        l.segundos += Math.min(MAX_SEGUNDOS, Math.round((ate - t) / 1000));
        primeira = false;
        t = ate;
      }
      persistir();
    }

    /*
     * Começou a exibir. Devolve { parcial, terminar }:
     *   - terminar(): saiu do ar. Chamável uma vez.
     *   - parcial(): conta o tempo até agora SEM encerrar. Existe para a
     *     zona de conteúdo único, que fica no ar para sempre e nunca
     *     "termina" — sem isto, a tela mais estável da frota não apareceria
     *     no relatório. A exibição conta UMA vez, não uma por parcial.
     */
    function iniciar(item, zona) {
      const z = String(zona || 'principal');
      const inicio = agora();
      let desde = inicio;
      let contada = false;
      let feito = false;
      function marcar() {
        const fim = agora();
        // Menos de um segundo no ar não é exibição: é a troca de config
        // atropelando o slide.
        if (!contada && fim - inicio < 1000) return;
        if (fim > desde) somar(item, z, desde, fim, !contada);
        contada = true;
        desde = fim;
      }
      return {
        parcial() { if (!feito) marcar(); },
        terminar() { if (feito) return; feito = true; marcar(); },
      };
    }

    /*
     * O lote a enviar: as horas JÁ FECHADAS (a hora corrente ainda está
     * mudando). `confirmar(lote)` tira do armazenamento o que o servidor
     * aceitou; se a confirmação não vier, o mesmo lote sai de novo, com o
     * mesmo id.
     */
    /*
     * O lote pendente também é guardado: se a TV recarregar entre enviar e
     * receber a confirmação, ela precisa reenviar o MESMO id — um id novo
     * para as mesmas linhas seria contagem em dobro no servidor.
     */
    let pendente = null;
    try {
      const salvo = JSON.parse(ler(CHAVE_LOTE) || 'null');
      if (salvo && salvo.lote && Array.isArray(salvo.ids)) {
        const ids = salvo.ids.filter((id) => linhas[id]);
        if (ids.length) pendente = { lote: salvo.lote, ids, itens: ids.map((id) => linhas[id]) };
      }
    } catch (e) { pendente = null; }

    function lote() {
      if (pendente) return pendente;
      const horaAtual = Math.floor(agora() / HORA) * HORA;
      const itens = Object.keys(linhas).filter((id) => linhas[id].hora < horaAtual).slice(0, 500);
      if (!itens.length) return null;
      pendente = {
        lote: 'L' + agora().toString(36) + Math.random().toString(36).slice(2, 8),
        ids: itens,
        itens: itens.map((id) => linhas[id]),
      };
      try { guardar(CHAVE_LOTE, JSON.stringify({ lote: pendente.lote, ids: pendente.ids })); } catch (e) {}
      return pendente;
    }
    function confirmar(l) {
      if (!l || l !== pendente) return;
      for (const id of l.ids) delete linhas[id];
      pendente = null;
      try { guardar(CHAVE_LOTE, 'null'); } catch (e) {}
      persistir();
    }

    return { iniciar, lote, confirmar, _linhas: () => linhas };
  }

  const api = { criar, chaveDoItem, rotuloDoItem, HORA, MAX_LINHAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.MTExibicoes = api;
})(typeof window !== 'undefined' ? window : globalThis);
