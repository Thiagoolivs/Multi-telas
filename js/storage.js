/*
 * storage.js
 * Camada de dados do sistema. Guarda a "config" (o que aparece nas TVs)
 * no localStorage e permite exportar/importar como JSON, além de carregar
 * de uma URL remota (para atualização centralizada de várias TVs).
 */
(function (global) {
  'use strict';

  /*
   * O catálogo de layouts. No navegador vem do <script> anterior; no servidor,
   * do require — porque `normalize()` deixou de ser coisa só do player.
   */
  const templates = global.MT_getLayout
    ? { getLayout: global.MT_getLayout }
    : (typeof require === 'function' ? require('./templates.js') : null);
  const pegarLayout = (id) => templates.getLayout(id);

  const KEY = 'multitelas.config.v1';
  const SCHEMA_VERSION = 1;

  /*
   * Os padrões de comportamento da tela, SEM identidade e SEM conteúdo.
   *
   * Separado do exemplo de propósito: `normalize()` completa campos que faltam
   * e não pode inventar o nome da empresa — ela agora roda também no servidor,
   * onde uma tela sem nome viraria "Raft Embalagens" para outro cliente.
   */
  function settingsPadrao() {
    return {
      nome: '',
      layoutId: 'dashboard',
        // URL opcional de config remota. Se preenchida, o player prioriza ela.
        remoteConfigUrl: '',
        // De quanto em quanto tempo o player recarrega a config (segundos).
        refreshSeconds: 60,
        cor: '#2F6FEB',   // (legado) cor de destaque — migrada para theme.overrides.brand
        fundo: '#0a1128', // (legado) fundo — migrado para theme.overrides.bg
        logoUrl: '',
        titulo: 'Raft Embalagens',
        cidadeClima: 'São Paulo',
        transicao: 'cinematic', // cinematic | fade | slide | zoom | none
        // Decoração animada sobre a tela: none | auto | snow | lights |
        // hearts | petals | flags | confetti | fireworks ('auto' = pela data).
        decoracao: 'none',
        // Recursos inteligentes (Fase 3).
        coresAdaptativas: true,   // tema se adapta às cores da imagem exibida
        layoutInteligente: true,  // conteúdo prioritário toma a tela (takeover)
        somUrgente: true,         // toca um alerta sonoro nos avisos urgentes
        layoutAuto: false,        // a disposição das telas se alterna sozinha
        layoutAutoSeconds: 20,    // intervalo da alternância de layout (s)
        /*
         * Trilha sonora da tela. Vive em settings, não numa zona: música não
         * ocupa espaço, atravessa todos os slides e não pertence a nenhum.
         */
        audio: {
          ativo: false,
          faixas: [],          // [{ url, nome }]
          volume: 60,          // 0–100
          aleatorio: false,
          // Vídeo com som e música por cima viram barulho. Abaixar e voltar.
          abaixarComVideo: true,
        },
      // Tema premium: preset + ajustes manuais (ver js/theme.js).
      theme: {
        preset: 'dark-premium',
        font: 'system',
        overrides: {}, // { brand, brand2, accent, bg, bg2, surface, glass, radius, blur, fx, ... }
      },
    };
  }

  /* ---------- Conteúdo de exemplo (para começar rápido) ---------- */
  function sampleConfig() {
    return {
      version: SCHEMA_VERSION,
      settings: Object.assign(settingsPadrao(), { nome: 'Raft Embalagens' }),
      zonas: {
        principal: {
          items: [
            {
              type: 'text',
              titulo: 'Comunicação que valoriza o seu time',
              corpo: 'Publique avisos, campanhas e resultados em tempo real — direto do painel.',
              duracao: 12,
            },
            {
              type: 'announce',
              tipo: 'conquista',
              titulo: 'Metas do trimestre superadas',
              corpo: 'Parabéns a todas as equipes pelo resultado recorde.',
              duracao: 12,
            },
            {
              type: 'announce',
              tipo: 'seguranca',
              titulo: 'Segurança em primeiro lugar',
              corpo: 'Uso de EPI obrigatório em todas as áreas de produção.',
              duracao: 12,
            },
          ],
        },
        lateral: {
          items: [
            {
              type: 'weatherpro',
              cidade: 'São Paulo',
              duracao: 0,
            },
          ],
        },
        rodape: {
          titulo: 'ÚLTIMAS NOTÍCIAS',
          modo: 'noticias',
          fonte: 'g1', // manchetes automáticas do G1 (fallback: mensagens abaixo)
          quantidade: 10,
          intervalo: 8,
          velocidade: 60,
          messages: [
            'Bem-vindo à Raft Embalagens :: Painel de comunicação interna — edite as notícias no painel de gestão.',
            'Segurança em primeiro lugar :: O uso de EPI é obrigatório em todas as áreas de produção.',
            'Aniversariantes do mês :: Confira no mural quem faz aniversário e deixe seu parabéns.',
          ],
        },
      },
    };
  }

  /* ---------- Migração de tema (retrocompatível) ---------- */
  // Configs antigas só tinham settings.cor e settings.fundo. Convertemos
  // para o formato de tema novo, sem perder a identidade visual escolhida.
  function migrateTheme(settings, theme) {
    const t = Object.assign({ preset: 'dark-premium', font: 'system', overrides: {} }, theme || {});
    if (!t.overrides || typeof t.overrides !== 'object') t.overrides = {};
    // Se a config antiga tinha cores personalizadas e o tema ainda não as
    // reflete, injeta como ajustes manuais sobre o preset.
    if (settings.cor && t.overrides.brand === undefined && !theme) t.overrides.brand = settings.cor;
    if (settings.fundo && t.overrides.bg === undefined && !theme) t.overrides.bg = settings.fundo;
    return t;
  }

  /*
   * Trilha sonora: config vinda de fora (arquivo importado, banco antigo) pode
   * ter qualquer coisa. Sai daqui sempre com os campos certos — o player toca
   * numa TV sem ninguém por perto para consertar.
   */
  function normalizeAudio(a) {
    const src = (a && typeof a === 'object') ? a : {};
    const faixas = (Array.isArray(src.faixas) ? src.faixas : [])
      .map((f) => (typeof f === 'string' ? { url: f, nome: '' } : f))
      .filter((f) => f && typeof f.url === 'string' && f.url)
      .map((f) => ({ url: String(f.url), nome: String(f.nome || '').slice(0, 120) }))
      .slice(0, 100);
    const vol = Number(src.volume);
    return {
      // Ligado sem faixa nenhuma seria uma promessa vazia na tela.
      ativo: src.ativo === true && faixas.length > 0,
      faixas,
      volume: Number.isFinite(vol) ? Math.min(100, Math.max(0, Math.round(vol))) : 60,
      aleatorio: src.aleatorio === true,
      abaixarComVideo: src.abaixarComVideo !== false,
    };
  }

  /* ---------- Validação / normalização ---------- */
  function normalize(cfg) {
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return sampleConfig();
    const out = {
      version: SCHEMA_VERSION,
      settings: Object.assign(settingsPadrao(), cfg.settings || {}),
      zonas: {},
    };

    // Garante um objeto de tema e migra configs antigas (cor/fundo → tema).
    out.settings.theme = migrateTheme(out.settings, (cfg.settings || {}).theme);
    out.settings.audio = normalizeAudio(out.settings.audio);

    // Preserva zonas de outros templates (trocar de layout não apaga conteúdo).
    Object.keys(cfg.zonas || {}).forEach((k) => {
      out.zonas[k] = cfg.zonas[k];
    });

    const layout = pegarLayout(out.settings.layoutId);
    // Garante que exista uma entrada para cada zona do layout escolhido.
    layout.zones.forEach((zone) => {
      const existing = (cfg.zonas && cfg.zonas[zone.id]) || {};
      if (zone.type === 'ticker') {
        out.zonas[zone.id] = {
          messages: Array.isArray(existing.messages) ? existing.messages : [],
          velocidade: existing.velocidade || 60,
          titulo: existing.titulo != null ? existing.titulo : 'ÚLTIMAS NOTÍCIAS',
          /*
           * DUAS PERGUNTAS, DOIS CAMPOS.
           *
           * `modo` respondia às duas ao mesmo tempo — de onde vem o texto e
           * como ele se move — e por isso o letreiro contínuo só existia
           * abrindo mão do feed de notícias. Ele fica aqui por compatibilidade
           * com as telas já configuradas, e é traduzido no padrão dos campos
           * novos.
           *
           * Este normalizador reconstrói a zona CAMPO A CAMPO: o que não está
           * escrito aqui é descartado no caminho do painel até a TV. Foi
           * exatamente o que aconteceu na primeira tentativa — o painel
           * gravava `movimento`, o servidor devolvia a config sem ele, e a TV
           * seguia mostrando manchete como se nada tivesse mudado.
           */
          modo: existing.modo || 'noticias', // (legado) noticias | rolagem
          conteudo: existing.conteudo
            || (existing.modo === 'rolagem' ? 'mensagens' : 'ambos'), // noticias | mensagens | ambos
          movimento: existing.movimento
            || (existing.modo === 'rolagem' ? 'letreiro' : 'manchetes'), // manchetes | letreiro
          intervalo: existing.intervalo || 8,
          fonte: existing.fonte || 'manual', // (legado) manual | g1 | … | custom
          // Várias fontes ao mesmo tempo (ids de FEED e/ou URLs de RSS).
          fontes: Array.isArray(existing.fontes) ? existing.fontes
            : (existing.fonte && existing.fonte !== 'manual' && existing.fonte !== 'custom'
                ? [existing.fonte] : []),
          rssUrl: existing.rssUrl || '',
          quantidade: existing.quantidade || 10,
          // Rolagem da manchete longa: auto (só quando não cabe) | nunca.
          rolagem: existing.rolagem === 'nunca' ? 'nunca' : 'auto',
          velocidadeTexto: existing.velocidadeTexto || 70,
          // Exibição: selo e relógio podem sair para a manchete ganhar altura.
          mostrarSelo: existing.mostrarSelo !== false,
          mostrarRelogio: existing.mostrarRelogio !== false,
          // Cores: tema (herda) | marca | custom.
          cores: existing.cores || 'tema',
          fundo: existing.fundo || '',
          corTexto: existing.corTexto || '',
          corDestaque: existing.corDestaque || '',
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
    // Persiste também no painel ativo, quando há vários painéis.
    try {
      const p = readPanels();
      if (p && p.panels[p.active]) {
        p.panels[p.active].config = clean;
        p.panels[p.active].name = clean.settings.nome || p.panels[p.active].name;
        writePanels(p);
      }
    } catch (e) { /* ignora */ }
    // Sinaliza para o player (mesmo domínio) que houve atualização.
    localStorage.setItem('multitelas.updatedAt', String(Date.now()));
    return clean;
  }

  /* ---------- Vários painéis / playlists nomeados ----------
   * O painel ATIVO é sempre espelhado em KEY (o player e a config remota
   * continuam lendo KEY sem saber que há vários painéis). O registro guarda
   * um snapshot de cada painel nomeado e qual está ativo. */
  const PANELS_KEY = 'multitelas.panels.v1';
  function readPanels() {
    try {
      const raw = localStorage.getItem(PANELS_KEY);
      if (raw) { const p = JSON.parse(raw); if (p && p.panels && p.order) return p; }
    } catch (e) { /* ignora */ }
    return null;
  }
  function writePanels(p) { localStorage.setItem(PANELS_KEY, JSON.stringify(p)); }
  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function ensurePanels() {
    let p = readPanels();
    if (p) return p;
    // Primeira vez: cria um painel envolvendo a config atual (ou de exemplo).
    let current;
    try {
      const raw = localStorage.getItem(KEY);
      current = raw ? normalize(JSON.parse(raw)) : sampleConfig();
    } catch (e) { current = sampleConfig(); }
    const id = uid();
    p = { active: id, order: [id], panels: {} };
    p.panels[id] = { name: current.settings.nome || 'Painel principal', config: current };
    writePanels(p);
    localStorage.setItem(KEY, JSON.stringify(current));
    return p;
  }

  function listPanels() {
    const p = ensurePanels();
    return p.order.filter((id) => p.panels[id])
      .map((id) => ({ id: id, name: p.panels[id].name, active: id === p.active }));
  }
  function activePanelId() { return ensurePanels().active; }

  function createPanel(name) {
    const p = ensurePanels();
    const id = uid();
    const cfg = normalize(sampleConfig());
    cfg.settings.nome = name || 'Novo painel';
    p.panels[id] = { name: cfg.settings.nome, config: cfg };
    p.order.push(id);
    p.active = id;
    writePanels(p);
    localStorage.setItem(KEY, JSON.stringify(cfg));
    localStorage.setItem('multitelas.updatedAt', String(Date.now()));
    return { id: id, config: cfg };
  }

  function switchPanel(id) {
    const p = ensurePanels();
    if (!p.panels[id]) return null;
    p.active = id;
    writePanels(p);
    const cfg = normalize(p.panels[id].config);
    localStorage.setItem(KEY, JSON.stringify(cfg));
    localStorage.setItem('multitelas.updatedAt', String(Date.now()));
    return cfg;
  }

  function renamePanel(id, name) {
    const p = ensurePanels();
    if (!p.panels[id] || !name) return;
    p.panels[id].name = name;
    // Mantém o nome do painel em sincronia com o nome da empresa/painel.
    if (id === p.active && p.panels[id].config && p.panels[id].config.settings) {
      p.panels[id].config.settings.nome = name;
    }
    writePanels(p);
  }

  function deletePanel(id) {
    const p = ensurePanels();
    if (!p.panels[id] || p.order.length <= 1) return null; // nunca apaga o último
    delete p.panels[id];
    p.order = p.order.filter((x) => x !== id);
    if (p.active === id) p.active = p.order[0];
    writePanels(p);
    return switchPanel(p.active);
  }

  /* ---------- Trava do painel por PIN (soft-lock local) ----------
   * Não é segurança criptográfica — é uma trava de acesso ao Painel de
   * Gestão, guardada só neste navegador. */
  const PIN_KEY = 'multitelas.pin.v1';
  function hashPin(pin) {
    let h = 5381;
    const s = 'mt:' + String(pin);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h >>> 0);
  }
  function hasPin() { return !!localStorage.getItem(PIN_KEY); }
  function setPin(pin) {
    if (!pin) localStorage.removeItem(PIN_KEY);
    else localStorage.setItem(PIN_KEY, hashPin(pin));
  }
  function checkPin(pin) { return hasPin() && localStorage.getItem(PIN_KEY) === hashPin(pin); }

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

  /*
   * Módulo duplo. `normalize` era a única barreira antes da TV e rodava apenas
   * no navegador — configs vindas do painel React chegavam CRUAS ao player.
   * Agora o servidor a chama antes de gravar, e o mesmo arquivo define o que é
   * uma config nos dois lados.
   */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalize, sampleConfig, settingsPadrao, SCHEMA_VERSION };
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
    // Vários painéis / playlists
    listPanels,
    activePanelId,
    createPanel,
    switchPanel,
    renamePanel,
    deletePanel,
    // Trava por PIN
    hasPin,
    setPin,
    checkPin,
  };
})(typeof window !== 'undefined' ? window : globalThis);
