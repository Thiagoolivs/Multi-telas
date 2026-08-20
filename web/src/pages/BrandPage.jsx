import React, { useState, useEffect } from 'react';
import { Palette, Type, ImageUp, Sparkles, Trash2, Check, Plus, Info, Brain, Building2, X, Globe, Search } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { brand, media } from '../api.js';
import { aviso } from '../lib/avisos.js';

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

// Grupos de imagem da marca, com o texto que explica para que serve cada um.
const GRUPOS = [
  { kind: 'logo', titulo: 'Logo', desc: 'Entra no mesmo canto de todas as peças geradas.', unico: true },
  { kind: 'base', titulo: 'Imagens base', desc: 'Fotos suas (produto, equipe, loja). A IA usa estas antes de inventar uma imagem — descreva cada uma para ela saber quando cabe.' },
  { kind: 'referencia', titulo: 'Referências de estilo', desc: 'Artes que você gosta. A IA olha e imita a direção — não copia o conteúdo.' },
];

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

export function BrandPage() {
  const { data, loading, reload } = useAsync(brand.get);
  const kit = (data && data.kit) || {};
  const assets = (data && data.assets) || [];
  const mem = (data && data.memoria) || null;
  const marcas = (data && data.marcas) || [];
  const limiteMarcas = (data && data.limiteMarcas) || 3;

  const [cores, setCores] = useState(['#1e3a8a', '#0ea5e9']);
  const [fonteTitulo, setFonteTitulo] = useState('');
  const [fonteApoio, setFonteApoio] = useState('');
  const [direcao, setDirecao] = useState('');
  const [tom, setTom] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [nome, setNome] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [lendoSite, setLendoSite] = useState(false);
  /*
   * Erro PRÓPRIO do painel do site.
   *
   * Usar o `err` geral punha a recusa lá embaixo, ao lado de "Salvar
   * identidade" — fora da tela, num painel que não tem nada a ver. Quem
   * clicasse em "Ler o site" via o botão voltar ao normal e mais nada.
   */
  const [errSite, setErrSite] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!data) return;
    setCores(kit.cores && kit.cores.length ? kit.cores : ['#1e3a8a', '#0ea5e9']);
    setFonteTitulo(kit.fonteTitulo || '');
    setFonteApoio(kit.fonteApoio || '');
    setDirecao(kit.direcao || '');
    setTom(kit.tom || '');
    setObservacoes(kit.observacoes || '');
    setNome(kit.nome || '');
    setSiteUrl(kit.site || '');
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    setBusy(true); setMsg(''); setErr('');
    try {
      await brand.save({ nome, cores, fonteTitulo, fonteApoio, direcao, tom, observacoes });
      setMsg('Identidade salva. As próximas gerações já usam.');
      reload();
    } catch (e) { setErr(e.message || 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  async function subir(kind, e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const up = await media.upload(f);
      /*
       * Imagem base sobe SEM rótulo de propósito: "IMG_2843.jpg" não descreve
       * nada e ainda impediria a IA de olhar a foto para descrevê-la sozinha.
       * O usuário escreve depois, se quiser mandar na escolha.
       */
      await brand.addAsset(kind, up.url, kind === 'base' ? '' : f.name.slice(0, 40));
      reload();
    } catch (e2) { setErr(e2.message || 'Falha ao enviar.'); }
    finally { setBusy(false); }
  }

  /*
   * Salva no blur, sem botão. Não recarrega a lista: o valor já está no campo,
   * e um reload aqui só faria o cursor pular enquanto o usuário descreve a
   * próxima foto.
   */
  async function renomear(a, label) {
    const novo = label.trim().slice(0, 160);
    if (novo === (a.label || '')) return;
    try { a.label = novo; await brand.labelAsset(a.id, novo); }
    catch (e) { setErr(e.message || 'Não foi possível salvar a descrição.'); }
  }

  async function esquecer() {
    if (!window.confirm('Apagar tudo que a IA aprendeu sobre a sua empresa? As próximas campanhas voltam a começar do zero.')) return;
    setBusy(true);
    try { await brand.esquecer(); reload(); setMsg('Memória apagada.'); }
    catch (e) { setErr(e.message || 'Não foi possível apagar.'); }
    finally { setBusy(false); }
  }

  async function apagar(id) {
    setBusy(true);
    try { await brand.removeAsset(id); reload(); }
    finally { setBusy(false); }
  }

  const setCor = (i, v) => setCores((c) => c.map((x, j) => (j === i ? v : x)));

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
    setLendoSite(true); setErrSite(''); setMsg('');
    try {
      const r = await brand.lerSite(kit.id, alvo);
      const achou = [];
      if ((r.lido.cores || []).length) achou.push(r.lido.cores.length + ' cor(es)');
      if ((r.lido.fontes || []).length) achou.push(r.lido.fontes.length + ' fonte(s)');
      if (r.lido.imagem) achou.push('a imagem do site');
      aviso.ok(achou.length
        ? 'Li o site: ' + achou.join(', ') + '. A IA já usa isso.'
        : 'Li o site, mas não achei pistas de estilo nele.');
      reload();
    } catch (e) { setErrSite(e.message || 'Não consegui ler esse site.'); }
    finally { setLendoSite(false); }
  }

  /* ---------------- Marcas ---------------- */

  async function trocarMarca(id) {
    if (id === kit.id) return;
    setBusy(true); setErr('');
    try { await brand.ativarMarca(id); reload(); }
    catch (e) { setErr(e.message || 'Não foi possível trocar de marca.'); }
    finally { setBusy(false); }
  }

  async function novaMarca() {
    const n = window.prompt('Nome da marca nova (ex.: o nome do cliente):', '');
    if (n === null) return;
    if (!n.trim()) return;
    setBusy(true); setErr('');
    try {
      const m = await brand.criarMarca(n.trim());
      aviso.ok('Marca “' + m.nome + '” criada e selecionada.');
      reload();
    } catch (e) { setErr(e.message || 'Não foi possível criar.'); }
    finally { setBusy(false); }
  }

  async function apagarMarca(m) {
    // O que some junto precisa estar dito ANTES: cores, fontes e regras da
    // marca vão com ela, e não há como trazer de volta.
    if (!window.confirm('Apagar a marca “' + m.nome + '”? Cores, fontes, regras e imagens dela somem junto. Os designs já salvos ficam.')) return;
    setBusy(true); setErr('');
    try { await brand.removerMarca(m.id); reload(); }
    catch (e) { setErr(e.message || 'Não foi possível apagar.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-10 text-center"><Spinner size={22} /></div>;

  return (
    <div className="space-y-4">
      <PageHeader title="Marca"
        subtitle="A identidade da empresa. A IA lê tudo isto antes de criar — sem ela, reinventa o visual a cada campanha." />

      {/*
        Escolher a marca vem ANTES de tudo o resto na página, porque tudo o
        resto é dela. Quem atende três clientes com o mesmo painel precisa
        saber, o tempo todo, em qual está mexendo — editar as cores do cliente
        errado é o tipo de erro que só aparece na parede dele.
      */}
      {marcas.length > 0 && (
        <Panel>
          <PanelHeader title="Suas marcas"
            description={'Até ' + limiteMarcas + '. A escolhida é a que a IA usa e a que esta página edita.'}
            actions={marcas.length < limiteMarcas
              ? <Button size="sm" variant="secondary" icon={Plus} disabled={busy} onClick={novaMarca}>Nova marca</Button>
              : <span className="text-2xs text-ink-3">Limite de {limiteMarcas} atingido</span>} />
          <div className="flex flex-wrap gap-2 p-4">
            {marcas.map((m) => {
              const escolhida = m.id === kit.id;
              return (
                <div key={m.id}
                  className={'flex items-center gap-2 rounded-lg border px-3 py-2 transition '
                    + (escolhida ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}>
                  <button type="button" onClick={() => trocarMarca(m.id)} aria-pressed={escolhida}
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
        </Panel>
      )}

      {/* Cores */}
      <Panel>
        <PanelHeader title="Cores" description="A primeira é a cor principal; a segunda, o acento. As demais entram como apoio." />
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-44">
            <Field label="Nome da marca">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Padaria Aurora" />
            </Field>
          </div>
          {cores.map((c, i) => (
            <div key={i} className="w-32">
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
      </Panel>

      {/* O site do cliente como referência */}
      <Panel>
        <PanelHeader title="Site da marca"
          description="Cole o endereço e a IA lê de lá as cores, as fontes e a imagem que o site publica como sua cara." />
        <div className="p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem] flex-1">
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

      {/* Tipografia e direção */}
      <Panel>
        <PanelHeader title="Tipografia e direção" description="Deixe em “A IA escolhe” se quiser variedade entre campanhas." />
        <div className="grid gap-4 p-4 md:grid-cols-2">
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
          <Field label="Direção de arte">
            <Select value={direcao} onChange={(e) => setDirecao(e.target.value)}>
              {DIRECOES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </Select>
          </Field>
          <Field label="Tom de voz" hint="Ex.: acolhedor, direto, sofisticado.">
            <Input value={tom} onChange={(e) => setTom(e.target.value)} placeholder="acolhedor" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Regras da marca" hint="O que a IA deve sempre (ou nunca) fazer. Ex.: “nunca usar vermelho”, “sempre citar o site”.">
              <Textarea rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Escreva as regras que a IA precisa respeitar…" />
            </Field>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Button variant="primary" icon={Check} disabled={busy} onClick={salvar}>{busy ? 'Salvando…' : 'Salvar identidade'}</Button>
          {msg && <span className="text-sm text-emerald-500">{msg}</span>}
          {err && <span className="text-sm text-danger">{err}</span>}
        </div>
      </Panel>

      {/* O que o sistema aprendeu conversando */}
      <Panel>
        <PanelHeader title="O que a IA aprendeu sobre você"
          description="Sai das conversas de briefing e melhora as próximas campanhas. É dedução do sistema, não o que você declarou acima."
          actions={mem && (
            <button type="button" onClick={esquecer} disabled={busy}
              className="rounded-md border border-line px-2.5 py-1.5 text-2xs text-ink-2 transition hover:bg-surface-2 hover:text-danger">
              Esquecer tudo
            </button>
          )} />
        {!mem ? (
          <div className="flex items-start gap-2 p-4 text-sm text-ink-3">
            <Brain size={15} className="mt-0.5 shrink-0" />
            Nada ainda. Ao criar uma campanha usando <b className="text-ink-2">Refinar conversando</b>, o
            sistema guarda aqui o que descobrir do seu negócio — e a campanha seguinte já começa sabendo.
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

      {/* Imagens */}
      {GRUPOS.map((g) => {
        const doGrupo = assets.filter((a) => a.kind === g.kind);
        const Icone = g.kind === 'referencia' ? Sparkles : g.kind === 'logo' ? Palette : ImageUp;
        return (
          <Panel key={g.kind}>
            <PanelHeader title={g.titulo} description={g.desc}
              actions={(!g.unico || !doGrupo.length) && (
                <label className="cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink-2 transition hover:bg-surface-2">
                  Enviar imagem
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => subir(g.kind, e)} />
                </label>
              )} />
            {doGrupo.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-sm text-ink-3">
                <Icone size={15} /> Nada enviado ainda.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-6">
                {doGrupo.map((a) => (
                  <div key={a.id} className="space-y-1.5">
                    <div className="flex h-24 items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2">
                      <img src={a.url} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="flex items-center gap-1">
                      {g.kind === 'base' ? (
                        <input
                          defaultValue={a.label}
                          placeholder="descreva a foto"
                          title="O que esta foto mostra. É por aqui que a IA escolhe usá-la."
                          onBlur={(e) => renomear(a, e.target.value)}
                          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-2xs text-ink-2 placeholder:text-ink-3 hover:border-line focus:border-accent focus:outline-none"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-2xs text-ink-3">{a.label}</span>
                      )}
                      <button title="Remover" className="shrink-0 text-ink-3 hover:text-danger" onClick={() => apagar(a.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        );
      })}

      <p className="flex items-start gap-1.5 text-2xs leading-snug text-ink-3">
        <Info size={12} className="mt-0.5 shrink-0" />
        As referências não são copiadas: a IA extrai a direção (tipografia, uso de cor, composição) e aplica ao seu conteúdo.
      </p>
    </div>
  );
}
