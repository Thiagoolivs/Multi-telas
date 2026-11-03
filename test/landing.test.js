/*
 * A landing (docs/EXECUTOR.md, item 14; PLANO §7.3 e §6.7).
 *
 * Três regras que ela tem que segurar ao longo do tempo:
 *   1. menos de 500 KB e nada de terceiros (cada domínio a mais é DNS e TLS
 *      antes da primeira letra; a versão anterior carregava 1,3 MB de
 *      bibliotecas);
 *   2. os números são os do plano (server/plans.js) — o HTML já traz os de
 *      hoje para quem abre sem JavaScript, e um preço novo tem que derrubar
 *      este teste até a página acompanhar;
 *   3. nenhuma promessa sem código por trás: cada recurso citado aponta para
 *      onde ele mora.
 *
 * Medido no navegador (celular, 4G de 4 Mbps com 170 ms, CPU 4× mais lenta):
 * 189 KB transferidos, a maior pintura em ~1,2 s.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const plans = require('../server/plans.js');

const RAIZ = path.join(__dirname, '..');
const LAND = path.join(RAIZ, 'landing');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const html = ler('landing', 'index.html');
const js = ler('landing', 'landing.js');

test('menos de 500 KB, contando tudo o que a página pede', () => {
  const pedidos = new Set();
  const re = /(?:src|href|data-src)="([^"#][^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    // Páginas (o painel, os textos legais e as landings das frentes) não são peso desta página.
    if (/^(https?:|mailto:|\/app|\/termos|\/privacidade|\/(empresas|saude|comercio)(#\w+)?$|#)/.test(u) || u === '/') continue;
    pedidos.add(u);
  }
  // As imagens que as abas trocam (landing.js) também contam — as de todas as frentes, para valer na pior página.
  const frentes = require('../server/landing-frentes.js');
  for (const pagina of [html, ...frentes.SLUGS.map((f) => frentes.montar(html, f))]) {
    for (const m of pagina.matchAll(/data-ramo="([a-z-]+)"/g)) pedidos.add('vendor/galeria/' + m[1] + '.webp');
  }
  let total = Buffer.byteLength(html) + Buffer.byteLength(js);
  for (const u of pedidos) {
    const arq = /^\/(icons|fonts)\//.test(u) ? path.join(RAIZ, u) : path.join(LAND, u.replace(/^\//, ''));
    assert.ok(fs.existsSync(arq), 'a página pede ' + u + ', que não existe');
    total += fs.statSync(arq).size;
  }
  // As fontes da folha de fontes.
  // Desde a marca única (docs/MARCA.md) os arquivos são os de /fonts/marca/, os mesmos do painel.
  const fontes = [...ler('landing', 'vendor', 'fontes', 'fontes.css').matchAll(/url\('([^']+)'\)/g)].map((x) => x[1]);
  assert.ok(fontes.length >= 2, 'a folha de fontes da landing ficou vazia');
  for (const f of fontes) {
    const arq = f.startsWith('/') ? path.join(RAIZ, f) : path.join(LAND, 'vendor', 'fontes', f);
    assert.ok(fs.existsSync(arq), 'a folha pede ' + f + ', que não existe');
    if (!html.includes(f)) total += fs.statSync(arq).size; // o preload já contou
  }
  assert.ok(total < 500 * 1024, 'a landing pesa ' + Math.round(total / 1024) + ' KB');
});

test('nada de terceiros, nada de biblioteca pesada, nada de script embutido', () => {
  // O canonical não baixa nada: é o endereço da própria página para o Google.
  assert.doesNotMatch(html, /<(script|link)(?![^>]*rel="canonical")[^>]+(src|href)="https?:\/\//, 'a página pede arquivo de outro domínio');
  for (const velho of ['three.min.js', 'gsap', 'ScrollTrigger', 'fa/all.min.css', 'fa-solid']) {
    assert.ok(!html.includes(velho), 'voltou ' + velho);
    assert.ok(!fs.existsSync(path.join(LAND, 'vendor', velho)) || velho === 'gsap', velho + ' voltou para a pasta');
  }
  assert.ok(!fs.existsSync(path.join(LAND, 'vendor', 'three.min.js')));
  // Dados estruturados (application/ld+json) não executam: a CSP não os alcança.
  assert.equal((html.match(/<script(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")[^>]*>/gi) || []).length, 0);
  // Sem JavaScript a página aparece inteira: só esconde para animar quando o script está de pé.
  assert.match(html, /\.js \.surge \{ opacity: 0;/);
  assert.match(js, /document\.documentElement\.classList\.add\('js'\)/);
});

/*
 * QA de lançamento, 03/11 — DECISÃO DO DONO: cada frente tem o seu preço
 * (Comércio R$ 79, Saúde R$ 139, Empresas R$ 159 por TV/mês) e as frentes não
 * aparecem lado a lado. Este teste antes comparava o HTML com o R$ 149 único
 * de server/plans.js; agora garante que:
 *   - a principal não mostra tabela nem preço único (nem no JSON-LD);
 *   - cada frente mostra SÓ o preço dela, no herói e na tabela, sem JavaScript;
 *   - o script pede o catálogo da frente (/api/planos?frente=<id>), que é o
 *     contrato com quem cobra: com JavaScript, vale o número do servidor.
 * (O preço por frente mora em server/plans.js, mudado em outra correção: ao
 * juntar as duas, confira que PRECO_MENSAL_CENTS bate com o catálogo.)
 */
test('cada frente com o seu preço; a principal sem preço único', () => {
  const frentes = require('../server/landing-frentes.js');
  const raiz = frentes.raiz(html);
  const reais = frentes.reais;
  assert.deepEqual(frentes.PRECO_MENSAL_CENTS, { comercio: 7900, saude: 13900, empresas: 15900 });
  // A principal: nenhuma tabela, nenhum preço em reais, só o caminho para o preço de cada frente.
  assert.doesNotMatch(raiz, /R\$ \d/, 'a principal mostra um preço');
  assert.doesNotMatch(raiz, /id="calc-range"|data-preco-mensal/);
  for (const f of frentes.SLUGS) assert.match(raiz, new RegExp('href="/' + f + '#precos"'));
  // O Google também não vê um preço único na principal: o menor e o maior das frentes.
  const ldRaiz = JSON.parse(raiz.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const ofertas = ldRaiz['@graph'].find((n) => n['@type'] === 'SoftwareApplication').offers;
  assert.equal(ofertas['@type'], 'AggregateOffer');
  const precos = Object.values(frentes.PRECO_MENSAL_CENTS);
  assert.equal(ofertas.lowPrice, (Math.min(...precos) / 100).toFixed(2));
  assert.equal(ofertas.highPrice, (Math.max(...precos) / 100).toFixed(2));
  assert.equal(ofertas.offerCount, 3);

  for (const slug of frentes.SLUGS) {
    const s = frentes.montar(html, slug);
    const p = frentes.precosDe(slug);
    const outras = frentes.SLUGS.filter((x) => x !== slug).map((x) => reais(frentes.PRECO_MENSAL_CENTS[x]));
    // O preço dela no herói (primeira tela do celular) e na tabela.
    assert.match(s, new RegExp('data-preco-heroi><b><span data-preco-mensal>' + reais(p.mensal).replace('$', '\\$') + '</span> por TV, por mês'));
    assert.match(s, new RegExp('<span data-preco-mensal><!--frente:preco-mensal-->' + reais(p.mensal).replace('$', '\\$') + '<'));
    // O anual na proporção das faixas de antes (149 → 120/108/96).
    for (const c of p.anual) assert.ok(s.includes(reais(c) + ' cada'), slug + ': faixa do anual ' + reais(c));
    // Nenhum preço de outra frente na página dela, nem o R$ 149 antigo.
    for (const o of outras.concat('R$ 149')) assert.ok(!s.includes(o + '<') && !s.includes(o + ' '), slug + ' mostra ' + o);
    // JSON-LD da frente: o endereço e o preço dela.
    const ld = JSON.parse(s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const app = ld['@graph'].find((n) => n['@type'] === 'SoftwareApplication');
    assert.equal(app.url, 'https://app.multitelas.net.br/' + slug);
    assert.equal(app.offers.price, (p.mensal / 100).toFixed(2));
    // A multa do anual na vitrine, junto do anual (CDC art. 6º III e 31).
    assert.match(s, /id="multa-anual"><b class="text-mt-tinta">Multa:<\/b> cancelar antes dos 12 meses custa 30% das mensalidades que faltam\. Com os 12 meses cumpridos, não há multa\./);
    // O simulador sem JavaScript não fica vazio.
    assert.match(s, /<div id="calc-saida"[^>]*><!--frente:calc-->\s*<p class="text-sm text-mt-cinza">Com 3 TVs: R\$/);
  }
  // Os números do teste e das criações continuam os do plano.
  assert.ok(html.includes('>' + plans.DIAS_DE_TESTE + '<'), 'os dias de teste');
  assert.ok(html.includes('>' + plans.CRIACOES_DO_TESTE + '<'), 'as criações do teste');
  assert.ok(html.includes('>' + plans.franquiaCreditos('pro', 3) + '<'), 'as criações do plano');
  assert.ok(html.includes('>' + plans.franquiaCreditos('pro', 1000) + '<'), 'o teto de criações');
  // O script pede o catálogo DA FRENTE, e o simulador usa a tabela pronta do servidor.
  assert.match(js, /fetch\('\/api\/planos' \+ \(frenteId \? '\?frente=' \+ encodeURIComponent\(frenteId\) : ''\)/);
  assert.match(js, /getAttribute\('data-frente-id'\)/);
  assert.match(js, /dados\.faixasAnual/);
  assert.match(js, /linha\[c\]/, 'o simulador usa a tabela pronta do servidor (mensal e anual)');
});

test('sem selo de prova social inventada', () => {
  // QA de 03/11: "Mais escolhido" sem nenhum cliente pagante é publicidade enganosa (CDC art. 37 §1º).
  assert.doesNotMatch(html, /Mais escolhido|mais vendido|preferido dos clientes/i);
});

test('SEO: as quatro páginas com texto próprio, título e descrição no tamanho que o Google mostra', () => {
  const frentes = require('../server/landing-frentes.js');
  const paginas = { raiz: frentes.raiz(html) };
  for (const f of frentes.SLUGS) paginas[f] = frentes.montar(html, f);
  // O texto visível (sem tags, comentários, script e estilo), frase por frase.
  const frases = (s) => new Set(s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n').split(/\n|(?<=[.!?])\s+/).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length > 25));
  const nomes = Object.keys(paginas);
  for (let i = 0; i < nomes.length; i++) {
    for (let j = i + 1; j < nomes.length; j++) {
      const a = frases(paginas[nomes[i]]); const b = frases(paginas[nomes[j]]);
      const iguais = [...a].filter((x) => b.has(x)).length;
      const parte = iguais / Math.min(a.size, b.size);
      // Antes: 93% igual. As perguntas comuns (cancelar, atraso, dados) e o teste continuam iguais de propósito.
      assert.ok(parte < 0.5, nomes[i] + ' e ' + nomes[j] + ' têm ' + Math.round(parte * 100) + '% do texto igual');
    }
  }
  for (const [nome, s] of Object.entries(paginas)) {
    const titulo = s.match(/<title>([^<]*)<\/title>/)[1];
    const desc = s.match(/<meta name="description" content="([^"]*)"/)[1];
    assert.ok(titulo.length <= 60, nome + ': título com ' + titulo.length + ' caracteres');
    assert.ok(desc.length <= 158, nome + ': descrição com ' + desc.length + ' caracteres');
    // Toda imagem com alt (vazio só nas decorativas, dentro de aria-hidden).
    for (const img of s.match(/<img [^>]*>/g)) assert.match(img, /\balt="/, nome + ': imagem sem alt');
    // Empresas e Saúde não falam de loja (fora o cartão do Comércio em "Um MultiTelas para cada lugar").
    if (nome === 'empresas' || nome === 'saude') {
      const texto = s.replace(/<section id="para-quem"[\s\S]*?<\/section>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
      assert.doesNotMatch(texto, /\bloja/i, nome + ' ainda fala de loja');
    }
  }
});

test('nenhuma promessa sem código por trás', () => {
  const existe = (...p) => fs.existsSync(path.join(RAIZ, ...p));
  const PROMESSAS = [
    ['Funciona sem internet', () => /SHELL_CACHE/.test(ler('sw.js'))],
    ['Horário da loja', () => existe('js', 'expediente.js')],
    ['Horário de atendimento', () => existe('js', 'expediente.js')],
    ['Se uma TV cair no horário, você recebe um e-mail', () => /expediente/i.test(ler('server', 'vigia.js'))],
    ['Foto da equipe pelo QR', () => existe('server', 'foto-qr.js') && /PRAZO_FILA_DIAS = 30/.test(ler('server', 'guarda.js'))],
    ['Calendário da empresa', () => existe('server', 'calendario.js')],
    ['Segurança do trabalho', () => /SEGURANÇA DO TRABALHO/.test(ler('js', 'render.js'))],
    ['depois de uma pessoa conferir a resposta', () => existe('js', 'quiz.js')],
    ['Metas e indicadores', () => existe('server', 'kpis.js')],
    ['Datas do comércio', () => /black-friday/.test(ler('js', 'seasons.js'))],
    ['mostra quem faz aniversário na semana', () => /SEMANA do aniversário/.test(ler('server', 'automaticos.js'))],
    ['Ver a tela agora', () => existe('server', 'ver-tela.js')],
    ['Foto e vídeo do celular', () => /share_target/.test(ler('web', 'public', 'manifest.webmanifest'))],
    ['A mesma peça nas redes', () => existe('server', 'redes.js')],
    ['TV deitada ou em pé', () => /mt-moldura/.test(ler('css', 'player.css'))],
    ['Mural de fotos por QR', () => existe('server', 'mural.js') && /ocultarFoto/.test(ler('web', 'src', 'pages', 'MuralPage.jsx'))],
    ['Aniversariantes', () => existe('web', 'src', 'pages', 'BirthdaysPage.jsx')],
    ['Relatório de exibição', () => existe('server', 'routes', 'relatorio.js')],
    // Desde o QA de lançamento (03/11), depois de 20 dias de atraso só a primeira TV segue no ar;
    // as outras mostram que estão pausadas (nenhuma apaga sem explicação).
    ['Sua TV não apaga de surpresa', () => plans.textoDoSelo({ plan: 'pro', plan_status: 'past_due', atraso_desde: Date.now() - 400 * 864e5 }) === 'MultiTelas' && /Esta TV está pausada/.test(ler('js', 'player.js') + ler('js', 'cloud.js'))],
    ['Cancela quando quiser, pelo próprio painel', () => /Cancelar assinatura/.test(ler('web', 'src', 'pages', 'BillingPage.jsx'))],
    ['você baixa tudo ou pede a exclusão', () => /parts\[2\] === 'exportar'/.test(ler('server.js'))],
  ];
  // As quatro páginas: cada frente tem a sua lista (server/landing-frentes.js).
  const frentes = require('../server/landing-frentes.js');
  const todas = [frentes.raiz(html), ...frentes.SLUGS.map((f) => frentes.montar(html, f))].join('\n');
  for (const [frase, prova] of PROMESSAS) {
    assert.ok(todas.includes(frase), 'a frase sumiu das páginas (ou mudou): ' + frase);
    assert.ok(prova(), 'a página promete "' + frase + '" e o código não tem');
  }
  // QA de 03/11: o produto deixa o post pronto; quem posta é a pessoa.
  assert.doesNotMatch(todas, /posta nas redes/i);
  // O aniversariante aparece na SEMANA do aniversário (server/automaticos.js), não "no dia certo".
  assert.doesNotMatch(todas, /parabeniza no dia certo/);
  // O que não existe não aparece.
  // Palavra inteira: 'SLA' mora dentro de 'translateY' no CSS.
  for (const nao of [/instalamos tudo/i, /\bSLA\b/, /marca branca/i, /domínio próprio/i]) {
    assert.ok(!nao.test(html), 'promessa sem código: ' + nao);
  }
});

test('o que falta está marcado: foto real de TV e o número de WhatsApp', () => {
  assert.match(html, /data-falta="foto-real-tv-instalada"/);
  assert.match(html, /data-falta="whatsapp-se-sem-variavel"/);
  // Sem número, nada de link quebrado: o WhatsApp só aparece quando o servidor manda.
  assert.match(js, /if \(c\.whatsapp\) \{/);
  assert.match(html, /id="whats-flutuante"[^>]*class="[^"]*\bhidden\b/);
});
