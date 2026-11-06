import React from 'react';
import { ArrowRight, LayoutGrid } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Textarea } from '../ui/Field.jsx';
import { DesignThumb } from './DesignThumb.jsx';
import { rotulosDaArte, comTexto } from '../../lib/textosDaArte.js';

export { textosDaArte } from '../../lib/textosDaArte.js';

/*
 * TROCAR OS TEXTOS DE UMA ARTE (fase 10, reteste do bloco 8).
 *
 * "Escolher um modelo" prometia "é só trocar o texto" e abria o editor livre,
 * com camadas, gradiente, alinhamentos e "Forma · rect": o nível Avançado na
 * porta do Pronto. Aqui o modelo abre como um formulário: um campo por texto
 * da arte, de cima para baixo, com a prévia ao lado. O editor livre continua
 * a um botão ("Editor avançado").
 */

// Os campos, sozinhos: no diálogo do modelo e no formulário da página da TV.
export function CamposDaArte({ item, onChange }) {
  const rotulos = rotulosDaArte(item);
  if (!rotulos.length) return <p className="text-sm text-ink-3">Esta arte não tem texto para trocar. Para mudar o desenho, use o editor avançado.</p>;
  return (
    <div className="space-y-3">
      {rotulos.map((r) => (
        <Field key={r.indice} label={r.rotulo}>
          {r.longo
            ? <Textarea rows={2} value={r.texto} onChange={(e) => onChange(comTexto(item, r.indice, e.target.value))} />
            : <Input value={r.texto} onChange={(e) => onChange(comTexto(item, r.indice, e.target.value))} />}
        </Field>
      ))}
    </div>
  );
}

/*
 * O modelo escolhido, pronto para trocar o texto. `onContinuar` leva ao
 * "Pôr na TV" (ou à fila da TV); `onAvancado` abre o editor livre com o que
 * já foi digitado.
 */
export function TrocarTextos({ item, onMudar, onFechar, onContinuar, onAvancado, continuar = 'Continuar' }) {
  return (
    <Dialog open onClose={onFechar} className="max-w-3xl" title="Trocar os textos"
      description="O modelo já está nas cores da sua marca. Escreva o seu texto: a prévia muda junto."
      footer={<>
        <Button variant="ghost" icon={LayoutGrid} className="mr-auto whitespace-nowrap" onClick={() => onAvancado(item)}>
          <span className="sm:hidden">Avançado</span><span className="max-sm:hidden">Editor avançado</span>
        </Button>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" icon={ArrowRight} onClick={() => onContinuar(item)}>{continuar}</Button>
      </>}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex items-start justify-center rounded-lg bg-surface-2 p-2 md:sticky md:top-0">
          <div className={String(item.formato || '').startsWith('9/') ? 'w-1/2' : 'w-full'}><DesignThumb item={item} /></div>
        </div>
        <CamposDaArte item={item} onChange={onMudar} />
      </div>
    </Dialog>
  );
}
