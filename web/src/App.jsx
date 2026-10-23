import React, { useEffect, useRef, useState } from 'react';
import { auth } from './api.js';
import { AppShell } from './components/layout/AppShell.jsx';
import { LimiteDeErro } from './components/layout/LimiteDeErro.jsx';
import { AuthScreen } from './pages/AuthScreen.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ProgramacaoPage } from './pages/ProgramacaoPage.jsx';
import { ScreensPage } from './pages/ScreensPage.jsx';
import { ContentEditorPage } from './pages/ContentEditorPage.jsx';
import { TeamPage } from './pages/TeamPage.jsx';
import { StoragePage } from './pages/StoragePage.jsx';
import { BancoImagensPage } from './pages/BancoImagensPage.jsx';
import { BirthdaysPage } from './pages/BirthdaysPage.jsx';
import { MyDesignsPage } from './pages/MyDesignsPage.jsx';
import { BrandPage } from './pages/BrandPage.jsx';
import { MuralPage } from './pages/MuralPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { AlertsPage } from './pages/AlertsPage.jsx';
import { SupportPage } from './pages/SupportPage.jsx';
import { BillingPage } from './pages/BillingPage.jsx';
import { SystemPage } from './pages/SystemPage.jsx';
import { PlatformPage } from './pages/PlatformPage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';
import { RelatorioPage } from './pages/RelatorioPage.jsx';
import { CriarPage } from './pages/CriarPage.jsx';
import { CriacaoRapidaPage } from './pages/CriacaoRapidaPage.jsx';
import { CampanhasPage } from './pages/CampanhasPage.jsx';
import { CriandoPage } from './pages/CriandoPage.jsx';
import { ligarTrabalhos, desligarTrabalhos } from './lib/trabalhos.js';
import { PecasProntasPage } from './pages/PecasProntasPage.jsx';
import { TelasProntasPage } from './pages/TelasProntasPage.jsx';
import { Spinner } from './components/ui/Feedback.jsx';
import { parearGuardado } from './lib/parearPendente.js';
import { paginaDoIr } from './lib/menu.js';
import { definirPerfil } from './lib/perfil.js';

const META = {
  overview: { title: 'Visão geral' },
  criar: { title: 'Criar' },
  // Os quatro passos de antes do chat (item 24): continuam, em Meus Designs › Mais.
  rapida: { title: 'Criação rápida', nav: 'criar' },
  // A campanha do Criar como unidade (item 29).
  campanhas: { title: 'Campanhas' },
  criando: { title: 'Criando' },
  screens: { title: 'Telas' },
  // O que passa em cada TV, com aba própria (item 40).
  programacao: { title: 'Programação' },
  designs: { title: 'Meus Designs', subtitle: 'Crie, guarde e reaproveite todos os seus designs.' },
  // Endereços antigos que abrem Meus Designs.
  studio: { title: 'Meus Designs', nav: 'designs' },
  campaigns: { title: 'Meus Designs', nav: 'designs' },
  images: { title: 'Meus Designs', nav: 'designs' },
  team: { title: 'Equipe' },
  brand: { title: 'Marca', subtitle: 'Cores, fontes e imagens que a IA usa para criar.' },
  mural: { title: 'Mural de fotos', subtitle: 'O público manda foto pelo QR e ela aparece na TV.' },
  content: { title: 'Programação', nav: 'programacao' },
  alerts: { title: 'Alertas', subtitle: 'O que precisa da sua atenção agora.' },
  relatorio: { title: 'Relatório de exibição', subtitle: 'O que passou, quantas vezes e em qual tela — contado pela própria TV.' },
  support: { title: 'Suporte', subtitle: 'Dúvidas frequentes e contato.' },
  // Mídias por propósito (item 34). 'storage' segue como endereço: é Fotos e vídeos.
  pecas: { title: 'Peças prontas' },
  telasprontas: { title: 'Telas prontas' },
  storage: { title: 'Fotos e vídeos' },
  musicas: { title: 'Músicas' },
  ia: { title: 'Da IA' },
  banco: { title: 'Banco de Imagens', subtitle: 'Acervo compartilhado entre os clientes. Usar daqui não gasta criação.' },
  birthdays: { title: 'Aniversariantes', subtitle: 'A lista da equipe, para mostrar na TV quem faz aniversário.' },
  billing: { title: 'Plano e cobrança' },
  system: { title: 'Estado do sistema', subtitle: 'O que está configurado, e o que vai doer se ficar como está.' },
  platform: { title: 'Plataforma' },
  settings: { title: 'Ajustes', subtitle: 'Conta, integrações e preferências.' },
};

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
const ATALHOS = ['criar', 'campanhas', 'screens', 'programacao', 'designs', 'brand', 'mural', 'billing', 'alerts', 'relatorio',
  'team', 'storage', 'pecas', 'telasprontas', 'musicas', 'ia', 'banco', 'birthdays', 'support', 'settings'];

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
function enderecoDaRota(r) {
  if (r.name === 'content') return '/app/?ir=programacao';
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
  /*
   * `?ir=` aceita o nome de uma página (o endereço antigo, que continua
   * valendo) ou de um grupo do menu novo (`?ir=midias` abre a primeira aba).
   */
  const ir = paginaDoIr(q.get('ir'));
  if (ir) return { name: ir };
  return { name: 'overview' };
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando
  const [route, setRoute] = useState(rotaDaUrl);
  const [theme, toggleTheme] = useTheme();

  const [semRede, setSemRede] = useState(false);
  const refresh = () => auth.me()
    .then((me) => {
      setSemRede(false);
      // Empresa, Comércio ou Saúde: as páginas leem com usePerfil() (D4).
      if (me && me.tenant) definirPerfil(me.tenant.perfil);
      // A logo da marca: as prévias das peças desenham com ela, como a TV (D8).
      globalThis.MT_LOGO = (me && me.tenant && me.tenant.logo) || null;
      setSession(me || null);
    })
    .catch(() => setSemRede(true));
  useEffect(() => { refresh(); }, []);

  const go = (name, params) => {
    const r = { name, ...params };
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
      setRoute(resto);
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

  async function logout() {
    desligarTrabalhos();
    // Os rascunhos das TVs (D14) não ficam para a próxima pessoa no mesmo computador (revisão do #232).
    try { Object.keys(localStorage).filter((k) => k.startsWith('mt.rascunho.')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* sem acesso */ }
    await auth.logout();
    setSession(null);
    setRoute({ name: 'overview' });
  }

  if (session === undefined && semRede) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <p className="text-sm font-semibold text-ink">Sem conexão com o MultiTelas</p>
        <p className="max-w-xs text-xs text-ink-3">Suas TVs continuam mostrando a última programação. Assim que a internet voltar, o painel abre.</p>
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
  const meta = META[route.name] || META.overview;
  const navActive = meta.nav || route.name; // qual item da sidebar destacar

  function renderPage() {
    switch (route.name) {
      case 'overview': return <DashboardPage onGoSystem={() => go('system')} onIr={go} operador={!!session.operador} />;
      case 'screens': return <ScreensPage parear={route.parear} abrirParear={!!route.abrirParear} onEditContent={(device) => go('content', { device })} onCriar={(device) => go('criar', { tela: device.id })} onIrParaPlano={() => go('billing')} />;
      case 'programacao': return <ProgramacaoPage onIr={go} />;
      case 'content': return <ContentEditorPage device={route.device} zonaInicial={route.zona} onBack={() => go('programacao')} onCriar={(zona) => go('criar', { tela: route.device && route.device.id, zona: typeof zona === 'string' ? zona : undefined })} onIr={go} />;
      case 'team': return <TeamPage me={user} onLeft={logout} />;
      case 'pecas': return <PecasProntasPage onIr={go} />;
      case 'telasprontas': return <TelasProntasPage onIr={go} telaAlvo={route.tela} />;
      case 'storage': return <StoragePage filtro="fotos" />;
      case 'musicas': return <StoragePage key="musicas" filtro="musicas" />;
      case 'ia': return <StoragePage key="ia" filtro="ia" />;
      case 'banco': return <BancoImagensPage />;
      /*
       * A chave remonta o Criar quando se chega de novo com outra opção (do
       * Início, ou de "Criar novo" numa tela) — senão ficaria no passo antigo.
       */
      case 'criar': return <CriarPage key={(route.opcao || '') + (route.tela || '') + (route.zona || '') + (route.ideia || '')} opcaoInicial={route.opcao} telaInicial={route.tela} zonaInicial={route.zona} ideiaInicial={route.ideia} onIr={go} />;
      case 'rapida': return <CriacaoRapidaPage key={(route.opcao || '') + (route.tela || '')} opcaoInicial={route.opcao} telaInicial={route.tela} onIr={go} />;
      case 'campanhas': return <CampanhasPage key={route.campanha || ''} campanhaInicial={route.campanha} onIr={go} />;
      case 'criando': return <CriandoPage onIr={go} />;
      case 'designs': case 'studio': case 'campaigns': case 'images': return <MyDesignsPage onIr={go} />;
      case 'brand': return <BrandPage onIr={go} />;
      case 'mural': return <MuralPage />;
      case 'birthdays': return <BirthdaysPage />;
      case 'relatorio': return <RelatorioPage onIrParaPlano={() => go('billing')} />;
      case 'billing': return <BillingPage onFalarComVendas={() => go('support')} />;
      case 'system': return <SystemPage />;
      case 'platform': return <PlatformPage />;
      case 'alerts': return <AlertsPage onGoScreens={() => go('screens')} onGoStorage={() => go('storage')} onGoBilling={() => go('billing')} onAbrirTela={(d) => go('content', { device: d })} />;
      case 'support': return <SupportPage me={session} />;
      case 'settings': return (
        <SettingsPage me={session} theme={theme} onToggleTheme={toggleTheme} onLogout={logout} onChanged={refresh} />
      );
      default: return <PlaceholderPage title={meta.title} subtitle={meta.subtitle} />;
    }
  }

  return (
    <AppShell
      active={navActive}
      onNavigate={(name) => go(name)}
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
        {renderPage()}
      </LimiteDeErro>
    </AppShell>
  );
}
