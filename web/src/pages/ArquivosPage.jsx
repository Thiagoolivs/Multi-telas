import React from 'react';
import { StoragePage } from './StoragePage.jsx';
import { cn } from '../lib/cn.js';

/*
 * BIBLIOTECA › ARQUIVOS (QA de 26/10): Fotos e vídeos, Músicas e Da IA eram
 * três abas de uma biblioteca de sete, e no celular as abas eram cortadas.
 * Agora são uma aba só, com o filtro em cima — a mesma página de cada recorte
 * (StoragePage), sem nada sumir. O filtro troca o endereço (?ir=storage,
 * ?ir=musicas, ?ir=ia): recarregar e voltar continuam no mesmo lugar.
 */
const FILTROS = [
  ['fotos', 'Fotos e vídeos', 'storage'],
  ['ia', 'Da IA', 'ia'],
  ['musicas', 'Músicas', 'musicas'],
];

export function ArquivosPage({ filtro = 'fotos', onIr }) {
  return (
    <div>
      <div className="rolagem-lateral mb-4 flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface-2 p-1 sm:inline-flex"
        role="tablist" aria-label="Quais arquivos">
        {FILTROS.map(([id, nome, pagina]) => (
          <button key={id} type="button" role="tab" aria-selected={filtro === id}
            onClick={() => filtro !== id && onIr && onIr(pagina)}
            className={cn('shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
              filtro === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
            {nome}
          </button>
        ))}
      </div>
      <StoragePage key={filtro} filtro={filtro} />
    </div>
  );
}
