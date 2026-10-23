import React, { useState } from 'react';
import { Check, MonitorPlay, Share2, Clock, ImageOff, Plus, FolderOpen, Pencil, Send, Undo2, Sparkles, MessageSquare } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { PecaHtml } from '../content/PecaHtml.jsx';
import { DesignThumb } from '../content/DesignThumb.jsx';
import { RedesSociais } from '../content/RedesSociais.jsx';
import { EditarPeca } from '../content/EditarPeca.jsx';
import { criar } from '../../api.js';
import { aviso } from '../../lib/avisos.js';
import E from '../../lib/escopo.js';
import { cn } from '../../lib/cn.js';

/*
 * O RESULTADO do Criar (EXECUTOR §2b, itens 24 a 26): a campanha já salva,
 * agrupada como o cliente pediu — por TV e por zona, as redes e os horários.
 * Cada zona mostra as peças que vão girar nela; o cabeçalho e o rodapé, no
 * tamanho de faixa, com o letreiro e a contagem de verdade.
 *
 * Ajustar depois (item 26): cada peça tem um número — o mesmo que a IA usa
 * em "troca a foto da peça 2" — e um Editar à mão. A caixa de ajuste refaz só
 * o que o pedido aponta, e "Desfazer" volta o último passo.
 */

const FAIXA = { manha: 'Manhã', almoco: 'Almoço', tarde: 'Tarde', saida: 'Fim do dia', dia: 'O dia todo' };
const quando = (h) => (h ? (h.faixa ? FAIXA[h.faixa] : h.inicio + '–' + h.fim) : '');

// A mesma ordem de server/ajuste.js (numerar): por TV, cabeçalho, principal, lateral, rodapé.
function numerar(r) {
  const n = {};
  let i = 0;
  ((r && r.telas) || []).forEach((t) => {
    for (const lista of [t.zonas.cabecalho.pecas, t.zonas.principal, t.zonas.lateral, t.zonas.rodape.pecas]) {
      (lista || []).forEach((p) => { n[p.vaga] = ++i; });
    }
  });
  return n;
}

const Numero = ({ n }) => (
  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ink/80 px-1 text-2xs font-semibold text-canvas">{n}</span>
);

function Zona({ titulo, pecas, faixa, mensagens, contagem, querFoto, numeros, onEditar }) {
  if (!pecas.length && !(mensagens && mensagens.length)) return null;
  const legenda = (p) => (
    <div className="flex items-center gap-1 text-2xs text-ink-3">
      <Numero n={numeros[p.vaga]} />
      {p.horario && <><Clock size={10} /> {quando(p.horario)}</>}
      {querFoto && !p.comFoto && (p.zona === 'principal' || p.zona === 'lateral') && <span className="flex items-center gap-0.5"><ImageOff size={10} /> sem foto</span>}
      {onEditar && (
        <button type="button" onClick={() => onEditar(p)} className="ml-auto flex items-center gap-0.5 rounded px-1 py-0.5 text-ink-2 hover:bg-surface-2 hover:text-ink">
          <Pencil size={10} /> Editar
        </button>
      )}
    </div>
  );
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-ink-2">{titulo}{pecas.length > 1 ? ' · ' + pecas.length + ' girando' : ''}</div>
      {faixa ? (
        <div className="space-y-1.5">
          {pecas.map((p) => (
            <div key={p.vaga} className="space-y-1">
              <PecaHtml item={p.item} formato={faixa} mensagens={mensagens} contagem={contagem} />
              {legenda(p)}
            </div>
          ))}
          {!pecas.length && mensagens.length > 0 && (
            <div className="truncate rounded-md bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-2">Letreiro: {mensagens.join(' · ')}</div>
          )}
        </div>
      ) : (
        <div className={cn('grid gap-2', titulo === 'Lateral' ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2')}>
          {pecas.map((p) => (
            <div key={p.vaga} className="space-y-1">
              <DesignThumb item={p.item} />
              {legenda(p)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A caixa de ajuste: o chat continua depois de gerar.
function Ajustar({ campanha, onMudou }) {
  const [texto, setTexto] = useState('');
  const [etapa, setEtapa] = useState(null);
  const [resposta, setResposta] = useState('');
  const [erro, setErro] = useState('');
  const temAnterior = !!(campanha.resultado && campanha.resultado.anterior);

  async function enviar() {
    const t = texto.trim();
    if (!t || etapa) return;
    setErro(''); setResposta(''); setEtapa({ etapa: 'entendendo o ajuste' });
    try {
      const r = await criar.ajustar(campanha.id, t, setEtapa);
      setResposta(r.resposta || '');
      if (r.mudancas && r.mudancas.length) { onMudou(r.campanha); setTexto(''); }
    } catch (e) { setErro(e.message || 'Não deu para ajustar agora.'); }
    finally { setEtapa(null); }
  }

  async function desfazer() {
    setErro('');
    try { const r = await criar.desfazer(campanha.id); onMudou(r.campanha); setResposta('Voltei ao que era antes do último ajuste.'); }
    catch (e) { setErro(e.message || 'Não deu para desfazer.'); }
  }

  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><MessageSquare size={15} className="text-accent" /> Ajustar</h3>
      <p className="text-xs text-ink-3">Diga o que mudar: "troca a foto da peça 2", "mais uma peça na lateral", "tira o Facebook". Só o que você pedir é refeito.</p>
      <div className="flex items-end gap-2">
        <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="O que mudar"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="O que você quer mudar?"
          className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
        <Button variant="primary" icon={Send} disabled={!texto.trim() || !!etapa} onClick={enviar} aria-label="Ajustar">
          <span className="hidden sm:inline">Ajustar</span>
        </Button>
      </div>
      {etapa && <div className="flex items-center gap-2 text-xs text-ink-3"><Spinner size={13} /> {etapa.etapa || 'ajustando'}{etapa.detalhe ? ' · ' + etapa.detalhe : ''}</div>}
      {resposta && !etapa && <div className="flex gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink"><MessageSquare size={14} className="mt-0.5 shrink-0 text-ink-3" /> {resposta}</div>}
      {erro && <p className="text-xs text-danger" role="alert">{erro}</p>}
      {temAnterior && !etapa && (
        <button type="button" onClick={desfazer} className="flex items-center gap-1 text-xs text-ink-2 hover:text-ink"><Undo2 size={12} /> Desfazer o último ajuste</button>
      )}
      {campanha.estado === 'no_ar' && temAnterior && (
        <p className="text-2xs text-ink-3">A campanha mudou. Use "Mandar de novo", lá em cima, para as TVs receberem a versão nova.</p>
      )}
    </section>
  );
}

export function ResultadoCampanha({ campanha, telas = [], acoes, onNova, onIr, onMudou }) {
  const [redesDe, setRedesDe] = useState(null);
  const [editando, setEditando] = useState(null);
  const r = (campanha && campanha.resultado) || {};
  // "sem foto" só avisa quando o cliente quis foto: quem escolheu sem foto já sabe.
  const querFoto = !!(campanha && campanha.escopo && campanha.escopo.imagens !== 'nenhuma');
  const numeros = numerar(r);
  const nomeDaTela = (t, i) => t.nome || (t.alvo && t.alvo.tipo === 'tela' ? ((telas.find((d) => d.id === t.alvo.id) || {}).name || 'Tela ' + (i + 1)) : (r.telas.length > 1 ? 'Tela ' + (i + 1) : 'Todas as TVs'));
  const todas = (r.telas || []).flatMap((t) => [...t.zonas.principal, ...t.zonas.lateral]);
  const daRede = (r.social && todas.find((p) => p.vaga === r.social.peca)) || todas[0]
    || ((r.biblioteca || [])[0] && { item: r.biblioteca[0].item, label: r.biblioteca[0].label });
  const editar = onMudou ? setEditando : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-ok/40 bg-ok/5 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok"><Check size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{r.nome || campanha.nome} está pronta e salva.</div>
          <div className="text-xs text-ink-2">
            {r.contagem ? r.contagem.pecas + (r.contagem.pecas === 1 ? ' peça' : ' peças') : ''}
            {r.contagem && r.contagem.fotosGeradas ? ' · ' + r.contagem.fotosGeradas + (r.contagem.fotosGeradas === 1 ? ' foto gerada' : ' fotos geradas') : ''}
            {' · salva em Campanhas'}
          </div>
        </div>
      </div>

      {acoes}

      {(r.telas || []).map((t, i) => (
        <section key={i} className="space-y-3 rounded-lg border border-line bg-surface p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><MonitorPlay size={15} className="text-accent" /> {nomeDaTela(t, i)}</h3>
          <Zona titulo="Cabeçalho" pecas={t.zonas.cabecalho.pecas} faixa="cabecalho" mensagens={t.zonas.cabecalho.mensagens} numeros={numeros} onEditar={editar} />
          <Zona titulo="Principal" pecas={t.zonas.principal} querFoto={querFoto} numeros={numeros} onEditar={editar} />
          <Zona titulo="Lateral" pecas={t.zonas.lateral} querFoto={querFoto} numeros={numeros} onEditar={editar} />
          <Zona titulo="Rodapé" pecas={t.zonas.rodape.pecas} faixa="rodape" mensagens={t.zonas.rodape.mensagens} contagem={t.zonas.rodape.contagem} numeros={numeros} onEditar={editar} />
        </section>
      ))}

      {onMudou && <Ajustar campanha={campanha} onMudou={onMudou} />}

      {r.social && (
        <section className="space-y-2 rounded-lg border border-line bg-surface p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Share2 size={15} className="text-accent" /> Redes</h3>
          <p className="text-xs text-ink-2">{r.social.canais.map((c) => E.NOME_REDE[c]).join(', ')}: a imagem é a peça principal no tamanho de cada rede, com o texto pronto.</p>
          {daRede && (
            <Button variant="primary" icon={Share2} onClick={() => setRedesDe(daRede)}>Postar nas redes</Button>
          )}
        </section>
      )}

      {(r.horarios || []).length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-3">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink"><Clock size={15} className="text-accent" /> Programação</h3>
          <ul className="space-y-0.5 text-xs text-ink-2">
            {r.horarios.map((h, i) => <li key={i}>{quando(h)}{h.foco ? ': ' + h.foco : ''}</li>)}
            {r.periodo && r.periodo.fim && <li className="text-ink-3">Sai do ar sozinha depois de {r.periodo.fim.split('-').reverse().join('/')}.</li>}
          </ul>
        </section>
      )}

      {(r.semFoto || []).length > 0 && (
        <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-ink-2">
          {r.semFoto.length === 1 ? 'Uma peça saiu' : r.semFoto.length + ' peças saíram'} sem foto: {r.semFoto[0].porque}.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {onNova && <Button icon={Plus} onClick={onNova}>Criar outra</Button>}
        {onIr && <Button variant="ghost" icon={FolderOpen} onClick={() => onIr('campanhas')}>Ver todas as campanhas</Button>}
      </div>

      {redesDe && <RedesSociais item={redesDe.item} label={redesDe.label} onFechar={() => setRedesDe(null)} />}
      {editando && (
        <EditarPeca item={editando.item} label={editando.label} onFechar={() => setEditando(null)}
          onSalvar={async (item) => {
            const k = await criar.editarPeca(campanha.id, editando.vaga, item);
            setEditando(null); onMudou(k.campanha); aviso.ok('Peça ' + numeros[editando.vaga] + ' atualizada.');
          }} />
      )}
    </div>
  );
}
