import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { brand, media } from '../../api.js';
import { aviso, emitir } from '../../lib/avisos.js';
import { analisar, avisaLogoEscura, versaoBranca, ESCURO } from '../../lib/logo.js';

/*
 * "SUA LOGO SOME NO FUNDO ESCURO DA TV" (reteste 4, 25/11).
 *
 * A versão branca da logo escura nascia só no passo 2 da primeira TV
 * (PassoMarca.jsx, versoesQueFaltam). A conta que já tinha a logo escura
 * sem a versão branca seguia com ela sumindo no cabeçalho, no rodapé e na
 * espera escuros (a TV põe uma placa clara atrás, para dar para ler). O
 * dono pediu "nunca troca calado": nada é feito sozinho. Este aviso aparece
 * no Início e na Marca, com a logo no fundo escuro para a pessoa ver, e um
 * toque faz SÓ a versão branca (lib/logo.js, versaoBranca) — a logo da
 * conta continua a mesma, e o aviso de depois traz o Desfazer.
 *
 * `logo`: { url, clara } (globalThis.MT_LOGO, ou os assets da Marca).
 * `analise`: a da página da Marca, que já analisou (sem ela, analisa aqui).
 * `onFeito(url)`: a versão branca entrou (a página recarrega a marca).
 * `onIrParaMarca`: o link "Ver na Marca", no Início.
 */
export function AvisoDaLogoEscura({ logo, analise: dada, onFeito, onIrParaMarca }) {
  const [lida, setLida] = useState(null);
  const [fazendo, setFazendo] = useState(false);
  const [feito, setFeito] = useState(false);
  const url = logo && logo.url;
  const analise = dada !== undefined ? dada : lida;

  useEffect(() => {
    setFeito(false);
    if (dada !== undefined || !url || (logo && logo.clara)) return undefined;
    let vivo = true;
    analisar(url).then((a) => { if (vivo) setLida(a); }).catch(() => { if (vivo) setLida(false); });
    return () => { vivo = false; };
  }, [url, logo && logo.clara, dada]); // eslint-disable-line react-hooks/exhaustive-deps

  if (feito || !avisaLogoEscura(logo, analise)) return null;

  async function fazer() {
    setFazendo(true);
    try {
      const v = await versaoBranca(url, analise);
      if (!v) { aviso.ok('A logo já aparece no fundo escuro: nada a fazer.'); setFeito(true); return; }
      const up = await media.upload(new File([v.blob], v.nome, { type: v.blob.type || 'image/png' }));
      const asset = await brand.addAsset('logo-clara', up.url, 'logo para fundo escuro');
      // A versão nova já vale nas prévias do painel (o App só lê no login).
      if (globalThis.MT_LOGO && globalThis.MT_LOGO.url === url) globalThis.MT_LOGO = { ...globalThis.MT_LOGO, clara: up.url };
      setFeito(true);
      emitir({
        tom: 'desfazer',
        texto: 'Pronto: a versão branca entra no fundo escuro das TVs. A sua logo continua a mesma.',
        acao: asset && asset.id ? { rotulo: 'Desfazer', on: async () => {
          try {
            await brand.removeAsset(asset.id);
            if (globalThis.MT_LOGO && globalThis.MT_LOGO.clara === up.url) globalThis.MT_LOGO = { ...globalThis.MT_LOGO, clara: '' };
            setFeito(false);
            if (onFeito) onFeito('');
            aviso.ok('Desfeito: a versão branca saiu.');
          } catch (e) { aviso.erro('logo', 'Não deu para desfazer: ' + (e.message || 'falha de conexão') + '.'); }
        } } : undefined,
      });
      if (onFeito) onFeito(up.url);
    } catch (e) {
      aviso.erro('logo', 'A versão branca não foi feita: ' + (e.message || 'falha de conexão') + '. A logo continua como estava.');
    } finally { setFazendo(false); }
  }

  return (
    <section aria-label="A logo no fundo escuro da TV" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-warn/40 bg-warn-soft p-3">
      {/* A logo como ela fica no fundo escuro da TV: a pessoa vê o problema antes de decidir. */}
      <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md p-2" style={{ background: ESCURO }} aria-hidden="true">
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      </div>
      <div className="min-w-[12rem] flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink"><AlertTriangle size={15} className="shrink-0 text-warn" aria-hidden="true" /> Sua logo some no fundo escuro da TV</div>
        <p className="mt-0.5 text-sm text-ink-2">No cabeçalho, no rodapé e na espera escuros, ela fica difícil de ver. Uma versão branca resolve. A sua logo continua a mesma: a branca entra só no fundo escuro.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" icon={fazendo ? undefined : Check} disabled={fazendo} onClick={fazer}>
          {fazendo ? <><Spinner size={12} /> Fazendo…</> : 'Fazer a versão branca'}
        </Button>
        {onIrParaMarca && <Button variant="ghost" size="sm" onClick={onIrParaMarca}>Ver na Marca</Button>}
      </div>
    </section>
  );
}
