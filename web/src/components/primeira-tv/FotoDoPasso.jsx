import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { TrocarFoto } from '../fotos/TrocarFoto.jsx';

/*
 * O quadro grande da foto no passo "Fotos e textos": um toque abre o
 * "Trocar foto" (components/fotos/TrocarFoto.jsx) com as três origens —
 * do celular, do banco de fotos do tipo de negócio e gerada pela IA — e o
 * toque no que importa na foto. A foto escolhida aparece no quadro.
 *
 * Props: { papel, ramo, valor, onTrocar, formato, rotulo }. `onTrocar`
 * recebe só o endereço da foto (o passo guarda texto, como os campos).
 */
export function FotoDoPasso({ papel = 'produto', ramo, valor, onTrocar, formato = '16/9', rotulo }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setAberto(true)} aria-label={valor ? 'Trocar a foto' : (rotulo || 'Ponha a foto')}
        className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-accent/50 bg-accent-soft/20 px-4 text-center transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {valor ? (
          <>
            <img src={valor} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded-full bg-surface/90 px-3 py-1.5 text-sm font-semibold text-ink shadow">Trocar a foto</span>
          </>
        ) : (
          <>
            <Camera size={32} className="text-accent" aria-hidden="true" />
            <span className="text-lg font-semibold text-ink">{rotulo || 'Ponha a foto'}</span>
            <span className="text-sm text-ink-3">Do celular, do banco de fotos ou feita pela IA</span>
          </>
        )}
      </button>
      {aberto && (
        <TrocarFoto papel={papel} ramo={ramo || ''} formato={formato} titulo={rotulo || ''}
          valor={valor ? { src: valor } : ''}
          onFechar={() => setAberto(false)}
          onTrocar={(v) => { if (v && v.src) onTrocar(v.src); setAberto(false); }} />
      )}
    </div>
  );
}
