import React, { useEffect, useState } from 'react';
import { AlertTriangle, CircleAlert, CircleCheck, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { sistema } from '../api.js';

/*
 * Estado do sistema.
 *
 * Estas informações já existiam — no `console.warn` do servidor, num lugar
 * onde o cliente nunca olha e o dono raramente. A pior delas, mídia gravando
 * em disco efêmero, é silenciosa por natureza: tudo funciona no dia do deploy
 * e a arte some no seguinte. Quando o problema aparece, aparece na parede.
 *
 * Cada item responde três coisas, nesta ordem: o que está acontecendo, o que
 * isso causa, e o que fazer. A do meio é a que costuma faltar — "STORAGE não
 * definido" não diz nada a quem não escreveu o código; "toda imagem enviada
 * some no próximo deploy" diz tudo.
 */

const ESTILO = {
  critico: {
    icone: CircleAlert,
    cor: 'text-danger',
    caixa: 'border-danger/40 bg-danger/5',
    rotulo: 'Resolver agora',
  },
  atencao: {
    icone: AlertTriangle,
    cor: 'text-warn',
    caixa: 'border-warn/40 bg-warn/5',
    rotulo: 'Falta configurar',
  },
  ok: {
    icone: CircleCheck,
    cor: 'text-ok',
    caixa: 'border-line bg-surface',
    rotulo: 'Pronto',
  },
};

export function SystemPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(true);

  const carregar = () => {
    setBusy(true);
    sistema.diagnostico()
      .then(setDados)
      .catch((e) => setErro(e.message || 'Não consegui ler o estado do sistema.'))
      .finally(() => setBusy(false));
  };
  useEffect(carregar, []);

  if (erro) return <div className="rounded-lg border border-line bg-surface p-4 text-sm text-ink-2">{erro}</div>;
  if (!dados) return <div className="text-sm text-ink-3">Conferindo…</div>;

  const topo = ESTILO[dados.nivel] || ESTILO.ok;
  const TopoIcone = topo.icone;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Estado do sistema"
        subtitle="O que está configurado, e o que vai doer se ficar como está."
        actions={<Button variant="secondary" icon={RefreshCw} disabled={busy} onClick={carregar}>
          {busy ? 'Conferindo…' : 'Conferir de novo'}
        </Button>}
      />

      <div className={'flex items-center gap-3 rounded-lg border p-4 ' + topo.caixa}>
        <TopoIcone size={20} className={topo.cor} />
        <div className="text-sm font-medium text-ink">{dados.resumo}</div>
      </div>

      <div className="space-y-3">
        {dados.itens.map((item) => {
          const e = ESTILO[item.nivel] || ESTILO.ok;
          const Icone = e.icone;
          return (
            <div key={item.id} className={'rounded-lg border p-4 ' + e.caixa}>
              <div className="flex items-center gap-2">
                <Icone size={16} className={e.cor} />
                <span className="text-sm font-semibold text-ink">{item.titulo}</span>
                <span className={'ml-auto text-2xs font-semibold uppercase tracking-wide ' + e.cor}>{e.rotulo}</span>
              </div>
              <p className="mt-2 text-sm text-ink">{item.estado}</p>
              {item.consequencia && <p className="mt-1 text-sm text-ink-2">{item.consequencia}</p>}
              {item.resolver && (
                <p className="mt-2 rounded border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2">
                  <strong className="text-ink">Como resolver:</strong> {item.resolver}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-ink-3">
        Estas configurações ficam nas variáveis de ambiente do servidor — no Railway, em Variables.
        Depois de mudar, o serviço reinicia sozinho e esta tela reflete o novo estado.
      </p>
    </div>
  );
}
