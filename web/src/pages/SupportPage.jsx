import React, { useState } from 'react';
import { LifeBuoy, Mail, ChevronDown, Copy, Check, BookOpen } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx';
import { cn } from '../lib/cn.js';
import { suporte } from '../api.js';
import { aviso } from '../lib/avisos.js';
import { useAsync } from '../lib/useAsync.js';
import { relativeTime } from '../lib/format.js';

// Contato do suporte. Trocar aqui quando o e-mail do projeto existir.
const SUPPORT_EMAIL = 'thiago.olivs.coelho@gmail.com';

const FAQ = [
  {
    q: 'Como coloco uma TV para funcionar?',
    a: 'Na TV, abra o site e toque em "Player (TV)". Ela mostra um código de 6 dígitos. No painel, vá em Telas → Parear tela e digite esse código. Pronto: o que você publicar aparece nela na hora.',
  },
  {
    q: 'A TV está mostrando a tela errada (ou repetindo uma antiga)',
    a: 'O navegador guarda qual TV é aquela para sobreviver a recargas. Para começar do zero, use "Player — tela nova" na página inicial, ou o botão "Gerar outro código (tela nova)" na própria tela de pareamento. Os dois geram um código novo.',
  },
  {
    q: 'O painel diz que a tela está offline. E agora?',
    a: 'A tela é considerada offline após 90 segundos sem responder. Verifique a energia, a internet e se o player continua aberto na TV (não pode estar minimizado nem em outra aba). Depois disso ela volta sozinha.',
  },
  {
    q: 'Preciso clicar em salvar depois de mudar o conteúdo?',
    a: 'Não. As alterações salvam e vão para a tela sozinhas cerca de 1 segundo após a última edição. O indicador no topo mostra "Salvando…" e depois "Salvo".',
  },
  {
    q: 'Como reaproveito um design em várias telas?',
    a: 'Tudo que você cria fica em Meus Designs. Ao adicionar conteúdo em uma tela, o painel abre justamente na sua biblioteca, com busca — é só clicar no design para inseri-lo.',
  },
  {
    q: 'A TV foi trocada ou apagada. Perco a programação?',
    a: 'Não. Em Telas, o ícone de arquivo abre Backup e restauração: baixe o JSON da tela antiga e, na TV nova (depois de pareada), restaure o arquivo. Também dá para copiar a exibição de outra tela que já funciona.',
  },
  {
    q: 'A internet caiu. A tela apaga?',
    a: 'Não. O player guarda a última programação e as mídias já baixadas, e continua exibindo offline. Quando a rede volta, ele se atualiza sozinho.',
  },
  {
    q: 'Esqueci minha senha',
    a: 'Na tela de login, clique em "Esqueci minha senha" e informe seu e-mail. Você recebe um link válido por 1 hora para criar uma nova senha.',
  },
  {
    q: 'Quantas telas posso ter?',
    a: 'Depende do plano. Em Plano você vê quantas está usando e quantas o seu plano permite, e pode mudar de plano quando precisar de mais.',
  },
  {
    q: 'Quem mais da equipe pode acessar?',
    a: 'Em Equipe você convida pessoas por e-mail e define o papel de cada uma. O dono tem controle total; administradores gerenciam conteúdo e telas; membros têm acesso mais restrito.',
  },
];

function FaqItem({ item, open, onToggle }) {
  return (
    <div className="border-b border-line last:border-b-0">
      <button type="button" onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-2">
        <span className="text-sm font-medium text-ink">{item.q}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 text-sm leading-relaxed text-ink-2">{item.a}</div>}
    </div>
  );
}

export function SupportPage({ me }) {
  const [aberta, setAberta] = useState(null);
  const [assunto, setAssunto] = useState('Dúvida');
  const [mensagem, setMensagem] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { data: minhas, reload: recarregar } = useAsync(suporte.meus);

  const user = (me && me.user) || {};
  const tenant = (me && me.tenant) || {};

  // Informações técnicas ajudam a responder sem ficar perguntando o básico.
  const contexto = [
    'Conta: ' + (tenant.name || '—'),
    'Usuário: ' + (user.email || '—') + ' (' + (user.role || '—') + ')',
    'Navegador: ' + (typeof navigator !== 'undefined' ? navigator.userAgent : '—'),
  ].join('\n');

  function abrirEmail() {
    const corpo = mensagem.trim() + '\n\n---\n' + contexto;
    window.location.href = 'mailto:' + SUPPORT_EMAIL
      + '?subject=' + encodeURIComponent('[MultiTelas] ' + assunto)
      + '&body=' + encodeURIComponent(corpo);
  }

  /*
   * Enviar pelo produto, e não só por mailto.
   *
   * O mailto continua existindo porque tem gente que prefere o próprio
   * programa de e-mail. Mas ele SÓ funciona se a pessoa tiver um configurado,
   * e o que ela escreve some do nosso lado — não dá para saber quantos
   * escreveram, sobre o quê, nem responder de dentro. Uma reclamação que
   * ninguém consegue contar é uma reclamação que ninguém trata.
   */
  const TIPO = {
    'Dúvida': 'duvida',
    'Problema com uma tela': 'problema',
    'Erro no painel': 'problema',
    'Cobrança e planos': 'cobranca',
    'Sugestão': 'sugestao',
  };

  async function enviar() {
    const texto = mensagem.trim();
    if (texto.length < 10) return;
    setEnviando(true);
    try {
      await suporte.enviar(TIPO[assunto] || 'duvida', assunto + ': ' + texto);
      setMensagem('');
      aviso.ok('Recebemos sua mensagem. Você acompanha a resposta aqui mesmo.');
      recarregar();
    } catch (e) { aviso.erro('sup', 'Não consegui enviar.', e.message || ''); }
    setEnviando(false);
  }

  async function copiarEmail() {
    try { await navigator.clipboard.writeText(SUPPORT_EMAIL); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch (e) { /* sem clipboard: o endereço já está visível na tela */ }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Suporte" subtitle="Respostas rápidas para as dúvidas mais comuns — e um caminho direto até a gente." />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Dúvidas frequentes */}
        <Panel className="self-start">
          <PanelHeader title="Dúvidas frequentes" description={`${FAQ.length} perguntas`} />
          <div>
            {FAQ.map((item, i) => (
              <FaqItem key={i} item={item} open={aberta === i} onToggle={() => setAberta(aberta === i ? null : i)} />
            ))}
          </div>
        </Panel>

        {/* Falar com o suporte */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Falar com o suporte" description="Não achou a resposta? Escreva pra gente." />
            <div className="space-y-3 p-4">
              <Field label="Assunto">
                <Select value={assunto} onChange={(e) => setAssunto(e.target.value)}>
                  <option>Dúvida</option>
                  <option>Problema com uma tela</option>
                  <option>Erro no painel</option>
                  <option>Cobrança e planos</option>
                  <option>Sugestão</option>
                </Select>
              </Field>
              <Field label="Mensagem" hint="Conte o que aconteceu e, se der, o nome da tela envolvida.">
                <Textarea rows={5} value={mensagem} onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Descreva o que você precisa…" />
              </Field>
              <Button variant="primary" icon={LifeBuoy} className="w-full"
                disabled={enviando || mensagem.trim().length < 10} onClick={enviar}>
                {enviando ? 'Enviando…' : 'Enviar para o suporte'}
              </Button>
              <Button variant="ghost" icon={Mail} className="w-full" disabled={!mensagem.trim()} onClick={abrirEmail}>
                Ou abrir no meu programa de e-mail
              </Button>
              <p className="text-2xs leading-snug text-ink-3">
                Enviando por aqui, a resposta aparece nesta mesma página. Pelo e-mail, ela vai para a sua caixa —
                e anexamos automaticamente os dados da conta e do navegador.
              </p>
            </div>
          </Panel>

          {/*
            O que esta conta já mandou, com a resposta quando houver. Guardar
            sem devolver seria pedir que a pessoa escrevesse num buraco.
          */}
          {!!(minhas && minhas.itens && minhas.itens.length) && (
            <Panel>
              <PanelHeader title="Suas mensagens" description={minhas.itens.length + ' enviada(s)'} />
              <div className="max-h-64 overflow-y-auto">
                {minhas.itens.map((m) => (
                  <div key={m.id} className="border-b border-line px-4 py-3 last:border-0">
                    <div className="mb-1 flex items-center gap-2 text-2xs">
                      <span className={'rounded px-1.5 py-0.5 ' + (m.status === 'aberta' ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok')}>
                        {m.status === 'aberta' ? 'aguardando' : 'respondida'}
                      </span>
                      <span className="ml-auto text-ink-3">{relativeTime(m.createdAt)}</span>
                    </div>
                    <div className="text-xs text-ink-2">{m.texto}</div>
                    {m.resposta && (
                      <div className="mt-1.5 rounded border border-line bg-surface-2 p-2 text-2xs text-ink-2">
                        <b className="text-ink">Resposta:</b> {m.resposta}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel>
            <PanelHeader title="Contato direto" />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                <span className="truncate text-sm text-ink-2">{SUPPORT_EMAIL}</span>
                <Button size="sm" variant="ghost" icon={copiado ? Check : Copy} onClick={copiarEmail}>
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              <div className="flex items-start gap-2 text-xs leading-snug text-ink-3">
                <LifeBuoy size={14} className="mt-0.5 shrink-0" />
                <span>Respondemos em até 1 dia útil. Para tela fora do ar, escreva <b>URGENTE</b> no assunto.</span>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Dados da sua conta" description="Cole isto se pedirmos." />
            <div className="p-4">
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-surface-2 p-2.5 text-2xs leading-relaxed text-ink-3">{contexto}</pre>
            </div>
          </Panel>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-2xs text-ink-3">
        <BookOpen size={12} /> Dica: quase toda dúvida de tela offline se resolve reabrindo o player na TV.
      </p>
    </div>
  );
}
