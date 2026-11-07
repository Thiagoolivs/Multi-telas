import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { EscolherArquivo } from '../ui/EscolherArquivo.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { media } from '../../api.js';
import { prepararFoto } from '../../lib/subir.js';

/*
 * O quadro grande da foto no passo "Fotos e textos": um toque abre a
 * galeria (ou a câmera) do celular, a foto sobe pelo envio de sempre
 * (encolhida se for grande, lib/subir.js) e aparece no quadro.
 *
 * PROVISÓRIO DE PROPÓSITO: o TrocarFoto (components/fotos/TrocarFoto.jsx,
 * com as abas celular, banco e IA) entra aqui no lugar, com as MESMAS
 * props — { papel, ramo, valor, onTrocar, formato }. `rotulo` é só deste.
 */
export function FotoDoPasso({ papel, ramo, valor, onTrocar, formato = '16/9', rotulo }) { // eslint-disable-line no-unused-vars
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState('');

  async function escolher(e) {
    const f = (e.target.files || [])[0];
    e.target.value = '';
    if (!f) return;
    setSubindo(true); setErro('');
    try {
      const prep = await prepararFoto(f).catch(() => ({ envio: f }));
      const up = await media.upload(prep.envio || f);
      onTrocar(up.url);
    } catch (er) { setErro(er.message || 'Não deu para mandar a foto. Tente de novo.'); }
    finally { setSubindo(false); }
  }

  return (
    <div>
      <EscolherArquivo accept="image/*" onChange={escolher} disabled={subindo} rotulo={valor ? 'Trocar a foto' : rotulo}
        className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-accent/50 bg-accent-soft/20 px-4 text-center transition hover:border-accent">
        {valor ? (
          <>
            <img src={valor} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded-full bg-surface/90 px-3 py-1.5 text-sm font-semibold text-ink shadow">Trocar a foto</span>
          </>
        ) : (
          <>
            <Camera size={32} className="text-accent" />
            <span className="text-lg font-semibold text-ink">{rotulo || 'Ponha a foto'}</span>
            <span className="text-sm text-ink-3">Toque para escolher no celular</span>
          </>
        )}
        {subindo && <span className="absolute inset-0 flex items-center justify-center bg-surface/70"><Spinner size={22} /></span>}
      </EscolherArquivo>
      {erro && <p role="alert" className="mt-1.5 text-sm text-danger">{erro}</p>}
    </div>
  );
}
