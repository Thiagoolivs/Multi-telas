/*
 * Fase 11: dados vivos (docs/qa-total/PLANO-DE-ACAO.md).
 *
 *   1. Preço e cardápio vindos de uma planilha: o link do Google vira o CSV,
 *      o servidor lê só do Google (sem SSRF), com teto de tempo e tamanho, e
 *      a planilha quebrada não apaga os últimos preços bons.
 *   2. Indicadores vindos de uma planilha: o conector 'planilha' (nome,
 *      valor, meta, unidade, anterior).
 *   3. As datas prontas de cada frente, calculadas para o ano.
 *
 * Nada aqui toca a internet: o "Google" é um servidor local liberado por
 * PLANILHA_HOST_TESTE (desligado por padrão, ignorado em produção).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const P = require('../server/planilha');
const M = require('../js/precos.js');
const F = require('../js/datas-frente.js');
const C = require('../server/calendario');

/* ---------------- o link, os hosts, o CSV ---------------- */

test('o link do Google Planilhas vira o endereço do CSV; outro host é recusado', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  assert.equal(P.linkParaCsv('https://docs.google.com/spreadsheets/d/' + id + '/edit?usp=sharing#gid=123').url,
    'https://docs.google.com/spreadsheets/d/' + id + '/export?format=csv&gid=123');
  assert.equal(P.linkParaCsv('docs.google.com/spreadsheets/d/' + id + '/edit').url, 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=csv');
  assert.equal(P.linkParaCsv('https://docs.google.com/spreadsheets/d/' + id + '/export?format=csv&gid=0').url,
    'https://docs.google.com/spreadsheets/d/' + id + '/export?format=csv&gid=0', 'o link já convertido fica igual');
  assert.equal(P.linkParaCsv('https://docs.google.com/spreadsheets/d/e/2PACX-1vSabcdefghijklmnopqrstuvwxyz/pubhtml?gid=55&single=true').url,
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSabcdefghijklmnopqrstuvwxyz/pub?output=csv&gid=55&single=true', 'publicar na web');
  for (const ruim of ['https://evil.com/x.csv', 'http://169.254.169.254/latest', 'http://127.0.0.1:5432/', 'https://docs.google.com.evil.com/spreadsheets/d/' + id, 'file:///etc/passwd', '']) {
    assert.ok(P.linkParaCsv(ruim).erro, 'aceitou ' + ruim);
  }
  assert.match(P.linkParaCsv('https://docs.google.com/document/d/abc/edit').erro, /não é de uma planilha/);
  // Os hosts: só o Google, em https, sem porta; e o de entrega do arquivo depois do redirecionamento.
  const pode = (u) => P.hostPermitido(new URL(u));
  assert.equal(pode('https://docs.google.com/x'), 'google');
  assert.equal(pode('https://doc-0g-2c-sheets.googleusercontent.com/export/x'), 'google');
  assert.equal(pode('https://docs.googleusercontent.com/x'), 'google');
  for (const u of ['http://docs.google.com/x', 'https://docs.google.com:8443/x', 'https://evil-sheets.googleusercontent.com.evil.com/', 'https://googleusercontent.com/', 'https://storage.googleapis.com/x', 'http://127.0.0.1:5990/x']) {
    assert.equal(pode(u), '', 'liberou ' + u);
  }
});

test('a política de cada salto: outro host, a tela de login do Google e o host de teste desligado', async () => {
  assert.match((await P.politica('https://evil.com/a.csv')).erro, /só dá para ler planilhas do Google/);
  assert.match((await P.politica('http://169.254.169.254/')).erro, /só dá para ler planilhas do Google/);
  // A planilha fechada manda para o login: vira a frase de "compartilhe com quem tem o link".
  assert.equal((await P.politica('https://accounts.google.com/ServiceLogin?continue=x')).erro, P.NAO_COMPARTILHADA);
  // PLANILHA_HOST_TESTE: desligado por padrão; ligado, só aquele host:porta; em produção, ignorado.
  delete process.env.PLANILHA_HOST_TESTE;
  assert.ok((await P.politica('http://127.0.0.1:5990/p.csv')).erro);
  process.env.PLANILHA_HOST_TESTE = '127.0.0.1:5990';
  try {
    assert.equal((await P.politica('http://127.0.0.1:5990/p.csv')).ip, '127.0.0.1');
    assert.ok((await P.politica('http://127.0.0.1:5991/p.csv')).erro, 'outra porta passou');
    process.env.RAILWAY_ENVIRONMENT = 'production';
    assert.ok((await P.politica('http://127.0.0.1:5990/p.csv')).erro, 'o host de teste valeu em produção');
  } finally { delete process.env.PLANILHA_HOST_TESTE; delete process.env.RAILWAY_ENVIRONMENT; }
});

test('o CSV como as planilhas exportam: aspas, vírgula ou ponto e vírgula, título de seção', () => {
  const google = '﻿Item,Preço,Seção,Descrição\r\nCafé expresso,"6,00",Bebidas,\r\n"Bolo ""da casa""",R$ 12,Doces,"fatia\r\ngrande"\r\nCombo,Consulte,Doces,\r\n';
  assert.deepEqual(P.lerCsv(google)[2], ['Bolo "da casa"', 'R$ 12', 'Doces', 'fatia\r\ngrande']);
  const lidos = P.lerPrecos(P.lerCsv(google));
  assert.deepEqual(lidos.itens.map((i) => [i.item, i.preco, i.texto, i.secao]),
    [['Café expresso', 6, '', 'Bebidas'], ['Bolo "da casa"', 12, '', 'Doces'], ['Combo', null, 'Consulte', 'Doces']]);
  assert.match(lidos.aviso, /1 item ficou sem preço/);
  // Excel em português (ponto e vírgula), sem cabeçalho, com a seção numa linha só com o nome.
  const excel = P.lerPrecos(P.lerCsv('BEBIDAS\nCafé;6,00\nSuco natural;10\nSALGADOS\nCoxinha;8,5'));
  assert.deepEqual(excel.itens.map((i) => [i.secao, i.item, i.preco]), [['BEBIDAS', 'Café', 6], ['BEBIDAS', 'Suco natural', 10], ['SALGADOS', 'Coxinha', 8.5]]);
  // Cabeçalho com outros nomes, colunas em outra ordem.
  const outra = P.lerPrecos(P.lerCsv('Categoria\tValor\tProduto\nLanches\t24,90\tX-Salada'));
  assert.deepEqual(outra.itens.map((i) => [i.item, i.preco, i.secao]), [['X-Salada', 24.9, 'Lanches']]);
  assert.match(P.lerPrecos(P.lerCsv('só um título')).aviso, /não achei nenhum item/);
  assert.ok(P.lerPrecos(P.lerCsv(Array.from({ length: 900 }, (_, i) => 'Item ' + i + ';1').join('\n'))).itens.length <= P.MAX_LINHAS);
});

test('indicadores da planilha: nome, valor, meta, unidade, anterior e "menos é melhor"', () => {
  const r = P.lerIndicadores(P.lerCsv('Indicador,Valor,Meta,Unidade,Anterior\nVendas do dia,"12.300",20000,R$,11000\nRefugo,"2,6",2,%,\nSem número,abc,,,\n'));
  assert.deepEqual(r.lista.map((i) => [i.chave, i.valor, i.meta, i.unidade, i.anterior]),
    [['vendas-do-dia', 12300, 20000, 'R$', 11000], ['refugo', 2.6, 2, '%', undefined]]);
  assert.match(r.avisos[0].aviso, /ignorado/);
  // Sem cabeçalho: nome; valor; meta.
  assert.deepEqual(P.lerIndicadores(P.lerCsv('Produção;10250;12000')).lista.map((i) => [i.nome, i.valor, i.meta]), [['Produção', 10250, 12000]]);
});

/* ---------------- a busca, contra um "Google" local ---------------- */

function servidorCsv(rotas) {
  const s = http.createServer((req, res) => {
    const r = rotas[req.url.split('?')[0]];
    if (!r) { res.writeHead(404); return res.end(); }
    return r(req, res);
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

test('a busca: CSV bom, redirecionamento para outro host, página de login, arquivo grande, erro do servidor', async (t) => {
  let csv = 'Item;Preço\nCafé;6,00\n';
  const outro = await servidorCsv({ '/x.csv': (q, r) => { r.writeHead(200, { 'content-type': 'text/csv' }); r.end('Roubado;1'); } });
  const g = await servidorCsv({
    '/ok.csv': (q, r) => { r.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' }); r.end(csv); },
    '/pula': (q, r) => { r.writeHead(307, { location: 'http://127.0.0.1:' + outro.address().port + '/x.csv' }); r.end(); },
    '/login': (q, r) => { r.writeHead(302, { location: 'https://accounts.google.com/ServiceLogin' }); r.end(); },
    '/html': (q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>Login</title>'); },
    '/grande.csv': (q, r) => { r.writeHead(200, { 'content-type': 'text/csv' }); r.end('Item;1\n'.repeat(120000)); },
    '/quebrou': (q, r) => { r.writeHead(500); r.end(); },
  });
  t.after(() => { g.close(); outro.close(); delete process.env.PLANILHA_HOST_TESTE; });
  const base = 'http://127.0.0.1:' + g.address().port;
  process.env.PLANILHA_HOST_TESTE = '127.0.0.1:' + g.address().port;

  assert.deepEqual((await P.buscarCsv(base + '/ok.csv')).linhas, [['Item', 'Preço'], ['Café', '6,00']]);
  assert.match((await P.buscarCsv(base + '/pula')).erro, /só dá para ler planilhas do Google/, 'seguiu o redirecionamento para outro host');
  assert.equal((await P.buscarCsv(base + '/login')).erro, P.NAO_COMPARTILHADA);
  assert.equal((await P.buscarCsv(base + '/html')).erro, P.NAO_COMPARTILHADA);
  assert.match((await P.buscarCsv(base + '/grande.csv')).erro, /passou de 512 KB/);
  assert.match((await P.buscarCsv(base + '/quebrou')).erro, /500/);
  assert.match((await P.buscarCsv(base + '/sumiu.csv')).erro, /não foi encontrada/);

  // Lê, grava e — com a planilha quebrada — mantém os últimos itens bons.
  const gravado = [];
  const db = { atualizarPlanilha: async (id, tid, campos) => gravado.push(campos) };
  const linha = { id: 'pl_1', tenant_id: 't1', origem: 'google', url: base + '/ok.csv', linhas: '' };
  const ok = await P.atualizarAgora(linha, { db, agora: 1000 });
  assert.equal(ok.mudou, true);
  assert.deepEqual(JSON.parse(gravado[0].linhas).map((i) => [i.item, i.preco]), [['Café', 6]]);
  assert.deepEqual([gravado[0].ultimoOk, gravado[0].ultimoErro, gravado[0].proxima], [1000, '', 1000 + P.INTERVALO_MS]);
  const igual = await P.atualizarAgora(Object.assign({}, linha, { linhas: gravado[0].linhas }), { db, agora: 2000 });
  assert.equal(igual.mudou, false, 'avisaria a TV sem mudar nada');
  const ruim = await P.atualizarAgora(Object.assign({}, linha, { url: base + '/quebrou' }), { db, agora: 3000 });
  assert.match(ruim.erro, /500/);
  assert.equal(gravado[2].linhas, undefined, 'a planilha quebrada apagou os preços');
  assert.equal(gravado[2].ultimoOk, undefined);
  assert.match(gravado[2].ultimoErro, /500/);
  // O CSV enviado é lido do banco, sem pedido nenhum.
  const doArquivo = await P.atualizarAgora({ id: 'pl_2', tenant_id: 't1', origem: 'csv', csv: 'Pão;1,5', linhas: '' }, { db });
  assert.deepEqual(doArquivo.itens.map((i) => i.preco), [1.5]);
});

test('o relógio: lê as planilhas do Google que venceram os 5 minutos e só avisa a TV quando mudou', async (t) => {
  const g = await servidorCsv({ '/p.csv': (q, r) => { r.writeHead(200, { 'content-type': 'text/csv' }); r.end('Café;6'); } });
  t.after(() => { g.close(); delete process.env.PLANILHA_HOST_TESTE; });
  process.env.PLANILHA_HOST_TESTE = '127.0.0.1:' + g.address().port;
  const url = 'http://127.0.0.1:' + g.address().port + '/p.csv';
  const linhas = [{ id: 'pl_a', tenant_id: 't1', origem: 'google', url, linhas: '' }, { id: 'pl_b', tenant_id: 't2', origem: 'google', url, linhas: JSON.stringify([{ item: 'Café', preco: 6, texto: '', secao: '', descricao: '' }]) }];
  const marcas = [];
  const avisos = [];
  const db = { planilhasParaBuscar: async () => linhas, atualizarPlanilha: async (id, tid, c) => marcas.push([id, Object.keys(c).join(',')]) };
  const volta = require('../server/routes/planilha').ligarRelogio({ db, avisarTelas: async (tid, ev) => avisos.push([tid, ev]), erros: { registrar: (e) => { throw e; } } });
  await volta();
  assert.deepEqual(marcas[0], ['pl_a', 'proxima'], 'a próxima busca é marcada antes de buscar');
  assert.deepEqual(avisos, [['t1', 'planilhas']], 'a planilha que não mudou avisou a TV');
});

/* ---------------- a TV: a tabela e o cardápio pronto ---------------- */

test('js/precos.js: os itens da planilha viram a tabela e os campos do cardápio pronto', () => {
  const itens = [
    { item: 'Café', preco: 6, secao: 'Bebidas', descricao: '' },
    { item: 'Suco', preco: 10.5, secao: 'Bebidas', descricao: '300 ml' },
    { item: 'Coxinha', preco: 1234.9, secao: 'Salgados', descricao: '' },
    { item: 'Combo', preco: null, texto: 'Consulte', secao: 'Salgados' },
  ];
  assert.deepEqual(M.daPlanilha(itens).map((l) => l.tipo === 'secao' ? '# ' + l.nome : l.nome + ' ' + l.preco),
    ['# Bebidas', 'Café R$ 6,00', 'Suco R$ 10,50', '# Salgados', 'Coxinha R$ 1234,90', 'Combo Consulte']);
  assert.deepEqual(M.daPlanilha(itens, 'bebidas').map((l) => l.nome), ['Café', 'Suco'], 'uma seção só, sem acento e maiúscula');
  assert.equal(M.textoDaPlanilha(itens, 'Bebidas'), 'Café ; 6,00\nSuco ; 10,50', 'a cópia em texto que o painel guarda no item');
  // O "Consulte" fica de fora da cópia em texto (lá ele viraria um título de seção).
  assert.deepEqual(M.ler(M.textoDaPlanilha(itens)).map((l) => l.nome), ['BEBIDAS', 'Café', 'Suco', 'SALGADOS', 'Coxinha']);
  // pecas-ouro/cardapio-colunas: item1-nome, item1-preco, item1-centavos, item1-medida.
  const nomes = [...ler('pecas-ouro/cardapio-colunas.html').matchAll(/data-campo="([\w-]+)"/g)].map((m) => m[1]);
  const r = M.camposDaPeca(nomes, itens);
  assert.deepEqual([r.campos['item1-nome'], r.campos['item1-preco'], r.campos['item1-centavos'], r.campos['item2-medida']], ['Café', '6', ',00', '300 ml']);
  assert.deepEqual([r.campos['item3-preco'], r.campos['item3-centavos'], r.campos['item4-preco']], ['1.234', ',90', 'Consulte']);
  assert.deepEqual(r.vazias, ['item5-nome', 'item6-nome'], 'a linha sem item some inteira');
  assert.ok(r.esconder.includes('item5-preco') && r.mostrar.includes('item2-medida') && r.esconder.includes('item1-medida'));
  // pecas-ouro/cardapio-categorias: grupo1, g1-item1, g1-preco1, g1-det1 (por seção).
  const porSecao = [...ler('pecas-ouro/cardapio-categorias.html').matchAll(/data-campo="([\w-]+)"/g)].map((m) => m[1]);
  const g = M.camposDaPeca(porSecao, itens);
  assert.deepEqual([g.campos.grupo1, g.campos['g1-item2'], g.campos['g1-preco2'], g.campos['g1-det2'], g.campos.grupo2, g.campos['g2-preco2']],
    ['Bebidas', 'Suco', '10,50', '300 ml', 'Salgados', 'Consulte']);
  assert.ok(g.esconder.includes('grupo3') && g.vazias.includes('g3-item1'));
  assert.equal(M.hora(new Date(2026, 10, 6, 14, 5).getTime()), '14:05');
  assert.equal(M.hora(0), '');
});

test('a TV: lê as planilhas de 5 em 5 minutos e no aviso, guarda para ficar sem rede, redesenha o que está no ar e mostra "Atualizado às"', () => {
  const PL = ler('js/player.js');
  assert.match(PL, /setInterval\(function \(\) \{ loadPlanilhas\(dev\.id\); \}, 5 \* 60 \* 1000\);/);
  assert.match(PL, /document\.addEventListener\('mt:planilhas-mudou', function \(\) \{ loadPlanilhas\(dev\.id\); \}\);/);
  assert.match(PL, /localStorage\.setItem\('mt\.planilhas', novo\)/);
  assert.match(PL, /\.catch\(function \(\) \{ \/\* offline: mantém o cache \*\/ \}\);\n  \}\n\n  \/\/ Busca a relação/);
  assert.match(PL, /global\.addEventListener\('mt:planilhas', aoMudarPlanilha\);/);
  assert.match(PL, /global\.removeEventListener\('mt:planilhas', aoMudarPlanilha\);/);
  const CL = ler('js/cloud.js');
  assert.match(CL, /es\.addEventListener\('planilhas', \(\) => \{/);
  assert.match(CL, /localStorage\.removeItem\('mt\.planilhas'\);/, 'a TV de outra conta herdaria os preços');
  const R = ler('js/render.js');
  assert.match(R, /'Atualizado às ' \+ h/);
  assert.match(R, /const daPlanilha = pl && P && P\.daPlanilha \? P\.daPlanilha\(pl\.itens, item\.planilhaSecao\) : null;/);
  assert.match(R, /linha\.setAttribute\('data-oculto', ''\)/);
  assert.match(ler('sw.js'), /mt-shell-v(8[1-9]|9\d|\d{3})/, 'a TV não pegaria o player novo');
  // O servidor avisa a TV só quando muda, e a rota da TV pede o token da TV.
  assert.match(ler('server/routes/planilha.js'), /if \(!r\.erro && r\.mudou\) avisarTelas\(linha\.tenant_id, 'planilhas', \{\}\)/);
  assert.match(ler('server/routes/telas.js'), /sub === 'planilhas'\) \{\n\s+if \(!dtOk && !owns\) return sendJson\(res, 403/);
});

/* ---------------- as datas prontas de cada frente ---------------- */

test('as datas prontas: cada frente com as dela, calculadas para o ano (as móveis também)', () => {
  const hoje = new Date(2026, 10, 6);
  const titulos = (f) => F.proximas(f, hoje).map((d) => d.titulo);
  for (const t of ['Dia das Mães', 'Dia dos Namorados', 'Dia dos Pais', 'Dia das Crianças', 'Black Friday', 'Natal', 'Liquidação de janeiro']) assert.ok(titulos('comercio').includes(t), 'comércio sem ' + t);
  for (const t of ['Janeiro Branco', 'Fevereiro Roxo e Laranja', 'Abril Azul', 'Maio Amarelo', 'Junho Vermelho', 'Agosto Dourado', 'Setembro Amarelo', 'Outubro Rosa', 'Novembro Azul', 'Dezembro Vermelho', 'Vacinação contra a gripe']) {
    assert.ok(titulos('saude').includes(t), 'saúde sem ' + t);
  }
  for (const t of ['SIPAT', 'Dia do Trabalho', 'Aniversário da empresa', 'Eleição da CIPA', 'Natal', 'Confraternização de fim de ano']) assert.ok(titulos('empresa').includes(t), 'empresa sem ' + t);
  const de = (f, id) => F.proximas(f, hoje).find((d) => d.id === id);
  assert.equal(de('comercio', 'dia-maes').data, '2027-05-09', '2º domingo de maio de 2027');
  assert.equal(de('comercio', 'dia-pais').data, '2027-08-08', '2º domingo de agosto de 2027');
  assert.equal(de('comercio', 'black-friday').data, '2026-11-27', 'última sexta de novembro');
  assert.equal(de('comercio', 'pascoa').data, '2027-03-28');
  // O mês inteiro: o Novembro Azul do mês corrente ainda vale, do dia 1º ao 30.
  assert.deepEqual([de('saude', 'novembro-azul').data, de('saude', 'novembro-azul').antecedencia, de('saude', 'novembro-azul').mesInteiro], ['2026-11-30', 29, true]);
  assert.equal(de('saude', 'outubro-rosa').data, '2027-10-31', 'o Outubro Rosa que passou vai para o ano que vem');
  // Em ordem, nos próximos 12 meses; as sem dia (a empresa escolhe) no fim.
  const datas = F.proximas('saude', hoje).map((d) => d.data);
  assert.deepEqual(datas, datas.slice().sort());
  assert.ok(datas.every((d) => d >= '2026-11-06' && d <= '2027-11-06'));
  assert.deepEqual(F.proximas('empresa', hoje).filter((d) => d.semDia).map((d) => d.id), ['sipat', 'cipa', 'aniversario-empresa']);
  // Cada uma é um evento que o calendário aceita (server/calendario.js).
  for (const f of ['comercio', 'saude', 'empresa']) for (const d of F.proximas(f, hoje).filter((x) => x.data)) assert.ok(C.normalizar(d), f + ': ' + d.titulo);
});

test('o calendário entende os nomes das datas prontas no texto colado; a Agenda põe com um toque', async () => {
  const hoje = new Date(2026, 10, 5);
  const r = C.datasPorNome('Setembro Amarelo e Dia dos Namorados', hoje);
  assert.deepEqual(r.map((e) => [e.titulo, e.data, e.antecedencia]), [['Dia dos Namorados', '2027-06-12', 10], ['Setembro Amarelo', '2027-09-30', 29]]);
  // O que já funcionava continua (fase 5).
  assert.deepEqual((await C.entender('Black Friday e Natal', hoje)).map((e) => e.data + ' ' + e.titulo), ['2026-11-27 Black Friday', '2026-12-25 Natal']);
  const pagina = ler('web/src/pages/CalendarioPage.jsx');
  assert.match(pagina, /DatasFrente\.proximas\(perfil\.id, new Date\(\)\)/);
  assert.match(pagina, /onClick=\{\(\) => porNaProgramacao\(\[\{ data: dia, titulo: d\.titulo, tipo: d\.tipo, detalhe: d\.detalhe, antecedencia: d\.antecedencia, prioridade: 'normal', alvo \}\]\)\}/);
  // O cartaz da campanha do mês mostra o mês, não o último dia.
  const cal = await import('../web/src/lib/calendario.js');
  assert.equal(cal.campanhaDoMes({ data: '2027-10-31', antecedencia: 30 }), true);
  assert.equal(cal.campanhaDoMes({ data: '2027-10-31', antecedencia: 7 }), false);
  assert.equal(cal.campanhaDoMes({ data: '2026-12-25', antecedencia: 24 }), false);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 7600 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}, o.headers || {}) }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, txt, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}

test('a rota: liga a planilha, a TV recebe, mudou na planilha muda na TV, quebrada fica com o último bom; cada conta só vê a dela', async (t) => {
  let csv = 'Item;Preço;Seção\nCafé expresso;6,00;Bebidas\nPão de queijo;4,50;Salgados\n';
  let quebrada = false;
  const g = await servidorCsv({
    '/precos.csv': (q, r) => { if (quebrada) { r.writeHead(500); return r.end(); } r.writeHead(200, { 'content-type': 'text/csv' }); r.end(csv); },
    '/kpis.csv': (q, r) => { r.writeHead(200, { 'content-type': 'text/csv' }); r.end('Indicador,Valor,Meta,Unidade,Anterior\nVendas do dia,12300,20000,R$,11000\n'); },
  });
  const host = '127.0.0.1:' + g.address().port;
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-f11-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', RAILWAY_ENVIRONMENT: '', PLANILHA_HOST_TESTE: host },
  });
  t.after(() => { servidor.kill(); g.close(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const conta = async (n) => (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'f11-' + n + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Padaria ' + n, aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  const c = await conta('a');
  assert.equal((await pedir('/api/planilhas')).status, 401);
  assert.equal((await pedir('/api/planilhas', { method: 'POST', cookie: c, json: { link: 'https://evil.com/p.csv' } })).status, 400);
  assert.equal((await pedir('/api/planilhas', { method: 'POST', cookie: c, json: { link: 'http://169.254.169.254/latest/meta-data' } })).status, 400);

  const criada = (await pedir('/api/planilhas', { method: 'POST', cookie: c, json: { nome: 'Cardápio', link: 'http://' + host + '/precos.csv' } })).json;
  assert.equal(criada.erro, undefined);
  assert.deepEqual(criada.planilha.itens.map((i) => [i.item, i.preco, i.secao]), [['Café expresso', 6, 'Bebidas'], ['Pão de queijo', 4.5, 'Salgados']]);
  assert.equal(JSON.stringify(criada).includes('"csv"'), false, 'o CSV cru foi para o painel');
  const id = criada.planilha.id;

  // A TV recebe (com o token dela).
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  await pedir('/api/devices/' + tv.id + '/config', { headers: { 'x-device-token': tv.deviceToken } });
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);
  const naTv = async () => (await pedir('/api/devices/' + tv.id + '/planilhas', { headers: { 'x-device-token': tv.deviceToken } })).json.planilhas;
  assert.deepEqual((await naTv())[0].itens.map((i) => i.preco), [6, 4.5]);
  assert.ok((await naTv())[0].em > 0, 'sem a hora para o "Atualizado às"');
  assert.equal((await pedir('/api/devices/' + tv.id + '/planilhas')).status, 403);

  // Mudou a célula: a próxima leitura muda a TV.
  csv = csv.replace('6,00', '6,50');
  const lida = (await pedir('/api/planilhas/' + id + '/atualizar', { method: 'POST', cookie: c })).json;
  assert.equal(lida.planilha.itens[0].preco, 6.5);
  assert.equal((await naTv())[0].itens[0].preco, 6.5);

  // Quebrou: o erro em palavras no painel, e a TV com o último preço bom.
  quebrada = true;
  const erro = (await pedir('/api/planilhas/' + id + '/atualizar', { method: 'POST', cookie: c })).json;
  assert.match(erro.erro, /500/);
  assert.match(erro.planilha.ultimoErro, /500/);
  assert.equal(erro.planilha.itens[0].preco, 6.5);
  assert.equal((await naTv())[0].itens[0].preco, 6.5);

  // O CSV enviado, e o arquivo grande demais.
  const arq = (await pedir('/api/planilhas/' + id, { method: 'PUT', cookie: c, json: { csv: 'Bolo;30\nTorta;45' } })).json;
  assert.deepEqual(arq.planilha.itens.map((i) => i.item), ['Bolo', 'Torta']);
  assert.equal(arq.planilha.origem, 'csv');
  assert.equal((await pedir('/api/planilhas/' + id, { method: 'PUT', cookie: c, json: { csv: 'x;1\n'.repeat(200000) } })).status, 400);

  // Outra conta não vê, não lê e não apaga.
  const c2 = await conta('b');
  assert.deepEqual((await pedir('/api/planilhas', { cookie: c2 })).json.planilhas, []);
  assert.equal((await pedir('/api/planilhas/' + id + '/atualizar', { method: 'POST', cookie: c2 })).status, 404);
  assert.equal((await pedir('/api/planilhas/' + id, { method: 'DELETE', cookie: c2 })).status, 404);
  assert.equal((await pedir('/api/planilhas', { cookie: c })).json.planilhas.length, 1);

  // Indicadores da planilha (o conector 'planilha').
  const kpi = (await pedir('/api/kpis/conectores', { method: 'POST', cookie: c, json: { modo: 'planilha', nome: 'Metas', link: 'http://' + host + '/kpis.csv' } })).json;
  assert.equal(kpi.conector.modo, 'planilha');
  assert.deepEqual(kpi.indicadores.map((i) => [i.chave, i.valor, i.meta, i.unidade]), [['vendas-do-dia', 12300, 20000, 'R$']]);
  const doTv = (await pedir('/api/devices/' + tv.id + '/kpis', { headers: { 'x-device-token': tv.deviceToken } })).json.indicadores;
  assert.deepEqual(doTv.map((i) => [i.chave, i.valor, i.anterior]), [['vendas-do-dia', 12300, 11000]], 'o "anterior" da planilha dá a seta');
  assert.equal((await pedir('/api/kpis/conectores', { method: 'POST', cookie: c, json: { modo: 'planilha', link: 'https://evil.com/k.csv' } })).status, 400);

  // A exportação leva as planilhas; desligar apaga.
  assert.match((await pedir('/api/privacidade/exportar', { cookie: c })).txt, /"planilhas"/);
  assert.equal((await pedir('/api/planilhas/' + id, { method: 'DELETE', cookie: c })).status, 200);
  assert.deepEqual((await pedir('/api/planilhas', { cookie: c })).json.planilhas, []);
});
