import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { TituloDoPasso, RodapeDoPasso } from './MolduraDoPasso.jsx';
import { FotoDoPasso } from './FotoDoPasso.jsx';
import { Palco } from '../content/VerTelaAgora.jsx';
import { estadoDaPrevia } from '../../lib/telasProntas.js';
import { aplicarCampos, aplicarHorario } from '../../lib/primeiraTv.js';

/*
 * Passo 5 · Fotos e textos (≈2 min): só o que aparece grande na TV — a
 * foto, num quadro grande, e até três textos (o nome, o preço, o quando).
 * A TV desenhada em cima muda enquanto a pessoa digita. Texto em branco
 * fica como está no desenho.
 */
export function PassoFotos({ estado, opcao, campos, neg, horario, frente, onConcluir, onPular }) {
  const [valores, setValores] = useState(() => ({ ...(estado.campos || {}) }));
  const mudar = (k, v) => setValores((x) => ({ ...x, [k]: v }));
  // A prévia já com o horário (o guardado, ou o mais comum): a TV desenhada diz o que a TV vai dizer.
  const previa = useMemo(() => (opcao ? aplicarHorario(aplicarCampos(opcao.montada, valores), horario, frente) : null), [opcao, valores, horario, frente]);
  const limpos = () => Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v));

  return (
    <>
      <TituloDoPasso titulo="Fotos e textos" frase="Só o que aparece grande na TV. O resto já está pronto." />
      {previa && <div className="mb-5 rounded-xl bg-surface-2 p-2"><Palco estado={estadoDaPrevia(previa)} alturaMaxima={240} /></div>}
      <div className="space-y-4">
        {campos.fotos.map((f) => (
          <FotoDoPasso key={f.nome} papel={f.papel} ramo={neg && neg.ramo} formato="16/9" rotulo={f.rotulo}
            valor={valores[f.nome] || ''} onTrocar={(url) => mudar(f.nome, url)} />
        ))}
        {campos.textos.map((t) => (
          <label key={t.nome} className="block">
            <span className="mb-1.5 block text-base font-medium text-ink">{t.rotulo}</span>
            <input value={valores[t.nome] || ''} onChange={(e) => mudar(t.nome, e.target.value)} maxLength={t.limite}
              placeholder={t.exemplo ? 'Ex.: ' + t.exemplo : ''} inputMode={t.preco || t.nome === 'desconto' ? 'decimal' : 'text'}
              className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </label>
        ))}
        {!campos.fotos.length && !campos.textos.length && <p className="text-sm text-ink-2">Esta tela já está pronta: não tem foto nem texto para trocar agora.</p>}
      </div>
      <RodapeDoPasso principal={{ rotulo: 'Continuar', icone: ArrowRight, onClick: () => onConcluir(limpos()) }} secundario={{ rotulo: 'Pular', onClick: onPular }} />
    </>
  );
}
