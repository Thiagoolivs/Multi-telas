/*
 * cloud.js — cliente do controle remoto na nuvem (multi-tenant).
 *
 *   - TV (player "modo nuvem"): cria/retoma um device (id + device token),
 *     mostra o código de pareamento, busca a config e assina atualizações
 *     em tempo real (SSE). O device token prova que é aquela TV.
 *   - Celular (admin): faz login, pareia o código (o device passa a
 *     pertencer à conta) e envia a config.
 *
 * Cookies de sessão fluem automaticamente (mesma origem). Ver server/.
 */
(function (global) {
  'use strict';

  const API = '';

  function qsp(name) { return new URLSearchParams(global.location.search).get(name); }

  /*
   * As chaves nasceram com o prefixo "vistra." e passaram a "mt." na troca de
   * marca. migrateKey() copia o valor antigo na primeira vez, então nenhuma TV
   * já pareada perde o vínculo.
   */
  function migrateKey(novo, antigo) {
    try {
      if (localStorage.getItem(novo) === null) {
        const v = localStorage.getItem(antigo);
        if (v !== null) localStorage.setItem(novo, v);
      }
      localStorage.removeItem(antigo);
    } catch (e) {}
    return novo;
  }

  const CONTROL_KEY = migrateKey('mt.controlDeviceId', 'vistra.controlDeviceId');

  // "pid" isola a instância: cada player (mesmo no mesmo navegador) tem seu
  // próprio device/código. Permite testar várias telas na mesma máquina.
  const _pidSfx = qsp('pid') ? ':' + qsp('pid') : '';
  const DEVICE_KEY = migrateKey('mt.cloudDeviceId' + _pidSfx, 'vistra.cloudDeviceId' + _pidSfx);
  const DTOKEN_KEY = migrateKey('mt.cloudDeviceToken' + _pidSfx, 'vistra.cloudDeviceToken' + _pidSfx);

  /* ---------------- Onde mora a identidade da TV ----------------
   *
   * O par id+token é a carteira de identidade da tela. Enquanto ele existir,
   * a TV é a MESMA tela para o painel — sobrevive a recargas, a quedas de
   * energia, a meses no ar.
   *
   * Ele morava só no localStorage. O navegador da Samsung limpa o
   * localStorage ao fechar, e o efeito era feio: a TV voltava sem identidade,
   * criava uma tela NOVA com código novo, e a tela antiga ficava no painel
   * para sempre — marcada como offline, sem receber publicação nenhuma, e
   * ainda ocupando uma vaga do plano.
   *
   * Agora vai também num cookie de um ano. Não é redundância à toa: os
   * navegadores de TV limpam essas duas gavetas por critérios diferentes, e
   * basta uma sobreviver. Na leitura, quem tiver valor vence, e o que
   * sobreviveu repõe o que se perdeu.
   */
  function nomeCookie(chave) { return chave.replace(/[.:]/g, '_'); }

  function lerCookie(chave) {
    try {
      const alvo = nomeCookie(chave) + '=';
      const partes = String(document.cookie || '').split(';');
      for (let i = 0; i < partes.length; i++) {
        const p = partes[i].trim();
        if (p.indexOf(alvo) === 0) return decodeURIComponent(p.slice(alvo.length));
      }
    } catch (e) {}
    return null;
  }
  function gravarCookie(chave, valor) {
    try {
      document.cookie = nomeCookie(chave) + '=' + encodeURIComponent(valor)
        + '; path=/; max-age=31536000; SameSite=Lax';
    } catch (e) {}
  }
  function apagarCookie(chave) {
    try { document.cookie = nomeCookie(chave) + '=; path=/; max-age=0; SameSite=Lax'; } catch (e) {}
  }

  function lembrar(chave) {
    let local = null;
    try { local = localStorage.getItem(chave); } catch (e) {}
    const cookie = lerCookie(chave);
    // Quem sobreviveu repõe o que se perdeu: na próxima limpeza, a outra gaveta
    // é que vai segurar a identidade.
    if (local && !cookie) gravarCookie(chave, local);
    if (cookie && !local) { try { localStorage.setItem(chave, cookie); } catch (e) {} }
    return local || cookie || null;
  }
  function anotar(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) {}
    gravarCookie(chave, valor);
  }
  function esquecer(chave) {
    try { localStorage.removeItem(chave); } catch (e) {}
    apagarCookie(chave);
  }

  /*
   * Esquece a TV guardada neste navegador. Precisa limpar TODAS as gavetas —
   * senão o cookie ressuscitaria a tela antiga e o "gerar outro código" não
   * geraria código nenhum.
   */
  function resetDevice() {
    esquecer(DEVICE_KEY);
    esquecer(DTOKEN_KEY);
    try {
      localStorage.removeItem('mt.lastConfig'); // não herda a exibição da tela antiga
      localStorage.removeItem('mt.birthdays');
    } catch (e) {}
  }

  async function api(method, path, body, headers) {
    const opt = { method, headers: Object.assign({}, headers), credentials: 'same-origin' };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const res = await fetch(API + path, opt);
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) { const e = new Error((data && data.error) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
    return data;
  }

  /* ---------------- Autenticação (lado celular) ---------------- */
  async function signup(email, password, name) { return api('POST', '/api/auth/signup', { email, password, name }); }
  async function login(email, password) { return api('POST', '/api/auth/login', { email, password }); }
  async function logout() { return api('POST', '/api/auth/logout'); }
  async function me() { try { return await api('GET', '/api/auth/me'); } catch (e) { return null; } }

  /* ---------------- Lado TV (device) ---------------- */
  function deviceMode() { return qsp('cloud') === '1' || !!lembrar(DEVICE_KEY); }

  function deviceToken() { return lembrar(DTOKEN_KEY) || ''; }
  // Manda o device token no header (não vaza em logs/URLs).
  function dtHeader() { return { 'x-device-token': deviceToken() }; }

  async function ensureDevice() {
    // ?new=1 → esta aba é uma TV nova. Limpa a URL depois para que um F5 não
    // fique gerando telas novas a cada recarga.
    if (qsp('new') === '1') {
      resetDevice();
      try {
        const u = new URL(global.location.href);
        u.searchParams.delete('new');
        history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
      } catch (e) {}
    }
    let id = lembrar(DEVICE_KEY);
    let dt = lembrar(DTOKEN_KEY);
    if (id && dt) {
      try {
        const meta = await api('GET', '/api/devices/' + id, undefined, { 'x-device-token': dt });
        // `name` entra aqui para a TV recarregada poder dizer "Tudo certo,
        // Vitrine" em vez de só "Tudo certo": o servidor já mandava, e este
        // destructuring jogava fora.
        return { id: meta.id, code: meta.code, paired: meta.paired, name: meta.name };
      } catch (e) {
        /*
         * Só desiste da identidade quando o SERVIDOR diz que ela não vale
         * mais. Numa queda de rede o erro não tem status, e apagar aqui
         * transformaria cada tombo de internet numa tela órfã no painel.
         */
        if (!e.status || e.status < 400 || e.status >= 500) throw e;
        esquecer(DEVICE_KEY);
        esquecer(DTOKEN_KEY);
      }
    }
    const created = await api('POST', '/api/devices');
    anotar(DEVICE_KEY, created.id);
    anotar(DTOKEN_KEY, created.deviceToken);
    return { id: created.id, code: created.code, paired: false };
  }

  async function fetchConfig(id) {
    return api('GET', '/api/devices/' + id + '/config', undefined, dtHeader());
  }
  // Relação de aniversariantes do tenant desta TV (para exibição automática).
  async function fetchBirthdays(id) {
    const r = await api('GET', '/api/devices/' + id + '/birthdays', undefined, dtHeader());
    return (r && r.birthdays) || [];
  }
  /*
   * Avisa o servidor que a TV está viva e recebe de volta quando a config
   * mudou pela última vez. Devolve esse carimbo para o player conferir.
   */
  async function heartbeat(id) {
    try {
      const r = await api('POST', '/api/devices/' + id + '/heartbeat', undefined, dtHeader());
      return (r && r.configEm) || 0;
    } catch (e) { return 0; /* offline: tenta de novo no próximo ciclo */ }
  }
  // A TV conta ao servidor o que está tocando, para o painel mostrar de verdade
  // em vez de adivinhar pelo último comando enviado.
  async function reportAudio(id, estado) {
    try { await api('POST', '/api/devices/' + id + '/audio-estado', estado, dtHeader()); }
    catch (e) { /* offline: o painel mostra "sem notícia" */ }
  }
  function subscribe(id, onConfig, onPareada) {
    let es;
    /*
     * O token da TV NÃO vai mais na URL.
     *
     * Ele não expira, e endereço vai parar em log de acesso, log de proxy,
     * painel do provedor e histórico de console — lugares onde ninguém pensa
     * que há segredo. Agora a TV troca o token por um PASSE (num POST, com o
     * segredo no cabeçalho) e é o passe que vai na URL: vale um minuto e uma
     * vez só.
     *
     * `connect` virou async por isso. Se a troca falhar — rede caída, servidor
     * reiniciando — não adianta abrir o EventSource sem passe: espera e tenta
     * de novo, que é exatamente o que já se fazia quando o stream caía.
     */
    async function connect() {
      let passe;
      try {
        const r = await api('POST', '/api/devices/' + id + '/passe', null, dtHeader());
        passe = r && r.passe;
      } catch (e) { /* sem passe agora; tenta de novo abaixo */ }
      if (!passe) { setTimeout(connect, 15000); return; }

      es = new EventSource(API + '/api/devices/' + id + '/events?passe=' + encodeURIComponent(passe));
      /*
       * Acabou de ser pareada. Chega uma vez, e serve para a TV sair do
       * código de pareamento SEM esperar a primeira publicação — que pode
       * demorar horas, ou nunca vir.
       */
      es.addEventListener('pareada', (ev) => {
        let dados = {};
        try { dados = JSON.parse(ev.data || '{}'); } catch (e) {}
        if (onPareada) onPareada(dados);
      });
      es.addEventListener('config', async (ev) => {
        let meta = {};
        try { meta = JSON.parse(ev.data || '{}'); } catch (e) {}
        try { const cfg = await fetchConfig(id); if (cfg) onConfig(cfg, meta); } catch (e) {}
      });
      /*
       * Som: comando ao vivo do painel (tocar/pausar/pular/volume). Não é
       * config nova — recarregar a tela aqui cortaria a música no meio, que é
       * justo o contrário do que quem mexeu no volume queria.
       */
      es.addEventListener('som', (ev) => {
        let dado = {};
        try { dado = JSON.parse(ev.data || '{}'); } catch (e) {}
        document.dispatchEvent(new CustomEvent('mt:som', { detail: dado }));
      });
      /*
       * Mural: chegou (ou saiu) foto do público. Não é config nova — recarregar
       * a tela inteira aqui apagaria o slide no meio. Vira um evento no
       * documento e quem estiver mostrando o mural se atualiza sozinho.
       */
      es.addEventListener('mural', (ev) => {
        let dado = {};
        try { dado = JSON.parse(ev.data || '{}'); } catch (e) {}
        document.dispatchEvent(new CustomEvent('mt:mural', { detail: dado }));
      });
      /*
       * O EventSource reconecta sozinho em queda de rede — mas DESISTE de vez
       * quando o servidor responde não-2xx, o que acontece num deploy no meio
       * da conexão. Sem isto, a TV ficava com a config velha para sempre e o
       * heartbeat continuava dizendo que ela estava online.
       */
      es.onerror = () => {
        if (es.readyState !== 2) return;      // 2 = fechado de vez
        setTimeout(function () {
          try { es.close(); } catch (e) {}
          connect();
        }, 15000);
      };
    }
    connect();
    return { close: () => es && es.close() };
  }

  /* ---------------- Lado celular (controle) ---------------- */
  async function pair(code, name) {
    const d = await api('POST', '/api/pair', { code: String(code || '').trim().toUpperCase(), name });
    localStorage.setItem(CONTROL_KEY, d.id);
    return d;
  }
  function controlledDeviceId() { return localStorage.getItem(CONTROL_KEY) || ''; }
  function disconnect() { localStorage.removeItem(CONTROL_KEY); }
  async function listDevices() { return api('GET', '/api/devices'); }
  async function pushConfig(id, config) { return api('PUT', '/api/devices/' + id + '/config', config); }

  global.MTCloud = {
    signup, login, logout, me,
    // `dtHeader` sai daqui porque a leitura do mural passou a exigir a
    // credencial da TV: o código do cartaz autoriza ENVIAR foto, e não listar
    // o que os outros mandaram.
    dtHeader, deviceToken,
    deviceMode, ensureDevice, resetDevice, fetchConfig, fetchBirthdays, subscribe, heartbeat, reportAudio,
    pair, controlledDeviceId, disconnect, listDevices, pushConfig,
  };
})(window);
