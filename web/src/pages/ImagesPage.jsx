import React, { useState } from 'react';
import { ImagePlus, Download, Copy, Save, Sparkles } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx';
import { EmptyState } from '../components/ui/Feedback.jsx';
import { ai, library } from '../api.js';

const FORMATOS = [
  { v: '16/9', label: 'TV paisagem (16:9)' },
  { v: '9/16', label: 'TV retrato (9:16)' },
  { v: '1/1', label: 'Quadrado (1:1)' },
  { v: '21/9', label: 'Banner (21:9)' },
];
const ESTILOS = ['fotográfico', 'ilustração', '3D', 'flat/vetorial', 'minimalista', 'vibrante'];

export function ImagesPage() {
  const [prompt, setPrompt] = useState('');
  const [formato, setFormato] = useState('16/9');
  const [estilo, setEstilo] = useState('fotográfico');
  const [brand, setBrand] = useState('#1e3a8a');
  const [brand2, setBrand2] = useState('#0ea5e9');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [imgs, setImgs] = useState([]); // { url, formato }

  async function gerar() {
    if (!prompt.trim()) return;
    setBusy(true); setMsg('');
    try {
      const out = await ai.image({ prompt, formato, estilo, brand, brand2 });
      setImgs((a) => [{ url: out.url, formato: out.formato || formato }, ...a]);
    } catch (e) { setMsg(e.message || 'Falha ao gerar'); }
    setBusy(false);
  }

  async function copiar(url) {
    try { await navigator.clipboard.writeText(url); setMsg('URL copiada.'); }
    catch (e) { setMsg(url); }
  }

  async function salvar(img) {
    setBusy(true); setMsg('');
    try {
      const item = { type: 'composicao', formato: img.formato, duracao: 12, bg: { kind: 'imagem', src: img.url }, elementos: [] };
      await library.save('Imagens IA', [{ formato: img.formato, label: 'Imagem IA', item }]);
      setMsg('Salva na biblioteca (Campanhas).');
    } catch (e) { setMsg(e.message || 'Falha ao salvar'); }
    setBusy(false);
  }

  return (
    <div>
      <PageHeader title="Imagens IA" subtitle="Descreva a imagem e a IA gera (Gemini). Baixe, reutilize no Estúdio ou salve na biblioteca." />

      <Panel className="mb-4">
        <PanelHeader title="Gerar imagem" description="Sem chave de IA, gera um placeholder com suas cores (modo demonstração)." />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <Field label="Descrição da imagem">
              <Textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex.: xícara de café fumegante sobre balcão de madeira, luz quente da manhã, fundo desfocado." />
            </Field>
          </div>
          <Field label="Formato">
            <Select value={formato} onChange={(e) => setFormato(e.target.value)}>
              {FORMATOS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
            </Select>
          </Field>
          <Field label="Estilo">
            <Select value={estilo} onChange={(e) => setEstilo(e.target.value)}>
              {ESTILOS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cor primária"><input type="color" value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" /></Field>
            <Field label="Cor secundária"><input type="color" value={brand2} onChange={(e) => setBrand2(e.target.value)} className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" /></Field>
          </div>
          <div className="md:col-span-3">
            <Button variant="primary" icon={ImagePlus} disabled={busy || !prompt.trim()} onClick={gerar}>{busy ? 'Gerando…' : 'Gerar imagem'}</Button>
          </div>
        </div>
        {msg && <div className="mx-4 mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}
      </Panel>

      <Panel>
        <PanelHeader title="Geradas nesta sessão" description={imgs.length ? `${imgs.length} imagem(ns)` : undefined} />
        {imgs.length === 0 ? (
          <EmptyState icon={Sparkles} title="Nenhuma imagem ainda" description="Descreva acima e clique em Gerar imagem." />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {imgs.map((img, i) => (
              <div key={i} className="space-y-2">
                <div className="overflow-hidden rounded-md border border-line" style={{ aspectRatio: img.formato.replace('/', ' / ') }}>
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="flex flex-wrap gap-1.5 text-2xs">
                  <a href={img.url} download className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-ink-2 hover:bg-surface-2"><Download size={12} /> Baixar</a>
                  <button className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-ink-2 hover:bg-surface-2" onClick={() => copiar(img.url)}><Copy size={12} /> Copiar URL</button>
                  <button className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-ink-2 hover:bg-surface-2" disabled={busy} onClick={() => salvar(img)}><Save size={12} /> Biblioteca</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
