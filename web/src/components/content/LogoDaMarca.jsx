import React, { useEffect, useState } from 'react';
import { UploadCloud, Trash2, Palette, Wand2, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { brand, media } from '../../api.js';
import { aviso } from '../../lib/avisos.js';
import { analisar, propor, CLARO, ESCURO } from '../../lib/logo.js';
import { cn } from '../../lib/cn.js';

/*
 * A LOGO DA MARCA, analisada e corrigida (EXECUTOR D7).
 *
 * A análise aparece sozinha, assim que há logo: fundo, tamanho, cores e se
 * ela lê no fundo claro e no escuro da TV. "Melhorar a logo" monta uma
 * proposta (tira o fundo sólido, vetoriza a logo simples, faz as versões
 * branca e escura) e mostra ANTES e DEPOIS. Nada é trocado sem o "Usar a
 * nova" — e a original continua em Mídias.
 */

function Selo({ ok, children }) {
  return (
    <span className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs',
      ok ? 'border-ok/40 text-ok' : 'border-warn/50 bg-warn-soft text-ink')}>
      {ok ? <Check size={11} /> : <AlertTriangle size={11} className="text-warn" />} {children}
    </span>
  );
}

// A logo sobre o fundo claro e o escuro da TV, lado a lado.
function NosDoisFundos({ url, clara, escura, rotulo }) {
  return (
    <div>
      {rotulo && <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">{rotulo}</div>}
      <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line">
        <div className="flex h-24 w-36 items-center justify-center p-3" style={{ background: CLARO }}>
          <img src={escura || url} alt="No fundo claro" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="flex h-24 w-36 items-center justify-center p-3" style={{ background: ESCURO }}>
          <img src={clara || url} alt="No fundo escuro" className="max-h-full max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}

export function LogoDaMarca({ logo, logoClara, logoEscura, busy, onSubir, onTirar, onTrocou }) {
  const [analise, setAnalise] = useState(null);
  const [proposta, setProposta] = useState(null);
  const [trabalhando, setTrabalhando] = useState('');

  useEffect(() => {
    setAnalise(null); setProposta(null);
    if (!logo) return undefined;
    let vivo = true;
    analisar(logo.url).then((a) => { if (vivo) setAnalise(a); }).catch(() => { if (vivo) setAnalise(false); });
    return () => { vivo = false; };
  }, [logo && logo.url]); // eslint-disable-line react-hooks/exhaustive-deps

  async function melhorar() {
    setTrabalhando('Conferindo a logo…');
    try {
      const p = await propor(logo.url, analise || undefined);
      if (!p.mudou) aviso.ok(p.avisos[0] || 'A logo está boa: nada a corrigir.');
      else setProposta(p);
    } catch (e) { aviso.erro('logo', 'Não deu para mexer nesta logo: ' + (e.message || 'erro') + '.'); }
    finally { setTrabalhando(''); }
  }

  // Só aqui algo é gravado: a nova vira a logo, e as versões vão junto.
  async function usarANova() {
    setTrabalhando('Salvando a logo nova…');
    try {
      const subir = async (arq, kind, rotulo) => {
        const up = await media.upload(new File([arq.blob], arq.nome, { type: arq.blob.type || arq.tipo }));
        await brand.addAsset(kind, up.url, rotulo);
      };
      await subir(proposta.principal, 'logo', 'logo corrigida');
      if (proposta.versoes.clara) await subir(proposta.versoes.clara, 'logo-clara', 'logo para fundo escuro');
      if (proposta.versoes.escura) await subir(proposta.versoes.escura, 'logo-escura', 'logo para fundo claro');
      aviso.ok('Logo trocada. A original continua em Mídias, se quiser voltar.');
      setProposta(null);
      onTrocou && onTrocou();
    } catch (e) { aviso.erro('logo', 'A logo nova não foi salva: ' + (e.message || 'falha de conexão') + '.'); }
    finally { setTrabalhando(''); }
  }

  const a = analise;
  const precisa = a && (a.pequena || (a.fundo && !a.transparente) || (!a.claro.ok && !logoEscura) || (!a.escuro.ok && !logoClara));

  return (
    <Panel>
      <PanelHeader title="Logo"
        description="Vai no mesmo canto de todas as peças. Aceita PNG e SVG; a análise mostra se ela lê bem na TV."
        actions={(
          <label className={cn('flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition',
            logo ? 'border-line bg-surface text-ink-2 hover:bg-surface-2' : 'border-accent bg-accent text-accent-fg hover:opacity-90', (busy || trabalhando) && 'pointer-events-none opacity-60')}>
            <UploadCloud size={14} /> {logo ? 'Trocar logo' : 'Enviar logo'}
            <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="hidden" onChange={onSubir} />
          </label>
        )} />
      {!logo ? (
        <div className="flex items-center gap-2 p-4 text-sm text-ink-3">
          <Palette size={15} /> Sem logo ainda. Envie a logo para ela aparecer nas peças.
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <NosDoisFundos url={logo.url} clara={logoClara && logoClara.url} escura={logoEscura && logoEscura.url} />
            <div className="min-w-0 flex-1 space-y-2">
              {a === null && <span className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={12} /> Analisando a logo…</span>}
              {a === false && <span className="text-xs text-ink-3">Não deu para analisar esta logo.</span>}
              {a && (
                <div className="flex flex-wrap gap-1.5">
                  <Selo ok={!a.pequena}>{a.svg ? 'Vetor (SVG): nítida em qualquer TV' : a.pequena ? 'Pequena (' + a.largura + '×' + a.altura + '): pode borrar' : 'Tamanho bom (' + a.largura + '×' + a.altura + ')'}</Selo>
                  <Selo ok={a.transparente || !a.fundo}>{a.transparente ? 'Fundo transparente' : a.fundo ? 'Fundo sólido: vira uma caixa na TV' : 'Sem fundo sólido'}</Selo>
                  <Selo ok={a.claro.ok || !!logoEscura}>{a.claro.ok ? 'Lê no fundo claro' : logoEscura ? 'Versão escura pronta' : 'Some no fundo claro'}</Selo>
                  <Selo ok={a.escuro.ok || !!logoClara}>{a.escuro.ok ? 'Lê no fundo escuro' : logoClara ? 'Versão branca pronta' : 'Some no fundo escuro'}</Selo>
                  {a.cores.length > 0 && (
                    <span className="flex items-center gap-1 text-2xs text-ink-3">
                      Cores {a.cores.slice(0, 4).map((c) => <span key={c} title={c} className="h-3 w-3 rounded-full border border-line" style={{ background: c }} />)}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {a && (
                  <Button size="sm" variant={precisa ? 'primary' : 'secondary'} icon={Wand2} disabled={!!trabalhando || busy} onClick={melhorar}>
                    {precisa ? 'Melhorar a logo' : 'Conferir e melhorar'}
                  </Button>
                )}
                <button type="button" onClick={onTirar} className="flex items-center gap-1 text-xs text-ink-3 hover:text-danger">
                  <Trash2 size={12} /> Tirar a logo
                </button>
                {trabalhando && <span className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={12} /> {trabalhando}</span>}
              </div>
            </div>
          </div>

          {/* ANTES e DEPOIS: nada muda sem o "Usar a nova". */}
          {proposta && (
            <div className="rounded-lg border border-accent/40 bg-accent-soft/30 p-3">
              <div className="mb-2 text-sm font-semibold text-ink">Antes e depois</div>
              <div className="flex flex-wrap items-center gap-3">
                <NosDoisFundos rotulo="Antes" url={logo.url} />
                <ArrowRight size={18} className="text-ink-3" />
                <NosDoisFundos rotulo="Depois" url={proposta.previa.principal} clara={proposta.previa.clara} escura={proposta.previa.escura} />
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
                {proposta.feito.map((t) => <li key={t}>· {t}</li>)}
                {proposta.avisos.map((t) => <li key={t} className="text-ink-3">· {t}</li>)}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" icon={Check} disabled={!!trabalhando} onClick={usarANova}>Usar a nova</Button>
                <Button size="sm" variant="ghost" disabled={!!trabalhando} onClick={() => setProposta(null)}>Manter a original</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
