import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, MessageSquare, Undo2, Check, CloudOff } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { criar } from '../../api.js';
import { BotaoAnexar, ReferenciasDoChat, imagensDoColar } from './ReferenciasDoChat.jsx';
import { prepararFoto } from '../../lib/subir.js';
import { cn } from '../../lib/cn.js';

/*
 * EDITAR COM A IA (EXECUTOR D50), em Criados, ao lado das peças.
 *
 * O dono: "se eu quiser editar, entro lá, edito na mão, ou abro um chat de
 * edição com contexto e memória para não regredir" — e "ela conversar até
 * entender o que tem que fazer". Era uma caixa de uma frase só ("Ajustar"):
 * entendia ou chutava. Agora é conversa:
 *   - a IA lê as peças com os números (os mesmos ao lado de cada uma) e os
 *     textos, e o que foi combinado quando a campanha foi criada;
 *   - pedido ambíguo vira pergunta, com respostas prontas;
 *   - só o que foi pedido muda — trocar um texto não refaz a peça;
 *   - a conversa fica guardada: abrir de novo mostra o que já foi pedido;
 *   - "Desfazer" volta o último passo.
 *   - imagens de referência (D45): anexar ou colar; "usa a foto que eu
 *     mandei na peça 2" põe a foto do cliente na peça, sem gastar criação.
 */
export function EditarComIA({ campanha, onMudou }) {
  const [mensagens, setMensagens] = useState(null);   // null = carregando
  const [texto, setTexto] = useState('');
  const [etapa, setEtapa] = useState(null);
  const [erro, setErro] = useState('');
  const [referencias, setReferencias] = useState([]);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const fim = useRef(null);
  const temAnterior = !!(campanha.resultado && campanha.resultado.anterior);

  useEffect(() => {
    let vivo = true;
    criar.edicao(campanha.id)
      .then((r) => { if (vivo) { setMensagens((r && r.conversa && r.conversa.mensagens) || []); setReferencias((r && r.conversa && r.conversa.referencias) || []); } })
      .catch(() => { if (vivo) setMensagens([]); });
    return () => { vivo = false; };
  }, [campanha.id]);

  useEffect(() => { if (fim.current && mensagens && mensagens.length) fim.current.scrollIntoView({ block: 'nearest' }); }, [mensagens, etapa]);

  async function enviar(t) {
    const frase = String(t == null ? texto : t).trim();
    if (!frase || etapa) return;
    setErro(''); setTexto('');
    setMensagens((m) => (m || []).concat({ papel: 'pessoa', texto: frase }));
    setEtapa({ etapa: 'entendendo o pedido' });
    try {
      const r = await criar.editarComIA(campanha.id, frase, setEtapa);
      setMensagens((r.conversa && r.conversa.mensagens) || []);
      if (r.mudancas && r.mudancas.length && r.campanha) onMudou(r.campanha);
    } catch (e) {
      setErro(e.message || 'Não deu para editar agora. Tente de novo.');
      setMensagens((m) => (m || []).slice(0, -1));
      setTexto(frase);
    } finally { setEtapa(null); }
  }

  // D45: a imagem que a pessoa manda (clipe ou colar) fica na conversa da edição.
  async function anexar(arquivos) {
    if (enviandoImagem) return;
    setEnviandoImagem(true); setErro('');
    try {
      for (const f of arquivos.slice(0, 10 - referencias.length)) {
        const envio = await prepararFoto(f).then((p) => { URL.revokeObjectURL(p.previa); return p.envio; }).catch(() => f);
        const r = await criar.referenciaDaEdicao(campanha.id, envio, 'estilo');
        setReferencias((r.conversa && r.conversa.referencias) || []);
      }
    } catch (e) { setErro('A imagem não foi: ' + (e.message || 'falha de conexão') + '.'); }
    finally { setEnviandoImagem(false); }
  }
  async function mudarReferencias(lista) {
    const antes = referencias;
    setReferencias(lista);
    try { const r = await criar.salvarReferenciasDaEdicao(campanha.id, lista); setReferencias((r.conversa && r.conversa.referencias) || []); }
    catch (e) { setReferencias(antes); setErro('Não deu para mudar a imagem: ' + (e.message || 'falha de conexão') + '.'); }
  }

  async function desfazer() {
    setErro('');
    try {
      const r = await criar.desfazer(campanha.id);
      onMudou(r.campanha);
      setMensagens((m) => (m || []).concat({ papel: 'ia', texto: 'Voltei ao que era antes do último passo.' }));
    } catch (e) { setErro(e.message || 'Não deu para desfazer.'); }
  }

  const ultimaIa = [...(mensagens || [])].reverse().find((m) => m.papel === 'ia');

  return (
    <section id="editar-com-ia" className="flex max-h-[80vh] flex-col rounded-lg border border-accent/30 bg-surface">
      <div className="border-b border-line px-3 py-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Sparkles size={15} className="text-accent" /> Editar com a IA</h3>
        <p className="mt-0.5 text-2xs text-ink-3">Diga o que mudar. Se eu não entender, pergunto. Só o que você pedir muda. Pode mandar ou colar uma imagem de referência. Para mexer à mão, toque em Editar na peça.</p>
      </div>

      <div className="min-h-[8rem] flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {mensagens === null ? <div className="flex justify-center py-6"><Spinner size={16} /></div>
          : !mensagens.length ? (
            <div className="space-y-2">
              <p className="text-xs text-ink-2">Exemplos:</p>
              {['Troca o preço da peça 2 para R$ 8,90', 'Troca a foto da peça 1', 'Mais uma peça na lateral', 'Tira o Facebook'].map((s) => (
                <button key={s} type="button" onClick={() => enviar(s)}
                  className="block w-full rounded-md border border-line px-2.5 py-1.5 text-left text-xs text-ink-2 transition hover:border-accent hover:text-ink">{s}</button>
              ))}
            </div>
          ) : mensagens.map((m, i) => (
            <div key={i} className={m.papel === 'ia' ? 'flex gap-2' : 'flex justify-end'}>
              {m.papel === 'ia' && (m.falha
                ? <CloudOff size={13} className="mt-1 shrink-0 text-warn" aria-hidden />
                : <MessageSquare size={13} className="mt-1 shrink-0 text-ink-3" aria-hidden />)}
              <div className={cn('max-w-[88%] rounded-lg px-2.5 py-1.5 text-xs',
                m.papel !== 'ia' ? 'rounded-tr-sm bg-accent text-accent-fg' : 'rounded-tl-sm bg-surface-2 text-ink')}>
                <div className="whitespace-pre-line">{m.texto}</div>
                {(m.planejado || []).length > 0 && (
                  <ul className="mt-1 space-y-0.5" aria-label="O que eu vou fazer">
                    {m.planejado.map((f) => <li key={f} className="text-2xs text-ink-2">→ {f}</li>)}
                  </ul>
                )}
                {(m.feito || []).length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {m.feito.map((f) => <li key={f} className="flex items-center gap-1 text-2xs text-ok"><Check size={11} /> {f}</li>)}
                  </ul>
                )}
              </div>
            </div>
          ))}
        {etapa && <div className="flex items-center gap-2 text-xs text-ink-3"><Spinner size={12} /> {etapa.etapa || 'pensando'}{etapa.detalhe ? ' · ' + etapa.detalhe : ''}</div>}
        {/* As respostas prontas da última fala da IA: um toque manda. */}
        {!etapa && ultimaIa && (ultimaIa.sugestoes || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-5">
            {ultimaIa.sugestoes.map((s) => (
              <button key={s} type="button" onClick={() => enviar(s)}
                className="rounded-full border border-line px-2.5 py-1 text-2xs text-ink-2 transition hover:border-accent hover:text-accent">{s}</button>
            ))}
          </div>
        )}
        <div ref={fim} />
      </div>

      <div className="space-y-1.5 border-t border-line p-2.5">
        {erro && <p className="text-xs text-danger" role="alert">{erro}</p>}
        <ReferenciasDoChat lista={referencias} onMudar={mudarReferencias} compacta />
        <div className="flex items-end gap-2">
          <BotaoAnexar onArquivos={anexar} enviando={enviandoImagem} />
          <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="O que mudar"
            onPaste={(e) => { const imgs = imagensDoColar(e); if (imgs.length) { e.preventDefault(); anexar(imgs); } }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            placeholder="O que você quer mudar?"
            className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
          <Button variant="primary" icon={Send} disabled={!texto.trim() || !!etapa} onClick={() => enviar()} aria-label="Mandar" />
        </div>
        {temAnterior && !etapa && (
          <button type="button" onClick={desfazer} className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink"><Undo2 size={12} /> Desfazer o último passo</button>
        )}
        {campanha.estado === 'no_ar' && temAnterior && (
          <p className="text-2xs text-ink-3">A campanha mudou. Use "Mandar de novo", lá em cima, para as TVs receberem a versão nova.</p>
        )}
      </div>
    </section>
  );
}
