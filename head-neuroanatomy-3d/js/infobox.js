/**
 * Info card: name, group, function, clinical, connected chips, MNI, source, CN facts.
 */

import { state, on, structureById } from './state.js';
import { selectById, flyToId } from './picking.js';

let card;
let handlers = {};

export function initInfobox(opts) {
  handlers = opts || {};
  card = document.getElementById('info-card');
  on('selection', () => render());
  render();
}

function render() {
  if (!card) return;
  const id = state.selected[0];
  const def = id ? structureById(id) : null;
  card.classList.toggle('visible', Boolean(def));
  if (!def) {
    card.innerHTML = '';
    return;
  }

  const group = (state.manifest.groups || []).find((g) => g.id === def.group);
  const extra = state.selected.length > 1
    ? `<p class="muted">${state.selected.length} selected</p>`
    : '';
  const cn = def.cn
    ? `<div class="cn-box"><strong>CN ${roman(def.cn.number)} · ${def.cn.name}</strong><div>Nucleus: ${def.cn.nucleus}</div></div>`
    : '';
  const transmitter = def.transmitter
    ? `<span class="tx-badge tx-${def.transmitter.replace(/[^A-Za-z0-9]/g, '')}">${def.transmitter}</span>`
    : '';
  const schematic = def.schematic
    ? `<span class="badge-schematic">Schematic</span>`
    : '';
  const chips = (def.connected || []).map((cid) => {
    const other = structureById(cid);
    const label = other ? other.name : cid;
    return `<button type="button" class="conn-chip" data-id="${cid}">${label}</button>`;
  }).join('');

  const centroid = def.centroid
    ? `${fmt(def.centroid[0])}, ${fmt(def.centroid[1])}, ${fmt(def.centroid[2])}`
    : '—';
  const chapter = def.chapter6
    ? `<div class="chapter-link">Chapter 6 section: <code>${def.chapter6}</code></div>`
    : '';

  card.innerHTML = `
    <button type="button" class="icon-btn info-close" id="info-close" aria-label="Close">✕</button>
    <div class="info-kicker">${group ? group.name : def.group} · ${sideLabel(def.side)} ${transmitter} ${schematic}</div>
    <h2>${def.name}</h2>
    ${extra}
    ${cn}
    <p class="fn">${def.function || 'No function text in this manifest yet.'}</p>
    <p class="clinical"><strong>Clinical.</strong> ${def.clinical || '—'}</p>
    <div class="meta-grid">
      <div><span>MNI centroid</span><strong>${centroid}</strong></div>
      <div><span>Layer</span><strong>${def.layer || '—'}</strong></div>
    </div>
    ${chips ? `<div class="conn-label">Connected</div><div class="conn-row">${chips}</div>` : ''}
    ${chapter}
    <div class="licence-line">${def.source || ''} · ${def.licence || ''}</div>
  `;

  const close = card.querySelector('#info-close');
  if (close) {
    close.addEventListener('click', () => {
      selectById(null, false);
      if (handlers.onStateChange) handlers.onStateChange();
    });
  }
  card.querySelectorAll('.conn-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.id;
      selectById(cid, false);
      flyToId(cid);
      if (handlers.onStateChange) handlers.onStateChange();
    });
  });
}

function sideLabel(side) {
  if (side === 'L') return 'Left';
  if (side === 'R') return 'Right';
  return 'Midline';
}

function fmt(n) {
  return Number(n).toFixed(1);
}

function roman(n) {
  const map = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return map[n] || String(n);
}
