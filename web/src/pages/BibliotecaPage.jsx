import React from 'react';
import { Users, Images, BarChart3, Sheet, ChevronRight, Megaphone } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { usePerfil } from '../lib/perfil.js';

/*
 * A BIBLIOTECA ÚNICA (fase 7; BLOCO-8, 4.2). A mesma peça aparecia em
 * Criados, Peças prontas e Meus Designs, e o dono não sabia onde procurar.
 *
 * Fase 10 (reteste do bloco 8): eram até 4 níveis (Biblioteca › Prontos ›
 * Peças soltas › TV deitada), com partes dentro das abas. Agora as abas da
 * Biblioteca são as próprias páginas, sem parte nenhuma dentro:
 *   Prontos para você (telas inteiras e peças, com um filtro só) ·
 *   Campanhas (a casa das peças de cada campanha) · Peças guardadas ·
 *   Fotos e vídeos · e, no Comércio e na Saúde, os Apps.
 * O menu está em lib/menu.js; os endereços antigos (?ir=seus, ?ir=pecas,
 * ?ir=telasprontas) abrem a aba nova (App.jsx, naBiblioteca).
 */

/*
 * Apps: os conteúdos que se atualizam sozinhos (aniversários, o mural de
 * fotos do público e os indicadores). No Comércio e na Saúde moram aqui; na
 * Empresas, são o item Pessoas do menu.
 */
const APPS = [
  { id: 'birthdays', nome: 'Aniversariantes', texto: 'Os aniversários da semana entram sozinhos na TV.', Icone: Users },
  { id: 'mural', nome: 'Mural de fotos', texto: 'O público manda a foto pelo QR e ela aparece na TV.', Icone: Images },
  { id: 'indicadores', nome: 'Indicadores', texto: 'Um número que se atualiza sozinho, vindo de um sistema.', Icone: BarChart3 },
  // Fase 11: o preço e o cardápio vindos de uma planilha do Google (ou de um CSV).
  { id: 'planilhas', nome: 'Preços da planilha', texto: 'Mudou o preço na planilha, a TV muda junto.', Icone: Sheet },
  // Fase 12: a recepção chama pelo celular e a TV mostra a senha gigante, sem o nome do paciente.
  { id: 'senha', nome: 'Chamada de senha', texto: 'A recepção chama a próxima senha e a TV mostra na hora.', Icone: Megaphone },
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
