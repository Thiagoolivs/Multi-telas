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
 * fase 3. A tela da chamada de senha (fase 12) também é tela cheia, e
 * também bloqueia.
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
// Os layouts, para preencher as outras zonas (sem isso a zona vazia some e a medida vira outra: fase 3).
const { getLayout } = createRequire(import.meta.url)('../js/templates.js');
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PISO = 4.5; // % do lado menor da TV, no balcão (4 m)
// Fase 3: a letra mínima depende de onde a TV fica, e a frente dá o padrão (js/player.js, LOCAIS).
const PISO_DA_FRENTE = { comercio: 4.5, saude: 3.5, empresa: 3 };
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
// O que o "Adicionar" punha antes da fase 4 (web/src/lib/contentTypes.js, make): nada disso pode aparecer na TV.
const PADROES = [
  { type: 'text', titulo: 'Novo comunicado', corpo: '', align: 'center', duracao: 60 },
  { type: 'announce', tipo: 'comunicado', titulo: 'Aviso importante', corpo: '', duracao: 60 },
  { type: 'promo', titulo: 'Produto', precoPor: '', duracao: 60 },
  { type: 'kpi', rotulo: 'Meta do mês', valor: '0', tendencia: 'estavel', duracao: 60 },
  { type: 'social', rede: 'instagram', titulo: 'Siga-nos', handle: '', qr: false, duracao: 60 },
  { type: 'announce', tipo: 'evento', titulo: 'Degustação no sábado', corpo: 'Exemplo marcado', meta: { exemplo: true }, duracao: 60 },
];
const TEXTO_PADRAO = /^(novo comunicado|aviso importante|produto|meta do mês|siga-nos|exemplo marcado|degustação no sábado)$/i;
/*
 * [layout por TV, zona, nome, bloqueia?]. Tela cheia é a régua; as zonas são
 * a meta da fase 3 (85% da lateral e do bloco). Cada TV usa o layout que o
 * painel oferece para ela (js/templates.js, MT_layoutsByOrientation): a
 * lateral só existe deitada; o bloco é a metade dos "Dois quadrados"
 * deitada e a de baixo do "Em pé · duas zonas".
 */
const ARRANJOS = [
  [{ deitada: 'full', 'em pé': 'full', quadrada: 'full' }, 'principal', 'Tela cheia', true],
  [{ deitada: 'corporate' }, 'principal', 'Principal com lateral', false],
  [{ deitada: 'corporate' }, 'lateral', 'Lateral', false],
  [{ deitada: 'duo', 'em pé': 'portrait-duo' }, 'secundaria', 'Bloco', false],
];

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

/*
 * As peças-ouro (as artes da IA) na bancada: em cada formato de tela cheia,
 * o piso da letra entra inteiro? Quando não cabe, o player põe o maior que
 * cabe e marca a peça (data-mt-piso-cedeu, js/peca-render.js) — a letra
 * fica abaixo da régua. PENDENTES são as que ainda esperam redesenho; uma
 * peça que não está na lista e cede reprova, e uma da lista que passou a
 * caber é avisada para sair dela.
 */
const FORMATOS_CHEIOS = ['Tela cheia 16:9', 'Vertical 9:16', 'Quadrada 1:1'];
const PENDENTES = new Set([]);
// A meta da fase 3 para as zonas (lateral e bloco): 85% das fotos na régua.
const META_ZONAS = 0.85;
async function conferirPecas(navegador, local) {
  const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', 'manifesto.json'), 'utf8'));
  const p = await navegador.newPage({ viewport: { width: 1920, height: 1200 } });
  const saida = [];
  // Sem local: as peças de destaque, na conta da tela cheia. Com local: também as da lateral (a zona pequena ganha piso).
  for (const peca of manifesto.pecas.filter((x) => x.papeis.includes('destaque') || (local && x.papeis.includes('lateral')))) {
    await p.goto(BASE + '/bancada.html?ver=peca&peca=' + peca.id + '&modo=todos&tamanho=caber' + (local ? '&local=' + local : ''));
    await p.evaluate(() => (document.fonts && document.fonts.ready) || null);
    await espera(1500);
    const porZona = await p.evaluate(() => {
      const out = {};
      document.querySelectorAll('#palco section.linha').forEach((sec) => {
        const nome = sec.querySelector('h2').textContent.split(' · ').slice(0, -1).join(' · ');
        let menor = 1;
        sec.querySelectorAll('*').forEach((el) => {
          const pl = el.shadowRoot && el.shadowRoot.querySelector('.mt-palco');
          if (pl && pl.hasAttribute('data-mt-piso-cedeu')) menor = Math.min(menor, parseFloat(pl.getAttribute('data-mt-piso-cedeu')));
        });
        out[nome] = menor;
      });
      return out;
    });
    for (const [zona, cedeu] of Object.entries(porZona)) {
      const cheia = FORMATOS_CHEIOS.includes(zona);
      // Tela cheia sem local; as zonas com o local do escritório (a Empresas, onde elas moram).
      if (local ? !cheia : cheia) saida.push({ id: peca.id, zona, cedeu, cheia, local: local || '' });
    }
  }
  await p.close();
  return saida;
}

async function main() {
  const parar = await subirServidor();
  const navegador = await chromium.launch();
  const fotos = [];
  const padroes = [];
  // Fase 12: a tela da chamada de senha (tela cheia: a régua de 4,5% vale para qualquer frente).
  const senhas = [];
  let pecas = [];
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
      for (const [layouts, zona, nomeArranjo, bloqueia] of ARRANJOS) {
        for (const [tipo, item] of Object.entries(tipos)) {
          if (SO.length && !SO.includes(tipo)) continue;
          // As três TVs ao mesmo tempo: cada uma é uma página (e só as que têm este arranjo).
          await Promise.all(Object.entries(tvs).filter(([orient]) => layouts[orient]).map(async ([orient, tv]) => {
            const layout = layouts[orient];
            const zonas = { [zona]: { items: [item] } };
            for (const z of getLayout(layout).zones) {
              if (z.type === 'playlist' && z.id !== zona) zonas[z.id] = { items: [{ type: 'image', src: IMG[frente], fit: 'cover', duracao: 60 }] };
            }
            const cfg = { settings: { layoutId: layout, nome: c.nome }, zonas };
            await api.put(BASE + '/api/devices/' + tv.id + '/config', { data: cfg });
            await esperarItem(tv.p, item);
            const id = frente + '-' + tipo + '__' + layout + '-' + zona + '-' + orient.replace(' ', '-');
            // A TV pode redesenhar a zona logo depois (a config e a marca chegam em dois avisos): sem texto à vista, espera e mede de novo.
            let m = await tv.p.evaluate(medir, zona);
            for (let k = 0; k < 3 && !m.textos.length && (item.titulo || item.rotulo || item.caption); k++) {
              await esperarItem(tv.p, item);
              m = await tv.p.evaluate(medir, zona);
            }
            if (SAIDA) await tv.p.screenshot({ path: path.join(SAIDA, id + '.png') });
            // Fase 4: a marca entra sozinha — a TV de uma conta com marca sai com a cor dela.
            const corDaTv = await tv.p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim().toLowerCase());
            const comMarca = corDaTv === c.cores[0].toLowerCase();
            const piso = PISO_DA_FRENTE[frente] || PISO;
            const pequenas = m.textos.filter((x) => x.letra < piso - 0.005);
            const fora = m.textos.filter((x) => x.fora);
            // Tipo com texto e nada escrito à vista: a TV mostrou outra coisa, ou nada.
            const sumiu = !!(item.titulo || item.rotulo || item.caption) && !m.textos.length;
            fotos.push({ id, frente, tipo, layout, zona, arranjo: nomeArranjo, orient, bloqueia, piso, zonaPx: m.zonaPx,
              menorLetra: m.textos.length ? Math.min(...m.textos.map((x) => x.letra)) : null,
              pequenas: pequenas.map((x) => x.t + ' (' + x.letra + '%)'), fora: fora.map((x) => x.t),
              erros: tv.erros.splice(0), sumiu, comMarca, corDaTv, passa: !pequenas.length && !fora.length && !sumiu });
          }));
        }
      }
      // Fase 4: o padrão antigo do "Adicionar" nunca vai ao ar.
      const tv = tvs.deitada;
      for (const item of PADROES) {
        await api.put(BASE + '/api/devices/' + tv.id + '/config', { data: { settings: { layoutId: 'full', nome: c.nome }, zonas: { principal: { items: [item] } } } });
        await espera(2500);
        const textos = (await tv.p.evaluate(medir, 'principal')).textos.map((x) => x.t);
        const visto = textos.filter((t) => TEXTO_PADRAO.test(t));
        padroes.push({ frente, tipo: item.type, visto });
      }
      // Fase 12: a recepção chama e a senha toma a tela inteira nas três TVs (js/senha.js).
      if (frente === 'saude') {
        const r = await api.post(BASE + '/api/senha/proxima', { data: { prefixo: 'A', local: { tipo: 'consultorio', numero: 12 } } });
        if (r.status() >= 300) throw new Error('chamar a senha: ' + r.status() + ' ' + await r.text());
        await Promise.all(Object.entries(tvs).map(async ([orient, tv]) => {
          let ok = false;
          for (let i = 0; i < 40 && !ok; i++) { ok = await tv.p.evaluate(() => !!document.querySelector('.mt-senha-tela.mt-in .mt-senha-num')); if (!ok) await espera(150); }
          await espera(1300);   // a entrada termina e a letra assenta
          const m = ok ? await tv.p.evaluate(() => {
            const raiz = document.querySelector('.mt-senha-tela');
            const lado = Math.min(innerWidth, innerHeight);
            const R = raiz.getBoundingClientRect();
            const textos = [];
            const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
            for (let n = andar.nextNode(); n; n = andar.nextNode()) {
              const t = n.textContent.trim();
              if (t.length < 2 || !n.parentElement || getComputedStyle(n.parentElement).display === 'none') continue;
              const fx = document.createRange(); fx.selectNodeContents(n); const q = fx.getBoundingClientRect();
              textos.push({ t, letra: +(parseFloat(getComputedStyle(n.parentElement).fontSize) / lado * 100).toFixed(2),
                fora: q.right > R.right + 1 || q.bottom > R.bottom + 1 || q.left < R.left - 1 || q.top < R.top - 1 });
            }
            const num = raiz.querySelector('.mt-senha-num');
            return { textos, senha: +(parseFloat(getComputedStyle(num).fontSize) / lado * 100).toFixed(2) };
          }) : { textos: [], senha: 0 };
          if (SAIDA) await tv.p.screenshot({ path: path.join(SAIDA, 'senha-' + orient.replace(' ', '-') + '.png') });
          const pequenas = m.textos.filter((x) => x.letra < PISO - 0.005);
          const fora = m.textos.filter((x) => x.fora);
          senhas.push({ orient, apareceu: ok, senha: m.senha, menor: m.textos.length ? Math.min(...m.textos.map((x) => x.letra)) : null,
            pequenas: pequenas.map((x) => x.t + ' (' + x.letra + '%)'), fora: fora.map((x) => x.t),
            passa: ok && !pequenas.length && !fora.length && m.senha >= PISO * 4 });
        }));
      }
      await painel.close();
      for (const tv of Object.values(tvs)) await tv.p.context().close();
    }
    pecas = (await conferirPecas(navegador)).concat(await conferirPecas(navegador, 'escritorio'));
  } finally {
    await navegador.close();
    parar();
  }
  if (SAIDA) fs.writeFileSync(path.join(SAIDA, 'medidas.json'), JSON.stringify({ fotos, pecas, senhas }, null, 1));

  let reprova = false;
  for (const [, , nome, bloqueia] of ARRANJOS) {
    const doArranjo = fotos.filter((f) => f.arranjo === nome);
    if (!doArranjo.length) continue;
    const ok = doArranjo.filter((f) => f.passa).length;
    const rotulo = bloqueia ? '' : (nome === 'Lateral' || nome === 'Bloco') ? ' (meta: 85%)' : ' (só medida)';
    console.log('\n' + nome + rotulo + ': ' + ok + ' de ' + doArranjo.length + ' passam na régua (' + Math.round(ok / doArranjo.length * 100) + '%)');
    for (const f of doArranjo.filter((x) => !x.passa)) {
      console.log('  ' + (bloqueia ? '✗' : '·') + ' ' + f.id + ' (' + f.zonaPx + ')' +
        (f.pequenas.length ? ' letra abaixo de ' + f.piso + '%: ' + f.pequenas.slice(0, 3).join(', ') : '') +
        (f.fora.length ? ' sai da zona: ' + f.fora.slice(0, 3).join(', ') : '') +
        (f.sumiu ? ' nenhum texto à vista' : ''));
    }
    if (bloqueia && ok < doArranjo.length) reprova = true;
    // Fase 3: a lateral e o bloco passam em 85% ou mais (a meta da fase), e a mudança que baixar disso reprova.
    if ((nome === 'Lateral' || nome === 'Bloco') && ok / doArranjo.length < META_ZONAS) { console.log('  ✗ abaixo da meta de ' + Math.round(META_ZONAS * 100) + '%'); reprova = true; }
  }
  if (senhas.length) {
    console.log('\nChamada de senha em tela cheia (régua de ' + PISO + '%; a senha com 4× isso ou mais): ' + senhas.filter((x) => x.passa).length + ' de ' + senhas.length);
    for (const x of senhas.filter((y) => !y.passa)) {
      console.log('  ✗ ' + x.orient + (x.apareceu ? '' : ': a senha não apareceu') + (x.pequenas.length ? ' letra abaixo da régua: ' + x.pequenas.slice(0, 3).join(', ') : '')
        + (x.fora.length ? ' sai da tela: ' + x.fora.slice(0, 3).join(', ') : '') + (x.apareceu && x.senha < PISO * 4 ? ' a senha ficou pequena (' + x.senha + '%)' : ''));
      reprova = true;
    }
  }
  const cheias = pecas.filter((x) => x.cheia);
  console.log('\nPeças-ouro em tela cheia (16:9, 9:16 e 1:1): ' + cheias.filter((x) => x.cedeu >= 1).length + ' de ' + cheias.length + ' com a letra inteira');
  for (const x of cheias.filter((y) => y.cedeu < 1)) {
    const pendente = PENDENTES.has(x.id + ' · ' + x.zona);
    console.log('  ' + (pendente ? '· (pendente) ' : '✗ ') + x.id + ' · ' + x.zona + ': o piso cedeu para ' + Math.round(x.cedeu * 100) + '%');
    if (!pendente) reprova = true;
  }
  for (const k of PENDENTES) {
    const [id, zona] = k.split(' · ');
    if (cheias.some((x) => x.id === id && x.zona === zona && x.cedeu >= 1)) console.log('  ✓ ' + k + ' já cabe: tire de PENDENTES em tools/regua-tv.mjs');
  }
  for (const zona of ['Destaque · Corporativo', 'Lateral · Corporativo']) {
    const l = pecas.filter((x) => x.zona === zona);
    if (!l.length) continue;
    const ok = l.filter((x) => x.cedeu >= 1).length;
    console.log('Peças-ouro em ' + zona + ', no escritório (3%): ' + ok + ' de ' + l.length + ' com a letra inteira');
    for (const x of l.filter((y) => y.cedeu < 1)) console.log('  · ' + x.id + ': o piso cedeu para ' + Math.round(x.cedeu * 100) + '%');
    if (ok / l.length < META_ZONAS) { console.log('  ✗ abaixo da meta de ' + Math.round(META_ZONAS * 100) + '%'); reprova = true; }
  }
  const semMarca = fotos.filter((f) => f.bloqueia && !f.comMarca);
  console.log('\nCom a cor da marca (tela cheia): ' + (fotos.filter((f) => f.bloqueia).length - semMarca.length) + ' de ' + fotos.filter((f) => f.bloqueia).length);
  for (const f of semMarca.slice(0, 5)) console.log('  ✗ ' + f.id + ': a TV está com ' + (f.corDaTv || 'nada') + ' (a marca é outra)');
  if (semMarca.length) reprova = true;
  const comPadrao = padroes.filter((x) => x.visto.length);
  console.log('Texto padrão do "Adicionar" na TV: ' + comPadrao.length + ' de ' + padroes.length);
  for (const x of comPadrao) console.log('  ✗ ' + x.frente + ' · ' + x.tipo + ': ' + x.visto.join(', '));
  if (comPadrao.length) reprova = true;
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
