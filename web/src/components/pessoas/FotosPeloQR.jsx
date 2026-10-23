import React, { useState } from 'react';
import { QrCode, Check, X, Pause, Play, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import { Panel, PanelHeader } from '../ui/Panel.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Field.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { aviso } from '../../lib/avisos.js';
import { confirmar } from '../../lib/confirmar.js';
import { fotoqr } from '../../api.js';

/*
 * FOTOS PELO QR (EXECUTOR D31). O RH abre um pedido por um período ("semanas
 * antes dos eventos ou quando o RH programar"); a pessoa lê o QR, prova o
 * e-mail com um código e manda a foto; a foto espera aqui. Aprovar põe a foto
 * na pessoa — ou põe a pessoa na lista, se ela não estava (selo "QR").
 */
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const br = (s) => (s ? s.split('-').reverse().join('/') : '');

function Pedido({ p, onMudou, aprovadas = [], onTirar }) {
  const link = location.origin + '/f/' + p.codigo;
  const hoje = iso(new Date());
  const noAr = p.aceitando && (!p.inicio || hoje >= p.inicio) && (!p.fim || hoje <= p.fim);
  async function mudar(campos) {
    try { await fotoqr.atualizar(p.id, campos); onMudou(); }
    catch (e) { aviso.erro('fotoqr', e.message || 'Não deu para salvar.'); }
  }
  async function apagar() {
    if (!(await confirmar({ titulo: 'Apagar este pedido?', texto: 'O QR para de funcionar e as fotos que esperavam aprovação saem.', botao: 'Apagar', perigo: true }))) return;
    await fotoqr.remover(p.id); onMudou();
  }
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-4 sm:flex-row">
      <img src={'/api/qr.svg?d=' + encodeURIComponent(link)} alt={'QR do pedido ' + p.codigo} className="h-36 w-36 shrink-0 self-center rounded-md bg-white p-2" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{p.titulo}</span>
          <span className={'rounded-full px-2 py-0.5 text-2xs font-medium ' + (noAr ? 'bg-ok-soft text-ok' : 'bg-surface text-ink-3')}>{noAr ? 'Recebendo fotos' : p.aceitando ? 'Fora do período' : 'Pausado'}</span>
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">{link.replace(/^https?:\/\//, '')} <ExternalLink size={12} /></a>
        <div className="flex flex-wrap items-end gap-2 text-xs text-ink-2">
          <label className="block">De<Input type="date" value={p.inicio} onChange={(e) => mudar({ inicio: e.target.value })} className="mt-1 !py-1" /></label>
          <label className="block">Até<Input type="date" value={p.fim} onChange={(e) => mudar({ fim: e.target.value })} className="mt-1 !py-1" /></label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={p.aceitando ? Pause : Play} onClick={() => mudar({ aceitando: !p.aceitando })}>{p.aceitando ? 'Pausar' : 'Abrir de novo'}</Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={apagar}>Apagar</Button>
        </div>
        {/* D33: o pedido de uma data junta as fotos aprovadas no mural dela. */}
        {p.tipo === 'data' && (
          <div className="space-y-1.5">
            <div className="text-xs text-ink-2">Mural da data, {br(p.dataAlvo)}: {aprovadas.length ? aprovadas.length + (aprovadas.length === 1 ? ' foto aprovada' : ' fotos aprovadas') : 'nenhuma foto aprovada ainda'}. Na semana da data, ele passa nas TVs dos aniversários.</div>
            {aprovadas.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {aprovadas.slice(0, 12).map((a) => (
                  <li key={a.id} className="group relative">
                    <img src={a.url} alt={'Foto de ' + a.nome} title={a.nome} className="h-12 w-12 rounded-md object-cover" />
                    <button type="button" aria-label={'Tirar a foto de ' + a.nome} onClick={() => onTirar(a)}
                      className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-danger text-white group-hover:flex"><X size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-2xs text-ink-3">No período, o QR aparece sozinho nas TVs dos aniversários (acima). Dá também para imprimir ou mandar no grupo da empresa. {p.inicio || p.fim ? 'Recebe ' + (p.inicio ? 'de ' + br(p.inicio) + ' ' : '') + (p.fim ? 'até ' + br(p.fim) : '') + '.' : ''}</p>
      </div>
    </div>
  );
}

// Como a foto aparece no cartão de aniversário da TV: rosto redondo, nome e setor.
function Cartao({ f }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gradient-to-br from-[#0e1b33] to-[#1c2f55] p-3 text-white">
      <img src={f.url} alt={'Foto de ' + f.nome} className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white/70" />
      <div className="min-w-0">
        <div className="truncate font-semibold">{f.nome}</div>
        <div className="truncate text-xs text-white/70">{[f.setor, f.dia ? String(f.dia).padStart(2, '0') + '/' + String(f.mes).padStart(2, '0') : ''].filter(Boolean).join(' · ') || '—'}</div>
      </div>
    </div>
  );
}

export function FotosPeloQR({ onAprovou }) {
  const { data, reload } = useAsync(fotoqr.list);
  const [criando, setCriando] = useState(false);
  const [decidindo, setDecidindo] = useState('');
  const pedidos = (data && data.pedidos) || [];
  const todas = (data && data.fotos) || [];
  // As que esperam o RH; as de uma data já aprovadas ficam no mural dela (D33).
  const fotos = todas.filter((f) => !f.aprovadaEm);
  const datas = (data && data.datas) || [];
  const [dataEscolhida, setDataEscolhida] = useState('');
  const pedidoDe = (f) => pedidos.find((p) => p.id === f.pedidoId) || {};
  const temPerfil = pedidos.some((p) => p.tipo !== 'data');

  async function abrir() {
    setCriando(true);
    const hoje = new Date();
    try {
      await fotoqr.criar({ titulo: 'Mande sua foto para as TVs da empresa', inicio: iso(hoje), fim: iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 14)) });
      reload();
    } catch (e) { aviso.erro('fotoqr', e.message || 'Não deu para abrir o pedido.'); }
    finally { setCriando(false); }
  }
  async function pedirParaData() {
    const d = datas.find((x) => x.id === dataEscolhida);
    if (!d) return;
    setCriando(true);
    try { await fotoqr.criar({ dataId: d.id }); setDataEscolhida(''); reload(); }
    catch (e) { aviso.erro('fotoqr', e.message || 'Não deu para abrir o pedido.'); }
    finally { setCriando(false); }
  }
  async function tirarDoMural(f) {
    if (!(await confirmar({ titulo: 'Tirar a foto de ' + f.nome + '?', texto: 'Sai do mural da data e o arquivo é apagado.', botao: 'Tirar', perigo: true }))) return;
    try { await fotoqr.recusar(f.id); reload(); }
    catch (e) { aviso.erro('fotoqr', e.message || 'Não deu certo.'); }
  }
  async function decidir(f, aprovar) {
    setDecidindo(f.id);
    try {
      if (aprovar) await fotoqr.aprovar(f.id); else await fotoqr.recusar(f.id);
      const daData = pedidoDe(f).tipo === 'data';
      aviso.ok(!aprovar ? 'Foto recusada e apagada.' : daData ? 'Foto de ' + f.nome + ' no mural da data.' : f.pessoaId ? 'Foto de ' + f.nome + ' na lista.' : f.nome + ' entrou na lista, com a foto.');
      reload();
      if (aprovar && onAprovou) onAprovou();
    } catch (e) { aviso.erro('fotoqr', e.message || 'Não deu certo.'); }
    finally { setDecidindo(''); }
  }

  return (
    <Panel className="mb-4">
      <PanelHeader title="Fotos pelo QR"
        description="A pessoa lê o QR, recebe um código no e-mail e manda a própria foto. Você confere aqui antes de ir para a TV."
        actions={temPerfil ? null : <Button size="sm" variant="secondary" icon={QrCode} disabled={criando} onClick={abrir}>{criando ? 'Abrindo…' : 'Pedir fotos pelo QR'}</Button>} />
      <div className="space-y-4 p-4">
        {data && !data.emailPronto && (
          <p className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-ink">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
            O envio de e-mail não está ligado: o código não chega. Fale com o suporte antes de divulgar o QR.
          </p>
        )}
        {pedidos.map((p) => <Pedido key={p.id} p={p} onMudou={reload} onTirar={tirarDoMural} aprovadas={todas.filter((f) => f.aprovadaEm && f.pedidoId === p.id)} />)}
        {!pedidos.length && <p className="text-sm text-ink-3">Nenhum pedido aberto. Abra um algumas semanas antes dos aniversários ou de uma data, e divulgue o QR.</p>}
        {/* D33: datas com fotos da equipe — mães, pais, mulheres, crianças, Natal e as outras. */}
        {datas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line p-3 text-sm">
            <span className="text-ink-2">Fotos para uma data:</span>
            <select value={dataEscolhida} onChange={(e) => setDataEscolhida(e.target.value)} aria-label="A data"
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink">
              <option value="">Escolher…</option>
              {datas.map((d) => <option key={d.id} value={d.id} disabled={pedidos.some((p) => p.dataId === d.id)}>{d.emoji} {d.label} — {br(d.data)}</option>)}
            </select>
            <Button size="sm" variant="secondary" icon={QrCode} disabled={!dataEscolhida || criando} onClick={pedirParaData}>Pedir as fotos</Button>
            <span className="w-full text-2xs text-ink-3">Ex.: no Dia das Mães, cada um manda uma foto com a mãe; as aprovadas formam o mural da data na TV.</span>
          </div>
        )}
        {fotos.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">Para aprovar ({fotos.length})</div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {fotos.map((f) => (
                <li key={f.id} className="space-y-2 rounded-lg border border-line p-3">
                  <Cartao f={f} />
                  <div className="flex flex-wrap items-center gap-2 text-2xs text-ink-3">
                    {f.email}
                    {pedidoDe(f).tipo === 'data'
                      ? <span className="rounded-full bg-surface-2 px-1.5 py-px font-medium text-ink-2">para o mural: {pedidoDe(f).titulo}</span>
                      : !f.pessoaId && <span className="rounded-full bg-accent-soft px-1.5 py-px font-medium text-accent">não está na lista: entra ao aprovar</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" icon={Check} disabled={decidindo === f.id} onClick={() => decidir(f, true)}>Aprovar</Button>
                    <Button size="sm" variant="ghost" icon={X} disabled={decidindo === f.id} onClick={() => decidir(f, false)}>Recusar</Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
