/*
 * news.js
 * Busca manchetes automaticamente de portais de notícias (RSS), direto do
 * navegador e sem chave de API. Estratégias em cascata para nunca falhar:
 *   1. fetch direto (quando o feed permite CORS)
 *   2. proxy público allorigins (retorna o XML bruto)
 *   3. conversor público rss2json
 * Se todas falharem, o player usa as mensagens digitadas no painel.
 */
(function (global) {
  'use strict';

  // Portais famosos com RSS público (pt-BR).
  const FEEDS = [
    { id: 'g1', label: 'G1 — Últimas notícias', url: 'https://g1.globo.com/rss/g1/' },
    { id: 'g1-economia', label: 'G1 — Economia', url: 'https://g1.globo.com/rss/g1/economia/' },
    { id: 'g1-tecnologia', label: 'G1 — Tecnologia', url: 'https://g1.globo.com/rss/g1/tecnologia/' },
    { id: 'uol', label: 'UOL Notícias', url: 'https://rss.uol.com.br/feed/noticias.xml' },
    { id: 'folha', label: 'Folha de S.Paulo', url: 'https://feeds.folha.uol.com.br/emcincominutos/rss091.xml' },
    { id: 'cnnbrasil', label: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/' },
    { id: 'bbc', label: 'BBC News Brasil', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml' },
    { id: 'agenciabrasil', label: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml' },
    { id: 'exame', label: 'Exame', url: 'https://exame.com/feed/' },
  ];

  const CACHE_MS = 10 * 60 * 1000;
  const cache = {};

  function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 8000);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
  }

  // Remove HTML e normaliza espaços com segurança (documento inerte).
  function cleanText(s) {
    if (!s) return '';
    const doc = new DOMParser().parseFromString(String(s), 'text/html');
    let t = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length > 180) t = t.slice(0, 177) + '…';
    return t;
  }

  function nodeText(parent, tag) {
    const n = parent.querySelector(tag);
    return n ? n.textContent : '';
  }

  // Aceita RSS 2.0 e Atom.
  function parseFeed(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('XML inválido');
    let nodes = Array.from(doc.querySelectorAll('item'));
    if (!nodes.length) nodes = Array.from(doc.querySelectorAll('entry')); // Atom
    const items = nodes.map((it) => ({
      titulo: cleanText(nodeText(it, 'title')),
      desc: cleanText(nodeText(it, 'description') || nodeText(it, 'summary')),
    })).filter((i) => i.titulo);
    if (!items.length) throw new Error('feed vazio');
    return items;
  }

  async function tryDirect(url) {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseFeed(await res.text());
  }

  async function tryAllOrigins(url) {
    const res = await fetchWithTimeout(
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseFeed(await res.text());
  }

  async function tryRss2Json(url) {
    const res = await fetchWithTimeout(
      'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.status !== 'ok' || !Array.isArray(json.items)) throw new Error('resposta inválida');
    const items = json.items.map((it) => ({
      titulo: cleanText(it.title),
      desc: cleanText(it.description),
    })).filter((i) => i.titulo);
    if (!items.length) throw new Error('feed vazio');
    return items;
  }

  /**
   * Busca manchetes de uma fonte ('g1', 'uol', …) ou de uma URL de RSS.
   * Retorna [{ titulo, desc }]. Lança erro apenas se TODAS as rotas falharem.
   */
  async function fetchFeed(sourceOrUrl, max) {
    const feed = FEEDS.find((f) => f.id === sourceOrUrl);
    const url = feed ? feed.url : String(sourceOrUrl || '').trim();
    if (!url) throw new Error('fonte não informada');

    const now = Date.now();
    if (cache[url] && now - cache[url].t < CACHE_MS) {
      return cache[url].items.slice(0, max || 10);
    }

    const strategies = [tryDirect, tryAllOrigins, tryRss2Json];
    let lastErr = null;
    for (const strategy of strategies) {
      try {
        const items = await strategy(url);
        cache[url] = { t: now, items };
        return items.slice(0, max || 10);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('falha ao buscar notícias');
  }

  /**
   * Busca de VÁRIAS fontes ao mesmo tempo e intercala as manchetes
   * (round-robin) para alternar entre os portais. Fontes que falharem são
   * ignoradas; só lança erro se TODAS falharem. Cada fonte é um id de FEED
   * ('g1', 'uol', …) ou uma URL de RSS.
   */
  async function fetchMany(sources, maxTotal) {
    const list = (sources || []).map((s) => String(s || '').trim()).filter(Boolean);
    if (!list.length) throw new Error('nenhuma fonte informada');
    if (list.length === 1) return fetchFeed(list[0], maxTotal);

    const results = await Promise.all(list.map((src) =>
      fetchFeed(src, maxTotal || 10).then((items) => items).catch(() => [])));
    // Intercala: 1ª de cada fonte, 2ª de cada fonte, …
    const merged = [];
    const seen = {};
    const maxLen = results.reduce((m, r) => Math.max(m, r.length), 0);
    for (let i = 0; i < maxLen; i++) {
      results.forEach((r) => {
        const it = r[i];
        if (it && !seen[it.titulo]) { seen[it.titulo] = 1; merged.push(it); }
      });
    }
    if (!merged.length) throw new Error('falha ao buscar notícias');
    return merged.slice(0, maxTotal || 30);
  }

  global.MTNews = { FEEDS, fetchFeed, fetchMany };
})(window);
