import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { inscrever, fechar } from '../../lib/avisos.js';
import { Button } from '../ui/Button.jsx';
import { IconButton } from '../ui/Button.jsx';

/*
 * A pilha de avisos, no canto de baixo à direita.
 *
 * Fica FORA do <main>: ela não pode rolar junto com a página nem sumir quando
 * se troca de menu, que é exatamente o que a pessoa faz enquanto espera a IA
 * terminar.
 *
 * Embaixo e à direita porque é o canto que menos cobre conteúdo em painel de
 * lista, e porque o topo já é da barra de teste e do aviso de offline —
 * empilhar mais uma faixa lá em cima empurraria a página inteira para baixo a
 * cada trabalho iniciado.
 */
const CORES = {
  trabalho: 'border-accent/40 bg-accent/10',
  pronto: 'border-emerald-500/40 bg-emerald-500/10',
  erro: 'border-rose-500/40 bg-rose-500/10',
  ok: 'border-line bg-surface',
};

function Icone({ tom }) {
  if (tom === 'trabalho') return <Loader2 size={16} className="animate-spin text-accent" />;
  if (tom === 'erro') return <AlertTriangle size={16} className="text-rose-400" />;
  if (tom === 'pronto') return <CheckCircle2 size={16} className="text-emerald-400" />;
  return <CheckCircle2 size={16} className="text-ink-3" />;
}

export function Avisos() {
  const [lista, setLista] = useState([]);
  useEffect(() => inscrever(setLista), []);

  if (!lista.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
      {lista.map((a) => (
        <div key={a.id} role="status"
          className={'pointer-events-auto flex items-start gap-2.5 rounded-xl border p-3 shadow-pop backdrop-blur ' + (CORES[a.tom] || CORES.ok)}>
          <div className="mt-0.5 shrink-0"><Icone tom={a.tom} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-ink">{a.texto}</div>
            {a.detalhe && <div className="mt-0.5 text-2xs text-ink-2">{a.detalhe}</div>}
            {/*
              A ação é o motivo de o aviso existir. "Sua imagem ficou pronta"
              sem um botão obriga a pessoa a adivinhar para onde ir — e o
              resultado de um trabalho que ela pagou fica escondido.
            */}
            {a.acao && (
              <Button size="sm" variant="secondary" className="mt-2"
                onClick={() => { fechar(a.id); a.acao.on(); }}>
                {a.acao.rotulo}
              </Button>
            )}
          </div>
          <IconButton icon={X} label="Dispensar" onClick={() => fechar(a.id)} />
        </div>
      ))}
    </div>
  );
}
