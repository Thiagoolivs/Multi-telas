import React, { Suspense, lazy, useState } from 'react';
import { Users, Images, BarChart3, ChevronRight } from 'lucide-react';
import { Partes } from '../components/ui/Partes.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { usePerfil } from '../lib/perfil.js';

/*
 * A BIBLIOTECA ÚNICA (fase 7; BLOCO-8, 4.2). A mesma peça aparecia em
 * Criados, Peças prontas e Meus Designs, e o dono não sabia onde procurar.
 * Agora são quatro abas: o que está pronto para você, o que é seu, as fotos
 * e vídeos e (no Comércio e na Saúde) os Apps. As páginas de antes continuam
 * — viraram partes destas, e os endereços antigos abrem a parte certa.
 */
const TelasProntasPage = lazy(() => import('./TelasProntasPage.jsx').then((m) => ({ default: m.TelasProntasPage })));
const PecasProntasPage = lazy(() => import('./PecasProntasPage.jsx').then((m) => ({ default: m.PecasProntasPage })));
const CampanhasPage = lazy(() => import('./CampanhasPage.jsx').then((m) => ({ default: m.CampanhasPage })));
const MyDesignsPage = lazy(() => import('./MyDesignsPage.jsx').then((m) => ({ default: m.MyDesignsPage })));

const Carregando = () => <div className="py-10 text-center text-sm text-ink-3">Abrindo…</div>;

// Prontos para você: a tela inteira pronta ou a peça solta, na marca da conta.
export function ProntosPage({ onIr, telaAlvo, parte }) {
  const [aba, setAba] = useState(parte === 'pecas' ? 'pecas' : 'telas');
  return (
    <div>
      <Partes rotulo="O que está pronto" valor={aba} onChange={setAba}
        opcoes={[['telas', 'Telas inteiras'], ['pecas', 'Peças soltas']]} />
      <Suspense fallback={<Carregando />}>
        {aba === 'telas' ? <TelasProntasPage onIr={onIr} telaAlvo={telaAlvo} /> : <PecasProntasPage onIr={onIr} />}
      </Suspense>
    </div>
  );
}

// Seus conteúdos: o que a IA criou para você (as campanhas) e as peças que você guardou.
export function SeusConteudosPage({ onIr, parte, campanha, pedido }) {
  const [aba, setAba] = useState(parte === 'pecas' ? 'pecas' : 'campanhas');
  return (
    <div>
      <Partes rotulo="Seus conteúdos" valor={aba} onChange={setAba}
        opcoes={[['campanhas', 'Campanhas'], ['pecas', 'Peças guardadas']]} />
      <Suspense fallback={<Carregando />}>
        {aba === 'campanhas'
          ? <CampanhasPage key={campanha || ''} campanhaInicial={campanha} pedidoInicial={pedido} onIr={onIr} />
          : <MyDesignsPage onIr={onIr} />}
      </Suspense>
    </div>
  );
}

/*
 * Apps: os conteúdos que se atualizam sozinhos (aniversários, o mural de
 * fotos do público e os indicadores). No Comércio e na Saúde moram aqui; na
 * Empresas, são o item Pessoas do menu.
 */
const APPS = [
  { id: 'birthdays', nome: 'Aniversariantes', texto: 'Os aniversários da semana entram sozinhos na TV.', Icone: Users },
  { id: 'mural', nome: 'Mural de fotos', texto: 'O público manda a foto pelo QR e ela aparece na TV.', Icone: Images },
  { id: 'indicadores', nome: 'Indicadores', texto: 'Um número que se atualiza sozinho, vindo de um sistema.', Icone: BarChart3 },
];
export function AppsPage({ onIr }) {
  const frente = usePerfil();
  return (
    <div>
    {/* O título da página (o axe acusava a página sem h1). */}
    <PageHeader title="Apps" subtitle="O que a TV mostra sozinha, depois de ligado uma vez." />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {APPS.map(({ id, nome, texto, Icone }) => (
        <button key={id} type="button" onClick={() => onIr(id)}
          className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-accent/50 hover:shadow-xs">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icone size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">{nome}</span>
            <span className="mt-0.5 block text-xs text-ink-3">{texto.replace('a TV', 'a TV ' + frente.lugarDe)}</span>
          </span>
          <ChevronRight size={16} className="mt-1 shrink-0 text-ink-3" />
        </button>
      ))}
    </div>
    </div>
  );
}
