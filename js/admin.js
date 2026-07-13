/*
 * admin.js
 * Painel de gestão: escolha de template, mapa de zonas clicável,
 * conteúdos prontos (presets), upload de imagens e prévia ao vivo.
 * Salva no localStorage e exporta/importa a config como JSON.
 */
(function () {
  'use strict';

  let config = MTStorage.load();
  let dirty = false;
  let selectedZoneId = null;

  /* ================= Ícones SVG (traço, estilo corporativo) ================= */
  const ICONS = {
    text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    film: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"/>',
    play: '<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z"/>',
    live: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
    cake: '<path d="M4 21h16M5 21v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M12 13V9M10.5 7a1.5 1.5 0 0 0 3 0c0-1-1.5-3-1.5-3s-1.5 2-1.5 3z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 0-9 7 7 0 0 0-13.6 2A4 4 0 0 0 6 19z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1M17 20h1M20 17h1"/>',
    ticker: '<rect x="2" y="9" width="20" height="6" rx="2"/><path d="M5 12h2M9 12h6M17 12h2"/>',
    header: '<rect x="2" y="4" width="20" height="6" rx="2"/><path d="M2 14h20M2 18h12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    pencil: '<path d="M17 3l4 4L7 21H3v-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    up: '<path d="M6 14l6-6 6 6"/>',
    down: '<path d="M6 10l6 6 6-6"/>',
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || ICONS.text) + '</svg>';
  }

  /* ================= Formulários por tipo de conteúdo ================= */
  const FORMS = {
    text: [
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'corpo', label: 'Texto', kind: 'textarea' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#4B5320' },
      { key: 'cor', label: 'Cor do texto', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 10 },
    ],
    notice: [
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'corpo', label: 'Texto do aviso', kind: 'textarea' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#7f1d1d' },
      { key: 'cor', label: 'Cor do texto', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
    image: [
      { key: 'src', label: 'Imagem', kind: 'imagesrc' },
      { key: 'fit', label: 'Ajuste', kind: 'select', options: [['cover', 'Preencher a tela'], ['contain', 'Mostrar inteira']], def: 'cover' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 8 },
    ],
    video: [
      { key: 'src', label: 'URL do vídeo (MP4)', kind: 'text', ph: 'https://…/video.mp4' },
      { key: 'loop', label: 'Repetir em loop', kind: 'checkbox' },
      { key: 'muted', label: 'Sem áudio', kind: 'checkbox', def: true },
      { key: 'duracao', label: 'Duração fixa (s) — 0 = até terminar', kind: 'number', def: 0 },
    ],
    youtube: [
      { key: 'videoId', label: 'Link ou ID do vídeo / live', kind: 'text', ph: 'https://youtube.com/watch?v=…' },
      { key: 'channelId', label: 'Ou ID do canal (exibe a live ativa do canal)', kind: 'text', ph: 'UCxxxxxxxxxxxxxxxx' },
      { key: 'loop', label: 'Repetir em loop', kind: 'checkbox' },
      { key: 'duracao', label: 'Duração (s) — 0 = fixo na tela (ao vivo)', kind: 'number', def: 20 },
    ],
    birthday: [
      { key: 'titulo', label: 'Título', kind: 'text', def: 'Aniversariantes do Mês' },
      { key: 'nomes', label: 'Nomes (um por linha, ex.: "Ana Souza — 05/07")', kind: 'textarea', ph: 'Ana Souza — 05/07\nCarlos Lima — 12/07' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#3a4419' },
      { key: 'cor', label: 'Cor do texto', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 15 },
    ],
    clock: [
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#101828' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 10 },
    ],
    weather: [
      { key: 'cidade', label: 'Cidade', kind: 'text', ph: 'São Paulo', def: 'São Paulo' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#1c2b1a' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
    web: [
      { key: 'url', label: 'Endereço da página', kind: 'text', ph: 'https://…' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 20 },
    ],
    qrcode: [
      { key: 'data', label: 'Conteúdo / link do QR', kind: 'text', ph: 'https://…' },
      { key: 'caption', label: 'Legenda', kind: 'text' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 12 },
    ],
  };

  /* ================= Conteúdos prontos (presets) ================= */
  const PRESETS = [
    {
      label: 'YouTube ao vivo', desc: 'Live em tempo real, fixa na tela', icon: 'live',
      item: { type: 'youtube', videoId: '', channelId: '', duracao: 0 },
    },
    {
      label: 'Vídeo do YouTube', desc: 'Vídeo com duração definida', icon: 'play',
      item: { type: 'youtube', videoId: '', duracao: 30 },
    },
    {
      label: 'Aniversariantes', desc: 'Lista dos aniversariantes do mês', icon: 'cake',
      item: { type: 'birthday', titulo: 'Aniversariantes do Mês', nomes: 'Nome — 01/01', bg: '#3a4419', cor: '#ffffff', duracao: 15 },
    },
    {
      label: 'Aviso importante', desc: 'Comunicado em destaque', icon: 'bell',
      item: { type: 'notice', titulo: 'Aviso Importante', corpo: 'Digite aqui o aviso.', bg: '#7f1d1d', cor: '#ffffff', duracao: 12 },
    },
    {
      label: 'Clima e tempo', desc: 'Temperatura atual da cidade', icon: 'cloud',
      item: { type: 'weather', cidade: 'São Paulo', bg: '#1c2b1a', duracao: 12 },
    },
    {
      label: 'Boas-vindas', desc: 'Mensagem de recepção', icon: 'text',
      item: { type: 'text', titulo: 'Seja bem-vindo(a)!', corpo: 'É um prazer receber você na Raft Embalagens.', bg: '#4B5320', cor: '#ffffff', duracao: 10 },
    },
    {
      label: 'Comunicado interno', desc: 'Informativo para a equipe', icon: 'text',
      item: { type: 'text', titulo: 'Comunicado', corpo: 'Digite aqui o comunicado.', bg: '#1f2937', cor: '#ffffff', duracao: 12 },
    },
    {
      label: 'Segurança', desc: 'Lembrete de segurança do trabalho', icon: 'bell',
      item: { type: 'notice', titulo: 'Segurança em Primeiro Lugar', corpo: 'O uso de EPI é obrigatório nas áreas de produção.', bg: '#92400e', cor: '#ffffff', duracao: 12 },
    },
    {
      label: 'Foto / campanha', desc: 'Imagem enviada do computador', icon: 'image',
      item: { type: 'image', src: '', fit: 'cover', duracao: 8 },
    },
    {
      label: 'Relógio', desc: 'Hora e data atuais', icon: 'clock',
      item: { type: 'clock', bg: '#101828', duracao: 10 },
    },
  ];

  function typeMeta(type) {
    return MTRender.ITEM_TYPES.find((t) => t.type === type) || { icon: 'text', label: type };
  }

  /* ================= Utilidades DOM ================= */
  const $ = (sel) => document.querySelector(sel);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function markDirty() {
    dirty = true;
    $('#save-status').textContent = 'Alterações não salvas';
    $('#save-status').style.color = 'var(--warn)';
  }

  // Converte trilhas com "vh" em proporções "fr" para miniaturas/mapa.
  // Ex.: "12vh 1fr 8vh" -> cabeçalho 12%, rodapé 8%, meio com o restante.
  function mapTracks(tracks) {
    const parts = tracks.trim().split(/\s+/);
    const vhSum = parts.reduce((s, p) => s + (p.endsWith('vh') ? parseFloat(p) : 0), 0);
    const frSum = parts.reduce((s, p) => s + (p.endsWith('fr') ? parseFloat(p) : 0), 0);
    const frUnit = frSum ? (100 - vhSum) / frSum : 1;
    return parts
      .map((p) => (p.endsWith('vh') ? parseFloat(p) + 'fr' : parseFloat(p) * frUnit + 'fr'))
      .join(' ');
  }

  /* ================= Galeria de templates ================= */
  function renderTemplates() {
    const gallery = $('#template-gallery');
    gallery.innerHTML = '';
    MT_LAYOUTS.forEach((layout) => {
      const card = el('div', 'tpl');
      if (layout.id === config.settings.layoutId) card.classList.add('active');

      const thumb = el('div', 'tpl-thumb');
      thumb.style.gridTemplateColumns = mapTracks(layout.grid.columns);
      thumb.style.gridTemplateRows = mapTracks(layout.grid.rows);
      thumb.style.gridTemplateAreas = layout.grid.areas.map((r) => '"' + r + '"').join(' ');
      const seen = {};
      layout.grid.areas.join(' ').split(/\s+/).forEach((area) => {
        if (seen[area]) return; seen[area] = true;
        const cell = el('div', 'tpl-cell');
        cell.style.gridArea = area;
        const z = layout.zones.find((zz) => zz.area === area);
        if (z && (z.type === 'ticker' || z.type === 'header')) cell.classList.add('accent');
        thumb.appendChild(cell);
      });

      card.appendChild(thumb);
      card.appendChild(el('div', 'tpl-name', layout.name));
      card.appendChild(el('div', 'tpl-desc', layout.description));
      card.addEventListener('click', () => applyTemplate(layout.id));
      gallery.appendChild(card);
    });
  }

  function applyTemplate(layoutId) {
    if (layoutId === config.settings.layoutId) return;
    config.settings.layoutId = layoutId;
    config = MTStorage.normalize(config); // garante zonas do novo layout
    selectedZoneId = null;
    markDirty();
    renderTemplates();
    renderContent();
  }

  /* ================= Configurações gerais ================= */
  const SETTINGS_MAP = {
    '#cfg-nome': 'nome', '#cfg-titulo': 'titulo', '#cfg-cor': 'cor',
    '#cfg-cidade': 'cidadeClima', '#cfg-logo': 'logoUrl',
    '#cfg-transicao': 'transicao', '#cfg-remote': 'remoteConfigUrl',
    '#cfg-refresh': 'refreshSeconds',
  };

  function fillSettings() {
    const s = config.settings;
    Object.keys(SETTINGS_MAP).forEach((sel) => {
      const input = $(sel);
      input.value = s[SETTINGS_MAP[sel]] != null ? s[SETTINGS_MAP[sel]] : '';
    });
  }

  function attachSettingsEvents() {
    Object.keys(SETTINGS_MAP).forEach((sel) => {
      const input = $(sel);
      const key = SETTINGS_MAP[sel];
      input.addEventListener('input', () => {
        config.settings[key] = input.type === 'number' ? Number(input.value) : input.value;
        markDirty();
      });
    });

    // Upload do logotipo (comprimido, mantém transparência de PNG).
    $('#btn-logo-upload').addEventListener('click', () => $('#cfg-logo-file').click());
    $('#cfg-logo-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      compressImage(file, 600, (dataUrl) => {
        config.settings.logoUrl = dataUrl;
        $('#cfg-logo').value = dataUrl;
        markDirty();
      });
      e.target.value = '';
    });
  }

  /* ================= Mapa de zonas (clicável) ================= */
  function renderContent() {
    const layout = MT_getLayout(config.settings.layoutId);
    if (!selectedZoneId || !layout.zones.some((z) => z.id === selectedZoneId)) {
      const firstPlaylist = layout.zones.find((z) => z.type === 'playlist');
      selectedZoneId = (firstPlaylist || layout.zones[0]).id;
    }
    renderLayoutMap();
    renderZonePanel();
  }

  function renderLayoutMap() {
    const map = $('#layout-map');
    const layout = MT_getLayout(config.settings.layoutId);
    map.innerHTML = '';
    map.style.gridTemplateColumns = mapTracks(layout.grid.columns);
    map.style.gridTemplateRows = mapTracks(layout.grid.rows);
    map.style.gridTemplateAreas = layout.grid.areas.map((r) => '"' + r + '"').join(' ');

    layout.zones.forEach((zone) => {
      const block = el('button', 'map-zone');
      block.type = 'button';
      block.style.gridArea = zone.area;
      if (zone.id === selectedZoneId) block.classList.add('active');

      const data = config.zonas[zone.id] || {};
      let iconName = 'image';
      let meta = '';
      if (zone.type === 'ticker') {
        iconName = 'ticker';
        const n = (data.messages || []).filter((m) => m && m.trim()).length;
        meta = n ? n + (n === 1 ? ' aviso' : ' avisos') : 'sem avisos';
      } else if (zone.type === 'header') {
        iconName = 'header';
        meta = 'automático';
      } else {
        const n = (data.items || []).length;
        iconName = n ? typeMeta(data.items[0].type).icon : 'image';
        meta = n ? n + (n === 1 ? ' conteúdo' : ' conteúdos') : 'vazio';
      }

      block.innerHTML = icon(iconName);
      block.appendChild(el('span', 'map-zone-name', zone.name));
      block.appendChild(el('span', 'map-zone-meta', meta));
      block.addEventListener('click', () => {
        selectedZoneId = zone.id;
        renderLayoutMap();
        renderZonePanel();
      });
      map.appendChild(block);
    });
  }

  /* ================= Painel da zona selecionada ================= */
  function renderZonePanel() {
    const panel = $('#zone-panel');
    panel.innerHTML = '';
    const layout = MT_getLayout(config.settings.layoutId);
    const zone = layout.zones.find((z) => z.id === selectedZoneId);
    if (!zone) return;

    const head = el('div', 'zone-panel-head');
    head.appendChild(el('h3', null, zone.name));
    head.appendChild(el('span', 'zone-type', zoneTypeLabel(zone.type)));
    panel.appendChild(head);

    if (zone.type === 'ticker') {
      renderTickerEditor(panel, zone.id);
    } else if (zone.type === 'header') {
      panel.appendChild(el('p', 'empty-hint',
        'Esta faixa é montada automaticamente com o logotipo, o título, o relógio e o clima definidos em "Identidade e exibição".'));
    } else {
      renderPlaylistEditor(panel, zone.id);
    }
  }

  function zoneTypeLabel(t) {
    return t === 'ticker' ? 'faixa de avisos'
      : t === 'header' ? 'cabeçalho automático' : 'sequência de conteúdos';
  }

  function renderPlaylistEditor(panel, zoneId) {
    const zone = config.zonas[zoneId];
    if (!zone.items.length) {
      panel.appendChild(el('div', 'empty-hint',
        'Esta tela está vazia. Escolha um conteúdo pronto abaixo ou monte um personalizado.'));
    } else {
      const list = el('div', 'item-list');
      zone.items.forEach((item, idx) => list.appendChild(itemRow(zoneId, item, idx)));
      panel.appendChild(list);
    }

    panel.appendChild(el('div', 'add-section-label', 'Conteúdos prontos'));
    const presets = el('div', 'presets-grid');
    PRESETS.forEach((p) => {
      const b = el('button', 'preset-btn');
      b.type = 'button';
      b.innerHTML = icon(p.icon) +
        '<span><span class="p-label"></span><span class="p-desc"></span></span>';
      b.querySelector('.p-label').textContent = p.label;
      b.querySelector('.p-desc').textContent = p.desc;
      b.addEventListener('click', () => {
        openItemModal(zoneId, null, p.item.type, Object.assign({}, p.item));
      });
      presets.appendChild(b);
    });
    panel.appendChild(presets);

    panel.appendChild(el('div', 'add-section-label', 'Ou monte do zero'));
    const types = el('div', 'types-row');
    MTRender.ITEM_TYPES.forEach((t) => {
      const b = el('button', 'type-btn');
      b.type = 'button';
      b.innerHTML = icon(t.icon) + '<span></span>';
      b.querySelector('span').textContent = t.label;
      b.addEventListener('click', () => openItemModal(zoneId, null, t.type));
      types.appendChild(b);
    });
    panel.appendChild(types);
  }

  function itemRow(zoneId, item, idx) {
    const row = el('div', 'item-row');
    const meta = typeMeta(item.type);
    const ic = el('div', 'item-icon');
    ic.innerHTML = icon(meta.icon);
    row.appendChild(ic);

    const info = el('div', 'item-info');
    info.appendChild(el('div', 'item-title', itemTitle(item)));
    const durTxt = item.duracao === 0 ? 'fixo na tela' : (item.duracao || '—') + 's';
    info.appendChild(el('div', 'item-sub', meta.label + ' · ' + durTxt));
    row.appendChild(info);

    const actions = el('div', 'item-actions');
    actions.appendChild(iconBtn('up', 'Subir', () => moveItem(zoneId, idx, -1)));
    actions.appendChild(iconBtn('down', 'Descer', () => moveItem(zoneId, idx, +1)));
    actions.appendChild(iconBtn('pencil', 'Editar', () => openItemModal(zoneId, idx)));
    actions.appendChild(iconBtn('trash', 'Remover', () => removeItem(zoneId, idx)));
    row.appendChild(actions);
    return row;
  }

  function itemTitle(item) {
    if (item.type === 'image' && item.src && item.src.startsWith('data:')) return 'Imagem enviada';
    if (item.type === 'youtube' && item.channelId) return 'Live do canal';
    return item.titulo || item.caption || item.cidade || item.url || item.videoId
      || item.src || item.data || typeMeta(item.type).label;
  }

  function iconBtn(name, title, fn) {
    const b = el('button', 'icon-btn');
    b.type = 'button';
    b.title = title;
    b.innerHTML = icon(name);
    b.addEventListener('click', fn);
    return b;
  }

  function moveItem(zoneId, idx, dir) {
    const arr = config.zonas[zoneId].items;
    const to = idx + dir;
    if (to < 0 || to >= arr.length) return;
    const [it] = arr.splice(idx, 1);
    arr.splice(to, 0, it);
    markDirty();
    renderContent();
  }

  function removeItem(zoneId, idx) {
    config.zonas[zoneId].items.splice(idx, 1);
    markDirty();
    renderContent();
  }

  /* ---------- Editor da faixa de avisos ---------- */
  function renderTickerEditor(panel, zoneId) {
    const zone = config.zonas[zoneId];
    const editor = el('div', 'messages-editor');

    function redraw() {
      editor.innerHTML = '';
      zone.messages.forEach((msg, idx) => {
        const row = el('div', 'msg-row');
        const input = el('input');
        input.type = 'text';
        input.value = msg;
        input.placeholder = 'Mensagem…';
        input.addEventListener('input', () => { zone.messages[idx] = input.value; markDirty(); });
        row.appendChild(input);
        row.appendChild(iconBtn('trash', 'Remover', () => {
          zone.messages.splice(idx, 1); markDirty(); redraw();
        }));
        editor.appendChild(row);
      });
      const add = el('button', 'btn btn-ghost btn-sm', '+ Nova mensagem');
      add.type = 'button';
      add.addEventListener('click', () => { zone.messages.push(''); markDirty(); redraw(); });
      editor.appendChild(add);

      const speed = el('label', 'field');
      speed.style.marginTop = '12px';
      speed.appendChild(el('span', null, 'Velocidade da rolagem (px/s)'));
      const si = el('input'); si.type = 'number'; si.min = '20'; si.value = zone.velocidade || 60;
      si.addEventListener('input', () => { zone.velocidade = Number(si.value); markDirty(); });
      speed.appendChild(si);
      editor.appendChild(speed);
    }
    redraw();
    panel.appendChild(editor);
  }

  /* ================= Modal de item ================= */
  let modalState = null; // { zoneId, idx, type, draft, isNew }

  function openItemModal(zoneId, idx, type, presetItem) {
    const isNew = idx == null;
    let draft;
    if (isNew) {
      draft = presetItem ? Object.assign({}, presetItem) : { type };
      type = draft.type;
      FORMS[type].forEach((f) => {
        if (draft[f.key] === undefined && f.def !== undefined) draft[f.key] = f.def;
      });
    } else {
      draft = Object.assign({}, config.zonas[zoneId].items[idx]);
      type = draft.type;
    }
    modalState = { zoneId, idx, type, draft, isNew };

    $('#modal-title').textContent = (isNew ? 'Adicionar: ' : 'Editar: ') + typeMeta(type).label;
    const bodyEl = $('#modal-body');
    bodyEl.innerHTML = '';
    FORMS[type].forEach((f) => bodyEl.appendChild(buildField(f, draft)));
    $('#modal').classList.remove('hidden');
  }

  function buildField(f, draft) {
    if (f.kind === 'checkbox') {
      const label = el('label', 'field');
      const wrap = el('span');
      wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px';
      const input = el('input'); input.type = 'checkbox';
      input.checked = draft[f.key] !== undefined ? !!draft[f.key] : !!f.def;
      draft[f.key] = input.checked;
      input.addEventListener('change', () => { draft[f.key] = input.checked; });
      wrap.appendChild(input);
      wrap.appendChild(el('span', null, f.label));
      label.appendChild(wrap);
      return label;
    }

    if (f.kind === 'imagesrc') return buildImageField(f, draft);

    const label = el('label', 'field');
    label.appendChild(el('span', null, f.label));
    let input;
    if (f.kind === 'textarea') {
      input = el('textarea');
    } else if (f.kind === 'select') {
      input = el('select');
      f.options.forEach(([val, txt]) => {
        const o = el('option', null, txt); o.value = val; input.appendChild(o);
      });
    } else {
      input = el('input');
      input.type = f.kind === 'number' ? 'number' : f.kind === 'color' ? 'color' : 'text';
    }
    if (f.ph) input.placeholder = f.ph;
    const val = draft[f.key] !== undefined ? draft[f.key] : (f.def !== undefined ? f.def : '');
    input.value = val;
    if (f.kind === 'color' && !val) input.value = '#000000';
    draft[f.key] = f.kind === 'number' ? Number(input.value) : input.value;
    input.addEventListener('input', () => {
      draft[f.key] = f.kind === 'number' ? Number(input.value) : input.value;
    });
    label.appendChild(input);
    return label;
  }

  /* ---------- Campo de imagem com upload direto ---------- */
  function buildImageField(f, draft) {
    const wrap = el('div', 'field');
    wrap.appendChild(el('span', null, f.label));

    const row = el('div', 'upload-row');
    const urlInput = el('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'https://…/foto.jpg';
    const isData = typeof draft[f.key] === 'string' && draft[f.key].startsWith('data:');
    if (!isData) urlInput.value = draft[f.key] || '';

    const btn = el('button', 'btn btn-ghost btn-sm');
    btn.type = 'button';
    btn.innerHTML = icon('upload') + '<span>Enviar arquivo</span>';
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;

    const preview = el('img', 'upload-preview');
    const note = el('div', 'hint');
    if (draft[f.key]) { preview.src = draft[f.key]; } else { preview.style.display = 'none'; }
    if (isData) note.textContent = 'Imagem enviada do computador.';

    btn.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f0 = file.files[0];
      if (!f0) return;
      compressImage(f0, 1600, (dataUrl) => {
        draft[f.key] = dataUrl;
        preview.src = dataUrl;
        preview.style.display = '';
        urlInput.value = '';
        note.textContent = 'Imagem enviada (' + Math.round(dataUrl.length / 1024) + ' KB).';
      });
      file.value = '';
    });
    urlInput.addEventListener('input', () => {
      draft[f.key] = urlInput.value;
      if (urlInput.value) {
        preview.src = urlInput.value;
        preview.style.display = '';
        note.textContent = '';
      }
    });

    row.appendChild(urlInput);
    row.appendChild(btn);
    row.appendChild(file);
    wrap.appendChild(row);
    wrap.appendChild(preview);
    wrap.appendChild(note);
    return wrap;
  }

  // Redimensiona/comprime a imagem no navegador antes de salvar.
  function compressImage(file, maxW, cb) {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const isPng = file.type === 'image/png';
        const out = c.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85);
        if (out.length > 3 * 1024 * 1024) {
          alert('Atenção: imagem grande (' + (out.length / 1024 / 1024).toFixed(1) +
            ' MB). Muitas imagens grandes podem esgotar o armazenamento do navegador — ' +
            'prefira usar URLs para fotos pesadas.');
        }
        cb(out);
      };
      img.onerror = () => alert('Não foi possível ler esta imagem.');
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
    modalState = null;
  }

  function applyModal() {
    if (!modalState) return;
    const { zoneId, idx, draft, isNew } = modalState;
    if (isNew) config.zonas[zoneId].items.push(draft);
    else config.zonas[zoneId].items[idx] = draft;
    markDirty();
    closeModal();
    renderContent();
  }

  /* ================= Salvar / Exportar / Importar ================= */
  function save() {
    try {
      config = MTStorage.save(config);
    } catch (e) {
      alert('Não foi possível salvar: o armazenamento do navegador está cheio. ' +
        'Remova imagens enviadas (use URLs no lugar) e tente novamente.');
      return;
    }
    dirty = false;
    $('#save-status').textContent = 'Salvo';
    $('#save-status').style.color = 'var(--ok)';
    refreshPreview();
  }

  function exportJSON() {
    const text = MTStorage.exportJSON(config);
    const blob = new Blob([text], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'config-multitelas.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        config = MTStorage.importJSON(reader.result);
        dirty = false;
        selectedZoneId = null;
        renderAll();
        refreshPreview();
        $('#save-status').textContent = 'Configuração importada';
        $('#save-status').style.color = 'var(--ok)';
      } catch (e) {
        alert('Arquivo inválido: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  function refreshPreview() {
    $('#preview-frame').contentWindow.location.reload();
  }

  /* ================= Inicialização ================= */
  function renderAll() {
    renderTemplates();
    fillSettings();
    renderContent();
  }

  function attachGlobalEvents() {
    attachSettingsEvents();
    $('#btn-save').addEventListener('click', save);
    $('#btn-export').addEventListener('click', exportJSON);
    $('#btn-preview').addEventListener('click', refreshPreview);
    $('#btn-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => {
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = '';
    });
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-cancel').addEventListener('click', closeModal);
    $('#modal-ok').addEventListener('click', applyModal);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

    window.addEventListener('beforeunload', (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    // Ctrl+S salva.
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); save();
      }
    });
  }

  renderAll();
  attachGlobalEvents();
})();
