import React, { useEffect, useState } from 'react';
import { History, Undo2 } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { lote } from '../../api.js';
import { desfazerLote } from '../../lib/rodar.js';
import { relativeTime } from '../../lib/format.js';
import { confirmar } from '../../lib/confirmar.js';

/*
 * ÚLTIMOS ENVIOS, com Desfazer (QA de lançamento, 03/11, usuário 9: o TI
 * com 20 TVs). O Desfazer de um envio em lote só existia no aviso, que some
 * em 9 segundos — e o servidor guarda o "antes" de cada TV por 30 dias
 * (GET /api/lote). Quem mandou a peça errada para as 20 TVs e só percebeu
 * no corredor não tinha como voltar. Agora a Programação mostra os últimos
 * envios, cada um com o seu Desfazer.
 *
 * Desfazer não apaga o que veio depois: a TV que alguém mudou depois do
 * envio fica como está (o servidor decide e o aviso conta).
 */
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function UltimosEnvios({ onDesfeito }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState('');
  const [vez, setVez] = useState(0);

  useEffect(() => {
    setErro('');
    lote.listar().then((r) => setLista((r && r.lotes) || [])).catch(() => { setLista([]); setErro('Não deu para ver os últimos envios agora.'); });
  }, [vez]);

  async function desfazer(l) {
    const n = (l.telas || []).length;
    if (!(await confirmar({
      titulo: 'Desfazer este envio?',
      texto: (n === 1 ? 'A TV volta' : 'As ' + n + ' TVs voltam') + ' ao que passavam antes dele. Se alguém mudou uma delas depois, essa fica como está.',
      botao: 'Desfazer',
    }))) return;
    setIndo(l.id);
    const ok = await desfazerLote(l.id);
    setIndo('');
    setVez((v) => v + 1);
    if (ok && onDesfeito) onDesfeito();
  }

  if (lista === null) return <div className="mt-6 flex justify-center py-4"><Spinner size={16} /></div>;
  if (!lista.length && !erro) return null;

  return (
    <Panel className="mt-6">
      <PanelHeader title="Últimos envios" description="O que foi para várias TVs de uma vez. Dá para desfazer por 30 dias." />
      {erro ? <p className="px-4 pb-4 text-sm text-ink-2">{erro}</p> : (
        <ul className="divide-y divide-line">
          {lista.map((l) => {
            const telas = l.telas || [];
            const nomes = telas.map((t) => t.nome || 'TV').slice(0, 4).join(', ') + (telas.length > 4 ? ' e mais ' + (telas.length - 4) : '');
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <History size={15} className="shrink-0 text-ink-3" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{l.descricao || 'Envio para as TVs'}</div>
                  <div className="truncate text-xs text-ink-3">
                    {maiuscula(relativeTime(l.createdAt))} · {telas.length === 1 ? '1 TV' : telas.length + ' TVs'}{nomes ? ': ' + nomes : ''}
                  </div>
                </div>
                {l.desfeitoEm
                  ? <span className="shrink-0 text-xs text-ink-3">Desfeito {relativeTime(l.desfeitoEm)}</span>
                  : <Button size="sm" variant="secondary" icon={Undo2} disabled={!!indo} onClick={() => desfazer(l)}
                    aria-label={'Desfazer o envio ' + (l.descricao || '') + ' de ' + relativeTime(l.createdAt)}>
                    {indo === l.id ? 'Desfazendo…' : 'Desfazer'}
                  </Button>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
