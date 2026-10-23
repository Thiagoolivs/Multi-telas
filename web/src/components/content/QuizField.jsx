import React, { useState } from 'react';
import { Sparkles, Plus, Trash2, Check, AlertTriangle } from 'lucide-react';
import '../../../../js/quiz.js';
import { Field, Input, Select } from '../ui/Field.jsx';
import { Button } from '../ui/Button.jsx';
import { ai } from '../../api.js';
import { cn } from '../../lib/cn.js';

/*
 * O QUIZ NO EDITOR (EXECUTOR D21).
 *
 * As perguntas uma embaixo da outra: o enunciado, as alternativas com a
 * certa marcada e a explicação. A IA pode escrever (pelo tema), mas o que
 * ela escreve chega MARCADO PARA CONFERIR: a pessoa lê e toca em "Conferi,
 * está certa". Antes disso a pergunta não vai à TV — e o "Publicar na TV"
 * avisa (o servidor recusa). A pergunta digitada aqui já nasce conferida.
 */
const Q = globalThis.MTQuiz;
const VAZIA = () => ({ pergunta: '', alternativas: ['', '', '', ''], certa: 0, explicacao: '', revisada: true });

export function QuizField({ item, onChange }) {
  const [tema, setTema] = useState('');
  const [quantas, setQuantas] = useState('3');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const perguntas = Array.isArray(item.perguntas) ? item.perguntas : [];
  const pendentes = perguntas.filter((p) => p && p.revisada === false).length;

  // A duração na lista acompanha as perguntas (cada uma: tempo de responder + o de mostrar a resposta).
  const set = (mudanca) => {
    const novo = { ...item, ...mudanca };
    const q = Q.normalizar(novo);
    onChange({ ...novo, duracao: Math.max(4, q.perguntas.length * (q.tempo + q.revelar)) });
  };
  const trocar = (i, p) => set({ perguntas: perguntas.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const tirar = (i) => set({ perguntas: perguntas.filter((_, j) => j !== i) });

  async function gerar() {
    setGerando(true); setErro('');
    try {
      const r = await ai.quiz({ tema: tema.trim(), quantidade: Number(quantas) });
      const novas = ((r && r.perguntas) || []).map((p) => ({ ...p, revisada: false }));
      if (!novas.length) throw new Error('A IA não escreveu nenhuma pergunta. Tente outro tema.');
      set({ perguntas: perguntas.concat(novas).slice(0, Q.LIMITES.perguntas) });
    } catch (e) { setErro(e.message || 'A IA não respondeu agora.'); }
    finally { setGerando(false); }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Field label="Título">
          <Input value={item.titulo || ''} maxLength={40} onChange={(e) => set({ titulo: e.target.value })} placeholder="Quiz" />
        </Field>
        <Field label="Tempo para responder">
          <Select value={String(item.tempo || 10)} onChange={(e) => set({ tempo: Number(e.target.value) })}>
            {Q.TEMPOS.map((t) => <option key={t} value={t}>{t} segundos</option>)}
          </Select>
        </Field>
      </div>

      <div className="rounded-lg border border-accent/30 bg-accent-soft/40 p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink"><Sparkles size={14} className="text-accent" /> A IA escreve, você confere</div>
        <div className="flex flex-wrap gap-1.5">
          <input value={tema} onChange={(e) => setTema(e.target.value)} maxLength={200} aria-label="Tema do quiz"
            placeholder="Tema: segurança no trabalho, prevenção, nosso produto…"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink placeholder:text-ink-3" />
          <select value={quantas} onChange={(e) => setQuantas(e.target.value)} aria-label="Quantas perguntas"
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
            {['1', '3', '5'].map((n) => <option key={n} value={n}>{n} {n === '1' ? 'pergunta' : 'perguntas'}</option>)}
          </select>
          <Button size="sm" variant="primary" icon={Sparkles} disabled={gerando} onClick={gerar}>{gerando ? 'Escrevendo…' : 'Escrever'}</Button>
        </div>
        {erro && <p className="mt-1.5 text-2xs text-danger">{erro}</p>}
      </div>

      {pendentes > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-2 text-xs text-ink">
          <AlertTriangle size={14} className="mt-px shrink-0 text-warn" />
          {pendentes === 1 ? '1 pergunta escrita pela IA ainda não foi conferida.' : pendentes + ' perguntas escritas pela IA ainda não foram conferidas.'}
          {' '}Fato errado na TV é pior que nenhum: leia e toque em “Conferi” — antes disso ela não vai ao ar.
        </p>
      )}

      {perguntas.map((p, i) => {
        const conferir = p.revisada === false;
        return (
          <div key={i} className={cn('space-y-2 rounded-lg border p-2.5', conferir ? 'border-warn/50 bg-warn/5' : 'border-line')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink-2">Pergunta {i + 1}{conferir ? ' · escrita pela IA' : ''}</span>
              <button type="button" onClick={() => tirar(i)} aria-label={'Tirar a pergunta ' + (i + 1)} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-danger"><Trash2 size={14} /></button>
            </div>
            <Input value={p.pergunta || ''} maxLength={Q.LIMITES.pergunta} onChange={(e) => trocar(i, { pergunta: e.target.value })} placeholder="A pergunta" aria-label={'Pergunta ' + (i + 1)} />
            <div className="space-y-1.5">
              {[0, 1, 2, 3].map((j) => (
                <label key={j} className="flex items-center gap-2">
                  <input type="radio" name={'certa-' + i} checked={p.certa === j} onChange={() => trocar(i, { certa: j })} aria-label={'Alternativa ' + Q.LETRAS[j] + ' é a certa'} />
                  <span className="w-4 text-xs font-bold text-ink-3">{Q.LETRAS[j]}</span>
                  <Input value={(p.alternativas || [])[j] || ''} maxLength={Q.LIMITES.alternativa} placeholder={j < 2 ? 'Alternativa' : 'Alternativa (opcional)'}
                    onChange={(e) => trocar(i, { alternativas: [0, 1, 2, 3].map((k) => (k === j ? e.target.value : (p.alternativas || [])[k] || '')) })} />
                </label>
              ))}
            </div>
            <Input value={p.explicacao || ''} maxLength={Q.LIMITES.explicacao} onChange={(e) => trocar(i, { explicacao: e.target.value })} placeholder="Explicação (aparece com a resposta)" aria-label={'Explicação da pergunta ' + (i + 1)} />
            {conferir && (
              <Button size="sm" variant="secondary" icon={Check} onClick={() => trocar(i, { revisada: true })}>Conferi, está certa</Button>
            )}
          </div>
        );
      })}

      <Button size="sm" variant="secondary" icon={Plus} disabled={perguntas.length >= Q.LIMITES.perguntas}
        onClick={() => set({ perguntas: perguntas.concat(VAZIA()) })}>Escrever uma pergunta</Button>
    </div>
  );
}
