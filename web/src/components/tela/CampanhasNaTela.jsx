import React from 'react';
import { Megaphone, ExternalLink, X } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { campanhasDaConfig, semCampanha } from '../../lib/tela.js';

export { semCampanha };

/*
 * AS CAMPANHAS NESTA TV (EXECUTOR §2c, item 30).
 *
 * A campanha do Criar entrava na TV como itens soltos ("Peça · Óculos de sol
 * com…", "campanha Campanha") e não havia como vê-la como um conjunto nem
 * tirá-la daqui. Tudo o que ela pôs vem marcado com `_campanha` — nos itens
 * das zonas e nas peças das faixas —, e é por essa marca que este bloco
 * conta e tira. O que não é dela fica.
 */
export function CampanhasNaTela({ cfg, onAbrir, onTirar }) {
  const lista = campanhasDaConfig(cfg);
  if (!lista.length) return null;
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><Megaphone size={15} className="text-accent" /> Campanhas nesta TV</h3>
      <ul className="divide-y divide-line">
        {lista.map((c) => (
          <li key={c.nome} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-[10rem] flex-1">
              <span className="block truncate text-sm font-medium text-ink">{c.nome}</span>
              <span className="text-2xs text-ink-3">{c.pecas} {c.pecas === 1 ? 'peça' : 'peças'} nesta TV</span>
            </span>
            {onAbrir && <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => onAbrir(c.nome)}>Abrir</Button>}
            <Button size="sm" icon={X} onClick={() => onTirar(c.nome)}>Tirar desta TV</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
