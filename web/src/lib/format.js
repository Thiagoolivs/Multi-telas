// Formatadores para dados operacionais. pt-BR, tabular-friendly.

export function formatNumber(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

export function formatBytes(bytes, digits = 1) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatPercent(fraction, digits = 0) {
  return `${(fraction * 100).toFixed(digits)}%`;
}

// "há 3 min", "há 2 h", "há 4 d" — a partir de um timestamp (ms).
export function relativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  const mo = Math.floor(d / 30);
  return `há ${mo} mês${mo > 1 ? 'es' : ''}`;
}

export function formatClock(ts) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}
