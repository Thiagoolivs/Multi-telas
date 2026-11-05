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

/*
 * QA de lançamento, 03/11: o aviso dizia ao CLIENTE "Rascunho. Não use como
 * peça contratual definitiva", o que esvazia o aceite. Agora o alerta inteiro
 * é do operador (/sistema, server/diagnostico.js) e o cliente vê uma nota
 * honesta: vale como está, está em revisão, mudança é avisada antes.
 */
test('enquanto não houver revisão jurídica, a página diz que está em revisão — sem desdizer o aceite', () => {
  for (const html of [legal.termosHtml({}), legal.privacidadeHtml({})]) {
    assert.match(html, /em revisão jurídica/);
    assert.match(html, /vale como está escrita/);
    assert.doesNotMatch(html, /Rascunho|não use como peça contratual/i);
  }
  assert.doesNotMatch(legal.termosHtml({ LEGAL_REVISADO: 'true' }), /em revisão jurídica/, 'revisado, a nota sai');
});

test('o contato e o encarregado vêm do ambiente, nunca de um e-mail pessoal fixo', () => {
  const sem = legal.privacidadeHtml({});
  assert.doesNotMatch(sem + legal.termosHtml({}), /gmail\.com/i);
  assert.match(sem, /página <b>Suporte<\/b> do painel/, 'sem e-mail, o caminho é o Suporte do painel');
  const env = { SUPPORT_EMAIL: 'suporte@multitelas.net.br', EMAIL_DPO: 'dpo@multitelas.net.br', ENCARREGADO_NOME: 'Fulana de Tal' };
  const com = legal.privacidadeHtml(env);
  assert.ok(com.includes('mailto:suporte@multitelas.net.br'));
  assert.match(com, /Encarregado[\s\S]*Fulana de Tal, <a href="mailto:dpo@multitelas\.net\.br">/);
  assert.equal(legal.fornecedor({ SUPPORT_EMAIL: 'não é e-mail' }).contato, '');
});

test('quem vende aparece nos Termos, na Política e no rodapé quando configurado (Decreto 7.962/2013)', () => {
  const env = { RAZAO_SOCIAL: 'MultiTelas Tecnologia Ltda', CNPJ: '12.345.678/0001-90', ENDERECO: 'Rua Exemplo, 100 — São Paulo/SP', SUPPORT_EMAIL: 'contato@multitelas.net.br' };
  for (const html of [legal.termosHtml(env), legal.privacidadeHtml(env)]) {
    assert.ok(html.includes('MultiTelas Tecnologia Ltda, CNPJ 12.345.678/0001-90, Rua Exemplo, 100 — São Paulo/SP'));
  }
  assert.equal(legal.rodape(env), '© 2026 MultiTelas · MultiTelas Tecnologia Ltda, CNPJ 12.345.678/0001-90, Rua Exemplo, 100 — São Paulo/SP');
  assert.equal(legal.rodape({}), '© 2026 MultiTelas', 'sem variável, nada inventado');
  assert.deepEqual(legal.faltandoFornecedor({}).map((f) => f.variavel), ['RAZAO_SOCIAL', 'CNPJ', 'ENDERECO', 'SUPPORT_EMAIL']);
  assert.ok(legal.rodape({ RAZAO_SOCIAL: '<b>x</b>' }).includes('&lt;b&gt;'), 'o ambiente entra escapado');
});

test('cookies: a política conta o que o site faz — sessão, Google só na página do site, recusado até aceitar', () => {
  const html = legal.privacidadeHtml({});
  assert.doesNotMatch(html, /Não usamos cookies de publicidade nem de análise/, 'a frase que contradizia o GA4 voltou');
  assert.match(html, /id="cookies"/);
  for (const c of ['mt_session', '_ga', '_gcl_au', 'mt_cookies']) assert.ok(html.includes(c), 'faltou o cookie ' + c);
  assert.match(html, /só são gravados se você clicar em "Aceitar"/);
  assert.match(html, /"Recusar"/);
  assert.match(html, /painel<\/b> e a <b>TV<\/b> não têm Google Analytics/);
});

test('termos: arrependimento de 7 dias, cancelamento até o fim do pago e a multa do anual', () => {
  const html = legal.termosHtml({});
  assert.match(html, /arrependimento/i);
  assert.match(html, /<b>7 dias<\/b>/);
  assert.match(html, /art\. 49/);
  assert.match(html, /devolvemos tudo o que foi pago/);
  assert.match(html, /até o fim do período já pago/);
  assert.match(html, /multa de 30% da soma das mensalidades que faltam/);
  assert.match(html, /Com os 12 meses cumpridos, não há multa/);
  // A frente segue o tipo de negócio, e o preço depende dela.
  assert.match(html, /tipo do seu negócio/);
  assert.match(html, /suporte pode reclassificar/);
  // M8: direito de regresso, e não "você nos isenta".
  assert.doesNotMatch(html, /Você nos isenta/);
  assert.match(html, /direito de regresso/);
});

test('política: suboperadores com finalidade, e as fotos de pessoas com base legal e prazo', () => {
  const html = legal.privacidadeHtml({});
  for (const n of ['Google Analytics e Google Ads', 'Google (Gemini API)', 'Anthropic', 'Groq', 'Resend', 'Brevo', 'Asaas', 'Cloudflare R2', 'Railway']) {
    assert.ok(legal.SUBOPERADORES.some((s) => s.nome.includes(n) && s.papel.length > 10), 'suboperador sem finalidade: ' + n);
  }
  // M3: não diz mais que todos ficam fora do Brasil (o Asaas é daqui).
  assert.doesNotMatch(html, /Todos ficam fora do Brasil/);
  assert.match(html, /Resolução CD\/ANPD nº 19\/2024/);
  assert.match(html, /<h2>5\. Fotos de pessoas<\/h2>/);
  assert.match(html, /consentimento/);
  assert.match(html, /Foto sem decisão é apagada em 30 dias/);
  assert.match(html, /30 dias depois da data/);
  assert.match(html, /Acesso do suporte/);
});

test('as páginas legais levam de volta ao site, não só ao painel', () => {
  assert.match(legal.termosHtml({}), /<a href="\/">Voltar ao site<\/a>/);
});
