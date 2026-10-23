import React, { useEffect, useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { Button } from './Button.jsx';
import { Field, Input } from './Field.jsx';
import { inscrever, responder } from '../../lib/confirmar.js';

/*
 * Quem desenha os pedidos de lib/confirmar.js: um de cada vez, com o
 * Dialog do painel. Montado uma vez no App (EXECUTOR D2).
 */
export function PedidosHost() {
  const [p, setP] = useState(null);
  const [valor, setValor] = useState('');
  useEffect(() => inscrever((novo) => { setP(novo); setValor(novo && novo.tipo === 'perguntar' ? (novo.valor || '') : ''); }), []);
  if (!p) return null;
  const fechar = () => responder(p.tipo === 'perguntar' ? null : false);
  const ok = () => responder(p.tipo === 'perguntar' ? valor : true);
  return (
    <Dialog
      open
      onClose={fechar}
      title={p.titulo}
      description={p.tipo === 'confirmar' ? undefined : p.texto || undefined}
      footer={(
        <>
          <Button variant="ghost" onClick={fechar}>{p.cancelar || 'Cancelar'}</Button>
          <Button variant={p.perigo ? 'danger' : 'primary'} onClick={ok}
            disabled={p.tipo === 'perguntar' && !valor.trim()} autoFocus={p.tipo === 'confirmar'}>{p.botao}</Button>
        </>
      )}
    >
      {p.tipo === 'confirmar' ? (
        p.texto ? <p className="whitespace-pre-line text-sm text-ink-2">{p.texto}</p> : null
      ) : (
        <Field label={p.rotulo || undefined}>
          <Input autoFocus value={valor} placeholder={p.placeholder} onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && valor.trim()) ok(); }} />
        </Field>
      )}
    </Dialog>
  );
}
