/*
 * Copiar formatação — o "pincel" do Canva.
 *
 * A ideia é simples e o valor é grande: alguém acerta um texto (fonte, peso,
 * cor, sombra, entrelinha) depois de dez ajustes, e precisa dos outros seis
 * textos iguais. Sem pincel, são sessenta ajustes.
 *
 * O que ele NÃO copia é o que decide se ele ajuda ou atrapalha:
 *
 *   - geometria (x, y, w, h, rot) — copiar formato não é mover nem redimensionar;
 *   - conteúdo (text, src, name, shape) — o elemento continua sendo ele mesmo;
 *   - identidade (id, grupo, travado, oculto).
 *
 * E há uma armadilha de nome: `peso` é a espessura da FONTE no texto (100–900)
 * e a espessura do TRAÇO no ícone (1–3). Copiar de um para o outro deixa o
 * ícone com traço 800. Por isso as propriedades específicas só atravessam
 * entre elementos do MESMO tipo; entre tipos diferentes passa só o que
 * significa a mesma coisa em todos.
 */

// Vale para qualquer tipo: significam a mesma coisa em texto, forma, ícone e imagem.
export const FORMATO_COMUM = ['opacidade', 'sombra', 'borda', 'radius'];

// Só atravessam entre elementos do mesmo tipo.
export const FORMATO_POR_TIPO = {
  texto: ['cor', 'fonte', 'peso', 'tamanho', 'align', 'italico', 'caixaAlta', 'espacamento', 'entrelinha', 'auto', 'escala'],
  forma: ['fill'],
  icone: ['cor', 'peso'],
  imagem: ['fit'],
};

function clonar(v) {
  if (v == null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}

/* As propriedades que um elemento deste tipo leva no pincel. */
export function propriedadesDeFormato(tipo) {
  return FORMATO_COMUM.concat(FORMATO_POR_TIPO[tipo] || []);
}

/*
 * Tira o "molde" de um elemento. Guarda o tipo junto porque é ele que decide,
 * na hora de aplicar, o que pode atravessar.
 */
export function lerFormato(el) {
  if (!el) return null;
  const tipo = el.tipo || 'texto';
  const props = {};
  propriedadesDeFormato(tipo).forEach((k) => { props[k] = clonar(el[k]); });
  return { id: el.id, tipo, props };
}

/*
 * Monta o patch que deixa `el` com a formatação do molde.
 *
 * Propriedade AUSENTE no molde vira `undefined` no destino, de propósito: se
 * a origem não tem sombra, "copiar formatação" tem que TIRAR a sombra do
 * destino. Copiar só o que existe deixaria resíduo, e o resultado não ficaria
 * igual ao que se apontou — que é a única coisa que o pincel promete.
 */
export function aplicarFormato(el, molde) {
  if (!el || !molde) return null;
  const tipo = el.tipo || 'texto';
  const chaves = tipo === molde.tipo ? propriedadesDeFormato(tipo) : FORMATO_COMUM;
  const patch = {};
  chaves.forEach((k) => { patch[k] = clonar(molde.props[k]); });
  return patch;
}

/* Se vale a pena aplicar: entre tipos diferentes só há os comuns, e mesmo
 * assim adianta (opacidade, sombra, borda e canto atravessam bem). */
export function podeAplicar(el, molde) {
  return !!(el && molde && el.id !== molde.id);
}
