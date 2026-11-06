import React, { useEffect, useState } from 'react';

/*
 * A faixa de "sem conexão".
 *
 * Ela aparece quando uma chamada de verdade falha por rede, e some quando a
 * seguinte funciona — e não pela bandeira `navigator.onLine`, que fica em
 * `true` num wi-fi de hotel que ainda não liberou a saída, ou num escritório
 * cujo link caiu mas o roteador continua de pé. `onLine === false` só é usado
 * como reforço, porque o `false` dele é confiável (o `true` não é).
 *
 * O texto faz uma coisa que a maioria destes avisos esquece: dizer o que NÃO
 * está quebrado. A pessoa que perde a internet no celular precisa saber, antes
 * de qualquer outra coisa, que as TVs da empresa continuam exibindo — elas não
 * dependem deste aparelho. Sem essa frase, um sinal de "sem conexão" no painel
 * parece um sinal de "a recepção está com a tela apagada".
 */
/*
 * E a faixa do FREIO da conta (reteste da fase 10): com muita gente no painel
 * ao mesmo tempo, o servidor pede uma pausa (429). Não é falta de internet, e
 * a faixa diz isso: quanto tempo esperar, e que as TVs seguem no ar.
 */
export function FaixaOffline() {
  const [semRede, setSemRede] = useState(() => navigator.onLine === false);
  const [freioAte, setFreioAte] = useState(0);
  const [, tique] = useState(0);

  useEffect(() => {
    const caiu = () => setSemRede(true);
    const voltou = () => setSemRede(false);
    const freio = (e) => setFreioAte(Date.now() + Math.min(300, Math.max(5, (e.detail && e.detail.segundos) || 30)) * 1000);
    window.addEventListener('mt:sem-rede', caiu);
    window.addEventListener('mt:com-rede', voltou);
    window.addEventListener('offline', caiu);
    window.addEventListener('mt:freio', freio);
    return () => {
      window.removeEventListener('mt:sem-rede', caiu);
      window.removeEventListener('mt:com-rede', voltou);
      window.removeEventListener('offline', caiu);
      window.removeEventListener('mt:freio', freio);
    };
  }, []);

  // A contagem do freio anda de segundo em segundo e some sozinha no fim.
  const faltam = Math.ceil((freioAte - Date.now()) / 1000);
  useEffect(() => {
    if (faltam <= 0) return undefined;
    const t = setTimeout(() => tique((n) => n + 1), 1000);
    return () => clearTimeout(t);
  }, [freioAte, faltam]);

  if (!semRede && faltam > 0) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-center text-xs font-semibold text-amber-800 dark:text-amber-300">
        <span>
          Muitos pedidos desta conta agora: o painel volta a atualizar em {faltam} s.{' '}
          <span className="font-bold">Suas telas continuam exibindo normalmente.</span>
        </span>
      </div>
    );
  }
  if (!semRede) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-center text-xs font-semibold text-amber-800 dark:text-amber-300"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
      <span>
        Sem conexão — o painel não consegue atualizar.{' '}
        <span className="font-bold">Suas telas continuam exibindo normalmente.</span>
      </span>
    </div>
  );
}
