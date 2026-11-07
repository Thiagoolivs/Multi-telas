import React, { useEffect, useState } from 'react';
import { MonitorPlay, ArrowRight, RotateCcw } from 'lucide-react';
import { primeiraTv } from '../../api.js';
// Só o registro dos passos (js/primeira-tv.js): o Início não carrega a página do passo a passo.
import '../../../../js/primeira-tv.js';

const { NOME_DO_PASSO, PASSOS, passoParaRetomar } = globalThis.MTPrimeiraTv;
const numeroDoPasso = (p) => PASSOS.indexOf(p) + 1;

/*
 * "Sua primeira TV em 5 minutos" no Início (pages/PrimeiraTvPage.jsx).
 *
 * Conta nova, ou passo a passo começado e não terminado: o cartão com o
 * passo em que a pessoa parou e "Continuar". Depois de terminado (ou na
 * conta que já tem TV no ar), só o link "Montar a TV de novo".
 *
 * `onCartao(true|false)`: o Início esconde o "Comece por aqui" enquanto o
 * cartão aparece — dois caminhos de começo ao mesmo tempo confundem.
 */
export function CartaoPrimeiraTv({ onIr, onCartao, devices }) {
  const [r, setR] = useState(null);
  const [leu, setLeu] = useState(false);
  useEffect(() => {
    primeiraTv.ler().then((x) => setR(x || null)).catch(() => setR(null)).finally(() => setLeu(true));
  }, [devices]);
  const estado = r && r.estado;
  const cartao = !!(estado && !estado.fim && (r.nova || r.comecou));
  useEffect(() => { if (leu && onCartao) onCartao(cartao); }, [leu, cartao]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r || !estado) return null;

  if (!cartao) {
    return (
      <button type="button" onClick={() => onIr('primeiratv', { deNovo: true })}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
        <RotateCcw size={15} /> Montar a TV de novo
      </button>
    );
  }
  const onde = passoParaRetomar(estado);
  const comecou = r.comecou && (estado.feitos.length || estado.pulados.length);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/30 p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-accent"><MonitorPlay size={22} /></span>
      <div className="min-w-[12rem] flex-1">
        <h2 className="text-base font-semibold text-ink">Sua primeira TV em 5 minutos</h2>
        <p className="mt-0.5 text-sm text-ink-2">
          {comecou ? 'Você parou em “' + NOME_DO_PASSO[onde] + '” (passo ' + numeroDoPasso(onde) + ' de ' + PASSOS.length + ').'
            : 'Diga o seu negócio, ponha a marca e a TV já sai pronta.'}
        </p>
      </div>
      {/* Contornado: o único violeta cheio do Início é "Criar com a IA" (QA de 03/11). */}
      <button type="button" onClick={() => onIr('primeiratv')}
        className="ml-14 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-accent px-4 text-sm font-semibold text-accent transition hover:bg-accent-soft sm:ml-0">
        {comecou ? 'Continuar' : 'Começar'} <ArrowRight size={15} />
      </button>
    </div>
  );
}
