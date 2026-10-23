/*
 * Transições profissionais (EXECUTOR D29).
 *
 * "Sem piscar, sem remontar a tela inteira ao trocar layout, reorganização
 * animada só com transform e opacity." Trocar o layout derrubava o palco
 * (teardownZones + buildStage): a tela sumia, o vídeo voltava ao zero. E a
 * zona que mudava era esvaziada antes de o novo entrar. Conferido na TV do
 * navegador embutido: as zonas que continuam são os MESMOS elementos depois
 * da troca, deslizam (transform) e a nova entra esmaecendo (opacity); a
 * remontagem que sobrou (layout dinâmico) cruza com a tela velha.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const P = ler('js/player.js');
const L = require('../js/templates.js');

// Um trecho do player (de `inicio` até o fim da função/objeto), rodado à parte.
function trecho(inicio) {
  const i = P.indexOf(inicio);
  assert.ok(i >= 0, 'sumiu do player: ' + inicio);
  return P.slice(i, P.indexOf('\n  }', i) + 4);
}
function funcao(nome) { return trecho('function ' + nome + '('); }

function assinaturas() {
  const ctx = { MT_getLayout: L.getLayout, module: {} };
  vm.createContext(ctx);
  const codigo = [trecho('const FORA_DA_ZONA = {').replace(/\};?\s*$/, '};'), funcao('fingerprint'), funcao('assinaturaAjustes'),
    funcao('assinaturaZona'), funcao('contextoDaZona'), funcao('relogioNoCabecalho'),
    'module.exports = { assinaturaZona, assinaturaAjustes };'].join('\n');
  vm.runInContext(codigo, ctx);
  return ctx.module.exports;
}

test('trocar de layout não muda a assinatura da zona que continua igual; muda a que o layout redesenha', () => {
  const { assinaturaZona, assinaturaAjustes } = assinaturas();
  const zonas = { principal: { items: [{ type: 'image', src: '/a.jpg' }] }, lateral: { items: [] }, rodape: { messages: ['oi'] }, cabecalho: { header: true } };
  const cfg = (layoutId) => ({ settings: { layoutId, transicao: 'fade' }, zonas });
  const a = (layoutId, z) => assinaturaZona(cfg(layoutId), z, assinaturaAjustes(cfg(layoutId).settings));
  // Lateral do outro lado: a principal, a lateral e o rodapé continuam no ar.
  assert.equal(a('dashboard', 'principal'), a('sidebar-right', 'principal'));
  assert.equal(a('dashboard', 'lateral'), a('sidebar-right', 'lateral'));
  assert.equal(a('dashboard', 'rodape'), a('sidebar-right', 'rodape'));
  // Ganhar cabeçalho redesenha: a peça deixa de repetir a marca, o relógio do rodapé sai.
  assert.notEqual(a('sidebar-right', 'principal'), a('corporate', 'principal'));
  assert.notEqual(a('sidebar-right', 'rodape'), a('corporate', 'rodape'));
  // Outro ajuste da tela (a transição) ainda refaz, como antes.
  const outra = { settings: { layoutId: 'dashboard', transicao: 'slide' }, zonas };
  assert.notEqual(a('dashboard', 'principal'), assinaturaZona(outra, 'principal', assinaturaAjustes(outra.settings)));
  // O relógio de cima saiu (D28): o rodapé é refeito para mostrar o dele.
  const semRelogio = { settings: { layoutId: 'corporate', transicao: 'fade' }, zonas: Object.assign({}, zonas, { cabecalho: { header: true, relogio: false } }) };
  assert.notEqual(a('corporate', 'rodape'), assinaturaZona(semRelogio, 'rodape', assinaturaAjustes(semRelogio.settings)));
});

test('a troca de layout reaproveita as zonas e anima só com transform e opacity', () => {
  const ap = funcao('aplicarNoPalco');
  assert.match(ap, /if \(podeReorganizar\(cfg\)\) \{ reorganizarPalco\(cfg\); return; \}/);
  assert.match(ap, /teardownZones\(\{ cruzar: !!palco \}\);/);
  const re = funcao('reorganizarPalco');
  assert.match(re, /viva\.tipo === zone\.type && viva\.formato === \(zone\.formato \|\| ''\)/, 'reaproveita zona de outro tipo/formato');
  assert.match(re, /viva\.el\.style\.gridArea = zone\.area;/);
  assert.doesNotMatch(re, /stage\.appendChild\(viva\.el\)|insertBefore\(viva\.el/, 'mover a zona no DOM recarrega iframe e live');
  assert.doesNotMatch(re, /teardownZones|innerHTML = ''/);
  // Só transform e opacity animam (nada de width/height/top/left/grid em transição).
  const transicoes = re.match(/transition = '[^']*'|transition = 'opacity|transition = 'transform [^;]*/g) || [];
  assert.ok(transicoes.length >= 3, transicoes.join(' | '));
  for (const t of transicoes) assert.match(t, /'(none|opacity|transform)|^transition = ''$/, 'anima outra propriedade: ' + t);
  assert.match(re, /'translate\(' \+ dx \+ 'px,' \+ dy \+ 'px\) scale\(' \+ sx \+ ',' \+ sy \+ '\)'/);
  assert.match(re, /formatBusyUntil = nowMs\(\) \+ dur \+ 400;/, 'troca de conteúdo em cima do movimento');
  assert.match(re, /if \(leve\) return;/, 'TV fraca: troca seca');
  // O palco que se move sozinho continua sendo remontado (cruzando).
  assert.match(funcao('podeReorganizar'), /if \(!palco \|\| palco\.movel\) return false;/);
  assert.match(P, /palco = \{ chave: assinaturaPalco\(cfg\), zonas: \{\}, movel: \(auto && arrangements\.length > 1\) \|\| !!layout\.dynamic \};/);
});

test('sem piscar: a zona que muda e o palco remontado esmaecem por cima do novo', () => {
  const tz = funcao('trocarZona');
  assert.match(tz, /saindo\.className = 'mt-zona-saindo';/);
  assert.match(tz, /while \(viva\.el\.firstChild\) saindo\.appendChild\(viva\.el\.firstChild\);/);
  assert.ok(tz.indexOf('esmaecerESumir(saindo') < tz.indexOf('viva.ctrl = iniciarZona('), 'o novo entra antes de o velho sair');
  const td = funcao('teardownZones');
  assert.match(td, /velha\.className = 'mt-palco-saindo';/);
  assert.match(td, /velha\.style\.gridTemplateAreas = stage\.style\.gridTemplateAreas;/, 'a tela velha perde a grade enquanto esmaece');
  assert.match(funcao('esmaecerESumir'), /setTimeout\(\(\) => \{ el\.style\.opacity = '0'; \}, 30\);/, 'requestAnimationFrame não roda com a aba escondida');
  const css = ler('css/player.css');
  assert.match(css, /\.mt-zona-saindo \{[^}]*position: absolute; inset: 0; z-index: 4;[^}]*transition: opacity \.5s ease;/);
  assert.match(css, /\.mt-palco-saindo \{[^}]*display: grid;[^}]*padding: inherit; gap: inherit;[^}]*transition: opacity \.6s ease;/);
  assert.match(ler('sw.js'), /mt-shell-v(5[5-9]|[6-9]\d)/, 'a TV não recebe o player novo');
});
