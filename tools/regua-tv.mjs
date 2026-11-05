/*
 * tools/regua-tv.mjs — o robô da régua da TV (fase 2 do plano de ação).
 *
 *   npm run regua            (precisa do Playwright com o Chromium)
 *
 * Sobe o servidor num banco de teste, pareia três TVs de verdade (deitada,
 * em pé e quadrada), põe cada tipo de conteúdo com texto real de cada frente
 * em tela cheia e mede, no navegador, a letra que a TV desenha.
 *
 * A régua (docs/qa-total/REFERENCIAS.md): nenhuma letra abaixo de 4,5% do
 * lado menor da TV — é o que se lê a 4 m. Em tela cheia é bloqueio: uma
 * mudança que deixar letra pequena reprova o CI. As zonas (principal de um
 * layout com lateral) são só medidas e relatadas: a régua delas é a meta da
 * fase 3.
 *
 * Saída: o relatório no terminal e, com REGUA_SAIDA=<pasta>, as fotos e o
 * medidas.json lá.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// require, e não import: assim acha também o Playwright instalado fora do projeto (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PISO = 4.5; // % do lado menor da TV
const PORTA = 7700 + Math.floor(Math.random() * 200);
const BASE = 'http://127.0.0.1:' + PORTA;
const SAIDA = process.env.REGUA_SAIDA || '';
// REGUA_SO=precos,quiz: só os tipos pedidos (para depurar um caso).
const SO = (process.env.REGUA_SO || '').split(',').filter(Boolean);
// REGUA_FONTE="DejaVu Sans": força a letra do sistema. A fonte muda de TV para TV, e uma mais larga é a que mais quebra linha.
const FONTE = process.env.REGUA_FONTE || '';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const IMG = { comercio: '/vendor/galeria/padaria.webp', saude: '/vendor/galeria/saude-prevencao.webp', empresa: '/vendor/galeria/empresa.webp' };
const CONTAS = {
  comercio: { nome: 'Padaria Sol', cores: ['#b4532a', '#f2c14e'] },
  saude: { nome: 'Clínica Vida', cores: ['#0f766e', '#e0f2f1'] },
  empresa: { nome: 'Metalúrgica Alfa', cores: ['#23395d', '#f4a261'] },
};
// Os tipos do catálogo de cada frente (web/src/lib/contentTypes.js), com o texto que um cliente escreveria.
const CASOS = {
  comercio: {
    announce: { type: 'announce', tipo: 'evento', etiqueta: 'Sábado', titulo: 'Degustação de pães de fermentação natural', corpo: 'Das 9h às 12h, no balcão.', info: 'Padaria Sol · Rua das Flores, 120', duracao: 60 },
    promo: { type: 'promo', selo: 'OFERTA', titulo: 'Bolo de cenoura com chocolate', precoDe: '42,00', precoPor: '34,90', cta: 'Inteiro, 1 kg', imagem: IMG.comercio, duracao: 60 },
    precos: { type: 'precos', titulo: 'CAFÉ DA MANHÃ', colunas: 'auto', duracao: 60, rodape: 'Aceitamos Pix e cartão', linhas: 'BEBIDAS\nCafé expresso ; 6,00\nCafé com leite ; 7,50\nCappuccino ; 9,00\nSuco de laranja ; 10,00\nSALGADOS\nPão de queijo ; 4,50\nMisto quente ; 12,00\nCoxinha ; 8,00\nPão na chapa ; 6,00' },
    social: { type: 'social', rede: 'instagram', titulo: 'Siga a Padaria Sol', handle: '@padariasol', url: 'https://instagram.com/padariasol', qr: true, duracao: 60 },
    qrcode: { type: 'qrcode', data: 'https://wa.me/5511999999999', caption: 'Encomende pelo WhatsApp', duracao: 60 },
    image: { type: 'image', src: IMG.comercio, fit: 'cover', duracao: 60 },
  },
  saude: {
    announce: { type: 'announce', tipo: 'saude', etiqueta: 'Outubro Rosa', titulo: 'Faça o seu exame preventivo', corpo: 'Mamografia a partir dos 40 anos. Converse com a sua médica.', info: 'Clínica Vida · CRM-SP 123456', duracao: 60 },
    precos: { type: 'precos', titulo: 'EXAMES', colunas: 'auto', duracao: 60, rodape: 'Convênios: consulte a recepção', linhas: 'Hemograma ; 25,00\nGlicemia ; 15,00\nColesterol total ; 20,00\nTSH ; 35,00' },
    social: { type: 'social', rede: 'instagram', titulo: 'Dicas de saúde toda semana', handle: '@clinicavida', url: 'https://instagram.com/clinicavida', qr: true, duracao: 60 },
    qrcode: { type: 'qrcode', data: 'https://g.page/r/clinicavida/review', caption: 'Avalie o seu atendimento', duracao: 60 },
  },
  empresa: {
    announce: { type: 'announce', tipo: 'seguranca', etiqueta: 'Segurança', titulo: 'Uso obrigatório de protetor auricular no setor B', corpo: 'A partir de segunda-feira. Retire o seu no almoxarifado.', info: 'SESMT · ramal 214', duracao: 60 },
    kpi: { type: 'kpi', rotulo: 'Produção do mês', valor: '18.450', variacao: '12%', tendencia: 'alta', detalhe: 'Meta: 17.000 peças', duracao: 60 },
    quiz: { type: 'quiz', titulo: 'Quiz da SIPAT', tempo: 30, revelar: 20, perguntas: [{ pergunta: 'Qual EPI protege contra ruído?', alternativas: ['Luva', 'Protetor auricular', 'Capacete', 'Óculos'], certa: 1 }] },
    social: { type: 'social', rede: 'linkedin', titulo: 'Siga a Alfa no LinkedIn', handle: 'Metalúrgica Alfa', url: 'https://linkedin.com/company/alfa', qr: true, duracao: 60 },
  },
};
const TVS = { deitada: [1920, 1080], 'em pé': [1080, 1920], quadrada: [1080, 1080] };
// [layout, zona, bloqueia?]: tela cheia é a régua; a principal com lateral só é medida.
const ARRANJOS = [['full', 'principal', true], ['corporate', 'principal', false]];

// Roda dentro da página do player: cada texto visível da zona, com a letra que se VÊ.
function medir(zona) {
  const lado = Math.min(innerWidth, innerHeight);
  const raiz = [...document.querySelectorAll('.mt-zone')].find((e) => String(e.style.gridArea).split('/')[0].trim() === zona) || document.body;
  const RZ = raiz.getBoundingClientRect();
  const visivel = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.05) return false;
    }
    return true;
  };
  const textos = [];
  const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = andar.nextNode(); n; n = andar.nextNode()) {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    const el = n.parentElement;
    if (t.length < 2 || !el || !visivel(el)) continue;
    const faixa = document.createRange();
    faixa.selectNodeContents(n);
    const r = faixa.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    // A TV encolhe o miolo que não cabe (transform: scale, js/player.js caberNaCaixa): conta a escala.
    let escala = 1;
    for (let q = el; q && q !== document.body; q = q.parentElement) {
      const tr = getComputedStyle(q).transform;
      if (tr && tr !== 'none') { const m = new DOMMatrix(tr); escala *= Math.hypot(m.a, m.b); }
    }
    const letra = parseFloat(getComputedStyle(el).fontSize) * escala / lado * 100;
    const fora = r.left < RZ.left - 1 || r.top < RZ.top - 1 || r.right > RZ.right + 1 || r.bottom > RZ.bottom + 1;
    textos.push({ t: t.slice(0, 60), letra: +letra.toFixed(2), fora });
  }
  return { zonaPx: Math.round(RZ.width) + 'x' + Math.round(RZ.height), textos };
}

async function subirServidor() {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-regua-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '', NODE_ENV: 'test' },
  });
  const parar = () => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* segue */ } };
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch(BASE + '/tv')).ok) return parar; } catch (e) { /* ainda subindo */ }
    await espera(250);
  }
  parar();
  throw new Error('o servidor de teste não subiu');
}

async function parear(navegador, api, nome, [w, h]) {
  const ctx = await navegador.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  if (FONTE) {
    await p.addInitScript((f) => document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = ':root{--font:"' + f + '",sans-serif!important}body,.mt-slide{font-family:"' + f + '",sans-serif!important}';
      document.head.appendChild(st);
    }), FONTE);
  }
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(BASE + '/player.html?cloud=1&pid=regua' + Date.now() + Math.random().toString(36).slice(2, 6));
  let codigo = null;
  for (let i = 0; i < 40 && !codigo; i++) {
    await espera(400);
    codigo = await p.evaluate(() => { const m = document.body.innerText.match(/\b[A-Z0-9]{6}\b/); return m && m[0]; });
  }
  if (!codigo) throw new Error('a TV ' + nome + ' não mostrou o código');
  const j = await (await api.post(BASE + '/api/pair', { data: { code: codigo, name: 'TV ' + nome, nova: true } })).json();
  if (!j.id) throw new Error('parear ' + nome + ': ' + JSON.stringify(j));
  return { p, id: j.id, erros };
}

// Espera o item novo aparecer (o texto dele, ou a foto) e a entrada terminar.
async function esperarItem(p, item) {
  const marca = item.titulo || item.rotulo || item.caption || '';
  for (let i = 0; i < 40; i++) {
    const ok = await p.evaluate(([m, src]) => (m ? document.body.innerText.toUpperCase().includes(m.toUpperCase())
      : !!src && [...document.images].some((im) => im.src.includes(src) && im.complete)), [marca, item.src || '']);
    if (ok) break;
    await espera(250);
  }
  await p.evaluate(() => (document.fonts && document.fonts.ready) || null);
  // A entrada termina: as animações do CSS com fim e as do GSAP (a lista de preços entra linha a linha).
  for (let i = 0; i < 40; i++) {
    await espera(250);
    const andando = await p.evaluate(() => document.getAnimations().some((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity) ||
      // progress < 1 pega também a que ainda está no atraso (isActive é falso até ela começar).
      !!(window.gsap && window.gsap.globalTimeline.getChildren(true, true, false).some((t) => t.progress() < 1 && !t.paused() && t.repeat() !== -1)));
    if (!andando && i >= 3) break;
  }
  await espera(400);
}

async function main() {
  const parar = await subirServidor();
  const navegador = await chromium.launch();
  const fotos = [];
  try {
    for (const [frente, tipos] of Object.entries(CASOS)) {
      const painel = await navegador.newContext();
      const api = painel.request;
      const c = CONTAS[frente];
      const r = await api.post(BASE + '/api/auth/signup', { data: { email: 'regua-' + frente + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: c.nome, aceite: true, perfil: frente } });
      if (r.status() >= 300) throw new Error('cadastro ' + frente + ': ' + r.status() + ' ' + await r.text());
      await api.post(BASE + '/api/billing/dev-activate', { data: { plan: 'pro' } });
      await api.put(BASE + '/api/brand', { data: { nome: c.nome, cores: c.cores } });
      const tvs = {};
      for (const [nome, tam] of Object.entries(TVS)) tvs[nome] = await parear(navegador, api, nome, tam);
      for (const [layout, zona, bloqueia] of ARRANJOS) {
        for (const [tipo, item] of Object.entries(tipos)) {
          if (SO.length && !SO.includes(tipo)) continue;
          // As três TVs ao mesmo tempo: cada uma é uma página.
          await Promise.all(Object.entries(tvs).map(async ([orient, tv]) => {
            const cfg = { settings: { layoutId: layout, nome: c.nome }, zonas: { [zona]: { items: [item] } } };
            await api.put(BASE + '/api/devices/' + tv.id + '/config', { data: cfg });
            await esperarItem(tv.p, item);
            const id = frente + '-' + tipo + '__' + layout + '-' + orient.replace(' ', '-');
            // A TV pode redesenhar a zona logo depois (a config e a marca chegam em dois avisos): sem texto à vista, espera e mede de novo.
            let m = await tv.p.evaluate(medir, zona);
            for (let k = 0; k < 3 && !m.textos.length && (item.titulo || item.rotulo || item.caption); k++) {
              await esperarItem(tv.p, item);
              m = await tv.p.evaluate(medir, zona);
            }
            if (SAIDA) await tv.p.screenshot({ path: path.join(SAIDA, id + '.png') });
            const pequenas = m.textos.filter((x) => x.letra < PISO);
            const fora = m.textos.filter((x) => x.fora);
            // Tipo com texto e nada escrito à vista: a TV mostrou outra coisa, ou nada.
            const sumiu = !!(item.titulo || item.rotulo || item.caption) && !m.textos.length;
            fotos.push({ id, frente, tipo, layout, orient, bloqueia, zonaPx: m.zonaPx,
              menorLetra: m.textos.length ? Math.min(...m.textos.map((x) => x.letra)) : null,
              pequenas: pequenas.map((x) => x.t + ' (' + x.letra + '%)'), fora: fora.map((x) => x.t),
              erros: tv.erros.splice(0), sumiu, passa: !pequenas.length && !fora.length && !sumiu });
          }));
        }
      }
      await painel.close();
      for (const tv of Object.values(tvs)) await tv.p.context().close();
    }
  } finally {
    await navegador.close();
    parar();
  }
  if (SAIDA) fs.writeFileSync(path.join(SAIDA, 'medidas.json'), JSON.stringify(fotos, null, 1));

  let reprova = false;
  for (const [layout, , bloqueia] of ARRANJOS) {
    const doArranjo = fotos.filter((f) => f.layout === layout);
    const ok = doArranjo.filter((f) => f.passa).length;
    console.log('\n' + (bloqueia ? 'Tela cheia' : 'Principal com lateral (só medida, meta da fase 3)') + ': ' + ok + ' de ' + doArranjo.length + ' passam na régua');
    for (const f of doArranjo.filter((x) => !x.passa)) {
      console.log('  ' + (bloqueia ? '✗' : '·') + ' ' + f.id + ' (' + f.zonaPx + ')' +
        (f.pequenas.length ? ' letra abaixo de ' + PISO + '%: ' + f.pequenas.slice(0, 3).join(', ') : '') +
        (f.fora.length ? ' sai da zona: ' + f.fora.slice(0, 3).join(', ') : '') +
        (f.sumiu ? ' nenhum texto à vista' : ''));
    }
    if (bloqueia && ok < doArranjo.length) reprova = true;
  }
  const comErro = fotos.filter((f) => f.erros.length);
  for (const f of comErro) console.log('  erro na TV em ' + f.id + ': ' + f.erros[0]);
  if (comErro.length) reprova = true;
  if (reprova) {
    console.log('\nA régua da TV reprovou. A letra mínima é ' + PISO + '% do lado menor da TV (docs/qa-total/REFERENCIAS.md).');
    process.exit(1);
  }
  console.log('\nA régua da TV passou.');
}

if (SAIDA) fs.mkdirSync(SAIDA, { recursive: true });
main().catch((e) => { console.error(e); process.exit(1); });
