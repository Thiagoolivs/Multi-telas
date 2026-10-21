/*
 * server/suporte.js — o operador DENTRO da conta de um cliente (EXECUTOR
 * item 13, "entrar como cliente, com registro").
 *
 * Suporte de verdade às vezes precisa ver o painel como o dono vê: a tela
 * que "não atualiza", a peça que "sumiu". A entrada é uma sessão comum do
 * dono da conta, com três diferenças:
 *
 *   1. MARCADA: a sessão guarda o e-mail do operador, e o painel mostra uma
 *      faixa o tempo todo ("você está dentro da conta X como suporte").
 *   2. CURTA: uma hora, e acabou. Ninguém esquece uma porta aberta.
 *   3. REGISTRADA E LIMITADA: entra só com motivo escrito (vai para
 *      acessos_suporte e para o log), e o que é do DONO não se faz por ele:
 *      cobrança, equipe, senha e perfil, e a exportação e a exclusão de dados
 *      (LGPD). Ver ou mexer no conteúdo e nas telas pode — é para isso que o
 *      suporte entra.
 */
'use strict';

const TTL_MS = 60 * 60 * 1000;
const MOTIVO = { min: 10, max: 300 };

/*
 * O que a sessão de suporte NÃO pode fazer. Devolve a mensagem de recusa,
 * ou '' quando pode. `parts` é o caminho da API já partido (['api', ...]).
 */
function bloqueio(parts, metodo) {
  const area = parts[1] || '';
  const acao = parts[2] || '';
  const muda = metodo !== 'GET' && metodo !== 'HEAD';
  const recusa = 'No acesso de suporte isto fica com o dono da conta.';
  // Exportar e excluir dados é direito do titular, inclusive o GET da exportação.
  if (area === 'privacidade') return recusa;
  if (muda && (area === 'billing' || area === 'team')) return recusa;
  if (muda && area === 'auth' && (acao === 'password' || acao === 'profile')) return recusa;
  return '';
}

/* O motivo é obrigatório e precisa dizer alguma coisa. Devolve o texto limpo, ou ''. */
function motivoValido(m) {
  const t = String(m || '').replace(/\s+/g, ' ').trim();
  return t.length >= MOTIVO.min ? t.slice(0, MOTIVO.max) : '';
}

/* Quem a sessão de suporte representa: o DONO da conta (o mais antigo, se houver mais de um). */
function donoDa(usuarios) {
  return (usuarios || [])
    .filter((u) => u.role === 'owner')
    .sort((a, b) => (Number(a.created_at) || 0) - (Number(b.created_at) || 0))[0] || null;
}

module.exports = { TTL_MS, MOTIVO, bloqueio, motivoValido, donoDa };
