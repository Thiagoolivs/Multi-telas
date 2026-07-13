/*
 * storage.js
 * Camada de dados do sistema. Guarda a "config" (o que aparece nas TVs)
 * no localStorage e permite exportar/importar como JSON, além de carregar
 * de uma URL remota (para atualização centralizada de várias TVs).
 */
(function (global) {
  'use strict';

  const KEY = 'multitelas.config.v1';
  const SCHEMA_VERSION = 1;

  /* ---------- Conteúdos de exemplo (para começar rápido) ---------- */
  function sampleConfig() {
    return {
      version: SCHEMA_VERSION,
      settings: {
        nome: 'Raft Embalagens',
        layoutId: 'corporate',
        // URL opcional de config remota. Se preenchida, o player prioriza ela.
        remoteConfigUrl: '',
        // De quanto em quanto tempo o player recarrega a config (segundos).
        refreshSeconds: 60,
        cor: '#4B5320', // verde militar (padrão Raft Embalagens)
        logoUrl: '',
        titulo: 'Raft Embalagens',
        cidadeClima: 'São Paulo',
        transicao: 'fade', // fade | slide | none
      },
      zonas: {
        principal: {
          items: [
            {
              type: 'text',
              titulo: 'Bem-vindo à Raft Embalagens',
              corpo: 'Para editar, clique em uma tela no painel e escolha um conteúdo pronto.',
              bg: '#4B5320',
              cor: '#ffffff',
              duracao: 10,
            },
            {
              type: 'image',
              src: 'https://picsum.photos/1280/720?random=1',
              fit: 'cover',
              duracao: 8,
            },
          ],
        },
        lateral: {
          items: [
            {
              type: 'birthday',
              titulo: 'Aniversariantes do Mês',
              nomes: 'Ana Souza — 05/07\nCarlos Lima — 12/07\nMarina Alves — 23/07',
              bg: '#3a4419',
              cor: '#ffffff',
              duracao: 12,
            },
            {
              type: 'clock',
              duracao: 10,
            },
          ],
        },
        rodape: {
          messages: [
            'Bem-vindo à Raft Embalagens',
            'Segurança em primeiro lugar — use seu EPI.',
            'Acompanhe os comunicados no mural interno.',
          ],
          velocidade: 60, // pixels por segundo
        },
      },
    };
  }

  /* ---------- Validação / normalização ---------- */
  function normalize(cfg) {
    if (!cfg || typeof cfg !== 'object') return sampleConfig();
    const base = sampleConfig();
    const out = {
      version: SCHEMA_VERSION,
      settings: Object.assign({}, base.settings, cfg.settings || {}),
      zonas: {},
    };

    // Preserva zonas de outros templates (trocar de layout não apaga conteúdo).
    Object.keys(cfg.zonas || {}).forEach((k) => {
      out.zonas[k] = cfg.zonas[k];
    });

    const layout = global.MT_getLayout(out.settings.layoutId);
    // Garante que exista uma entrada para cada zona do layout escolhido.
    layout.zones.forEach((zone) => {
      const existing = (cfg.zonas && cfg.zonas[zone.id]) || {};
      if (zone.type === 'ticker') {
        out.zonas[zone.id] = {
          messages: Array.isArray(existing.messages) ? existing.messages : [],
          velocidade: existing.velocidade || 60,
        };
      } else if (zone.type === 'header') {
        out.zonas[zone.id] = { header: true };
      } else {
        out.zonas[zone.id] = {
          items: Array.isArray(existing.items) ? existing.items : [],
        };
      }
    });
    return out;
  }

  /* ---------- Persistência local ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const c = sampleConfig();
        save(c);
        return c;
      }
      return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('[storage] falha ao ler config, usando exemplo', e);
      return sampleConfig();
    }
  }

  function save(cfg) {
    const clean = normalize(cfg);
    localStorage.setItem(KEY, JSON.stringify(clean));
    // Sinaliza para o player (mesmo domínio) que houve atualização.
    localStorage.setItem('multitelas.updatedAt', String(Date.now()));
    return clean;
  }

  function reset() {
    const c = sampleConfig();
    save(c);
    return c;
  }

  /* ---------- Exportar / Importar ---------- */
  function exportJSON(cfg) {
    return JSON.stringify(normalize(cfg), null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    return save(parsed);
  }

  /* ---------- Config remota (atualização centralizada) ---------- */
  async function fetchRemote(url) {
    const bust = (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
    const res = await fetch(url + bust, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return normalize(await res.json());
  }

  global.MTStorage = {
    KEY,
    SCHEMA_VERSION,
    sampleConfig,
    normalize,
    load,
    save,
    reset,
    exportJSON,
    importJSON,
    fetchRemote,
  };
})(window);
