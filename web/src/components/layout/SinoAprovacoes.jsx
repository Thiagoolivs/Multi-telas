import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { aprovacoes } from '../../api.js';
import { cn } from '../../lib/cn.js';

/*
 * O SINO DA APROVAÇÃO (fase 13), no topo de toda página — no celular também,
 * que é onde o dono aprova. Para o dono e o admin, conta os pedidos
 * esperando; para o membro, as respostas que ele ainda não viu (aprovado ou
 * recusado, com o porquê).
 *
 * Só aparece com a aprovação ligada, ou com algo para ver. Pergunta ao
 * servidor ao abrir, a cada minuto, ao voltar para a aba e logo depois de um
 * pedido novo ('mt:aprovacao') ou de uma decisão ('mt:aprovacoes-mudou').
 */
const MINUTO = 60 * 1000;

export function avisarMudanca() {
  try { window.dispatchEvent(new CustomEvent('mt:aprovacoes-mudou')); } catch (e) { /* sem window */ }
}

export function SinoAprovacoes({ onNavigate, ativo }) {
  const [estado, setEstado] = useState(null);

  useEffect(() => {
    let vivo = true;
    const ler = () => aprovacoes.contagem().then((r) => { if (vivo) setEstado(r); }).catch(() => {});
    ler();
    const t = setInterval(ler, MINUTO);
    const naVolta = () => { if (document.visibilityState === 'visible') ler(); };
    window.addEventListener('mt:aprovacao', ler);
    window.addEventListener('mt:aprovacoes-mudou', ler);
    document.addEventListener('visibilitychange', naVolta);
    return () => {
      vivo = false;
      clearInterval(t);
      window.removeEventListener('mt:aprovacao', ler);
      window.removeEventListener('mt:aprovacoes-mudou', ler);
      document.removeEventListener('visibilitychange', naVolta);
    };
  }, []);

  if (!estado || (!estado.ligada && !estado.n)) return null;
  const n = Number(estado.n) || 0;
  const rotulo = estado.souRevisor
    ? (n ? 'Aprovações: ' + n + (n === 1 ? ' pedido esperando' : ' pedidos esperando') : 'Aprovações: nada esperando')
    : (n ? 'Seus pedidos: ' + n + (n === 1 ? ' resposta nova' : ' respostas novas') : 'Seus pedidos');

  return (
    <button type="button" onClick={() => onNavigate && onNavigate('aprovacoes')} aria-label={rotulo} title={rotulo}
      aria-current={ativo ? 'page' : undefined}
      className={cn('relative inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 transition hover:bg-surface-2 hover:text-ink max-sm:h-11 max-sm:w-11',
        ativo && 'bg-surface-2 text-ink')}>
      <Bell size={16} strokeWidth={2} aria-hidden="true" />
      {n > 0 && (
        <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-danger px-1 text-2xs font-semibold leading-[1.125rem] text-white max-sm:right-1.5 max-sm:top-1.5">
          {n > 9 ? '9+' : n}
        </span>
      )}
    </button>
  );
}
