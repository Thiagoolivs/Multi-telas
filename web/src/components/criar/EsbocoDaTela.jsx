import React from 'react';
import { cn } from '../../lib/cn.js';

/*
 * O ESBOÇO DA TELA (EXECUTOR D13): como a TV vai ficar, ANTES de gastar.
 *
 * O dono pediu "cartões de cor e esboço antes de gerar, no chat e na Marca".
 * Não é a peça: é a planta — cabeçalho, principal, lateral e rodapé no lugar
 * certo, com as cores escolhidas, o nome (ou a logo) e quantas peças giram
 * em cada parte. Desenhado com caixas, na hora, sem IA.
 */

function luminancia(hex) {
  const n = parseInt(String(hex || '#000000').slice(1, 7), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
// Texto que lê sobre o fundo: branco no escuro, quase preto no claro.
const sobre = (fundo) => (luminancia(fundo) < 0.4 ? '#ffffff' : '#111827');

function Barra({ cor, largura, altura = 'h-1.5', className }) {
  return <div className={cn('rounded-full', altura, className)} style={{ background: cor, width: largura }} />;
}

/*
 * `zonas`: { cabecalho, principal, lateral, rodape } com { pecas, mensagens }
 * (o formato do escopo). `cores`: [principal, acento, apoio].
 */
export function EsbocoDaTela({ zonas, cores, nome, logo, emPe, rotulo, className }) {
  const fundo = (cores && cores[0]) || '#1e3a8a';
  const acento = (cores && cores[1]) || '#f59e0b';
  const texto = sobre(fundo);
  const z = zonas || {};
  const temCab = !!(z.cabecalho && (z.cabecalho.pecas > 0 || (z.cabecalho.vivos || []).length || (z.cabecalho.mensagens || []).length));
  const temLat = !!(z.lateral && z.lateral.pecas > 0);
  const temRod = !!(z.rodape && (z.rodape.pecas > 0 || (z.rodape.mensagens || []).length));
  const nPrincipal = (z.principal && z.principal.pecas) || 0;
  // `logo` pode vir como endereço ou com as versões (D7): no fundo escuro vai a branca.
  const logoUrl = !logo ? '' : typeof logo === 'string' ? logo : ((luminancia(fundo) < 0.4 ? logo.clara : logo.escura) || logo.url || '');
  const frase = (z.rodape && (z.rodape.mensagens || [])[0]) || '';

  const Chip = ({ children }) => (
    <span className="absolute right-1 top-1 rounded bg-black/45 px-1 text-[9px] font-semibold leading-4 text-white">{children}</span>
  );

  return (
    <figure className={cn('space-y-1', className)}>
      <div className={cn('relative mx-auto overflow-hidden rounded-md border-[3px] border-[#0b0f17] bg-[#0b0f17] shadow-sm', emPe ? 'aspect-[9/16] w-1/2' : 'aspect-video w-full')}
        role="img" aria-label={'Esboço da TV' + (rotulo ? ': ' + rotulo : '')}>
        <div className="flex h-full flex-col gap-[2px]">
          {temCab && (
            <div className="relative flex h-[13%] items-center justify-between px-[4%]" style={{ background: fundo, filter: 'brightness(.8)' }}>
              {logoUrl ? <img src={logoUrl} alt="" className="h-[60%] max-w-[30%] object-contain" />
                : <span className="truncate text-[9px] font-bold uppercase tracking-wider" style={{ color: texto }}>{nome || 'Sua marca'}</span>}
              <span className="text-[9px] font-semibold" style={{ color: texto }}>10:30</span>
              {z.cabecalho.pecas > 1 && <Chip>{z.cabecalho.pecas} estilos</Chip>}
            </div>
          )}
          <div className="flex min-h-0 flex-1 gap-[2px]">
            <div className="relative flex flex-1 flex-col justify-center gap-[6%] px-[7%]" style={{ background: fundo }}>
              {nPrincipal > 0 ? (
                <>
                  <Barra cor={acento} largura="22%" altura="h-1.5" />
                  <Barra cor={texto} largura="70%" altura="h-3" />
                  <Barra cor={texto} largura="52%" altura="h-3" />
                  <Barra cor={texto} largura="40%" className="opacity-50" />
                  <div className="mt-[2%] h-3 w-[26%] rounded" style={{ background: acento }} />
                  <Chip>{nPrincipal === 1 ? '1 peça' : nPrincipal + ' peças girando'}</Chip>
                </>
              ) : (
                <span className="text-center text-[9px] opacity-70" style={{ color: texto }}>principal livre</span>
              )}
            </div>
            {temLat && (
              <div className="relative flex w-[28%] flex-col justify-center gap-[6%] px-[6%]" style={{ background: acento }}>
                <Barra cor={sobre(acento)} largura="60%" altura="h-2" />
                <Barra cor={sobre(acento)} largura="80%" altura="h-4" />
                <Barra cor={sobre(acento)} largura="45%" className="opacity-60" />
                <Chip>{z.lateral.pecas}</Chip>
              </div>
            )}
          </div>
          {temRod && (
            <div className="relative flex h-[11%] items-center gap-2 overflow-hidden px-[3%]" style={{ background: 'linear-gradient(90deg, ' + fundo + ', ' + acento + ')' }}>
              <span className="truncate text-[9px] font-semibold" style={{ color: texto }}>{frase || 'letreiro'}</span>
            </div>
          )}
        </div>
      </div>
      {rotulo && <figcaption className="truncate text-center text-2xs text-ink-3">{rotulo}</figcaption>}
    </figure>
  );
}
