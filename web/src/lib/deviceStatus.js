import { relativeTime } from './format.js';

// Uma TV é "online" se pulsou (heartbeat) nos últimos 90s. O player pulsa a
// cada 30s, então 3 batidas perdidas = offline.
export const ONLINE_WINDOW_MS = 90 * 1000;

export function deviceStatus(lastSeen, now = Date.now()) {
  if (!lastSeen) return { tone: 'neutral', label: 'Nunca conectou', pulse: false, seen: null };
  const online = now - lastSeen < ONLINE_WINDOW_MS;
  return {
    tone: online ? 'ok' : 'danger',
    label: online ? 'Online' : 'Offline',
    pulse: online,
    seen: relativeTime(lastSeen, now),
  };
}
