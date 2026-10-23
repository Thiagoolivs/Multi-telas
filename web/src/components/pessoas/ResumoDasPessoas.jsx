import React from 'react';
import { Users, Camera, Cake, ArrowRight } from 'lucide-react';
import { useAsync } from '../../lib/useAsync.js';
import { birthdays } from '../../api.js';
import { cn } from '../../lib/cn.js';

/*
 * O RH VÊ TUDO FÁCIL (EXECUTOR D34): três cartões — as pessoas (e quem está
 * sem foto ou sem e-mail, que não recebe o código do QR), as fotos que
 * esperam aprovação e os próximos aniversários. No topo de Pessoas e, quando
 * a conta tem equipe, no Início.
 *
 * `onIr(destino)`: 'fotos' (a fila), 'semFoto', 'pessoas'.
 */
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function quando(p) {
  if (p.em === 0) return 'hoje';
  if (p.em === 1) return 'amanhã';
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + p.em);
  return DIAS[d.getDay()] + ', ' + String(p.dia).padStart(2, '0') + '/' + String(p.mes).padStart(2, '0');
}
const iniciais = (nome) => String(nome || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

function Cartao({ icone: Icone, titulo, numero, children, acao, onAcao, destaque, className }) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-xl border bg-surface p-3 sm:p-4', destaque ? 'border-accent/50' : 'border-line', className)}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-3"><Icone size={14} /> {titulo}</div>
      {numero != null && <div className="tnum mt-1 text-2xl font-bold text-ink sm:text-3xl">{numero}</div>}
      <div className="mt-1 flex-1 text-xs text-ink-2">{children}</div>
      {acao && <button type="button" onClick={onAcao} className="mt-2 inline-flex items-center gap-1 self-start text-xs font-semibold text-accent hover:underline">{acao} <ArrowRight size={12} /></button>}
    </div>
  );
}

export function ResumoDasPessoas({ onIr, recarregar, soComEquipe }) {
  const { data } = useAsync(birthdays.resumo, [recarregar]);
  if (!data) return null;
  if (soComEquipe && !data.pessoas && !data.pendentes) return null;
  return (
    <section aria-label="Resumo da equipe" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
      <Cartao icone={Users} titulo="Pessoas" numero={data.pessoas}
        acao={data.semFoto ? 'Ver quem está sem foto' : null} onAcao={() => onIr && onIr('semFoto')}>
        {data.pessoas ? (
          <>
            {data.semFoto ? data.semFoto + (data.semFoto === 1 ? ' sem foto' : ' sem foto') : 'Todo mundo com foto'}
            {data.semEmail ? ' · ' + data.semEmail + ' sem e-mail (não recebe o código do QR)' : ''}
          </>
        ) : 'Importe a planilha do RH ou ponha as pessoas à mão.'}
      </Cartao>
      <Cartao icone={Camera} titulo="Fotos para aprovar" numero={data.pendentes} destaque={data.pendentes > 0}
        acao={data.pendentes ? 'Conferir' : null} onAcao={() => onIr && onIr('fotos')}>
        {data.pedidosAbertos ? (data.pedidosAbertos === 1 ? '1 pedido recebendo fotos pelo QR' : data.pedidosAbertos + ' pedidos recebendo fotos pelo QR') : 'Nenhum pedido de fotos aberto agora.'}
      </Cartao>
      <Cartao icone={Cake} titulo="Próximos aniversários" className="col-span-2 md:col-span-1" acao={onIr && data.proximos.length ? 'Ver a lista' : null} onAcao={() => onIr && onIr('pessoas')}>
        {data.proximos.length ? (
          <ul className="mt-1 space-y-1.5">
            {data.proximos.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                {p.foto
                  ? <img src={p.foto} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                  : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-3">{iniciais(p.nome)}</span>}
                <span className="min-w-0 flex-1 truncate text-ink">{p.nome}</span>
                <span className={cn('shrink-0', p.em === 0 ? 'font-semibold text-accent' : 'text-ink-3')}>{quando(p)}</span>
              </li>
            ))}
          </ul>
        ) : 'Ninguém nos próximos 30 dias.'}
      </Cartao>
    </section>
  );
}
