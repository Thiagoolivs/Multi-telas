import React, { useEffect, useState } from 'react';
import { Square, RectangleHorizontal, RectangleVertical, Columns2, Plus } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { DesignThumb } from './DesignThumb.jsx';
import { brand as brandApi } from '../../api.js';
import '../../../../js/modelos.js';

const M = globalThis.MTModelos;

/*
 * Escolher por onde começar.
 *
 * "Criar na mão" abria o editor vazio. Quem chega ali sabe o que quer dizer —
 * "promoção de terça", "bem-vindo, fulano" — e não faz ideia de onde pôr, de
 * que tamanho, em que cor; o resultado é uma peça com um texto no meio, que é
 * exatamente o que não se quer numa parede.
 *
 * As miniaturas são a PEÇA DE VERDADE, desenhada pelo mesmo componente que
 * desenha os designs salvos. Nada de imagem de divulgação: o que se vê aqui é
 * o que abre no editor, inclusive na cor da empresa e no formato escolhido.
 */

const FORMATOS = [
  { id: '16/9', rotulo: 'TV deitada', icone: RectangleHorizontal },
  { id: '9/16', rotulo: 'TV em pé', icone: RectangleVertical },
  { id: '1/1', rotulo: 'Quadrada', icone: Square },
  { id: '21/9', rotulo: 'Banner', icone: Columns2 },
];

export function EscolherModelo({ aberto, onFechar, onEscolher }) {
  const [formato, setFormato] = useState('16/9');
  const [cores, setCores] = useState(null);

  useEffect(() => {
    if (!aberto) return;
    // A rota devolve { kit, assets, memoria } — as cores moram no kit.
    brandApi.get().then((r) => setCores((r && r.kit && r.kit.cores) || [])).catch(() => setCores([]));
  }, [aberto]);

  const lista = M.listar();

  return (
    <Dialog
      open={aberto}
      onClose={onFechar}
      title="Por onde você quer começar?"
      description="Escolha um modelo e edite tudo depois — ou comece com a tela vazia."
      footer={<>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="secondary" icon={Plus} onClick={() => onEscolher(null, formato)}>Começar em branco</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {FORMATOS.map((f) => {
            const Icone = f.icone;
            return (
              <button
                key={f.id} type="button" onClick={() => setFormato(f.id)}
                className={'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition '
                  + (formato === f.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-2 hover:text-ink')}
              >
                <Icone size={14} />
                {f.rotulo}
              </button>
            );
          })}
        </div>

        {/*
          Enquanto a marca não respondeu, a galeria espera: desenhar em azul
          padrão e repintar meio segundo depois faria a peça piscar de cor na
          cara de quem está escolhendo.
        */}
        {cores === null ? (
          <div className="py-10 text-center text-sm text-ink-3">Preparando os modelos na cor da sua marca…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {lista.map((m) => {
              const peca = M.montar(m.id, formato, cores);
              return (
                <button
                  key={m.id} type="button"
                  onClick={() => onEscolher(peca, formato)}
                  className="group rounded-lg border border-line p-1.5 text-left transition hover:border-accent"
                >
                  <DesignThumb item={peca} />
                  <div className="px-0.5 pb-0.5 pt-1.5">
                    <div className="text-xs font-semibold text-ink">{m.nome}</div>
                    <div className="mt-0.5 text-2xs leading-snug text-ink-3">{m.para}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
