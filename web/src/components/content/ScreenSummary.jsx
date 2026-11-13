import { usePerfil } from '../../lib/perfil.js';
import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Palette, Clock, AlertTriangle, Lightbulb, Check, Info } from 'lucide-react';
import { digest, formatarTempo } from '../../lib/screenDigest.js';
import { nomeDaParte } from '../../lib/tela.js';
import { ArrumarVolta } from '../tela/ArrumarVolta.jsx';

/*
 * "O que está nesta tela" — a resposta para "o sistema não passa segurança".
 *
 * Antes o usuário aplicava uma data, publicava uma campanha e mexia no tema, e
 * nada dizia qual coisa venceu nem o que a TV está exibindo agora. Este resumo
 * não decide nada: ele descreve, e é isso que devolve o controle.
 */
/*
 * A VOLTA LONGA À VISTA (reteste 2). A volta maior que o tempo que a pessoa
 * fica no lugar é um aviso, e não fica dentro do resumo fechado: a faixa
 * aparece no alto da página da TV, com o "Arrumar a volta" ali mesmo.
 */
export function AvisoDeVolta({ cfg, aoArrumar }) {
  const perfil = usePerfil();
  const d = useMemo(() => digest(cfg, null, perfil.id), [cfg, perfil.id]);
  const layout = globalThis.MT_getLayout ? globalThis.MT_getLayout(cfg && cfg.settings && cfg.settings.layoutId) : null;
  const longas = d ? d.problemas.filter((p) => p.volta) : [];
  if (!longas.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {longas.map((p) => (
        <div key={p.volta.zona} role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warn-soft bg-warn-soft px-4 py-3">
          <span className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-sm text-ink">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
            <span>{p.texto}</span>
          </span>
          {p.volta && aoArrumar && (
            <span className="shrink-0"><ArrumarVolta cfg={cfg} volta={p.volta} aoArrumar={aoArrumar}
              parte={nomeDaParte({ id: p.volta.zona, type: 'playlist', name: p.volta.nome }, layout)} /></span>
          )}
        </div>
      ))}
    </div>
  );
}

// `comFaixa`: a página já mostra a volta longa no alto (AvisoDeVolta), com o botão.
export function ScreenSummary({ cfg, aoArrumar, comFaixa = false }) {
  const [aberto, setAberto] = useState(false);
  const perfil = usePerfil();
  // A frente dá o local padrão da TV (fase 3): a volta certa é a do lugar.
  const d = useMemo(() => digest(cfg, null, perfil.id), [cfg, perfil.id]);
  const layout = globalThis.MT_getLayout ? globalThis.MT_getLayout(cfg && cfg.settings && cfg.settings.layoutId) : null;
  if (!d) return null;

  const avisos = d.problemas.filter((p) => p.nivel === 'aviso');
  const dicas = d.problemas.filter((p) => p.nivel === 'dica');

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface">
      <button type="button" onClick={() => setAberto((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left">
        {aberto ? <ChevronDown size={15} className="text-ink-3" /> : <ChevronRight size={15} className="text-ink-3" />}
        <span className="text-sm font-semibold text-ink">Resumo desta TV</span>

        {/*
          Linha de estado: dá para entender sem abrir. Fase 10: sem o nome
          técnico do layout ("Corporativo Completo", "Cabeçalho + 2 Zonas") e
          sem "ciclo" — a volta da TV, em palavras.
        */}
        <span className="hidden min-w-0 flex-1 truncate text-sm text-ink-3 sm:block">
          {d.tema.texto}
          {d.decoracao ? ` · ${d.decoracao}` : ''}
          {d.cicloTotal ? ` · dá a volta em ${formatarTempo(d.cicloTotal)}` : ''}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {avisos.length > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
              <AlertTriangle size={12} /> {avisos.length} {avisos.length === 1 ? 'coisa a conferir' : 'coisas a conferir'}
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-3">
              <Check size={12} className="text-emerald-500" /> tudo certo
            </span>
          )}
          {dicas.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-3">
              <Lightbulb size={12} /> {dicas.length} {dicas.length === 1 ? 'dica' : 'dicas'}
            </span>
          )}
        </span>
      </button>

      {aberto && (
        <div className="border-t border-line p-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Zonas */}
            <div>
              <div className="mb-2 text-sm font-semibold text-ink">Partes da TV</div>
              <div className="space-y-1.5">
                {d.zonas.map((z) => (
                  <div key={z.id} className="flex items-baseline gap-2 text-sm">
                    <span className="font-medium text-ink">{nomeDaParte({ id: z.id, type: z.tipo, name: z.nome }, layout)}</span>
                    <span className="text-ink-3">{z.resumo}</span>
                    {z.ciclo > 0 && (
                      <span className="tnum ml-auto flex items-center gap-1 text-ink-3">
                        <Clock size={11} /> {formatarTempo(z.ciclo)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Aparência e origem */}
            <div className="space-y-2 text-sm">
              <div className="mb-2 text-sm font-semibold text-ink">Aparência</div>
              <div className="flex items-start gap-1.5 text-ink-2">
                <Palette size={13} className="mt-0.5 shrink-0 text-ink-3" />
                <span>
                  Usando {d.tema.texto}
                  {d.tema.mexeuAMao && <span className="text-ink-3"> · com ajustes seus por cima</span>}
                </span>
              </div>
              {d.decoracao && (
                <div className="flex items-start gap-1.5 text-ink-2">
                  <Info size={13} className="mt-0.5 shrink-0 text-ink-3" />
                  <span>Decoração animada: {d.decoracao}</span>
                </div>
              )}
              {/* De onde veio o conteúdo — a parte que responde "quem colocou isso aqui". */}
              {(d.origens.data > 0 || d.origens.campanha > 0) && (
                <div className="pt-1 text-ink-3">
                  Conteúdo:{' '}
                  {['data', 'campanha', 'manual'].filter((k) => d.origens[k] > 0)
                    .map((k) => `${d.origens[k]} da ${d.rotuloOrigem(k)}`).join(' · ')}
                </div>
              )}
            </div>
          </div>

          {/* Problemas — o que a TV vai mostrar de errado */}
          {(avisos.length > 0 || dicas.length > 0) && (
            <div className="mt-4 space-y-1.5 border-t border-line pt-3">
              {avisos.map((p, i) => (
                <div key={'a' + i} className="flex items-start gap-1.5 text-xs text-danger">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    {p.texto}
                    {/* A volta longa tem o botão na faixa do alto da página (AvisoDeVolta); sem ela, aqui mesmo. */}
                    {p.volta && aoArrumar && !comFaixa && (
                      <span className="block"><ArrumarVolta cfg={cfg} volta={p.volta} aoArrumar={aoArrumar}
                        parte={nomeDaParte({ id: p.volta.zona, type: 'playlist', name: p.volta.nome }, layout)} /></span>
                    )}
                    {p.volta && comFaixa && <span className="block text-ink-3">O botão “Arrumar a volta” está no alto da página.</span>}
                  </span>
                </div>
              ))}
              {dicas.map((p, i) => (
                <div key={'d' + i} className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Lightbulb size={13} className="mt-0.5 shrink-0" />
                  <span>{p.texto}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
