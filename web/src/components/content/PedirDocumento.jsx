import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input } from '../ui/Field.jsx';
import { conferir, formatar } from '../../lib/documento.js';

/*
 * O CPF ou CNPJ de quem paga, pedido na hora de assinar ou comprar.
 *
 * O Asaas não emite cobrança sem ele, e o "Assinar" respondia 502 sem dizer
 * por quê (EXECUTOR D0.8). O servidor só pede quando o cadastro no Asaas
 * ainda não tem o documento, então a pergunta aparece uma vez por conta.
 * Conferido pelos dígitos aqui (js/documento.js) e de novo no servidor.
 */
export function PedirDocumento({ open, onClose, onContinuar, ocupado, erro }) {
  const [valor, setValor] = useState('');
  const [tocou, setTocou] = useState(false);
  const c = conferir(valor);
  const mostrarErro = (tocou && !c.ok) ? c.erro : erro;

  function continuar() {
    setTocou(true);
    if (!c.ok) return;
    onContinuar(c.digitos);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="CPF ou CNPJ de quem paga"
      description="O Asaas precisa dele para emitir a cobrança e a nota. Fica no cadastro do Asaas, não no MultiTelas."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={ShieldCheck} onClick={continuar} disabled={ocupado}>{ocupado ? 'Abrindo a cobrança…' : 'Continuar'}</Button>
        </>
      )}
    >
      <Field label="CPF ou CNPJ" error={mostrarErro || undefined}>
        <Input
          inputMode="numeric" autoComplete="off" autoFocus
          placeholder="000.000.000-00 ou 00.000.000/0000-00"
          value={formatar(valor)}
          onChange={(e) => { setValor(e.target.value); if (tocou) setTocou(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') continuar(); }}
        />
      </Field>
    </Dialog>
  );
}
