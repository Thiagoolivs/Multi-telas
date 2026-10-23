/*
 * js/perfil.js — o perfil da conta: Empresa, Comércio ou Saúde.
 *
 * O dono: um produto só, com as nuances de cada nicho (EXECUTOR D4). No
 * teste de uso de 23/10 uma metalúrgica abriu o painel e viu "Promoção com
 * preço", "pão de queijo", "Onde fica a loja" e "Campanha com desconto 20%".
 * O perfil decide os começos do Início e do Criar (de 10 a 12, D17), o exemplo da caixa
 * de texto, como o painel chama o lugar ("empresa", "loja", "clínica") e a
 * peça de amostra das paletas. A IA também lê o perfil (ai-conversa).
 *
 * Deduzido do ramo no cadastro (js/paletas.js, detectarRamo) e editável em
 * Ajustes. Módulo duplo: require() no Node, MTPerfil no navegador.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPerfil = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PERFIS = {
    empresa: {
      id: 'empresa', nome: 'Empresa', descricao: 'Comunicação interna: avisos, RH, indicadores.',
      lugar: 'empresa', lugarDe: 'da empresa',
      opcoes: ['aviso', 'comunicado', 'aniversario', 'boasvindas', 'indicador', 'seguranca', 'evento', 'vaga', 'agradecimento', 'valores', 'horario', 'cardapio'],
      exemplo: 'Ex.: avisar que o refeitório fecha mais cedo na sexta, na TV do refeitório',
      paraIA: 'Empresa: comunicação interna, para quem trabalha lá (avisos, RH, segurança, metas). Não fale de preço, oferta ou cliente comprando, a menos que peçam.',
    },
    comercio: {
      id: 'comercio', nome: 'Comércio', descricao: 'Loja, restaurante, serviço: ofertas e novidades.',
      lugar: 'loja', lugarDe: 'da loja',
      opcoes: ['promocao', 'novidade', 'cardapio', 'foto', 'horario', 'aviso', 'evento', 'instagram', 'depoimento', 'pagamento', 'wifi', 'aniversario'],
      exemplo: 'Ex.: quero divulgar o pão de queijo em dobro à tarde, na TV e no Instagram',
      paraIA: 'Comércio: fala com clientes (ofertas, novidades, horário, redes sociais).',
    },
    saude: {
      id: 'saude', nome: 'Saúde', descricao: 'Clínica, consultório, farmácia: orientação e serviços.',
      lugar: 'clínica', lugarDe: 'da clínica',
      opcoes: ['aviso', 'dica', 'servicos', 'prevencao', 'horario', 'convenios', 'evento', 'depoimento', 'instagram', 'wifi', 'aniversario'],
      exemplo: 'Ex.: lembrar que a vacina da gripe chegou, na TV da recepção',
      paraIA: 'Saúde: fala com pacientes na sala de espera (orientação, serviços, prevenção). Sem promessa de cura, sem desconto agressivo, tom acolhedor.',
    },
  };

  // Do ramo que js/paletas.js deduz para o perfil.
  var DO_RAMO = { corporativo: 'empresa', saude: 'saude' };

  function normalizar(id) { return PERFIS[id] ? id : 'comercio'; }
  function deduzir(ramo) { return DO_RAMO[ramo] || 'comercio'; }
  function de(id) { return PERFIS[normalizar(id)]; }

  return { PERFIS: PERFIS, IDS: Object.keys(PERFIS), normalizar: normalizar, deduzir: deduzir, de: de };
});
