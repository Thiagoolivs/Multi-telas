/*
 * admin.js
 * Painel de administração: escolhe template, edita configurações e o
 * conteúdo de cada zona, com prévia ao vivo. Salva no localStorage e
 * permite exportar/importar a config como JSON.
 */
(function () {
  'use strict';

  let config = MTStorage.load();
  let dirty = false;

  /* ================= Definição dos formulários por tipo ================= */
  // Cada campo: { key, label, kind, ...opções }
  const FORMS = {
    text: [
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'corpo', label: 'Texto', kind: 'textarea' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#0d6efd' },
      { key: 'cor', label: 'Cor do texto', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 10 },
    ],
    notice: [
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'corpo', label: 'Texto do aviso', kind: 'textarea' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#111827' },
      { key: 'cor', label: 'Cor do texto', kind: 'color', def: '#ffffff' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 10 },
    ],
    image: [
      { key: 'src', label: 'URL da imagem', kind: 'text', ph: 'https://…/foto.jpg' },
      { key: 'fit', label: 'Ajuste', kind: 'select', options: [['cover', 'Preencher'], ['contain', 'Conter']], def: 'cover' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 8 },
    ],
    video: [
      { key: 'src', label: 'URL do vídeo (MP4)', kind: 'text', ph: 'https://…/video.mp4' },
      { key: 'loop', label: 'Repetir em loop', kind: 'checkbox' },
      { key: 'muted', label: 'Sem áudio', kind: 'checkbox', def: true },
      { key: 'duracao', label: 'Duração fixa (s) — 0 = até terminar', kind: 'number', def: 0 },
    ],
    youtube: [
      { key: 'videoId', label: 'Link ou ID do vídeo', kind: 'text', ph: 'https://youtu.be/…' },
      { key: 'loop', label: 'Repetir em loop', kind: 'checkbox' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 20 },
    ],
    clock: [
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#0b1220' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 10 },
    ],
    weather: [
      { key: 'cidade', label: 'Cidade', kind: 'text', ph: 'São Paulo', def: 'São Paulo' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', def: '#0b1f33' },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', def: 10 },
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

  function typeMeta(type) {
    return MTRender.ITEM_TYPES.find((t) => t.type === type) || { icon: '📄', label: type };
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
    $('#save-status').textContent = 'alterações não salvas';
    $('#save-status').style.color = '#f59e0b';
  }

  /* ================= Galeria de templates ================= */
  function renderTemplates() {
    const gallery = $('#template-gallery');
    gallery.innerHTML = '';
    MT_LAYOUTS.forEach((layout) => {
      const card = el('div', 'tpl');
      if (layout.id === config.settings.layoutId) card.classList.add('active');

      const thumb = el('div', 'tpl-thumb');
      thumb.style.gridTemplateColumns = simplifyTracks(layout.grid.columns);
      thumb.style.gridTemplateRows = simplifyTracks(layout.grid.rows);
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

  // Converte "3fr 1.1fr" -> "3fr 1.1fr" (mantém), e "12vh 1fr 8vh" -> proporções simples pra thumb.
  function simplifyTracks(tracks) {
    return tracks.replace(/vh/g, 'fr').replace(/auto/g, '1fr');
  }

  function applyTemplate(layoutId) {
    if (layoutId === config.settings.layoutId) return;
    config.settings.layoutId = layoutId;
    config = MTStorage.normalize(config); // recria zonas faltantes
    markDirty();
    renderTemplates();
    renderZones();
  }

  /* ================= Configurações gerais ================= */
  function bindSettings() {
    const s = config.settings;
    const map = {
      '#cfg-nome': 'nome', '#cfg-titulo': 'titulo', '#cfg-cor': 'cor',
      '#cfg-cidade': 'cidadeClima', '#cfg-logo': 'logoUrl',
      '#cfg-transicao': 'transicao', '#cfg-remote': 'remoteConfigUrl',
      '#cfg-refresh': 'refreshSeconds',
    };
    Object.keys(map).forEach((sel) => {
      const input = $(sel);
      const key = map[sel];
      input.value = s[key] != null ? s[key] : '';
      input.addEventListener('input', () => {
        s[key] = input.type === 'number' ? Number(input.value) : input.value;
        markDirty();
      });
    });
  }

  /* ================= Editor de zonas ================= */
  function renderZones() {
    const container = $('#zones-editor');
    container.innerHTML = '';
    const layout = MT_getLayout(config.settings.layoutId);

    layout.zones.forEach((zone) => {
      const box = el('div', 'zone');
      const head = el('div', 'zone-head');
      const h = el('h3', null, zone.name);
      const type = el('span', 'zone-type', zoneTypeLabel(zone.type));
      head.appendChild(h);
      head.appendChild(type);
      box.appendChild(head);

      const body = el('div', 'zone-body');
      if (zone.type === 'ticker') {
        renderTickerEditor(body, zone.id);
      } else if (zone.type === 'header') {
        body.appendChild(el('p', 'empty-hint',
          'O cabeçalho usa logo, título, relógio e clima das Configurações gerais.'));
      } else {
        renderPlaylistEditor(body, zone.id);
      }
      box.appendChild(body);
      container.appendChild(box);
    });
  }

  function zoneTypeLabel(t) {
    return t === 'ticker' ? 'rodapé de avisos'
      : t === 'header' ? 'cabeçalho' : 'playlist rotativa';
  }

  function renderPlaylistEditor(body, zoneId) {
    const zone = config.zonas[zoneId];
    const list = el('div', 'item-list');
    if (!zone.items.length) {
      body.appendChild(el('div', 'empty-hint', 'Nenhum conteúdo ainda. Adicione abaixo.'));
    }
    zone.items.forEach((item, idx) => {
      list.appendChild(itemRow(zoneId, item, idx));
    });
    body.appendChild(list);
    body.appendChild(addMenu(zoneId));
  }

  function itemRow(zoneId, item, idx) {
    const row = el('div', 'item-row');
    const meta = typeMeta(item.type);
    row.appendChild(el('div', 'item-icon', meta.icon));

    const info = el('div', 'item-info');
    info.appendChild(el('div', 'item-title', itemTitle(item)));
    info.appendChild(el('div', 'item-sub', meta.label + ' · ' + (item.duracao || '—') + 's'));
    row.appendChild(info);

    const actions = el('div', 'item-actions');
    actions.appendChild(iconBtn('↑', () => moveItem(zoneId, idx, -1)));
    actions.appendChild(iconBtn('↓', () => moveItem(zoneId, idx, +1)));
    actions.appendChild(iconBtn('✎', () => openItemModal(zoneId, idx)));
    actions.appendChild(iconBtn('🗑', () => removeItem(zoneId, idx)));
    row.appendChild(actions);
    return row;
  }

  function itemTitle(item) {
    return item.titulo || item.caption || item.cidade || item.url || item.src
      || item.data || item.videoId || typeMeta(item.type).label;
  }

  function iconBtn(txt, fn) {
    const b = el('button', 'icon-btn', txt);
    b.addEventListener('click', fn);
    return b;
  }

  function addMenu(zoneId) {
    const wrap = el('div');
    const toggle = el('button', 'btn btn-ghost btn-sm', '+ Adicionar conteúdo');
    const menu = el('div', 'add-type-menu');
    menu.style.display = 'none';
    toggle.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'none' ? 'grid' : 'none';
    });
    MTRender.ITEM_TYPES.forEach((t) => {
      const b = el('button', 'add-type-btn');
      b.appendChild(el('span', null, t.icon));
      b.appendChild(el('span', null, t.label));
      b.addEventListener('click', () => {
        menu.style.display = 'none';
        openItemModal(zoneId, null, t.type);
      });
      menu.appendChild(b);
    });
    wrap.appendChild(toggle);
    wrap.appendChild(menu);
    return wrap;
  }

  function moveItem(zoneId, idx, dir) {
    const arr = config.zonas[zoneId].items;
    const to = idx + dir;
    if (to < 0 || to >= arr.length) return;
    const [it] = arr.splice(idx, 1);
    arr.splice(to, 0, it);
    markDirty();
    renderZones();
  }

  function removeItem(zoneId, idx) {
    config.zonas[zoneId].items.splice(idx, 1);
    markDirty();
    renderZones();
  }

  /* ---------- Editor do rodapé (mensagens) ---------- */
  function renderTickerEditor(body, zoneId) {
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
        row.appendChild(iconBtn('🗑', () => { zone.messages.splice(idx, 1); markDirty(); redraw(); }));
        editor.appendChild(row);
      });
      const add = el('button', 'btn btn-ghost btn-sm', '+ Nova mensagem');
      add.addEventListener('click', () => { zone.messages.push(''); markDirty(); redraw(); });
      editor.appendChild(add);

      const speed = el('label', 'field');
      speed.style.marginTop = '12px';
      speed.appendChild(el('span', null, 'Velocidade (px/s)'));
      const si = el('input'); si.type = 'number'; si.min = '20'; si.value = zone.velocidade || 60;
      si.addEventListener('input', () => { zone.velocidade = Number(si.value); markDirty(); });
      speed.appendChild(si);
      editor.appendChild(speed);
    }
    redraw();
    body.appendChild(editor);
  }

  /* ================= Modal de item ================= */
  let modalState = null; // { zoneId, idx, type, draft }

  function openItemModal(zoneId, idx, type) {
    const isNew = idx == null;
    let draft;
    if (isNew) {
      draft = { type };
      FORMS[type].forEach((f) => { if (f.def !== undefined) draft[f.key] = f.def; });
    } else {
      draft = Object.assign({}, config.zonas[zoneId].items[idx]);
      type = draft.type;
    }
    modalState = { zoneId, idx, type, draft, isNew };

    $('#modal-title').textContent = (isNew ? 'Novo: ' : 'Editar: ') + typeMeta(type).label;
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
    renderZones();
  }

  /* ================= Salvar / Exportar / Importar ================= */
  function save() {
    config = MTStorage.save(config);
    dirty = false;
    $('#save-status').textContent = '✔ salvo';
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
        renderAll();
        refreshPreview();
        $('#save-status').textContent = '✔ importado';
        $('#save-status').style.color = 'var(--ok)';
      } catch (e) {
        alert('Arquivo inválido: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  function refreshPreview() {
    const frame = $('#preview-frame');
    // Recarrega o player para refletir a config salva.
    frame.contentWindow.location.reload();
  }

  /* ================= Inicialização ================= */
  function renderAll() {
    renderTemplates();
    bindSettings();
    renderZones();
  }

  function attachGlobalEvents() {
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
