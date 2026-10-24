import React, { useState } from 'react';
import { Check, MonitorPlay, Share2, Clock, ImageOff, Plus, Pencil, Sparkles, X } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { PecaHtml } from '../content/PecaHtml.jsx';
import { DesignThumb } from '../content/DesignThumb.jsx';
import { RedesSociais } from '../content/RedesSociais.jsx';
import { EditarPeca } from '../content/EditarPeca.jsx';
import { EditarComIA } from './EditarComIA.jsx';
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
 * em "troca a foto da peça 2" — e um Editar à mão. Desde o D50, o ajuste é
 * uma CONVERSA ao lado das peças (EditarComIA): pergunta quando não entende,
 * muda só o que foi pedido, lembra o que já foi dito, e "Desfazer" volta o
 * último passo.
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

/*
 * O letreiro editável (D12): as frases do rodapé e as chamadas do cabeçalho,
 * à mão. Antes só se lia "Letreiro: a · b" — trocar uma palavra pedia uma
 * conversa nova com a IA.
 */
function Letreiro({ rotulo, mensagens, onSalvar }) {
  const [lista, setLista] = useState(null);   // null = só lendo
  const [salvando, setSalvando] = useState(false);
  if (lista === null) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-2">
        <span className="min-w-0 flex-1 truncate">{rotulo}: {mensagens.length ? mensagens.join(' · ') : 'nenhuma frase ainda'}</span>
        {onSalvar && (
          <button type="button" onClick={() => setLista(mensagens.length ? mensagens.slice() : [''])}
            className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-ink-2 hover:bg-surface hover:text-ink">
            <Pencil size={10} /> Editar
          </button>
        )}
      </div>
    );
  }
  const mudar = (i, v) => setLista((l) => l.map((x, j) => (j === i ? v : x)));
  async function salvar() {
    setSalvando(true);
    try { await onSalvar(lista.map((x) => x.trim()).filter(Boolean)); setLista(null); }
    finally { setSalvando(false); }
  }
  return (
    <div className="space-y-1.5 rounded-md border border-line p-2">
      <div className="text-2xs font-semibold text-ink-2">{rotulo} <span className="font-normal text-ink-3">· como o público vai ler, até 80 letras cada</span></div>
      {lista.map((m, i) => (
        <div key={i} className="flex items-center gap-1">
          <input value={m} maxLength={80} onChange={(e) => mudar(i, e.target.value)} aria-label={rotulo + ' ' + (i + 1)}
            placeholder="Ex.: Aberto de segunda a sábado, das 8h às 18h"
            className="h-8 min-w-0 flex-1 rounded border border-line bg-surface px-2 text-xs text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none" />
          <button type="button" aria-label="Tirar esta frase" onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
            className="rounded p-1 text-ink-3 hover:text-danger"><X size={13} /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {lista.length < 8 && (
          <button type="button" onClick={() => setLista((l) => l.concat(''))} className="flex items-center gap-1 text-2xs font-medium text-accent hover:underline">
            <Plus size={11} /> Outra frase
          </button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" disabled={salvando} onClick={() => setLista(null)}>Cancelar</Button>
        <Button size="sm" variant="primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
      </div>
    </div>
  );
}

function Zona({ titulo, pecas, faixa, mensagens, contagem, querFoto, numeros, onEditar, onLetreiro }) {
  if (!pecas.length && !(mensagens && mensagens.length) && !onLetreiro) return null;
  if (faixa && !pecas.length && !(mensagens && mensagens.length)) return null;
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
          <Letreiro rotulo={faixa === 'rodape' ? 'Frases do letreiro' : 'Chamadas'} mensagens={mensagens || []} onSalvar={onLetreiro} />
          {/* A mesma regra da TV: com frase longa, a peça mostra a rolagem até o fim. */}
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
export function ResultadoCampanha({ campanha, telas = [], acoes, onNova, onIr, onMudou, pedidoInicial }) {
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
  // Salva o letreiro de uma TV (D12). No ar, a TV só muda ao pôr pra rodar de novo.
  const letreiroDe = (ti, zona) => (onMudou ? async (mensagens) => {
    try {
      const r = await criar.editarLetreiro(campanha.id, ti, zona, mensagens);
      onMudou(r.campanha);
      aviso.ok(campanha.estado === 'no_ar' ? 'Salvo. Para valer na TV, ponha pra rodar de novo.' : 'Letreiro salvo.');
    } catch (e) { aviso.erro('letreiro', 'O letreiro não foi salvo: ' + (e.message || 'falha de conexão') + '.'); throw e; }
  } : null);

  return (
    <div className={cn(onMudou && 'lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-4')}>
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-ok/40 bg-ok/5 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok"><Check size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{r.nome || campanha.nome} está pronta e salva.</div>
          <div className="text-xs text-ink-2">
            {r.contagem ? r.contagem.pecas + (r.contagem.pecas === 1 ? ' peça' : ' peças') : ''}
            {r.contagem && r.contagem.fotosGeradas ? ' · ' + r.contagem.fotosGeradas + (r.contagem.fotosGeradas === 1 ? ' foto gerada' : ' fotos geradas') : ''}
            {' · salva em Criados'}
          </div>
        </div>
        {onMudou && (
          <a href="#editar-com-ia" className="flex w-full items-center justify-center gap-1 rounded-md border border-accent/40 px-2.5 py-1.5 text-xs font-medium text-accent sm:w-auto sm:self-center lg:hidden">
            <Sparkles size={13} /> Editar com a IA
          </a>
        )}
      </div>

      {acoes}

      {(r.telas || []).map((t, i) => (
        <section key={i} className="space-y-3 rounded-lg border border-line bg-surface p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><MonitorPlay size={15} className="text-accent" /> {nomeDaTela(t, i)}</h3>
          <Zona titulo="Cabeçalho" pecas={t.zonas.cabecalho.pecas} faixa="cabecalho" mensagens={t.zonas.cabecalho.mensagens} numeros={numeros} onEditar={editar} onLetreiro={letreiroDe(i, 'cabecalho')} />
          <Zona titulo="Principal" pecas={t.zonas.principal} querFoto={querFoto} numeros={numeros} onEditar={editar} />
          <Zona titulo="Lateral" pecas={t.zonas.lateral} querFoto={querFoto} numeros={numeros} onEditar={editar} />
          <Zona titulo="Rodapé" pecas={t.zonas.rodape.pecas} faixa="rodape" mensagens={t.zonas.rodape.mensagens} contagem={t.zonas.rodape.contagem} numeros={numeros} onEditar={editar} onLetreiro={letreiroDe(i, 'rodape')} />
        </section>
      ))}


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
        {/* Só existe em Criados (D47), que já tem o "voltar" no topo. */}
        {onNova && <Button icon={Plus} onClick={onNova}>Criar outra</Button>}
      </div>

    </div>
      {onMudou && (
        <aside className="mt-3 lg:sticky lg:top-4 lg:mt-0">
          <EditarComIA campanha={campanha} onMudou={onMudou} textoInicial={pedidoInicial} />
        </aside>
      )}
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
