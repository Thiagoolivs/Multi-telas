/*
 * js/primeira-tv.js — "SUA PRIMEIRA TV EM 5 MINUTOS": os passos, os
 * negócios e o progresso guardado. É o registro que o servidor (a rota que
 * guarda o progresso, server/routes/primeira-tv.js) e o painel (a página,
 * web/src/lib/primeiraTv.js) leem: um lugar só decide o que é um progresso
 * válido. Módulo duplo: require() no Node, MTPrimeiraTv no navegador.
 *
 * Não roda na TV, mas fica em ES2017 como os vizinhos (js/perfil.js).
 *
 * O dono (06/11): quem abre o produto monta a TV em uns 5 minutos.
 *   1. Seu negócio      (≈30 s)  um toque
 *   2. Sua marca        (≈1 min) o logo ou o site, e as cores
 *   3. Ligar a TV       (≈30 s)  o código da TV (ou "Fazer isso depois")
 *   4. Escolher a tela  (≈30 s)  três telas prontas do negócio, um toque
 *   5. Fotos e textos   (≈2 min) só o que importa
 *   6. Horário          (≈30 s)  um toque
 *   7. Pôr na TV                 um botão
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPrimeiraTv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PASSOS = ['negocio', 'marca', 'tv', 'tela', 'fotos', 'horario', 'pronto'];
  var NOME_DO_PASSO = {
    negocio: 'Seu negócio', marca: 'Sua marca', tv: 'Ligar a TV', tela: 'Escolher a tela',
    fotos: 'Fotos e textos', horario: 'Horário', pronto: 'Pôr na TV',
  };

  /*
   * Os negócios: a frente (js/perfil.js), o ramo da Marca (js/paletas.js,
   * RAMOS) e as marcas de exemplo das peças-ouro que servem a ele (as mesmas
   * de web/src/lib/modelosOuro.js, MARCAS_DO_RAMO, com o negócio primeiro).
   * `foto` completa "Ponha a foto ...". "Outro" não mexe no ramo da conta.
   */
  var NEGOCIOS = [
    { id: 'padaria', nome: 'Padaria', frente: 'comercio', ramo: 'padaria', marcas: ['padaria'], foto: 'do seu pão ou do seu café' },
    { id: 'restaurante', nome: 'Restaurante', frente: 'comercio', ramo: 'comida', marcas: ['restaurante', 'lanchonete', 'padaria'], foto: 'do seu prato' },
    { id: 'lanchonete', nome: 'Lanchonete', frente: 'comercio', ramo: 'comida', marcas: ['lanchonete', 'restaurante', 'padaria'], foto: 'do seu lanche' },
    { id: 'otica', nome: 'Ótica', frente: 'comercio', ramo: 'otica', marcas: ['otica'], foto: 'dos seus óculos' },
    { id: 'salao', nome: 'Salão de beleza', frente: 'comercio', ramo: 'beleza', marcas: ['salao'], foto: 'do seu trabalho' },
    { id: 'farmacia', nome: 'Farmácia', frente: 'saude', ramo: 'saude', marcas: ['farmacia', 'clinica'], foto: 'da sua farmácia' },
    { id: 'clinica', nome: 'Clínica', frente: 'saude', ramo: 'saude', marcas: ['clinica'], foto: 'da sua clínica' },
    { id: 'dentista', nome: 'Dentista', frente: 'saude', ramo: 'saude', marcas: ['dentista', 'clinica'], foto: 'do seu consultório' },
    { id: 'escritorio', nome: 'Escritório', frente: 'empresa', ramo: 'corporativo', marcas: ['escritorio', 'rotasul'], foto: 'da sua equipe' },
    { id: 'industria', nome: 'Indústria', frente: 'empresa', ramo: 'corporativo', marcas: ['industria', 'rotasul'], foto: 'da sua fábrica' },
    { id: 'outro', nome: 'Outro negócio', frente: '', ramo: '', marcas: [], foto: 'do seu produto' },
  ];

  /*
   * Os horários de sempre, num toque. Dias: 0 = domingo (o mesmo de
   * server/vigia.js). Início igual ao fim é "24 horas" (HorarioDaTela.jsx).
   */
  var HORARIOS = [
    { id: 'semana', nome: 'Segunda a sexta', detalhe: 'das 8h às 18h', dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00' },
    { id: 'comercio', nome: 'Segunda a sábado', detalhe: 'das 7h às 20h', dias: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '20:00' },
    { id: '24h', nome: 'Todos os dias', detalhe: '24 horas', dias: [0, 1, 2, 3, 4, 5, 6], inicio: '00:00', fim: '00:00' },
  ];
  // Fora do horário a TV mostra só o relógio, a não ser que a pessoa escolha outra coisa.
  var FORA = ['relogio', 'preta', 'ligada'];
  var HORARIO_PADRAO = { preset: 'comercio', dias: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '20:00', foraDoHorario: 'relogio' };

  var proprio = Object.prototype.hasOwnProperty;
  function negocio(id) {
    for (var i = 0; i < NEGOCIOS.length; i++) if (NEGOCIOS[i].id === id) return NEGOCIOS[i];
    return null;
  }
  // O ramo que a escolha dá à conta ('' = não escolheu, ou "Outro": vale o que a Marca deduz).
  function ramoDoNegocio(id) { var n = negocio(id); return (n && n.ramo) || ''; }

  var texto = function (v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : ''; };
  var hora = function (v, padrao) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : padrao; };
  var umDe = function (v, lista, padrao) { return lista.indexOf(v) >= 0 ? v : padrao; };

  function normalizarHorario(h) {
    if (!h || typeof h !== 'object') return null;
    var dias = Array.isArray(h.dias) ? h.dias.filter(function (d, i, t) { return Number.isInteger(d) && d >= 0 && d <= 6 && t.indexOf(d) === i; }).sort() : [];
    if (!dias.length) return null;
    var ids = HORARIOS.map(function (x) { return x.id; }).concat('outro');
    return {
      preset: umDe(h.preset, ids, 'outro'), dias: dias,
      inicio: hora(h.inicio, '08:00'), fim: hora(h.fim, '18:00'),
      foraDoHorario: umDe(h.foraDoHorario, FORA, 'relogio'),
    };
  }

  // Os textos e fotos do passo 5: { nome do campo: valor }, curtos e com teto.
  function normalizarCampos(c) {
    var saida = {};
    if (!c || typeof c !== 'object' || Array.isArray(c)) return saida;
    var n = 0;
    for (var k in c) {
      if (!proprio.call(c, k) || n >= 16 || !/^[a-z][a-z0-9-]{0,39}$/.test(k)) continue;
      var v = texto(c[k], 500);
      if (!v) continue;
      saida[k] = v;
      n++;
    }
    return saida;
  }

  /*
   * O progresso guardado, limpo: o que vem do painel (ou de uma versão
   * velha dele) nunca vira lixo no banco. Sem progresso, o começo.
   *
   *   passo     onde a pessoa está ('negocio' … 'pronto')
   *   feitos    os passos que ela concluiu; pulados, os que deixou para depois
   *   negocio   o id do negócio (NEGOCIOS)
   *   tv        a TV escolhida ou ligada no passo 3 ('' = nenhuma ainda)
   *   tela      a tela escolhida no passo 4 (o id da tela pronta, ou "montada:…")
   *   campos    os textos e fotos do passo 5
   *   horario   o do passo 6 (null = ainda não escolheu)
   *   fim       { em, pendente } quando foi para a TV (pendente: virou pedido de aprovação)
   *   saiu      a pessoa saiu antes do fim: o painel não abre sozinho de novo
   */
  function normalizar(bruto) {
    var b = bruto && typeof bruto === 'object' ? bruto : {};
    var listaDePassos = function (l) {
      return (Array.isArray(l) ? l : []).filter(function (p, i, t) { return PASSOS.indexOf(p) >= 0 && t.indexOf(p) === i; });
    };
    var fim = b.fim && typeof b.fim === 'object' && Number(b.fim.em) > 0
      ? { em: Number(b.fim.em), pendente: !!b.fim.pendente } : null;
    return {
      versao: 1,
      passo: umDe(b.passo, PASSOS, 'negocio'),
      feitos: listaDePassos(b.feitos),
      pulados: listaDePassos(b.pulados),
      negocio: negocio(b.negocio) ? b.negocio : '',
      tv: texto(b.tv, 60),
      tela: texto(b.tela, 120),
      campos: normalizarCampos(b.campos),
      horario: normalizarHorario(b.horario),
      fim: fim,
      saiu: !!b.saiu,
      comecouEm: Number(b.comecouEm) > 0 ? Number(b.comecouEm) : 0,
    };
  }

  function inicial(agora) { return Object.assign(normalizar({}), { comecouEm: Number(agora) || 0 }); }

  /*
   * Onde retomar: o passo guardado, a não ser que um passo de antes tenha
   * ficado sem fazer nem pular (progresso de outra versão). Terminado, é o
   * último ("Pronto").
   */
  function passoParaRetomar(estado) {
    var e = normalizar(estado);
    if (e.fim) return 'pronto';
    var i = PASSOS.indexOf(e.passo);
    for (var j = 0; j < i; j++) {
      var p = PASSOS[j];
      if (e.feitos.indexOf(p) < 0 && e.pulados.indexOf(p) < 0) return p;
    }
    return e.passo;
  }

  var semItem = function (lista, p) { return lista.filter(function (x) { return x !== p; }); };
  var proximo = function (p) { return PASSOS[Math.min(PASSOS.indexOf(p) + 1, PASSOS.length - 1)]; };

  // Concluiu o passo `p` com `dados` (os campos do estado que ele muda): vai para o seguinte.
  function concluir(estado, p, dados) {
    var e = normalizar(Object.assign({}, normalizar(estado), dados || {}));
    e.feitos = semItem(e.feitos, p).concat(p);
    e.pulados = semItem(e.pulados, p);
    e.passo = proximo(p);
    e.saiu = false;
    return normalizar(e);
  }

  // "Fazer isso depois": o passo fica para depois, e a pessoa segue.
  function pular(estado, p) {
    var e = normalizar(estado);
    e.pulados = semItem(e.pulados, p).concat(p);
    e.feitos = semItem(e.feitos, p);
    e.passo = proximo(p);
    return normalizar(e);
  }

  // Voltar um passo (o que já foi feito fica guardado).
  function voltar(estado) {
    var e = normalizar(estado);
    e.passo = PASSOS[Math.max(PASSOS.indexOf(e.passo) - 1, 0)];
    return normalizar(e);
  }

  // Foi para a TV (ou virou pedido): terminado.
  function terminar(estado, pendente, agora) {
    var e = concluir(estado, 'pronto');
    e.passo = 'pronto';
    e.fim = { em: Number(agora) || 1, pendente: !!pendente };
    return normalizar(e);
  }

  // "Montar a TV de novo": recomeça, guardando o negócio (as outras respostas mudam com a TV).
  function deNovo(estado, agora) {
    var e = normalizar(estado);
    return Object.assign(inicial(agora), { negocio: e.negocio });
  }

  return {
    PASSOS: PASSOS, NOME_DO_PASSO: NOME_DO_PASSO, NEGOCIOS: NEGOCIOS, HORARIOS: HORARIOS, FORA: FORA, HORARIO_PADRAO: HORARIO_PADRAO,
    negocio: negocio, ramoDoNegocio: ramoDoNegocio, normalizar: normalizar, normalizarHorario: normalizarHorario,
    inicial: inicial, passoParaRetomar: passoParaRetomar, concluir: concluir, pular: pular, voltar: voltar,
    terminar: terminar, deNovo: deNovo,
  };
});
