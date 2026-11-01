import { relativeTime } from './format.js';

// Uma TV é "online" se pulsou (heartbeat) nos últimos 90s. O player pulsa a
// cada 30s, então 3 batidas perdidas = offline.
export const ONLINE_WINDOW_MS = 90 * 1000;

export function deviceStatus(lastSeen, now = Date.now()) {
  // Em palavras de quem tem loja, e não de quem programa (QA de 26/10): "No ar", "Fora do ar".
  if (!lastSeen) return { tone: 'neutral', label: 'Nunca ligou', pulse: false, seen: null };
  const online = now - lastSeen < ONLINE_WINDOW_MS;
  return {
    tone: online ? 'ok' : 'danger',
    label: online ? 'No ar' : 'Fora do ar',
    pulse: online,
    seen: relativeTime(lastSeen, now),
  };
}
