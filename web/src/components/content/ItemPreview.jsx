import React from 'react';
import { Youtube, Globe, QrCode, CloudSun, Image as ImageIcon, Share2, Film, Cake, Airplay, Cast, Presentation } from 'lucide-react';

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
    case 'poster': {
      const pb = /^#?[0-9a-f]{6}$/i.test(item.cor || '') ? (item.cor[0] === '#' ? item.cor : '#' + item.cor) : '#2f6feb';
      const v = item.variant || 'bold';
      const bg = v === 'aurora' ? `radial-gradient(60% 60% at 22% 18%, ${pb}, transparent 60%), radial-gradient(50% 50% at 85% 85%, ${pb}55, transparent 60%), #0a1020`
        : v === 'minimal' ? '#0a1020'
        : v === 'split' ? `linear-gradient(90deg, ${pb} 46%, #0a1020 46%)`
        : `linear-gradient(150deg, ${pb}, rgba(0,0,0,.5))`;
      const alignCenter = v === 'bold' || v === 'aurora';
      return (
        <div className="flex h-full w-full flex-col justify-center gap-1 p-3"
          style={{ background: bg, textAlign: alignCenter ? 'center' : 'left', alignItems: alignCenter ? 'center' : 'flex-start', borderLeft: v === 'minimal' ? `4px solid ${pb}` : undefined }}>
          {item.kicker && <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: v === 'minimal' ? pb : '#fff', opacity: v === 'minimal' ? 1 : 0.85 }}>{item.kicker}</div>}
          <div className="text-lg font-extrabold leading-tight">{item.titulo || 'Poster'}</div>
          {item.corpo && <div className="line-clamp-2 text-xs opacity-85">{item.corpo}</div>}
          {item.cta && <div className="mt-1 self-start rounded-full bg-white px-2 py-0.5 text-[10px] font-bold" style={{ color: pb, alignSelf: alignCenter ? 'center' : 'flex-start' }}>{item.cta}</div>}
        </div>
      );
    }
    case 'composicao': {
      const b = item.bg || {};
      const bgStyle = b.kind === 'imagem' && b.src ? { backgroundImage: `url("${b.src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : b.kind === 'cor' ? { background: b.cor } : { background: '#0a1020' };
      const els = (item.elementos || []).slice().sort((a, x) => (a.z || 0) - (x.z || 0));
      return (
        <div className="relative h-full w-full" style={bgStyle}>
          {els.map((e, idx) => (
            <div key={idx} style={{ position: 'absolute', left: e.x + '%', top: e.y + '%', width: e.w + '%', height: e.h + '%', transform: `rotate(${e.rot || 0}deg)`, overflow: 'hidden' }}>
              {e.tipo === 'texto'
                ? <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: e.cor, fontWeight: e.peso, fontSize: '9px', textAlign: e.align, lineHeight: 1.05 }}>{e.text}</div>
                : <img src={e.src} alt="" style={{ width: '100%', height: '100%', objectFit: e.fit || 'contain' }} onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />}
            </div>
          ))}
          {!els.length && <div className="flex h-full items-center justify-center text-xs opacity-40">Composição vazia — abra o editor</div>}
        </div>
      );
    }
    case 'birthdayauto':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5">
          <Cake size={26} className="opacity-80" />
          <div className="text-sm font-semibold">Aniversariantes</div>
          <div className="text-[10px] opacity-50">{item.modo === 'hoje' ? 'De hoje' : item.modo === 'semana' ? 'Da semana' : 'Automático (hoje/semana)'}</div>
        </div>
      );
    case 'image':
      return item.src
        ? <img src={item.src} alt="" className="h-full w-full rounded object-cover" style={{ objectFit: item.fit || 'cover' }} onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('div'), { className: 'text-xs opacity-40', textContent: 'Imagem indisponível' })); }} />
        : <Placeholder icon={ImageIcon} label="Imagem (defina a URL)" />;
    case 'video':
      return item.src
        ? <video src={item.src} muted loop autoPlay playsInline className="h-full w-full rounded object-contain" />
        : <Placeholder icon={Film} label="Vídeo (envie o arquivo)" />;
    case 'youtube':
      return <Placeholder icon={Youtube} label={item.channelId ? 'Transmissão ao vivo' : (item.videoId || 'YouTube')} />;
    case 'web':
      return <Placeholder icon={Globe} label={item.url || 'Página web'} />;
    case 'screen':
      return <Placeholder icon={Airplay} label="Captura de janela / tela (ao vivo)" />;
    case 'livesource':
      return <Placeholder icon={Cast} label="Entrada HDMI / USB (ao vivo)" />;
    case 'pptx':
      return <Placeholder icon={Presentation} label={item.src ? 'Apresentação' : 'Apresentação (envie o arquivo)'} />;
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
