#!/usr/bin/env node
'use strict';
/*
 * npm run conector:build → conector/dist/MultiTelasConector.zip
 *
 * O .exe é um Single Executable Application do Node: o node.exe oficial
 * (baixado de nodejs.org e conferido pelo sha256 fixado aqui) com o conector
 * embutido. Roda de um Linux (o CI) porque o Node 26 monta o .exe de outra
 * plataforma com `--build-sea` e "executable" apontando para o node.exe.
 *
 * Passos:
 *  1. junta src/ num arquivo só (o SEA só embute um script, e o `require`
 *     de dentro dele só carrega módulos do próprio Node);
 *  2. baixa o Node do Windows (e o do Linux, para montar e para o teste de
 *     fumaça), confere o sha256, guarda em dist/cache;
 *  3. monta o MultiTelasConector.exe e, como prova, a mesma coisa para Linux,
 *     que é executada aqui (versão, proxy embutido, certificados do sistema);
 *  4. fecha o .zip com o .exe, os scripts do PowerShell e o LEIA-ME — os
 *     textos em CRLF e com BOM, porque o PowerShell 5.1 lê .ps1 sem BOM como
 *     ANSI e estraga os acentos.
 *
 * `--so-bundle` faz só o passo 1 (é o que o teste usa: sem rede).
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const CONECTOR = path.join(__dirname, '..');
const RAIZ = path.join(CONECTOR, '..');
const PACOTE = require('../package.json');

// Node 26 (LTS "Lithium", com suporte até 2029): tem --build-sea, o proxy
// embutido (http.setGlobalProxyFromEnv) e --use-system-ca no Windows.
// Trocar de versão = trocar a versão e os dois sha256 (do SHASUMS256.txt dela).
const NODE_VERSAO = 'v26.13.0';
const TAR_LINUX = 'node-' + NODE_VERSAO + '-linux-x64.tar.xz';
const NODE = {
  versao: NODE_VERSAO,
  sha256: {
    'win-x64/node.exe': '14319838b3f355e0398c13569a90270bce4fc68f25189f58c59b03dadae0e6d5',
    [TAR_LINUX]: 'd28a96af6c38596f6d9d97c0ee531c13d238d757742387d1928de822d959e997',
  },
};

// O Node embutido sempre com estas opções: os certificados do Windows (o da
// empresa, distribuído por GPO, entra sozinho) e sem o aviso "experimental"
// do proxy no console. "none": NODE_OPTIONS da máquina não muda o conector.
const EXEC_ARGV = ['--use-system-ca', '--disable-warning=ExperimentalWarning'];

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : null;
}

/* ---------------- 1. um arquivo só ---------------- */

function resolver(de, pedido) {
  const base = path.resolve(de, pedido);
  for (const c of [base, base + '.js', base + '.json', path.join(base, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  throw new Error('não achei o módulo "' + pedido + '" pedido em ' + de);
}

function empacotar(entrada) {
  const modulos = new Map();
  const fila = [entrada];
  while (fila.length) {
    const arq = fila.shift();
    const id = path.relative(CONECTOR, arq).split(path.sep).join('/');
    if (modulos.has(id)) continue;
    let codigo = fs.readFileSync(arq, 'utf8');
    if (arq.endsWith('.json')) {
      // Do package.json só o que o código lê: não embute scripts nem caminhos.
      const j = JSON.parse(codigo);
      codigo = 'module.exports = ' + JSON.stringify(id === 'package.json' ? { name: j.name, version: j.version } : j) + ';';
    } else {
      codigo = codigo.replace(/^#!.*\n/, '');
      for (const m of codigo.matchAll(/require\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g)) fila.push(resolver(path.dirname(arq), m[2]));
    }
    modulos.set(id, codigo);
  }
  const partes = [
    "'use strict';",
    '// MultiTelas Conector ' + PACOTE.version + ' — gerado por conector/build/build.js a partir de conector/src. Não edite.',
    '(function () {',
    'const definicoes = {',
  ];
  for (const [id, codigo] of modulos) partes.push(JSON.stringify(id) + ': function (module, exports, require, __filename, __dirname) {\n' + codigo + '\n},');
  partes.push(
    '};',
    'const cache = {};',
    'const requireDoNode = require;',
    'function normalizar(p) { const out = []; for (const s of p.split("/")) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); } return out.join("/"); }',
    'function carregar(id) {',
    '  if (cache[id]) return cache[id].exports;',
    '  const def = definicoes[id];',
    '  if (!def) throw new Error("módulo ausente no pacote: " + id);',
    '  const module = { exports: {} };',
    '  cache[id] = module;',
    '  const dir = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "";',
    '  const req = (pedido) => {',
    '    if (!pedido.startsWith("./") && !pedido.startsWith("../")) return requireDoNode(pedido);',
    '    const base = normalizar((dir ? dir + "/" : "") + pedido);',
    '    for (const c of [base, base + ".js", base + ".json", base + "/index.js"]) if (definicoes[c]) return carregar(c);',
    '    throw new Error("módulo ausente no pacote: " + pedido);',
    '  };',
    '  def.call(module.exports, module, module.exports, req, id, dir);',
    '  return module.exports;',
    '}',
    'carregar(' + JSON.stringify(path.relative(CONECTOR, entrada).split(path.sep).join('/')) + ').principal().then(',
    '  (codigo) => { process.exitCode = codigo; },',
    '  (e) => { process.stderr.write("Erro: " + (e && e.message ? e.message : e) + "\\n"); process.exitCode = 1; });',
    '})();',
    '',
  );
  return { codigo: partes.join('\n'), modulos: [...modulos.keys()] };
}

/* ---------------- 2. o Node oficial, conferido ---------------- */

function sha256(arquivo) { return crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex'); }

async function baixar(relativo, cache) {
  const esperado = NODE.sha256[relativo];
  const destino = path.join(cache, NODE.versao + '-' + relativo.replace(/\//g, '-'));
  if (fs.existsSync(destino) && sha256(destino) === esperado) return destino;
  const url = 'https://nodejs.org/dist/' + NODE.versao + '/' + relativo;
  console.log('Baixando ' + url);
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' respondeu ' + r.status);
  const bytes = Buffer.from(await r.arrayBuffer());
  const obtido = crypto.createHash('sha256').update(bytes).digest('hex');
  if (obtido !== esperado) throw new Error('sha256 de ' + relativo + ' não confere (esperado ' + esperado + ', veio ' + obtido + '). Não uso.');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(destino + '.tmp', bytes);
  fs.renameSync(destino + '.tmp', destino);
  return destino;
}

// O Node que MONTA precisa ser da mesma versão do que vai dentro do .exe.
async function nodeParaMontar(cache) {
  if (process.version === NODE.versao) return process.execPath;
  if (process.platform === 'win32' && process.arch === 'x64') return baixar('win-x64/node.exe', cache);
  if (process.platform === 'linux' && process.arch === 'x64') {
    const tar = await baixar(TAR_LINUX, cache);
    const dir = path.join(cache, 'node-' + NODE.versao + '-linux-x64');
    const bin = path.join(dir, 'bin', 'node');
    if (!fs.existsSync(bin)) execFileSync('tar', ['-xJf', tar, '-C', cache]);
    if (!fs.existsSync(bin)) throw new Error('não achei ' + bin + ' depois de extrair');
    return bin;
  }
  throw new Error('para montar o .exe é preciso o Node ' + NODE.versao + ' (ou Linux x64 / Windows x64, onde ele é baixado sozinho)');
}

function montarSea(node, principal, executavel, saida, trabalho) {
  const cfg = {
    main: principal,
    output: saida,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false, // código pré-compilado não atravessa plataforma (Linux → Windows)
    execArgv: EXEC_ARGV,
    execArgvExtension: 'none',
  };
  if (executavel) cfg.executable = executavel;
  const arquivo = path.join(trabalho, path.basename(saida) + '.sea.json');
  fs.writeFileSync(arquivo, JSON.stringify(cfg, null, 2));
  execFileSync(node, ['--build-sea', arquivo], { stdio: 'inherit' });
  if (!fs.existsSync(saida)) throw new Error('o Node não gerou ' + saida);
}

/* ---------------- 4. o zip ---------------- */

let TABELA_CRC = null;
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  if (!TABELA_CRC) {
    TABELA_CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABELA_CRC[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function horaDos(d) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// ZIP comum (deflate): o "Extrair tudo" do Windows abre sem programa extra.
function zipar(arquivos) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  const { hora, data } = horaDos(new Date());
  for (const { nome, dados } of arquivos) {
    const comprimido = zlib.deflateRawSync(dados, { level: 9 });
    const n = Buffer.from(nome, 'utf8');
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(hora, 10); local.writeUInt16LE(data, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(hora, 12); central.writeUInt16LE(data, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20); central.writeUInt32LE(dados.length, 24); central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locais.push(local, n, comprimido);
    centrais.push(central, n);
    offset += local.length + n.length + comprimido.length;
  }
  const cd = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, cd, fim]);
}

// Texto para o Windows: CRLF; com BOM quando quem lê é o PowerShell 5.1 ou o Bloco de Notas antigo.
function textoWindows(arquivo, bom) {
  const t = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '').replace(/\r?\n/g, '\r\n');
  return Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(t, 'utf8')]);
}

/* ---------------- tudo ---------------- */

async function principal() {
  const dist = path.resolve(argumento('--saida') || path.join(CONECTOR, 'dist'));
  const trabalho = path.join(dist, 'build');
  fs.mkdirSync(trabalho, { recursive: true });

  const { codigo, modulos } = empacotar(path.join(CONECTOR, 'src', 'main.js'));
  const bundle = path.join(dist, 'MultiTelasConector.js');
  fs.writeFileSync(bundle, codigo);
  console.log('Pacote de um arquivo só: ' + bundle + ' (' + modulos.length + ' módulos, ' + Math.round(codigo.length / 1024) + ' KB)');
  if (process.argv.includes('--so-bundle')) return;

  const cache = path.join(CONECTOR, 'dist', 'cache');
  const node = await nodeParaMontar(cache);
  const nodeExe = await baixar('win-x64/node.exe', cache);
  const exe = path.join(dist, 'MultiTelasConector.exe');
  montarSea(node, bundle, nodeExe, exe, trabalho);

  // Prova de fumaça: o mesmo pacote num SEA da plataforma de cá, executado de verdade.
  if (process.platform === 'linux' && !process.argv.includes('--sem-prova')) {
    const prova = path.join(trabalho, 'conector-linux');
    montarSea(node, bundle, null, prova, trabalho);
    const versao = execFileSync(prova, ['versao'], { encoding: 'utf8' }).trim();
    if (versao !== PACOTE.version) throw new Error('o SEA de prova respondeu "' + versao + '" em vez de ' + PACOTE.version);
    // Um NODE_OPTIONS que derrubaria o Node: se o executável o lesse, nem abriria.
    const diag = execFileSync(prova, ['diagnostico', '--pasta', trabalho], { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_OPTIONS: '--require ./nao-existe.js' }) });
    if (!/Proxy embutido no Node: sim/.test(diag)) throw new Error('o Node embutido não tem o proxy embutido:\n' + diag);
    if (!/embutido no \.exe/.test(diag)) throw new Error('o SEA de prova não se reconheceu como executável:\n' + diag);
    if (!/Opções do Node: --use-system-ca/.test(diag)) throw new Error('as opções do Node não entraram no executável:\n' + diag);
    console.log('Prova de fumaça (SEA Linux, mesmo pacote): OK — versão ' + versao + ', proxy embutido, certificados do sistema, NODE_OPTIONS ignorado.');
  }
  // O .exe em si não roda aqui; ao menos confere que é um PE do Windows com o conector dentro e o fusível ligado.
  const pe = fs.readFileSync(exe);
  if (pe[0] !== 0x4d || pe[1] !== 0x5a) throw new Error(exe + ' não é um executável do Windows');
  if (!pe.includes(Buffer.from('NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2:1'))) throw new Error('o fusível do SEA não foi ligado em ' + exe);
  if (!pe.includes(Buffer.from('MultiTelas Conector ' + PACOTE.version + ' — gerado por conector/build/build.js'))) throw new Error('o conector não está dentro de ' + exe);

  const shaExe = sha256(exe);
  const arquivos = [
    { nome: 'MultiTelasConector.exe', dados: pe },
    { nome: 'instalar.ps1', dados: textoWindows(path.join(CONECTOR, 'windows', 'instalar.ps1'), true) },
    { nome: 'desinstalar.ps1', dados: textoWindows(path.join(CONECTOR, 'windows', 'desinstalar.ps1'), true) },
    { nome: 'conector.exemplo.json', dados: textoWindows(path.join(CONECTOR, 'conector.exemplo.json'), false) },
    { nome: 'LEIA-ME.txt', dados: textoWindows(path.join(RAIZ, 'docs', 'implantacao', 'CONECTOR.md'), true) },
    { nome: 'SHA256.txt', dados: Buffer.from(shaExe + '  MultiTelasConector.exe\r\n') },
  ];
  const zip = path.join(dist, 'MultiTelasConector.zip');
  fs.writeFileSync(zip, zipar(arquivos));
  console.log('');
  console.log('Pronto: ' + zip + ' (' + Math.round(fs.statSync(zip).size / 1024 / 1024) + ' MB)');
  console.log('  MultiTelasConector.exe  sha256 ' + shaExe + '  (Node ' + NODE.versao + ' embutido)');
}

module.exports = { empacotar, zipar, crc32, NODE, EXEC_ARGV };

if (require.main === module) {
  principal().catch((e) => { console.error('Falhou: ' + e.message); process.exitCode = 1; });
}
