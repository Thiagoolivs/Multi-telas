/*
 * O Banco de Imagens MultiTelas — o acervo compartilhado entre contas.
 *
 * Compartilhar conteúdo entre clientes diferentes é o tipo de coisa que, feita
 * sem regra, vira notícia ruim. Cada teste aqui corresponde a uma dessas
 * regras, e o motivo está escrito junto: sem o motivo, daqui a três meses
 * viram asserções sem sentido, e asserção sem sentido é a primeira a ser
 * apagada quando atrapalha.
 *
 * Todos foram conferidos AO CONTRÁRIO — a regra foi desligada no código e o
 * teste tinha que falhar. Um teste que passa com o defeito de volta não é
 * teste, é decoração.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../server/db-sqlite.js');
const banco = require('../server/banco.js');
const midia = require('../server/midia.js');
const peca = require('../js/peca.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

// O arquivo do banco é compartilhado entre execuções: e-mail nunca repetido.
const marca = 'bk' + Date.now() + '-' + process.pid;
let n = 0;
async function conta() {
  const r = await db.createAccount(marca + '-' + (n++) + '@exemplo.invalido', 'hash', 'Empresa', 'Dono');
  return r.tenantId;
}
async function imagemDaIA(tenantId, extra) {
  const id = 'md_' + db.rid(10);
  await db.createMedia({
    id, tenantId, name: 'IA · pão francês na bancada', mime: 'image/png', size: 1024,
    key: tenantId + '/' + id + '.png', url: '/media/' + tenantId + '/' + id + '.png',
    origem: 'ia', formato: '16/9', cor: '#c2410c', ...(extra || {}),
  });
  return db.getMedia(id);
}

/* ---------------- Regra 1: só entra o que a IA gerou ---------------- */

test('foto que a pessoa enviou não pode ir para o banco', async () => {
  /*
   * A foto que o cliente subiu pode ter o rosto de um funcionário, o produto
   * de um fornecedor, a marca de um terceiro. Não temos o direito de
   * redistribuir isso — e ele clica no botão sem pensar nessa lista.
   *
   * `origem` já separava os dois casos desde que toda gravação passou a ser
   * registrada (server/midia.js). Aqui isso vira barreira, não só rótulo.
   */
  const t = await conta();
  const enviada = await imagemDaIA(t, { origem: 'upload', name: 'foto-da-equipe.jpg', mime: 'image/jpeg' });

  const veredito = banco.podeOferecer(enviada);
  assert.equal(veredito.ok, false);
  assert.match(veredito.motivo, /gerada pela IA/i);

  const r = await banco.oferecer(db, t, enviada, {});
  assert.equal(r.ok, false);
  assert.equal(r.status, 422);
  assert.equal(await db.bancoPorMedia(enviada.id), null, 'criou linha para uma foto enviada');
});

test('foto do mural também não entra', async () => {
  // Mural é foto de gente, tirada por gente, num evento. Pior caso possível.
  const t = await conta();
  const doMural = await imagemDaIA(t, { origem: 'mural' });
  assert.equal(banco.podeOferecer(doMural).ok, false);
});

test('vídeo não entra: o banco é de imagem', async () => {
  const t = await conta();
  const video = await imagemDaIA(t, { mime: 'video/mp4' });
  const v = banco.podeOferecer(video);
  assert.equal(v.ok, false);
  assert.match(v.motivo, /imagens/i);
});

/* ---------------- Regra 4: nada entra sem moderação ---------------- */

test('o que é oferecido nasce PENDENTE e não aparece no feed', async () => {
  /*
   * O volume no começo é minúsculo e conferir custa quase nada. O custo de
   * UMA imagem errada no feed de trinta clientes não é.
   */
  const t = await conta();
  const m = await imagemDaIA(t);
  const r = await banco.oferecer(db, t, m, { segmento: 'padaria' });
  assert.equal(r.ok, true);
  assert.equal(r.item.estado, 'pendente');

  const feed = await banco.listar(db, {}, t);
  assert.ok(!feed.some((i) => i.id === r.item.id), 'item pendente vazou para o feed');

  const fila = await db.bancoPorEstado('pendente', 100);
  assert.ok(fila.some((i) => i.id === r.item.id), 'não entrou na fila da moderação');
});

test('depois de aprovada, aparece no feed de outra conta', async () => {
  const dono = await conta();
  const outra = await conta();
  const m = await imagemDaIA(dono);
  const r = await banco.oferecer(db, dono, m, { segmento: 'padaria' });
  await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');

  const feed = await banco.listar(db, { termo: 'pão' }, outra);
  const achado = feed.find((i) => i.id === r.item.id);
  assert.ok(achado, 'a imagem aprovada não apareceu para a outra conta');
  assert.equal(achado.minha, false);
  assert.equal(achado.formato, '16/9');
  assert.equal(achado.cor, '#c2410c', 'a cor de origem é o que o duotone precisa');
});

test('recusada não volta para a fila sozinha quando reoferecida', async () => {
  /*
   * Se recusada voltasse a pendente a cada clique, a moderação viraria um jogo
   * de insistência: basta clicar até alguém aprovar por cansaço.
   */
  const t = await conta();
  const m = await imagemDaIA(t);
  const r = await banco.oferecer(db, t, m, {});
  await banco.moderar(db, r.item.id, 'recusada', 'op@multitelas');

  const dinovo = await banco.oferecer(db, t, m, {});
  assert.equal(dinovo.ok, false);
  assert.equal(dinovo.status, 409);
  assert.equal((await db.bancoPorMedia(m.id)).estado, 'recusada');
});

/* ---------------- Regra 3: revogar vale para a FRENTE ---------------- */

test('revogar tira do feed na hora', async () => {
  const dono = await conta();
  const outra = await conta();
  const m = await imagemDaIA(dono);
  const r = await banco.oferecer(db, dono, m, {});
  await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');
  assert.ok((await banco.listar(db, {}, outra)).some((i) => i.id === r.item.id));

  await banco.revogar(db, dono, m.id);
  assert.ok(!(await banco.listar(db, {}, outra)).some((i) => i.id === r.item.id), 'continuou no feed depois de revogada');
  assert.equal((await banco.usar(db, outra, r.item.id)).ok, false, 'revogada ainda pôde ser usada');
});

test('revogar NÃO apaga o arquivo — quem já publicou continua no ar', async () => {
  /*
   * Esta é a regra que mais custa explicar e a que mais importa. Uma TV
   * apagando sozinha por decisão de alguém que o dono dela não conhece é pior
   * que a imagem continuar. Está escrito nos Termos, cláusula 6.
   */
  const t = await conta();
  const m = await imagemDaIA(t);
  const r = await banco.oferecer(db, t, m, {});
  await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');
  await banco.revogar(db, t, m.id);

  const linha = await db.bancoPorMedia(m.id);
  assert.equal(linha.estado, 'revogada');
  assert.ok(linha.url, 'a URL sumiu — a peça de quem já usava ficaria com um buraco');
  assert.ok(linha.key, 'a chave do arquivo sumiu');
});

test('quem revogou pode voltar atrás — e passa pela moderação de novo', async () => {
  const t = await conta();
  const m = await imagemDaIA(t);
  const r = await banco.oferecer(db, t, m, {});
  await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');
  await banco.revogar(db, t, m.id);

  const outra = await banco.oferecer(db, t, m, {});
  assert.equal(outra.ok, true);
  assert.equal((await db.bancoPorMedia(m.id)).estado, 'pendente',
    'voltou direto para o feed sem passar pela conferência');
});

test('a vontade do dono vence a da moderação', async () => {
  // O dono revogou enquanto a fila andava. Aprovar depois disso seria publicar
  // o que ele acabou de tirar.
  const t = await conta();
  const m = await imagemDaIA(t);
  const r = await banco.oferecer(db, t, m, {});
  await banco.revogar(db, t, m.id);
  const mod = await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');
  assert.equal(mod.ok, false);
  assert.equal(mod.status, 409);
});

/* ---------------- O arquivo sobrevive a quem o compartilhou ---------------- */

test('apagar a mídia compartilhada não apaga o arquivo de quem a usa', async () => {
  /*
   * O dono apaga a imagem do Armazenamento dele. Se o arquivo fosse embora, a
   * peça de outra conta — já publicada numa parede — ficaria com um buraco.
   * A linha da mídia sai (some da cota dele); a do banco fica, com a chave e a
   * URL que ela mesma guarda.
   */
  const removidas = [];
  const storage = require('../server/storage.js');
  const originalRemove = storage.remove;
  storage.remove = async (k) => { removidas.push(k); };
  try {
    const t = await conta();
    const compartilhada = await imagemDaIA(t);
    const privada = await imagemDaIA(t);
    const r = await banco.oferecer(db, t, compartilhada, {});
    await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');

    await midia.apagar(db, t, compartilhada.id);
    await midia.apagar(db, t, privada.id);

    assert.ok(!removidas.includes(compartilhada.key), 'apagou o arquivo que outra conta pode estar exibindo');
    assert.ok(removidas.includes(privada.key), 'deixou lixo: a imagem privada devia sumir do storage');
    assert.equal(await db.getMedia(compartilhada.id), null, 'a linha da mídia devia sair da conta de quem apagou');
    assert.ok((await db.bancoPorMedia(compartilhada.id)), 'a linha do banco sumiu junto');
  } finally {
    storage.remove = originalRemove;
  }
});

test('apagar mídia NÃO compartilhada limpa a oferta pendente junto', async () => {
  const t = await conta();
  const m = await imagemDaIA(t);
  await banco.oferecer(db, t, m, {});
  await midia.apagar(db, t, m.id);
  assert.equal(await db.bancoPorMedia(m.id), null, 'ficou oferta pendente apontando para arquivo apagado');
});

test('encerrar a conta guarda o que está aprovado e apaga o resto', async () => {
  const t = await conta();
  const aprovada = await imagemDaIA(t);
  const pendente = await imagemDaIA(t);
  const r = await banco.oferecer(db, t, aprovada, {});
  await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');
  await banco.oferecer(db, t, pendente, {});

  const chaves = await db.apagarTenant(t);
  assert.ok(!chaves.includes(aprovada.key), 'mandou apagar o arquivo que outra conta pode estar exibindo');
  assert.ok(chaves.includes(pendente.key), 'não mandou apagar a imagem que ninguém licenciou');

  const linha = await db.bancoPorId(r.item.id);
  assert.ok(linha, 'a imagem aprovada sumiu do acervo com a conta');
  assert.equal(linha.tenant_id, null, 'a origem tinha que ser desligada junto com a conta');
});

/* ---------------- Isolamento: o que o feed conta e o que esconde ---------------- */

test('o feed nunca devolve a chave do arquivo nem o dono', async () => {
  /*
   * A chave é a ÚNICA barreira de /media/*, uma rota sem autenticação. E de
   * quem é a imagem não é assunto de quem está usando.
   */
  const dono = await conta();
  const outra = await conta();
  const m = await imagemDaIA(dono);
  const r = await banco.oferecer(db, dono, m, {});
  await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');

  const item = (await banco.listar(db, {}, outra)).find((i) => i.id === r.item.id);
  assert.ok(item);
  assert.equal(item.key, undefined, 'vazou a chave do arquivo');
  assert.equal(item.tenant_id, undefined, 'vazou o dono da imagem');
  assert.equal(item.media_id, undefined, 'vazou o id interno da mídia');
  assert.equal(item.mediaId, undefined, 'vazou de qual mídia (e logo de qual conta) a imagem veio');

  // Para o DONO, o id da mídia sai: é como o Armazenamento dele sabe qual card
  // já está compartilhado sem uma chamada por miniatura.
  const minhas = (await db.bancoDoTenant(dono)).map((x) => banco.paraCliente(x, dono));
  assert.equal(minhas[0].mediaId, m.id);
  assert.equal(minhas[0].minha, true);
});

test('não dá para compartilhar a mídia de outra conta', async () => {
  const dono = await conta();
  const intruso = await conta();
  const m = await imagemDaIA(dono);
  const r = await banco.oferecer(db, intruso, m, {});
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
});

test('não dá para revogar o que é de outra conta', async () => {
  const dono = await conta();
  const intruso = await conta();
  const m = await imagemDaIA(dono);
  const r = await banco.oferecer(db, dono, m, {});
  await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');

  assert.equal((await banco.revogar(db, intruso, m.id)).ok, false);
  assert.equal((await db.bancoPorMedia(m.id)).estado, 'aprovada');
});

/* ---------------- Busca e contagem ---------------- */

test('a busca não é engolida pelo prefixo "IA ·"', async () => {
  /*
   * O nome de toda imagem gerada nasce como "IA · <prompt>". Guardado inteiro,
   * todo item do banco começa igual e buscar "ia" traz o acervo inteiro.
   */
  assert.equal(banco.descricaoDe({ name: 'IA · pão francês na bancada' }), 'pão francês na bancada');
  assert.equal(banco.descricaoDe({ name: '' }), 'imagem');
});

test('usar conta o uso — é o que ordena o feed', async () => {
  const dono = await conta();
  const outra = await conta();
  const m = await imagemDaIA(dono);
  const r = await banco.oferecer(db, dono, m, {});
  await banco.moderar(db, r.item.id, 'aprovada', 'op@multitelas');

  await banco.usar(db, outra, r.item.id);
  const depois = await banco.usar(db, outra, r.item.id);
  assert.equal(depois.item.usos, 2);
});

/* ---------------- Duotone ---------------- */

test('duotone troca a cor pelo DESENHO, sem gerar imagem de novo', () => {
  /*
   * A imagem do banco foi gerada na cor da marca de origem (a direção de arte
   * pede monocromia no hex de quem pediu). Reusada crua, a foto laranja da
   * padaria entra numa peça azul de ótica e denuncia que veio de fora.
   * Regerar custaria os mesmos R$ 0,35 e mataria a economia inteira.
   *
   * `luminosity` mantém o claro/escuro da foto e toma matiz e saturação da
   * cor de baixo — é duotone exato, não o hue-rotate que acerta por
   * aproximação.
   */
  const fundo = peca.tintaFundo('/media/a/b.png', '#0b7285');
  assert.equal(fundo.backgroundBlendMode, 'luminosity');
  assert.match(fundo.backgroundImage, /url\("\/media\/a\/b\.png"\), linear-gradient\(#0b7285, #0b7285\)/);

  const img = peca.tintaImagem('#0b7285');
  assert.equal(img.pai.backgroundColor, '#0b7285');
  assert.equal(img.img.mixBlendMode, 'luminosity');
  assert.equal(img.pai.isolation, 'isolate',
    'sem isolar, a mistura vaza para o que estiver atrás e o vizinho fica com a cor errada');
});

test('sem tinta, nada muda — imagem própria não é tingida', () => {
  assert.equal(peca.tintaImagem(''), null);
  assert.equal(peca.tintaImagem('vermelho'), null);
  const semTinta = peca.tintaFundo('/a.png', null);
  assert.equal(semTinta.backgroundBlendMode, undefined);
  assert.equal(semTinta.backgroundImage, 'url("/a.png")');
});

test('tinta inválida não vira CSS quebrado na peça', () => {
  /*
   * O valor vira `mix-blend-mode` contra uma cor de fundo. Um valor torto ali
   * não erra a cor: apaga a imagem.
   */
  const composer = require('../server/composer.js');
  const pal = { texto: '#ffffff', acento: '#ff8800', brand: '#ff8800', brand2: '#0088ff', bg: '#111111', bgAlt: '#222222' };
  const bom = composer.sanearElemento({ tipo: 'imagem', src: '/a.png', tint: '#0b7285' }, pal, '16/9');
  assert.equal(bom.tint, '#0b7285');
  const ruim = composer.sanearElemento({ tipo: 'imagem', src: '/a.png', tint: 'url(javascript:1)' }, pal, '16/9');
  assert.equal(ruim.tint, undefined);
});

test('o duotone é a MESMA conta no player, no painel e no PNG', () => {
  /*
   * A conta de desenho já esteve escrita três vezes neste projeto (js/peca.js
   * existe por causa disso). Um duotone que só o editor aplica é uma peça
   * aprovada numa cor e exibida em outra.
   */
  assert.match(ler('js', 'render.js'), /P\.tintaFundo\(/, 'o player não tinge o fundo');
  assert.match(ler('js', 'render.js'), /P\.tintaImagem\(/, 'o player não tinge a imagem');
  assert.match(ler('web', 'src', 'lib', 'exportPng.js'), /globalCompositeOperation = 'luminosity'/,
    'o PNG exportado sairia sem o duotone');
  for (const arq of ['ItemPreview.jsx', 'DesignThumb.jsx', 'CompositionEditor.jsx']) {
    assert.match(ler('web', 'src', 'components', 'content', arq), /tintaImagem\(/, arq + ' não aplica o duotone');
  }
});

/* ---------------- O que os Termos precisam dizer ---------------- */

test('os Termos avisam o que ninguém quer descobrir depois', () => {
  /*
   * A padaria compartilha e a padaria da esquina usa. Isso VAI acontecer — o
   * erro seria a pessoa descobrir depois. E não há filtro por cidade porque o
   * sistema não guarda cidade de ninguém: fingir a proteção seria pior que
   * avisar.
   */
  const termos = ler('server', 'legal.js');
  assert.match(termos, /Banco de Imagens/, 'os Termos não falam do acervo compartilhado');
  assert.match(termos, /concorrentes/i, 'não avisa que um concorrente pode usar a imagem');
  assert.match(termos, /descompartilhar/i, 'não diz que dá para sair');
  assert.match(termos, /encerrar sua conta/i, 'não avisa que o aprovado sobrevive à conta');
  assert.match(termos, /Só imagens geradas pela IA/i, 'não diz que arquivo enviado não entra');
});

test('a troca para o Asaas não deixou o Stripe nos Termos', () => {
  /*
   * A cláusula de cobrança dizia ao cliente que o pagamento dele é processado
   * pelo Stripe, e a lista de suboperadores repetia. Não é detalhe de texto:
   * é informação errada sobre para onde vai o dado de pagamento, num
   * documento que existe justamente para dizer isso.
   */
  const termos = ler('server', 'legal.js');
  assert.ok(!/Stripe/.test(termos), 'ainda há Stripe nos Termos ou na lista de suboperadores');
  assert.match(termos, /Asaas/, 'o processador de verdade não está declarado');
});

test('compartilhar exige aceite explícito, e o aceite fica registrado', () => {
  /*
   * O dia em que alguém disser "eu não sabia que outra empresa ia usar", a
   * resposta precisa ser uma linha no banco com a versão dos Termos — não a
   * lembrança de um botão.
   */
  const server = ler('server.js');
  const i = server.indexOf("parts[1] === 'banco'");
  assert.ok(i > 0, 'sumiu a rota do banco');
  const rota = server.slice(i, i + 4000);
  assert.match(rota, /b\.aceito === true/, 'dá para compartilhar sem aceitar as condições');
  assert.match(rota, /registrarAceite\([\s\S]{0,200}legal\.VERSAO/, 'o aceite não é gravado com a versão dos Termos');
});
