import React, { useEffect, useMemo, useRef, useState } from 'react';
import { confirmar } from '../../lib/confirmar.js';
import { aviso } from '../../lib/avisos.js';
import { Check, AlertTriangle, Sparkles } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Input } from '../ui/Field.jsx';
import { PecaHtml } from './PecaHtml.jsx';
import { FotoDoProduto } from './FotoDoProduto.jsx';
import { carregarDesenhista, conferirNosFormatos, NOME_DO_FORMATO } from '../../lib/pecaHtml.js';
import { ai, brand } from '../../api.js';
import { carregarModelos } from '../../lib/modelosOuro.js';
import { CURADAS } from '../../lib/paletas.js';
import { MiniConversa, comPergunta } from '../tela/MiniConversa.jsx';

/*
 * Editar os textos e a foto de uma peça em HTML (PLANO §4.5, "Campos"; PR 14).
 *
 * O cliente não vê código: a peça diz quais são os campos (`data-campo`) e
 * o formulário é só isso. A cada mudança a peça é conferida nos três formatos
 * com o detector da bancada — texto que sai da borda ou cobre outro é avisado
 * NA HORA, com o formato e o campo, antes de ir para a TV.
 *
 * O limite de caracteres sai do texto que a peça trazia: o desenho foi feito
 * para aquele tamanho. Uma vez e meia dá folga sem deixar virar parágrafo.
 */
const ROTULO = {
  kicker: 'Chamada pequena (acima do título)', titulo: 'Título', titulo2: 'Título — 2ª linha', apoio: 'Texto de apoio',
  cta: 'Chamada', chamada: 'Chamada', preco: 'Preço', centavos: 'Centavos', marca: 'Nome da empresa', selo: 'Selo',
  quando: 'Quando', endereco: 'Endereço', oferta: 'Oferta', nota: 'Observação', acompanha: 'Acompanha', link: 'Link do QR',
};
export function rotulo(nome) {
  if (ROTULO[nome]) return ROTULO[nome];
  const m = nome.match(/^(\w+?)(\d+)(?:-(\w+))?$/);
  if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1) + ' ' + m[2] + (m[3] ? ' · ' + m[3] : '');
  return nome.charAt(0).toUpperCase() + nome.slice(1).replace(/-/g, ' ');
}
/*
 * Estilo e marca (§4.15: "trocar marca ou modo reestiliza a peça sem gerar de
 * novo"). A peça só usa as variáveis --mt-*; trocar o modo ou a marca troca
 * os tokens e o mesmo HTML se redesenha — nada vai para a IA, nada é cobrado.
 */
export const ESTILOS = [
  { id: 'escuro', nome: 'Escuro' }, { id: 'claro', nome: 'Claro' }, { id: 'marca', nome: 'Cor da marca' },
];
export const marcaDaPeca = (m) => (m && m.cores && m.cores.length
  ? { cores: m.cores, fonteTitulo: m.fonteTitulo || '', fonteApoio: m.fonteApoio || '' } : null);
const mesmaMarca = (a, b) => !!a && !!b && JSON.stringify(a.cores) === JSON.stringify(b.cores)
  && (a.fonteTitulo || '') === (b.fonteTitulo || '');

const limite = (exemplo) => Math.max(12, Math.ceil(String(exemplo || '').length * 1.5));

// "TV em pé: "Título" passa da borda" — o que o detector achou, na língua de quem usa.
export function avisosDaConferencia(conferencia) {
  return Object.entries(conferencia || {}).flatMap(([f, r]) => [
    ...r.fora.map((n) => (NOME_DO_FORMATO[f] || f) + ': "' + rotulo(n) + '" passa da borda'),
    ...r.juntos.map((par) => (NOME_DO_FORMATO[f] || f) + ': ' + par.split(' × ').map(rotulo).join(' e ') + ' ficam um sobre o outro'),
  ]);
}

/*
 * A barreira na revisão da campanha (§4.10): a peça que a IA entregou é
 * conferida nos três formatos ANTES de a pessoa salvar ou publicar. É o
 * defeito que o dono achou nas notas do experimento ("Pet Feliz" por cima de
 * "pacote de cuidados") — visto aqui, a peça já vem marcada para revisar.
 */
/*
 * E o conserto: a peça que não coube volta para a IA com a medida (`auto`,
 * uma vez, sozinha) e a nova entra no lugar por `onTrocar`. Se ainda não
 * couber, fica o "revisar:" com o botão — gastar sem parar, não.
 */
export function AvisoDeEncaixe({ item, onTrocar, auto }) {
  const [estado, setEstado] = useState({ fase: 'conferindo', avisos: [] });
  const tentou = useRef(false);
  const trocou = useRef(false);

  async function refazer(avisos, vivo) {
    tentou.current = true;
    setEstado({ fase: 'refazendo', avisos });
    try {
      const out = await ai.refazerPeca(item, avisos);
      if (vivo() && out && out.item) { trocou.current = true; onTrocar(out.item); return; }
    } catch (e) { /* fica o revisar, com o botão */ }
    if (vivo()) setEstado({ fase: 'revisar', avisos });
  }

  useEffect(() => {
    let ativo = true;
    const vivo = () => ativo;
    setEstado({ fase: 'conferindo', avisos: [] });
    conferirNosFormatos(item).then((r) => {
      if (!ativo) return;
      const avisos = avisosDaConferencia(r);
      if (!avisos.length) setEstado({ fase: 'ok', avisos });
      else if (auto && onTrocar && !tentou.current) refazer(avisos, vivo);
      else setEstado({ fase: 'revisar', avisos });
    }).catch(() => {});
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (estado.fase === 'ok' && trocou.current) return <div className="text-2xs text-ok">✓ redesenhada para caber</div>;
  if (estado.fase === 'refazendo') return <div className="text-2xs text-ink-3">não coube ({estado.avisos[0]}) — redesenhando…</div>;
  if (estado.fase !== 'revisar') return null;
  return (
    <div className="rounded border border-warn/40 bg-warn/10 px-1.5 py-1 text-2xs leading-snug text-ink">
      <span className="font-semibold">revisar:</span> {estado.avisos[0]}{estado.avisos.length > 1 ? ' (+' + (estado.avisos.length - 1) + ')' : ''}
      {onTrocar && (
        <button type="button" onClick={() => refazer(estado.avisos, () => true)}
          className="ml-1 font-semibold text-accent hover:underline">Refazer</button>
      )}
    </div>
  );
}

/*
 * `lugar` ({ nome, tamanho }): a peça já tem lugar certo numa tela (as
 * telas prontas, D18). Aí ela é desenhada e conferida no tamanho daquela
 * zona — "cabe na principal" —, e não nos três formatos soltos.
 */
/*
 * EDITAR QUALQUER PEÇA (EXECUTOR D19). O dono: "trocar fonte, cor e tela de
 * peça feita pela IA" e "trocar elementos e a visualização no geral
 * também". Em quatro abas, para não virar um formulário sem fim:
 *
 *   Textos     os campos e a foto (o de sempre);
 *   Cor e fonte  estilo, marca, as duas cores (da marca, sugeridas ou
 *              escolhidas à mão) e a fonte dos títulos e a dos textos;
 *   Elementos  mostrar ou esconder cada texto (a chamada pequena, o
 *              apoio, o preço…) — o desenho fica, o elemento some;
 *   Desenho    a mesma mensagem em outro desenho da mesma família (e
 *              outros que cabem no mesmo lugar), com os textos que casam.
 *
 * Nada disso chama a IA nem gasta crédito: a peça só usa as variáveis
 * --mt-*, e trocar cor, fonte ou desenho é redesenhar o mesmo conteúdo.
 */
const ABAS = [['textos', 'Textos'], ['visual', 'Cor e fonte'], ['elementos', 'Elementos'], ['desenho', 'Desenho']];

// Uma paleta de cada ramo, para quem quer experimentar sem escolher cor à mão.
const SUGERIDAS = Object.values(CURADAS).map((l) => l[0]).filter(Boolean).slice(0, 8);

const corValida = (c) => /^#[0-9a-f]{6}$/i.test(c || '');

export function EditarPeca({ item, label, onFechar, onSalvar, lugar }) {
  const [definicao, setDefinicao] = useState(null);
  // O texto dos campos escondidos volta de `guardados` (ver `atual`): esconder e mostrar de novo não perde nada.
  const [campos, setCampos] = useState(() => ({ ...(item.campos || {}), ...(item.guardados || {}) }));
  const [fotoAberta, setFotoAberta] = useState(null);
  const [conferencia, setConferencia] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [modo, setModo] = useState(item.modo || 'escuro');
  const [marca, setMarca] = useState(item.marca || null);
  const [marcas, setMarcas] = useState([]);
  const [aba, setAba] = useState('textos');
  const [ocultos, setOcultos] = useState(() => (item.ocultos || []).slice());
  // D37: o crédito da foto do banco de imagens, por campo ("Foto: Fulano / Pixabay"); a TV mostra no canto.
  const [creditos, setCreditos] = useState(() => ({ ...(item.creditos || {}) }));
  const [desenho, setDesenho] = useState(() => ({ html: item.html, css: item.css, base: (item.origem && item.origem.base) || '' }));
  const [modelos, setModelos] = useState(null);
  const [daConta, setDaConta] = useState(null);   // a marca principal: o "voltar para a marca"
  const [familias, setFamilias] = useState([]);
  // D20: pedir à IA dentro da peça. Ela devolve só o que muda; "Desfazer" volta ao de antes do pedido.
  const [pedido, setPedido] = useState('');
  const [pedindo, setPedindo] = useState(false);
  const [respostaIA, setRespostaIA] = useState(null);   // { texto, antes }
  // D51: a mini-conversa — a IA pergunta quando não entende ("Qual cor?").
  const [historicoIA, setHistoricoIA] = useState([]);

  // As marcas da conta (até três): só aparece a escolha quando há mais de uma.
  useEffect(() => {
    brand.marcas().then((r) => setMarcas(((r && r.marcas) || []).filter((m) => marcaDaPeca(m)))).catch(() => {});
    brand.get().then((r) => {
      const k = (r && r.kit) || {};
      setDaConta({ marca: marcaDaPeca(k), nome: (k.nome && k.nome !== 'Marca principal' ? k.nome : (r && r.empresa)) || '' });
    }).catch(() => setDaConta({ marca: null, nome: '' }));
  }, []);

  // Os campos que o desenho declara: lidos pela MESMA porta da TV.
  useEffect(() => {
    carregarDesenhista().then(() => {
      setDefinicao(window.MTPecaHtml.higienizar({ html: desenho.html, css: desenho.css }).campos);
      const F = window.MTFontes;
      if (F) setFamilias(Object.keys(F.FAMILIAS).map((id) => ({ id, nome: F.FAMILIAS[id].rotulo, papel: F.FAMILIAS[id].papel })));
    });
  }, [desenho]);

  // Os outros desenhos só carregam quando a aba abre.
  useEffect(() => {
    if (aba === 'desenho' && !modelos) carregarModelos().then(setModelos).catch(() => setModelos([]));
  }, [aba, modelos]);

  /*
   * O campo escondido vai VAZIO para a TV, e o texto dele fica em
   * `guardados` (revisão do consultor no #240): a TV com o JS antigo no cache
   * não conhece `ocultos` e mostraria o texto — ou o exemplo do desenho, se o
   * campo não viesse. Vazio, ela não mostra nada.
   */
  const atual = useMemo(() => {
    const { ocultos: _o, guardados: _g, creditos: _c, ...resto } = item; // eslint-disable-line no-unused-vars
    const doDesenho = { html: desenho.html, css: desenho.css, origem: { ...(item.origem || {}), ...(desenho.base ? { base: desenho.base } : {}) } };
    const gravados = { ...campos };
    const guardados = {};
    ocultos.forEach((n) => { if (gravados[n]) guardados[n] = gravados[n]; gravados[n] = ''; });
    // Só o crédito de foto que continua na peça (e visível).
    const vivos = Object.fromEntries(Object.entries(creditos).filter(([n]) => gravados[n]));
    return { ...resto, ...doDesenho, campos: gravados, modo, marca, ...(ocultos.length ? { ocultos } : {}), ...(Object.keys(guardados).length ? { guardados } : {}), ...(Object.keys(vivos).length ? { creditos: vivos } : {}) };
  }, [item, desenho, campos, modo, marca, ocultos, creditos]);

  // Confere meio segundo depois da última mudança (nos três formatos, ou no lugar da peça).
  useEffect(() => {
    let vivo = true;
    setConferencia(null);
    const t = setTimeout(() => {
      conferirNosFormatos(atual, lugar ? { [lugar.nome]: lugar.tamanho } : undefined).then((r) => { if (vivo) setConferencia(r); }).catch(() => {});
    }, 500);
    return () => { vivo = false; clearTimeout(t); };
  }, [atual]);

  const problemas = avisosDaConferencia(conferencia);

  async function pedirIA(t) {
    const frase = String(t == null ? pedido : t).trim();
    if (!frase || pedindo) return;
    const antes = { campos, modo, marca, ocultos };
    setPedindo(true);
    try {
      const r = await ai.ajustarPeca(atual, frase, historicoIA);
      if (r && r.pergunta) { setHistoricoIA((h) => comPergunta(h, frase, r)); setRespostaIA(null); setPedido(''); return; }
      setHistoricoIA([]);
      const m = (r && r.remendo) || {};
      if (m.campos) setCampos((c) => ({ ...c, ...m.campos }));
      if (m.modo) setModo(m.modo);
      if (m.marca) setMarca({ ...marcaBase(), ...m.marca });
      if (m.ocultos) setOcultos(m.ocultos);
      const mudou = !!(r && r.mudou && r.mudou.length);
      setRespostaIA({ texto: (r && r.resposta) || '', antes: mudou ? antes : null });
      if (mudou) setPedido('');
    } catch (e) {
      setRespostaIA({ texto: e.message || 'A IA não respondeu agora. Tente de novo.', antes: null });
    } finally { setPedindo(false); }
  }
  function desfazerIA() {
    const a = respostaIA && respostaIA.antes;
    if (!a) return;
    setCampos(a.campos); setModo(a.modo); setMarca(a.marca); setOcultos(a.ocultos);
    setRespostaIA(null);
  }

  async function salvar() {
    if (problemas.length && !(await confirmar({ titulo: 'O texto não cabe em todos os formatos', texto: problemas.slice(0, 4).join('\n'), botao: 'Salvar assim mesmo' }))) return;
    setSalvando(true);
    // A falha vinha de quem chamou (Resultado, Meus Designs) e ninguém mostrava (D3).
    try { await onSalvar(atual); }
    catch (e) { aviso.erro('peca', 'Não salvou: ' + (e.message || 'falha de conexão') + '. A edição continua aberta.'); }
    finally { setSalvando(false); }
  }

  /*
   * Cor e fonte mexem na marca DA PEÇA. Sem marca nenhuma (peça antiga),
   * parte da marca da conta; a porta só aceita marca com cor.
   */
  const marcaBase = () => marca || (daConta && daConta.marca) || { cores: ['#1b2a4a', '#c8a96e'], fonteTitulo: '', fonteApoio: '' };
  const trocarCores = (cores) => setMarca({ ...marcaBase(), cores: cores.filter(corValida).slice(0, 3) });
  const trocarCor = (i, c) => { const atuais = marcaBase().cores.slice(); atuais[i] = c; trocarCores(atuais); };
  const trocarFonte = (qual, id) => setMarca({ ...marcaBase(), [qual]: id });

  /*
   * Outro desenho: os textos que casam pelo nome vão junto; o que o desenho
   * novo não tem fica guardado só até salvar (a porta recusaria campo que a
   * peça não declara). O nome da empresa entra onde o desenho novo escreve
   * a marca.
   */
  const nomesDo = (m) => new Set(window.MTPecaHtml ? window.MTPecaHtml.higienizar(m.arq).campos.map((c) => c.nome) : []);
  function camposPara(nomes) {
    const novo = Object.fromEntries(Object.entries(efetivos).filter(([k]) => nomes.has(k)));
    if (nomes.has('marca') && !novo.marca && daConta && daConta.nome) novo.marca = daConta.nome;
    return novo;
  }
  function trocarDesenho(m) {
    const nomes = nomesDo(m);
    setCampos(camposPara(nomes));
    setOcultos((o) => o.filter((n) => nomes.has(n)));
    setDesenho({ html: m.arq.html, css: m.arq.css, base: m.id });
  }

  const textos = (definicao || []).filter((c) => c.tipo === 'texto' || c.tipo === 'qr');
  const fotos = (definicao || []).filter((c) => c.tipo === 'img');
  // O que a peça MOSTRA hoje: o texto digitado ou, sem ele, o do exemplo. É isso que vai para o outro desenho.
  // (O nome da empresa de exemplo não vai: no desenho novo entra o da conta.)
  const efetivos = useMemo(() => ({ ...Object.fromEntries(textos.filter((c) => c.nome !== 'marca').map((c) => [c.nome, c.exemplo])), ...campos }), [definicao, campos]); // eslint-disable-line react-hooks/exhaustive-deps
  const visiveis = textos.filter((c) => !ocultos.includes(c.nome));

  // Os desenhos que cabem no mesmo lugar: primeiro os da mesma família.
  const papel = item.papel || 'destaque';
  const familia = ((modelos || []).find((m) => m.id === desenho.base) || {}).familia || '';
  // As miniaturas só se refazem quando a peça muda (e não a cada clique na aba).
  const outros = useMemo(() => (modelos || []).filter((m) => m.id !== desenho.base && (m.papeis || []).includes(papel))
    .sort((a, b) => Number(b.familia === familia) - Number(a.familia === familia)).slice(0, 9)
    .map((m) => {
      const nomes = nomesDo(m);
      return { m, item: { ...atual, html: m.arq.html, css: m.arq.css, campos: camposPara(nomes), ocultos: ocultos.filter((n) => nomes.has(n)) } };
    }), [modelos, desenho.base, papel, familia, atual, efetivos, daConta]); // eslint-disable-line react-hooks/exhaustive-deps

  const cores = marcaBase().cores;
  const pill = (ativo) => 'rounded-md border px-2.5 py-1 text-xs ' + (ativo ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-ink-3');
  const Bolinhas = ({ lista }) => <span className="flex">{lista.slice(0, 2).map((c) => <span key={c} className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: c }} />)}</span>;

  return (
    <Dialog open onClose={onFechar} className="max-w-4xl" title={'Editar · ' + (label || 'peça')}
      description={lugar ? 'Troque textos, cores, fonte, o que aparece e o desenho. A peça é conferida no tamanho dela na TV (' + lugar.nome.toLowerCase() + ').'
        : 'Troque textos, cores, fonte, o que aparece e o desenho. A peça é conferida na TV deitada, em pé e na quadrada.'}
      footer={<>
        <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button variant="primary" icon={Check} disabled={salvando || !definicao} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
      </>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <PecaHtml item={atual} formato={item.formato || '16/9'} tamanho={lugar && lugar.tamanho} />
          {conferencia == null
            ? <p className="text-2xs text-ink-3">{lugar ? 'Conferindo…' : 'Conferindo nos três formatos…'}</p>
            : problemas.length
              ? (
                <div className="rounded-lg border border-warn/40 bg-warn/10 p-2 text-2xs leading-relaxed text-ink">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} /> Não cabe</div>
                  {problemas.slice(0, 6).map((p, i) => <div key={i}>{p}</div>)}
                  <div className="mt-1 text-ink-3">Encurte o texto (ou troque a fonte) até o aviso sumir.</div>
                </div>
              )
              : <p className="flex items-center gap-1.5 text-2xs text-ok"><Check size={13} /> {lugar ? 'Cabe no lugar dela na TV (' + lugar.nome.toLowerCase() + ').' : 'Cabe na TV deitada, em pé e na quadrada.'}</p>}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-lg border border-accent/30 bg-accent-soft/40 p-2">
            <MiniConversa historico={historicoIA} onResponder={pedirIA} ocupado={pedindo} className="mb-2" />
            <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); if (pedido.trim() && !pedindo) pedirIA(); }}>
              <Sparkles size={15} className="shrink-0 text-accent" />
              <input value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={300} aria-label="Pedir à IA"
                placeholder={'Peça à IA: "deixa vermelho", "tira o preço"…'}
                className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none" />
              <Button size="sm" variant="primary" type="submit" disabled={!pedido.trim() || pedindo}>{pedindo ? 'Pedindo…' : 'Pedir'}</Button>
            </form>
            {respostaIA && (
              <p className="mt-1.5 text-2xs leading-relaxed text-ink-2">
                {respostaIA.texto}
                {respostaIA.antes && <button type="button" onClick={desfazerIA} className="ml-1.5 font-semibold text-accent hover:underline">Desfazer</button>}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface-2 p-1" role="tablist" aria-label="O que editar">
            {ABAS.map(([id, nome]) => (
              <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
                className={'whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition ' + (aba === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>{nome}</button>
            ))}
          </div>
          {!definicao && <p className="text-xs text-ink-3">Lendo a peça…</p>}

          {aba === 'textos' && <>
            {textos.map((c) => {
              const valor = campos[c.nome] != null ? campos[c.nome] : c.exemplo;
              // O texto com que a peça CHEGOU também conta: a reserva preenchida já vem com título maior que o do exemplo.
              const inicial = (item.campos || {})[c.nome];
              const max = c.tipo === 'qr' ? 300 : limite(String(inicial || '').length > String(c.exemplo || '').length ? inicial : c.exemplo);
              const escondido = ocultos.includes(c.nome);
              return (
                <Field key={c.nome} label={rotulo(c.nome) + (escondido ? ' (escondido)' : '')} hint={c.tipo === 'qr' ? 'O endereço que o QR abre.' : String(valor || '').length + ' de ' + max}>
                  <Input value={valor || ''} maxLength={max} disabled={escondido} onChange={(e) => setCampos((x) => ({ ...x, [c.nome]: e.target.value }))} />
                </Field>
              );
            })}
            {fotos.map((c) => (
              <div key={c.nome}>
                <span className="mb-1.5 block text-xs font-medium text-ink-2">{c.nome === 'foto' ? 'Foto' : rotulo(c.nome)}</span>
                <div className="flex items-center gap-2">
                  {campos[c.nome] && <img src={campos[c.nome]} alt="" className="h-12 w-12 rounded-md border border-line object-cover" />}
                  <Button size="sm" variant="secondary" onClick={() => setFotoAberta(fotoAberta === c.nome ? null : c.nome)}>
                    {campos[c.nome] ? 'Trocar foto' : 'Escolher foto'}
                  </Button>
                </div>
                {fotoAberta === c.nome && (
                  <FotoDoProduto incluirIa aviso="Escolha uma foto das suas Mídias ou envie outra." botao="Enviar foto"
                    onFechar={() => setFotoAberta(null)}
                    onEscolher={(url, extra) => {
                      setCampos((x) => ({ ...x, [c.nome]: url }));
                      setCreditos((x) => { const n = { ...x }; if (extra && extra.credito) n[c.nome] = extra.credito; else delete n[c.nome]; return n; });
                      setFotoAberta(null);
                    }} />
                )}
                {creditos[c.nome] && campos[c.nome] && (
                  <p className="mt-1 text-2xs text-ink-3">{creditos[c.nome]} — aparece pequeno no canto da TV.</p>
                )}
              </div>
            ))}
          </>}

          {aba === 'visual' && <>
            <div>
              <span className="mb-1.5 block text-xs font-medium text-ink-2">Estilo</span>
              <div className="flex flex-wrap gap-1.5">
                {ESTILOS.map((e) => (
                  <button key={e.id} type="button" onClick={() => setModo(e.id)} aria-pressed={modo === e.id} className={pill(modo === e.id)}>{e.nome}</button>
                ))}
              </div>
            </div>
            {marcas.length > 1 && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-ink-2">Marca</span>
                <div className="flex flex-wrap gap-1.5">
                  {marcas.map((m) => {
                    const nova = marcaDaPeca(m);
                    const ativa = mesmaMarca(marca, nova);
                    return (
                      <button key={m.id} type="button" onClick={() => setMarca(nova)} aria-pressed={ativa} className={'flex items-center gap-1.5 ' + pill(ativa)}>
                        <Bolinhas lista={m.cores} /> {m.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <span className="mb-1.5 block text-xs font-medium text-ink-2">Cores</span>
              <div className="flex flex-wrap gap-1.5">
                {daConta && daConta.marca && (
                  <button type="button" onClick={() => trocarCores(daConta.marca.cores)} aria-pressed={JSON.stringify(cores) === JSON.stringify(daConta.marca.cores)}
                    className={'flex items-center gap-1.5 ' + pill(JSON.stringify(cores) === JSON.stringify(daConta.marca.cores))}>
                    <Bolinhas lista={daConta.marca.cores} /> Da marca
                  </button>
                )}
                {SUGERIDAS.map((p) => {
                  const ativa = JSON.stringify(cores) === JSON.stringify(p.cores);
                  return (
                    <button key={p.nome + p.cores[0]} type="button" title={p.porque} onClick={() => trocarCores(p.cores)} aria-pressed={ativa} className={'flex items-center gap-1.5 ' + pill(ativa)}>
                      <Bolinhas lista={p.cores} /> {p.nome}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-2">
                {['Principal', 'Destaque'].map((nome, i) => (
                  <label key={nome} className="flex items-center gap-1.5">
                    <input type="color" value={corValida(cores[i]) ? cores[i] : '#888888'} onChange={(e) => trocarCor(i, e.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5" aria-label={'Cor ' + nome.toLowerCase()} />
                    {nome}
                  </label>
                ))}
              </div>
            </div>
            {familias.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {[['fonteTitulo', 'Fonte dos títulos'], ['fonteApoio', 'Fonte dos textos']].map(([qual, nome]) => (
                  <label key={qual} className="block text-xs font-medium text-ink-2">
                    {nome}
                    <select value={marcaBase()[qual] || ''} onChange={(e) => trocarFonte(qual, e.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
                      <option value="">A da marca</option>
                      {familias.map((f) => <option key={f.id} value={f.id}>{f.nome} — {f.papel}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </>}

          {aba === 'elementos' && (
            <div className="space-y-1.5">
              <p className="text-xs text-ink-3">Esconda o que não quer na TV. O desenho continua o mesmo.</p>
              {textos.map((c) => {
                const mostra = !ocultos.includes(c.nome);
                const ultimo = mostra && visiveis.length <= 1;
                return (
                  <label key={c.nome} className={'flex items-center justify-between gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm ' + (mostra ? 'text-ink' : 'text-ink-3')}>
                    <span className="min-w-0 truncate">{rotulo(c.nome)}<span className="ml-1.5 text-2xs text-ink-3">{String(campos[c.nome] != null ? campos[c.nome] : c.exemplo || '').slice(0, 30)}</span></span>
                    <input type="checkbox" checked={mostra} disabled={ultimo} aria-label={(mostra ? 'Esconder ' : 'Mostrar ') + rotulo(c.nome)}
                      onChange={() => setOcultos((o) => (mostra ? o.concat(c.nome) : o.filter((n) => n !== c.nome)))} />
                  </label>
                );
              })}
            </div>
          )}

          {aba === 'desenho' && (
            <div className="space-y-2">
              <p className="text-xs text-ink-3">O mesmo recado em outro desenho. Os textos que combinam vão junto; confira em Textos depois de trocar.</p>
              {!modelos ? <p className="text-xs text-ink-3">Carregando os desenhos…</p> : !outros.length ? <p className="text-xs text-ink-3">Não há outro desenho para este lugar.</p> : (
                <div className="grid grid-cols-2 gap-2">
                  {outros.map(({ m, item: daqui }) => (
                    <button key={m.id} type="button" onClick={() => trocarDesenho(m)} className="rounded-lg border border-line p-1.5 text-left transition hover:border-accent">
                      <PecaHtml item={daqui} formato={item.formato || '16/9'} tamanho={lugar && lugar.tamanho} />
                      <span className="mt-1 block truncate text-2xs text-ink-2">{m.nome}{m.familia === familia ? '' : ' · ' + m.familia}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
