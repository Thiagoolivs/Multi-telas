import React, { useEffect, useMemo, useState } from 'react';
import { UploadCloud, Globe, Check, Palette } from 'lucide-react';
import { TituloDoPasso, RodapeDoPasso, Erro } from './MolduraDoPasso.jsx';
import { EscolherArquivo } from '../ui/EscolherArquivo.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { EsbocoDaTela } from '../criar/EsbocoDaTela.jsx';
import { brand, media } from '../../api.js';
import { marcaFeita } from '../../lib/jornada.js';
import { sugerir, coresDoLogo, coresDoTexto, ehCurada, mesmaPaleta } from '../../lib/paletas.js';
import { cn } from '../../lib/cn.js';
import { frase } from '../../lib/erros.js';

// "@padariasol", "instagram.com/padariasol" → o endereço do perfil; o resto vai como site.
export function enderecoDaMarca(texto) {
  const t = String(texto || '').trim();
  const arroba = /^@([\w.]{2,30})$/.exec(t);
  if (arroba) return 'https://www.instagram.com/' + arroba[1] + '/';
  return t;
}

const FRASE = { comercio: 'Aberto de segunda a sábado, das 7h às 20h', saude: 'Chegue 15 minutos antes da consulta', empresa: 'Bom trabalho a todos!' };

/*
 * Passo 2 · Sua marca (≈1 min). Duas telas, uma decisão em cada:
 *   1. de onde vem a marca: o logo (um toque e a foto) ou o site/Instagram;
 *   2. as cores que saíram dela, na TV desenhada: "Está bom" ou "Trocar".
 * É a mesma leitura da página Marca (o logo pelo canvas, o site pelo
 * servidor, as paletas de js/paletas.js), sem o resto da página.
 */
export function PassoMarca({ dadosDaMarca, ramo, frente, onRecarregar, onConcluir, onPular }) {
  const kit = (dadosDaMarca && dadosDaMarca.kit) || {};
  const assets = (dadosDaMarca && dadosDaMarca.assets) || [];
  const logo = assets.find((a) => a.kind === 'logo');
  const nome = (kit.nome && kit.nome !== 'Marca principal' ? kit.nome : dadosDaMarca && dadosDaMarca.empresa) || '';
  // Quem volta a este passo (ou já tem marca) cai direto nas cores.
  const [tela, setTela] = useState(() => (marcaFeita(dadosDaMarca) ? 'cores' : 'fonte'));
  const [site, setSite] = useState(kit.site || '');
  const [ocupado, setOcupado] = useState('');
  const [erro, setErro] = useState('');

  async function mandarLogo(e) {
    const f = (e.target.files || [])[0];
    e.target.value = '';
    if (!f) return;
    setOcupado('logo'); setErro('');
    try {
      const up = await media.upload(f);
      await brand.addAsset('logo', up.url, f.name.slice(0, 40));
      // A logo nova vale já nas prévias (o App só lê no login).
      globalThis.MT_LOGO = { url: up.url, clara: '', escura: '' };
      await onRecarregar();
      setTela('cores');
    } catch (er) { setErro(er.message || 'Não deu para mandar o logo. Tente de novo.'); }
    finally { setOcupado(''); }
  }

  async function lerSite() {
    const alvo = enderecoDaMarca(site);
    if (!alvo || !kit.id) return;
    setOcupado('site'); setErro('');
    try {
      await brand.lerSite(kit.id, alvo);
      await onRecarregar();
      setTela('cores');
    } catch (er) {
      setErro(frase(er.message || 'Não consegui ler esse endereço') + ' Mande o logo, ou pule: dá para pôr a marca depois.');
    } finally { setOcupado(''); }
  }

  if (tela === 'cores') {
    return <CoresDaMarca kit={kit} logo={logo} nome={nome} ramo={ramo} frente={frente} onTrocarFonte={() => setTela('fonte')} onConcluir={onConcluir} />;
  }

  return (
    <>
      <TituloDoPasso titulo="Sua marca" frase="Mande o logo. As cores da TV saem dele." />
      <EscolherArquivo accept="image/png,image/svg+xml,image/webp,image/jpeg" onChange={mandarLogo} disabled={!!ocupado} rotulo="Mandar o logo"
        className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent/50 bg-accent-soft/20 px-4 text-center transition hover:border-accent">
        {ocupado === 'logo' ? <Spinner size={22} /> : <UploadCloud size={30} className="text-accent" />}
        <span className="text-lg font-semibold text-ink">{ocupado === 'logo' ? 'Mandando o logo…' : 'Mandar o logo'}</span>
        <span className="text-sm text-ink-3">Uma foto ou o arquivo do logo</span>
      </EscolherArquivo>

      <div className="my-5 flex items-center gap-3 text-sm text-ink-3"><span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" /></div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink-2">Cole o site ou o Instagram</span>
        <div className="flex gap-2">
          <input value={site} onChange={(e) => setSite(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') lerSite(); }}
            placeholder="padaria.com.br ou @padaria" autoComplete="url" inputMode="url" disabled={!!ocupado}
            className="h-12 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          <button type="button" onClick={lerSite} disabled={!!ocupado || !site.trim()}
            className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-50">
            {ocupado === 'site' ? <Spinner size={14} /> : <Globe size={16} />} {ocupado === 'site' ? 'Lendo…' : 'Ler'}
          </button>
        </div>
      </label>
      <Erro>{erro}</Erro>
      <RodapeDoPasso secundario={{ rotulo: 'Não tenho agora', onClick: onPular, disabled: !!ocupado }} />
    </>
  );
}

/*
 * As cores: a paleta que saiu do logo (ou do site) na TV desenhada, e a
 * escolha é uma só — "Está bom" (grava) ou "Trocar" (mostra as outras).
 */
function CoresDaMarca({ kit, logo, nome, ramo, frente, onTrocarFonte, onConcluir }) {
  const [doLogo, setDoLogo] = useState(null);
  useEffect(() => { coresDoLogo(logo && logo.url).then(setDoLogo).catch(() => setDoLogo([])); }, [logo && logo.url]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvas = kit.cores || [];
  const paletas = useMemo(() => {
    if (doLogo === null) return [];
    const daEmpresa = salvas.length && !ehCurada(salvas) ? salvas : doLogo.length ? doLogo : coresDoTexto(kit.siteResumo);
    return sugerir({ ramo: ramo || 'geral', cores: daEmpresa, doSite: coresDoTexto(kit.siteResumo) }).paletas;
  }, [doLogo, salvas.join(','), kit.siteResumo, ramo]); // eslint-disable-line react-hooks/exhaustive-deps
  const [escolhida, setEscolhida] = useState(null);
  const [trocando, setTrocando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState('');
  const atual = escolhida || paletas[0] || null;
  const logoDoEsboco = logo ? { url: logo.url, clara: '', escura: '' } : null;
  const zonas = { cabecalho: { pecas: 1 }, principal: { pecas: 1 }, lateral: { pecas: 1 }, rodape: { pecas: 1, mensagens: [FRASE[frente] || FRASE.comercio] } };

  async function estaBom() {
    if (!atual) { onConcluir(); return; }
    setGravando(true); setErro('');
    try {
      // A paleta da conta só muda se a pessoa escolheu outra: o resto da marca vai como está.
      if (!mesmaPaleta(atual.cores, salvas)) {
        await brand.save({ nome: kit.nome, fonteTitulo: kit.fonteTitulo || '', fonteApoio: kit.fonteApoio || '', direcao: kit.direcao || '', tom: kit.tom || '', observacoes: kit.observacoes || '', cores: atual.cores });
      }
      await onConcluir(atual.cores);
    } catch (e) { setErro(e.message || 'Não deu para guardar as cores. Tente de novo.'); setGravando(false); }
  }

  return (
    <>
      <TituloDoPasso titulo="As cores da sua marca" frase={trocando ? 'Toque na que preferir.' : 'Assim a sua TV vai ficar. Gostou?'} />
      {!atual ? <div className="flex justify-center py-10"><Spinner size={20} /></div> : (
        <div className="mx-auto max-w-md">
          <EsbocoDaTela cores={atual.cores} nome={nome} logo={logoDoEsboco} zonas={zonas} />
          <p className="mt-2 flex items-center justify-center gap-2 text-sm text-ink-2">
            <span className="flex -space-x-1">{atual.cores.slice(0, 3).map((c, i) => <span key={i} className="h-4 w-4 rounded-full border border-surface ring-1 ring-line" style={{ background: c }} />)}</span>
            {atual.nome}
          </p>
        </div>
      )}
      {trocando && (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {paletas.slice(0, 4).map((p) => (
            <button key={p.id} type="button" aria-pressed={atual === p} onClick={() => { setEscolhida(p); setTrocando(false); }}
              className={cn('rounded-lg border-2 p-1.5 text-left transition', atual === p ? 'border-accent' : 'border-line hover:border-accent/60')}>
              <EsbocoDaTela cores={p.cores} nome={nome} logo={logoDoEsboco} zonas={zonas} />
              <span className="mt-1 block truncate px-1 text-xs font-medium text-ink">{p.nome}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
        {!trocando && paletas.length > 1 && (
          <button type="button" onClick={() => setTrocando(true)} className="inline-flex h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
            <Palette size={16} /> Trocar as cores
          </button>
        )}
        <button type="button" onClick={onTrocarFonte} className="inline-flex h-11 items-center font-medium text-ink-3 hover:text-ink">Mandar outro logo</button>
      </div>
      <Erro>{erro}</Erro>
      <RodapeDoPasso principal={{ rotulo: 'Está bom', icone: Check, onClick: estaBom, ocupado: gravando, disabled: !atual }} />
    </>
  );
}
