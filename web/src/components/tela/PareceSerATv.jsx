import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { confirmar } from '../../lib/confirmar.js';
import { linhaDaParecida, confirmacaoDeReconectar } from '../../lib/reconectarTv.js';

/*
 * "ESTA TV PARECE SER A X?" (reteste 4, 25/11): o mesmo bloco em Telas ›
 * Ligar uma TV e no "Sua primeira TV". Com 8 boxes iguais no dia da
 * instalação, um "Sim" por engano fazia a TV nova tomar o nome e a
 * programação de outra parede. Agora "Não, é outra TV" é o botão principal
 * (e já vem em foco), cada TV parecida diz quando deu o último sinal e de
 * que grupo é, e "É a X" pede confirmação (lib/reconectarTv.js).
 *
 * `talvez`: { telas, pergunta } — `pergunta` é o 409 "parece-reconectar";
 * sem ela, é o limite do plano, em que reconectar é a saída (com a mesma
 * confirmação). `onReconectar(id)` e `onNova()` repetem o pedido de parear.
 */
export function PareceSerATv({ talvez, busy, onReconectar, onNova, grande = false }) {
  const telas = ((talvez && talvez.telas) || []).slice(0, 3);
  if (!telas.length) return null;
  const agora = Date.now();
  async function eAMesma(t) {
    if (!(await confirmar(confirmacaoDeReconectar(t, Date.now())))) return;
    onReconectar(t.id);
  }
  const tamanho = grande ? 'lg' : 'sm';
  return (
    <div role="group" aria-label="Esta TV pode ser uma que já estava na conta"
      className={'mt-2 rounded-md border border-line bg-surface-2 p-3 text-ink ' + (grande ? 'text-base' : 'text-sm')}>
      {talvez.pergunta ? (
        <>
          <p className="font-semibold">{telas.length === 1 ? 'Esta TV é do mesmo modelo de uma TV da conta que parou de dar sinal:' : 'Esta TV é do mesmo modelo de TVs da conta que pararam de dar sinal:'}</p>
          <ul className="mt-1.5 space-y-0.5 text-ink-2">{telas.map((t) => <li key={t.id}>{linhaDaParecida(t, agora)}</li>)}</ul>
          <p className="mt-1.5 text-ink-2">Instalando uma TV nova? Então é outra TV. “É a…” serve só para uma TV que já funcionava aqui e voltou mostrando um código.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {/* O principal é o seguro: no dia da instalação, quase sempre é outra TV. */}
            <Button type="button" variant="primary" size={tamanho} autoFocus disabled={busy} onClick={onNova}>Não, é outra TV</Button>
            {telas.map((t) => (
              <Button key={t.id} type="button" variant="ghost" size={tamanho} icon={RefreshCw} disabled={busy} onClick={() => eAMesma(t)}>
                {'É a ' + t.nome + ', que voltou'}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <>
          <ul className="space-y-0.5 text-ink-2">{telas.map((t) => <li key={t.id}>{linhaDaParecida(t, agora)}</li>)}</ul>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {telas.map((t) => (
              <Button key={t.id} type="button" variant="secondary" size={tamanho} icon={RefreshCw} disabled={busy} onClick={() => eAMesma(t)}>
                {'Reconectar a ' + t.nome}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
