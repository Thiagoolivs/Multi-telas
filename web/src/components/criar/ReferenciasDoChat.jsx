import React, { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Spinner } from '../ui/Feedback.jsx';
import { cn } from '../../lib/cn.js';

/*
 * IMAGEM DE REFERÊNCIA NO CHAT (EXECUTOR D45).
 *
 * O dono: "no chat permitir subir e colar imagens de referência para a
 * criação". Anexar (o clipe) ou colar (Ctrl+V; no celular, colar no campo).
 * Cada imagem diz para que serve:
 *   - Estilo: "quero assim" — guia o desenho, não vai para a TV;
 *   - Produto: a foto do produto, que é do cliente e vai como está.
 * O servidor confere o tipo pelos bytes e guarda como mídia da conta.
 */

export const TIPOS_ACEITOS = 'image/png,image/jpeg,image/webp';

// As imagens de um colar (Ctrl+V) — o resto (texto) segue para a caixa normalmente.
export function imagensDoColar(e) {
  const itens = Array.from((e.clipboardData && e.clipboardData.files) || []);
  return itens.filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type));
}

// O clipe: abre o seletor de imagens (no celular, galeria ou câmera).
export function BotaoAnexar({ onArquivos, disabled, enviando }) {
  const input = useRef(null);
  return (
    <>
      <button type="button" onClick={() => input.current && input.current.click()} disabled={disabled || enviando}
        aria-label="Anexar imagem de referência" title="Anexar imagem (ou cole com Ctrl+V)"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink-2 transition hover:border-accent hover:text-accent disabled:opacity-50">
        {enviando ? <Spinner size={14} /> : <Paperclip size={15} />}
      </button>
      <input ref={input} type="file" accept={TIPOS_ACEITOS} multiple className="hidden"
        onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) onArquivos(f); }} />
    </>
  );
}

// As miniaturas, com o uso de cada uma e o tirar.
export function ReferenciasDoChat({ lista, onMudar, compacta }) {
  if (!lista || !lista.length) return null;
  const mudarUso = (url, uso) => onMudar(lista.map((r) => (r.url === url ? { ...r, uso } : r)));
  const tirar = (url) => onMudar(lista.filter((r) => r.url !== url));
  return (
    <div className="flex flex-wrap gap-2" aria-label="Imagens de referência">
      {lista.map((r, i) => (
        <div key={r.url} className={cn('flex items-center gap-1.5 rounded-lg border border-line bg-surface p-1 pr-1.5', compacta && 'gap-1')}>
          <img src={r.url} alt={'Imagem ' + (i + 1)} className={cn('rounded object-cover', compacta ? 'h-8 w-8' : 'h-10 w-10')} />
          <div className="flex flex-col gap-0.5">
            <span className="text-2xs font-medium text-ink-3">Imagem {i + 1}</span>
            <div className="flex overflow-hidden rounded border border-line" role="group" aria-label={'Para que serve a imagem ' + (i + 1)}>
              {[['estilo', 'Estilo'], ['produto', 'Produto']].map(([uso, rotulo]) => (
                <button key={uso} type="button" aria-pressed={r.uso === uso} onClick={() => mudarUso(r.url, uso)}
                  title={uso === 'estilo' ? 'Quero assim: guia o desenho' : 'A foto do produto: vai como está'}
                  className={cn('px-1.5 py-px text-2xs transition', r.uso === uso ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:bg-surface-2')}>
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => tirar(r.url)} aria-label={'Tirar a imagem ' + (i + 1)} className="self-start rounded p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
