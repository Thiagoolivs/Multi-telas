import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { billing } from '../../api.js';

/*
 * O aviso do período de teste.
 *
 * Existe por um motivo só: descobrir que o prazo venceu NA HORA DE LIGAR A TV
 * é a pior forma possível de saber. A pessoa já está de pé na recepção, com o
 * controle na mão, provavelmente com alguém esperando ver funcionar.
 *
 * Por isso a faixa só aparece quando falta pouco — três dias — ou quando já
 * acabou. Um aviso presente desde o primeiro dia vira paisagem antes de virar
 * útil, e aí não avisa mais nada quando importa.
 */
const AVISAR_A_PARTIR_DE = 3;

export function FaixaTeste({ onIrParaPlano }) {
  const [teste, setTeste] = useState(null);

  useEffect(() => {
    let vivo = true;
    billing.get()
      .then((d) => { if (vivo) setTeste((d && d.teste) || null); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  if (!teste) return null;
  const acabou = !teste.ativo;
  if (!acabou && teste.restam > AVISAR_A_PARTIR_DE) return null;

  const cor = acabou
    ? 'bg-danger-soft text-danger'
    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300';

  return (
    <div role="status" className={'flex flex-wrap items-center justify-center gap-2 px-4 py-2 text-center text-xs font-semibold ' + cor}>
      {acabou ? <AlertTriangle size={14} /> : <Clock size={14} />}
      <span>
        {acabou
          ? 'Seu teste terminou. Escolha um plano para ligar sua tela.'
          : teste.restam === 1
            ? 'Último dia do seu teste.'
            : `Faltam ${teste.restam} dias do seu teste.`}
        {' '}
        {/*
          Quem já tem tela no ar precisa saber que ela NÃO apaga — senão o
          aviso lê como ameaça de desligar a parede da recepção, que não é o
          que acontece: o que trava é ligar tela nova.
        */}
        <span className="font-normal opacity-90">
          {acabou ? 'As telas já ligadas continuam exibindo.' : 'Depois disso, ligar uma tela nova pede um plano.'}
        </span>
      </span>
      {onIrParaPlano && (
        <button onClick={onIrParaPlano} className="underline underline-offset-2 hover:opacity-80">
          Ver planos
        </button>
      )}
    </div>
  );
}
