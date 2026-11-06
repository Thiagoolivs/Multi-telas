import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Field, Input, Select, Checkbox } from '../ui/Field.jsx';
import { PecaHtml } from './PecaHtml.jsx';
import { brand } from '../../api.js';
import { carregarModelos } from '../../lib/modelosOuro.js';
import { artesAprovadas, nomeDaArte, baseDa, pecaDaArte, fraseDoModelo } from '../../lib/arteDoAmbiente.js';
import { getLayout } from '../../lib/screenConfig.js';
import { usePerfil } from '../../lib/perfil.js';
import { cn } from '../../lib/cn.js';
import '../../lib/fundoDaTV.js'; // js/theme.js: as cores que a TV pinta
import '../../../../js/ambiente.js'; // o desenho de reserva, o mesmo da TV

/*
 * Dois ajustes da TV que moram fora das peças (Ajustes da TV › Aparência):
 *
 *   - MODO AMBIENTE (fase 9): uma arte calma da marca entre os avisos, com a
 *     hora e a data ou uma frase curta (js/ambiente.js; quem entra e quando,
 *     js/rodizio.js comAmbiente). Os tetos do urgente e da Alta continuam.
 *   - CHAMADA DE SENHA nesta TV (fase 12): mostrar ou não, com som ou sem, e
 *     a senha sempre à vista ao lado do conteúdo (js/senha.js). Quem chama é
 *     a recepção, na página Chamada de senha.
 *
 * Os dois vão em settings (js/storage.js normaliza) e a TV aplica na hora.
 *
 * A ARTE DO AMBIENTE: o desenho da marca (o de sempre, js/ambiente.js) ou
 * uma das peças-ouro de ambiente APROVADAS na galeria do operador (o
 * manifesto servido já vem com a decisão). A escolhida vai inteira, com as
 * cores e o nome da marca de agora, em settings.ambiente.peca — a TV a põe
 * no lugar do desenho (js/rodizio.js, pecaDeAmbiente) e o servidor a passa
 * pela porta das peças antes de gravar (js/peca-html.js, conferirConfig).
 */
const CADA = [3, 4, 5, 6, 8];
const SEGUNDOS = [8, 10, 15, 20];

// O tamanho da TV do layout: a prévia é desenhada nele e reduzida (como a PecaHtml).
const TAMANHO = { portrait: [1080, 1920, '9/16'], square: [1080, 1080, '1/1'] };
const tamanhoDa = (layoutId) => TAMANHO[getLayout(layoutId).orientation] || [1920, 1080, '16/9'];

// As cores que a TV vai pintar no desenho de reserva (as variáveis de js/theme.js).
function coresDoDesenho(theme, marca) {
  const T = globalThis.MTTheme;
  if (!T) return {};
  const th = theme || {};
  // Sem tema escolhido e com a marca nas TVs, a TV veste a marca (server/paleta.js, temaDaTv): o desenho também.
  const semEscolha = th.escolhido !== true && !th.aplicarMarca && (!th.preset || th.preset === 'dark-premium');
  const cores = (marca && marca.cores) || [];
  const usar = th.preset !== 'marca' && semEscolha && cores.length && marca.nasTvs !== false
    ? { preset: 'marca', marca: cores, fundo: th.fundo, fundoCor: th.fundoCor } : th;
  const t = T.resolve(usar, {});
  return { '--bg': t.bg, '--bg-2': t.bg2, '--brand': t.brand, '--brand-2': t.brand2, '--accent': t.accent, '--text': t.text };
}

/*
 * O desenho da marca, de verdade: js/ambiente.js (o da TV) desenhado num
 * palco do tamanho da TV e reduzido. A hora anda; as bolhas também, devagar.
 */
function PreviaDoDesenho({ mostrar, frase, tamanho, cores }) {
  const caixa = useRef(null);
  const palco = useRef(null);
  const [escala, setEscala] = useState(0);
  const [w, h] = tamanho;
  useEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const medir = () => setEscala(el.clientWidth / w);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  useEffect(() => {
    const A = globalThis.MTAmbiente;
    if (!A || !palco.current) return undefined;
    const r = A.render({ mostrar, frase });
    palco.current.appendChild(r.el);
    return () => { if (r.onLeave) r.onLeave(); r.el.remove(); };
  }, [mostrar, frase]);
  return (
    <div ref={caixa} aria-hidden="true" className="relative w-full overflow-hidden rounded-md ring-1 ring-line" style={{ aspectRatio: w + ' / ' + h }}>
      <div ref={palco} className="previa-ambiente"
        style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transformOrigin: '0 0', transform: 'scale(' + escala + ')', visibility: escala ? 'visible' : 'hidden', ...cores }} />
    </div>
  );
}

function CartaoDaArte({ sel, onClick, nome, apoio, previa, emPe }) {
  return (
    <button type="button" aria-pressed={sel} onClick={onClick}
      className={cn('flex flex-col gap-1.5 rounded-lg border p-2 text-left transition', sel ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/50')}>
      <div className={cn('pointer-events-none mx-auto w-full', emPe ? 'max-w-[4.5rem]' : '')}>{previa}</div>
      <span className="flex items-center gap-1 text-2xs font-medium leading-tight text-ink">{sel && <Check size={11} className="shrink-0 text-accent" />}{nome}</span>
      <span className="text-2xs leading-tight text-ink-3">{apoio}</span>
    </button>
  );
}

/*
 * As peças de ambiente aprovadas, na frente da conta, e a marca da conta.
 * `artes` é null enquanto carrega; sem nenhuma aprovada (ou sem conseguir
 * abrir o manifesto), lista vazia: fica o desenho da marca.
 */
function useArtes(frente) {
  const [artes, setArtes] = useState(null);
  const [marca, setMarca] = useState(null);
  useEffect(() => {
    let vivo = true;
    carregarModelos()
      .then((ms) => { if (vivo) setArtes(artesAprovadas(ms, frente)); })
      .catch(() => { if (vivo) setArtes([]); });
    brand.get().then((r) => {
      const k = (r && r.kit) || {};
      if (vivo) setMarca({ cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '', nasTvs: k.nasTvs !== false, nome: (k.nome && k.nome !== 'Marca principal' ? k.nome : (r && r.empresa)) || '' });
    }).catch(() => { if (vivo) setMarca({}); });
    return () => { vivo = false; };
  }, [frente]);
  return { artes, marca };
}

function EscolherArte({ a, settings, setA, semPeca, artes, marca, frente }) {
  const [w, h, formato] = tamanhoDa(settings.layoutId);
  const emPe = h > w;
  const cores = useMemo(() => coresDoDesenho(settings.theme, marca), [settings.theme, marca]);
  const base = baseDa(a.peca);
  const lista = artes || [];
  // A arte gravada que não está mais na lista (recusada depois): continua aparecendo, escolhida.
  const antiga = a.peca && !lista.some((m) => m.id === base);
  const frase = a.frase || '';
  const previas = useMemo(() => new Map(lista.map((m) => [m.id, pecaDaArte(m, marca || {}, frente, frase)])), [lista, marca, frente, frase]);
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-ink-2">A arte</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CartaoDaArte sel={!a.peca} onClick={semPeca} emPe={emPe} nome="Desenho da marca"
          apoio={a.mostrar === 'frase' && frase ? 'Com a sua frase' : 'Com a hora e a data'}
          previa={<PreviaDoDesenho mostrar={a.mostrar} frase={frase} tamanho={[w, h]} cores={cores} />} />
        {antiga && (
          <CartaoDaArte sel onClick={() => {}} emPe={emPe} nome="A arte de agora" apoio="Com uma frase"
            previa={<PecaHtml item={a.peca} formato={formato} />} />
        )}
        {marca && lista.map((m) => (
          <CartaoDaArte key={m.id} sel={base === m.id} emPe={emPe} nome={nomeDaArte(m)} apoio="Com uma frase"
            onClick={() => setA({ peca: pecaDaArte(m, marca, frente, frase) })}
            previa={<PecaHtml item={previas.get(m.id)} formato={formato} />} />
        ))}
      </div>
      {artes && !lista.length && <p className="mt-1.5 text-2xs text-ink-3">Mais artes aparecem aqui assim que forem aprovadas.</p>}
    </div>
  );
}

export function AmbienteESenha({ settings, onChange }) {
  const perfil = usePerfil();
  const s = settings || {};
  const a = { ativo: false, cada: 4, segundos: 10, mostrar: 'relogio', frase: '', ...(s.ambiente || {}) };
  const q = { ativo: true, som: true, fixa: false, segundos: 12, ...(s.senha || {}) };
  const setA = (p) => onChange({ ambiente: { ...a, ...p } });
  const setQ = (p) => onChange({ senha: { ...q, ...p } });
  const { artes, marca } = useArtes(perfil.id);
  // Voltar ao desenho da marca: a peça sai da config (a TV volta ao desenho dela).
  const semPeca = () => { const resto = { ...a }; delete resto.peca; onChange({ ambiente: resto }); };
  // Com a peça escolhida, a frase escrita vai para ela; vazia, fica a do modelo.
  const modelo = a.peca && (artes || []).find((m) => m.id === baseDa(a.peca));
  function mudarFrase(frase) {
    if (!a.peca) { setA({ frase }); return; }
    const peca = modelo ? pecaDaArte(modelo, marca || {}, perfil.id, frase) : { ...a.peca, campos: { ...a.peca.campos, ...(frase ? { frase } : {}) } };
    setA({ frase, peca });
  }
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-sm font-semibold text-ink">Modo ambiente</div>
        <p className="mb-2 text-xs text-ink-3">Uma arte calma, nas cores da marca, entre os avisos: a hora e a data, ou uma frase curta. Um respiro para quem espera.</p>
        <Checkbox label="Pôr a arte calma entre os avisos" checked={a.ativo === true} onChange={(e) => setA({ ativo: e.target.checked })} />
        {a.ativo === true && (
          <div className="mt-3 space-y-3">
            <EscolherArte a={a} settings={s} setA={setA} semPeca={semPeca} artes={artes} marca={marca} frente={perfil.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Quando entra">
                <Select value={String(a.cada)} onChange={(e) => setA({ cada: Number(e.target.value) })}>
                  {CADA.map((n) => <option key={n} value={n}>A cada {n} avisos</option>)}
                </Select>
              </Field>
              <Field label="Quanto tempo fica">
                <Select value={String(a.segundos)} onChange={(e) => setA({ segundos: Number(e.target.value) })}>
                  {SEGUNDOS.map((n) => <option key={n} value={n}>{n} segundos</option>)}
                </Select>
              </Field>
              {/* A peça escolhida mostra uma frase, não a hora: a pergunta "o que mostra" só vale para o desenho da marca. */}
              {!a.peca && (
                <Field label="O que mostra">
                  <Select value={a.mostrar} onChange={(e) => setA({ mostrar: e.target.value })}>
                    <option value="relogio">A hora e a data</option>
                    <option value="frase">Uma frase</option>
                  </Select>
                </Field>
              )}
              {(a.peca || a.mostrar === 'frase') && (
                <Field label="A frase" hint={a.peca ? 'Curta, até 90 letras. Vazia, fica a frase da arte.' : 'Curta, até 90 letras. Vazia, a TV mostra a hora.'} className="sm:col-span-3">
                  <Input maxLength={90} value={a.frase || ''} onChange={(e) => mudarFrase(e.target.value)} placeholder={(a.peca && fraseDoModelo(modelo, perfil.id)) || 'Respire fundo. Já é a sua vez.'} />
                </Field>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-sm font-semibold text-ink">Chamada de senha</div>
        <p className="mb-2 text-xs text-ink-3">Quando a recepção chama, a senha e o lugar tomam a tela por alguns segundos. O nome do paciente nunca aparece.</p>
        <div className="space-y-2">
          <Checkbox label="Mostrar as chamadas de senha nesta TV" checked={q.ativo !== false} onChange={(e) => setQ({ ativo: e.target.checked })} />
          {q.ativo !== false && (
            <>
              <Checkbox label="Tocar um aviso sonoro a cada chamada" checked={q.som !== false} onChange={(e) => setQ({ som: e.target.checked })} />
              <Checkbox label="Deixar a senha sempre à vista, ao lado do conteúdo" checked={q.fixa === true} onChange={(e) => setQ({ fixa: e.target.checked })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
