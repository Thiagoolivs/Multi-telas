/*
 * O que estes testes protegem: a política precisa dizer a verdade sobre para
 * onde os dados vão, e o aceite só prova alguma coisa se guardar QUAL versão
 * foi aceita. Texto de política costuma envelhecer calado — aqui ele quebra o
 * teste quando deixa de bater com o sistema.
 */
const test = require('node:test');
const assert = require('node:assert');
const legal = require('../server/legal');

test('a versão dos termos existe e é uma data', () => {
  assert.match(legal.VERSAO, /^\d{4}-\d{2}-\d{2}$/);
});

test('as duas páginas saem como HTML completo', () => {
  for (const html of [legal.termosHtml(), legal.privacidadeHtml()]) {
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.includes(legal.VERSAO), 'a página precisa mostrar a versão vigente');
  }
});

test('a política declara todos os serviços que recebem dados', () => {
  const html = legal.privacidadeHtml();
  for (const s of legal.SUBOPERADORES) {
    assert.ok(html.includes(s.nome), 'faltou declarar ' + s.nome);
  }
});

test('a política avisa que imagens são enviadas ao Google', () => {
  const html = legal.privacidadeHtml();
  assert.ok(/imagens são enviadas ao Google/i.test(html),
    'o envio de imagem para a IA é compartilhamento e precisa estar escrito');
});

test('os termos põem o cliente como controlador dos dados dos funcionários', () => {
  const html = legal.termosHtml();
  assert.ok(/Você é o controlador/i.test(html));
  assert.ok(/operador/i.test(html));
});

test('os termos avisam que o resultado da IA pode estar errado', () => {
  assert.ok(/erros, imprecisões ou afirmações falsas/i.test(legal.termosHtml()));
});

test('enquanto não houver revisão jurídica, a página avisa que é rascunho', () => {
  assert.ok(legal.privacidadeHtml().includes('Rascunho'),
    'sem LEGAL_REVISADO=true o aviso tem que aparecer');
});

test('as duas páginas apontam o contato do encarregado', () => {
  assert.ok(legal.privacidadeHtml().includes(legal.CONTATO));
});
