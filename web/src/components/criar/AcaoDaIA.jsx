import React, { useEffect, useState } from 'react';
import { HelpCircle, Megaphone, Palette, Pencil, Check, Tv } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Checkbox } from '../ui/Field.jsx';
import { AvisoRapido } from '../tela/AvisoRapido.jsx';
import { MudarAparencia } from '../tela/MudarAparencia.jsx';
import { aplicarQuiz, zonaDoQuiz } from '../../lib/quizNaTv.js';
import { gravarEmLote, avisarComDesfazer } from '../../lib/rodar.js';
import { aviso } from '../../lib/avisos.js';
import { devices } from '../../api.js';
import { cn } from '../../lib/cn.js';

/*
 * O QUE O ASSISTENTE DO CRIAR FEZ (24/10).
 *
 * O maestro escolhe a ferramenta e o especialista faz; a mensagem da IA traz
 * o resultado (`acao`). Este cartão fica embaixo dela, com o próximo passo:
 *   - quiz: as perguntas e as respostas certas, e "Pôr na TV" (conferir é obrigatório);
 *   - aviso: a prévia e o envio do Aviso rápido;
 *   - tela: a TV agora e como fica (MudarAparencia);
 *   - editar: a campanha em Criados, com o pedido no Editar com a IA.
 * Nada vai para a TV sem o "ok" de quem pediu, e tudo tem Desfazer.
 */
export function AcaoDaIA({ acao, id, telas = [], onIr, ativa }) {
  const [aberto, setAberto] = useState(false);
  if (!acao) return null;

  if (acao.tipo === 'quiz') {
    const q = acao.quiz || {};
    const perguntas = q.perguntas || [];
    return (
      <Cartao icone={HelpCircle} titulo={(q.titulo || 'Quiz') + ' · ' + perguntas.length + (perguntas.length === 1 ? ' pergunta' : ' perguntas')}
        detalhe={(acao.zona === 'lateral' ? 'Na lateral' : 'Na área principal') + (acao.tv ? ' da ' + acao.tv.nome : '')}>
        <PerguntasDoQuiz perguntas={perguntas} />
        {ativa && <Button size="sm" variant="primary" icon={Tv} className="mt-2" disabled={!perguntas.length} onClick={() => setAberto(true)}>Pôr na TV</Button>}
        {aberto && <PorQuizNaTv acao={acao} id={id} telas={telas} onFechar={() => setAberto(false)} />}
      </Cartao>
    );
  }

  if (acao.tipo === 'aviso') {
    const a = acao.aviso || {};
    return (
      <Cartao icone={Megaphone} titulo={'Aviso: ' + (a.titulo || '')} detalhe={a.ate ? 'Até ' + a.ate.split('-').reverse().join('/') : ''}>
        {ativa && <Button size="sm" variant="primary" className="mt-1" onClick={() => setAberto(true)}>Ver a prévia e pôr nas TVs</Button>}
        {aberto && <AvisoRapido avisoInicial={a} onFechar={() => setAberto(false)} />}
      </Cartao>
    );
  }

  if (acao.tipo === 'tela' && acao.tv) {
    return (
      <Cartao icone={Palette} titulo={'Mudar a ' + (acao.tv.nome || 'TV')} detalhe={(acao.mudancas || []).length + ((acao.mudancas || []).length === 1 ? ' mudança' : ' mudanças')}>
        {ativa && <Button size="sm" variant="primary" className="mt-1" onClick={() => setAberto(true)}>Ver como fica e aplicar</Button>}
        {aberto && <MudarAparencia tv={acao.tv} mudancas={acao.mudancas || []} notas={acao.notas || []} onFechar={() => setAberto(false)} />}
      </Cartao>
    );
  }

  if (acao.tipo === 'editar' && acao.campanha) {
    return (
      <Cartao icone={Pencil} titulo={'Editar “' + (acao.campanha.nome || 'campanha') + '”'} detalhe={acao.pedido ? '“' + acao.pedido + '”' : ''}>
        {ativa && onIr && <Button size="sm" variant="primary" className="mt-1" onClick={() => onIr('campanhas', { campanha: acao.campanha.id, pedido: acao.pedido || '' })}>Abrir a campanha</Button>}
      </Cartao>
    );
  }
  return null;
}

// As perguntas, as alternativas com a certa marcada e a explicação: o que a pessoa confere.
function PerguntasDoQuiz({ perguntas }) {
  return (
    <ol className="space-y-2">
      {perguntas.map((p, i) => (
        <li key={i} className="text-xs">
          <p className="font-medium text-ink">{i + 1}. {p.pergunta}</p>
          <ul className="mt-0.5 space-y-0.5 pl-3">
            {(p.alternativas || []).map((a, j) => (
              <li key={j} className={cn('flex items-start gap-1', j === p.certa ? 'font-medium text-accent' : 'text-ink-2')}>
                {j === p.certa ? <Check size={12} className="mt-0.5 shrink-0" /> : <span className="w-3 shrink-0" />}{a}
              </li>
            ))}
          </ul>
          {p.explicacao && <p className="mt-0.5 pl-3 text-ink-3">{p.explicacao}</p>}
        </li>
      ))}
    </ol>
  );
}

function Cartao({ icone: Icone, titulo, detalhe, children }) {
  return (
    <div className="ml-6 max-w-[85%] rounded-lg border border-line bg-surface px-3 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
        <Icone size={14} className="shrink-0 text-accent" />{titulo}
      </div>
      {detalhe && <p className="-mt-1 mb-1.5 text-xs text-ink-3">{detalhe}</p>}
      {children}
    </div>
  );
}

/*
 * Pôr o quiz: as TVs (a dita no pedido já marcada) e o "conferi" — a pergunta
 * da IA pode vir errada, e a TV mostra só o que alguém conferiu (D21).
 * Do Pedir à IA da Programação (sem o cartão antes), as perguntas vêm aqui
 * dentro e as TVs são lidas aqui.
 */
export function PorQuizNaTv({ acao, id, telas: dadas, onFechar }) {
  const [lidas, setLidas] = useState(null);
  const telas = dadas || lidas || [];
  const marcarDe = (lista) => (acao.tv ? [acao.tv.id] : lista.length === 1 ? [lista[0].id] : []);
  const [ids, setIds] = useState(() => marcarDe(dadas || []));
  useEffect(() => {
    if (dadas) return;
    devices.list().then((r) => { const l = (r && r.devices) || []; setLidas(l); setIds(marcarDe(l)); }).catch(() => setLidas([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [conferi, setConferi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const alternar = (tid) => setIds((xs) => (xs.includes(tid) ? xs.filter((x) => x !== tid) : xs.concat(tid)));

  async function por() {
    const alvos = telas.filter((t) => ids.includes(t.id));
    const caiu = new Set();
    setEnviando(true);
    try {
      const r = await gravarEmLote(alvos, (cfg, tv) => {
        if (zonaDoQuiz(cfg, acao.zona).caiu) caiu.add(tv.name || 'TV'); else caiu.delete(tv.name || 'TV');
        return aplicarQuiz(cfg, acao.quiz, acao.zona, id);
      }, 'Quiz: ' + ((acao.quiz && acao.quiz.titulo) || 'quiz'));
      const nomes = alvos.map((t) => '“' + (t.name || 'TV') + '”').join(', ');
      avisarComDesfazer('O quiz foi para ' + nomes + '.' + (caiu.size ? ' ' + [...caiu].join(', ') + ' não tem lateral: ficou na área principal.' : ''), r.lote);
      onFechar();
    } catch (e) { aviso.erro('quiz', e.message || 'Não deu para pôr o quiz na TV.'); }
    finally { setEnviando(false); }
  }

  return (
    <Dialog open onClose={onFechar} title="Pôr o quiz na TV" className={dadas ? undefined : 'max-w-2xl'}
      description={(acao.zona === 'lateral' ? 'Na lateral' : 'Na área principal') + '. Entra na lista da zona, sem tirar o que já está lá — e dá para desfazer.'}
      footer={<>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" icon={Tv} disabled={!ids.length || !conferi || enviando} onClick={por}>{enviando ? 'Enviando…' : 'Pôr na TV'}</Button>
      </>}>
      {!dadas && (
        <div className="mb-4 max-h-72 overflow-y-auto rounded-md border border-line px-3 py-2">
          <p className="mb-1.5 text-sm font-medium text-ink">{(acao.quiz && acao.quiz.titulo) || 'Quiz'}</p>
          <PerguntasDoQuiz perguntas={(acao.quiz && acao.quiz.perguntas) || []} />
        </div>
      )}
      {!dadas && lidas === null ? null : !telas.length ? <p className="text-sm text-ink-2">Você ainda não tem TV ligada. Ligue uma em Telas.</p> : (
        <div className="space-y-1.5">
          {telas.map((t) => <Checkbox key={t.id} label={t.name || 'TV'} checked={ids.includes(t.id)} onChange={() => alternar(t.id)} />)}
        </div>
      )}
      <div className="mt-4 rounded-md bg-surface-2 px-3 py-2">
        <Checkbox label="Conferi as perguntas e as respostas certas" checked={conferi} onChange={(e) => setConferi(e.target.checked)} />
      </div>
    </Dialog>
  );
}
