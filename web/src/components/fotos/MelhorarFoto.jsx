import React, { useEffect, useRef, useState } from 'react';
import { Wand2, Check, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { melhorarFoto, ampliacao, AMPLIACAO_BORRADA } from '../../lib/fotoRuim.js';

/*
 * MELHORAR A FOTO NUM TOQUE (lib/fotoRuim.js). Aparece quando a foto que a
 * pessoa escolheu está escura, apagada, mal enquadrada para o espaço ou
 * pequena para a TV. Mostra o ANTES e o DEPOIS lado a lado, com o que muda
 * (luz e contraste, recorte no formato do espaço) em dois botões de ligar e
 * desligar — e a pessoa escolhe qual sobe. Nada muda calado.
 *
 * Props:
 *   arquivo   o File escolhido
 *   analise   o que analisarFoto mediu ({ url, problemas, niveis, recorte, … })
 *   espaco    [w, h] do espaço na TV
 *   onUsar    (File) — o escolhido (o original ou o melhorado)
 *   onOutra   escolher outra foto
 */
export function MelhorarFoto({ arquivo, analise, espaco, onUsar, onOutra }) {
  const [luz, setLuz] = useState(!!analise.niveis);
  // Foto já pequena para a TV: recortar tiraria a resolução que falta, então o recorte começa desligado.
  const [recorte, setRecorte] = useState(!!analise.recorte && !analise.problemas.some((p) => p.tipo === 'pequena'));
  const [depois, setDepois] = useState(null);   // { arquivo, url, largura, altura }
  const [fazendo, setFazendo] = useState(false);
  const [erro, setErro] = useState('');
  const ultimo = useRef(null);
  const temConserto = !!(analise.niveis || analise.recorte);
  const ligado = (luz && analise.niveis) || (recorte && analise.recorte);

  useEffect(() => {
    if (!ligado) { setDepois(null); return undefined; }
    let vivo = true;
    setFazendo(true); setErro('');
    melhorarFoto(analise, { niveis: luz ? analise.niveis : null, recorte: recorte ? analise.recorte : null, nome: arquivo.name })
      .then((d) => {
        if (!vivo) { URL.revokeObjectURL(d.url); return; }
        if (ultimo.current) URL.revokeObjectURL(ultimo.current);
        ultimo.current = d.url;
        setDepois(d);
      })
      .catch((e) => { if (vivo) setErro(e.message || 'Não deu para melhorar esta foto.'); })
      .finally(() => { if (vivo) setFazendo(false); });
    return () => { vivo = false; };
  }, [luz, recorte]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (ultimo.current) URL.revokeObjectURL(ultimo.current); }, []);

  // A foto que vai, com a medida dela: recortar tira resolução, e o aviso de "borrada" segue a escolhida.
  const medidaDepois = depois ? { largura: depois.largura, altura: depois.altura } : null;
  const borradaDepois = medidaDepois && ampliacao(medidaDepois, espaco) > AMPLIACAO_BORRADA
    && !analise.problemas.some((p) => p.tipo === 'pequena' || p.tipo === 'borrada');
  const avisos = analise.problemas.filter((p) => !p.conserta);
  const consertaveis = analise.problemas.filter((p) => p.conserta);
  const alternar = 'inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ';

  return (
    <div className="space-y-3" aria-live="polite">
      <ul className="space-y-1 text-xs text-ink-2">
        {consertaveis.map((p) => <li key={p.tipo} className="flex gap-1.5"><Wand2 size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" /> {p.texto}</li>)}
        {avisos.map((p) => <li key={p.tipo} className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" /> {p.texto}</li>)}
      </ul>
      {temConserto && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="O que melhorar">
          {analise.niveis && (
            <button type="button" aria-pressed={luz} onClick={() => setLuz((v) => !v)}
              className={alternar + (luz ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2')}>{luz && <Check size={12} aria-hidden="true" />} Luz e contraste</button>
          )}
          {analise.recorte && (
            <button type="button" aria-pressed={recorte} onClick={() => setRecorte((v) => !v)}
              className={alternar + (recorte ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-2')}>{recorte && <Check size={12} aria-hidden="true" />} Recortar para o espaço</button>
          )}
        </div>
      )}
      <div className={temConserto ? 'grid grid-cols-2 gap-2' : ''}>
        <figure className="space-y-1">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-surface-2">
            <img src={analise.url} alt="A foto como você escolheu" className="max-h-full max-w-full object-contain" />
          </div>
          <figcaption className="text-center text-2xs text-ink-3">Antes · {analise.largura}×{analise.altura}</figcaption>
        </figure>
        {temConserto && (
          <figure className="space-y-1">
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md bg-surface-2">
              {depois && ligado
                ? <img src={depois.url} alt="A foto melhorada" className="max-h-full max-w-full object-contain" />
                : <span className="px-2 text-center text-2xs text-ink-3">{ligado ? '' : 'Ligue uma das melhorias para ver.'}</span>}
              {fazendo && <span className="absolute inset-0 flex items-center justify-center bg-surface/60"><Spinner size={18} /></span>}
            </div>
            <figcaption className="text-center text-2xs text-ink-3">Depois{depois && ligado ? ' · ' + depois.largura + '×' + depois.altura : ''}</figcaption>
          </figure>
        )}
      </div>
      {borradaDepois && ligado && <p className="text-2xs text-ink-3">Recortada, a foto fica com menos resolução: na TV, um pouco borrada.</p>}
      {erro && <p className="text-xs text-danger" role="alert">{erro}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onOutra}>Escolher outra</Button>
        <Button variant={temConserto && ligado ? 'secondary' : 'primary'} onClick={() => onUsar(arquivo)}>{temConserto ? 'Usar a original' : 'Usar assim mesmo'}</Button>
        {temConserto && <Button variant="primary" icon={Wand2} disabled={!ligado || !depois || fazendo} onClick={() => onUsar(depois.arquivo)}>Usar a melhorada</Button>}
      </div>
    </div>
  );
}
