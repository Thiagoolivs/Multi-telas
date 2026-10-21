import React, { useEffect, useState } from 'react';
import { Smartphone, Share, X } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { instalado, podeInstalar, precisaDeInstrucaoIOS, assinar, instalar } from '../../lib/instalar.js';

/*
 * O convite para instalar o painel no celular — UMA vez só (docs/EXECUTOR.md,
 * item 5).
 *
 * O painel em Ajustes continua lá para quem procura. Este aparece sozinho,
 * no pé da tela do celular, porque instalado o app ganha o que o navegador
 * não tem: abre pelo ícone, e aparece no "compartilhar" da galeria — que é o
 * jeito mais curto de uma foto ir parar na TV.
 *
 *   Android/Chrome: botão "Instalar", que usa o convite guardado.
 *   iPhone/iPad:    a dica "Compartilhar → Adicionar à Tela de Início".
 *
 * Uma vez só: fechou, instalou ou recusou, não volta. Convite que insiste
 * vira propaganda, e propaganda dentro do produto que a pessoa já paga é
 * desrespeito. Só no celular (largura < lg): no computador o ganho é pouco.
 */
const VISTO = 'mt.convite.instalar';

function jaVisto() { try { return localStorage.getItem(VISTO) === '1'; } catch (e) { return true; } }
function marcarVisto() { try { localStorage.setItem(VISTO, '1'); } catch (e) { /* sem storage: aparece de novo, paciência */ } }

export function ConviteInstalar() {
  const [, redesenhar] = useState(0);
  const [fechado, setFechado] = useState(jaVisto);
  useEffect(() => assinar(() => redesenhar((n) => n + 1)), []);

  const celular = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 1023px)').matches;
  const ios = precisaDeInstrucaoIOS();
  if (fechado || instalado() || !celular || !(podeInstalar() || ios)) return null;

  function fechar() { marcarVisto(); setFechado(true); }
  async function clicou() {
    marcarVisto();
    await instalar();
    setFechado(true);
  }

  return (
    <div className="fixed inset-x-3 bottom-[4.75rem] z-40 rounded-xl border border-line bg-surface p-3 shadow-pop lg:hidden" role="region" aria-label="Instalar o app">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft"><Smartphone size={18} className="text-accent" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">Instale o MultiTelas no celular</div>
          {ios ? (
            <p className="mt-0.5 text-xs leading-snug text-ink-2">
              Toque em <Share size={12} className="inline align-[-2px]" /> <strong className="text-ink">Compartilhar</strong> e
              depois em <strong className="text-ink">Adicionar à Tela de Início</strong>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-snug text-ink-2">Abre pelo ícone, e a foto da galeria vai para a TV pelo “compartilhar”.</p>
          )}
          {!ios && <Button size="sm" variant="primary" className="mt-2" onClick={clicou}>Instalar</Button>}
        </div>
        <button type="button" onClick={fechar} aria-label="Agora não" className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"><X size={16} /></button>
      </div>
    </div>
  );
}
