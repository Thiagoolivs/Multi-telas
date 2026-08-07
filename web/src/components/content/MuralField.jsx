import React, { useEffect, useState } from 'react';
import { Select } from '../ui/Field.jsx';
import { Button } from '../ui/Button.jsx';
import { murais as api } from '../../api.js';

/*
 * Escolher o mural dentro do próprio editor de conteúdo.
 *
 * Sem isto o caminho seria: sair daqui, abrir a página de murais, criar um,
 * copiar o código, voltar e colar. Quem está montando a tela do evento na
 * véspera não faz esse trajeto — desiste. Então quando não existe mural nenhum,
 * o campo cria um na hora, com um clique, já selecionado.
 */
export function MuralField({ value, onChange }) {
  const [lista, setLista] = useState(null);   // null = carregando
  const [base, setBase] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      const r = await api.list();
      setLista(r.murais || []);
      setBase(r.base || window.location.origin);
      // Um mural só e nenhum escolhido: escolhe por ele. Não há dúvida a tirar.
      if (!value && (r.murais || []).length === 1) onChange(r.murais[0].codigo);
    } catch (e) { setLista([]); setErro(e.message); }
  }

  async function criar() {
    setCriando(true); setErro('');
    try {
      const m = await api.create('Mural de fotos');
      await carregar();
      onChange(m.codigo);
    } catch (e) { setErro(e.message); }
    setCriando(false);
  }

  if (lista === null) return <div className="text-sm text-ink-3">carregando murais…</div>;

  if (!lista.length) {
    return (
      <div className="rounded-md border border-line bg-surface-2 p-3">
        <p className="text-sm text-ink-2">Você ainda não tem um mural.</p>
        <p className="mt-1 text-xs text-ink-3">
          Um mural gera um QR. Quem apontar a câmera manda uma foto, e ela aparece nesta tela na hora.
        </p>
        <Button size="sm" className="mt-2.5" onClick={criar} disabled={criando}>
          {criando ? 'Criando…' : 'Criar um mural agora'}
        </Button>
        {erro && <p className="mt-2 text-xs text-danger">{erro}</p>}
      </div>
    );
  }

  const escolhido = lista.find((m) => m.codigo === value);
  return (
    <div className="space-y-2">
      <Select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">— escolha —</option>
        {lista.map((m) => (
          <option key={m.id} value={m.codigo}>
            {m.titulo} ({m.codigo}){m.aceitando ? '' : ' — fechado'}
          </option>
        ))}
      </Select>
      {escolhido && (
        <div className="flex items-center gap-2.5 rounded-md border border-line bg-surface-2 p-2.5">
          <img src={api.qr(base + '/m/' + escolhido.codigo)} alt="" className="h-14 w-14 rounded bg-white p-1" />
          <div className="min-w-0 text-xs">
            <div className="font-medium text-ink">{base.replace(/^https?:\/\//, '')}/m/{escolhido.codigo}</div>
            <div className="mt-0.5 text-ink-3">
              {escolhido.aceitando
                ? 'Aberto — quem ler o QR consegue enviar foto.'
                : 'Fechado. Abra na página do Mural quando o evento começar.'}
            </div>
          </div>
        </div>
      )}
      <button type="button" onClick={criar} disabled={criando} className="text-xs text-ink-3 hover:text-ink">
        {criando ? 'Criando…' : '+ criar outro mural'}
      </button>
      {erro && <p className="text-xs text-danger">{erro}</p>}
    </div>
  );
}
