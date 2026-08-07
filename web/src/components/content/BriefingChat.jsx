import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Check, SkipForward } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { ai } from '../../api.js';

/*
 * Conversa curta antes de gerar a campanha.
 *
 * A promessa é "gerações perfeitas", e o que separa uma peça boa de uma peça
 * genérica não é o motor: é o briefing. O motor já sabe compor, corrigir
 * contraste e revisar. O que ele não tem é o que só o dono do negócio sabe —
 * para quem, por que agora, qual a prova.
 *
 * Uma pergunta por vez, no máximo cinco, e com botão de pular sempre visível:
 * quem tem pressa não pode ser obrigado a conversar.
 */
export function BriefingChat({ empresa, segmento, primeiraFala, onPronto, onPular }) {
  const [mensagens, setMensagens] = useState([]);
  const [pergunta, setPergunta] = useState(null);
  const [sugestoes, setSugestoes] = useState([]);
  const [porque, setPorque] = useState('');
  const [restantes, setRestantes] = useState(null);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const fim = useRef(null);
  const iniciou = useRef(false);

  useEffect(() => { if (fim.current) fim.current.scrollIntoView({ behavior: 'smooth' }); }, [mensagens, pergunta]);

  // A primeira fala é o que o usuário já escreveu no campo — a conversa começa
  // dela, não de "olá, como posso ajudar".
  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    avancar([{ papel: 'pessoa', texto: primeiraFala }]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function avancar(historico) {
    setBusy(true); setErro('');
    try {
      const r = await ai.briefing(historico, { empresa, segmento });
      setMensagens(historico);
      if (r.pronto) { onPronto(r.resumo, historico); return; }
      setPergunta(r.pergunta);
      setSugestoes(r.sugestoes || []);
      setPorque(r.porque || '');
      setRestantes(r.restantes);
      setMensagens(historico.concat({ papel: 'ia', texto: r.pergunta }));
    } catch (e) {
      setErro(e.message || 'A conversa falhou. Você pode gerar assim mesmo.');
    } finally { setBusy(false); }
  }

  function responder(resposta) {
    const t = String(resposta || '').trim();
    if (!t || busy) return;
    setTexto('');
    setPergunta(null);
    avancar(mensagens.concat({ papel: 'pessoa', texto: t }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
        {mensagens.map((m, i) => (
          <div key={i} className={m.papel === 'ia' ? 'flex gap-2' : 'flex justify-end'}>
            {m.papel === 'ia' ? (
              <>
                <Sparkles size={14} className="mt-1 shrink-0 text-accent" />
                <div className="max-w-[85%] rounded-lg rounded-tl-sm bg-surface-2 px-3 py-2 text-sm text-ink">{m.texto}</div>
              </>
            ) : (
              <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-accent px-3 py-2 text-sm text-white">{m.texto}</div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-ink-3"><Spinner size={13} /> pensando na próxima pergunta…</div>
        )}
        <div ref={fim} />
      </div>

      {porque && pergunta && (
        <div className="text-2xs leading-snug text-ink-3">{porque}</div>
      )}

      {erro && <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">{erro}</div>}

      {/* Atalhos de resposta: quem não quer digitar clica. */}
      {sugestoes.length > 0 && !busy && (
        <div className="flex flex-wrap gap-1.5">
          {sugestoes.map((s) => (
            <button key={s} type="button" onClick={() => responder(s)}
              className="rounded-full border border-line px-2.5 py-1 text-2xs text-ink-2 transition hover:border-accent hover:text-accent">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          rows={2} value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(texto); } }}
          placeholder={busy ? 'aguarde…' : 'Responda aqui — Enter envia'}
          disabled={busy}
          className="flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent disabled:opacity-60"
        />
        <Button variant="primary" icon={Send} disabled={busy || !texto.trim()} onClick={() => responder(texto)}>Responder</Button>
      </div>

      {/*
        Pular está sempre visível de propósito. A conversa melhora a campanha,
        mas obrigar alguém a conversar para conseguir gerar transformaria um
        facilitador em pedágio.
      */}
      <div className="flex items-center gap-2 text-2xs text-ink-3">
        <button type="button" onClick={onPular} className="flex items-center gap-1 hover:text-ink-2">
          <SkipForward size={12} /> Pular e gerar com o que já falei
        </button>
        {restantes != null && restantes > 0 && <span className="ml-auto">no máximo mais {restantes} pergunta(s)</span>}
        {restantes === 0 && <span className="ml-auto flex items-center gap-1"><Check size={12} /> última</span>}
      </div>
    </div>
  );
}
