import React from 'react';
import { Wand2, ListChecks } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { EsbocoDaTela } from './EsbocoDaTela.jsx';
import { linhaDoCusto } from './CartaoEscopo.jsx';
import E from '../../lib/escopo.js';

/*
 * CONFIRA O ESBOÇO ANTES DE GERAR (EXECUTOR D42).
 *
 * O dono: "só pode gerar depois que os wireframes forem aprovados". Antes de
 * qualquer foto ou peça sair, a pessoa vê a planta de cada TV (as partes,
 * quantas peças giram em cada uma, as cores), o que vai em cada parte, as
 * redes, os horários, o que foi combinado e quanto gasta — e aprova. O
 * servidor guarda a aprovação DESTE escopo; mudou depois, aprova de novo.
 */
export function AprovarEsboco({ aberto, escopo, marca, telas, decisoes, ocupado, onAprovar, onFechar }) {
  if (!aberto || !escopo) return null;
  const e = E.normalizar(escopo);
  const coresAtuais = e.cores.length ? e.cores : ((marca && marca.cores) || []);
  const emPe = (t) => t.alvo.tipo === 'tela' && /^portrait/.test((((telas || []).find((d) => d.id === t.alvo.id) || {}).layoutId) || '');
  const linhas = E.descrever(e);
  return (
    <Dialog open={aberto} onClose={onFechar} title="Confira o esboço antes de gerar"
      description="É assim que a TV vai ficar e o que vai em cada parte. Nada é gerado (nem gasta criação) antes de você aprovar."
      className="max-w-2xl"
      footer={(
        <>
          <Button variant="ghost" onClick={onFechar} disabled={ocupado}>Voltar e mudar</Button>
          <Button variant="primary" icon={Wand2} onClick={onAprovar} disabled={ocupado}>{ocupado ? 'Aprovando…' : 'Aprovar e gerar'}</Button>
        </>
      )}>
      <div className="space-y-3">
        <div className={e.telas.length > 1 ? 'grid gap-3 sm:grid-cols-2' : 'mx-auto max-w-sm'}>
          {e.telas.map((t, ti) => (
            <EsbocoDaTela key={ti} zonas={t.zonas} cores={coresAtuais} nome={marca && marca.nome} logo={marca && marca.logo} emPe={emPe(t)}
              rotulo={e.telas.length > 1 ? (t.nome || 'Tela ' + (ti + 1)) : ''} />
          ))}
        </div>
        <ul className="space-y-1.5 text-sm">
          {linhas.map((l, i) => (
            <li key={i}>
              <span className="font-semibold text-ink">{l.titulo}: </span>
              <span className="text-ink-2">{l.itens.join(' · ')}</span>
            </li>
          ))}
        </ul>
        {(decisoes || []).length > 0 && (
          <div className="rounded-md bg-surface-2 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink"><ListChecks size={13} className="text-accent" /> Combinado</div>
            <ul className="space-y-0.5 text-xs text-ink-2">{decisoes.map((d) => <li key={d}>• {d}</li>)}</ul>
          </div>
        )}
        <p className="text-xs text-ink-3">{linhaDoCusto(e)}.</p>
      </div>
    </Dialog>
  );
}
