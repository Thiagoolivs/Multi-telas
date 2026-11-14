/*
 * tools/carga/programa-rh.cjs — a programação de RH de verdade, para medir.
 *
 * O que o "MultiTelas RH" põe numa TV de refeitório ou de corredor: frente
 * Empresas, layout Corporativo (cabeçalho, principal, lateral e rodapé),
 * peças-ouro de gente, comunicado, indicador, segurança e cardápio, duas
 * FOTOS VIVAS (vídeo curto no espaço de foto, pecas-ouro/videos/), transição
 * ligada e as frases do rodapé.
 *
 * Os itens têm o mesmo formato do painel (web/src/lib/modelosOuro.js,
 * itemDoModelo, e telasProntas.js, aplicarTelaPronta): é o que a TV recebe.
 * `duracao` curta acelera o rodízio para o teste de dias caber em horas.
 *
 * Usado pelo teste de carga (carga-tvs.mjs: o tamanho real da config pesa em
 * cada pedido) e pelo teste de resistência da TV (soak-tv.mjs).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../../js/peca-html.js');

const RAIZ = path.join(__dirname, '..', '..');
const MANIFESTO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', 'manifesto.json'), 'utf8'));
const FORMATO = { destaque: '16/9', lateral: '9/16', cabecalho: '16/9', rodape: '16/9' };
const MARCA = { nome: 'Metalúrgica Alfa', cores: ['#23395d', '#f4a261'], fonteTitulo: 'condensada', fonteApoio: 'sans' };

function peca(id, papel, campos, duracao) {
  const m = MANIFESTO.pecas.find((p) => p.id === id);
  if (!m) throw new Error('peça-ouro não encontrada: ' + id);
  const arq = P.doArquivo(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', id + '.html'), 'utf8'));
  const daFrente = (m.textos && m.textos.empresa) || {};
  const espacos = {};
  for (const [nome, p] of Object.entries(m.fotos || {})) espacos[nome] = { papel: p };
  const c = Object.assign({}, daFrente, /data-campo="marca"/.test(arq.html) ? { marca: MARCA.nome } : {}, campos || {});
  return Object.assign({
    type: 'peca-html', versao: 1, papel, html: arq.html, css: arq.css, campos: c,
    marca: { cores: MARCA.cores, fonteTitulo: MARCA.fonteTitulo, fonteApoio: MARCA.fonteApoio },
    modo: 'marca', formato: FORMATO[papel] || '16/9', duracao,
    // O tempo "posto à mão" (js/rodizio.js): sem isto o rodízio põe 1 s por palavra, de 6 a 25 s.
    meta: { duracaoManual: true },
    origem: { motor: 'ouro', base: id, pedido: 'tela pronta', tela: 'carga-rh' },
  }, Object.keys(espacos).length ? { espacos } : {});
}

/*
 * opcoes.duracao: segundos de cada peça do principal (o painel põe 20);
 * opcoes.duracaoLateral: da lateral (o painel põe 12).
 */
function montarProgramaRh(opcoes) {
  const o = opcoes || {};
  const d = o.duracao || 20;
  const dl = o.duracaoLateral || 12;
  const principal = [
    peca('gente-aniversariante', 'destaque', { nome: 'Joana Ribeiro', setor: 'Expedição', recado: 'Parabéns! A equipe deseja um ótimo dia.', foto: '/pecas-ouro/fotos/escritorio/equipe-executiva.jpg' }, d),
    peca('gente-comunicado', 'destaque', { assunto: 'Vacinação contra a gripe', texto: 'Quinta e sexta, das 8h às 16h, no ambulatório. Leve o crachá.', assinatura: 'RH' }, d),
    peca('indicador-meta', 'destaque', { titulo: 'Dias sem acidente', numero: '128', meta: 'meta: 150' }, d),
    // FOTO VIVA 1: o vídeo da solda no espaço de foto (o poster .jpg mora ao lado).
    peca('seguranca-foto', 'destaque', { foto: '/pecas-ouro/videos/industria/solda-faiscas.mp4', titulo: 'Segurança é com todos' }, d),
    peca('indicador-turno', 'destaque', {}, d),
    peca('servico-epi', 'destaque', {}, d),
    peca('cardapio-semana', 'destaque', {}, d),
    // FOTO VIVA 2: a equipe trabalhando.
    peca('institucional-foto', 'destaque', { foto: '/pecas-ouro/videos/escritorio/equipe-trabalhando.mp4', titulo: 'Gente que faz' }, d),
  ];
  const lateral = [
    peca('gente-mes', 'lateral', {}, dl),
    peca('indicador-meta', 'lateral', { titulo: 'Refugo do mês', numero: '1,8', unidade: '%' }, dl),
    peca('cardapio-semana', 'lateral', {}, dl),
  ];
  const cab = peca('cabecalho-classico', 'cabecalho', { chamada: 'Comunicação interna · RH' }, 20);
  const rod = peca('rodape-relogio', 'rodape', { rotulo: 'Avisos' }, 20);
  return {
    version: 1,
    settings: {
      nome: MARCA.nome, layoutId: 'corporate', transicao: o.transicao || 'cinematic',
      cidadeClima: 'São Paulo', coresAdaptativas: true, layoutInteligente: true,
      ...(o.settings || {}),
    },
    zonas: {
      cabecalho: { header: true, clima: false, pecas: [cab], peca: cab },
      principal: { items: principal },
      lateral: { items: lateral },
      rodape: {
        pecas: [rod], peca: rod, conteudo: 'mensagens', movimento: 'manchetes', intervalo: 6,
        messages: [
          'Refeitório: cardápio novo a partir de segunda',
          'Use o crachá em todas as áreas',
          'Ginástica laboral às 15h',
          'Ramal do RH: 2040',
        ],
      },
    },
  };
}

module.exports = { montarProgramaRh, MARCA };
