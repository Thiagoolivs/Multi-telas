import React, { useState, useEffect, useRef } from 'react';
import { confirmar, perguntar } from '../lib/confirmar.js';
import { Palette, Sparkles, Trash2, Check, Plus, Info, Brain, Building2, X, Globe, Search, ChevronDown, Images, UploadCloud, CloudOff, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { brand, media } from '../api.js';
import { aviso } from '../lib/avisos.js';
import { lerJornada } from '../lib/jornada.js';
import { ProximoPasso } from '../components/layout/ProximoPasso.jsx';
import { PaletasSugeridas } from '../components/content/PaletasSugeridas.jsx';
import { usePerfil } from '../lib/perfil.js';
import { cn } from '../lib/cn.js';

const FONTES = [
  { id: '', label: 'A IA escolhe' },
  { id: 'display', label: 'Display — condensada pesada (cartaz)' },
  { id: 'condensada', label: 'Condensada — títulos com nuance' },
  { id: 'serifada', label: 'Serifada — elegante' },
  { id: 'script', label: 'Manuscrita — assinatura' },
  { id: 'sans', label: 'Sans — leitura' },
];
const DIRECOES = [
  { id: '', label: 'A IA escolhe pelo briefing' },
  { id: 'chapado', label: 'Chapado — cor da marca em cheio' },
  { id: 'cartaz', label: 'Cartaz — foto e título gigante' },
  { id: 'contraste', label: 'Alto contraste — fundo escuro' },
  { id: 'suave', label: 'Suave — degradê discreto' },
];
// O tom em um toque: o campo continua livre.
const TONS = ['acolhedor', 'direto', 'sofisticado', 'divertido', 'técnico'];

const LOCAL_VAZIO = { endereco: '', bairro: '', cidade: '', link: '' };

// Um bloco da ficha: título e texto ou lista.
function Ficha({ titulo, texto, itens }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/50 p-3">
      <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">{titulo}</div>
      {texto && <div className="text-xs leading-snug text-ink-2">{texto}</div>}
      {itens && (
        <ul className="space-y-0.5 text-xs leading-snug text-ink-2">
          {itens.map((i) => <li key={i}>· {i}</li>)}
        </ul>
      )}
    </div>
  );
}

/*
 * A MARCA (EXECUTOR D6).
 *
 * Era uma página longa com a ordem do banco de dados: marcas, cores, site,
 * endereço, tipografia, um botão "Salvar identidade" no meio, a memória, e
 * só no fim a logo e as "Imagens base". O dono: logo primeiro, depois cores,
 * nome e tom, site, e o avançado (fontes, direção, várias marcas) fechado.
 * Tudo salva sozinho — sem botão que a pessoa esquece de apertar.
 *
 * As "Imagens base" saíram daqui: são fotos, e moram em Mídias › Fotos com a
 * etiqueta "da marca". Aqui fica só o resumo e o caminho.
 */
export function BrandPage({ onIr }) {
  const perfil = usePerfil();
  const { data, loading, reload } = useAsync(brand.get);
  const kit = (data && data.kit) || {};
  const assets = (data && data.assets) || [];
  const mem = (data && data.memoria) || null;
  const marcas = (data && data.marcas) || [];
  const limiteMarcas = (data && data.limiteMarcas) || 3;
  const logo = assets.find((a) => a.kind === 'logo');
  const fotos = assets.filter((a) => a.kind === 'base');
  const referencias = assets.filter((a) => a.kind === 'referencia');

  const [cores, setCores] = useState(['#1e3a8a', '#0ea5e9']);
  const [fonteTitulo, setFonteTitulo] = useState('');
  const [fonteApoio, setFonteApoio] = useState('');
  const [direcao, setDirecao] = useState('');
  const [tom, setTom] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [nome, setNome] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [local, setLocal] = useState(LOCAL_VAZIO);
  const [lendoSite, setLendoSite] = useState(false);
  /*
   * Erro PRÓPRIO do painel do site.
   *
   * Usar o `err` geral punha a recusa longe, num painel que não tem nada a
   * ver. Quem clicasse em "Ler o site" via o botão voltar ao normal e mais
   * nada.
   */
  const [errSite, setErrSite] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [avancado, setAvancado] = useState(false);
  // '' | 'esperando' | 'salvando' | 'salvo' | 'erro'
  const [gravacao, setGravacao] = useState('');

  /* ---------------- Salvar sozinho ---------------- */

  // O que a página edita e salva sozinha. As cores têm botão próprio (aplicar).
  const campos = { nome, fonteTitulo, fonteApoio, direcao, tom, observacoes, local };
  const comoEsta = JSON.stringify(campos);
  const salvo = useRef(null);      // o JSON do que está no servidor; null = ainda carregando
  const espera = useRef(null);
  const atual = useRef({ campos, cores: kit.cores });
  atual.current = { campos, cores: kit.cores };

  useEffect(() => {
    if (!data) return;
    const inicial = {
      nome: kit.nome || '', fonteTitulo: kit.fonteTitulo || '', fonteApoio: kit.fonteApoio || '',
      direcao: kit.direcao || '', tom: kit.tom || '', observacoes: kit.observacoes || '',
      local: Object.assign({}, LOCAL_VAZIO, kit.local || {}),
    };
    setCores(kit.cores && kit.cores.length ? kit.cores : ['#1e3a8a', '#0ea5e9']);
    setFonteTitulo(inicial.fonteTitulo); setFonteApoio(inicial.fonteApoio); setDirecao(inicial.direcao);
    setTom(inicial.tom); setObservacoes(inicial.observacoes); setNome(inicial.nome);
    setLocal(inicial.local);
    setSiteUrl(kit.site || '');
    salvo.current = JSON.stringify(inicial);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Grava o que está na tela, se mudou. Também é chamada ANTES de trocar de
   * marca: o servidor salva sempre a marca ATIVA, e uma gravação atrasada
   * depois da troca poria o texto de uma marca na outra.
   */
  async function salvarAgora() {
    clearTimeout(espera.current);
    const { campos: c, cores: k } = atual.current;
    const json = JSON.stringify(c);
    if (salvo.current === null || json === salvo.current) return true;
    setGravacao('salvando'); setErr('');
    try {
      await brand.save({ ...c, cores: k && k.length ? k : cores });
      salvo.current = json;
      setGravacao('salvo');
      conferirJornada();
      return true;
    } catch (e) {
      setGravacao('erro'); setErr(e.message || 'Não foi possível salvar.');
      return false;
    }
  }

  useEffect(() => {
    if (salvo.current === null || comoEsta === salvo.current) return;
    setGravacao('esperando');
    clearTimeout(espera.current);
    espera.current = setTimeout(salvarAgora, 900);
  }, [comoEsta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saiu da página com algo por gravar: grava (sem esperar resposta).
  useEffect(() => () => {
    clearTimeout(espera.current);
    const { campos: c, cores: k } = atual.current;
    if (salvo.current !== null && JSON.stringify(c) !== salvo.current) brand.save({ ...c, cores: k }).catch(() => {});
  }, []);

  /*
   * Conta nova, marca feita agora e ainda sem peça: a página diz que o
   * próximo passo é a primeira peça (lib/jornada.js, PLANO §5.3).
   */
  const [proximo, setProximo] = useState(false);
  const conferirJornada = () => lerJornada().then((j) => setProximo(j.marca && !j.peca)).catch(() => {});

  /*
   * Aplicar uma paleta é UM toque: salva na hora, com o resto da identidade
   * como está na tela. Pedir "agora clique em Salvar" depois de escolher é
   * o tipo de passo que a pessoa esquece — e sai achando que trocou.
   */
  async function aplicarPaleta(nova) {
    setCores(nova);
    setBusy(true); setErr('');
    try {
      clearTimeout(espera.current);
      await brand.save({ ...campos, cores: nova });
      salvo.current = comoEsta;
      aviso.ok('Paleta aplicada. As próximas peças e a TV já usam estas cores.');
      reload();
      conferirJornada();
    } catch (e) { setErr(e.message || 'Não foi possível aplicar a paleta.'); }
    finally { setBusy(false); }
  }

  async function subir(kind, e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const up = await media.upload(f);
      await brand.addAsset(kind, up.url, f.name.slice(0, 40));
      if (kind === 'logo') aviso.ok('Logo salva. As próximas peças já saem com ela.');
      reload();
      conferirJornada();
    } catch (e2) { setErr(e2.message || 'Falha ao enviar.'); }
    finally { setBusy(false); }
  }

  async function esquecer() {
    if (!(await confirmar({ titulo: 'Apagar o que a IA aprendeu?', texto: 'As próximas criações voltam a começar do zero.', botao: 'Apagar', perigo: true }))) return;
    setBusy(true);
    try { await brand.esquecer(); reload(); aviso.ok('Memória apagada.'); }
    catch (e) { setErr(e.message || 'Não foi possível apagar.'); }
    finally { setBusy(false); }
  }

  async function apagar(a, oQue) {
    if (oQue && !(await confirmar({ titulo: 'Tirar ' + oQue + '?', texto: 'O arquivo continua em Mídias.', botao: 'Tirar' }))) return;
    setBusy(true);
    try { await brand.removeAsset(a.id); reload(); }
    catch (e) { setErr(e.message || 'Não deu para tirar a imagem.'); }
    finally { setBusy(false); }
  }

  /*
   * Ler o site do cliente.
   *
   * É o caminho mais curto entre "tenho uma marca" e "a IA sabe como ela é":
   * em vez de descrever a identidade em palavras ("azul meio escuro, fonte
   * moderna"), a pessoa cola o endereço e o sistema lê de lá as cores, as
   * fontes e a imagem que o próprio site publica como sua cara.
   */
  async function lerSite() {
    const alvo = siteUrl.trim();
    if (!alvo || !kit.id) return;
    setLendoSite(true); setErrSite('');
    try {
      if (!(await salvarAgora())) return;
      const r = await brand.lerSite(kit.id, alvo);
      const achou = [];
      if ((r.lido.cores || []).length) achou.push(r.lido.cores.length + ' cor(es)');
      if ((r.lido.fontes || []).length) achou.push(r.lido.fontes.length + ' fonte(s)');
      if (r.lido.imagem) achou.push('a imagem do site');
      aviso.ok(achou.length
        ? 'Li o site: ' + achou.join(', ') + '. A IA já usa isso.'
        : 'Li o site, mas não achei pistas de estilo nele.');
      reload();
      conferirJornada();
    } catch (e) { setErrSite(e.message || 'Não consegui ler esse site.'); }
    finally { setLendoSite(false); }
  }

  /* ---------------- Marcas ---------------- */

  async function trocarMarca(id) {
    if (id === kit.id) return;
    setBusy(true); setErr('');
    try {
      if (!(await salvarAgora())) return;
      salvo.current = null;
      await brand.ativarMarca(id);
      reload();
    } catch (e) { setErr(e.message || 'Não foi possível trocar de marca.'); }
    finally { setBusy(false); }
  }

  async function novaMarca() {
    const n = await perguntar({ titulo: 'Marca nova', rotulo: 'Nome da marca', placeholder: 'Ex.: o nome do cliente', botao: 'Criar marca' });
    if (n === null) return;
    if (!n.trim()) return;
    setBusy(true); setErr('');
    try {
      if (!(await salvarAgora())) return;
      salvo.current = null;
      const m = await brand.criarMarca(n.trim());
      aviso.ok('Marca “' + m.nome + '” criada e selecionada.');
      reload();
    } catch (e) { setErr(e.message || 'Não foi possível criar.'); }
    finally { setBusy(false); }
  }

  async function apagarMarca(m) {
    // O que some junto precisa estar dito ANTES: cores, fontes e regras da
    // marca vão com ela, e não há como trazer de volta.
    if (!(await confirmar({ titulo: 'Apagar a marca “' + m.nome + '”?', texto: 'Cores, fontes, regras e imagens dela somem junto. Os designs já salvos ficam.', botao: 'Apagar a marca', perigo: true }))) return;
    setBusy(true); setErr('');
    try { await brand.removerMarca(m.id); reload(); }
    catch (e) { setErr(e.message || 'Não foi possível apagar.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-10 text-center"><Spinner size={22} /></div>;

  const status = gravacao === 'salvando' || gravacao === 'esperando'
    ? <span className="flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={12} /> Salvando…</span>
    : gravacao === 'erro'
      ? <button type="button" onClick={salvarAgora} className="flex items-center gap-1.5 text-xs font-medium text-danger hover:underline"><CloudOff size={13} /> Não salvou · tentar de novo</button>
      : gravacao === 'salvo'
        ? <span className="flex items-center gap-1.5 text-xs text-ok"><Check size={13} /> Salvo</span>
        : <span className="text-xs text-ink-3">Tudo aqui salva sozinho</span>;

  const seletorDeMarcas = (
    <div className="flex flex-wrap gap-2">
      {marcas.map((m) => {
        const escolhida = m.id === kit.id;
        return (
          <div key={m.id}
            className={'flex items-center gap-2 rounded-lg border px-3 py-2 transition '
              + (escolhida ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}>
            <button type="button" onClick={() => trocarMarca(m.id)} aria-pressed={escolhida} disabled={busy}
              className="flex items-center gap-2 text-sm">
              <Building2 size={14} className={escolhida ? 'text-accent' : 'text-ink-3'} />
              <span className={escolhida ? 'font-semibold text-accent' : 'text-ink-2'}>{m.nome}</span>
              <span className="flex gap-0.5">
                {(m.cores || []).slice(0, 3).map((c, i) => (
                  <span key={i} className="h-3 w-3 rounded-full border border-line" style={{ background: c }} />
                ))}
              </span>
            </button>
            {marcas.length > 1 && (
              <button type="button" title={'Apagar ' + m.nome} onClick={() => apagarMarca(m)}
                className="text-ink-3 hover:text-danger"><X size={13} /></button>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Marca"
        subtitle="A identidade da empresa. A IA lê tudo isto antes de criar."
        actions={status} />
      {err && <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{err}</div>}
      {proximo && onIr && (
        <ProximoPasso feito="A IA já usa a sua marca." proximo="criar a primeira peça." acao="Criar a primeira peça" onIr={() => onIr('criar')} />
      )}

      {/*
        Com mais de uma marca, a escolha fica no topo: tudo o resto é dela.
        Quem atende três clientes com o mesmo painel precisa saber, o tempo
        todo, em qual está mexendo. Com uma só, criar outra mora no avançado.
      */}
      {marcas.length > 1 && (
        <Panel>
          <PanelHeader title="Editando a marca" description="A escolhida é a que a IA usa e a que esta página edita." />
          <div className="p-4">{seletorDeMarcas}</div>
        </Panel>
      )}

      {/* 1. A logo, primeiro: é a cara da marca e vai em todas as peças. */}
      <Panel>
        <PanelHeader title="Logo"
          description="Vai no mesmo canto de todas as peças geradas. PNG com fundo transparente fica melhor."
          actions={(
            <label className={cn('flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition',
              logo ? 'border-line bg-surface text-ink-2 hover:bg-surface-2' : 'border-accent bg-accent text-accent-fg hover:opacity-90', busy && 'pointer-events-none opacity-60')}>
              <UploadCloud size={14} /> {logo ? 'Trocar logo' : 'Enviar logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => subir('logo', e)} />
            </label>
          )} />
        {logo ? (
          <div className="flex flex-wrap items-center gap-4 p-4">
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line">
              {/* No claro e no escuro: a logo precisa ler nos dois fundos da TV. */}
              <div className="flex h-24 w-36 items-center justify-center bg-white p-3"><img src={logo.url} alt="Logo no fundo claro" className="max-h-full max-w-full object-contain" /></div>
              <div className="flex h-24 w-36 items-center justify-center bg-[#0b1220] p-3"><img src={logo.url} alt="Logo no fundo escuro" className="max-h-full max-w-full object-contain" /></div>
            </div>
            <button type="button" onClick={() => apagar(logo, 'a logo')} className="flex items-center gap-1 text-xs text-ink-3 hover:text-danger">
              <Trash2 size={12} /> Tirar a logo
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-4 text-sm text-ink-3">
            <Palette size={15} /> Sem logo ainda. Envie a logo para ela aparecer nas peças.
          </div>
        )}
      </Panel>

      {/* 2. As cores: paletas prontas primeiro, cor livre em "avançado". */}
      <PaletasSugeridas kit={kit} ramoDaConta={data && data.ramo} empresa={nome && nome !== 'Marca principal' ? nome : (data && data.empresa)}
        logoUrl={logo && logo.url}
        fonteTitulo={fonteTitulo} fonteApoio={fonteApoio}
        cores={cores} setCores={setCores}
        aplicar={aplicarPaleta} ocupado={busy} />

      {/* 3. Nome e jeito de falar. */}
      <Panel>
        <PanelHeader title="Nome e jeito de falar" description="Como a marca aparece nas peças e como a IA escreve por ela." />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Nome da marca" hint="Aparece nas peças.">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Padaria Aurora" maxLength={60} />
          </Field>
          <Field label="Tom de voz">
            <Input value={tom} onChange={(e) => setTom(e.target.value)} placeholder="acolhedor" maxLength={60} />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {TONS.map((t) => (
                <button key={t} type="button" onClick={() => setTom(t)} aria-pressed={tom === t}
                  className={cn('rounded-full border px-2 py-0.5 text-2xs transition', tom === t ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-3 hover:text-ink-2')}>{t}</button>
              ))}
            </div>
          </Field>
          <div className="md:col-span-2">
            <Field label="Regras da marca" hint="O que a IA deve sempre (ou nunca) fazer. Ex.: “nunca usar vermelho”, “sempre citar o site”.">
              <Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={600}
                placeholder="Escreva as regras que a IA precisa respeitar…" />
            </Field>
          </div>
        </div>
      </Panel>

      {/*
        Onde o lugar fica. As redes usam (item 6 do EXECUTOR): hashtag do
        bairro e da cidade, endereço ou link na mensagem do WhatsApp.
      */}
      <Panel>
        <PanelHeader title={'Onde fica a ' + perfil.lugar} description="Vai para as hashtags do bairro e da cidade e para a mensagem do WhatsApp." />
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Endereço"><Input value={local.endereco} onChange={(e) => setLocal({ ...local, endereco: e.target.value })} placeholder="Rua das Flores, 120" /></Field>
          <Field label="Bairro"><Input value={local.bairro} onChange={(e) => setLocal({ ...local, bairro: e.target.value })} placeholder="Mooca" /></Field>
          <Field label="Cidade"><Input value={local.cidade} onChange={(e) => setLocal({ ...local, cidade: e.target.value })} placeholder="São Paulo" /></Field>
          <Field label="WhatsApp ou site" hint="Ex.: wa.me/5511999990000 ou padaria.com.br"><Input value={local.link} onChange={(e) => setLocal({ ...local, link: e.target.value })} placeholder="wa.me/55…" /></Field>
        </div>
      </Panel>

      {/* 4. O site do cliente como referência. */}
      <Panel>
        <PanelHeader title="Site da marca"
          description="Cole o endereço e a IA lê de lá as cores, as fontes e a imagem que o site publica como sua cara." />
        <div className="p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1">
              <Field label="Endereço do site" hint="Pode digitar só “padaria.com.br”.">
                <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') lerSite(); }}
                  placeholder="padaria.com.br" />
              </Field>
            </div>
            <Button variant="secondary" icon={Search} disabled={lendoSite || !siteUrl.trim()} onClick={lerSite}>
              {lendoSite ? 'Lendo o site…' : 'Ler o site'}
            </Button>
          </div>

          {errSite && <p className="mt-2 text-sm text-danger">{errSite}</p>}

          {/*
            Mostrar o que foi lido não é enfeite: é o que deixa a pessoa
            conferir se o sistema entendeu a marca dela. Um resumo escondido
            que vai para o prompt sem ninguém ver é o tipo de coisa que faz a
            IA errar e ninguém saber por quê.
          */}
          {kit.siteResumo && (
            <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">
                <Globe size={12} /> O que a IA leu de {kit.site}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-2">{kit.siteResumo}</pre>
            </div>
          )}
        </div>
      </Panel>

      {/* As fotos da empresa moram em Mídias, com a etiqueta "da marca". */}
      <Panel>
        <PanelHeader title="Fotos da empresa"
          description="Ficam em Mídias › Fotos, com a etiqueta “da marca”. A IA usa estas antes de inventar uma imagem."
          actions={onIr && <Button size="sm" variant="secondary" icon={Images} onClick={() => onIr('storage')}>Abrir Fotos</Button>} />
        {fotos.length ? (
          <div className="flex flex-wrap items-center gap-2 p-4">
            {fotos.slice(0, 8).map((a) => (
              <div key={a.id} title={a.label || 'sem descrição'} className="h-14 w-20 overflow-hidden rounded-md border border-line bg-surface-2">
                <img src={a.url} alt={a.label || ''} className="h-full w-full object-cover" />
              </div>
            ))}
            <span className="text-xs text-ink-3">{fotos.length} foto{fotos.length === 1 ? '' : 's'} da marca</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-4 text-sm text-ink-3">
            <Images size={15} className="mt-0.5 shrink-0" />
            Nenhuma ainda. Em Mídias › Fotos, toque em “da marca” nas fotos de produto, da equipe ou do lugar.
          </div>
        )}
      </Panel>

      {/* 5. O avançado, fechado: fontes, direção, referências, várias marcas. */}
      <Panel>
        <button type="button" onClick={() => setAvancado((v) => !v)} aria-expanded={avancado}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-ink-3" />
            <span>
              <span className="block text-sm font-semibold text-ink">Avançado</span>
              <span className="block text-xs text-ink-3">Fontes, direção de arte, referências de estilo e várias marcas.</span>
            </span>
          </span>
          <ChevronDown size={16} className={cn('shrink-0 text-ink-3 transition', avancado && 'rotate-180')} />
        </button>
        {avancado && (
          <div className="space-y-5 border-t border-line p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Fonte dos títulos">
                <Select value={fonteTitulo} onChange={(e) => setFonteTitulo(e.target.value)}>
                  {FONTES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </Select>
              </Field>
              <Field label="Fonte de apoio">
                <Select value={fonteApoio} onChange={(e) => setFonteApoio(e.target.value)}>
                  {FONTES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </Select>
              </Field>
              <Field label="Direção de arte" hint="“A IA escolhe” dá variedade entre campanhas.">
                <Select value={direcao} onChange={(e) => setDirecao(e.target.value)}>
                  {DIRECOES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </Select>
              </Field>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-ink">Referências de estilo</div>
                  <div className="text-2xs text-ink-3">Artes que você gosta. A IA imita a direção (tipografia, cor, composição), não copia o conteúdo.</div>
                </div>
                <label className={cn('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-ink-2 transition hover:bg-surface-2', busy && 'pointer-events-none opacity-60')}>
                  <Plus size={12} /> Enviar
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => subir('referencia', e)} />
                </label>
              </div>
              {referencias.length ? (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {referencias.map((a) => (
                    <div key={a.id} className="group relative h-20 overflow-hidden rounded-md border border-line bg-surface-2">
                      <img src={a.url} alt="" className="h-full w-full object-cover" />
                      <button type="button" title="Tirar" onClick={() => apagar(a)}
                        className="absolute right-1 top-1 rounded bg-ink/60 p-0.5 text-white hover:bg-danger"><X size={11} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-ink-3"><Sparkles size={12} /> Nenhuma ainda.</p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-ink">Várias marcas</div>
                  <div className="text-2xs text-ink-3">Até {limiteMarcas}, para quem cuida de mais de um negócio. A escolhida é a que a IA usa.</div>
                </div>
                {marcas.length < limiteMarcas
                  ? <Button size="sm" variant="secondary" icon={Plus} disabled={busy} onClick={novaMarca}>Nova marca</Button>
                  : <span className="text-2xs text-ink-3">Limite de {limiteMarcas} atingido</span>}
              </div>
              {marcas.length > 0 && seletorDeMarcas}
            </div>
          </div>
        )}
      </Panel>

      {/* O que o sistema aprendeu conversando */}
      <Panel>
        <PanelHeader title="O que a IA aprendeu sobre você"
          description="Sai das conversas do Criar e melhora as próximas campanhas. É dedução do sistema, não o que você declarou acima."
          actions={mem && (
            <button type="button" onClick={esquecer} disabled={busy}
              className="rounded-md border border-line px-2.5 py-1.5 text-2xs text-ink-2 transition hover:bg-surface-2 hover:text-danger">
              Esquecer tudo
            </button>
          )} />
        {!mem ? (
          <div className="flex items-start gap-2 p-4 text-sm text-ink-3">
            <Brain size={15} className="mt-0.5 shrink-0" />
            Nada ainda. Quando você conversa no Criar, o sistema guarda aqui o que descobrir do seu
            negócio — e a próxima criação já começa sabendo.
          </div>
        ) : (
          <div className="grid gap-3 p-4 text-sm sm:grid-cols-2">
            {mem.segmento && <Ficha titulo="Negócio" texto={mem.segmento} />}
            {mem.publico && <Ficha titulo="Cliente dela" texto={mem.publico} />}
            {mem.jeitoDeFalar && <Ficha titulo="Jeito de falar" texto={mem.jeitoDeFalar} />}
            {mem.diferenciais.length > 0 && <Ficha titulo="Diferenciais" itens={mem.diferenciais} />}
            {mem.argumentos.length > 0 && <Ficha titulo="O que costuma convencer" itens={mem.argumentos} />}
            {mem.evitar.length > 0 && <Ficha titulo="Nunca prometer" itens={mem.evitar} />}
            {mem.notas.length > 0 && <div className="sm:col-span-2"><Ficha titulo="Notas" itens={mem.notas} /></div>}
          </div>
        )}
      </Panel>

      <p className="flex items-start gap-1.5 text-2xs leading-snug text-ink-3">
        <Info size={12} className="mt-0.5 shrink-0" />
        As referências não são copiadas: a IA extrai a direção (tipografia, uso de cor, composição) e aplica ao seu conteúdo.
      </p>
    </div>
  );
}
