import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Trash2, Plus, X, Clock, Newspaper, Layers } from 'lucide-react';
import { Button, IconButton } from '../ui/Button.jsx';
import { PecaHtml } from '../content/PecaHtml.jsx';
import { TickerEditor } from '../content/TickerEditor.jsx';
import { emitir } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';
import { pecasDaFaixa, comPecas } from '../../lib/tela.js';

export { pecasDaFaixa, comPecas };

/*
 * O CABEÇALHO E O RODAPÉ DA TV (EXECUTOR §2c, itens 30 e 31).
 *
 * A página da TV só conhecia UMA peça na faixa (`peca`). A campanha do Criar
 * põe uma LISTA que gira (`pecas`, item 22), as chamadas do cabeçalho e a
 * contagem regressiva — e nada disso aparecia nem se mexia aqui. O rodapé,
 * além disso, era tratado como feed de notícias: com a peça da campanha no
 * ar, a tela mostrava fontes do G1, velocidade e selo, que não valem para ela.
 *
 * Agora:
 *   - a lista inteira, cada peça no tamanho de faixa, com a duração, a ordem
 *     e tirar (com desfazer);
 *   - as chamadas e os avisos que passam, editáveis;
 *   - a contagem regressiva do rodapé;
 *   - o rodapé com DOIS MODOS claros — "Peças e avisos" ou "Notícias" — e
 *     cada um mostra só os controles que valem para ele.
 * `pecas` e `peca` andam juntas: `peca` é a primeira, a que a TV com o JS
 * antigo mostra.
 */
function Mensagens({ titulo, dica, lista, onChange, exemplo }) {
  const [nova, setNova] = useState('');
  const acrescentar = () => { const t = nova.trim(); if (!t) return; onChange(lista.concat(t)); setNova(''); };
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-ink">{titulo}</div>
      {dica && <p className="text-2xs text-ink-3">{dica}</p>}
      {lista.length > 0 && (
        <ul className="space-y-1">
          {lista.map((m, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm text-ink">
              <span className="min-w-0 flex-1 truncate">{m}</span>
              <button type="button" aria-label={'Tirar: ' + m} onClick={() => onChange(lista.filter((_, j) => j !== i))}
                className="text-ink-3 hover:text-danger"><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input value={nova} onChange={(e) => setNova(e.target.value)} placeholder={exemplo}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); acrescentar(); } }}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
        <Button size="sm" icon={Plus} disabled={!nova.trim()} onClick={acrescentar}>Pôr</Button>
      </div>
    </div>
  );
}

function ListaDePecas({ pecas, formato, mensagens, contagem, onChange }) {
  const mover = (i, d) => { const j = i + d; if (j < 0 || j >= pecas.length) return; const l = pecas.slice(); const [x] = l.splice(i, 1); l.splice(j, 0, x); onChange(l); };
  const tirar = (i) => {
    const antes = pecas;
    onChange(pecas.filter((_, j) => j !== i));
    emitir({ tom: 'desfazer', texto: 'Peça tirada da faixa.', acao: { rotulo: 'Desfazer', on: () => onChange(antes) } });
  };
  return (
    <ul className="space-y-3">
      {pecas.map((p, i) => (
        <li key={i} className="space-y-1.5">
          <PecaHtml item={p} formato={formato} mensagens={mensagens} contagem={contagem} />
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
            <span className="font-semibold text-ink">{pecas.length > 1 ? (i + 1) + 'º estilo' : 'Peça da faixa'}</span>
            {p._campanha && <span className="truncate rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-3">campanha {p._campanha}</span>}
            {pecas.length > 1 && (
              <label className="flex items-center gap-1">
                <Clock size={12} className="text-ink-3" />
                <input type="number" min={6} max={600} value={p.duracao || 20} aria-label="Segundos no ar"
                  onChange={(e) => { const l = pecas.slice(); l[i] = { ...p, duracao: Math.max(6, Number(e.target.value) || 20) }; onChange(l); }}
                  className="w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-xs text-ink" /> s
              </label>
            )}
            <span className="ml-auto flex items-center gap-0.5">
              {pecas.length > 1 && <IconButton icon={ChevronUp} label="Subir" size={14} onClick={() => mover(i, -1)} />}
              {pecas.length > 1 && <IconButton icon={ChevronDown} label="Descer" size={14} onClick={() => mover(i, 1)} />}
              <IconButton icon={Trash2} label="Tirar da faixa" size={14} className="hover:text-danger" onClick={() => tirar(i)} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FaixaDaTela({ tipo, zona, onChange, onAdicionar, onAjustes }) {
  const z = zona || {};
  const pecas = pecasDaFaixa(z);
  const mensagens = Array.isArray(z.messages) ? z.messages : [];
  const [modo, setModo] = useState(pecas.length ? 'pecas' : 'noticias');
  const setPecas = (l) => onChange(comPecas(z, l));

  if (tipo === 'header') {
    return (
      <div className="space-y-4 p-4">
        {pecas.length ? (
          <ListaDePecas pecas={pecas} formato="cabecalho" mensagens={mensagens} onChange={setPecas} />
        ) : (
          <div className="rounded-md border border-dashed border-line p-4 text-sm text-ink-2">
            <b className="text-ink">Cabeçalho automático:</b> logo, nome, relógio e clima, nas cores da tela.
            {onAjustes && <> O nome e o tema ficam em <button type="button" className="font-medium text-accent hover:underline" onClick={onAjustes}>Ajustes da tela</button>.</>}
          </div>
        )}
        {onAdicionar && <Button size="sm" icon={Plus} onClick={onAdicionar}>{pecas.length ? 'Outro estilo de cabeçalho' : 'Pôr uma peça no cabeçalho'}</Button>}
        {pecas.length > 0 && (
          <Mensagens titulo="Chamadas que passam no cabeçalho" dica="Aparecem nas peças que têm chamadas girando."
            lista={mensagens} exemplo="Ex.: Pão quentinho toda hora" onChange={(l) => onChange({ ...z, messages: l })} />
        )}
      </div>
    );
  }

  // Rodapé: dois modos, cada um com os seus controles.
  function irPara(novo) {
    if (novo === modo) return;
    if (novo === 'noticias' && pecas.length) {
      const antes = z;
      onChange(comPecas(z, []));
      emitir({ tom: 'desfazer', texto: 'O rodapé voltou às notícias; as peças saíram.', acao: { rotulo: 'Desfazer', on: () => { onChange(antes); setModo('pecas'); } } });
    }
    setModo(novo);
  }
  return (
    <div>
      <div className="flex gap-1 border-b border-line p-2" role="tablist" aria-label="O que passa no rodapé">
        {[['pecas', 'Peças e avisos', Layers], ['noticias', 'Notícias', Newspaper]].map(([id, nome, Icone]) => (
          <button key={id} type="button" role="tab" aria-selected={modo === id} onClick={() => irPara(id)}
            className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition',
              modo === id ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2')}>
            <Icone size={15} /> {nome}
          </button>
        ))}
      </div>
      {modo === 'pecas' ? (
        <div className="space-y-4 p-4">
          {pecas.length ? (
            <ListaDePecas pecas={pecas} formato="rodape" mensagens={mensagens} contagem={z.contagem} onChange={setPecas} />
          ) : (
            <p className="rounded-md border border-dashed border-line p-4 text-sm text-ink-2">
              Sem peça no rodapé: os avisos abaixo passam no letreiro de sempre, nas cores da tela.
            </p>
          )}
          {onAdicionar && <Button size="sm" icon={Plus} onClick={onAdicionar}>{pecas.length ? 'Outro estilo de rodapé' : 'Pôr uma peça no rodapé'}</Button>}
          <Mensagens titulo="Avisos que passam" lista={mensagens} exemplo="Ex.: Aceitamos Pix e cartão"
            onChange={(l) => onChange({ ...z, messages: l, conteudo: 'mensagens' })} />
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-ink">Contagem regressiva</div>
            <p className="text-2xs text-ink-3">Aparece nas peças de rodapé com contagem ("acaba em 2d 04:15:09").</p>
            <div className="flex items-center gap-2">
              <input type="datetime-local" value={z.contagem || ''} aria-label="Contagem regressiva até"
                onChange={(e) => { const n = { ...z, contagem: e.target.value.slice(0, 16) }; if (!n.contagem) delete n.contagem; onChange(n); }}
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" />
              {z.contagem && <Button size="sm" variant="ghost" onClick={() => { const n = { ...z }; delete n.contagem; onChange(n); }}>Tirar</Button>}
            </div>
          </div>
        </div>
      ) : (
        <TickerEditor zone={z} onChange={onChange} />
      )}
    </div>
  );
}
