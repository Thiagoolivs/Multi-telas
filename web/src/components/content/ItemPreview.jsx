import React from 'react';
import { Youtube, Globe, QrCode, CloudSun, Image as ImageIcon, Share2 } from 'lucide-react';

// Preview aproximado (não é o player real): dá a ideia da composição em 16:9.
// Fidelidade total virá de um preview via player embutido, adiante.
const ANN_COLOR = {
  comunicado: '#3b82f6', urgente: '#ef4444', evento: '#8b5cf6', rh: '#14b8a6',
  seguranca: '#f59e0b', manutencao: '#64748b', conquista: '#22c55e', treinamento: '#6366f1', saude: '#ec4899',
};

export function ItemPreview({ item, className }) {
  return (
    <div className={'aspect-video w-full overflow-hidden rounded-lg border border-line ' + (className || '')}>
      <div className="flex h-full w-full flex-col items-center justify-center bg-[#0a1128] p-4 text-center text-white">
        <Body item={item} />
      </div>
    </div>
  );
}

function Body({ item }) {
  switch (item.type) {
    case 'text':
      return (
        <div style={item.bg ? { background: item.bg, color: item.cor || '#fff' } : undefined}
             className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-md">
          {item.titulo && <div className="text-lg font-semibold leading-tight">{item.titulo}</div>}
          {item.corpo && <div className="line-clamp-3 text-xs opacity-80">{item.corpo}</div>}
          {!item.titulo && !item.corpo && <div className="text-xs opacity-40">Texto vazio</div>}
        </div>
      );
    case 'announce': {
      const c = ANN_COLOR[item.tipo] || ANN_COLOR.comunicado;
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5"
             style={{ background: `radial-gradient(80% 80% at 80% 10%, ${c}44, transparent 60%), #0a1128` }}>
          <span className="rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{ color: c, borderColor: c + '88' }}>{item.etiqueta || item.tipo}</span>
          <div className="text-base font-semibold leading-tight">{item.titulo || 'Aviso'}</div>
          {item.corpo && <div className="line-clamp-2 text-xs opacity-80">{item.corpo}</div>}
        </div>
      );
    }
    case 'quote':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1">
          <div className="text-2xl leading-none text-white/30">“</div>
          <div className="line-clamp-3 text-sm italic">{item.texto || 'Frase'}</div>
          {item.autor && <div className="text-xs opacity-60">— {item.autor}</div>}
        </div>
      );
    case 'promo':
      return (
        <div className="flex h-full w-full items-center gap-3">
          {item.imagem
            ? <img src={item.imagem} alt="" className="h-full w-1/2 rounded object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            : null}
          <div className="flex flex-1 flex-col items-start gap-0.5 text-left">
            {item.selo && <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase">{item.selo}</span>}
            <div className="text-base font-semibold">{item.titulo || 'Produto'}</div>
            {item.precoDe && <div className="text-xs line-through opacity-50">{item.precoDe}</div>}
            {item.precoPor && <div className="text-xl font-bold text-emerald-300">{item.precoPor}</div>}
            {item.cta && <div className="mt-0.5 rounded bg-white/15 px-2 py-0.5 text-[10px]">{item.cta}</div>}
          </div>
        </div>
      );
    case 'kpi':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-0.5">
          {item.rotulo && <div className="text-xs uppercase tracking-wide opacity-60">{item.rotulo}</div>}
          <div className="text-3xl font-bold tabular-nums">{item.valor || '—'}</div>
          {item.variacao && (
            <div className={'text-xs font-semibold ' + (item.tendencia === 'subiu' ? 'text-emerald-300' : item.tendencia === 'desceu' ? 'text-rose-300' : 'opacity-60')}>
              {item.tendencia === 'subiu' ? '▲' : item.tendencia === 'desceu' ? '▼' : '▬'} {item.variacao}
            </div>
          )}
          {item.detalhe && <div className="text-[10px] opacity-50">{item.detalhe}</div>}
        </div>
      );
    case 'social':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <Share2 size={26} className="opacity-80" />
          <div className="text-sm font-semibold">{item.titulo || 'Siga-nos'}</div>
          {item.handle && <div className="text-xs opacity-70">{item.handle}</div>}
        </div>
      );
    case 'image':
      return item.src
        ? <img src={item.src} alt="" className="h-full w-full rounded object-cover" style={{ objectFit: item.fit || 'cover' }} onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('div'), { className: 'text-xs opacity-40', textContent: 'Imagem indisponível' })); }} />
        : <Placeholder icon={ImageIcon} label="Imagem (defina a URL)" />;
    case 'youtube':
      return <Placeholder icon={Youtube} label={item.channelId ? 'Transmissão ao vivo' : (item.videoId || 'YouTube')} />;
    case 'web':
      return <Placeholder icon={Globe} label={item.url || 'Página web'} />;
    case 'qrcode':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5" style={item.bg ? { background: item.bg } : undefined}>
          {item.data
            ? <img src={'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(item.data)} alt="QR" className="h-20 w-20 rounded bg-white p-1" />
            : <QrCode size={40} className="opacity-40" />}
          {item.caption && <div className="text-[10px] opacity-70">{item.caption}</div>}
        </div>
      );
    case 'weatherpro':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1">
          <CloudSun size={30} className="opacity-80" />
          <div className="text-sm font-medium">{item.cidade || 'Cidade'}</div>
          <div className="text-[10px] opacity-50">Painel do clima</div>
        </div>
      );
    default:
      return <div className="text-xs opacity-40">{item.type}</div>;
  }
}

function Placeholder({ icon: Icon, label }) {
  return (
    <div className="flex flex-col items-center gap-2 opacity-70">
      <Icon size={30} />
      <span className="max-w-full truncate text-[11px]">{label}</span>
    </div>
  );
}
