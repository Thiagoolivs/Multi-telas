import React from 'react';
import { MessageSquare } from 'lucide-react';
import { cn } from '../../lib/cn.js';

/*
 * A MINI-CONVERSA DOS AJUSTES (EXECUTOR D51).
 *
 * O dono: "nos ajustes, ela conversar até entender o que tem que fazer". O
 * aviso rápido, o "Mudar com IA" e o "Pedir à IA" mostram aqui o que a pessoa
 * disse e o que a IA perguntou; a última pergunta vem com respostas prontas
 * (um toque responde). O histórico volta ao servidor, que junta tudo.
 */

// A fala da pessoa e a pergunta da IA, para guardar e mandar de volta.
export function comPergunta(historico, texto, r) {
  return (historico || []).concat({ papel: 'pessoa', texto }, { papel: 'ia', texto: r.pergunta, sugestoes: r.sugestoes || [] });
}

export function MiniConversa({ historico, onResponder, ocupado, className }) {
  if (!historico || !historico.length) return null;
  const ultima = historico[historico.length - 1];
  return (
    <div className={cn('space-y-1.5', className)} aria-live="polite">
      {historico.map((m, i) => (
        <div key={i} className={m.papel === 'ia' ? 'flex gap-1.5' : 'flex justify-end'}>
          {m.papel === 'ia' && <MessageSquare size={13} className="mt-1 shrink-0 text-ink-3" aria-hidden />}
          <div className={cn('max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs',
            m.papel === 'ia' ? 'rounded-tl-sm bg-surface-2 text-ink' : 'rounded-tr-sm bg-accent text-accent-fg')}>{m.texto}</div>
        </div>
      ))}
      {ultima && ultima.papel === 'ia' && (ultima.sugestoes || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-5">
          {ultima.sugestoes.map((s) => (
            <button key={s} type="button" disabled={ocupado} onClick={() => onResponder(s)}
              className="rounded-full border border-line px-2.5 py-1 text-2xs text-ink-2 transition hover:border-accent hover:text-accent disabled:opacity-50">{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
