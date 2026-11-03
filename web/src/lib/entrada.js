import { frenteDoSlug } from './perfil.js';

/*
 * Por onde a tela começa (QA de lançamento, 03/11): "Testar 14 dias grátis"
 * na landing levava a /app/?frente=X e a tela abria em "Entrar na sua conta"
 * — quem ainda não tem conta achava que precisava de uma que não tinha. Com
 * ?frente= (de uma landing) ou ?cadastro=1 (qualquer link de "testar"),
 * começa no cadastro. O resto (o link do e-mail, quem só volta) segue no login.
 */
export function modoInicial(busca) {
  try {
    const q = new URLSearchParams(busca);
    if (q.get('reset') || q.get('verify')) return 'login'; // o AuthScreen troca para o modo do link (nova senha, confirmar e-mail)
    if (q.get('cadastro') === '1' || frenteDoSlug(q.get('frente'))) return 'signup';
  } catch (e) { /* endereço estranho: entra pelo login */ }
  return 'login';
}
