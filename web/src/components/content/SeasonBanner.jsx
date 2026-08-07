import React, { useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { seasons } from '../../api.js';

/*
 * O pacote de data comemorativa existia desde o começo (js/seasons.js), mas só
 * o player e o admin antigo o enxergavam — quem usa o painel novo nunca soube
 * que ele existia. Aqui a data de HOJE se oferece sozinha.
 *
 * É o tipo de facilidade que o produto promete: o RH não precisa saber que
 * existe um tema de Dia dos Pais, escolher cores nem escrever a mensagem. Ele
 * clica uma vez e a tela está vestida.
 */
export function SeasonBanner({ zonas, onAplicar }) {
  const chave = (zonas || []).join(',');
  const carregar = React.useCallback(() => seasons.list(zonas || []), [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data } = useAsync(carregar);
  const [dispensado, setDispensado] = useState(false);
  const [aplicado, setAplicado] = useState(false);

  const hoje = data && data.hoje;
  const programa = data && data.programa;
  if (!hoje || !programa || dispensado) return null;

  const quantos = programa.principal.length + programa.lateral.length;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 px-4 py-3">
      <span className="text-2xl leading-none">{hoje.emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">
          {aplicado ? `Pronto — a tela está com a cara de ${hoje.label}.` : `Hoje é ${hoje.label}`}
        </div>
        <div className="text-xs leading-snug text-ink-3">
          {aplicado
            ? 'Cores, decoração, conteúdo em todas as zonas e os avisos do rodapé já entraram. Dá para editar tudo normalmente.'
            : `Programação pronta: cores da data, decoração, ${quantos} conteúdos nas zonas e os avisos do rodapé — o bastante para rodar o dia inteiro.`}
        </div>
      </div>
      {!aplicado && (
        <Button size="sm" variant="primary" icon={Sparkles}
          onClick={() => { onAplicar(hoje, programa); setAplicado(true); }}>
          Vestir a tela
        </Button>
      )}
      <button type="button" aria-label="Dispensar" onClick={() => setDispensado(true)}
        className="shrink-0 rounded-md p-1.5 text-ink-3 transition hover:bg-surface-2 hover:text-ink">
        {aplicado ? <Check size={15} /> : <X size={15} />}
      </button>
    </div>
  );
}
