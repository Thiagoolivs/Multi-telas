import React, { useEffect, useState } from 'react';
import {
  Tag, Sparkles, Megaphone, Camera, Cake, QrCode, FileText, UserPlus, TrendingUp, HardHat, HeartPulse, Stethoscope, ShieldCheck,
  UtensilsCrossed, Clock, CalendarDays, MessageSquareQuote, CreditCard, Wifi, Briefcase, Target, HeartHandshake, BadgeCheck, ArrowLeft, Check, Rocket, SlidersHorizontal, MonitorPlay, RefreshCw, ImagePlus, Share2,
} from 'lucide-react';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Textarea } from '../components/ui/Field.jsx';
import { Spinner } from '../components/ui/Feedback.jsx';
import { PecaHtml } from '../components/content/PecaHtml.jsx';
import { DesignThumb } from '../components/content/DesignThumb.jsx';
import { RedesSociais } from '../components/content/RedesSociais.jsx';
import { TAMANHO_REAL } from '../lib/pecaHtml.js';
import { ai, devices, library, media, brand } from '../api.js';
import { ProximoPasso } from '../components/layout/ProximoPasso.jsx';
import { publicarPecas } from '../lib/publicar.js';
import { aviso } from '../lib/avisos.js';
import { cn } from '../lib/cn.js';
import { usePerfil, perfilDe, perfilAtual } from '../lib/perfil.js';

/*
 * CRIAÇÃO RÁPIDA. Era o Criar até 21/10. Desde o item 24 (EXECUTOR §2b), o
 * Criar é a conversa (CriarPage.jsx), e estes quatro passos continuam para
 * quem já sabe o que quer, em Meus Designs › Mais (esconder antes de apagar).
 *
 * Criar em quatro passos (docs/EXECUTOR.md, item 3; PLANO §5.1).
 *
 * Criar era confuso e espalhado: Meus Designs com quatro cartões, a página da
 * tela com outros botões, e um formulário longo que perguntava empresa, tom e
 * público — coisas que a Marca já sabe. Aqui é uma entrada só:
 *
 *   1. o que quer mostrar      seis opções grandes
 *   2. uma frase               com exemplos para tocar
 *   3. o rascunho              a peça com o texto real, sem gastar nada
 *   4. publicar                na tela, já marcada
 *
 * Formato e quantidade têm padrão (TV deitada, uma peça) e ficam em
 * "ajustar". O passo 1 também mora no Início: quem abre o app e toca numa
 * opção cai direto no passo 2 — é o que põe "criar com IA e publicar" em
 * três toques (opção → ver rascunho → publicar).
 */

export const OPCOES = [
  { id: 'promocao', titulo: 'Promoção com preço', icone: Tag, pedido: 'Promoção com preço',
    dica: 'O produto, o preço e até quando.',
    exemplos: ['Café + pão na chapa por R$ 9', 'Óculos de sol com 30% até sábado', 'Corte + barba por R$ 50 às quartas'] },
  { id: 'novidade', titulo: 'Novidade', icone: Sparkles, pedido: 'Novidade na loja',
    dica: 'O que chegou ou começou.',
    exemplos: ['Chegou a coleção de verão', 'Agora temos açaí no copo', 'Novo horário de atendimento aos sábados'] },
  { id: 'aviso', titulo: 'Aviso ou horário', icone: Megaphone, pedido: 'Aviso para os clientes',
    dica: 'O aviso, curto, como você falaria no balcão.',
    exemplos: ['Fechado no feriado de quinta', 'Aberto de segunda a sábado, das 8h às 19h', 'Aceitamos Pix e cartão'] },
  { id: 'foto', titulo: 'Foto do produto', icone: Camera, pedido: 'Destaque do produto da foto', foto: true,
    dica: 'Tire ou escolha a foto e diga o que é.',
    exemplos: ['Bolo de cenoura com cobertura', 'Armação nova, linha importada', 'Kit de presente para o Dia dos Pais'] },
  { id: 'aniversario', titulo: 'Aniversariantes', icone: Cake, pedido: 'Parabéns aos aniversariantes',
    dica: 'Quem faz aniversário, e quando.',
    exemplos: ['Parabéns, Ana! Dia 12', 'Aniversariantes de outubro: João, Marta e Pedro', 'Feliz aniversário, equipe da manhã'] },
  { id: 'instagram', titulo: 'Instagram ou QR', icone: QrCode, pedido: 'Convite para seguir no Instagram',
    dica: 'O @ ou o link que o QR deve abrir.',
    exemplos: ['Siga @padariadobairro', 'Peça pelo WhatsApp: wa.me/5511999999999', 'Avalie a gente no Google'] },
  /*
   * Empresa e Saúde (D4). A metalúrgica abria o Início e via "Promoção com
   * preço"; a clínica, "Foto do produto". Cada perfil mostra as seis que
   * fazem sentido para ele (js/perfil.js, opcoes).
   */
  { id: 'comunicado', titulo: 'Comunicado', icone: FileText, pedido: 'Comunicado para a equipe',
    dica: 'O assunto e o que muda para as pessoas.',
    exemplos: ['Nova política de home office a partir de novembro', 'Reunião geral na sexta às 9h, no auditório', 'O plano de saúde muda de operadora em dezembro'] },
  { id: 'boasvindas', titulo: 'Boas-vindas', icone: UserPlus, pedido: 'Boas-vindas a quem chegou',
    dica: 'Quem chegou e em qual área.',
    exemplos: ['Bem-vinda, Carla, ao time de Vendas!', 'Bem-vindos à turma de trainees 2026', 'Boas-vindas ao Rafael, novo supervisor da linha 2'] },
  { id: 'indicador', titulo: 'Meta ou resultado', icone: TrendingUp, pedido: 'Meta e resultado da equipe',
    dica: 'O número e o que ele quer dizer.',
    exemplos: ['Batemos 98% da meta de produção em outubro', '120 dias sem acidente', 'Satisfação dos clientes subiu para 4,8'] },
  { id: 'seguranca', titulo: 'Segurança do trabalho', icone: HardHat, pedido: 'Lembrete de segurança do trabalho',
    dica: 'O cuidado, como você falaria no turno.',
    exemplos: ['Use o protetor auricular na área de prensas', 'Mantenha a faixa de pedestre livre', 'SIPAT de 10 a 14 de novembro'] },
  { id: 'dica', titulo: 'Dica de saúde', icone: HeartPulse, pedido: 'Dica de saúde para a sala de espera',
    dica: 'A dica, curta e fácil de seguir.',
    exemplos: ['Beba água: 2 litros por dia', 'Lave as mãos por 20 segundos', 'Durma de 7 a 8 horas por noite'] },
  { id: 'servicos', titulo: 'Serviços', icone: Stethoscope, pedido: 'Nossos serviços e especialidades',
    dica: 'O que vocês atendem e como marcar.',
    exemplos: ['Agora temos pediatria às terças', 'Exames de sangue sem agendamento, das 7h às 10h', 'Atendemos os convênios Unimed e Bradesco'] },
  { id: 'prevencao', titulo: 'Campanha de prevenção', icone: ShieldCheck, pedido: 'Campanha de prevenção',
    dica: 'A campanha e o que a pessoa deve fazer.',
    exemplos: ['Outubro Rosa: faça seu exame', 'Novembro Azul: cuide da sua saúde', 'Vacina da gripe disponível'] },
  /*
   * D17: o dono quer "pelo menos 10 opções" de começo rápido. Cada perfil
   * passa a ter de 10 a 12 (js/perfil.js), com estas somadas às de cima.
   */
  { id: 'cardapio', titulo: 'Cardápio do dia', icone: UtensilsCrossed, pedido: 'Cardápio do dia',
    dica: 'Os pratos (ou produtos) e os preços.',
    exemplos: ['Prato do dia: feijoada R$ 29', 'Café, pão na chapa e suco por R$ 15', 'Açaí 300 ml R$ 14 · 500 ml R$ 19'] },
  { id: 'horario', titulo: 'Horário de funcionamento', icone: Clock, pedido: 'Horário de funcionamento',
    dica: 'Os dias e os horários, como você diria.',
    exemplos: ['Segunda a sexta, 8h às 18h · sábado, 8h às 12h', 'Aberto todos os dias, das 7h às 22h', 'Plantão no domingo, das 9h às 13h'] },
  { id: 'evento', titulo: 'Evento ou data', icone: CalendarDays, pedido: 'Divulgar um evento',
    dica: 'O que é, o dia e a hora.',
    exemplos: ['Festa junina dia 22, a partir das 18h', 'Black Friday: sexta, 27/11', 'Palestra de saúde no dia 10, às 15h'] },
  { id: 'depoimento', titulo: 'Depoimento de cliente', icone: MessageSquareQuote, pedido: 'Depoimento de cliente',
    dica: 'A frase do cliente e o nome (ou só o primeiro nome).',
    exemplos: ['"Atendimento nota 10!" — Carla', '"Melhor pão da região" — seu João', '"Me senti acolhida desde a recepção" — Marta'] },
  { id: 'pagamento', titulo: 'Formas de pagamento', icone: CreditCard, pedido: 'Formas de pagamento',
    dica: 'Como dá para pagar e se tem parcelamento.',
    exemplos: ['Aceitamos Pix, débito e crédito', 'Em até 10x sem juros no cartão', 'Pix com 5% de desconto'] },
  { id: 'wifi', titulo: 'Wi-Fi para clientes', icone: Wifi, pedido: 'Wi-Fi para clientes',
    dica: 'O nome da rede e a senha.',
    exemplos: ['Rede: Padaria-Clientes · senha: paoquente', 'Wi-Fi grátis: peça a senha no caixa', 'Rede Clínica-Visitantes, senha 2026'] },
  { id: 'vaga', titulo: 'Vaga aberta', icone: Briefcase, pedido: 'Vaga aberta na empresa',
    dica: 'O cargo e como se candidatar.',
    exemplos: ['Vaga: operador de empilhadeira · fale com o RH', 'Indique um amigo para a vaga de vendas', 'Estágio em administração, inscrições até sexta'] },
  { id: 'valores', titulo: 'Missão e valores', icone: Target, pedido: 'Missão e valores da empresa',
    dica: 'A missão ou os valores, curtos.',
    exemplos: ['Segurança em primeiro lugar, sempre', 'Respeito, qualidade e prazo', 'Nossa missão: cuidar de quem cuida'] },
  { id: 'agradecimento', titulo: 'Agradecimento', icone: HeartHandshake, pedido: 'Agradecimento à equipe',
    dica: 'A quem agradecer e por quê.',
    exemplos: ['Obrigado, turno da noite, pela meta batida!', 'Parabéns à equipe de vendas pelo recorde', '10 anos de casa: obrigado, Seu Antônio!'] },
  { id: 'convenios', titulo: 'Convênios aceitos', icone: BadgeCheck, pedido: 'Convênios aceitos',
    dica: 'Os convênios, um por linha ou separados por vírgula.',
    exemplos: ['Unimed, Bradesco Saúde, SulAmérica', 'Atendemos particular e convênios', 'Novo convênio: Amil'] },
];

/*
 * O mesmo começo fala diferente em cada perfil: o aviso da loja é para o
 * cliente no balcão; o da empresa, para a equipe; o da clínica, para quem
 * espera ser chamado.
 */
const NO_PERFIL = {
  empresa: {
    aviso: { titulo: 'Aviso', pedido: 'Aviso para a equipe', dica: 'O aviso, curto, como você falaria na reunião.',
      exemplos: ['O refeitório fecha às 13h30 na sexta', 'Ponto facultativo na segunda', 'Vacinação na empresa dia 20, das 8h às 12h'] },
    aniversario: { exemplos: ['Parabéns, Ana, do RH! Dia 12', 'Aniversariantes de outubro: João, Marta e Pedro', 'Feliz aniversário, turno da manhã'] },
  },
  saude: {
    aviso: { pedido: 'Aviso para os pacientes', dica: 'O aviso, curto, como a recepção falaria.',
      exemplos: ['Chegue 15 minutos antes da consulta', 'Não atenderemos no feriado de quinta', 'Traga a carteirinha do convênio'] },
    instagram: { exemplos: ['Siga @clinicavida', 'Marque pelo WhatsApp: wa.me/5511999999999', 'Avalie a gente no Google'] },
  },
};

// As seis opções do perfil, já com o texto dele. Sem perfil: Comércio.
export function opcoesDoPerfil(perfil) {
  const p = perfilDe(perfil);
  const ajustes = NO_PERFIL[p.id] || {};
  return p.opcoes.map((id) => {
    const o = OPCOES.find((x) => x.id === id);
    return o && { ...o, ...(ajustes[id] || {}) };
  }).filter(Boolean);
}

// Uma opção pelo id, no texto do perfil (vale também fora das seis dele).
export function opcaoDoPerfil(id, perfil) {
  const o = OPCOES.find((x) => x.id === id);
  if (!o) return null;
  const ajuste = (NO_PERFIL[perfilDe(perfil || perfilAtual()).id] || {})[id];
  return { ...o, ...(ajuste || {}) };
}

const ONDE = [
  { id: '16/9', nome: 'TV deitada' },
  { id: '9/16', nome: 'TV em pé' },
];

/*
 * A foto é escolha do cliente (EXECUTOR item 19). Antes era `acervo` fixo, e
 * conta sem foto própria nunca via foto na peça. O padrão é a IA gerar, com
 * a ordem de sempre: a foto da empresa vence quando serve. O custo aparece no
 * passo 3, antes de gastar.
 */
const FOTOS = [
  { id: 'gerar', nome: 'A IA gera' },
  { id: 'acervo', nome: 'Só as minhas' },
  { id: 'nenhuma', nome: 'Sem foto' },
];

// O passo 1: as seis opções grandes. Mora aqui e no Início.
export function OpcoesDeCriar({ onEscolher, compacto }) {
  const perfil = usePerfil();
  return (
    // D17: de 10 a 12 começos; no Início, três por linha já no celular, para caber sem rolar demais.
    <div className={cn('grid gap-2.5', compacto ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3')}>
      {opcoesDoPerfil(perfil.id).map((o) => {
        const Icone = o.icone;
        return (
          <button key={o.id} type="button" onClick={() => onEscolher(o.id)}
            className={cn('flex flex-col items-start justify-between gap-2 rounded-xl border border-line bg-surface text-left transition hover:border-accent/60 hover:bg-surface-2 active:scale-[0.98]', compacto ? 'min-h-[4.75rem] p-2.5' : 'min-h-[5.5rem] p-3')}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft"><Icone size={18} className="text-accent" /></span>
            <span className={cn('font-semibold leading-tight text-ink', compacto ? 'text-xs sm:text-sm' : 'text-sm')}>{o.titulo}</span>
          </button>
        );
      })}
    </div>
  );
}

function Passos({ atual }) {
  const nomes = ['O quê', 'A frase', 'Rascunho', 'Publicar'];
  return (
    <ol className="mb-4 flex items-center gap-1.5 text-2xs font-medium">
      {nomes.map((n, i) => {
        const k = i + 1;
        const feito = k < atual, agora = k === atual || (atual === 3 && k === 4);
        return (
          <li key={n} className="flex items-center gap-1.5">
            <span className={cn('flex h-5 w-5 items-center justify-center rounded-full',
              feito ? 'bg-accent text-accent-fg' : agora ? 'bg-accent-soft text-accent ring-1 ring-accent' : 'bg-surface-2 text-ink-3')}>
              {feito ? <Check size={11} /> : k}
            </span>
            <span className={cn('hidden sm:inline', agora ? 'text-ink' : 'text-ink-3')}>{n}</span>
            {k < 4 && <span className="h-px w-3 bg-line sm:w-6" />}
          </li>
        );
      })}
    </ol>
  );
}

export function CriacaoRapidaPage({ opcaoInicial, telaInicial, onIr }) {
  const [opcao, setOpcao] = useState(opcaoInicial || null);
  const [frase, setFrase] = useState('');
  const [foto, setFoto] = useState(null);           // { url } já no acervo
  const [subindo, setSubindo] = useState(false);
  const [onde, setOnde] = useState(['16/9']);
  const [quantas, setQuantas] = useState(1);
  const [fotos, setFotos] = useState('gerar');
  const [ajustar, setAjustar] = useState(false);
  const [plano, setPlano] = useState(null);         // resposta do plano (com rascunhos)
  const [etapa, setEtapa] = useState(null);         // progresso do trabalho
  const [telas, setTelas] = useState(null);
  const [alvos, setAlvos] = useState([]);
  const [pronto, setPronto] = useState(null);       // { pecas, nTelas, titulo }
  const [erro, setErro] = useState('');
  const [redesAberto, setRedesAberto] = useState(false);

  const perfil = usePerfil();
  const op = opcaoDoPerfil(opcao, perfil.id);
  const passo = pronto ? 5 : plano ? 3 : op ? 2 : 1;

  /*
   * Telas da conta. A publicação já vem MARCADA: com uma tela, ela; vindo
   * de uma tela ("Criar novo" no Adicionar conteúdo), aquela; senão todas —
   * a maioria das lojas tem uma ou duas e quer a novidade em todas.
   */
  useEffect(() => {
    devices.list().then((r) => {
      const lista = (r && r.devices) || [];
      setTelas(lista);
      const inicial = telaInicial && lista.some((t) => t.id === telaInicial) ? [telaInicial] : lista.map((t) => t.id);
      setAlvos(inicial);
    }).catch(() => setTelas([]));
  }, [telaInicial]);

  function recomecar() {
    setOpcao(null); setFrase(''); setFoto(null); setPlano(null); setPronto(null); setErro(''); setEtapa(null); feito.current = null;
  }

  async function escolherFoto(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setSubindo(true); setErro('');
    try {
      const up = await media.upload(f);
      /*
       * A foto entra no acervo da marca (imagens base): é por lá que o diretor
       * usa foto da empresa, e assim ela fica para as próximas criações. O
       * rótulo é a frase — é por ele que a IA sabe o que a foto mostra.
       */
      await brand.addAsset('base', up.url, (frase || op.titulo).slice(0, 160));
      setFoto({ url: up.url });
    } catch (e2) { setErro(e2.message || 'Não consegui enviar a foto.'); }
    finally { setSubindo(false); }
  }

  const pedido = () => ({
    /*
     * A frase da pessoa na primeira linha, o tipo na segunda. "Promoção com
     * preço: pão na chapa…" numa linha só virava o TÍTULO da peça quando a IA
     * está fora do ar (o plano de reserva usa a primeira linha do pedido).
     */
    brief: frase.trim() + '\n(' + op.pedido + ')',
    formatos: onde,
    // A Marca já sabe empresa, tom e público: o servidor lê de lá.
    pedido: { formatos: onde, quantidade: quantas, imagens: fotos },
    fotoProduto: foto ? foto.url : undefined,
  });

  // Passo 3: o plano com o rascunho de cada peça. Uma chamada de texto, nenhum crédito.
  async function verRascunho() {
    if (!frase.trim()) return;
    setErro(''); setEtapa({ etapa: 'entendendo o pedido', segundos: 0 });
    try {
      const id = await ai.directorStart({ ...pedido(), apenasPlano: true });
      const r = await ai.directorAcompanhar(id, setEtapa);
      setPlano(r);
    } catch (e) { setErro(e.message || 'Não deu para montar o rascunho. Tente de novo.'); }
    finally { setEtapa(null); }
  }

  // Passo 4: gera a versão final, guarda em Meus Designs e publica nas telas marcadas.
  /*
   * O que já foi gerado e guardado nesta tentativa. Se só o PUBLICAR falhar,
   * clicar de novo publica o mesmo — antes gerava tudo outra vez (gastando
   * criação) e duplicava a pasta em Meus Designs (D3).
   */
  const feito = React.useRef(null);
  async function publicar() {
    setErro(''); setEtapa({ etapa: 'desenhando a peça', segundos: 0 });
    try {
      let pecas = feito.current && feito.current.pecas;
      const titulo = (feito.current && feito.current.titulo) || frase.trim().split('\n')[0].slice(0, 60) || op.titulo;
      if (!pecas) {
        const id = await ai.directorStart({ ...pedido(), planoAprovado: plano.plano });
        const out = await ai.directorAcompanhar(id, setEtapa);
        pecas = ((out && out.pecas) || []).map((p) => ({ formato: p.formato, canal: p.canal, label: p.label, item: p.item, faixa: p.faixa }));
        if (!pecas.length) throw new Error('A peça não saiu. Tente de novo em instantes.');
        /*
         * O nome é a frase, não o "Campanha" que o diretor devolve sem IA. Além
         * de ser a pasta em Meus Designs, ele é a ORIGEM na tela: publicar troca
         * o que veio da mesma origem — com um nome fixo, cada criação nova
         * tiraria a anterior do ar.
         */
        await library.save(titulo, pecas);
        feito.current = { pecas, titulo };
      }
      if (alvos.length) await publicarPecas({ alvos, pecas, titulo, telas });
      feito.current = null;
      setPronto({ pecas, nTelas: alvos.length, titulo });
      aviso.ok(alvos.length ? 'Publicado em ' + alvos.length + ' tela(s).' : 'Guardado em Meus Designs.');
    } catch (e) { setErro(e.message || 'Não deu para publicar. Tente de novo.'); }
    finally { setEtapa(null); }
  }

  const rascunhos = (plano && plano.rascunhos) || [];
  const pecasDoPlano = (plano && plano.plano && plano.plano.pecas) || [];
  const custo = (plano && plano.orcamento && plano.orcamento.creditos) || 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        {passo > 1 && passo < 5 && (
          <button type="button" onClick={() => (plano ? setPlano(null) : recomecar())} aria-label="Voltar"
            className="rounded-md p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"><ArrowLeft size={18} /></button>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {passo === 1 ? 'O que você quer mostrar?' : passo === 2 ? op.titulo : passo === 3 ? 'Confira e publique' : 'Pronto!'}
        </h1>
      </div>
      {passo < 5 && <Passos atual={passo} />}

      {erro && <div className="mb-3 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{erro}</div>}

      {etapa ? (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Spinner size={26} />
            <div className="text-sm font-semibold text-ink">{etapa.etapa || 'trabalhando'}</div>
            {etapa.detalhe && <div className="text-xs text-ink-3">{etapa.detalhe}</div>}
            <div className="tnum text-2xs text-ink-3">{etapa.segundos || 0}s</div>
          </div>
        </Panel>
      ) : passo === 1 ? (
        <>
          <OpcoesDeCriar onEscolher={setOpcao} />
          {/*
            O resto continua existindo, só fora do caminho: quem quer desenhar
            do zero, gerar uma imagem solta ou trazer um arquivo do Canva acha
            em "Mais", em Meus Designs.
          */}
          <p className="mt-4 text-xs text-ink-3">
            Quer desenhar do zero, gerar uma imagem ou trazer um arquivo? Está em{' '}
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => onIr && onIr('designs')}>Meus Designs › Mais</button>.
          </p>
        </>
      ) : passo === 2 ? (
        <Panel>
          <div className="space-y-3 p-4">
            {op.foto && (
              <div className="flex items-center gap-3">
                {foto
                  ? <img src={foto.url} alt="" className="h-20 w-20 rounded-lg border border-line object-cover" />
                  : <span className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-line text-ink-3"><ImagePlus size={22} /></span>}
                <label className={cn('cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2', subindo && 'pointer-events-none opacity-60')}>
                  {subindo ? 'Enviando…' : foto ? 'Trocar a foto' : 'Tirar ou escolher a foto'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="hidden" onChange={escolherFoto} />
                </label>
              </div>
            )}
            <div>
              <label htmlFor="frase" className="mb-1 block text-xs font-medium text-ink-2">{op.dica}</label>
              <Textarea id="frase" autoFocus rows={2} value={frase} onChange={(e) => setFrase(e.target.value)} placeholder={op.exemplos[0]}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); verRascunho(); } }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {op.exemplos.map((x) => (
                <button key={x} type="button" onClick={() => setFrase(x)}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-accent/60 hover:text-ink">{x}</button>
              ))}
            </div>

            {/* O padrão serve quase sempre; quem quer mexer, mexe. */}
            <div className="rounded-lg border border-line">
              <button type="button" onClick={() => setAjustar((v) => !v)} aria-expanded={ajustar}
                className="flex w-full items-center justify-between px-3 py-2 text-xs text-ink-2 hover:text-ink">
                <span className="flex items-center gap-1.5"><SlidersHorizontal size={13} /> Ajustar</span>
                <span className="text-ink-3">{onde.map((f) => (ONDE.find((o) => o.id === f) || {}).nome).join(' e ')} · {quantas} {quantas === 1 ? 'peça' : 'peças'} · {fotos === 'nenhuma' ? 'sem foto' : 'com foto'}</span>
              </button>
              {ajustar && (
                <div className="space-y-2 border-t border-line p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 text-ink-3">Onde</span>
                    {ONDE.map((o) => {
                      const ativo = onde.includes(o.id);
                      return (
                        <button key={o.id} type="button" aria-pressed={ativo}
                          onClick={() => setOnde((x) => (ativo ? (x.length > 1 ? x.filter((y) => y !== o.id) : x) : [...x, o.id]))}
                          className={cn('rounded-md border px-2.5 py-1', ativo ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>{o.nome}</button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 text-ink-3">Quantas</span>
                    {[1, 2, 3].map((n) => (
                      <button key={n} type="button" aria-pressed={quantas === n} onClick={() => setQuantas(n)}
                        className={cn('rounded-md border px-2.5 py-1', quantas === n ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>{n}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 text-ink-3">Foto</span>
                    {FOTOS.map((o) => (
                      <button key={o.id} type="button" aria-pressed={fotos === o.id} onClick={() => setFotos(o.id)}
                        className={cn('rounded-md border px-2.5 py-1', fotos === o.id ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>{o.nome}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="primary" size="lg" disabled={!frase.trim() || (op.foto && !foto) || subindo} onClick={verRascunho}>
                Ver o rascunho
              </Button>
            </div>
          </div>
        </Panel>
      ) : passo === 3 ? (
        <div className="space-y-3">
          {/* 3 · o rascunho */}
          <Panel>
            <div className="space-y-3 p-4">
              {pecasDoPlano.map((p, i) => {
                const r = rascunhos[i];
                // Foto que ainda vai ser gerada não existe: aí o rascunho mostra a silhueta.
                const silhueta = !!(p.precisaImagem && p.promptImagem);
                return (
                  <div key={i} className="space-y-1.5">
                    {r ? (
                      <div className={p.formato === '9/16' ? 'mx-auto w-40' : ''}>
                        <PecaHtml item={r} formato={r.formato in TAMANHO_REAL ? r.formato : '16/9'} rascunho={silhueta} />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-line bg-surface-2 p-4">
                        <div className="text-lg font-semibold text-ink">{p.headline}</div>
                        {p.sub && <div className="text-sm text-ink-2">{p.sub}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-ink-3">
                Rascunho com o seu texto e a sua marca. A arte final é desenhada ao publicar.{' '}
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => setPlano(null)}>Mudar a frase</button>
              </p>
            </div>
          </Panel>

          {/* 4 · publicar, na tela já marcada */}
          <Panel>
            <div className="space-y-3 p-4">
              {telas === null ? <Spinner size={16} /> : telas.length ? (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-ink-2">Publicar em</div>
                  <div className="flex flex-wrap gap-1.5">
                    {telas.map((t) => {
                      const ativo = alvos.includes(t.id);
                      return (
                        <button key={t.id} type="button" aria-pressed={ativo}
                          onClick={() => setAlvos((a) => (ativo ? a.filter((x) => x !== t.id) : [...a, t.id]))}
                          className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
                            ativo ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2')}>
                          {ativo ? <Check size={12} className="text-accent" /> : <MonitorPlay size={12} />} {t.name || 'Tela'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-2">
                  Você ainda não tem TV conectada. A peça fica guardada em Meus Designs e você publica depois.{' '}
                  <button type="button" className="font-medium text-accent hover:underline" onClick={() => onIr && onIr('screens')}>Conectar uma TV</button>
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink-3">{custo ? custo + (custo === 1 ? ' criação com foto' : ' criações com foto') : 'Sem foto gerada · não usa criação'}</span>
                <Button variant="primary" size="lg" icon={Rocket} onClick={publicar}>
                  {alvos.length ? 'Publicar' : 'Guardar'}
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <Panel>
          <div className="space-y-4 p-4">
            {/* Sem TV ainda: o próximo passo é ligar uma (PLANO §5.3) — e a peça vai junto no pareamento. */}
            {!pronto.nTelas && (
              <ProximoPasso feito="A peça está pronta." proximo="ligar a TV; depois é só publicar esta peça nela, em Mídias › Peças prontas." acao="Ligar a TV"
                onIr={() => onIr && onIr('screens', { abrirParear: true })} />
            )}
            <div className="flex items-center gap-2 text-sm text-ink">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ok/15 text-ok"><Check size={16} /></span>
              {pronto.nTelas ? 'No ar em ' + pronto.nTelas + (pronto.nTelas === 1 ? ' tela.' : ' telas.') : 'Guardado em Meus Designs.'}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {pronto.pecas.map((p, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-line"><DesignThumb item={p.item} /></div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {/* A mesma peça, nas redes: post, Story, Status e o texto de cada uma. */}
              <Button variant="primary" icon={Share2} onClick={() => setRedesAberto(true)}>Postar nas redes</Button>
              <Button variant="secondary" icon={RefreshCw} onClick={recomecar}>Criar outra</Button>
              <Button variant="secondary" onClick={() => onIr && onIr('designs')}>Ver em Meus Designs</Button>
            </div>
          </div>
        </Panel>
      )}
      {redesAberto && pronto && <RedesSociais item={pronto.pecas[0].item} label={pronto.titulo} onFechar={() => setRedesAberto(false)} />}
    </div>
  );
}
