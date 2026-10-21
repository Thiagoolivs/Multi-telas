import React, { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { auth } from '../../api.js';

/*
 * A faixa do ACESSO DE SUPORTE (server/suporte.js): o operador está dentro
 * da conta de um cliente, como o dono. Ela fica o tempo todo, em toda página,
 * na cor do operador — ninguém pode esquecer de onde está. Diz o que não dá
 * para fazer daqui e quando acaba, e o botão devolve ao painel do operador.
 */
export function FaixaSuporte({ suporte, empresa }) {
  const [saindo, setSaindo] = useState(false);
  if (!suporte) return null;
  const ate = suporte.expiraEm ? new Date(suporte.expiraEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

  async function voltar() {
    setSaindo(true);
    try { await auth.voltar(); } catch (e) { /* a sessão pode já ter vencido: recarregar resolve */ }
    window.location.href = '/app/';
  }

  return (
    <div role="status" data-modo="operador"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent px-4 py-2 text-center text-xs font-semibold text-accent-fg">
      <span className="inline-flex items-center gap-1.5">
        <LifeBuoy size={14} />
        Acesso de suporte: você está dentro de <b>{empresa || 'uma conta de cliente'}</b> como o dono{ate ? ', até as ' + ate : ''}.
        Cobrança, equipe, senha e dados pessoais ficam com o dono. Tudo fica no registro.
      </span>
      <button type="button" onClick={voltar} disabled={saindo}
        className="rounded-md bg-accent-fg/15 px-2.5 py-1 underline-offset-2 hover:underline">
        {saindo ? 'Saindo…' : 'Voltar ao painel do operador'}
      </button>
    </div>
  );
}
