/*
 * Telas prontas, lote 1 (EXECUTOR D18).
 *
 * O dono pediu 80 telas prontas que se adaptam à empresa, em lotes de 20
 * aprovados por ele na bancada. Uma tela é uma combinação de peças-ouro já
 * aprovadas (layout + peças por zona + mensagens do rodapé), escrita para um
 * perfil (Comércio, Empresa, Saúde) e uma das doze estruturas. Entra como
 * 'proposta' e só vira 'aprovada' depois que o dono olha na bancada.
 *
 * As regras de montagem (papel da zona, QR numa zona só, texto que não se
 * repete, ≥3 mensagens) valem para toda tela e moram em peca-render.test.js.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(RAIZ, 'pecas-ouro/manifesto.json'), 'utf8'));
const { PERFIS } = require('../js/perfil.js');
const lote1 = M.telas.filter((t) => t.lote === 1);

test('lote 1: vinte telas, os três perfis e as doze estruturas', () => {
  assert.equal(lote1.length, 20);
  for (const t of lote1) {
    assert.ok(PERFIS[t.perfil], t.id + ': perfil ' + t.perfil);
    assert.match(t.estrutura, /^E(\d|1[0-2]) /, t.id + ': estrutura');
    assert.ok(['proposta', 'aprovada'].includes(t.estado), t.id + ': estado ' + t.estado);
    assert.ok(t.sobre && t.nome, t.id + ': nome e sobre');
  }
  assert.deepEqual([...new Set(lote1.map((t) => t.perfil))].sort(), ['comercio', 'empresa', 'saude']);
  assert.equal(new Set(lote1.map((t) => t.estrutura.split(' ')[0])).size, 12);
  assert.equal(new Set(M.telas.map((t) => t.id)).size, M.telas.length, 'id repetido');
});

test('só peças aprovadas; o nome da marca vem da tela, não da peça de exemplo', () => {
  // Visto na bancada: a tela da Rota Sul com "ÓTICA CENTRAL" no cabeçalho.
  const aprovadas = new Set(M.pecas.filter((p) => p.estado === 'aprovada').map((p) => p.id));
  for (const t of lote1) {
    for (const z of Object.values(t.zonas)) {
      for (const p of z.pecas) {
        assert.ok(aprovadas.has(p.id), t.id + ': ' + p.id + ' não está aprovada');
        const temMarca = /data-campo="marca"/.test(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', p.id + '.html'), 'utf8'));
        if (temMarca) assert.ok(p.campos && p.campos.marca, t.id + ': ' + p.id + ' sem o nome da marca');
      }
    }
  }
});

test('foto de exemplo só onde ela faz sentido', () => {
  // As duas fotos de exemplo são da ótica e de um prato: uma clínica com óculos de sol não vai para a bancada.
  const FOTO_DA_MARCA = { otica: 'otica-sol', lanchonete: 'prato-do-dia', padaria: 'prato-do-dia', salao: 'otica-sol' };
  for (const t of lote1) {
    for (const z of Object.values(t.zonas)) {
      for (const p of z.pecas) {
        const def = M.pecas.find((d) => d.id === p.id);
        const foto = (p.campos && p.campos.foto) || (def.campos && def.campos.foto);
        if (!foto) continue;
        assert.ok(FOTO_DA_MARCA[t.marca] && foto.includes(FOTO_DA_MARCA[t.marca]), t.id + ': foto ' + foto + ' na marca ' + t.marca);
      }
    }
  }
});

test('a bancada confere a tela inteira e agrupa por lote e perfil', () => {
  const b = fs.readFileSync(path.join(RAIZ, 'js/bancada.js'), 'utf8');
  // Cada peça de cada zona, no tamanho real da zona — girando, só se via uma por vez.
  assert.match(b, /medir\.flatMap\(\(\{ caixa, grupo, papel, nome \}\) => grupo\.pecas\.map\(entradaDe\)/);
  assert.match(b, /host\.style\.width = caixa\.offsetWidth \+ 'px';/);
  assert.match(b, /lista\('Não coube:', achados\.filter\(Boolean\), 'problemas'\)/);
  assert.match(b, /'Lote ' \+ t\.lote \+ ' · ' \+ \(NOME_DO_PERFIL\[t\.perfil\] \|\| t\.perfil\)/);
});

test('o painel não mostra tela que o dono ainda não aprovou', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'web/src/lib/modelosOuro.js'), 'utf8');
  assert.ok(!/\.telas\b/.test(s) || /estado === 'aprovada'/.test(s));
});

/* ---------------- Parte 2: a galeria do cliente ---------------- */

const { pathToFileURL } = require('node:url');
const PH = require('../js/peca-html.js');
const lib = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/telasProntas.js')).href);
const modelos = new Map(M.pecas.map((p) => [p.id, { ...p, arq: PH.doArquivo(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', p.id + '.html'), 'utf8')) }]));
const MARCA = { nome: 'Padaria Real', cores: ['#7a2e0e', '#f2c14e'], fonteTitulo: 'serif', fonteApoio: 'sans' };

test('o cliente só vê tela aprovada; tela sem perfil vale pela marca de exemplo', async () => {
  const L = await lib();
  const ids = L.aprovadas(M).map((t) => t.id);
  assert.ok(ids.every((id) => M.telas.find((t) => t.id === id).estado === 'aprovada'));
  assert.ok(!ids.some((id) => M.telas.find((t) => t.id === id).estado === 'proposta'));
  assert.equal(L.perfilDaTela({ marca: 'rotasul' }), 'empresa');
  assert.equal(L.perfilDaTela({ marca: 'clinica' }), 'saude');
  assert.equal(L.perfilDaTela({ marca: 'otica', perfil: 'saude' }), 'saude');
});

test('a tela vem com a marca da conta: nome no lugar do da empresa de exemplo, ano de fundação em branco', async () => {
  const L = await lib();
  const tela = M.telas.find((t) => t.id === 'l1-empresa-seguranca');
  const t = L.montarTela(tela, modelos, MARCA);
  const cab = t.grupos.cabecalho[0];
  assert.equal(cab.campos.marca, 'Padaria Real');
  assert.equal(cab.campos.desde, '', 'o "Desde 2001" da Rota Sul foi para a TV do cliente');
  assert.equal(cab.campos.status, 'Turno da manhã');
  assert.deepEqual(cab.marca.cores, MARCA.cores);
  assert.equal(cab.modo, 'escuro', 'o modo da zona se perdeu');
  assert.equal(t.grupos.principal.length, 3);
  assert.deepEqual(t.mensagens, tela.mensagens);
});

test('pôr na TV: o layout da tela, as peças dela no lugar das antigas, e o que é da TV fica', async () => {
  const L = await lib();
  const tela = M.telas.find((t) => t.id === 'l1-saude-espera');
  const t = L.montarTela(tela, modelos, MARCA);
  const antes = {
    version: 1,
    settings: { nome: 'Recepção', layoutId: 'corporate', theme: { preset: 'marca' } },
    zonas: {
      principal: { items: [{ type: 'image', src: '/velha.jpg' }], transicao: 'fade' },
      rodape: { messages: ['frase velha'], velocidade: 3, peca: { type: 'peca-html', html: '<div></div>' } },
    },
  };
  const cfg = L.aplicarTelaPronta(antes, t);
  assert.equal(cfg.settings.layoutId, 'sidebar-right');
  assert.equal(cfg.settings.nome, 'Recepção');
  assert.deepEqual(cfg.settings.theme, { preset: 'marca' });
  assert.equal(cfg.zonas.principal.items.length, 3);
  assert.ok(cfg.zonas.principal.items.every((i) => i.type === 'peca-html' && i.duracao > 0 && i.origem.tela === tela.id));
  assert.equal(cfg.zonas.principal.transicao, 'fade', 'a transição da zona se perdeu');
  assert.equal(cfg.zonas.lateral.items.length, 2);
  assert.deepEqual(cfg.zonas.rodape.messages, tela.mensagens);
  assert.equal(cfg.zonas.rodape.velocidade, 3);
  assert.equal(cfg.zonas.rodape.peca.origem.base, 'rodape-selo');
  assert.equal(antes.zonas.principal.items.length, 1, 'mexeu na config recebida');
  // A prévia desenha a primeira peça de cada zona, e o letreiro no rodapé.
  const e = L.estadoDaPrevia(t);
  assert.equal(e.zonas.principal.item.origem.base, 'servico-passos');
  assert.deepEqual(e.zonas.rodape.mensagens, tela.mensagens);
  assert.deepEqual(e.tela, { w: 1920, h: 1080 });
});

test('a galeria: grava com versão, confere na zona, só põe em TV do mesmo jeito (deitada/em pé)', () => {
  const p = fs.readFileSync(path.join(RAIZ, 'web/src/pages/TelasProntasPage.jsx'), 'utf8');
  assert.match(p, /await gravarNaTela\(tv, \(cfg\) => aplicarTelaPronta\(cfg, escolhida\)\);/);
  assert.match(p, /const naoCabe = pe != null && pe !== emPe\(escolhida\.layout\);/);
  assert.match(p, /lugar=\{zonas\[editando\.grupo\]\}/);
  const e = fs.readFileSync(path.join(RAIZ, 'web/src/components/content/EditarPeca.jsx'), 'utf8');
  assert.match(e, /conferirNosFormatos\(atual, lugar \? \{ \[lugar\.nome\]: lugar\.tamanho \} : undefined\)/);
  const h = fs.readFileSync(path.join(RAIZ, 'web/src/lib/pecaHtml.js'), 'utf8');
  assert.match(h, /const medidas = formatos && !Array\.isArray\(formatos\) \? Object\.entries\(formatos\)/);
  // A TV vazia oferece a tela pronta como começo.
  const ed = fs.readFileSync(path.join(RAIZ, 'web/src/pages/ContentEditorPage.jsx'), 'utf8');
  assert.match(ed, /onIr\('telasprontas', \{ tela: device && device\.id \}\)/);
});

/* ---------------- Nada da empresa de exemplo na TV do cliente (revisão do #239) ---------------- */

test('nenhuma tela pronta leva nome, telefone, endereço, @ ou site da empresa de exemplo para a TV', async () => {
  const L = await lib();
  const exemplos = L.nomesDeExemplo(M.marcas);
  const conta = { ...MARCA, site: '', endereco: '' };
  const proibido = (txt) => {
    const t = String(txt || '');
    const c = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return M.marcas.some((m) => t.toLowerCase().includes(m.nome.toLowerCase()))
      || /rota ?sul/i.test(t)
      || ['oticacentral', 'padariadobairro', 'studiobella', 'clinicavida', 'lanchonetedapraca', 'rotasul'].some((k) => c.includes(k))
      || /\(\d{2}\)\s?\d{4,5}-\d{4}/.test(t) || /rua das flores|av\. brasil|rua augusta/i.test(t);
  };
  // Todas as telas, aprovadas ou não: a que o dono aprovar amanhã também não pode vazar.
  for (const tela of M.telas) {
    const cfg = L.aplicarTelaPronta({ settings: {}, zonas: {} }, L.montarTela(tela, modelos, conta, exemplos));
    const json = JSON.stringify(cfg);
    assert.ok(!/_pendentes/.test(json), tela.id + ': _pendentes foi para a TV');
    for (const z of Object.values(cfg.zonas)) {
      (z.messages || []).forEach((m) => assert.ok(!proibido(m), tela.id + ': frase do rodapé "' + m + '"'));
      for (const it of [].concat(z.items || [], z.pecas || [])) {
        // O que a TV MOSTRA: o campo gravado ou, sem ele, o exemplo do HTML da peça.
        for (const d of PH.higienizar(it).campos) {
          if (d.tipo === 'img') continue;
          const v = it.campos[d.nome] != null ? it.campos[d.nome] : d.exemplo;
          if (d.nome === 'marca') assert.equal(v, 'Padaria Real', tela.id + ': ' + it.origem.base + ' sem o nome da conta');
          else assert.ok(!proibido(v), tela.id + ': ' + it.origem.base + '.' + d.nome + ' = "' + v + '"');
        }
      }
    }
  }
});

test('o que era da empresa de exemplo vira o da conta quando a conta tem (site, endereço, nome)', async () => {
  const L = await lib();
  const ex = L.nomesDeExemplo(M.marcas);
  const conta = { nome: 'Padaria Real', site: 'padariareal.com.br', endereco: 'Rua Nova, 10' };
  assert.equal(L.limparDoExemplo('https://wa.me/5511977770000', { tipo: 'qr' }, conta, ex), 'padariareal.com.br');
  assert.equal(L.limparDoExemplo('(11) 97777-0000', { tipo: 'texto' }, conta, ex), '');
  assert.equal(L.limparDoExemplo('@oticacentral', { tipo: 'texto' }, conta, ex), '');
  assert.equal(L.limparDoExemplo('Rua das Flores, 120 · Centro', { tipo: 'texto' }, conta, ex), 'Rua Nova, 10');
  assert.equal(L.limparDoExemplo('Quem faz a Rota Sul', { tipo: 'texto' }, conta, ex), 'Quem faz a Padaria Real');
  assert.equal(L.limparDoExemplo('Agende pelo WhatsApp', { tipo: 'texto' }, conta, ex), 'Agende pelo WhatsApp', 'texto comum fica');
  assert.equal(L.limparDoExemplo('Ramal do RH: 2040', { tipo: 'texto' }, conta, ex), 'Ramal do RH: 2040');
});
