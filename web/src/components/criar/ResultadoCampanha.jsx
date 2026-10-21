import React, { useState } from 'react';
import { Check, MonitorPlay, Share2, Clock, ImageOff, MessageSquare, Plus, FolderOpen } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { PecaHtml } from '../content/PecaHtml.jsx';
import { DesignThumb } from '../content/DesignThumb.jsx';
import { RedesSociais } from '../content/RedesSociais.jsx';
import E from '../../lib/escopo.js';
import { cn } from '../../lib/cn.js';

/*
 * O RESULTADO do Criar (EXECUTOR §2b, itens 24 e 25): a campanha já salva,
 * agrupada como o cliente pediu — por TV e por zona, as redes e os horários.
 * Cada zona mostra as peças que vão girar nela; o cabeçalho e o rodapé, no
 * tamanho de faixa, com o letreiro e a contagem de verdade.
 */

const FAIXA = { manha: 'Manhã', almoco: 'Almoço', tarde: 'Tarde', saida: 'Fim do dia', dia: 'O dia todo' };
const quando = (h) => (h ? (h.faixa ? FAIXA[h.faixa] : h.inicio + '–' + h.fim) : '');

function Zona({ titulo, pecas, faixa, mensagens, contagem, querFoto }) {
  if (!pecas.length && !(mensagens && mensagens.length)) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-ink-2">{titulo}{pecas.length > 1 ? ' · ' + pecas.length + ' girando' : ''}</div>
      {faixa ? (
        <div className="space-y-1.5">
          {pecas.map((p) => (
            <PecaHtml key={p.vaga} item={p.item} formato={faixa} mensagens={mensagens} contagem={contagem} />
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
              <div className="flex items-center gap-1 text-2xs text-ink-3">
                {p.horario && <><Clock size={10} /> {quando(p.horario)}</>}
                {querFoto && !p.comFoto && (p.zona === 'principal' || p.zona === 'lateral') && <span className="ml-auto flex items-center gap-0.5"><ImageOff size={10} /> sem foto</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResultadoCampanha({ campanha, telas = [], acoes, onContinuar, onNova, onIr }) {
  const [redesDe, setRedesDe] = useState(null);
  const r = (campanha && campanha.resultado) || {};
  // "sem foto" só avisa quando o cliente quis foto: quem escolheu sem foto já sabe.
  const querFoto = !!(campanha && campanha.escopo && campanha.escopo.imagens !== 'nenhuma');
  const nomeDaTela = (t, i) => t.nome || (t.alvo && t.alvo.tipo === 'tela' ? ((telas.find((d) => d.id === t.alvo.id) || {}).name || 'Tela ' + (i + 1)) : (r.telas.length > 1 ? 'Tela ' + (i + 1) : 'Todas as TVs'));
  const todas = (r.telas || []).flatMap((t) => [...t.zonas.principal, ...t.zonas.lateral]);
  const daRede = (r.social && todas.find((p) => p.vaga === r.social.peca)) || todas[0]
    || ((r.biblioteca || [])[0] && { item: r.biblioteca[0].item, label: r.biblioteca[0].label });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-ok/40 bg-ok/5 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok"><Check size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{r.nome || campanha.nome} está pronta e salva.</div>
          <div className="text-xs text-ink-2">
            {r.contagem ? r.contagem.pecas + (r.contagem.pecas === 1 ? ' peça' : ' peças') : ''}
            {r.contagem && r.contagem.fotosGeradas ? ' · ' + r.contagem.fotosGeradas + (r.contagem.fotosGeradas === 1 ? ' foto gerada' : ' fotos geradas') : ''}
            {' · também em Meus Designs'}
          </div>
        </div>
      </div>

      {acoes}

      {(r.telas || []).map((t, i) => (
        <section key={i} className="space-y-3 rounded-lg border border-line bg-surface p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink"><MonitorPlay size={15} className="text-accent" /> {nomeDaTela(t, i)}</h3>
          <Zona titulo="Cabeçalho" pecas={t.zonas.cabecalho.pecas} faixa="cabecalho" mensagens={t.zonas.cabecalho.mensagens} />
          <Zona titulo="Principal" pecas={t.zonas.principal} querFoto={querFoto} />
          <Zona titulo="Lateral" pecas={t.zonas.lateral} querFoto={querFoto} />
          <Zona titulo="Rodapé" pecas={t.zonas.rodape.pecas} faixa="rodape" mensagens={t.zonas.rodape.mensagens} contagem={t.zonas.rodape.contagem} />
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
        {onContinuar && <Button icon={MessageSquare} onClick={onContinuar}>Ajustar conversando</Button>}
        {onNova && <Button icon={Plus} onClick={onNova}>Criar outra</Button>}
        {onIr && <Button variant="ghost" icon={FolderOpen} onClick={() => onIr('designs')}>Ver em Meus Designs</Button>}
      </div>

      {redesDe && <RedesSociais item={redesDe.item} label={redesDe.label} onFechar={() => setRedesDe(null)} />}
    </div>
  );
}
