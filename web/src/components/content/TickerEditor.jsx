import React from 'react';
import { Plus, X } from 'lucide-react';
import { Field, Input, Select, Checkbox } from '../ui/Field.jsx';
import { Button } from '../ui/Button.jsx';
import { NEWS_FEEDS } from '../../lib/screenConfig.js';

// Amostra + hex, com "limpar" para voltar a herdar do tema.
function CorDoRodape({ label, value, onChange }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-2xs text-ink-3">
        <span>{label}</span>
        {value && <button type="button" onClick={() => onChange('')} className="hover:text-ink-2">limpar</button>}
      </div>
      <div className="flex gap-1">
        <input type="color" value={value || '#111827'} onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 shrink-0 cursor-pointer rounded border border-line bg-transparent" />
        <Input value={value || ''} placeholder="tema" onChange={(e) => onChange(e.target.value)} className="font-mono text-2xs" />
      </div>
    </div>
  );
}

/*
 * A velocidade, com a unidade que o player de fato usa.
 *
 * O campo antigo dizia "Velocidade (s)" e a dica dizia "menor = mais rápido".
 * As duas coisas estavam erradas: o player lê o número como PIXELS POR
 * SEGUNDO, e maior é mais rápido. Pior, aquele campo (`velocidade`) só era
 * lido pelo letreiro — no modo manchetes, o padrão, mexer nele não fazia
 * absolutamente nada, seguindo uma dica que ensinava o contrário do efeito.
 *
 * Agora existe um número só, na unidade certa, valendo para os dois modos.
 */
function CampoVelocidade({ z, set }) {
  const v = z.velocidadeTexto ?? z.velocidade ?? 70;
  return (
    <Field label="Velocidade do texto" hint="Pixels por segundo. Menor = mais devagar e mais fácil de ler.">
      <Input type="number" min={20} max={200} value={v}
        onChange={(e) => set({ velocidadeTexto: Number(e.target.value) })} />
    </Field>
  );
}

// Edita uma zona do tipo "ticker" (rodapé): notícias automáticas e/ou
// mensagens fixas rolando.
export function TickerEditor({ zone, onChange }) {
  const z = zone || {};
  const set = (patch) => onChange({ ...z, ...patch });
  const fontes = Array.isArray(z.fontes) ? z.fontes : [];
  const messages = Array.isArray(z.messages) ? z.messages : [];

  /*
   * As telas já configuradas guardam `modo`, que respondia às duas perguntas
   * ao mesmo tempo. Aqui ele é lido como o par equivalente — e a primeira
   * alteração grava os dois campos novos, sem migração de banco.
   */
  const conteudo = z.conteudo || (z.modo === 'rolagem' ? 'mensagens' : 'ambos');
  const movimento = z.movimento || (z.modo === 'rolagem' ? 'letreiro' : 'manchetes');

  const toggleFeed = (id) => set({ fontes: fontes.includes(id) ? fontes.filter((f) => f !== id) : [...fontes, id] });
  const setMsg = (i, v) => { const m = [...messages]; m[i] = v; set({ messages: m }); };
  const addMsg = () => set({ messages: [...messages, ''] });
  const removeMsg = (i) => set({ messages: messages.filter((_, j) => j !== i) });

  return (
    <div className="grid gap-5 p-4 md:grid-cols-2">
      <div className="space-y-4">
        <Field label="Título da faixa">
          <Input value={z.titulo || ''} onChange={(e) => set({ titulo: e.target.value })} placeholder="ÚLTIMAS NOTÍCIAS" />
        </Field>
        {/*
          DUAS PERGUNTAS, DOIS CONTROLES.

          Havia um campo só, chamado "Modo", com "Notícias (automático)" e "Só
          mensagens fixas". Ele misturava DE ONDE VEM O TEXTO com COMO ELE SE
          MOVE: o letreiro contínuo só existia dentro da segunda opção, então
          pedir letreiro custava o feed de notícias. Quem quisesse notícia
          rolando sem parar — que é o que quase todo mundo quer — não tinha
          como pedir, e o rótulo não dava nenhuma pista do porquê.
        */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="O que mostrar">
            <Select value={conteudo} onChange={(e) => set({ conteudo: e.target.value, movimento })}>
              <option value="ambos">Notícias e minhas mensagens</option>
              <option value="noticias">Só notícias</option>
              <option value="mensagens">Só minhas mensagens</option>
            </Select>
          </Field>
          <Field label="Como aparece">
            <Select value={movimento} onChange={(e) => set({ movimento: e.target.value, conteudo })}>
              <option value="manchetes">Uma manchete por vez</option>
              <option value="letreiro">Letreiro contínuo</option>
            </Select>
          </Field>
        </div>

        {/* Exibição */}
        <div className="space-y-2 rounded-lg border border-line bg-surface-2/50 p-3">
          <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Exibição</div>
          <Checkbox label="Mostrar o selo com o título" checked={z.mostrarSelo !== false} onChange={(e) => set({ mostrarSelo: e.target.checked })} />
          <Checkbox label="Mostrar data e hora" checked={z.mostrarRelogio !== false} onChange={(e) => set({ mostrarRelogio: e.target.checked })} />
          {z.mostrarSelo === false && z.mostrarRelogio === false && (
            <p className="text-2xs text-ink-3">Sem os dois, a manchete ocupa a faixa inteira — bom para rodapé fino.</p>
          )}
          <CampoVelocidade z={z} set={set} />
          {movimento === 'manchetes' && (
            <>
              {/*
                Só duas opções porque só existem duas: rolar quando não cabe, ou
                cortar. "Sempre rolar" seria mentira — texto que já cabe não tem
                para onde ir, e mexê-lo só o tira de vista.
              */}
              <Checkbox label="Rolar a manchete quando não couber"
                checked={(z.rolagem || 'auto') !== 'nunca'}
                onChange={(e) => set({ rolagem: e.target.checked ? 'auto' : 'nunca' })} />
              <p className="text-2xs leading-snug text-ink-3">
                {(z.rolagem || 'auto') !== 'nunca'
                  ? 'Manchete longa desliza até o fim e volta. A curta fica parada.'
                  : 'Manchete longa é cortada com “…” — a pessoa não lê o final.'}
              </p>
            </>
          )}
        </div>

        {/* Cores */}
        <div className="space-y-3 rounded-lg border border-line bg-surface-2/50 p-3">
          <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Cores do rodapé</div>
          <Select value={z.cores || 'tema'} onChange={(e) => set({ cores: e.target.value })}>
            <option value="tema">Seguir o tema da tela (recomendado)</option>
            <option value="marca">Faixa na cor da marca</option>
            <option value="custom">Escolher as cores</option>
          </Select>
          {z.cores === 'custom' && (
            <div className="grid grid-cols-3 gap-2">
              <CorDoRodape label="Fundo" value={z.fundo} onChange={(v) => set({ fundo: v })} />
              <CorDoRodape label="Texto" value={z.corTexto} onChange={(v) => set({ corTexto: v })} />
              <CorDoRodape label="Destaque" value={z.corDestaque} onChange={(v) => set({ corDestaque: v })} />
            </div>
          )}
          {z.cores === 'custom' && !z.corTexto && z.fundo && (
            <p className="text-2xs text-ink-3">Sem cor de texto definida, ela é calculada para contrastar com o fundo escolhido.</p>
          )}
        </div>

        {/* Quem decide se há feed é o CONTEÚDO, não o movimento: o letreiro
            contínuo passou a poder rolar notícia também. */}
        {conteudo !== 'mensagens' && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-2">Fontes de notícia</div>
            <div className="flex flex-wrap gap-1.5">
              {NEWS_FEEDS.map((f) => {
                const on = fontes.includes(f.value);
                return (
                  <button key={f.value} type="button" onClick={() => toggleFeed(f.value)}
                    className={'rounded-full border px-2.5 py-1 text-xs transition ' + (on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2')}>
                    {f.label}
                  </button>
                );
              })}
            </div>
            <Field label="RSS personalizado (URL)" className="mt-3">
              <Input value={z.rssUrl || ''} onChange={(e) => set({ rssUrl: e.target.value })} placeholder="https://exemplo.com/feed.xml" />
            </Field>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-2">Mensagens fixas</span>
          <Button size="sm" variant="ghost" icon={Plus} onClick={addMsg}>Adicionar</Button>
        </div>
        <p className="mb-2 text-2xs text-ink-3">Aparecem intercaladas com as notícias (ou sozinhas no modo "só mensagens").</p>
        <div className="space-y-2">
          {messages.length === 0 && <p className="text-xs text-ink-3">Nenhuma mensagem fixa.</p>}
          {messages.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input value={m} onChange={(e) => setMsg(i, e.target.value)} placeholder="Título :: detalhe" />
              <button type="button" onClick={() => removeMsg(i)} className="shrink-0 rounded-md p-1.5 text-ink-3 transition hover:bg-surface-2 hover:text-danger" aria-label="Remover">
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        {conteudo !== 'mensagens' && (
          <Field label="Máx. de manchetes por fonte" className="mt-3">
            <Input type="number" min={1} value={z.quantidade ?? 10} onChange={(e) => set({ quantidade: Number(e.target.value) })} />
          </Field>
        )}
      </div>
    </div>
  );
}
