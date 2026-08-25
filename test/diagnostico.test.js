/*
 * Estado do sistema.
 *
 * Estes testes guardam sobretudo o TEXTO. Um diagnóstico que diz "STORAGE não
 * definido" não ajuda ninguém que não escreveu o código; o que ajuda é "toda
 * imagem enviada some no próximo deploy". A frase é o produto aqui, tanto
 * quanto a verificação.
 */
const test = require('node:test');
const assert = require('node:assert');

const D = require('../server/diagnostico.js');

const NUVEM = { RAILWAY_ENVIRONMENT: 'production' };
const acha = (r, id) => r.itens.find((i) => i.id === id);

/* ---------------- Armazenamento ---------------- */

test('disco efêmero na nuvem é crítico, e diz o que se perde', () => {
  /*
   * É a falha mais perigosa do sistema porque é silenciosa: tudo funciona no
   * dia do deploy e a arte some no seguinte. Se este teste cair, alguém
   * rebaixou o aviso que impede o cliente de perder o trabalho dele.
   */
  const item = D.armazenamento(NUVEM);
  assert.equal(item.nivel, 'critico');
  assert.match(item.consequencia, /somem no próximo deploy/i);
  assert.match(item.resolver, /R2|volume/i);
});

test('bucket configurado é ok', () => {
  const item = D.armazenamento({ ...NUVEM, STORAGE: 's3', S3_ENDPOINT: 'https://x', S3_BUCKET: 'mt', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 'b' });
  assert.equal(item.nivel, 'ok');
  assert.match(item.estado, /mt/);
});

test('STORAGE=s3 sem chave é crítico — o servidor nem sobe', () => {
  const item = D.armazenamento({ ...NUVEM, STORAGE: 's3', S3_BUCKET: 'mt' });
  assert.equal(item.nivel, 'critico');
  assert.match(item.estado, /S3_ENDPOINT/);
});

test('volume montado resolve o deploy, e o texto não promete mais que isso', () => {
  const item = D.armazenamento({ ...NUVEM, RAILWAY_VOLUME_MOUNT_PATH: '/data' });
  assert.equal(item.nivel, 'ok');
  assert.match(item.consequencia, /não sobrevive a trocar de máquina/i);
});

test('disco local em desenvolvimento não assusta ninguém', () => {
  assert.equal(D.armazenamento({}).nivel, 'ok');
});

/* ---------------- Banco ---------------- */

test('SQLite em disco efêmero é crítico; dentro do volume é só atenção', () => {
  assert.equal(D.banco(NUVEM).nivel, 'critico');
  assert.match(D.banco(NUVEM).consequencia, /somem no próximo deploy/i);
  const comVolume = D.banco({ ...NUVEM, RAILWAY_VOLUME_MOUNT_PATH: '/data' });
  assert.equal(comVolume.nivel, 'atencao');
  assert.match(comVolume.consequencia, /uma instância/i);
});

test('Postgres é ok', () => {
  assert.equal(D.banco({ ...NUVEM, DATABASE_URL: 'postgres://x' }).nivel, 'ok');
});

/* ---------------- IA, e-mail, endereço, jurídico ---------------- */

test('sem chave de IA é atenção, e o texto diz o que CONTINUA funcionando', () => {
  /*
   * É o mesmo princípio do bloqueio por falta de crédito: sem IA a tela
   * continua no ar. Um aviso que não diz isso faz o cliente achar que o
   * produto inteiro parou.
   */
  const item = D.ia({});
  assert.equal(item.nivel, 'atencao');
  assert.match(item.consequencia, /editor.*telas.*publicação|continuam inteiros/i);
  assert.equal(D.ia({ GEMINI_API_KEY: 'x' }).nivel, 'ok');
});

test('sem e-mail, ninguém se cadastra — e antes era só senha e convite', () => {
  /*
   * Este teste exigia 'atenção', e exigia certo NA ÉPOCA: sem provedor
   * perdia-se a recuperação de senha e o convite de equipe, que doem e não
   * trancam. Depois o cadastro passou a criar a conta só quando a pessoa
   * clica no link de confirmação — e aí a falta de e-mail deixou de ser
   * incômodo e virou porta trancada.
   *
   * Mudou o produto, muda o teste. O que não pode é o teste continuar
   * afirmando o mundo antigo e dando verde para um problema que engoliu.
   */
  const item = D.email({});
  assert.equal(item.nivel, 'critico');
  assert.match(item.consequencia, /ninguém consegue se cadastrar/i);

  // Com a saída deliberada, volta a ser o problema de antes: dói, não tranca.
  const comSaida = D.email({ SKIP_VERIFY: '1' });
  assert.equal(comSaida.nivel, 'atencao');
  assert.match(comSaida.consequencia, /senha|convite/i);
});

test('provedor de e-mail sem remetente também é problema', () => {
  const item = D.email({ RESEND_API_KEY: 'x' });
  assert.equal(item.nivel, 'atencao');
  assert.match(item.resolver, /MAIL_FROM/);
  assert.equal(D.email({ RESEND_API_KEY: 'x', MAIL_FROM: 'a@b.com' }).nivel, 'ok');
});

test('APP_URL ausente ou sem https', () => {
  assert.equal(D.endereco({}).nivel, 'atencao');
  assert.equal(D.endereco({ APP_URL: 'http://x.com' }).nivel, 'atencao');
  assert.equal(D.endereco({ APP_URL: 'https://x.com' }).nivel, 'ok');
});

test('jurídico não revisado é atenção, e explica quando o cliente vê o aviso', () => {
  const item = D.juridico({});
  assert.equal(item.nivel, 'atencao');
  assert.match(item.consequencia, /aceitar/i);
  assert.equal(D.juridico({ LEGAL_REVISADO: 'true' }).nivel, 'atencao', 'revisado sem contato ainda pede contato');
  assert.equal(D.juridico({ LEGAL_REVISADO: 'true', SUPPORT_EMAIL: 'a@b.com' }).nivel, 'ok');
});

/* ---------------- O conjunto ---------------- */

test('o que dói primeiro aparece primeiro', () => {
  // Quem abre esta tela quer saber o que consertar agora.
  const r = D.diagnosticar(NUVEM);
  const niveis = r.itens.map((i) => i.nivel);
  assert.deepEqual(niveis, [...niveis].sort((a, b) => ({ critico: 0, atencao: 1, ok: 2 })[a] - ({ critico: 0, atencao: 1, ok: 2 })[b]));
  assert.equal(r.itens[0].nivel, 'critico');
});

test('o resumo fala de perda quando há perda', () => {
  const r = D.diagnosticar(NUVEM);
  assert.equal(r.nivel, 'critico');
  assert.match(r.resumo, /perder trabalho/i);
});

test('produção bem configurada não inventa problema', () => {
  const r = D.diagnosticar({
    RAILWAY_ENVIRONMENT: 'production',
    STORAGE: 's3', S3_ENDPOINT: 'https://x', S3_BUCKET: 'mt', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 'b',
    DATABASE_URL: 'postgres://x',
    GEMINI_API_KEY: 'k',
    RESEND_API_KEY: 'r', MAIL_FROM: 'oi@multitelas.com',
    APP_URL: 'https://app.multitelas.com',
    LEGAL_REVISADO: 'true', SUPPORT_EMAIL: 'suporte@multitelas.com',
    // Entraram aqui quando a cobrança passou a ser verificada. Produção sem
    // chave do Asaas NÃO é "bem configurada": o checkout roda simulado e
    // libera o plano de graça — este cenário só falhou porque estava certo.
    ASAAS_API_KEY: 'a', ASAAS_WEBHOOK_TOKEN: 'w',
  });
  assert.equal(r.nivel, 'ok');
  assert.equal(r.criticos, 0);
  assert.equal(r.atencoes, 0);
  assert.equal(r.resumo, 'Tudo configurado.');
});

test('toda verificação responde as três perguntas', () => {
  // O que está acontecendo, o que isso causa, e o que fazer. A do meio é a
  // que costuma faltar, e é a que faz alguém agir.
  for (const env of [{}, NUVEM, { ...NUVEM, DATABASE_URL: 'x', GEMINI_API_KEY: 'y' }]) {
    for (const item of D.diagnosticar(env).itens) {
      assert.ok(item.titulo, 'item sem título');
      assert.ok(item.estado, item.id + ': sem estado');
      assert.ok(item.consequencia, item.id + ': sem consequência — é a parte que faz alguém agir');
      if (item.nivel !== 'ok') assert.ok(item.resolver, item.id + ': problema sem saída');
    }
  }
});

/* ---------------- Cobrança ---------------- */

test('sem chave do Asaas, a cobrança é problema CRÍTICO', () => {
  /*
   * O diagnóstico cobria armazenamento, banco, IA, e-mail, endereço e
   * jurídico — e pulava o dinheiro, que ficou de fora na troca de provedor.
   * Sem chave o checkout roda em modo SIMULADO: a página diz "pagamento de
   * teste" e libera o plano de graça. É ótimo para desenvolver e é ruína em
   * produção, porque PARECE que funcionou.
   */
  const r = D.pagamento({});
  assert.equal(r.nivel, 'critico');
  assert.match(r.consequencia, /sem pagar/i);
});

test('chave sem token de webhook é crítico — dinheiro entra, produto não', () => {
  /*
   * A metade que ninguém lembra de conferir. Criar a assinatura funciona, o
   * cliente paga, e o aviso de pagamento é RECUSADO por falta do token: o
   * plano nunca é liberado. A falha só aparece depois do dinheiro ter saído
   * da conta de alguém.
   */
  const r = D.pagamento({ ASAAS_API_KEY: 'x' });
  assert.equal(r.nivel, 'critico');
  assert.match(r.estado, /webhook/i);
});

test('sandbox é aviso, não erro — e diz que nada é cobrado', () => {
  const r = D.pagamento({ ASAAS_API_KEY: 'x', ASAAS_WEBHOOK_TOKEN: 'y', ASAAS_AMBIENTE: 'sandbox' });
  assert.equal(r.nivel, 'atencao');
  assert.match(r.consequencia, /nenhuma cobrança é real/i);
  assert.equal(D.pagamento({ ASAAS_API_KEY: 'x', ASAAS_WEBHOOK_TOKEN: 'y' }).nivel, 'ok');
});

test('a cobrança entra na lista geral, não só como função solta', () => {
  // Uma verificação que existe e não é chamada é pior que não existir: dá a
  // impressão de que está coberta.
  assert.ok(D.diagnosticar({}).itens.some((i) => i.id === 'pagamento'),
    'a cobrança não aparece no diagnóstico');
});
