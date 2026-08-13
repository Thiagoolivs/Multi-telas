import React, { useEffect, useState } from 'react';
import { Check, MonitorPlay, Palette, Brush } from 'lucide-react';
import { brand as brandApi } from '../../api.js';

/*
 * Primeiros passos.
 *
 * Quem acabava de se cadastrar caía num painel vazio: nenhuma tela, nenhum
 * conteúdo, e nenhuma indicação de por onde começar. O caminho existia — abrir
 * o endereço na TV, parear, publicar — mas só quem já conhecia o produto
 * conseguia adivinhá-lo.
 *
 * Duas decisões:
 *
 * 1. Os passos são DEDUZIDOS do estado real, nunca marcados à mão. Um passo
 *    "concluído" que na verdade não aconteceu é pior do que não ter lista: a
 *    pessoa acredita que a TV está no ar e descobre o contrário na parede.
 *
 * 2. Some sozinho quando os três terminam. Uma lista de primeiros passos que
 *    fica para sempre vira ruído em cima da tela que a pessoa usa todo dia.
 */

const DISPENSADO = 'mt.primeirosPassos.dispensado';

export function PrimeirosPassos({ devices, onIr }) {
  const [temMarca, setTemMarca] = useState(null);
  const [dispensado, setDispensado] = useState(() => {
    try { return localStorage.getItem(DISPENSADO) === '1'; } catch (e) { return false; }
  });

  useEffect(() => {
    brandApi.get()
      .then((k) => setTemMarca(!!((k && k.cores && k.cores.length) || (k && k.assets && k.assets.length))))
      .catch(() => setTemMarca(false));
  }, []);

  const telaLigada = devices.some((d) => d.lastSeen);
  const temConteudo = devices.some((d) => d.hasConfig);

  const passos = [
    {
      id: 'tela',
      feito: telaLigada,
      icone: MonitorPlay,
      titulo: 'Ligue a primeira TV',
      texto: 'Abra o endereço no navegador da TV e digite aqui o código que ela mostrar.',
      acao: 'Parear tela',
      destino: 'screens',
    },
    {
      id: 'conteudo',
      feito: temConteudo,
      icone: Palette,
      titulo: 'Publique o primeiro conteúdo',
      texto: 'Crie uma peça no editor, ou peça uma campanha inteira à IA, e publique na tela.',
      acao: 'Meus Designs',
      destino: 'designs',
    },
    {
      id: 'marca',
      feito: !!temMarca,
      icone: Brush,
      titulo: 'Diga quem é a empresa',
      texto: 'Cores e logo. É com isso que a IA cria peças com a cara do cliente, e não genéricas.',
      acao: 'Marca',
      destino: 'brand',
    },
  ];

  const prontos = passos.filter((p) => p.feito).length;
  // Enquanto a marca não respondeu, não se decide nada: mostrar e sumir logo
  // em seguida pisca na cara de quem está lendo.
  if (temMarca === null) return null;
  if (dispensado || prontos === passos.length) return null;

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-ink">Comece por aqui</h2>
        <span className="tnum text-xs text-ink-3">{prontos} de {passos.length}</span>
        <button
          type="button"
          onClick={() => { try { localStorage.setItem(DISPENSADO, '1'); } catch (e) {} setDispensado(true); }}
          className="ml-auto text-xs text-ink-3 transition hover:text-ink"
        >
          Dispensar
        </button>
      </div>

      <ol className="mt-3 space-y-2">
        {passos.map((p, i) => {
          const Icone = p.icone;
          return (
            <li
              key={p.id}
              className={'flex items-start gap-3 rounded-md border p-3 ' + (p.feito ? 'border-line bg-surface-2' : 'border-line')}
            >
              <span
                className={'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold '
                  + (p.feito ? 'bg-ok/15 text-ok' : 'bg-accent/15 text-accent')}
              >
                {p.feito ? <Check size={13} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={'block text-sm font-medium ' + (p.feito ? 'text-ink-2 line-through' : 'text-ink')}>
                  {p.titulo}
                </span>
                {!p.feito && <span className="mt-0.5 block text-sm text-ink-2">{p.texto}</span>}
              </span>
              {!p.feito && (
                <button
                  type="button"
                  onClick={() => onIr(p.destino)}
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent/50 hover:text-accent"
                >
                  <Icone size={14} />
                  {p.acao}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
