import React, { useState } from 'react';
import { Camera, ImageUp } from 'lucide-react';
import { TrocarFoto, subirFotoDoCelular } from '../fotos/TrocarFoto.jsx';
import { EscolherArquivo } from '../ui/EscolherArquivo.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { imagemDoCampo } from '../../lib/fotoViva.js';

/*
 * O quadro grande da foto no passo "Fotos e textos": um toque abre o
 * "Trocar foto" (components/fotos/TrocarFoto.jsx) com as três origens —
 * do celular, do banco de fotos do tipo de negócio e gerada pela IA. A foto
 * escolhida aparece no quadro.
 *
 * Reteste 2 (16 toques na Primeira TV, a meta é 15): o "Trocar foto" abre
 * no banco de fotos do negócio e a foto tocada já vale (`umToque`, sem o
 * passo do ponto). E a foto do celular tem o botão dela embaixo do quadro:
 * o botão e a foto, dois toques. O passo guarda só o endereço da foto (o
 * ponto que importa nunca ia junto daqui): o encaixe da TV centraliza, e o
 * ponto se ajusta depois, na página da TV.
 *
 * Props: { papel, ramo, valor, onTrocar, formato, rotulo }. `onTrocar`
 * recebe só o endereço da foto (o passo guarda texto, como os campos). Um
 * vídeo da FOTO VIVA também é só o endereço: o poster mora ao lado dele, e a
 * porta (js/peca-html.js) o escreve no espaço da peça.
 */
export function FotoDoPasso({ papel = 'produto', ramo, valor, onTrocar, formato = '16/9', rotulo }) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function doCelular(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setEnviando(true); setErro('');
    try { onTrocar((await subirFotoDoCelular(f)).src); }
    catch (err) { setErro(err.message || 'A foto não subiu. Tente de novo.'); }
    finally { setEnviando(false); }
  }

  return (
    <div>
      <button type="button" onClick={() => setAberto(true)} disabled={enviando} aria-label={valor ? 'Trocar a foto' : (rotulo || 'Ponha a foto')}
        className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-accent/50 bg-accent-soft/20 px-4 text-center transition hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {enviando ? (
          <span className="flex items-center gap-2 text-sm text-ink-2"><Spinner size={16} /> Enviando a foto…</span>
        ) : valor ? (
          <>
            <img src={imagemDoCampo(valor)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded-full bg-surface/90 px-3 py-1.5 text-sm font-semibold text-ink shadow">Trocar a foto</span>
          </>
        ) : (
          <>
            <Camera size={32} className="text-accent" aria-hidden="true" />
            <span className="text-lg font-semibold text-ink">{rotulo || 'Ponha a foto'}</span>
            <span className="text-sm text-ink-3">{ramo ? 'Fotos prontas para o seu negócio, ou feita pela IA' : 'Do banco de fotos ou feita pela IA'}</span>
          </>
        )}
      </button>
      {!valor && (
        <EscolherArquivo accept="image/png,image/jpeg,image/webp" onChange={doCelular} disabled={enviando}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:border-accent">
          <ImageUp size={18} aria-hidden="true" /> Usar uma foto do celular
        </EscolherArquivo>
      )}
      {erro && <p className="mt-1.5 text-sm text-danger" role="alert">{erro}</p>}
      {aberto && (
        <TrocarFoto papel={papel} ramo={ramo || ''} formato={formato} titulo={rotulo || ''}
          valor={valor ? { src: valor } : ''} abaInicial={ramo && !valor ? 'banco' : 'celular'} umToque
          onFechar={() => setAberto(false)}
          onTrocar={(v) => { if (v && v.src) onTrocar(v.src); setAberto(false); }} />
      )}
    </div>
  );
}
