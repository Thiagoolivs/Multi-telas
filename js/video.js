/*
 * js/video.js — o vídeo aguenta um TV Box? Uma regra só (EXECUTOR, item 12).
 *
 * O box de entrada toca bem MP4 em H.264 até 1080p, com bitrate moderado.
 * HEVC (o padrão do iPhone e de muito celular novo) e AV1 ele muitas vezes
 * nem abre; 4K e 30 Mbps ele abre e engasga. A normalização no servidor
 * (converter para H.264 1080p) precisa de ffmpeg, que é infra — até lá, o
 * upload AVISA, com o motivo, e não proíbe.
 *
 * O codec sai dos BYTES do arquivo, e não do navegador: o Chrome do
 * computador toca HEVC em muita máquina, e "tocou aqui" não diz nada sobre o
 * box. No MP4/MOV o codec é uma etiqueta de 4 letras na caixa `stsd`
 * (avc1, hvc1, av01…); no WebM é o CodecID (V_VP9, V_AV1…). A caixa pode
 * estar no começo ou no fim do arquivo (MP4 sem "faststart"), por isso quem
 * lê passa o começo E o fim.
 *
 * Módulo duplo: require() no Node, MTVideo no navegador — quando o ffmpeg
 * chegar, o servidor decide quem converter pela MESMA régua.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTVideo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // O que um box de entrada aguenta sem engasgar.
  var LIMITES = { ladoMaior: 1920, mbps: 10, mb: 150 };

  // Etiquetas de codec, como aparecem nos bytes (ASCII).
  var ETIQUETAS = [
    ['h264', 'avc1'], ['h264', 'avc3'],
    ['hevc', 'hvc1'], ['hevc', 'hev1'],
    ['av1', 'av01'], ['av1', 'V_AV1'],
    ['vp9', 'vp09'], ['vp9', 'V_VP9'],
    ['vp8', 'vp08'], ['vp8', 'V_VP8'],
  ];
  // Os que muitos box não decodificam.
  var NAO_TOCA = { hevc: 'H.265 (HEVC)', av1: 'AV1' };

  /*
   * O codec do vídeo, ou '' se não achou. Recebe um ou mais pedaços
   * (Uint8Array): o começo e o fim do arquivo. Vale a etiqueta que aparece
   * PRIMEIRO em cada pedaço — o texto de um metadado não vence a caixa.
   */
  function codecNosBytes(pedacos) {
    var lista = Array.isArray(pedacos) ? pedacos : [pedacos];
    for (var p = 0; p < lista.length; p++) {
      var b = lista[p];
      if (!b || !b.length) continue;
      var melhor = -1, codec = '';
      // A caixa ftyp do começo lista "marcas compatíveis" — e avc1 pode estar
      // lá num arquivo que nem é H.264. Pula ela.
      var de = b.length > 8 && texto(b, 4, 4) === 'ftyp' ? ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0 : 0;
      for (var e = 0; e < ETIQUETAS.length; e++) {
        var i = indice(b, ETIQUETAS[e][1], de);
        if (i >= 0 && (melhor < 0 || i < melhor)) { melhor = i; codec = ETIQUETAS[e][0]; }
      }
      if (codec) return codec;
    }
    return '';
  }

  function texto(b, de, n) {
    var s = '';
    for (var i = de; i < de + n && i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  function indice(b, alvo, de) {
    var t0 = alvo.charCodeAt(0), n = alvo.length;
    for (var i = de || 0; i + n <= b.length; i++) {
      if (b[i] !== t0) continue;
      var ok = true;
      for (var j = 1; j < n; j++) if (b[i + j] !== alvo.charCodeAt(j)) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  }

  /*
   * O veredito, com o motivo em português de lojista.
   *   info: { bytes, largura, altura, duracao (s), codec }
   * Medida que falta (0 ou '') não acusa nada: só avisa o que foi medido.
   */
  function avaliar(info) {
    var x = info || {};
    var bytes = Number(x.bytes) || 0;
    var lado = Math.max(Number(x.largura) || 0, Number(x.altura) || 0);
    var duracao = Number(x.duracao) || 0;
    var mbps = duracao > 0 && bytes > 0 ? (bytes * 8) / duracao / 1e6 : 0;
    var motivos = [];
    if (NAO_TOCA[x.codec]) motivos.push('está em ' + NAO_TOCA[x.codec] + ', que muitos TV Box não tocam');
    if (lado > LIMITES.ladoMaior) motivos.push('é maior que Full HD (' + x.largura + '×' + x.altura + ')');
    if (mbps > LIMITES.mbps) motivos.push('é pesado demais por segundo (' + Math.round(mbps) + ' Mbps)');
    if (bytes > LIMITES.mb * 1024 * 1024) motivos.push('tem ' + Math.round(bytes / 1024 / 1024) + ' MB');
    return {
      codec: x.codec || '',
      mbps: Math.round(mbps * 10) / 10,
      motivos: motivos,
      pesado: motivos.length > 0,
      aviso: motivos.length
        ? 'Pode engasgar no TV Box: o vídeo ' + juntar(motivos) + '. Ele vai assim mesmo; se travar, '
          + 'salve em MP4 (H.264) até 1080p — no celular, a opção "Mais compatível" da câmera resolve.'
        : '',
    };
  }

  function juntar(xs) {
    if (xs.length < 2) return xs.join('');
    return xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1];
  }

  return { LIMITES: LIMITES, codecNosBytes: codecNosBytes, avaliar: avaliar };
});
