import React, { useEffect, useState } from 'react';
import { MonitorPlay, Check } from 'lucide-react';
import { automaticos as api } from '../../api.js';
import { aviso } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';

/*
 * "MOSTRAR NAS TVs" (EXECUTOR D15): ligar uma vez e a TV mostra sozinha —
 * os aniversariantes na semana do aniversário, o mural com as fotos
 * aprovadas. Sem pôr item em zona nenhuma. Onde: todas as TVs, um grupo, ou
 * TVs escolhidas. Salva na hora.
 *
 * `qual`: 'aniversarios' | 'mural'. No mural, `codigo` diz qual mural.
 */
export function MostrarNasTVs({ qual, codigo, titulo, explicacao }) {
  const [dados, setDados] = useState(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { api.ler().then(setDados).catch(() => setDados(false)); }, []);
  if (dados === null) return null;
  if (dados === false) return <p className="text-xs text-ink-3">Não deu para ler as TVs agora.</p>;

  const a = dados.automaticos || {};
  const atual = qual === 'mural'
    ? (a.mural && a.mural.codigo === codigo ? { ligado: true, telas: a.mural.telas } : { ligado: false, telas: 'todas' })
    : (a.aniversarios || { ligado: false, telas: 'todas' });
  const grupos = [...new Set((dados.telas || []).map((t) => t.grupo).filter(Boolean))];
  const modo = atual.telas === 'todas' ? 'todas' : Array.isArray(atual.telas) ? 'escolher' : 'grupo';

  async function salvar(novo) {
    setSalvando(true);
    try {
      const corpo = qual === 'mural'
        ? { mural: novo.ligado ? { codigo, telas: novo.telas } : (a.mural && a.mural.codigo === codigo ? null : a.mural) }
        : { aniversarios: novo };
      const r = await api.salvar(corpo);
      setDados((d) => ({ ...d, automaticos: r.automaticos }));
      aviso.ok(novo.ligado ? 'Pronto: as TVs mostram sozinhas.' : 'Desligado: as TVs param de mostrar.');
    } catch (e) { aviso.erro('automaticos', 'Não deu para salvar: ' + (e.message || 'falha de conexão') + '.'); }
    finally { setSalvando(false); }
  }

  const nTelas = (dados.telas || []).length;
  const Opcao = ({ id, children }) => (
    <button type="button" role="radio" aria-checked={modo === id} disabled={salvando || !atual.ligado}
      onClick={() => salvar({ ligado: true, telas: id === 'todas' ? 'todas' : id === 'grupo' ? { grupo: grupos[0] || '' } : (dados.telas || []).map((t) => t.id) })}
      className={cn('rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50',
        modo === id ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-accent/50')}>
      {children}
    </button>
  );

  return (
    <div className="space-y-2.5 rounded-lg border border-line bg-surface-2/40 p-3">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-accent))]" checked={!!atual.ligado} disabled={salvando || !nTelas}
          onChange={(e) => salvar({ ligado: e.target.checked, telas: atual.telas || 'todas' })} />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink"><MonitorPlay size={14} className="text-accent" /> {titulo || 'Mostrar nas TVs'}</span>
          <span className="block text-xs text-ink-3">{nTelas ? explicacao : 'Ligue uma TV primeiro (Telas › Ligar a TV).'}</span>
        </span>
      </label>
      {atual.ligado && nTelas > 0 && (
        <div className="space-y-2 pl-6">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Em quais TVs">
            <Opcao id="todas">Todas as TVs ({nTelas})</Opcao>
            {grupos.length > 0 && <Opcao id="grupo">Um grupo</Opcao>}
            {nTelas > 1 && <Opcao id="escolher">Escolher TVs</Opcao>}
          </div>
          {modo === 'grupo' && (
            <select value={atual.telas.grupo} disabled={salvando} aria-label="Grupo"
              onChange={(e) => salvar({ ligado: true, telas: { grupo: e.target.value } })}
              className="h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink">
              {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          {modo === 'escolher' && (
            <div className="flex flex-wrap gap-1.5">
              {(dados.telas || []).map((t) => {
                const marcada = atual.telas.includes(t.id);
                return (
                  <button key={t.id} type="button" aria-pressed={marcada} disabled={salvando}
                    onClick={() => {
                      const lista = marcada ? atual.telas.filter((x) => x !== t.id) : atual.telas.concat(t.id);
                      salvar({ ligado: lista.length > 0, telas: lista.length ? lista : 'todas' });
                    }}
                    className={cn('flex items-center gap-1 rounded-md border px-2 py-1 text-xs', marcada ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-3')}>
                    {marcada && <Check size={11} />} {t.nome}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Em quais TVs um mural está de verdade (pelo "mostrar nas TVs" ou posto numa zona).
export function useMuralNasTelas() {
  const [mapa, setMapa] = useState(null);
  useEffect(() => { api.ler().then((r) => setMapa((r && r.muralNasTelas) || {})).catch(() => setMapa({})); }, []);
  return mapa;
}
