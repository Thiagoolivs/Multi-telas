/*
 * A biblioteca gráfica no painel — o MESMO catálogo de js/graficos.js que a
 * TV e a exportação usam. Importa por efeito colateral e reexporta o global,
 * nunca uma cópia (ver docs/ESTADO-DO-PROJETO.md, módulos UMD).
 */
import '../../../js/graficos.js';

const G = globalThis.MTGraficos;

export const GRAFICOS = G.CATALOGO;
export const svgAtributosGrafico = G.svgAtributos;
export const svgMioloGrafico = G.svgMiolo;
export const desenharGraficoCanvas = G.desenharCanvas;
