import React, { useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { AvisoRapido } from './AvisoRapido.jsx';
import { MudarAparencia } from './MudarAparencia.jsx';
import { PorQuizNaTv } from '../criar/AcaoDaIA.jsx';
import { MiniConversa, comPergunta } from './MiniConversa.jsx';
import { ai } from '../../api.js';
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
 *   - quiz: as perguntas para conferir e pôr na TV (Desfazer);
 *   - mudar uma campanha: Criados, com o pedido no Editar com a IA;
 *   - conteúdo novo: o Criar, com o pedido já escrito.
 * Nada muda nas TVs sem o "ok" de quem pediu. Desde 24/10 quem entende é o
 * maestro do assistente do Criar (server/assistente.js), com menos ferramentas.
 */
const EXEMPLOS = ['Aviso: piso molhado no corredor', 'Quiz de 3 perguntas sobre segurança', 'Tema claro na TV da recepção', 'Criar uma promoção de café'];

export function PedirIA({ onFechar, onIr, tv }) {
  const [texto, setTexto] = useState('');
  const [historico, setHistorico] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [avisoPronto, setAvisoPronto] = useState(null);
  const [tela, setTela] = useState(null);   // { tv, mudancas, notas }: o diálogo MudarAparencia confere e aplica
  const [quiz, setQuiz] = useState(null);   // a ação do quiz: o PorQuizNaTv mostra as perguntas e põe na TV

  async function pedir(t) {
    const frase = String(t == null ? texto : t).trim();
    if (!frase || ocupado) return;
    setOcupado(true);
    try {
      const r = await ai.pedir(frase, historico, tv && tv.id);
      if (r.pergunta) { setHistorico((h) => comPergunta(h, frase, r)); setTexto(''); return; }
      if (r.destino === 'aviso') { setAvisoPronto(r.aviso); return; }
      if (r.destino === 'criar') { onFechar(); if (onIr) onIr('criar', { texto: r.texto }); return; }
      if (r.destino === 'nenhuma-tv') { aviso.erro('pedir', 'Você ainda não tem TV ligada. Pareie uma em Telas.'); return; }
      if (r.destino === 'tela') setTela({ tv: r.tv, mudancas: r.mudancas, notas: r.notas || [] });
      if (r.destino === 'quiz') setQuiz(r.quiz);
      if (r.destino === 'editar') { onFechar(); if (onIr) onIr('campanhas', { campanha: r.campanha.id, pedido: r.pedido || '' }); }
    } catch (e) { aviso.erro('pedir', e.message || 'Não deu para entender agora.'); }
    finally { setOcupado(false); }
  }

  // O aviso já montado segue no Aviso rápido: a prévia, os ajustes e o envio com Desfazer.
  if (avisoPronto) return <AvisoRapido avisoInicial={avisoPronto} onFechar={onFechar} />;

  if (tela) return <MudarAparencia tv={tela.tv} mudancas={tela.mudancas} notas={tela.notas} onFechar={onFechar} onVoltar={() => setTela(null)} />;

  if (quiz) return <PorQuizNaTv acao={quiz} id={'pedir:' + Date.now()} onFechar={onFechar} />;

  return (
    <Dialog open onClose={onFechar} className="max-w-xl" title="Pedir à IA"
      description="O que você quer nas TVs? Um aviso, um quiz, mudar a aparência de uma TV ou algo novo. Se eu não entender, pergunto."
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
