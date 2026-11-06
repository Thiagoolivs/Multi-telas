/*
 * A TV DE VERDADE NO PAINEL (fase 10, reteste do bloco 8).
 *
 * O "Na TV agora" era um desenho parecido com a TV: o cabeçalho virava uma
 * caixa escrita "Cabeçalho", o texto ficava num roxo-escuro fixo e a logo e
 * a cor da marca não apareciam. Agora o painel abre o PRÓPRIO player num
 * quadro, no tamanho da TV, e reduz. Quem desenha é o mesmo código da parede:
 * cabeçalho com logo, relógio e clima, rodapé, tema da marca, peças e textos.
 *
 * Aqui fica o que não depende do navegador: a lista de arquivos do player e
 * a programação que o quadro recebe.
 */

/*
 * Os arquivos do player, na ordem do player.html. Fica de fora só o
 * js/boot.js: ele registra o service worker da TV e pede tela cheia, coisas
 * da TV, não do painel. O teste confere que a lista casa com o player.html.
 */
export const SCRIPTS_DA_TV = [
  'js/perf.js', 'js/vendor/gsap.min.js', 'js/cor.js', 'js/fontes.js', 'js/peca.js', 'js/animacao.js', 'js/tokens.js',
  'js/peca-html.js', 'js/peca-render.js', 'js/templates.js', 'js/theme.js', 'js/datas-br.js', 'js/seasons.js',
  'js/adaptive.js', 'js/expediente.js', 'js/storage.js', 'js/news.js', 'js/graficos.js', 'js/precos.js', 'js/quiz.js',
  'js/render.js', 'js/ambiente.js', 'js/exibicoes.js', 'js/cloud.js', 'js/senha.js', 'js/rodizio.js', 'js/player.js',
];

/*
 * A página do quadro. `data-mt-previa` põe o player no modo prévia (sem
 * nuvem, sem som, sem guardar nada). `leve` é o modo das TVs de verdade
 * (js/perf.js): sem vidro desfocado, mais barato para várias miniaturas.
 * `versao` vai no endereço de cada arquivo: o painel novo nunca roda com
 * um player velho guardado no navegador.
 */
export function paginaDaTv({ leve = false, versao = '' } = {}) {
  const v = versao ? '?v=' + encodeURIComponent(versao) : '';
  return '<!doctype html><html lang="pt-BR" data-mt-previa="1"' + (leve ? ' class="mt-perf"' : '') + '><head><meta charset="utf-8">'
    + '<link rel="stylesheet" href="/css/player.css' + v + '"><link rel="stylesheet" href="/css/animacao.css' + v + '">'
    // A prévia não tem mouse nem rolagem: é uma imagem viva da TV.
    + '<style>html,body{overflow:hidden;pointer-events:none}</style>'
    + '</head><body><main id="stage" class="mt-stage"></main>'
    + SCRIPTS_DA_TV.map((s) => '<script src="/' + s + v + '"></script>').join('')
    + '</body></html>';
}

// O item que a TV deixa ir ao ar (js/player.js, ehExemplo): o exemplo do "Adicionar" não vai.
const vaiAoAr = (it) => !!it && typeof it === 'object' && !(it.meta && it.meta.exemplo);

/*
 * A programação que o quadro recebe: a da TV, com UM item por parte — o que
 * a TV contou estar no ar (`estado`), ou o que a pessoa está editando
 * (`foco`, no "Como vai ficar"), ou o primeiro que vai ao ar. Assim o quadro
 * mostra a mesma coisa que a parede neste instante, parado nele.
 *
 * Fica de fora o que é do aparelho e não do desenho: o horário de
 * funcionamento (quem diz se a TV está dormindo é a própria TV), a música, o
 * giro (a prévia já nasce em pé) e o layout que se mexe sozinho.
 *
 * `extras.logo` e `extras.frente`: a logo da conta e a frente, que o
 * servidor só põe na programação que vai para a TV.
 */
export function configDaPrevia(cfg, { estado = null, foco = null, logo = null, frente = '' } = {}) {
  if (!cfg || typeof cfg !== 'object') return null;
  const c = JSON.parse(JSON.stringify(cfg));
  const s = c.settings = { ...(c.settings || {}) };
  delete s.expediente; delete s.audio; delete s.girar; delete s.remoteConfigUrl;
  s.layoutAuto = false;
  if (logo && logo.url) s.logo = logo;
  if (frente && !s.frente) s.frente = frente;
  const zonas = c.zonas || (c.zonas = {});
  const contou = (estado && estado.zonas) || {};
  const relogio = [];
  for (const id of Object.keys(zonas)) {
    const z = zonas[id];
    if (!z || !Array.isArray(z.items)) continue;
    const itens = z.items;
    const daTv = contou[id] || {};
    let item = null;
    if (foco && foco.zona === id && itens[foco.indice]) item = itens[foco.indice];
    else if (daTv.item) item = daTv.item;
    else item = itens.find(vaiAoAr) || null;
    if (daTv.relogio && !(foco && foco.zona === id)) relogio.push(id);
    if (!item) continue;
    // O horário da peça não vale aqui: a TV já disse que ela está no ar agora.
    const umSo = { ...item };
    if (umSo.agendamento) umSo.agendamento = { ...umSo.agendamento, ativo: false };
    z.items = [umSo];
  }
  return { config: c, relogio };
}

/*
 * O tamanho do quadro: o da TV que respondeu, ou o do layout, sempre com
 * 1080 no lado menor (o mesmo desenho da TV, js/render.js escalaDaTela).
 */
export function tamanhoDaTv(estado, layout) {
  const t = estado && estado.tela;
  let w = t && t.w > 0 ? t.w : 0;
  let h = t && t.h > 0 ? t.h : 0;
  if (!w || !h) {
    const emPe = !!layout && (layout.orientation || '') === 'portrait';
    w = emPe ? 1080 : 1920; h = emPe ? 1920 : 1080;
  }
  const base = 1080 / Math.min(w, h);
  return [Math.round(w * base), Math.round(h * base)];
}
