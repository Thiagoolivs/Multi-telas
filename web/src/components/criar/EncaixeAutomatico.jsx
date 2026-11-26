import React, { useEffect, useRef, useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { Spinner } from '../ui/Feedback.jsx';
import { conferirNosFormatos, NOME_DO_FORMATO } from '../../lib/pecaHtml.js';
import { ondeConferir, rotulo } from '../content/EditarPeca.jsx';
import { ai, pecas as apiPecas } from '../../api.js';
import { naoCabe, garantirTodas, lembrarTentativa, chaveDaPeca, fraseDoEstado } from '../../lib/encaixeAuto.js';

/*
 * O ENCAIXE AUTOMÁTICO no painel (a ordem e as regras: lib/encaixeAuto.js).
 * Toda peça em HTML que o Criar e a Criação rápida entregam é conferida
 * aqui, em segundo plano; a que não cabe volta uma vez à IA, depois vira a
 * peça-ouro aprovada, e o que sobrar fica marcado na peça.
 *
 * ONDE CONFERIR: a faixa no tamanho da faixa e o resto nos três formatos
 * (o mesmo do editor da peça, EditarPeca.ondeConferir) — menos a lateral,
 * que vai na coluna estreita da TV (515×832, js/regras-composicao.js) e
 * nunca em tela cheia.
 */
export const TAMANHO_DA_LATERAL = [515, 832];
export function ondeConferirNoPapel(item) {
  if (item && item.papel === 'lateral') return { Lateral: TAMANHO_DA_LATERAL };
  return ondeConferir(item);
}

// Os passos de verdade: o conferidor da bancada, o redesenho da IA e a reserva do servidor.
export function passosDoEncaixe(opcoes) {
  const o = opcoes || {};
  const tentativas = lembrarTentativa();
  const comFormato = (novo, de) => (novo ? { ...novo, formato: de.formato || novo.formato } : null);
  return {
    conferir: async (item) => naoCabe(await conferirNosFormatos(item, ondeConferirNoPapel(item)), (f) => NOME_DO_FORMATO[f] || f, rotulo),
    refazer: async (item, avisos) => {
      // Lembrada ANTES de pedir: a aba fechada no meio não faz a próxima visita pedir de novo.
      tentativas.marcar(item);
      const out = await ai.refazerPeca(item, avisos, o.onEtapa);
      // A redesenhada também: se ela voltar a não caber, não vai de novo para a IA (uma vez por peça).
      if (out && out.item) tentativas.marcar({ ...out.item, formato: item.formato || out.item.formato });
      return comFormato(out && out.item, item);
    },
    podeRefazer: (item) => tentativas.pode(item),
    reserva: async (item) => {
      try { const r = await apiPecas.reserva(item); return comFormato(r && r.item, item); } catch (e) { return null; }
    },
  };
}

const TROCOU = ['redesenhada', 'reserva'];

/*
 * O encaixe de uma lista de peças ([{ chave, item }]), em segundo plano.
 * `onTrocar(chave, item, resultado)`: a peça nova (redesenhada ou a
 * reserva) — quem chama guarda; devolve uma promessa, e se ela falhar a
 * peça fica marcada. A peça que já passou (o mesmo desenho) não é
 * conferida de novo quando a lista muda.
 */
export function useEncaixeAutomatico(lista, { onTrocar, ligado = true } = {}) {
  const [estados, setEstados] = useState({});
  const feitos = useRef({});       // chave → { desenho, r }
  const andando = useRef(new Set());
  const montado = useRef(true);
  const trocar = useRef(onTrocar);
  trocar.current = onTrocar;
  useEffect(() => () => { montado.current = false; }, []);

  const marca = (lista || []).map((x) => x.chave + '\u0002' + chaveDaPeca(x.item)).join('\u0003');
  useEffect(() => {
    if (!ligado) return;
    const pendentes = (lista || []).filter((x) => {
      const f = feitos.current[x.chave];
      const k = x.chave + '\u0002' + chaveDaPeca(x.item);
      return !(f && f.desenho === chaveDaPeca(x.item)) && !andando.current.has(k);
    });
    if (!pendentes.length) return;
    pendentes.forEach((x) => andando.current.add(x.chave + '\u0002' + chaveDaPeca(x.item)));
    const por = (estado) => { if (montado.current) setEstados((e) => ({ ...e, ...estado })); };
    garantirTodas(pendentes, passosDoEncaixe(), {
      onPeca: (chave, r) => {
        const anterior = feitos.current[chave];
        // A peça consertada que volta da campanha é só reconferida: o selo do conserto não pisca para "conferindo".
        if (!r.estado) { if (!(anterior && TROCOU.includes(anterior.r.estado))) por({ [chave]: { fase: r.fase, avisos: r.avisos } }); return; }
        // Guardada a redesenhada, a campanha volta com ela, e a conferência de novo diz "cabe": o selo continua o do conserto.
        const final = anterior && TROCOU.includes(anterior.r.estado) && r.estado === 'cabe' ? anterior.r : r;
        feitos.current[chave] = { desenho: chaveDaPeca(r.item), r: final };
        pendentes.filter((x) => x.chave === chave).forEach((x) => andando.current.delete(x.chave + '\u0002' + chaveDaPeca(x.item)));
        por({ [chave]: final });
        if (TROCOU.includes(r.estado) && trocar.current) {
          Promise.resolve(trocar.current(chave, r.item, r)).catch(() => {
            por({ [chave]: { estado: 'nao-cabe', avisos: r.antes.concat('a peça nova não foi guardada; tente abrir de novo'), antes: r.antes } });
          });
        }
      },
    });
  }, [marca, ligado]); // eslint-disable-line react-hooks/exhaustive-deps

  const lidos = (lista || []).map((x) => estados[x.chave]).filter(Boolean);
  return {
    estados,
    total: (lista || []).length,
    feitas: lidos.filter((r) => r.estado).length,
    rodando: ligado && (lista || []).some((x) => !(estados[x.chave] && estados[x.chave].estado)),
  };
}

// O selo de uma peça: só o que importa (o "cabe" de sempre não ocupa lugar).
export function SeloDoEncaixe({ r }) {
  if (!r || r.estado === 'cabe') return null;
  if (!r.estado) {
    return <div className="flex items-center gap-1 text-2xs text-ink-3" role="status"><Spinner size={10} /> {fraseDoEstado(r)}</div>;
  }
  if (TROCOU.includes(r.estado)) {
    return <div className="flex items-center gap-1 text-2xs text-ok"><Check size={11} aria-hidden="true" /> {fraseDoEstado(r)}</div>;
  }
  if (r.estado === 'sem-conferir') return <div className="text-2xs text-ink-3">{fraseDoEstado(r)} se cabe na TV</div>;
  return (
    <div className="rounded border border-warn/40 bg-warn/10 px-1.5 py-1 text-2xs leading-snug text-ink" role="alert">
      <span className="font-semibold">Não cabe na TV:</span> {r.avisos[0]}{r.avisos.length > 1 ? ' (+' + (r.avisos.length - 1) + ')' : ''}. Encurte o texto no Editar.
    </div>
  );
}

/*
 * O resumo, em cima das peças (e antes do "Pôr pra rodar"): o andamento
 * enquanto confere, e no fim o que foi consertado e o que não coube.
 */
export function ResumoDoEncaixe({ encaixe, rotuloDaPeca }) {
  const { estados, total, feitas, rodando } = encaixe;
  if (!total) return null;
  const finais = Object.entries(estados).filter(([, r]) => r && r.estado);
  const ruins = finais.filter(([, r]) => r.estado === 'nao-cabe');
  const consertadas = finais.filter(([, r]) => TROCOU.includes(r.estado)).length;
  if (rodando) {
    const pct = Math.round((feitas / total) * 100);
    return (
      <div className="space-y-1 rounded-md bg-surface-2 px-3 py-2" role="status">
        <div className="flex items-center gap-1.5 text-xs text-ink-2"><Spinner size={12} /> Conferindo se cada peça cabe na TV… {feitas} de {total}</div>
        <div className="h-1 overflow-hidden rounded-full bg-surface"><div className="h-full bg-accent transition-[width]" style={{ width: pct + '%' }} /></div>
      </div>
    );
  }
  if (ruins.length) {
    return (
      <div role="alert" className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink"><AlertTriangle size={15} className="text-warn" /> {ruins.length === 1 ? 'Uma peça não coube na TV' : ruins.length + ' peças não couberam na TV'}, nem redesenhada{ruins.length === 1 ? '' : 's'}</div>
        <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
          {ruins.slice(0, 6).map(([k, r]) => <li key={k}><b className="text-ink">{rotuloDaPeca ? rotuloDaPeca(k) : 'Peça'}:</b> {r.avisos[0]}.</li>)}
        </ul>
        <p className="mt-1.5 text-2xs text-ink-3">Se puser na TV assim, o texto vai sair da borda. Encurte o texto no Editar da peça{consertadas ? '. As outras já foram ajustadas para caber.' : '.'}</p>
      </div>
    );
  }
  if (consertadas) return <p className="flex items-center gap-1.5 text-xs text-ink-2"><Check size={13} className="text-ok" /> {consertadas === 1 ? 'Uma peça foi ajustada' : consertadas + ' peças foram ajustadas'} para caber na TV. As outras couberam como vieram.</p>;
  return null;
}
