import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, GripVertical, Type, Image as ImageIcon, Shapes, Star } from 'lucide-react';

/*
 * PainelCamadas — a pilha, visível.
 *
 * Antes só existiam dois botões, "para a frente" e "para trás", e nenhuma
 * forma de ver a ordem. Numa peça com dez elementos, encontrar o texto que
 * sumiu atrás de uma forma virava tentativa e erro: clicar no palco não
 * alcança quem está por baixo.
 *
 * A ORDEM DO ARRAY é a ordem de empilhamento — o último desenha por cima.
 * A lista aparece invertida, porque quem está na frente na tela deve estar no
 * topo da lista; é como todo editor faz e é o que a pessoa espera.
 */

const ICONE = { texto: Type, imagem: ImageIcon, forma: Shapes, icone: Star };

function rotulo(e) {
  if (e.nome) return e.nome;
  if (e.tipo === 'texto') return (e.text || 'Texto').slice(0, 28);
  if (e.tipo === 'forma') return 'Forma · ' + (e.shape || 'rect');
  if (e.tipo === 'icone') return 'Ícone · ' + (e.name || 'star');
  return 'Imagem';
}

export function PainelCamadas({ els, sel, onSelecionar, onReordenar, onAlternar, onRenomear }) {
  const [arrastando, setArrastando] = useState(null);
  const [alvo, setAlvo] = useState(null);
  const [editando, setEditando] = useState(null);

  // De cima para baixo na tela = do fim para o começo do array.
  const linhas = els.map((e, i) => ({ e, i })).reverse();

  function soltar(destino) {
    if (arrastando == null || destino == null || arrastando === destino) return;
    onReordenar(arrastando, destino);
    setArrastando(null); setAlvo(null);
  }

  if (!els.length) {
    return <div className="px-1 py-3 text-xs text-ink-3">Nenhum elemento ainda. Use a barra de cima para adicionar.</div>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {linhas.map(({ e, i }) => {
        const Icone = ICONE[e.tipo] || Shapes;
        const escolhido = sel.includes(e.id);
        return (
          <div
            key={e.id}
            draggable={!editando}
            onDragStart={() => setArrastando(i)}
            onDragOver={(ev) => { ev.preventDefault(); setAlvo(i); }}
            onDrop={(ev) => { ev.preventDefault(); soltar(i); }}
            onDragEnd={() => { setArrastando(null); setAlvo(null); }}
            onMouseDown={(ev) => onSelecionar(e.id, ev.shiftKey)}
            className={
              'group flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs transition '
              + (escolhido ? 'border-accent bg-accent-soft text-ink' : 'border-transparent text-ink-2 hover:border-line hover:bg-surface-2')
              + (alvo === i && arrastando != null && arrastando !== i ? ' ring-1 ring-accent' : '')
              + (e.oculto ? ' opacity-45' : '')
            }
          >
            <GripVertical size={12} className="shrink-0 cursor-grab text-ink-3" />
            <Icone size={13} className="shrink-0" />
            {editando === e.id ? (
              <input
                autoFocus
                defaultValue={rotulo(e)}
                onBlur={(ev) => { onRenomear(e.id, ev.target.value); setEditando(null); }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') ev.target.blur();
                  if (ev.key === 'Escape') setEditando(null);
                  ev.stopPropagation();       // não deixa o atalho global comer a tecla
                }}
                className="min-w-0 flex-1 rounded border border-line bg-surface px-1 py-0.5 text-xs text-ink outline-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate" onDoubleClick={() => setEditando(e.id)}>{rotulo(e)}</span>
            )}
            <button
              type="button" title={e.oculto ? 'Mostrar' : 'Ocultar'}
              onMouseDown={(ev) => ev.stopPropagation()}
              onClick={() => onAlternar(e.id, 'oculto')}
              className="shrink-0 rounded p-0.5 text-ink-3 opacity-0 hover:text-ink group-hover:opacity-100 aria-[pressed=true]:opacity-100"
              aria-pressed={!!e.oculto}
            >
              {e.oculto ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
            <button
              type="button" title={e.travado ? 'Destravar' : 'Travar'}
              onMouseDown={(ev) => ev.stopPropagation()}
              onClick={() => onAlternar(e.id, 'travado')}
              className="shrink-0 rounded p-0.5 text-ink-3 opacity-0 hover:text-ink group-hover:opacity-100 aria-[pressed=true]:opacity-100"
              aria-pressed={!!e.travado}
            >
              {e.travado ? <Lock size={12} /> : <Unlock size={12} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
