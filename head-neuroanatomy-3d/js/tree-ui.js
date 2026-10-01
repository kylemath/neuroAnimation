/**
 * Structure tree, layer chips, ghost / solo / isolate / hide / show / reset.
 */

import { state, on, isIdVisible } from './state.js';
import { HIDDEN_UI_GROUPS } from './loader.js';
import {
  applyAppearance, setHidden, setOpacity, setGhost, setSolo, setIsolate,
  showAll, hideAll, resetViewState, toggleLayer, isLayerVisible,
} from './structures.js';

// Chips toggle one or more manifest layers each. Kept short on purpose.
const LAYERS = [
  { id: 'cortex', label: 'Cortex', layers: ['cortex', 'cingulate'] },
  { id: 'white-matter', label: 'White matter', layers: ['white-matter', 'fornix'] },
  { id: 'ventricles', label: 'Ventricles', layers: ['ventricles'] },
  { id: 'arteries', label: 'Arteries', layers: ['arteries'] },
  { id: 'veins', label: 'Veins & sinuses', layers: ['veins'] },
  { id: 'nerves', label: 'Nerves', layers: ['nerves'] },
  { id: 'brainstem', label: 'Brainstem', layers: ['brainstem'] },
  { id: 'deep', label: 'Deep nuclei', layers: ['subcortical', 'thalamus', 'basal-ganglia', 'hippocampus', 'amygdala'] },
  { id: 'cerebellum', label: 'Cerebellum', layers: ['cerebellum'] },
  { id: 'aras', label: 'ARAS', layers: ['aras'] },
  { id: 'sensory', label: 'Sensory', layers: ['sensory'] },
  { id: 'slices', label: 'Slices', layers: ['slices'] },
];

let treeRoot;
let chipRoot;
let selectedRowId = null;

export function initTreeUi(handlers) {
  treeRoot = document.getElementById('structure-tree');
  chipRoot = document.getElementById('layer-chips');
  buildChips();
  bindToolbar(handlers);
  const ghost = document.getElementById('ghost-slider');
  const ghostVal = document.getElementById('ghost-val');
  ghost.addEventListener('input', () => {
    const v = Number(ghost.value) / 100;
    ghostVal.textContent = `${ghost.value}%`;
    setGhost(v);
    if (handlers.onStateChange) handlers.onStateChange();
  });
  document.getElementById('dim-unselected').addEventListener('change', (e) => {
    state.dimUnselected = e.target.checked;
    applyAppearance();
    if (handlers.onStateChange) handlers.onStateChange();
  });
  on('manifest', () => renderTree(handlers));
  on('visibility', () => syncTreeChecks());
  on('selection', () => highlightSelectedRow());
  if (state.manifest) renderTree(handlers);
}

function bindToolbar(handlers) {
  document.getElementById('btn-show-all').addEventListener('click', () => {
    showAll();
    syncChips();
    if (handlers.onStateChange) handlers.onStateChange();
  });
  document.getElementById('btn-hide-all').addEventListener('click', () => {
    hideAll();
    syncChips();
    if (handlers.onStateChange) handlers.onStateChange();
  });
  document.getElementById('btn-reset-vis').addEventListener('click', () => {
    resetViewState();
    document.getElementById('ghost-slider').value = '100';
    document.getElementById('ghost-val').textContent = '100%';
    document.getElementById('dim-unselected').checked = true;
    syncChips();
    renderTree(handlers);
    if (handlers.onReset) handlers.onReset();
    if (handlers.onStateChange) handlers.onStateChange();
  });
}

function buildChips() {
  chipRoot.innerHTML = '';
  for (const layer of LAYERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.layer = layer.id;
    btn.textContent = layer.label;
    btn.addEventListener('click', () => {
      const show = !chipVisible(layer);
      for (const l of layer.layers) toggleLayer(l, show);
      syncChips();
    });
    chipRoot.appendChild(btn);
  }
  syncChips();
}

function chipVisible(layer) {
  return layer.layers.some((l) => isLayerVisible(l));
}

function syncChips() {
  chipRoot.querySelectorAll('.chip').forEach((btn) => {
    const layer = LAYERS.find((l) => l.id === btn.dataset.layer);
    btn.classList.toggle('off', !(layer && chipVisible(layer)));
  });
}

function childrenOf(parentId) {
  return state.manifest.structures.filter((s) => s.parent === parentId);
}

function renderTree(handlers) {
  if (!state.manifest) return;
  treeRoot.innerHTML = '';
  const groups = state.manifest.groups || [];
  let first = true;
  for (const group of groups) {
    if (HIDDEN_UI_GROUPS.has(group.id)) continue;
    const groupNode = document.createElement('div');
    groupNode.className = 'tree-group';
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'tree-group-header';
    header.innerHTML = `<span class="twisty">▾</span><span>${group.name}</span>`;
    const body = document.createElement('div');
    body.className = 'tree-group-body';
    header.addEventListener('click', () => {
      body.classList.toggle('collapsed');
      header.querySelector('.twisty').textContent = body.classList.contains('collapsed') ? '▸' : '▾';
    });
    const roots = state.manifest.structures.filter((s) => s.group === group.id && !s.parent);
    for (const def of roots) body.appendChild(renderNode(def, handlers));
    // Start collapsed except the first group, so the panel stays short.
    if (!first) {
      body.classList.add('collapsed');
      header.querySelector('.twisty').textContent = '▸';
    }
    first = false;
    groupNode.appendChild(header);
    groupNode.appendChild(body);
    treeRoot.appendChild(groupNode);
  }
}

function renderNode(def, handlers) {
  const row = document.createElement('div');
  row.className = 'tree-node';
  row.dataset.id = def.id;

  const kids = childrenOf(def.id);
  const line = document.createElement('div');
  line.className = 'tree-row';
  if (def.kind === 'folder') line.classList.add('folder');

  const twisty = document.createElement('button');
  twisty.type = 'button';
  twisty.className = 'twisty mini';
  twisty.textContent = kids.length ? '▾' : '';
  twisty.disabled = !kids.length;

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = def.defaultVisible !== false && !state.hidden.has(def.id);
  check.addEventListener('click', (e) => e.stopPropagation());
  check.addEventListener('change', () => {
    setHidden(def.id, !check.checked);
    if (handlers.onStateChange) handlers.onStateChange();
  });

  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = def.colour || '#9fb0c3';

  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'tree-name';
  name.textContent = def.name;
  name.addEventListener('click', () => {
    if (!isIdVisible(def.id, def)) setHidden(def.id, false);
    selectedRowId = def.id;
    highlightSelectedRow();
    if (handlers.onSelect) handlers.onSelect(def.id, false);
  });

  const actions = document.createElement('span');
  actions.className = 'tree-actions';
  const solo = document.createElement('button');
  solo.type = 'button';
  solo.className = 'tiny';
  solo.title = 'Solo this structure';
  solo.textContent = 'S';
  solo.addEventListener('click', (e) => {
    e.stopPropagation();
    setSolo(state.solo === def.id ? null : def.id);
    if (handlers.onStateChange) handlers.onStateChange();
  });
  const iso = document.createElement('button');
  iso.type = 'button';
  iso.className = 'tiny';
  iso.title = 'Isolate (this + children)';
  iso.textContent = 'I';
  iso.addEventListener('click', (e) => {
    e.stopPropagation();
    const onIso = state.isolate && state.isolate.has(def.id);
    setIsolate(onIso ? null : def.id);
    if (handlers.onStateChange) handlers.onStateChange();
  });
  actions.append(solo, iso);

  line.append(twisty, check, swatch, name, actions);
  row.appendChild(line);

  if (def.kind !== 'folder') {
    const extra = document.createElement('div');
    extra.className = 'tree-extra';
    extra.innerHTML = `<label>Opacity <span data-op-val>${Math.round((def.opacity ?? 0.9) * 100)}</span>%</label>`;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round((def.opacity ?? 0.9) * 100));
    slider.addEventListener('input', () => {
      extra.querySelector('[data-op-val]').textContent = slider.value;
      setOpacity(def.id, Number(slider.value) / 100);
      if (handlers.onStateChange) handlers.onStateChange();
    });
    extra.appendChild(slider);
    row.appendChild(extra);
  }

  const childWrap = document.createElement('div');
  childWrap.className = 'tree-children';
  for (const child of kids) childWrap.appendChild(renderNode(child, handlers));
  row.appendChild(childWrap);

  twisty.addEventListener('click', (e) => {
    e.stopPropagation();
    childWrap.classList.toggle('collapsed');
    twisty.textContent = childWrap.classList.contains('collapsed') ? '▸' : '▾';
  });

  return row;
}

function syncTreeChecks() {
  if (!treeRoot || !state.manifest) return;
  treeRoot.querySelectorAll('.tree-node').forEach((node) => {
    const id = node.dataset.id;
    const def = state.manifest.structures.find((s) => s.id === id);
    const box = node.querySelector('input[type="checkbox"]');
    if (box && def) {
      box.checked = isIdVisible(id, def);
    }
    node.classList.toggle('solo', state.solo === id);
    node.classList.toggle('isolated', Boolean(state.isolate && state.isolate.has(id)));
  });
  syncChips();
}

function highlightSelectedRow() {
  if (!treeRoot) return;
  treeRoot.querySelectorAll('.tree-row').forEach((row) => {
    const id = row.parentElement.dataset.id;
    row.classList.toggle('selected', state.selected.indexOf(id) !== -1 || id === selectedRowId);
  });
}

export function refreshTreeSelection() {
  highlightSelectedRow();
}
