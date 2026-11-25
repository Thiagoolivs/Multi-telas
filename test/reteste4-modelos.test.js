/*
 * Reteste 4, parte B (22/11): os modelos prontos editáveis e limpos.
 *
 * O dono perguntou se os modelos prontos são editáveis e se está tudo limpo
 * de coisas antigas. O robô do reteste editou cada peça e cada tela pronta
 * no painel de verdade e conferiu na TV (docs/qa-total/RETESTE-4-MODELOS.md).
 * O que ele achou e foi consertado fica preso aqui:
 *
 *   - o QR do Wi-Fi era um campo técnico ("WIFI:T:WPA;S:…;P:…;;") e não
 *     seguia a rede e a senha escritas no texto;
 *   - a peça solta do Prontos e o desenho trocado no editor mostravam o
 *     contato, o @ e o endereço da empresa de exemplo (a tela pronta já
 *     limpava; a peça solta, não);
 *   - "Desde 1987", "Cabelo · unhas · estética" e a senha de Wi-Fi do
 *     exemplo apareciam para negócios que nunca disseram isso.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const M = JSON.parse(ler('pecas-ouro/manifesto.json'));
const PH = require('../js/peca-html.js');
globalThis.MTPecaHtml = globalThis.MTPecaHtml || PH;
const modelos = new Map(M.pecas.map((p) => [p.id, { ...p, arq: PH.doArquivo(ler('pecas-ouro/' + p.id + '.html')) }]));
const lib = (f) => import(pathToFileURL(path.join(RAIZ, 'web/src/lib', f)).href);

test('o QR do Wi-Fi sai da rede e da senha; com o texto neutro do desenho, não há QR', async () => {
  const { qrDoWifi, temQrDeWifi } = await lib('qrDoWifi.js');
  const desenho = { rede: 'Nome da rede', senha: 'Senha da rede' };
  assert.equal(qrDoWifi('Visitantes', 'boas;vindas:26', desenho), 'WIFI:T:WPA;S:Visitantes;P:boas\\;vindas\\:26;;', 'o ; e o : da senha vão escapados');
  assert.equal(qrDoWifi(' Loja ', ' 1234abcd ', desenho), 'WIFI:T:WPA;S:Loja;P:1234abcd;;');
  assert.equal(qrDoWifi('Nome da rede', 'Senha da rede', desenho), '', 'QR para a rede do exemplo é pior que nenhum');
  assert.equal(qrDoWifi('Loja', 'Senha da rede', desenho), '');
  assert.equal(qrDoWifi('', 'x', desenho), '');
  const wifi = PH.higienizar(modelos.get('social-wifi').arq).campos;
  assert.equal(temQrDeWifi(wifi), true);
  assert.equal(temQrDeWifi(PH.higienizar(modelos.get('oferta-foto').arq).campos), false);
});

test('o editor monta o QR do Wi-Fi e não mostra o campo técnico', () => {
  const e = ler('web/src/components/content/EditarPeca.jsx');
  assert.match(e, /gravados\.wifi = qrDoWifi\(valor\('rede'\), valor\('senha'\), ex\);/);
  assert.match(e, /if \(c\.tipo === 'qr' && c\.nome === 'wifi' && temQrDeWifi\(definicao\)\) \{/);
  assert.match(e, /wifi: 'QR do Wi-Fi'/);
});

test('o desenho trocado nasce com o texto da frente da conta, sem a empresa de exemplo', () => {
  const e = ler('web/src/components/content/EditarPeca.jsx');
  assert.match(e, /const daFrente = m && contaPronta && exemplos \? pecaDoProntos\(m, contaPronta, perfil\.id, exemplos\)\.campos : \{\};/);
  assert.match(e, /setCampos\(camposPara\(nomes, m\)\);/);
  // O campo que a empresa de exemplo deixou vazio pede o da pessoa.
  assert.match(e, /'O do exemplo saiu\. Escreva o seu; vazio, a TV não mostra\.'/);
  assert.match(ler('web/src/pages/PecasProntasPage.jsx'), /const item = pecaDoProntos\(m, marca, perfil\.id, dados\.exemplos\);/);
});

// O que um negócio nunca disse: nome, contato e endereço das marcas de exemplo, o ano de fundação, o salão, a senha do Wi-Fi.
const SENHAS_DE_EXEMPLO = /bemvindo2026|saude2026|boasvindas26|paoquente|cabelo2026|bemestar26|sorriso26/i;
function proibido(t) {
  const s = String(t || '');
  const c = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return M.marcas.some((m) => s.toLowerCase().includes(m.nome.toLowerCase()))
    || ['oticacentral', 'padariadobairro', 'studiobella', 'clinicavida', 'lanchonetedapraca', 'rotasul', 'cantinadanona', 'sorrisoodonto'].some((k) => c.includes(k))
    || /\(\d{2}\)\s?\d{4,5}-\d{4}/.test(s) || /rua (augusta|oscar freire|das flores)/i.test(s)
    || /^desde (19|20)\d\d$/i.test(s.trim()) || /cabelo · unhas/i.test(s) || SENHAS_DE_EXEMPLO.test(s);
}

test('a peça solta do Prontos, em toda frente que ela atende: nada da empresa de exemplo na TV', async () => {
  const T = await lib('telasProntas.js');
  const exemplos = T.nomesDeExemplo(M.marcas);
  const conta = { nome: 'Grupo Horizonte', cores: ['#1d4e89', '#f2a541'], site: '', endereco: '', contato: '' };
  let vistas = 0;
  for (const m of modelos.values()) {
    for (const frente of m.frentes || ['comercio']) {
      const item = T.pecaDoProntos(m, conta, frente, exemplos);
      assert.ok(!('_pendentes' in item.campos));
      for (const d of PH.higienizar(item).campos) {
        if (d.tipo === 'img') continue;
        // O que a TV MOSTRA: o campo gravado ou, sem ele, o exemplo do HTML.
        const v = item.campos[d.nome] != null ? item.campos[d.nome] : d.exemplo;
        if (d.nome === 'marca') continue;
        assert.ok(!proibido(v), m.id + ' (' + frente + ').' + d.nome + ' = "' + v + '"');
        vistas++;
      }
    }
  }
  assert.ok(vistas > 1000, 'conferiu pouco: ' + vistas);
  // O que saiu, a pessoa completa: o rodapé de contatos da padaria pede o WhatsApp e o @.
  const faixa = T.pecaDoProntos(modelos.get('rodape-faixa'), { ...conta, endereco: 'Av. Industrial, 500' }, 'comercio', exemplos);
  assert.deepEqual(faixa._pendentes, ['contato1', 'contato2']);
  assert.equal(faixa.campos.contato3, 'Av. Industrial, 500', 'o endereço da conta entra no lugar do da empresa de exemplo');
});

test('as telas prontas também não levam a senha do Wi-Fi nem o ano de fundação do exemplo', async () => {
  const T = await lib('telasProntas.js');
  const exemplos = T.nomesDeExemplo(M.marcas);
  for (const tela of M.telas) {
    const montada = T.montarTela(tela, modelos, { nome: 'Grupo Horizonte', cores: ['#1d4e89'] }, exemplos);
    for (const pecas of Object.values(montada.grupos)) {
      for (const it of pecas) {
        for (const d of PH.higienizar(it).campos) {
          if (d.tipo === 'img' || d.nome === 'marca') continue;
          const v = it.campos[d.nome] != null ? it.campos[d.nome] : d.exemplo;
          assert.ok(!SENHAS_DE_EXEMPLO.test(v) && !/^desde (19|20)\d\d$/i.test(String(v).trim()), tela.id + ': ' + it.origem.base + '.' + d.nome + ' = "' + v + '"');
        }
      }
    }
  }
});

test('o texto neutro no lugar do exemplo de outro negócio, sem mexer em nenhum estado', () => {
  const html = (id) => ler('pecas-ouro/' + id + '.html');
  assert.match(html('cabecalho-centro'), /data-campo="sub">Seja bem-vindo</);
  assert.match(html('cabecalho-status'), /data-campo="desde">Bem-vindo</);
  assert.match(html('social-wifi'), /data-campo="rede">Nome da rede<\/span>/);
  assert.match(html('social-wifi'), /data-campo="senha">Senha da rede<\/span>/);
  for (const f of fs.readdirSync(path.join(RAIZ, 'pecas-ouro')).filter((x) => x.endsWith('.html'))) {
    assert.doesNotMatch(html(f.slice(0, -5)), /data-campo="[^"]+"[^>]*>Desde (19|20)\d\d</, f + ': ano de fundação de exemplo');
  }
  const wifi = M.pecas.find((p) => p.id === 'social-wifi');
  for (const f of ['comercio', 'saude', 'empresa']) assert.deepEqual([wifi.textos[f].rede, wifi.textos[f].senha], ['Nome da rede', 'Senha da rede'], f);
  assert.equal(M.pecas.find((p) => p.id === 'social-instagram').textos.comercio.arroba, '@sualoja');
});

test('a logo escura sem versão branca vai numa placa clara no fundo escuro; a clara e a colorida que se lê ficam como estão', () => {
  const R = require('../js/peca-render.js');
  const pixels = new Uint8ClampedArray(64);
  pixels.set([17, 17, 17, 255], 0);
  const preta = R.luzDosPixels(pixels);
  assert.ok(preta < 0.01, 'a luz da logo preta: ' + preta);
  assert.equal(R.luzDosPixels(new Uint8ClampedArray(64)), null, 'só transparente: não se sabe');
  const fundoEscuro = 0.005; // a tinta #0E0B1F
  assert.equal(R.precisaDePlaca(preta, fundoEscuro), true);
  assert.equal(R.precisaDePlaca(0.95, fundoEscuro), false, 'a branca se lê no escuro');
  assert.equal(R.precisaDePlaca(0.2, fundoEscuro), false, 'a colorida com 4:1 se lê');
  assert.equal(R.precisaDePlaca(preta, 0.9), false, 'no fundo claro a escura se lê');
  assert.equal(R.precisaDePlaca(null, fundoEscuro), false, 'sem ler a logo, nada muda');
  assert.match(R.BASE, /:where\(\.mt-peca\) img\[data-logo-placa\]\{background:#fff;/);
  // E também na TV antiga (a BASE sem `:where()`, compat-tv).
  assert.match(R.cssSemCq(R.BASE_SEM_CQ, 1920, 1080), /img\[data-logo-placa\]\{background:#fff;/);
  // O cabeçalho padrão, a espera e o código também (o player), só sem a versão branca.
  const p = ler('js/player.js');
  assert.match(p, /if \(!img \|\| !url \|\| \(logo && logo\.clara\) \|\| !R \|\| !R\.logoNaPlaca\) return;/);
  assert.match(p, /placaNaLogo\(img, url, logo, zoneEl\);/);
  assert.match(ler('css/player.css'), /\.mt-logo-placa \{ background: #fff;/);
});

test('as peças guardadas de tipo antigo têm prévia de verdade, sem o nome técnico do tipo', () => {
  const d = ler('web/src/components/content/DesignThumb.jsx');
  assert.match(d, /<Body item=\{it\} \/>/);
  assert.doesNotMatch(d, /\{it\.type === 'pptx' \? 'Apresentação\/PDF' : it\.type\}/);
  assert.match(ler('web/src/components/content/ItemPreview.jsx'), /'Conteúdo de uma versão antiga'/);
  // Os rótulos do "Adicionar" e dos temas em português.
  const c = ler('web/src/lib/contentTypes.js');
  for (const t of ["label: 'Preencher (cover)'", "label: 'Conter (contain)'", "label: 'Chamada (CTA)'", "label: 'Indicador (KPI)'", "group: 'Widgets'"]) assert.ok(!c.includes(t), t);
  assert.doesNotMatch(ler('web/src/lib/screenConfig.js'), /label: '(Corporate Blue|Luxury Gold|Neon Cyber|Glassmorphism|Minimal White|Elegant Black|Energy Green|Modern Purple)'/);
});

test('a data da vez é a da frente: em 22/11 a fábrica vê o Novembro Azul, não a Black Friday "para a loja"', async () => {
  const S = require('../js/seasons.js');
  const F = require('../js/datas-frente.js');
  const dia = new Date(2026, 10, 22);
  const da = (f) => { const ids = new Set(F.DATAS[f].map((d) => d.id)); const h = S.todaySeason(dia, (s) => ids.has(s.id)); return h && h.id; };
  assert.equal(da('empresa'), 'novembro-azul');
  assert.equal(da('saude'), 'novembro-azul');
  assert.equal(da('comercio'), 'black-friday');
  assert.equal(S.todaySeason(dia).id, 'black-friday', 'sem filtro, como antes (a TV e o admin)');
  assert.match(ler('server.js'), /const hoje = ids \? seasons\.todaySeason\(new Date\(\), \(s\) => ids\.has\(s\.id\)\) : seasons\.todaySeason\(\);/);
  const { ideiaDaData } = await lib('ideiaDaData.js');
  assert.equal(ideiaDaData({ label: 'Novembro Azul' }, 'empresa').brief, 'Uma campanha de Novembro Azul para a empresa');
  assert.match(ler('web/src/pages/DashboardPage.jsx'), /Data da vez: \{ideia\.titulo\}/);
});

test('o cardápio do refeitório leva um prato, não a mesa de escritório (fotosDaFrente)', async () => {
  const T = await lib('telasProntas.js');
  const conta = { nome: 'Grupo Horizonte', cores: ['#1d4e89'] };
  for (const id of ['cardapio-dia-foto', 'cardapio-destaque', 'cardapio-quadro']) {
    const item = T.pecaDoProntos(modelos.get(id), conta, 'empresa', T.nomesDeExemplo(M.marcas));
    assert.equal(item.campos.foto, '/pecas-ouro/fotos/prato-do-dia.jpg', id);
    assert.ok(fs.existsSync(path.join(RAIZ, item.campos.foto)), id + ': a foto existe');
    assert.equal(PH.validarItem(item).ok, true, id + ': a porta aceita');
  }
  // Na loja, nada muda: a foto vem do ramo (ou do negócio do texto, fotosDoExemplo).
  const loja = T.pecaDoProntos(modelos.get('cardapio-dia-foto'), conta, 'comercio', T.nomesDeExemplo(M.marcas)).campos.foto;
  assert.notEqual(loja, '/pecas-ouro/fotos/prato-do-dia.jpg');
});

test('a foto padrão da Empresas varia de peça para peça, sem o calendário em inglês nem o rosto de banco', () => {
  const R = require('../js/peca-render.js');
  const banco = JSON.parse(ler('pecas-ouro/fotos/banco.json'));
  for (const [ramo, papeis] of Object.entries(R.VARIACOES)) {
    for (const lista of Object.values(papeis)) {
      for (const f of lista) assert.ok(banco.some((b) => b.arquivo === f.arquivo && b.ramos.includes(ramo)), f.arquivo + ' não está no banco com o ramo ' + ramo);
    }
  }
  const usadas = new Set();
  for (const p of M.pecas) for (const [campo, papel] of Object.entries(p.fotos || {})) { const f = R.fotoPadrao(papel, '', 'empresa', p.id + ':' + campo); if (f) usadas.add(f.arquivo); }
  assert.ok(usadas.size >= 4, 'as peças da Empresas com uma foto só: ' + [...usadas].join(', '));
  assert.ok(!usadas.has('/pecas-ouro/fotos/escritorio/mesa-minimalista.jpg') && !usadas.has('/pecas-ouro/fotos/escritorio/escritorio-aberto.jpg'));
  // Nem como foto fixa de tela pronta: a l4-escritorio-em-pe trazia a mesa do calendário em inglês (M T W T F S).
  assert.ok(!JSON.stringify(M.telas).includes('mesa-minimalista.jpg'), 'tela pronta com a foto do calendário em inglês');
  // E a confraternização da mesma tela não mostra dois estranhos do banco como se fossem a equipe do cliente.
  const esc = M.telas.find((t) => t.id === 'l4-escritorio-em-pe');
  assert.ok(!JSON.stringify(esc).includes('equipe-executiva.jpg'), 'l4-escritorio-em-pe com rosto de banco no evento');
  // A mesma peça, a mesma foto (a TV, a bancada e o painel desenham igual); sem semente, a de sempre.
  assert.deepEqual(R.fotoPadrao('ambiente', '', 'empresa', 'x:foto'), R.fotoPadrao('ambiente', '', 'empresa', 'x:foto'));
  assert.equal(R.fotoPadrao('ambiente', '', 'empresa').arquivo, R.FOTOS_PADRAO.corporativo.ambiente.arquivo);
});

test('o Indicador só desenha a barra da meta com o número da meta (não com o exemplo ou a importância)', () => {
  const r = ler('js/render.js');
  // `item.meta` também é onde o painel marca o exemplo do "Adicionar" e a importância: {} ia ao ar como "NaN% da meta de undefined".
  assert.match(r, /if \(item\.meta && isFinite\(Number\(item\.meta\.pct\)\) && item\.meta\.texto != null && String\(item\.meta\.texto\)\.trim\(\)\) \{/);
});

test('o resumo do agendamento não fica pela metade com a data de antes ("31/12/2020")', async () => {
  const { resumoAgenda } = await lib('agenda.js');
  assert.equal(resumoAgenda({ ativo: true, dataFim: '31/12/2020' }), 'Todo dia');
  assert.equal(resumoAgenda({ ativo: true, dataFim: '2026-12-31' }), 'Todo dia, até 31/12');
});

test('o nome da tela pronta chega ao cliente sem a empresa de exemplo', async () => {
  const T = await lib('telasProntas.js');
  const t = M.telas.find((x) => x.id === 'otica-semana-do-sol');
  assert.equal(T.nomeParaOCliente(t, M.marcas), 'Semana do Sol');
  assert.equal(T.nomeParaOCliente({ nome: 'Escritório · TV deitada', marca: 'escritorio' }, M.marcas), 'Escritório · TV deitada', 'nome sem empresa de exemplo fica');
  for (const x of T.aprovadas(M)) assert.ok(!M.marcas.some((m) => x.nome.includes(m.nome)), x.id + ': ' + x.nome);
});

test('o editor confere a faixa no tamanho da faixa e só avisa o que a edição causou', () => {
  const e = ler('web/src/components/content/EditarPeca.jsx');
  // O cabeçalho aprovado abria com "Não cabe — Relogio passa da borda" (era conferido como tela cheia).
  assert.match(e, /: item && FAIXA\[item\.papel\] \? \{ \[FAIXA\[item\.papel\]\]: TAMANHO_REAL\[item\.papel\] \} : undefined\);/);
  assert.match(e, /relogio: 'Relógio'/);
  // O aviso que a peça já trazia, sem ninguém mexer, não é culpa de quem edita.
  assert.match(e, /avisosDaConferencia\(conferencia\)\.filter\(\(a\) => !avisosDeAntes\.includes\(a\)\)/);
});
