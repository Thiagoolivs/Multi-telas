import React, { useState, useEffect } from 'react';
import { Palette, Type, ImageUp, Sparkles, Trash2, Check, Plus, Info } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { brand, media } from '../api.js';

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
  { kind: 'base', titulo: 'Imagens base', desc: 'Fotos suas (produto, equipe, loja) para a IA usar nas peças.' },
  { kind: 'referencia', titulo: 'Referências de estilo', desc: 'Artes que você gosta. A IA olha e imita a direção — não copia o conteúdo.' },
];

export function BrandPage() {
  const { data, loading, reload } = useAsync(brand.get);
  const kit = (data && data.kit) || {};
  const assets = (data && data.assets) || [];

  const [cores, setCores] = useState(['#1e3a8a', '#0ea5e9']);
  const [fonteTitulo, setFonteTitulo] = useState('');
  const [fonteApoio, setFonteApoio] = useState('');
  const [direcao, setDirecao] = useState('');
  const [tom, setTom] = useState('');
  const [observacoes, setObservacoes] = useState('');
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
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar() {
    setBusy(true); setMsg(''); setErr('');
    try {
      await brand.save({ cores, fonteTitulo, fonteApoio, direcao, tom, observacoes });
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
      await brand.addAsset(kind, up.url, f.name.slice(0, 40));
      reload();
    } catch (e2) { setErr(e2.message || 'Falha ao enviar.'); }
    finally { setBusy(false); }
  }

  async function apagar(id) {
    setBusy(true);
    try { await brand.removeAsset(id); reload(); }
    finally { setBusy(false); }
  }

  const setCor = (i, v) => setCores((c) => c.map((x, j) => (j === i ? v : x)));

  if (loading) return <div className="p-10 text-center"><Spinner size={22} /></div>;

  return (
    <div className="space-y-4">
      <PageHeader title="Marca"
        subtitle="A identidade da empresa. A IA lê tudo isto antes de criar — sem ela, reinventa o visual a cada campanha." />

      {/* Cores */}
      <Panel>
        <PanelHeader title="Cores" description="A primeira é a cor principal; a segunda, o acento. As demais entram como apoio." />
        <div className="flex flex-wrap items-end gap-3 p-4">
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
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-2xs text-ink-3">{a.label}</span>
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
