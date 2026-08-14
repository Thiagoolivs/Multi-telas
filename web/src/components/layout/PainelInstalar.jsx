import React, { useEffect, useState } from 'react';
import { Smartphone, Check, Share } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { instalado, podeInstalar, precisaDeInstrucaoIOS, assinar, instalar } from '../../lib/instalar.js';

/*
 * "Instalar o app" — em Ajustes, que é onde se procura por isso.
 *
 * Este painel tem três caras, e nenhuma delas é um botão que não funciona:
 *
 *   1. Já instalado  → confirma, e sai da frente.
 *   2. Dá para instalar (Chrome, Edge, Android) → botão.
 *   3. iPhone/iPad   → a instrução manual, porque o Safari não instala por
 *      botão nenhum: o caminho é Compartilhar → Adicionar à Tela de Início.
 *
 * Se o navegador ainda não ofereceu o convite — acontece: o Chrome espera a
 * pessoa usar o site um pouco antes de disparar `beforeinstallprompt` — o
 * painel diz isso em vez de mostrar um botão morto.
 */
export function PainelInstalar() {
  const [, redesenhar] = useState(0);
  const [resposta, setResposta] = useState('');

  // O convite pode chegar depois desta tela já estar montada.
  useEffect(() => assinar(() => redesenhar((n) => n + 1)), []);

  const jaInstalado = instalado();
  const disponivel = podeInstalar();
  const ios = precisaDeInstrucaoIOS();

  async function clicou() {
    const r = await instalar();
    if (r === 'accepted') setResposta('Pronto. O ícone está na sua tela inicial.');
    else if (r === 'dismissed') setResposta('Sem problema — dá para instalar depois, aqui mesmo.');
  }

  return (
    <Panel>
      <PanelHeader
        title="Instalar o app"
        description="O painel abre em janela própria, sem barra de endereço, e continua abrindo mesmo sem internet."
      />
      <div className="p-4">
        {jaInstalado ? (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check size={16} /> Você já está usando o app instalado.
          </p>
        ) : ios ? (
          <div className="text-sm text-ink-2">
            <p className="mb-3">No iPhone e no iPad a instalação é manual, pelo próprio Safari:</p>
            <ol className="space-y-1.5 pl-1">
              <li className="flex gap-2">
                <span className="font-bold text-ink">1.</span>
                <span>Toque em <Share size={13} className="inline align-[-2px]" /> <strong className="text-ink">Compartilhar</strong>, na barra de baixo.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-ink">2.</span>
                <span>Role e escolha <strong className="text-ink">Adicionar à Tela de Início</strong>.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-ink">3.</span>
                <span>Confirme em <strong className="text-ink">Adicionar</strong>.</span>
              </li>
            </ol>
          </div>
        ) : disponivel ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={Smartphone} onClick={clicou}>Instalar</Button>
            {resposta && <span className="text-sm text-ink-2">{resposta}</span>}
          </div>
        ) : (
          <p className="text-sm text-ink-2">
            {resposta || (
              <>
                Este navegador ainda não ofereceu a instalação. Ela costuma aparecer depois
                de alguns minutos de uso — ou pelo menu do navegador, em{' '}
                <strong className="text-ink">Instalar MultiTelas</strong>.
              </>
            )}
          </p>
        )}
      </div>
    </Panel>
  );
}
