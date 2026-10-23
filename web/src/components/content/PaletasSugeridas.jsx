import React, { useEffect, useMemo, useState } from 'react';
import { Check, SlidersHorizontal, AlertTriangle, Wand2, Plus, Palette } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Select } from '../ui/Field.jsx';
import { PecaHtml } from './PecaHtml.jsx';
import { carregarDesenhista } from '../../lib/pecaHtml.js';
import { RAMOS, NOMES_RAMO, sugerir, aoRedor, avisos, mesmaPaleta, ehCurada, coresDoTexto, coresDoLogo } from '../../lib/paletas.js';
import { usePerfil } from '../../lib/perfil.js';

/*
 * Paletas sugeridas na Marca (docs/EXECUTOR.md, item 2).
 *
 * O caminho principal é ESCOLHER, não montar: três ou quatro paletas
 * prontas, desenhadas numa peça de verdade, com um toque para aplicar. As
 * cores livres continuam aqui, em "avançado", com aviso quando a escolha
 * não se lê — quem tem identidade definida não perde nada, e quem não tem
 * não precisa acertar combinação de cor sozinho.
 *
 * As sugestões e a conta de contraste moram em js/paletas.js (o mesmo
 * arquivo que dá a paleta com que a conta nasce, no servidor).
 */

/*
 * A peça da amostra: o selo de oferta mostra as três cores de uma vez —
 * o fundo é a principal, o selo e o kicker são o acento, o texto é o apoio.
 *
 * Só que oferta é coisa de loja. A metalúrgica escolhia cor em cima de
 * "Campanha com desconto" (D4): a Empresa vê um comunicado interno, a Saúde
 * um aviso de clínica — as peças-ouro já trazem esse texto.
 */
const AMOSTRA = { comercio: 'oferta-selo', empresa: 'gente-comunicado', saude: 'servico-comunicado' };
const amostras = {};
function carregarAmostra(perfil) {
  const nome = AMOSTRA[perfil] || AMOSTRA.comercio;
  if (!amostras[nome]) {
    amostras[nome] = carregarDesenhista()
      .then(() => fetch('/pecas-ouro/' + nome + '.html'))
      .then((r) => { if (!r.ok) throw new Error('amostra'); return r.text(); })
      .then((t) => window.MTPecaHtml.doArquivo(t))
      .catch((e) => { delete amostras[nome]; throw e; });
  }
  return amostras[nome];
}

/*
 * O texto da amostra fala do ramo da conta. A peça-ouro traz o exemplo do
 * salão ("Coloração com desconto"), e uma ótica escolhendo paleta em cima de
 * um anúncio de salão não se enxerga nele. Títulos de até 13 letras: é o
 * que cabe ao lado do selo nesta peça.
 */
const TEXTO_DO_RAMO = {
  otica: ['Óculos de sol', 'Até sábado'], padaria: ['Café da manhã', 'De segunda a sexta'],
  academia: ['Plano anual', 'Matrícula grátis'], barbearia: ['Corte + barba', 'Toda quarta'],
  beleza: ['Coloração', 'Toda terça-feira'], saude: ['Check-up', 'Este mês'],
  comida: ['Combo do dia', 'No almoço'], pet: ['Banho e tosa', 'Leve 4, pague 3'],
  moda: ['Nova coleção', 'Só esta semana'], varejo: ['Ofertas', 'Até domingo'],
  corporativo: ['Campanha', 'Este mês'], geral: ['Ofertas', 'Só esta semana'],
};

function Bolinhas({ cores, grande }) {
  const t = grande ? 'h-5 w-5' : 'h-3.5 w-3.5';
  return (
    <span className="flex -space-x-1">
      {cores.slice(0, 3).map((c, i) => <span key={i} className={t + ' rounded-full border border-surface ring-1 ring-line'} style={{ background: c }} />)}
    </span>
  );
}

export function PaletasSugeridas({ kit, empresa, ramoDaConta, logoUrl, fonteTitulo, fonteApoio, cores, setCores, aplicar, ocupado }) {
  const [arq, setArq] = useState(null);
  const [ramo, setRamo] = useState(ramoDaConta || 'geral');
  const [doLogo, setDoLogo] = useState([]);
  const [avancado, setAvancado] = useState(false);

  useEffect(() => { setRamo(ramoDaConta || 'geral'); }, [ramoDaConta]);
  const perfil = usePerfil();
  useEffect(() => { carregarAmostra(perfil.id).then(setArq).catch(() => setArq(null)); }, [perfil.id]);
  useEffect(() => { coresDoLogo(logoUrl).then(setDoLogo); }, [logoUrl]);

  /*
   * As cores "da empresa", que viram a base da primeira sugestão: as que ela
   * mesma escolheu (se não forem uma paleta de catálogo), senão as do logo,
   * senão as do site lido.
   */
  const salvas = (kit && kit.cores) || [];
  const daEmpresa = useMemo(() => {
    if (salvas.length && !ehCurada(salvas)) return salvas;
    if (doLogo.length) return doLogo;
    return coresDoTexto(kit && kit.siteResumo);
  }, [salvas.join(','), doLogo.join(','), kit && kit.siteResumo]); // eslint-disable-line react-hooks/exhaustive-deps

  // As cores lidas do site viram uma paleta própria, "Do seu site" (D9).
  const doSite = useMemo(() => coresDoTexto(kit && kit.siteResumo), [kit && kit.siteResumo]); // eslint-disable-line react-hooks/exhaustive-deps
  const { paletas } = useMemo(() => sugerir({ ramo, cores: daEmpresa, doSite }), [ramo, daEmpresa, doSite]);
  const problemas = useMemo(() => avisos(cores), [cores.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvasNaLista = paletas.some((p) => mesmaPaleta(p.cores, salvas));
  const setCor = (i, v) => setCores((c) => c.map((x, j) => (j === i ? v : x)));

  // A peça de amostra com as cores de uma paleta, no estilo "Cor da marca" — o cartaz.
  const [titulo, kicker] = TEXTO_DO_RAMO[ramo] || TEXTO_DO_RAMO.geral;
  const marcaNome = empresa || (kit && kit.nome) || 'Sua empresa';
  const campos = useMemo(() => (
    perfil.id === 'comercio' ? {
      marca: marcaNome, titulo, titulo2: 'com desconto', kicker,
      apoio: 'Aproveite: é por tempo limitado.', cta: 'Fale com a gente', nota: 'em toda a loja',
    } : perfil.id === 'saude' ? { marca: marcaNome } : {}
  ), [perfil.id, marcaNome, titulo, kicker]);
  const itemDe = (p) => arq && ({
    type: 'peca-html', papel: 'destaque', html: arq.html, css: arq.css, campos,
    modo: 'marca', marca: { cores: p.cores, fonteTitulo: fonteTitulo || '', fonteApoio: fonteApoio || '' },
  });

  return (
    <Panel>
      <PanelHeader title="Cores"
        description="Escolha uma paleta: todas foram feitas para se ler na TV, de longe. Vale para as peças, a tela inteira e as redes." />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span>Paletas para</span>
          <Select value={ramo} onChange={(e) => setRamo(e.target.value)} className="!h-8 !w-auto py-0 text-xs" aria-label="Ramo do negócio">
            {RAMOS.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            <option value="geral">{NOMES_RAMO.geral}</option>
          </Select>
          {daEmpresa.length > 0 && <span className="flex items-center gap-1.5 text-ink-3">· partindo das suas cores <Bolinhas cores={daEmpresa} /></span>}
        </div>

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {paletas.map((p, i) => {
            const emUso = mesmaPaleta(p.cores, salvas);
            const item = itemDe(p);
            return (
              <button key={p.id} type="button" disabled={ocupado} onClick={() => aplicar(p.cores)} aria-pressed={emUso}
                className={'group flex flex-col overflow-hidden rounded-lg border bg-surface text-left transition '
                  + (emUso ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-ink-3')}>
                <div className="relative">
                  {item ? <PecaHtml item={item} formato="16/9" className="!rounded-none !ring-0" />
                    : <div className="aspect-video" style={{ background: p.cores[0] }} />}
                  {emUso && (
                    <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-2xs font-semibold text-accent-fg shadow">
                      <Check size={11} /> Em uso
                    </span>
                  )}
                  {!emUso && i === 0 && !salvasNaLista && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-surface/90 px-2 py-0.5 text-2xs font-semibold text-ink shadow">Recomendada</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold leading-tight text-ink">{p.nome}</span>
                    {/* No celular a peça já mostra as cores; as bolinhas só espremeriam o nome. */}
                    <span className="hidden sm:block"><Bolinhas cores={p.cores} /></span>
                  </span>
                  <span className="line-clamp-2 text-2xs leading-snug text-ink-3">{p.porque}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* As cores à mão: para quem já tem identidade definida. */}
        <div className="rounded-lg border border-line">
          <button type="button" onClick={() => setAvancado((v) => !v)} aria-expanded={avancado}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium text-ink-2 hover:text-ink">
            <span className="flex items-center gap-2"><SlidersHorizontal size={13} className="shrink-0" /> <span>Escolher as cores à mão <span className="text-ink-3">· avançado</span></span></span>
            <span className="flex shrink-0 items-center gap-2"><span className="hidden sm:block"><Bolinhas cores={cores} /></span><span className="text-ink-3">{avancado ? 'fechar' : 'abrir'}</span></span>
          </button>
          {avancado && (
            <div className="space-y-3 border-t border-line p-3">
              <div className="flex flex-wrap items-end gap-3">
                {cores.map((c, i) => (
                  <div key={i} className="w-40">
                    <Field label={i === 0 ? 'Principal' : i === 1 ? 'Acento' : 'Apoio ' + (i - 1)}>
                      <div className="flex gap-1.5">
                        <input type="color" value={c} onChange={(e) => setCor(i, e.target.value)}
                          className="h-9 w-12 shrink-0 cursor-pointer rounded border border-line bg-transparent" />
                        <Input value={c} onChange={(e) => setCor(i, e.target.value)} className="font-mono text-xs" />
                      </div>
                    </Field>
                    {i > 1 && (
                      <button className="mt-1 text-2xs text-ink-3 hover:text-danger"
                        onClick={() => setCores((x) => x.filter((_, j) => j !== i))}>remover</button>
                    )}
                  </div>
                ))}
                {cores.length < 6 && (
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => setCores((c) => [...c, '#888888'])}>Cor</Button>
                )}
              </div>
              {/*
                O aviso diz o que acontece e o que fazer — não "contraste
                insuficiente". E oferece a saída: a paleta legível montada em
                volta das cores dela, sem perder a cor dela.
              */}
              {problemas.length > 0 && (
                <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-xs text-ink-2">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink"><AlertTriangle size={13} className="text-warn" /> Estas cores podem ficar difíceis de ler na TV</div>
                  <ul className="space-y-0.5">{problemas.map((t) => <li key={t}>· {t}</li>)}</ul>
                  <Button size="sm" variant="secondary" icon={Palette} className="mt-2" disabled={ocupado}
                    onClick={() => { const p = aoRedor(cores)[0]; if (p) aplicar(p.cores); }}>
                    Ajustar para uma paleta legível
                  </Button>
                </div>
              )}
              <Button size="sm" variant="primary" icon={Check} disabled={ocupado} onClick={() => aplicar(cores)}>Usar estas cores</Button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
