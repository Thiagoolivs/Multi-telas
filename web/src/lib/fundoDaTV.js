/*
 * O FUNDO DA TV no painel (EXECUTOR §2d, item 41): a MESMA conta do player
 * (js/theme.js), para a escolha em Ajustes › Aparência mostrar a cor que a
 * TV vai pintar — e não um palpite do painel.
 */
import '../../../js/cor.js';
import '../../../js/fontes.js';
import '../../../js/tokens.js';
import '../../../js/theme.js';

export const FUNDOS_TV = [
  ['pecas', 'Combinar com as peças', 'O fundo das peças que estão na TV.'],
  ['claro', 'Claro', 'O tema, na versão clara.'],
  ['escuro', 'Escuro', 'O tema, na versão escura.'],
  ['cor', 'Uma cor', 'A cor que você escolher.'],
];

// A cor do palco para um modo de fundo, com as peças que estão na TV agora.
export function corDoFundo(theme, zonas, fundo) {
  const T = globalThis.MTTheme;
  if (!T) return null;
  const pecas = T.pecasDaConfig({ zonas });
  // 'Uma cor' sem cor ainda mostra a que vai entrar ao escolher (a mesma de escolherFundo).
  const extra = fundo === 'cor' && !(theme && theme.fundoCor) ? { fundoCor: '#f5efe8' } : {};
  const t = T.resolve({ ...(theme || {}), fundo, ...extra }, { pecas });
  return { bg: t.bg, bg2: t.bg2, text: t.text, temPecas: !!pecas };
}
