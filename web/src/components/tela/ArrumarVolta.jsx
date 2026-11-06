import React, { useMemo, useState } from 'react';
import { Scissors, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { MiniaturaDoItem } from './MiniaturaDoItem.jsx';
import { itemSummary, nomeDoTipo } from '../../lib/contentTypes.js';
import { precisaDeNomes } from '../../lib/nomesDasMidias.js';
import { useNomesDasMidias } from '../../lib/useNomesDasMidias.js';
import { formatarTempo } from '../../lib/screenDigest.js';
import { pecasParaTirar, voltaSem, semAsPecas, NOME_DO_MOTIVO } from '../../lib/arrumarVolta.js';
import { cn } from '../../lib/cn.js';

/*
 * "ARRUMAR A VOLTA" (reteste do bloco 3, cenário 7).
 *
 * Aparece junto do aviso de volta longa no resumo da TV (ScreenSummary): a
 * lista do que pode sair, com o porquê de cada uma (lib/arrumarVolta.js). A
 * pessoa marca e desmarca, vê a volta nova, e confirma. Quem grava é a página
 * da TV (`aoArrumar`): o mesmo "Pôr na TV" de sempre — com a aprovação, vira
 * pedido — e o aviso traz o Desfazer.
 *
 * `volta` = { zona, ciclo, max, lugar } (do aviso de lib/screenDigest.js).
 */
const TOM = { vencida: 'warn', exemplo: 'neutral', repetida: 'neutral', antiga: 'neutral' };

export function ArrumarVolta({ cfg, volta, parte, aoArrumar }) {
  const [aberto, setAberto] = useState(false);
  // A programação de quando abriu: os números da lista apontam para ela.
  const [foto, setFoto] = useState(null);
  const [fora, setFora] = useState(() => new Set());
  const [gravando, setGravando] = useState(false);

  const itens = useMemo(() => (foto && foto.zonas && foto.zonas[volta.zona] && foto.zonas[volta.zona].items) || [], [foto, volta.zona]);
  const sugestao = useMemo(() => (foto ? pecasParaTirar(itens, { maxSeg: volta.max }) : null), [foto, itens, volta.max]);
  const depois = useMemo(() => (foto ? voltaSem(itens, fora) : 0), [foto, itens, fora]);
  const nomes = useNomesDasMidias(aberto && precisaDeNomes(foto));

  function abrir() {
    const c = structuredClone(cfg);
    const s = pecasParaTirar((c.zonas && c.zonas[volta.zona] && c.zonas[volta.zona].items) || [], { maxSeg: volta.max });
    setFoto(c);
    setFora(new Set(s.pecas.map((p) => p.indice)));
    setAberto(true);
  }
  const alternar = (i) => setFora((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  async function confirmar() {
    if (!fora.size || !aoArrumar) return;
    setGravando(true);
    try {
      const ok = await aoArrumar(semAsPecas(foto, { [volta.zona]: [...fora] }), fora.size);
      if (ok !== false) setAberto(false);
    } finally { setGravando(false); }
  }

  const cabe = depois > 0 && depois <= volta.max;
  const nome = parte || 'Esta parte';
  return (
    <>
      <Button size="sm" variant="secondary" icon={Scissors} onClick={abrir} className="mt-1">Arrumar a volta</Button>
      <Dialog open={aberto} onClose={() => !gravando && setAberto(false)} className="max-w-lg"
        title="Arrumar a volta"
        description={nome + ' leva ' + formatarTempo(volta.ciclo) + ' para dar a volta; ' + (volta.lugar || 'ali') + ' a pessoa fica uns ' + formatarTempo(volta.max) + '. Estas peças podem sair:'}
        footer={(
          <>
            <Button variant="ghost" disabled={gravando} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button variant="primary" icon={Trash2} disabled={!fora.size || gravando} onClick={confirmar}>
              {gravando ? 'Tirando…' : fora.size === 1 ? 'Tirar 1 peça' : 'Tirar ' + fora.size + ' peças'}
            </Button>
          </>
        )}>
        {sugestao && !sugestao.pecas.length ? (
          <p className="text-sm text-ink-2">Nenhuma peça para tirar sozinha: todas estão no prazo e são diferentes. Divida por horário (Agenda) ou tire à mão as que já cumpriram o papel.</p>
        ) : sugestao && (
          <>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {sugestao.pecas.map((p) => {
                const it = itens[p.indice];
                const marcada = fora.has(p.indice);
                return (
                  <li key={p.indice}>
                    <label className={cn('flex cursor-pointer items-center gap-3 p-2.5', !marcada && 'opacity-60')}>
                      <input type="checkbox" checked={marcada} onChange={() => alternar(p.indice)} aria-label={'Tirar ' + itemSummary(it, nomes)} />
                      <MiniaturaDoItem item={it} largura={56} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-ink">{itemSummary(it, nomes)}</span>
                          <Badge tone={TOM[p.motivo]}>{NOME_DO_MOTIVO[p.motivo]}</Badge>
                        </span>
                        <span className="block text-2xs text-ink-3">{nomeDoTipo(it.type)} · {p.texto}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className={cn('mt-3 text-sm', cabe ? 'text-ok' : 'text-ink-2')} aria-live="polite">
              {!fora.size ? 'Nada marcado: a volta continua em ' + formatarTempo(volta.ciclo) + '.'
                : 'Sem as marcadas, a volta fica em ' + formatarTempo(depois) + (cabe ? ': cabe no tempo do lugar.' : '.')}
            </p>
            <p className="mt-1 text-2xs text-ink-3">Vai para a TV como o “Pôr na TV”, e dá para desfazer logo depois.</p>
          </>
        )}
      </Dialog>
    </>
  );
}
