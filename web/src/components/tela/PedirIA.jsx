import React, { useEffect, useState } from 'react';
import { Sparkles, Check, TriangleAlert, Send } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { PreviaDaTela } from './PreviaDaTela.jsx';
import { AvisoRapido } from './AvisoRapido.jsx';
import { MiniConversa, comPergunta } from './MiniConversa.jsx';
import { ai, brand, devices, deviceConfig } from '../../api.js';
import { aplicarMudancas, descrever } from '../../lib/ajusteTela.js';
import { gravarEmLote, avisarComDesfazer } from '../../lib/rodar.js';
import { aviso } from '../../lib/avisos.js';

/*
 * PEDIR À IA, NA PROGRAMAÇÃO (EXECUTOR D51).
 *
 * O dono: "não entendi como a IA altera as programações". Cada ajuste morava
 * num canto (o aviso rápido aqui, o "Mudar com IA" dentro do editor de cada
 * TV, o conteúdo novo no Criar). Agora há uma caixa só: "o que você quer nas
 * TVs?". A IA entende o pedido, pergunta o que faltar (com respostas prontas)
 * e leva ao caminho certo:
 *   - aviso: o aviso montado, com a prévia e o envio em lote (Desfazer);
 *   - aparência de uma TV: a TV agora e como fica, e "Aplicar na TV" (Desfazer);
 *   - conteúdo novo: o Criar, com o pedido já escrito.
 * Nada muda nas TVs sem o "ok" de quem pediu.
 */
const EXEMPLOS = ['Aviso: piso molhado no corredor', 'Tema claro na TV da recepção', 'Criar uma promoção de café'];

export function PedirIA({ onFechar, onIr }) {
  const [texto, setTexto] = useState('');
  const [historico, setHistorico] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [avisoPronto, setAvisoPronto] = useState(null);
  const [tela, setTela] = useState(null);   // { tv, cfg, depois, linhas, notas, m }
  const [aplicando, setAplicando] = useState(false);
  const [tvs, setTvs] = useState([]);
  const [coresMarca, setCoresMarca] = useState([]);

  useEffect(() => {
    devices.list().then((r) => setTvs((r && r.devices) || [])).catch(() => setTvs([]));
    brand.get().then((r) => setCoresMarca(((r && r.kit && r.kit.cores) || []).filter(Boolean))).catch(() => setCoresMarca([]));
  }, []);

  async function pedir(t) {
    const frase = String(t == null ? texto : t).trim();
    if (!frase || ocupado) return;
    setOcupado(true);
    try {
      const r = await ai.pedir(frase, historico);
      if (r.pergunta) { setHistorico((h) => comPergunta(h, frase, r)); setTexto(''); return; }
      if (r.destino === 'aviso') { setAvisoPronto(r.aviso); return; }
      if (r.destino === 'criar') { onFechar(); if (onIr) onIr('criar', { texto: r.texto }); return; }
      if (r.destino === 'nenhuma-tv') { aviso.erro('pedir', 'Você ainda não tem TV ligada. Pareie uma em Telas.'); return; }
      if (r.destino === 'tela') {
        const cfg = await deviceConfig.get(r.tv.id);
        if (!cfg) { aviso.erro('pedir', 'Esta TV ainda não tem programação para mudar.'); return; }
        setTela({ tv: r.tv, cfg, m: r.mudancas, notas: r.notas || [],
          depois: aplicarMudancas(cfg, r.mudancas, { coresMarca }), linhas: descrever(cfg, r.mudancas, { coresMarca }) });
      }
    } catch (e) { aviso.erro('pedir', e.message || 'Não deu para entender agora.'); }
    finally { setOcupado(false); }
  }

  async function aplicar() {
    const alvo = tvs.find((t) => t.id === tela.tv.id);
    if (!alvo) return;
    setAplicando(true);
    try {
      const r = await gravarEmLote([alvo], (cfg) => aplicarMudancas(cfg, tela.m, { coresMarca }), 'IA na TV ' + (tela.tv.nome || ''));
      avisarComDesfazer('Mudou na TV “' + (tela.tv.nome || 'TV') + '”.', r.lote);
      onFechar();
    } catch (e) { aviso.erro('pedir', e.message || 'Não deu para aplicar na TV.'); }
    finally { setAplicando(false); }
  }

  // O aviso já montado segue no Aviso rápido: a prévia, os ajustes e o envio com Desfazer.
  if (avisoPronto) return <AvisoRapido avisoInicial={avisoPronto} onFechar={onFechar} />;

  if (tela) {
    return (
      <Dialog open onClose={onFechar} className="max-w-3xl" title={'Mudar a aparência: ' + (tela.tv.nome || 'TV')}
        description="Confira antes: a TV agora e como fica. Muda na TV quando você aplicar (e dá para desfazer)."
        footer={<>
          <Button variant="ghost" onClick={() => setTela(null)}>Voltar</Button>
          <Button variant="primary" icon={Check} disabled={aplicando} onClick={aplicar}>{aplicando ? 'Aplicando…' : 'Aplicar na TV'}</Button>
        </>}>
        <div className="grid grid-cols-2 gap-3">
          <PreviaDaTela cfg={tela.cfg} rotulo="Agora" />
          <PreviaDaTela cfg={tela.depois} rotulo="Como fica" />
        </div>
        <ul className="mt-4 space-y-1 text-sm">
          {tela.linhas.map((l, i) => (
            <li key={i} className={l.aviso ? 'flex items-start gap-1.5 text-warn' : 'flex items-start gap-1.5 text-ink'}>
              {l.aviso ? <TriangleAlert size={14} className="mt-0.5 shrink-0" /> : <Check size={14} className="mt-0.5 shrink-0 text-accent" />}{l.texto}
            </li>
          ))}
          {tela.notas.map((n, i) => <li key={'n' + i} className="pl-5 text-xs text-ink-3">{n}</li>)}
        </ul>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onFechar} className="max-w-xl" title="Pedir à IA"
      description="O que você quer nas TVs? Um aviso, mudar a aparência de uma TV ou algo novo. Se eu não entender, pergunto."
      footer={<>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" icon={historico.length ? Send : Sparkles} disabled={!texto.trim() || ocupado} onClick={() => pedir()}>
          {ocupado ? 'Pensando…' : historico.length ? 'Responder' : 'Pedir'}
        </Button>
      </>}>
      <div className="space-y-2">
        <MiniConversa historico={historico} onResponder={pedir} ocupado={ocupado} />
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={historico.length ? 2 : 3} maxLength={500} autoFocus aria-label="O que você quer nas TVs"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pedir(); } }}
          placeholder={historico.length ? 'Responda aqui' : 'Ex.: avisar que o refeitório fecha às 14h na sexta'}
          className="w-full resize-none rounded-md border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
        {!historico.length && (
          <div className="flex flex-wrap gap-1.5">
            {EXEMPLOS.map((s) => (
              <button key={s} type="button" onClick={() => pedir(s)} disabled={ocupado}
                className="rounded-full border border-line px-2.5 py-1 text-2xs text-ink-2 transition hover:border-accent hover:text-accent">{s}</button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
