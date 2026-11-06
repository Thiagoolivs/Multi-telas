import React, { useEffect, useState } from 'react';
import { MonitorPlay, Check } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Field.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { ItemPreview } from '../content/ItemPreview.jsx';
import { AtalhosDeGrupo } from './AtalhosDeGrupo.jsx';
import { devices } from '../../api.js';
import { QUANDOS, FAIXAS_DO_DIA, comQuando, frasesDoQuando } from '../../lib/quando.js';
import { porPecaNasTelas, avisarComDesfazer } from '../../lib/rodar.js';
import { aviso } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';

/*
 * PÔR NA TV (fase 7): o fim igual de todo caminho de criar — a prévia,
 * ONDE (as TVs; a de onde a pessoa veio já marcada, senão todas), QUANDO
 * (sempre, só hoje, até um dia, numa hora do dia) e o botão. O aviso traz
 * Desfazer, que tira de todas as TVs de uma vez.
 *
 * Antes cada porta terminava de um jeito: umas perguntavam a TV e não o
 * quando, outras mandavam para a principal sem perguntar nada.
 *
 * `peca`: { item, papel?, formato?, label? } (o formato de lib/rodar.js).
 */
// `alerta`: o que conferir antes (ex.: o texto ainda é o do modelo, com preço de exemplo).
export function PorNaTV({ peca, telaInicial, telas: dadas, onFechar, onFeito, titulo = 'Pôr na TV', descricao, alerta }) {
  const [telas, setTelas] = useState(dadas || null);
  const [alvos, setAlvos] = useState(() => (dadas ? alvosIniciais(dadas, telaInicial) : []));
  const [escolha, setEscolha] = useState(QUANDO_INICIAL);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (dadas) return;
    devices.list().then((r) => {
      const lista = (r && r.devices) || [];
      setTelas(lista); setAlvos(alvosIniciais(lista, telaInicial));
    }).catch(() => setTelas([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const falta = faltaData(escolha);
  // Fase 13: as TVs escolhidas em que esta pessoa já tem uma mudança esperando aprovação (a nova vai junto).
  const comPedido = (telas || []).filter((t) => t.meuPedido && alvos.includes(t.id));

  async function por() {
    setEnviando(true);
    try {
      const item = comQuando(peca.item, escolha);
      const r = await porPecaNasTelas({ ...peca, item }, alvos, telas);
      avisarComDesfazer('Na TV (' + frasesDoQuando(escolha) + '): ' + alvos.length + (alvos.length === 1 ? ' tela.' : ' telas.'), r && r.lote);
      if (onFeito) onFeito({ alvos, item });
      onFechar();
    } catch (e) { aviso.erro('por-na-tv', e.message || 'Não deu para pôr na TV.'); }
    finally { setEnviando(false); }
  }

  return (
    <Dialog open onClose={() => { if (!enviando) onFechar(); }} title={titulo} className="max-w-xl"
      description={descricao || 'Escolha onde e quando. A TV muda na hora, e dá para desfazer.'}
      footer={<>
        <Button variant="ghost" onClick={onFechar} disabled={enviando}>Cancelar</Button>
        <Button variant="primary" icon={MonitorPlay} disabled={!alvos.length || enviando || falta} onClick={por}>
          {enviando ? 'Pondo na TV…' : 'Pôr na TV'}
        </Button>
      </>}>
      <div className="space-y-4">
        {peca && peca.item && <div className="mx-auto max-w-xs"><ItemPreview item={peca.item} /></div>}
        {alerta && <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-ink" role="alert">{alerta}</p>}

        <section aria-label="Onde">
          <div className="mb-1.5 text-sm font-semibold text-ink">1. Onde</div>
          {telas === null ? <Spinner size={16} /> : !telas.length ? (
            <p className="text-sm text-ink-3">Ligue uma TV primeiro (Telas › Ligar a TV). A peça fica guardada.</p>
          ) : (
            <>
              <AtalhosDeGrupo telas={telas} alvos={alvos} onEscolher={setAlvos} />
              <div className="grid gap-1.5 sm:grid-cols-2">
                {telas.map((t) => {
                  const sel = alvos.includes(t.id);
                  return (
                    <button key={t.id} type="button" aria-pressed={sel} onClick={() => setAlvos((a) => (sel ? a.filter((x) => x !== t.id) : a.concat(t.id)))}
                      className={cn('flex min-h-11 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm', sel ? 'border-accent bg-accent-soft/40 text-ink' : 'border-line text-ink-2')}>
                      {sel ? <Check size={14} className="shrink-0 text-accent" /> : <MonitorPlay size={14} className="shrink-0 text-ink-3" />}
                      <span className="truncate">{t.name || 'TV'}</span>
                    </button>
                  );
                })}
              </div>
              {comPedido.length > 0 && (
                <p className="mt-2 rounded-md border border-accent/30 bg-accent-soft/40 px-3 py-2 text-sm text-ink" role="status">
                  Você tem uma mudança esperando aprovação {comPedido.length === 1 ? 'em ' + (comPedido[0].name || 'uma TV') : 'em ' + comPedido.length + ' destas TVs'}. A nova vai junto, no mesmo pedido.
                </p>
              )}
            </>
          )}
        </section>

        <EscolherQuando valor={escolha} onChange={setEscolha} numero="2. " />
      </div>
    </Dialog>
  );
}

export const QUANDO_INICIAL = { quando: 'sempre', ate: '', faixa: 'manha' };
export const faltaData = (e) => e.quando === 'ate' && !e.ate;

/*
 * QUANDO, em palavras (fase 7): sempre, só hoje, até um dia ou numa hora do
 * dia. Também no "Pôr foto ou vídeo na TV" (SubirConteudo.jsx) e, desde a
 * fase 10, na peça que já está na TV (a página da TV). Lá a peça pode ter
 * dias e horas escolhidos à mão: `outro` é o resumo deles, e o chip "Do seu
 * jeito" aparece marcado.
 */
export function EscolherQuando({ valor, onChange, numero = '', outro = '' }) {
  const { quando, ate, faixa } = valor;
  const mudar = (campos) => onChange({ ...valor, ...campos });
  return (
    <section aria-label="Quando">
      <div className="mb-1.5 text-sm font-semibold text-ink">{numero}Quando</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Quando mostrar">
        {QUANDOS.map(([id, nome]) => (
          <button key={id} type="button" role="radio" aria-checked={quando === id} onClick={() => mudar({ quando: id })}
            className={cn('min-h-9 rounded-full border px-3 text-sm max-sm:min-h-11', quando === id ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-accent/50')}>
            {nome}
          </button>
        ))}
        {quando === 'outro' && (
          <button type="button" role="radio" aria-checked className="min-h-9 rounded-full border border-accent bg-accent/10 px-3 text-sm font-semibold text-ink max-sm:min-h-11">Do seu jeito</button>
        )}
      </div>
      {quando === 'ate' && (
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
          Sai sozinha depois de
          <Input type="date" value={ate} onChange={(e) => mudar({ ate: e.target.value })} className="w-auto" aria-label="Até que dia" />
        </label>
      )}
      {quando === 'hora' && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Hora do dia">
          {FAIXAS_DO_DIA.map(([id, nome, hora]) => (
            <button key={id} type="button" role="radio" aria-checked={faixa === id} onClick={() => mudar({ faixa: id })}
              className={cn('min-h-9 rounded-md border px-2.5 text-xs max-sm:min-h-11', faixa === id ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>
              {nome} <span className="text-ink-3">· {hora}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-2xs text-ink-3">
        {quando === 'outro' ? (outro || 'Dias e horas escolhidos à mão') + '. Para mudar os dias e as horas, abra “Mais ajustes”.'
          : quando === 'sempre' ? 'Fica na TV até você tirar.' : quando === 'hoje' ? 'Amanhã ela sai sozinha.'
          : quando === 'ate' ? 'No dia seguinte ela sai sozinha, e a TV segue com o resto.' : 'Todo dia, só nessa hora; no resto do dia passa o que já está lá.'}
      </p>
    </section>
  );
}

function alvosIniciais(telas, telaInicial) {
  if (telaInicial && telas.some((t) => t.id === telaInicial)) return [telaInicial];
  return telas.map((t) => t.id);
}
