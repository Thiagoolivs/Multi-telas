import React, { useState } from 'react';
import { avisoDaTelaInicial } from '../../lib/telaInicial.js';

/*
 * O aviso da página da TV quando o app MultiTelas TV não é a tela inicial do
 * aparelho (web/src/lib/telaInicial.js diz quando e o que fazer). Fica na
 * página da TV, e não no cartão da lista: é coisa de resolver uma vez, com
 * calma, e o passo a passo não cabe no cartão.
 */
export function AvisoTelaInicial({ info }) {
  const aviso = avisoDaTelaInicial(info);
  const [aberto, setAberto] = useState(false);
  if (!aviso) return null;
  return (
    <div className="mb-4 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-ink" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><b>{aviso.titulo}.</b> {aviso.texto}</span>
        <button type="button" className="text-sm font-semibold text-accent hover:underline" aria-expanded={aberto}
          onClick={() => setAberto(!aberto)}>{aberto ? 'Fechar' : 'Como resolver'}</button>
      </div>
      {aberto && (
        <>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">
            {aviso.passos.map((p) => <li key={p}>{p}</li>)}
          </ol>
          <code className="mt-2 block select-all overflow-x-auto whitespace-nowrap rounded bg-surface px-2 py-1 text-xs text-ink">{aviso.comando}</code>
        </>
      )}
    </div>
  );
}
