import React, { useRef } from 'react';
import { cn } from '../../lib/cn.js';

/*
 * Um botão que abre o seletor de arquivos.
 *
 * QA de lançamento, 03/11 (bloqueador de acessibilidade): subir foto, logo,
 * backup e referência era um <label> em volta de um <input type=file> com
 * display:none. O mouse abre; o teclado não — o input escondido não recebe
 * foco e o <label> não é uma parada de Tab. Quem usa só o teclado (ou leitor
 * de tela) não tinha como escolher a foto.
 *
 * O padrão que já funcionava em Arquivos (StoragePage) é este: o input fica
 * escondido e um <button> de verdade chama input.click(). O botão recebe
 * foco, Enter e Espaço, tem nome e estado (disabled) — e o input continua o
 * mesmo, com accept, multiple e capture.
 *
 * `onChange` recebe o evento do input, como antes (quem chama continua
 * lendo e.target.files e limpando o valor, se quiser).
 */
export function EscolherArquivo({ accept, multiple, capture, onChange, disabled, className, children, rotulo, ...props }) {
  const entrada = useRef(null);
  return (
    <>
      <input ref={entrada} type="file" accept={accept} multiple={multiple} capture={capture} className="hidden"
        tabIndex={-1} aria-hidden="true" disabled={disabled}
        onChange={onChange} />
      <button type="button" disabled={disabled} aria-label={rotulo}
        className={cn('cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-60', className)}
        onClick={() => entrada.current && entrada.current.click()} {...props}>
        {children}
      </button>
    </>
  );
}
