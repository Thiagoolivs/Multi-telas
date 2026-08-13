import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Unlock, GripVertical, Type, Image as ImageIcon, Shapes, Star, ChevronRight, ChevronDown, Group } from 'lucide-react';
import { linhasDeCamada } from '../../lib/grupos.js';

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
 *
 * Um grupo ocupa UMA linha. Arrastar essa linha move o bloco inteiro, e é o
 * que impede um estranho de acabar no meio de um grupo — o que tornaria
 * "mandar o grupo para trás" uma pergunta sem resposta certa. Os membros
 * aparecem ao abrir a linha, para consulta e seleção; reordenar dentro do
 * grupo fica de fora, porque a ordem interna raramente é o que se quer mexer
 * e um segundo nível de arrasto confunde mais do que resolve.
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
  const [abertos, setAbertos] = useState({});

  // De cima para baixo na tela = do fim para o começo da pilha.
  const linhas = linhasDeCamada(els).map((l, i) => ({ l, i })).reverse();

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
      {linhas.map(({ l, i }) => {
        if (l.tipo === 'grupo') {
          const aberto = !!abertos[l.grupo];
          const escolhido = l.els.some((e) => sel.includes(e.id));
          return (
            <div key={l.grupo}>
              <div
                draggable
                onDragStart={() => setArrastando(i)}
                onDragOver={(ev) => { ev.preventDefault(); setAlvo(i); }}
                onDrop={(ev) => { ev.preventDefault(); soltar(i); }}
                onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                onMouseDown={(ev) => onSelecionar(l.els[0].id, ev.shiftKey)}
                className={
                  'group flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs transition '
                  + (escolhido ? 'border-accent bg-accent-soft text-ink' : 'border-transparent text-ink-2 hover:border-line hover:bg-surface-2')
                  + (alvo === i && arrastando != null && arrastando !== i ? ' ring-1 ring-accent' : '')
                }
              >
                <GripVertical size={12} className="shrink-0 cursor-grab text-ink-3" />
                <button
                  type="button"
                  onMouseDown={(ev) => ev.stopPropagation()}
                  onClick={() => setAbertos((a) => ({ ...a, [l.grupo]: !aberto }))}
                  className="shrink-0 rounded text-ink-3 hover:text-ink"
                  title={aberto ? 'Fechar' : 'Ver o que tem dentro'}
                >
                  {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <Group size={13} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{l.rotulo}</span>
              </div>
              {aberto && (
                <div className="ml-4 flex flex-col gap-0.5 border-l border-line pl-1.5">
                  {[...l.els].reverse().map((e) => {
                    const Icone = ICONE[e.tipo] || Shapes;
                    return (
                      <div
                        key={e.id}
                        onMouseDown={(ev) => onSelecionar(e.id, ev.shiftKey)}
                        className={'flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs transition '
                          + (sel.includes(e.id) ? 'border-accent bg-accent-soft text-ink' : 'border-transparent text-ink-3 hover:border-line hover:bg-surface-2')}
                      >
                        <Icone size={12} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{rotulo(e)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }
        const e = l.el;
        return ((() => {
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
        })());
      })}
    </div>
  );
}
