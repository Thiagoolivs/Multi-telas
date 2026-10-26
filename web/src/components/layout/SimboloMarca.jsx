import React from 'react';
import { cn } from '../../lib/cn.js';

/*
 * O símbolo do MultiTelas: as três zonas da TV (principal, lateral, rodapé)
 * num quadrado quase preto, com a lateral em lima. É o mesmo desenho de
 * icons/icone.svg (tools/icones.mjs) — mudar um é mudar o outro.
 *
 * Cores fixas e não do tema: é a marca, e ela não troca com o modo escuro
 * nem com a cor de destaque que o cliente escolheu.
 */
export default function SimboloMarca({ className }) {
  return (
    <svg viewBox="0 0 100 100" className={cn('shrink-0', className)} aria-hidden="true">
      <rect width="100" height="100" rx="23" fill="#0E0B1F" />
      <g transform="translate(21.5 21.5) scale(0.4191)">
        <rect x="0" y="0" width="88" height="88" rx="12" fill="#ffffff" />
        <rect x="96" y="0" width="40" height="88" rx="12" fill="#C6F432" />
        <rect x="0" y="96" width="136" height="40" rx="12" fill="#86858F" />
      </g>
    </svg>
  );
}
