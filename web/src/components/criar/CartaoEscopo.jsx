import React, { useState } from 'react';
import { Minus, Plus, ChevronDown, MonitorPlay, Share2, Clock, Image as ImageIcon, X, Trash2, SlidersHorizontal } from 'lucide-react';
import E from '../../lib/escopo.js';
import { cn } from '../../lib/cn.js';
import { sugerir, mesmaPaleta } from '../../lib/paletas.js';
import { EsbocoDaTela } from './EsbocoDaTela.jsx';

/*
 * Os cartões de cor da campanha (D13): as cores da Marca e duas ou três
 * sugestões em volta delas. Escolher aqui vale só para esta campanha
 * (escopo.cores) e não gasta nada; a Marca continua como está.
 */
function opcoesDeCor(marca) {
  const daMarca = (marca && marca.cores && marca.cores.length) ? marca.cores : null;
  const out = daMarca ? [{ id: 'marca', nome: 'Da marca', cores: daMarca, daMarca: true }] : [];
  for (const p of sugerir({ ramo: marca && marca.ramo, cores: daMarca || [] }).paletas) {
    if (out.length >= 4) break;
    if (out.some((o) => mesmaPaleta(o.cores, p.cores))) continue;
    out.push({ id: p.id, nome: p.nome, cores: p.cores });
  }
  return out;
}

/*
 * O CARTÃO "O QUE VOU CRIAR" (EXECUTOR §2b, item 24).
 *
 * O dono: "o cliente tem que saber o que ficará em cada zona" antes de
 * gerar. O cartão é o escopo à vista, e mexer nele é mexer no pedido: mais
 * ou menos peças por zona, que TV recebe, quais redes, as fotos. Cada toque
 * só muda o escopo, sem gastar token; a conversa recebe o cartão como está
 * na próxima mensagem. No celular ele recolhe num resumo de uma linha.
 *
 * NEM TUDO É CAMPANHA (D5): o cartão mostrava 22 botões antes de qualquer
 * conversa — quatro zonas, seis redes, quatro horários, quatro fotos. Agora
 * mostra só o que a conversa decidiu; "Ajustar tudo" abre o resto.
 */

// A zona entra no pedido? Peças, avisos do letreiro ou relógio/clima.
const decidida = (d) => d.pecas > 0 || (d.mensagens || []).length > 0 || (d.vivos || []).length > 0;
const FOTOS = [['minhas', 'Só as minhas'], ['mistura', 'As minhas e a IA'], ['gerar', 'A IA gera'], ['nenhuma', 'Sem foto']];

const FAIXAS = [
  { id: 'manha', nome: 'Manhã' }, { id: 'almoco', nome: 'Almoço' },
  { id: 'tarde', nome: 'Tarde' }, { id: 'saida', nome: 'Fim do dia' },
];
const VIVOS_DA_FAIXA = ['relogio', 'data', 'clima', 'logo'];

const Chip = ({ ativo, onClick, children, className }) => (
  <button type="button" aria-pressed={!!ativo} onClick={onClick}
    className={cn('rounded-full border px-2.5 py-1 text-xs transition',
      ativo ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-accent/50', className)}>
    {children}
  </button>
);

function Passo({ valor, max, onChange, rotulo }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={rotulo}>
      <button type="button" aria-label={'Menos: ' + rotulo} disabled={valor <= 0} onClick={() => onChange(valor - 1)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40"><Minus size={13} /></button>
      <span className="tnum w-5 text-center text-sm font-semibold text-ink">{valor}</span>
      <button type="button" aria-label={'Mais: ' + rotulo} disabled={valor >= max} onClick={() => onChange(valor + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-surface-2 disabled:opacity-40"><Plus size={13} /></button>
    </div>
  );
}

function nomeDaTela(t, i, total, telasDaConta) {
  if (t.nome) return t.nome;
  if (t.alvo.tipo === 'tela') return (telasDaConta.find((x) => x.id === t.alvo.id) || {}).name || 'Tela ' + (i + 1);
  return total > 1 ? 'Tela ' + (i + 1) : 'Todas as TVs';
}

export function linhaDoCusto(escopo) {
  const c = E.custo(escopo);
  if (!c.pecas) return 'nada ainda';
  return c.pecas + (c.pecas === 1 ? ' peça' : ' peças') + ' · '
    + (c.criacoes ? (c.ate ? 'até ' : '') + c.criacoes + (c.criacoes === 1 ? ' criação' : ' criações') : 'não gasta criação');
}

export function CartaoEscopo({ escopo, onChange, telas = [], recolhivel = false, marca = null }) {
  const [aberto, setAberto] = useState(!recolhivel);
  const [tudo, setTudo] = useState(false);
  const e = E.normalizar(escopo);
  const custo = E.custo(e);
  const redesVisiveis = tudo ? E.REDES : E.REDES.filter((r) => e.redes[r]);
  const faixasVisiveis = tudo ? FAIXAS : FAIXAS.filter((f) => e.horarios.some((h) => h.faixa === f.id));
  const mudar = (f) => { const novo = JSON.parse(JSON.stringify(e)); f(novo); onChange(E.normalizar(novo)); };
  const zona = (ti, z) => e.telas[ti].zonas[z];
  const cores = opcoesDeCor(marca);
  const coresAtuais = e.cores.length ? e.cores : ((marca && marca.cores) || []);
  // TV em pé desenha em pé: o layout dela vem da lista de TVs da conta.
  const emPe = (t) => t.alvo.tipo === 'tela' && /^portrait/.test(((telas.find((d) => d.id === t.alvo.id) || {}).layoutId) || '');

  return (
    <div className="rounded-lg border border-line bg-surface">
      <button type="button" onClick={() => recolhivel && setAberto((v) => !v)} aria-expanded={aberto}
        className={cn('flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left', recolhivel ? 'cursor-pointer' : 'cursor-default')}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">O que vou criar</span>
          <span className="block truncate text-xs text-ink-3">{linhaDoCusto(e)}</span>
        </span>
        {recolhivel && <ChevronDown size={16} className={cn('shrink-0 text-ink-3 transition', aberto && 'rotate-180')} />}
      </button>

      {aberto && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {/* A prévia (D13): como a TV vai ficar e com que cores, antes de gastar. */}
          {marca && e.telas.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-ink">Como vai ficar <span className="font-normal text-ink-3">· esboço, antes de gastar</span></div>
              <div className={cn('grid gap-2', e.telas.length > 1 ? 'grid-cols-2' : 'mx-auto max-w-xs grid-cols-1')}>
                {e.telas.slice(0, 2).map((t, ti) => (
                  <EsbocoDaTela key={ti} zonas={t.zonas} cores={coresAtuais} nome={marca.nome} logo={marca.logo} emPe={emPe(t)}
                    rotulo={e.telas.length > 1 ? nomeDaTela(t, ti, e.telas.length, telas) : ''} />
                ))}
              </div>
              {cores.length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cores desta campanha">
                  {cores.map((o) => {
                    const ativo = o.daMarca ? !e.cores.length : mesmaPaleta(e.cores, o.cores);
                    return (
                      <button key={o.id} type="button" role="radio" aria-checked={ativo}
                        onClick={() => mudar((x) => { x.cores = o.daMarca ? [] : o.cores.slice(0, 3); })}
                        className={cn('flex items-center gap-1.5 rounded-full border px-2 py-1 text-2xs transition',
                          ativo ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-accent/50')}>
                        <span className="flex -space-x-1">
                          {o.cores.slice(0, 3).map((c, i) => <span key={i} className="h-3 w-3 rounded-full border border-surface ring-1 ring-line" style={{ background: c }} />)}
                        </span>
                        {o.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Os recortes: o tamanho do pedido em um toque. */}
          {tudo && (
            <div className="flex flex-wrap gap-1.5">
              {E.RECORTES.map((r) => (
                <Chip key={r.id} onClick={() => onChange(E.recortar(e, r.id))}>{r.nome}</Chip>
              ))}
            </div>
          )}

          {e.telas.map((t, ti) => {
            const zonas = E.ZONAS.filter((z) => tudo || decidida(zona(ti, z)));
            if (!zonas.length) return null;
            return (
            <div key={ti} className="rounded-md border border-line">
              <div className="flex items-center gap-2 border-b border-line px-2.5 py-2">
                <MonitorPlay size={14} className="shrink-0 text-accent" />
                {telas.length > 0 ? (
                  <select aria-label="Qual TV" value={t.alvo.tipo === 'tela' ? t.alvo.id : 'todas'}
                    onChange={(ev) => mudar((x) => { x.telas[ti].alvo = ev.target.value === 'todas' ? { tipo: 'todas' } : { tipo: 'tela', id: ev.target.value }; x.telas[ti].nome = ''; })}
                    className="min-w-0 flex-1 truncate rounded border-0 bg-transparent py-0 text-sm font-semibold text-ink focus:ring-0">
                    <option value="todas">Todas as TVs</option>
                    {telas.map((d) => <option key={d.id} value={d.id}>{d.name || 'TV'}</option>)}
                  </select>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{nomeDaTela(t, ti, e.telas.length, telas)}</span>
                )}
                {e.telas.length > 1 && (
                  <button type="button" aria-label="Tirar esta TV" onClick={() => mudar((x) => { x.telas.splice(ti, 1); })}
                    className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-danger"><Trash2 size={13} /></button>
                )}
              </div>
              <div className="divide-y divide-line">
                {zonas.map((z) => {
                  const dados = zona(ti, z);
                  const faixa = z === 'cabecalho' || z === 'rodape';
                  return (
                    <div key={z} className="px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-ink">{E.NOME_ZONA[z]}</div>
                          <div className="truncate text-2xs text-ink-3">
                            {dados.pedido || (z === 'cabecalho' ? 'estilos que giram' : z === 'rodape' ? 'faixa de baixo' : 'peças que giram')}
                          </div>
                        </div>
                        <Passo valor={dados.pecas} max={E.TETO_ZONA[z]} rotulo={E.NOME_ZONA[z]}
                          onChange={(n) => mudar((x) => { x.telas[ti].zonas[z].pecas = n; })} />
                      </div>
                      {faixa && (dados.pecas > 0 || dados.vivos.length > 0) && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {VIVOS_DA_FAIXA.map((v) => (
                            <Chip key={v} className="py-0.5 text-2xs" ativo={dados.vivos.includes(v)}
                              onClick={() => mudar((x) => { const l = x.telas[ti].zonas[z].vivos; const i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else l.push(v); })}>
                              {E.NOME_VIVO[v]}
                            </Chip>
                          ))}
                        </div>
                      )}
                      {z === 'rodape' && (dados.pecas > 0 || dados.mensagens.length > 0) && (
                        <label className="mt-1.5 flex items-center gap-1.5 text-2xs text-ink-3">
                          <Clock size={12} /> Contagem até
                          <input type="datetime-local" value={dados.contagem} aria-label="Contagem regressiva até"
                            onChange={(ev) => mudar((x) => { x.telas[ti].zonas.rodape.contagem = ev.target.value.slice(0, 16); })}
                            className="min-w-0 flex-1 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-ink" />
                        </label>
                      )}
                      {z === 'rodape' && dados.mensagens.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {dados.mensagens.map((m, mi) => (
                            <li key={mi} className="flex items-center gap-1 text-2xs text-ink-2">
                              <span className="min-w-0 flex-1 truncate">· {m}</span>
                              <button type="button" aria-label={'Tirar o aviso ' + m} onClick={() => mudar((x) => { x.telas[ti].zonas.rodape.mensagens.splice(mi, 1); })}
                                className="text-ink-3 hover:text-danger"><X size={11} /></button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })}

          {/* Mais uma TV com conteúdo diferente (com várias TVs na conta). */}
          {tudo && (telas.length > 1 || !e.telas.length) && e.telas.length < E.TETO.telas && (
            <button type="button"
              onClick={() => mudar((x) => {
                const usadas = new Set(x.telas.filter((t) => t.alvo.tipo === 'tela').map((t) => t.alvo.id));
                const livre = telas.find((d) => !usadas.has(d.id));
                x.telas.push({ alvo: livre ? { tipo: 'tela', id: livre.id } : { tipo: 'todas' }, zonas: { principal: { pecas: 2 } } });
              })}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line py-2 text-xs text-ink-2 hover:border-accent/60 hover:text-ink">
              <Plus size={13} /> {e.telas.length ? 'Outra TV, com conteúdo diferente' : 'Para a TV'}
            </button>
          )}

          {redesVisiveis.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink"><Share2 size={13} className="text-accent" /> Redes</div>
            <div className="flex flex-wrap gap-1">
              {redesVisiveis.map((r) => (
                <Chip key={r} className="py-0.5 text-2xs" ativo={e.redes[r]} onClick={() => mudar((x) => { x.redes[r] = !x.redes[r]; })}>
                  {E.NOME_REDE[r]}
                </Chip>
              ))}
            </div>
          </div>
          )}

          {(tudo || e.horarios.length > 0) && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink"><Clock size={13} className="text-accent" /> Horários</div>
            <div className="flex flex-wrap gap-1">
              {faixasVisiveis.map((f) => {
                const ativo = e.horarios.some((h) => h.faixa === f.id);
                return (
                  <Chip key={f.id} className="py-0.5 text-2xs" ativo={ativo}
                    onClick={() => mudar((x) => { x.horarios = ativo ? x.horarios.filter((h) => h.faixa !== f.id) : x.horarios.concat({ faixa: f.id, foco: '' }); })}>
                    {f.nome}
                  </Chip>
                );
              })}
            </div>
            {e.horarios.filter((h) => h.foco || !h.faixa).length > 0 && (
              <ul className="mt-1 space-y-0.5 text-2xs text-ink-3">
                {e.horarios.filter((h) => h.foco || !h.faixa).map((h, i) => (
                  <li key={i}>· {h.faixa ? (FAIXAS.find((f) => f.id === h.faixa) || {}).nome : h.inicio + '–' + h.fim}{h.foco ? ': ' + h.foco : ''}</li>
                ))}
              </ul>
            )}
          </div>
          )}

          {tudo ? (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink"><ImageIcon size={13} className="text-accent" /> Fotos</div>
              <div className="flex flex-wrap gap-1">
                {FOTOS.map(([id, nome]) => (
                  <Chip key={id} className="py-0.5 text-2xs" ativo={e.imagens === id} onClick={() => mudar((x) => { x.imagens = id; })}>{nome}</Chip>
                ))}
              </div>
              <p className="mt-1 text-2xs text-ink-3">Foto gerada pela IA gasta uma criação do plano. As suas fotos não gastam nada.</p>
            </div>
          ) : custo.pecas > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-ink-2">
              <ImageIcon size={13} className="text-accent" /> Fotos: {(FOTOS.find(([id]) => id === e.imagens) || FOTOS[1])[1]}
            </div>
          )}

          <button type="button" onClick={() => setTudo((v) => !v)} aria-expanded={tudo}
            className="flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
            <SlidersHorizontal size={13} /> {tudo ? 'Mostrar só o combinado' : 'Ajustar tudo'}
          </button>
        </div>
      )}
    </div>
  );
}
