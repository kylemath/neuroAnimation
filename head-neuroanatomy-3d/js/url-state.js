/**
 * Shareable URL hash for preset, selection, ghost, arousal, clips, view, exploded.
 *
 * #p=aras&s=pag&g=40&a=75&v=right&c=0,0,-8&ce=0,0,1&e=0
 */

import { state } from './state.js';
import { setView } from './scene.js';
import { setGhost, applyAppearance } from './structures.js';
import { selectById } from './picking.js';
import { updateClipping, setExploded, syncClippingUi } from './clipping.js';
import { setEnabled as setArasEnabled, setArousal, syncArasUi } from './aras.js';
import { applyPreset, syncPresetActive } from './presets.js';

let applying = false;
let writeTimer = 0;

export function readHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return null;
  const out = {};
  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    out[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
  }
  return out;
}

export function writeHash() {
  if (applying) return;
  const parts = [];
  if (state.preset) parts.push(`p=${enc(state.preset)}`);
  if (state.selected.length) parts.push(`s=${enc(state.selected.join(','))}`);
  parts.push(`g=${Math.round(state.ghost * 100)}`);
  parts.push(`a=${Math.round(state.arousal * 100)}`);
  if (state.viewName && state.viewName !== 'oblique') parts.push(`v=${enc(state.viewName)}`);
  const c = state.clipping;
  parts.push(`c=${c.sagittal.value},${c.coronal.value},${c.axial.value}`);
  parts.push(`ce=${n(c.sagittal.enabled)},${n(c.coronal.enabled)},${n(c.axial.enabled)}`);
  if (c.sagittal.flip || c.coronal.flip || c.axial.flip) {
    parts.push(`cf=${n(c.sagittal.flip)},${n(c.coronal.flip)},${n(c.axial.flip)}`);
  }
  if (state.explodedSlices) parts.push('e=1');
  if (!state.arasEnabled) parts.push('ar=0');
  const hash = parts.join('&');
  const next = `#${hash}`;
  if (window.location.hash !== next) {
    history.replaceState(null, '', next);
  }
}

export function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(writeHash, 80);
}

export function listenHash() {
  window.addEventListener('hashchange', () => {
    if (applying) return;
    applyHash();
  });
}

export function applyHash(hash) {
  const data = hash || readHash();
  if (!data) return;
  applying = true;
  try {
    if (data.p) applyPreset(data.p);
    if (data.g !== undefined) {
      const g = Number(data.g) / 100;
      setGhost(g);
      const slider = document.getElementById('ghost-slider');
      const val = document.getElementById('ghost-val');
      if (slider) slider.value = String(data.g);
      if (val) val.textContent = `${data.g}%`;
    }
    if (data.a !== undefined) setArousal(Number(data.a) / 100);
    if (data.ar !== undefined) setArasEnabled(data.ar !== '0');
    if (data.v) setView(data.v, 0);
    if (data.c) {
      const [sx, cy, az] = data.c.split(',').map(Number);
      if (!Number.isNaN(sx)) state.clipping.sagittal.value = sx;
      if (!Number.isNaN(cy)) state.clipping.coronal.value = cy;
      if (!Number.isNaN(az)) state.clipping.axial.value = az;
    }
    if (data.ce) {
      const [se, ce, ae] = data.ce.split(',');
      state.clipping.sagittal.enabled = se === '1';
      state.clipping.coronal.enabled = ce === '1';
      state.clipping.axial.enabled = ae === '1';
    }
    if (data.cf) {
      const [sf, cf, af] = data.cf.split(',');
      state.clipping.sagittal.flip = sf === '1';
      state.clipping.coronal.flip = cf === '1';
      state.clipping.axial.flip = af === '1';
    }
    if (data.e !== undefined) setExploded(data.e === '1');
    if (data.s) {
      const ids = data.s.split(',').filter(Boolean);
      if (ids.length) selectById(ids[0], false);
      if (ids.length > 1) {
        state.selected = ids;
        applyAppearance();
      }
    }
    syncClippingUi();
    updateClipping();
    syncArasUi();
    syncPresetActive();
  } finally {
    applying = false;
  }
}

function enc(s) {
  return encodeURIComponent(s);
}

function n(b) {
  return b ? '1' : '0';
}
