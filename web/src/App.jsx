import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { auth, brand, primeiraTv as primeiraTvApi } from './api.js';
import { cadastroPeloGoogle } from './lib/analytics.js';
import { AppShell } from './components/layout/AppShell.jsx';
import { LimiteDeErro } from './components/layout/LimiteDeErro.jsx';
import { AuthScreen } from './pages/AuthScreen.jsx';
import { ligarTrabalhos, desligarTrabalhos } from './lib/trabalhos.js';
import { Spinner } from './components/ui/Feedback.jsx';
import { parearGuardado } from './lib/parearPendente.js';
import { paginaDoIr } from './lib/menu.js';
import { definirPerfil, usePerfil } from './lib/perfil.js';
import { carregarPacote } from './lib/pacoteOuro.js';
import { carregarDesenhista } from './lib/pecaHtml.js';

/*
 * Cada página num pacote próprio (QA de 26/10). O painel vinha num arquivo
 * só de 965 KB: quem abria para ver se a TV estava ligada baixava também o
 * editor, o banco de imagens, a cobrança e o painel da plataforma. Agora o
 * Início chega com o essencial e o resto vem quando a pessoa abre.
 *
 * Se o pacote falhar (deploy novo trocou o hash, rede caiu no meio), uma
 * recarga resolve: o service worker do painel busca a lista nova.
 */
function pagina(carregar, nome) {
  return lazy(() => carregar().then((m) => {
    try { sessionStorage.removeItem('mt.recarregou'); } catch (x) { /* idem */ }
    return { default: m[nome] };
  }).catch((e) => {
    try {
      if (!sessionStorage.getItem('mt.recarregou')) { sessionStorage.setItem('mt.recarregou', '1'); window.location.reload(); }
    } catch (x) { /* sem sessionStorage: cai no limite de erro */ }
    throw e;
  }));
}
const DashboardPage = pagina(() => import('./pages/DashboardPage.jsx'), 'DashboardPage');
const ProgramacaoPage = pagina(() => import('./pages/ProgramacaoPage.jsx'), 'ProgramacaoPage');
const ScreensPage = pagina(() => import('./pages/ScreensPage.jsx'), 'ScreensPage');
const ContentEditorPage = pagina(() => import('./pages/ContentEditorPage.jsx'), 'ContentEditorPage');
const TeamPage = pagina(() => import('./pages/TeamPage.jsx'), 'TeamPage');
const ArquivosPage = pagina(() => import('./pages/ArquivosPage.jsx'), 'ArquivosPage');
const BancoImagensPage = pagina(() => import('./pages/BancoImagensPage.jsx'), 'BancoImagensPage');
const BirthdaysPage = pagina(() => import('./pages/BirthdaysPage.jsx'), 'BirthdaysPage');
const MyDesignsPage = pagina(() => import('./pages/MyDesignsPage.jsx'), 'MyDesignsPage');
const BrandPage = pagina(() => import('./pages/BrandPage.jsx'), 'BrandPage');
const MuralPage = pagina(() => import('./pages/MuralPage.jsx'), 'MuralPage');
const SettingsPage = pagina(() => import('./pages/SettingsPage.jsx'), 'SettingsPage');
const AlertsPage = pagina(() => import('./pages/AlertsPage.jsx'), 'AlertsPage');
const SupportPage = pagina(() => import('./pages/SupportPage.jsx'), 'SupportPage');
const BillingPage = pagina(() => import('./pages/BillingPage.jsx'), 'BillingPage');
const SystemPage = pagina(() => import('./pages/SystemPage.jsx'), 'SystemPage');
const PlatformPage = pagina(() => import('./pages/PlatformPage.jsx'), 'PlatformPage');
const PlaceholderPage = pagina(() => import('./pages/PlaceholderPage.jsx'), 'PlaceholderPage');
const RelatorioPage = pagina(() => import('./pages/RelatorioPage.jsx'), 'RelatorioPage');
const IndicadoresPage = pagina(() => import('./pages/IndicadoresPage.jsx'), 'IndicadoresPage');
const PlanilhasPage = pagina(() => import('./pages/PlanilhasPage.jsx'), 'PlanilhasPage');
const CriarPage = pagina(() => import('./pages/CriarPage.jsx'), 'CriarPage');
const CriacaoRapidaPage = pagina(() => import('./pages/CriacaoRapidaPage.jsx'), 'CriacaoRapidaPage');
const CampanhasPage = pagina(() => import('./pages/CampanhasPage.jsx'), 'CampanhasPage');
const CriandoPage = pagina(() => import('./pages/CriandoPage.jsx'), 'CriandoPage');
// Fase 10: a página Prontos para você (as telas inteiras e as peças, numa grade só).
const PecasProntasPage = pagina(() => import('./pages/PecasProntasPage.jsx'), 'PecasProntasPage');
const CalendarioPage = pagina(() => import('./pages/CalendarioPage.jsx'), 'CalendarioPage');
// Fase 7: a Biblioteca única. Fase 10: as abas são as próprias páginas; os Apps moram em BibliotecaPage.
const AppsPage = pagina(() => import('./pages/BibliotecaPage.jsx'), 'AppsPage');
// Fase 13: a fila de aprovação (o dono aprova pelo celular; o membro vê a resposta).
const AprovacoesPage = pagina(() => import('./pages/AprovacoesPage.jsx'), 'AprovacoesPage');
// Fase 12: a chamada de senha (a recepção chama, a TV da sala de espera mostra).
const SenhaPage = pagina(() => import('./pages/SenhaPage.jsx'), 'SenhaPage');
// "Sua primeira TV em 5 minutos": o passo a passo da conta nova, fora da moldura do painel.
const PrimeiraTvPage = pagina(() => import('./pages/PrimeiraTvPage.jsx'), 'PrimeiraTvPage');

const META = {
  overview: { title: 'Início' },
  // Fase 7: a Biblioteca única. Fase 10: Prontos, Campanhas, Peças guardadas, Fotos e vídeos e Apps, sem partes dentro.
  prontos: { title: 'Biblioteca', subtitle: 'Pronto para pôr na TV, já na sua marca.' },
  apps: { title: 'Biblioteca', subtitle: 'Conteúdos que se atualizam sozinhos.' },
  criar: { title: 'Criar' },
  // Os quatro passos de antes do chat (item 24): continuam, em Meus Designs › Mais.
  rapida: { title: 'Criação rápida', nav: 'criar' },
  // A campanha do Criar como unidade (item 29); a aba Criados desde o D47.
  campanhas: { title: 'Campanhas' },
  criando: { title: 'Criando' },
  screens: { title: 'Telas' },
  // O que passa em cada TV, com aba própria (item 40).
  programacao: { title: 'Programação' },
  designs: { title: 'Peças guardadas', subtitle: 'O que você guardou, pronto para reaproveitar e pôr na TV.' },
  // Endereços antigos que abrem Meus Designs.
  studio: { title: 'Peças guardadas', nav: 'designs' },
  campaigns: { title: 'Peças guardadas', nav: 'designs' },
  images: { title: 'Peças guardadas', nav: 'designs' },
  team: { title: 'Equipe' },
  aprovacoes: { title: 'Aprovações' },
  brand: { title: 'Marca', subtitle: 'Cores, fontes e imagens que a IA usa para criar.' },
  mural: { title: 'Mural de fotos', subtitle: 'O público manda foto pelo QR e ela aparece na TV.' },
  content: { title: 'Telas', nav: 'screens' },
  alerts: { title: 'Alertas', subtitle: 'O que precisa da sua atenção agora.' },
  relatorio: { title: 'Relatório de exibição', subtitle: 'O que passou, quantas vezes e em qual tela — contado pela própria TV.' },
  indicadores: { title: 'Indicadores', subtitle: 'Os números da empresa na TV, sempre atualizados.' },
  planilhas: { title: 'Preços da planilha', subtitle: 'O preço muda na planilha e a TV muda junto.' },
  senha: { title: 'Chamada de senha' },
  support: { title: 'Suporte', subtitle: 'Dúvidas frequentes e contato.' },
  // Mídias por propósito (item 34). 'storage' segue como endereço: é Fotos e vídeos.
  pecas: { title: 'Peças prontas' },
  telasprontas: { title: 'Telas prontas' },
  calendario: { title: 'Agenda' },
  storage: { title: 'Biblioteca', subtitle: 'Suas fotos, vídeos e músicas.' },
  // Viraram filtros de Arquivos (QA de 26/10); o endereço continua e acende a aba Arquivos.
  musicas: { title: 'Arquivos', nav: 'storage' },
  ia: { title: 'Arquivos', nav: 'storage' },
  banco: { title: 'Banco de Imagens', subtitle: 'Acervo compartilhado entre os clientes. Usar daqui não gasta criação.' },
  birthdays: { title: 'Pessoas', subtitle: 'A equipe: setor, foto e aniversário, que a TV mostra sozinha.' },
  billing: { title: 'Plano e cobrança' },
  system: { title: 'Estado do sistema', subtitle: 'O que está configurado, e o que vai doer se ficar como está.' },
  platform: { title: 'Plataforma' },
  settings: { title: 'Ajustes', subtitle: 'Conta, integrações e preferências.' },
};

/*
 * O título que muda com a frente: o calendário é "da empresa", "da clínica"
 * ou "da loja" (QA de lançamento, 03/11: "Calendário da empresa" aparecia
 * numa padaria). O resto vem do META.
 */
function tituloDe(nome, perfil) {
  // Fase 8: a página é a Agenda (a semana na TV e as datas), o nome do menu.
  if (nome === 'calendario') return 'Agenda';
  if (nome === 'primeiratv') return 'Sua primeira TV';
  return (META[nome] || META.overview).title;
}

// A cor da barra do sistema no app instalado. Precisa casar com --c-canvas de
// cada tema: instalado, o app pinta a barra de status com este valor, e uma
// barra escura em cima de um painel claro parece defeito de renderização.
const COR_BARRA = { light: '#F7F8FA', dark: '#0C0E12' };

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('mt.theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mt.theme', theme);
    const etiqueta = document.querySelector('meta[name="theme-color"]');
    if (etiqueta) etiqueta.setAttribute('content', COR_BARRA[theme] || COR_BARRA.light);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

/*
 * Onde a sessão começa, lido da URL.
 *
 * Dois caminhos chegam aqui com destino já escolhido: a volta do checkout
 * (`?billing=success|cancel`) e os atalhos do app instalado — aqueles que
 * aparecem ao segurar o ícone na tela inicial e apontam para `/app/?ir=telas`.
 * Um atalho que caísse sempre na visão geral não seria atalho.
 *
 * A lista de destinos é fechada de propósito: `?ir=` vem da URL, e URL é coisa
 * que qualquer um escreve.
 */
// campanhas, pecas, musicas e ia entraram no D3: recarregar nessas páginas caía na Visão geral.
// Fase 10: 'seus' saiu (não é mais aba); o endereço antigo abre as Campanhas (lib/menu.js, APELIDOS).
const ATALHOS = ['prontos', 'apps', 'criar', 'campanhas', 'screens', 'programacao', 'designs', 'brand', 'mural', 'billing', 'alerts', 'relatorio', 'indicadores', 'senha', 'planilhas',
  'team', 'aprovacoes', 'storage', 'pecas', 'telasprontas', 'calendario', 'musicas', 'ia', 'banco', 'birthdays', 'support', 'settings'];

/*
 * O painel no histórico do navegador.
 *
 * A troca de página era só estado do React: no celular — onde o dono da loja
 * mais usa — o gesto de VOLTAR saía do painel em vez de voltar para a tela
 * anterior, e recarregar sempre caía na visão geral. Cada navegação agora vira
 * uma entrada no histórico, e o endereço guarda a página (`?ir=`) para
 * sobreviver ao recarregar. O editor de uma tela recarrega em Telas: o
 * aparelho vem da lista, não do endereço.
 */
/*
 * Os endereços de antes abrem o lugar novo da Biblioteca (fase 7, e de novo
 * na fase 10, quando as partes das abas viraram abas e filtro). Peças
 * prontas e Telas prontas são "Prontos para você" (as telas com o filtro
 * "Telas inteiras"); "Seus conteúdos", que já foi aba, abre as Campanhas
 * (ou as Peças guardadas, se era essa a parte); os nomes antigos de Meus
 * Designs abrem as Peças guardadas. O que vinha junto (a campanha, a TV) segue.
 */
const NA_BIBLIOTECA = {
  telasprontas: { name: 'prontos', filtro: 'telas' }, pecas: { name: 'prontos' },
  studio: { name: 'designs' }, campaigns: { name: 'designs' }, images: { name: 'designs' },
};
function naBiblioteca(r) {
  if (!r) return r;
  const { parte, ...resto } = r;
  // Uma entrada do histórico de antes da fase 10 ainda pode trazer a parte.
  if (r.name === 'seus') return { ...resto, name: parte === 'pecas' ? 'designs' : 'campanhas' };
  if (r.name === 'prontos' && parte === 'telas') return { ...resto, filtro: 'telas' };
  const novo = NA_BIBLIOTECA[r.name];
  return novo ? { ...resto, ...novo } : r;
}

function enderecoDaRota(r) {
  if (r.name === 'content') return '/app/?ir=screens';
  // Recarregar no meio do passo a passo volta a ele (o progresso está guardado na conta).
  if (r.name === 'primeiratv') return '/app/?ir=primeiratv';
  if (ATALHOS.includes(r.name)) return '/app/?ir=' + r.name;
  return '/app/';
}

function rotaDaUrl() {
  const q = new URLSearchParams(window.location.search);
  /*
   * Veio do QR da TV: abre Telas com o pareamento já preenchido. Se a pessoa
   * ainda não estava logada, o endereço sobrevive ao login e cai aqui depois.
   */
  const parear = (q.get('parear') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || parearGuardado();
  if (parear) return { name: 'screens', parear };
  if (q.get('billing')) return { name: 'billing' };
  // O passo a passo da primeira TV não é página do menu: tem endereço próprio, fora da lista de ?ir=.
  if (q.get('ir') === 'primeiratv') return { name: 'primeiratv' };
  /*
   * `?ir=` aceita o nome de uma página (o endereço antigo, que continua
   * valendo) ou de um grupo do menu novo (`?ir=midias` abre a primeira aba).
   */
  const ir = paginaDoIr(q.get('ir'));
  if (ir) return naBiblioteca({ name: ir });
  return { name: 'overview' };
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando
  const [route, setRoute] = useState(rotaDaUrl);
  const [theme, toggleTheme] = useTheme();
  const perfil = usePerfil();

  /*
   * Por que o painel não abriu, em palavras certas (reteste da fase 10): o
   * freio da conta (429) aparecia como "Sem conexão", e a pessoa ia mexer na
   * internet que estava boa. `semRede`: null (abriu), 'rede', 'limite' ou
   * 'servidor'; `espera`: os segundos até tentar de novo sozinho, no 429.
   */
  const [semRede, setSemRede] = useState(null);
  const [espera, setEspera] = useState(0);
  const refresh = () => auth.me()
    .then((me) => {
      setSemRede(null);
      // Empresa, Comércio ou Saúde: as páginas leem com usePerfil() (D4).
      if (me && me.tenant) definirPerfil(me.tenant.perfil);
      // A logo da marca: as prévias das peças desenham com ela, como a TV (D8).
      globalThis.MT_LOGO = (me && me.tenant && me.tenant.logo) || null;
      setSession(me || null);
    })
    .catch((e) => {
      if (e && e.status === 429) { setEspera(Math.min(300, Math.max(5, e.retryAfter || 30))); setSemRede('limite'); }
      else setSemRede(e && e.status ? 'servidor' : 'rede');
    });
  // No 429 o painel tenta de novo sozinho quando o freio solta, com a contagem à vista.
  useEffect(() => {
    if (semRede !== 'limite') return undefined;
    if (espera <= 0) { refresh(); return undefined; }
    const t = setTimeout(() => setEspera((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [semRede, espera]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cadastroPeloGoogle(); refresh(); }, []);

  /*
   * O Prontos (reteste 2): o pacote das peças e o desenhista começam junto
   * com a página, e não depois que ela chega. No 4G lento eram três ondas,
   * uma depois da outra (a página, o desenhista, o pacote).
   */
  const deslogado = session === null;
  useEffect(() => {
    if (route.name !== 'prontos' || deslogado) return;
    carregarPacote().catch(() => {});
    carregarDesenhista().catch(() => {});
  }, [route.name, deslogado]);
  // A marca, que o Prontos espera para desenhar: com a sessão de pé, já.
  useEffect(() => { if (route.name === 'prontos' && session) brand.adiantar(); }, [route.name, !!session]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (name, params) => {
    const r = naBiblioteca({ name, ...params });
    setRoute(r);
    try { window.history.pushState({ mtRota: r }, '', enderecoDaRota(r)); } catch (e) { /* sem histórico: segue só com o estado */ }
  };
  useEffect(() => {
    try { window.history.replaceState({ ...(window.history.state || {}), mtRota: route }, '', window.location.href); } catch (e) { /* idem */ }
    const voltar = (e) => {
      const r = e.state && e.state.mtRota;
      if (!r) { setRoute(rotaDaUrl()); return; }
      // Voltar não reabre o pareamento: aquele código já foi usado.
      const { parear, abrirParear, ...resto } = r;
      // "Montar a TV de novo" também não recomeça de novo ao voltar para ele: o progresso de agora fica.
      delete resto.deNovo;
      // Uma entrada antiga do histórico (a aba "Seus conteúdos", que saiu na fase 10) cai no lugar novo.
      setRoute(naBiblioteca(resto));
    };
    window.addEventListener('popstate', voltar);
    return () => window.removeEventListener('popstate', voltar);
  }, []);

  /*
   * O observador das gerações (D11): avisa "ficou pronta" em qualquer página.
   * A página atual vai por referência: o Criar já mostra o próprio resultado.
   */
  const rotaAtual = useRef(route.name);
  rotaAtual.current = route.name;
  useEffect(() => {
    if (session) ligarTrabalhos(go, () => rotaAtual.current);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * "SUA PRIMEIRA TV EM 5 MINUTOS": a conta nova (sem TV no ar) cai direto
   * no passo a passo, uma vez por sessão do painel — o servidor diz quando
   * (`abrir`: dono ou administrador, sem ter terminado nem saído). E o QR da
   * TV lido no meio do passo "Ligar a TV" volta para ele, com o código.
   */
  const rotaInicial = useRef(route);
  const conferiuPrimeira = useRef(false);
  useEffect(() => {
    if (!session || conferiuPrimeira.current) return;
    conferiuPrimeira.current = true;
    primeiraTvApi.ler().then((r) => {
      const e = r && r.estado;
      if (!e) return;
      const ini = rotaInicial.current || {};
      if (ini.name === 'screens' && ini.parear && rotaAtual.current === 'screens' && !e.fim && e.passo === 'tv') go('primeiratv', { parear: ini.parear });
      else if (r.abrir && rotaAtual.current === 'overview') go('primeiratv');
    }).catch(() => { /* sem o passo a passo, o Início de sempre */ });
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  async function logout() {
    desligarTrabalhos();
    // Os rascunhos das TVs (D14) não ficam para a próxima pessoa no mesmo computador (revisão do #232).
    try { Object.keys(localStorage).filter((k) => k.startsWith('mt.rascunho.')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* sem acesso */ }
    await auth.logout();
    conferiuPrimeira.current = false;
    setSession(null);
    setRoute({ name: 'overview' });
  }

  /*
   * O título da aba muda por página (QA de lançamento, 03/11): era sempre
   * "MultiTelas — Painel", e quem tem várias abas, ou ouve o leitor de tela
   * ao trocar de página, não sabia onde estava. A tela de entrar põe o seu.
   */
  const tituloDaPagina = session ? tituloDe(route.name, perfil) : '';
  useEffect(() => {
    if (tituloDaPagina) document.title = tituloDaPagina + ' · ' + perfil.marca;
  }, [tituloDaPagina, perfil.marca]);

  if (session === undefined && semRede) {
    const TEXTOS = {
      rede: ['Sem conexão com o MultiTelas', 'Suas TVs continuam mostrando a última programação. Assim que a internet voltar, o painel abre.'],
      limite: ['Muitos pedidos desta conta agora', 'Acontece quando várias pessoas usam o painel ao mesmo tempo. Suas TVs continuam no ar. O painel abre sozinho em ' + espera + ' s.'],
      servidor: ['O MultiTelas não respondeu agora', 'Suas TVs continuam mostrando a última programação. Tente de novo em instantes.'],
    };
    const [titulo, texto] = TEXTOS[semRede] || TEXTOS.rede;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center" role="alert">
        <p className="text-sm font-semibold text-ink">{titulo}</p>
        <p className="max-w-xs text-xs text-ink-3">{texto}</p>
        <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={refresh}>Tentar de novo</button>
      </div>
    );
  }
  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner size={22} />
      </div>
    );
  }

  if (!session) return <AuthScreen onAuthed={refresh} />;

  const user = session.user || {};

  // O passo a passo da primeira TV ocupa a tela inteira: sem menu, só o passo, o "Voltar" e o "Sair".
  if (route.name === 'primeiratv') {
    return (
      <LimiteDeErro key="primeiratv">
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-canvas"><Spinner size={22} /></div>}>
          <PrimeiraTvPage key={route.deNovo ? 'de-novo' : 'continuar'} me={user} parear={route.parear} comecarDeNovo={!!route.deNovo}
            onIr={go} onSair={() => go('overview')} />
        </Suspense>
      </LimiteDeErro>
    );
  }

  const meta = { ...(META[route.name] || META.overview), title: tituloDaPagina || (META[route.name] || META.overview).title };
  const navActive = meta.nav || route.name; // qual item da sidebar destacar

  function renderPage() {
    switch (route.name) {
      case 'overview': return <DashboardPage onGoSystem={() => go('system')} onIr={go} operador={!!session.operador} />;
      case 'screens': return <ScreensPage parear={route.parear} abrirParear={!!route.abrirParear} onEditContent={(device) => go('content', { device })} onCriar={(device) => go('criar', { tela: device.id })} onIrParaPlano={() => go('billing')} papel={user.role} />;
      case 'programacao': return <ProgramacaoPage onIr={go} />;
      case 'content': return <ContentEditorPage device={route.device} zonaInicial={route.zona} onBack={() => go('screens')} onCriar={(zona) => go('criar', { tela: route.device && route.device.id, zona: typeof zona === 'string' ? zona : undefined })} onIr={go} />;
      case 'aprovacoes': return <AprovacoesPage me={user} onIr={go} />;
      case 'team': return <TeamPage key={route.convidar ? 'convidar' : 'equipe'} me={user} onLeft={logout} abrirConvite={!!route.convidar} />;
      case 'prontos': return <PecasProntasPage key={(route.filtro || '') + (route.tela || '')} filtroInicial={route.filtro} telaAlvo={route.tela} onIr={go} />;
      case 'apps': return <AppsPage onIr={go} />;
      // Endereços antigos: naBiblioteca já leva a 'prontos'; ficam aqui para nenhum link cair no vazio.
      case 'pecas': return <PecasProntasPage onIr={go} />;
      case 'telasprontas': return <PecasProntasPage filtroInicial="telas" telaAlvo={route.tela} onIr={go} />;
      case 'calendario': return <CalendarioPage onIr={go} />;
      case 'storage': return <ArquivosPage filtro="fotos" onIr={go} />;
      case 'musicas': return <ArquivosPage filtro="musicas" onIr={go} />;
      case 'ia': return <ArquivosPage filtro="ia" onIr={go} />;
      case 'banco': return <BancoImagensPage operador={!!session.operador} />;
      /*
       * A chave remonta o Criar quando se chega de novo com outra opção (do
       * Início, ou de "Criar novo" numa tela) — senão ficaria no passo antigo.
       */
      case 'criar': return <CriarPage key={(route.opcao || '') + (route.tela || '') + (route.zona || '') + (route.ideia || '') + (route.conversa || '') + (route.texto || '')} opcaoInicial={route.opcao} telaInicial={route.tela} zonaInicial={route.zona} ideiaInicial={route.ideia} conversaInicial={route.conversa} aprovarInicial={!!route.aprovar} textoInicial={route.texto} onIr={go} />;
      case 'rapida': return <CriacaoRapidaPage key={(route.opcao || '') + (route.tela || '')} opcaoInicial={route.opcao} telaInicial={route.tela} onIr={go} />;
      case 'campanhas': return <CampanhasPage key={route.campanha || ''} campanhaInicial={route.campanha} pedidoInicial={route.pedido} onIr={go} />;
      case 'criando': return <CriandoPage onIr={go} />;
      case 'designs': case 'studio': case 'campaigns': case 'images': return <MyDesignsPage onIr={go} />;
      case 'brand': return <BrandPage onIr={go} />;
      case 'mural': return <MuralPage />;
      case 'birthdays': return <BirthdaysPage />;
      case 'relatorio': return <RelatorioPage onIrParaPlano={() => go('billing')} />;
      case 'indicadores': return <IndicadoresPage />;
      case 'planilhas': return <PlanilhasPage />;
      case 'senha': return <SenhaPage onIr={go} />;
      case 'billing': return <BillingPage onFalarComVendas={() => go('support')} />;
      case 'system': return <SystemPage />;
      case 'platform': return <PlatformPage />;
      case 'alerts': return <AlertsPage onGoScreens={() => go('screens')} onGoStorage={() => go('storage')} onGoBilling={() => go('billing')} onAbrirTela={(d) => go('content', { device: d })} />;
      case 'support': return <SupportPage me={session} />;
      case 'settings': return (
        <SettingsPage me={session} theme={theme} onToggleTheme={toggleTheme} onLogout={logout} onChanged={refresh} onFalarComSuporte={() => go('support')} />
      );
      default: return <PlaceholderPage title={meta.title} subtitle={meta.subtitle} />;
    }
  }

  return (
    <AppShell
      active={navActive}
      onNavigate={(name, params) => go(name, params)}
      title={meta.title}
      theme={theme}
      onToggleTheme={toggleTheme}
      user={user}
      empresa={session.tenant && session.tenant.name}
      operador={!!session.operador}
      suporte={session.suporte || null}
      onLogout={logout}
    >
      {/*
        A chave é a rota: sem ela, uma tela que falhou deixaria o painel preso
        na mensagem de erro para sempre — trocar de menu não remonta o limite,
        e a pessoa teria que recarregar mesmo para ir a outro lugar.
      */}
      <LimiteDeErro key={route.name}>
        <Suspense fallback={<div className="flex justify-center py-16"><Spinner size={22} /></div>}>
          {renderPage()}
        </Suspense>
      </LimiteDeErro>
    </AppShell>
  );
}
