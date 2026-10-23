import React, { useState } from 'react';
import { Sparkles, Check, TriangleAlert } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { PreviaDaTela } from './PreviaDaTela.jsx';
import { ai, brand } from '../../api.js';
import { useAsync } from '../../lib/useAsync.js';
import { emitir, aviso } from '../../lib/avisos.js';
import { aplicarMudancas, descrever, orientacaoDaTela, temMudanca } from '../../lib/ajusteTela.js';

/*
 * MUDAR A TELA COM A IA (EXECUTOR D28). "Lateral do outro lado", "tema
 * claro", "fundo azul", "tira o relógio", "clima de Curitiba": a IA diz o
 * que muda, o painel mostra a TV agora e como fica, e só com o "Usar assim"
 * vira o rascunho — que vai para a TV no Publicar, como o resto do editor.
 */
const EXEMPLOS = ['lateral do outro lado', 'tema claro', 'fundo azul marinho', 'sem relógio', 'clima de Curitiba'];

export function MudarComIA({ cfg, onAplicar }) {
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposta, setProposta] = useState(null);
  const [sobra, setSobra] = useState('');
  const { data: brandData } = useAsync(brand.get);
  const coresMarca = ((brandData && brandData.kit && brandData.kit.cores) || []).filter(Boolean);

  async function ver(e) {
    if (e) e.preventDefault();
    if (!texto.trim() || busy) return;
    setBusy(true); setSobra('');
    try {
      const s = (cfg && cfg.settings) || {};
      const r = await ai.tela(texto.trim(), { layoutId: s.layoutId || 'dashboard', orientacao: orientacaoDaTela(cfg), tema: (s.theme && s.theme.preset) || '' });
      const m = (r && r.mudancas) || {};
      const notas = (r && r.notas) || [];
      if (!temMudanca(m)) { setSobra(notas[0] || 'Não entendi o que mudar. Tente: ' + EXEMPLOS.slice(0, 3).map((x) => '"' + x + '"').join(', ') + '.'); return; }
      setProposta({ m, notas, depois: aplicarMudancas(cfg, m, { coresMarca }), linhas: descrever(cfg, m, { coresMarca }) });
    } catch (err) { aviso.erro('mudar-tela', err.message || 'Não deu para entender agora.'); }
    finally { setBusy(false); }
  }

  function usar() {
    const antes = cfg;
    onAplicar(proposta.depois);
    setProposta(null); setTexto('');
    emitir({ tom: 'desfazer', texto: 'Mudou no rascunho. Publique para ir à TV.', acao: { rotulo: 'Desfazer', on: () => onAplicar(antes) } });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form onSubmit={ver} className="flex gap-2">
        <label className="sr-only" htmlFor="mudar-tela">Mudar a tela com a IA</label>
        <input id="mudar-tela" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300}
          placeholder={'Mudar a tela: ' + EXEMPLOS.slice(0, 3).join(', ') + '…'}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
        <Button type="submit" icon={Sparkles} disabled={!texto.trim() || busy}>{busy ? 'Vendo…' : 'Ver como fica'}</Button>
      </form>
      {sobra && <p className="mt-1.5 text-xs text-ink-3" role="status">{sobra}</p>}

      {proposta && (
        <Dialog open onClose={() => setProposta(null)} className="max-w-3xl" title="Mudar a tela"
          description="Confira antes: muda só o rascunho, e vai para a TV no Publicar."
          footer={<>
            <Button variant="ghost" onClick={() => setProposta(null)}>Deixar como está</Button>
            <Button variant="primary" icon={Check} onClick={usar}>Usar assim</Button>
          </>}>
          <div className="grid grid-cols-2 gap-3">
            <PreviaDaTela cfg={cfg} rotulo="Agora" />
            <PreviaDaTela cfg={proposta.depois} rotulo="Como fica" />
          </div>
          <ul className="mt-4 space-y-1 text-sm">
            {proposta.linhas.map((l, i) => (
              <li key={i} className={l.aviso ? 'flex items-start gap-1.5 text-warn' : 'flex items-start gap-1.5 text-ink'}>
                {l.aviso ? <TriangleAlert size={14} className="mt-0.5 shrink-0" /> : <Check size={14} className="mt-0.5 shrink-0 text-accent" />}{l.texto}
                {l.cor && <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-line" style={{ background: l.cor }} aria-hidden="true" />}
              </li>
            ))}
            {proposta.notas.map((n, i) => <li key={'n' + i} className="pl-5 text-xs text-ink-3">{n}</li>)}
          </ul>
        </Dialog>
      )}
    </div>
  );
}
