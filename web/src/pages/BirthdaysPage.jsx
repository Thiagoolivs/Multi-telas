import React, { useRef, useState } from 'react';
import { UploadCloud, Trash2, Cake, FileSpreadsheet, ImagePlus, Check } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Skeleton, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { birthdays, media } from '../api.js';

// tira acento + minúsculo, para casar cabeçalhos e nomes de coluna.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// Parser CSV simples: detecta separador (, ou ;), respeita aspas.
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = (text.split(/\r?\n/)[0] || '');
  const sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignora */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}

// Mapeia as colunas da planilha para nome/matrícula/dia/mês/cargo/foto.
function mapRows(matrix) {
  if (!matrix.length) return [];
  const head = matrix[0].map(norm);
  const idx = (names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iNome = idx(['nome']);
  const iMat = idx(['matricula', 'registro', 'cracha', 'id']);
  const iNasc = idx(['nascimento', 'aniversario', 'data']);
  const iDia = idx(['dia']);
  const iMes = idx(['mes']);
  const iCargo = idx(['cargo', 'funcao', 'setor', 'departamento']);
  const iFoto = idx(['foto', 'imagem']);
  const out = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const nome = (row[iNome] || '').trim();
    if (!nome) continue;
    const rec = { nome, matricula: (row[iMat] || '').trim(), cargo: (row[iCargo] || '').trim(), foto: (row[iFoto] || '').trim() };
    if (iNasc >= 0 && row[iNasc]) rec.nascimento = String(row[iNasc]).trim();
    if (iDia >= 0 && row[iDia]) rec.dia = parseInt(row[iDia], 10);
    if (iMes >= 0 && row[iMes]) rec.mes = parseInt(row[iMes], 10);
    out.push(rec);
  }
  return out;
}

// Chave de casamento por matrícula: ignora zeros à esquerda (1023 == 01023).
function keyMat(s) { const t = String(s || '').trim(); return t.replace(/^0+/, '') || t; }

export function BirthdaysPage() {
  const { data, loading, error, reload } = useAsync(birthdays.list);
  const csvRef = useRef(null);
  const photoRef = useRef(null);
  const [rows, setRows] = useState(null);       // linhas da planilha (staging)
  const [photos, setPhotos] = useState({});     // matrícula -> url
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const list = data ? data.birthdays : [];

  async function onCsv(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setMsg('');
    const text = await f.text();
    const parsed = mapRows(parseCsv(text));
    if (!parsed.length) { setMsg('Não encontrei linhas válidas (precisa de coluna "nome" e data).'); return; }
    setRows(parsed);
  }

  async function onPhotos(e) {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    setBusy('fotos'); setMsg('');
    const map = { ...photos };
    let ok = 0, fail = 0;
    for (const f of files) {
      const stem = keyMat((f.name || '').replace(/\.[^.]+$/, ''));
      try { const up = await media.upload(f); map[stem] = up.url; ok++; }
      catch (err) { fail++; }
    }
    setPhotos(map);
    setBusy('');
    setMsg(`${ok} foto(s) enviada(s)${fail ? `, ${fail} falharam` : ''}.`);
  }

  // Junta fotos (por matrícula) às linhas e envia.
  async function save() {
    if (!rows || !rows.length) return;
    const merged = rows.map((r) => {
      const url = photos[keyMat(r.matricula)];
      return url ? { ...r, foto: url } : r;
    });
    setBusy('salvar'); setMsg('');
    try {
      const res = await birthdays.import(merged);
      setMsg(`Relação salva: ${res.imported} pessoa(s)${res.ignored ? `, ${res.ignored} ignorada(s)` : ''}.`);
      setRows(null); setPhotos({});
      reload();
    } catch (err) { setMsg(err.message || 'Falha ao salvar.'); }
    setBusy('');
  }

  async function clearAll() {
    if (!window.confirm('Apagar toda a relação de aniversariantes?')) return;
    await birthdays.clear();
    reload();
  }

  const matched = rows ? rows.filter((r) => photos[keyMat(r.matricula)]).length : 0;

  return (
    <div>
      <PageHeader
        title="Aniversariantes"
        subtitle="Suba a planilha da equipe e as fotos — o player mostra sozinho quem faz aniversário."
        actions={list.length ? <Button variant="ghost" icon={Trash2} onClick={clearAll}>Limpar</Button> : null}
      />

      <Panel className="mb-4">
        <PanelHeader title="Importar relação" description="1) planilha CSV · 2) fotos (nomeadas pela matrícula) · 3) salvar" />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {/* 1. Planilha */}
          <div className="rounded-lg border border-line bg-surface-2 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><FileSpreadsheet size={16} className="text-accent" /> 1. Planilha</div>
            <p className="mb-3 text-xs text-ink-3">CSV com colunas <b>nome</b>, <b>matrícula</b>, <b>nascimento</b> (DD/MM) e <b>cargo</b>.</p>
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onCsv} />
            <Button size="sm" variant="secondary" icon={UploadCloud} onClick={() => csvRef.current && csvRef.current.click()}>Escolher CSV</Button>
            {rows && <div className="mt-2 text-xs text-ink-2"><Check size={12} className="mr-1 inline text-ok" />{rows.length} pessoa(s) na planilha</div>}
          </div>
          {/* 2. Fotos */}
          <div className="rounded-lg border border-line bg-surface-2 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><ImagePlus size={16} className="text-accent" /> 2. Fotos</div>
            <p className="mb-3 text-xs text-ink-3">Selecione as fotos nomeadas pela <b>matrícula</b> (ex.: <code>1023.jpg</code>). Sem foto → iniciais.</p>
            <input ref={photoRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPhotos} />
            <Button size="sm" variant="secondary" icon={UploadCloud} disabled={busy === 'fotos'} onClick={() => photoRef.current && photoRef.current.click()}>
              {busy === 'fotos' ? 'Enviando…' : 'Escolher fotos'}
            </Button>
            {Object.keys(photos).length > 0 && <div className="mt-2 text-xs text-ink-2"><Check size={12} className="mr-1 inline text-ok" />{Object.keys(photos).length} foto(s) enviada(s)</div>}
          </div>
          {/* 3. Salvar */}
          <div className="rounded-lg border border-line bg-surface-2 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink"><Cake size={16} className="text-accent" /> 3. Salvar</div>
            <p className="mb-3 text-xs text-ink-3">{rows ? `${matched} de ${rows.length} com foto casada.` : 'Suba a planilha primeiro.'}</p>
            <Button size="sm" variant="primary" icon={Check} disabled={!rows || busy === 'salvar'} onClick={save}>
              {busy === 'salvar' ? 'Salvando…' : 'Salvar relação'}
            </Button>
          </div>
        </div>
        {msg && <div className="mx-4 mb-4 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-2">{msg}</div>}
      </Panel>

      <Panel>
        <PanelHeader title="Relação atual" description={list.length ? `${list.length} pessoa(s)` : undefined} />
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}</div>
        ) : error ? (
          <ErrorState description="Não foi possível carregar." onRetry={reload} />
        ) : list.length === 0 ? (
          <EmptyState icon={Cake} title="Nenhum aniversariante ainda" description="Importe a planilha da equipe para começar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-2 font-semibold">Foto</th>
                  <th className="px-4 py-2 font-semibold">Nome</th>
                  <th className="px-4 py-2 font-semibold">Data</th>
                  <th className="px-4 py-2 font-semibold">Cargo</th>
                  <th className="px-4 py-2 font-semibold">Matrícula</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="border-b border-line/60">
                    <td className="px-4 py-2">
                      {p.foto
                        ? <img src={p.foto} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-2xs font-semibold text-ink-3">{(p.nome || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</span>}
                    </td>
                    <td className="px-4 py-2 font-medium text-ink">{p.nome}</td>
                    <td className="tnum px-4 py-2 text-ink-2">{String(p.dia).padStart(2, '0')}/{String(p.mes).padStart(2, '0')} <span className="text-ink-3">({MESES[(p.mes || 1) - 1]})</span></td>
                    <td className="px-4 py-2 text-ink-2">{p.cargo || '—'}</td>
                    <td className="tnum px-4 py-2 text-ink-3">{p.matricula || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
