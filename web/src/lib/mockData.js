/*
 * mockData.js — camada de dados plausíveis de operação.
 *
 * Estruturada como um "serviço": funções assíncronas que simulam latência (e
 * podem simular erro) para exercitar estados de loading/erro/vazio de verdade.
 * Trocar por chamadas reais à API depois é só reimplementar estas funções —
 * as telas não mudam.
 */
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const now = Date.now();

const GB = 1024 * 1024 * 1024;

// ---- Frota de telas (dispositivos) ----
const SCREENS = [
  { id: 'scr_01', name: 'Recepção — Matriz', group: 'Matriz', status: 'online', lastSync: now - 2 * MIN, campaign: 'Institucional Q3', resolution: '1920×1080', uptime: 0.999 },
  { id: 'scr_02', name: 'Refeitório — Matriz', group: 'Matriz', status: 'online', lastSync: now - 5 * MIN, campaign: 'Cardápio da Semana', resolution: '1920×1080', uptime: 0.997 },
  { id: 'scr_03', name: 'Vitrine — Loja Centro', group: 'Loja Centro', status: 'online', lastSync: now - 1 * MIN, campaign: 'Promo Inverno', resolution: '1080×1920', uptime: 0.998 },
  { id: 'scr_04', name: 'Caixa 1 — Loja Centro', group: 'Loja Centro', status: 'syncing', lastSync: now - 12 * MIN, campaign: 'Promo Inverno', resolution: '1920×1080', uptime: 0.991 },
  { id: 'scr_05', name: 'Caixa 2 — Loja Centro', group: 'Loja Centro', status: 'online', lastSync: now - 4 * MIN, campaign: 'Promo Inverno', resolution: '1920×1080', uptime: 0.994 },
  { id: 'scr_06', name: 'Vitrine — Loja Shopping', group: 'Loja Shopping', status: 'offline', lastSync: now - 3 * HOUR - 20 * MIN, campaign: 'Promo Inverno', resolution: '1080×1920', uptime: 0.962 },
  { id: 'scr_07', name: 'Praça de alim. — Shopping', group: 'Loja Shopping', status: 'online', lastSync: now - 7 * MIN, campaign: 'Combos do Dia', resolution: '1920×1080', uptime: 0.996 },
  { id: 'scr_08', name: 'Corredor A — Shopping', group: 'Loja Shopping', status: 'online', lastSync: now - 9 * MIN, campaign: 'Institucional Q3', resolution: '3840×2160', uptime: 0.999 },
  { id: 'scr_09', name: 'Espera — Clínica Norte', group: 'Clínica Norte', status: 'online', lastSync: now - 3 * MIN, campaign: 'Saúde & Bem-estar', resolution: '1920×1080', uptime: 0.998 },
  { id: 'scr_10', name: 'Recepção — Clínica Norte', group: 'Clínica Norte', status: 'idle', lastSync: now - 46 * MIN, campaign: null, resolution: '1920×1080', uptime: 0.985 },
  { id: 'scr_11', name: 'Balcão — Farmácia Sul', group: 'Farmácia Sul', status: 'online', lastSync: now - 6 * MIN, campaign: 'Ofertas Farma', resolution: '1920×1080', uptime: 0.993 },
  { id: 'scr_12', name: 'Vitrine — Farmácia Sul', group: 'Farmácia Sul', status: 'offline', lastSync: now - 26 * HOUR, campaign: 'Ofertas Farma', resolution: '1080×1920', uptime: 0.918 },
  { id: 'scr_13', name: 'Academia — Hall', group: 'Academia', status: 'online', lastSync: now - 8 * MIN, campaign: 'Planos 2026', resolution: '1920×1080', uptime: 0.997 },
  { id: 'scr_14', name: 'Academia — Musculação', group: 'Academia', status: 'online', lastSync: now - 11 * MIN, campaign: 'Planos 2026', resolution: '1920×1080', uptime: 0.995 },
  { id: 'scr_15', name: 'Auditório — Matriz', group: 'Matriz', status: 'idle', lastSync: now - 2 * HOUR, campaign: null, resolution: '3840×2160', uptime: 0.972 },
  { id: 'scr_16', name: 'Estacionamento — Shopping', group: 'Loja Shopping', status: 'online', lastSync: now - 14 * MIN, campaign: 'Institucional Q3', resolution: '1920×1080', uptime: 0.989 },
];

// ---- Campanhas ----
const CAMPAIGNS = [
  { id: 'cmp_01', name: 'Promo Inverno', status: 'active', screens: 4, startsAt: now - 6 * 24 * HOUR, endsAt: now + 8 * 24 * HOUR, updatedAt: now - 40 * MIN },
  { id: 'cmp_02', name: 'Institucional Q3', status: 'active', screens: 3, startsAt: now - 20 * 24 * HOUR, endsAt: now + 30 * 24 * HOUR, updatedAt: now - 3 * HOUR },
  { id: 'cmp_03', name: 'Cardápio da Semana', status: 'active', screens: 1, startsAt: now - 2 * 24 * HOUR, endsAt: now + 5 * 24 * HOUR, updatedAt: now - 18 * HOUR },
  { id: 'cmp_04', name: 'Combos do Dia', status: 'active', screens: 1, startsAt: now - 1 * 24 * HOUR, endsAt: now + 1 * 24 * HOUR, updatedAt: now - 5 * HOUR },
  { id: 'cmp_05', name: 'Ofertas Farma', status: 'active', screens: 2, startsAt: now - 10 * 24 * HOUR, endsAt: now + 3 * 24 * HOUR, updatedAt: now - 2 * HOUR },
  { id: 'cmp_06', name: 'Planos 2026', status: 'active', screens: 2, startsAt: now - 4 * 24 * HOUR, endsAt: now + 26 * 24 * HOUR, updatedAt: now - 9 * HOUR },
  { id: 'cmp_07', name: 'Saúde & Bem-estar', status: 'active', screens: 1, startsAt: now - 15 * 24 * HOUR, endsAt: now + 12 * 24 * HOUR, updatedAt: now - 1 * 24 * HOUR },
  { id: 'cmp_08', name: 'Black Friday (rascunho)', status: 'draft', screens: 0, startsAt: null, endsAt: null, updatedAt: now - 30 * MIN },
  { id: 'cmp_09', name: 'Natal 2026', status: 'scheduled', screens: 9, startsAt: now + 120 * 24 * HOUR, endsAt: now + 150 * 24 * HOUR, updatedAt: now - 3 * 24 * HOUR },
];

// ---- Alertas ----
const ALERTS = [
  { id: 'alr_01', severity: 'critical', title: 'Farmácia Sul — Vitrine offline há 26 h', screen: 'scr_12', ts: now - 26 * HOUR },
  { id: 'alr_02', severity: 'critical', title: 'Loja Shopping — Vitrine offline há 3 h', screen: 'scr_06', ts: now - 3 * HOUR - 20 * MIN },
  { id: 'alr_03', severity: 'warning', title: 'Armazenamento em 82% — aproximando do limite', screen: null, ts: now - 55 * MIN },
  { id: 'alr_04', severity: 'warning', title: 'Caixa 1 — Loja Centro: sincronização lenta', screen: 'scr_04', ts: now - 12 * MIN },
  { id: 'alr_05', severity: 'info', title: '2 telas ociosas sem campanha atribuída', screen: null, ts: now - 46 * MIN },
];

// ---- Uso de armazenamento ----
const STORAGE = {
  usedBytes: Math.round(41.2 * GB),
  totalBytes: 50 * GB,
  breakdown: [
    { label: 'Vídeos', bytes: Math.round(28.4 * GB), tone: 'accent' },
    { label: 'Imagens', bytes: Math.round(9.1 * GB), tone: 'ok' },
    { label: 'Campanhas', bytes: Math.round(2.9 * GB), tone: 'warn' },
    { label: 'Outros', bytes: Math.round(0.8 * GB), tone: 'neutral' },
  ],
};

// ---- Atividade de sincronização (feed) ----
const SYNC_ACTIVITY = [
  { id: 'syn_01', screen: 'Vitrine — Loja Centro', ts: now - 1 * MIN, status: 'ok', detail: 'Promo Inverno · 3 mídias' },
  { id: 'syn_02', screen: 'Recepção — Matriz', ts: now - 2 * MIN, status: 'ok', detail: 'Institucional Q3 · 5 mídias' },
  { id: 'syn_03', screen: 'Espera — Clínica Norte', ts: now - 3 * MIN, status: 'ok', detail: 'Saúde & Bem-estar · 4 mídias' },
  { id: 'syn_04', screen: 'Caixa 1 — Loja Centro', ts: now - 12 * MIN, status: 'partial', detail: '1 de 3 mídias pendente' },
  { id: 'syn_05', screen: 'Praça de alim. — Shopping', ts: now - 7 * MIN, status: 'ok', detail: 'Combos do Dia · 2 mídias' },
  { id: 'syn_06', screen: 'Vitrine — Loja Shopping', ts: now - 3 * HOUR, status: 'failed', detail: 'Sem resposta do dispositivo' },
  { id: 'syn_07', screen: 'Balcão — Farmácia Sul', ts: now - 6 * MIN, status: 'ok', detail: 'Ofertas Farma · 6 mídias' },
];

// ---- KPIs derivados ----
function computeKpis() {
  const online = SCREENS.filter((s) => s.status === 'online' || s.status === 'syncing').length;
  const offline = SCREENS.filter((s) => s.status === 'offline').length;
  const idle = SCREENS.filter((s) => s.status === 'idle').length;
  const active = CAMPAIGNS.filter((c) => c.status === 'active').length;
  const openAlerts = ALERTS.length;
  const lastSync = Math.max(...SCREENS.map((s) => s.lastSync));
  return {
    total: SCREENS.length,
    online,
    offline,
    idle,
    activeCampaigns: active,
    openAlerts,
    lastSync,
    storageUsed: STORAGE.usedBytes,
    storageTotal: STORAGE.totalBytes,
  };
}

// ---- "Serviço" assíncrono ----
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Ative para ver o estado de erro nas telas (demonstração).
export const FAIL_RATE = 0;

async function simulate(payload, ms = 500) {
  await wait(ms);
  if (Math.random() < FAIL_RATE) throw new Error('Falha de rede simulada');
  return payload;
}

export const api = {
  getOverview: () => simulate({ kpis: computeKpis(), storage: STORAGE }, 450),
  getScreens: () => simulate(SCREENS, 600),
  getCampaigns: () => simulate(CAMPAIGNS.filter((c) => c.status === 'active'), 500),
  getAlerts: () => simulate(ALERTS, 400),
  getSyncActivity: () => simulate(SYNC_ACTIVITY, 550),
};

export { SCREENS, CAMPAIGNS, ALERTS, STORAGE, SYNC_ACTIVITY };
