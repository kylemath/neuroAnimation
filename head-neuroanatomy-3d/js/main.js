/**
 * Head Neuroanatomy 3D — entry point.
 */

import { state } from './state.js';
import { initScene, renderScene, setView, clock, scene } from './scene.js';
import { loadManifest, loadGroups } from './loader.js';
import { applyAppearance, initVisibilityFromManifest } from './structures.js';
import { initTreeUi } from './tree-ui.js';
import { initPicking, selectById, flyToId } from './picking.js';
import { initInfobox } from './infobox.js';
import {
  initFrame, renderGizmo, updateScaleBar, setMniReadout, refreshFiducials,
  setGridVisible, setAxesVisible, setLandmarksVisible, getFrameVisibility,
} from './frame.js';
import { initClipping, populateSliceButtons } from './clipping.js';
import { initAras, updateAras } from './aras.js';
import { initPresets } from './presets.js';
import { applyHash, scheduleWrite, listenHash } from './url-state.js';

function setProgress(label, fraction) {
  const bar = document.getElementById('progress-bar');
  const text = document.getElementById('progress-label');
  if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
  if (text) text.textContent = label;
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.add('done');
  setTimeout(() => overlay.remove(), 400);
}

function bindViewButtons() {
  const map = {
    'btn-view-left': 'left',
    'btn-view-right': 'right',
    'btn-view-ant': 'anterior',
    'btn-view-post': 'posterior',
    'btn-view-sup': 'superior',
    'btn-view-inf': 'inferior',
    'btn-view-oblique': 'oblique',
  };
  for (const [id, view] of Object.entries(map)) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => {
      setView(view);
      scheduleWrite();
    });
  }
}

function bindFrameToggles() {
  const defs = [
    ['toggle-grid', setGridVisible, 'grid'],
    ['toggle-axes', setAxesVisible, 'axes'],
    ['toggle-landmarks', setLandmarksVisible, 'landmarks'],
  ];
  const current = getFrameVisibility();
  for (const [id, setter, key] of defs) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.classList.toggle('off', !current[key]);
    btn.addEventListener('click', () => {
      const on = btn.classList.contains('off');
      setter(on);
      btn.classList.toggle('off', !on);
      scheduleWrite();
    });
  }
}

function bindMobileChrome() {
  const tree = document.getElementById('tree-panel');
  const tools = document.getElementById('tools-panel');
  document.getElementById('btn-toggle-tree').addEventListener('click', () => {
    tree.classList.toggle('open');
    tools.classList.remove('open');
  });
  document.getElementById('btn-toggle-tools').addEventListener('click', () => {
    tools.classList.toggle('open');
    tree.classList.remove('open');
  });
  document.getElementById('btn-close-tree').addEventListener('click', () => tree.classList.remove('open'));
  document.getElementById('btn-close-tools').addEventListener('click', () => tools.classList.remove('open'));
}

function bindCredits() {
  const overlay = document.getElementById('credits-overlay');
  document.getElementById('btn-credits').addEventListener('click', () => {
    overlay.hidden = false;
  });
  document.getElementById('btn-close-credits').addEventListener('click', () => {
    overlay.hidden = true;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
}

function fillCredits() {
  const host = document.getElementById('credits-body');
  const credits = state.manifest && state.manifest.credits;
  if (!host || !credits) return;
  const items = (credits.items || []).map((item) => `
    <li>
      <strong>${item.name}</strong>
      <span class="lic">${item.licence}</span>
      <p>${item.note}</p>
    </li>`).join('');
  host.innerHTML = `
    <p class="disclaimer">${credits.disclaimer}</p>
    <ul class="credit-list">${items}</ul>
    <p class="muted">Master space: MNI152 millimetres, RAS+. Origin near the anterior commissure. three.js world = (x, z, −y).</p>
  `;
}

function updateAssetBanner() {
  const banner = document.getElementById('asset-banner');
  if (!banner) return;
  if (state.usingPlaceholders) {
    banner.hidden = false;
    banner.textContent = 'Schematic placeholders — add group GLBs under assets/ to replace these meshes. The loader already uses the structures.json contract.';
  } else if (state.missingAssets.length) {
    banner.hidden = false;
    banner.textContent = `Loaded some assets. Missing: ${state.missingAssets.join(', ')}. Those groups use schematic meshes.`;
  } else {
    banner.hidden = true;
  }
}

function onStateChange() {
  scheduleWrite();
}

async function init() {
  initScene();
  initFrame();
  bindViewButtons();
  bindFrameToggles();
  bindMobileChrome();
  bindCredits();

  setProgress('Reading manifest…', 0.04);
  await loadManifest(setProgress);
  refreshFiducials();
  populateSliceButtons();
  fillCredits();

  await loadGroups(scene, setProgress);
  initVisibilityFromManifest();
  applyAppearance();
  updateAssetBanner();

  initTreeUi({
    onSelect: (id) => {
      if (id) {
        selectById(id, false);
        flyToId(id);
      }
      onStateChange();
    },
    onReset: onStateChange,
    onStateChange,
  });
  initPicking({
    onSelect: () => onStateChange(),
    onMni: (mni, source) => setMniReadout(mni, source),
  });
  initInfobox({ onStateChange });
  initClipping();
  initAras();
  initPresets(onStateChange);

  listenHash();
  applyHash();
  hideLoading();
  animate();
}

let frames = 0;
let fpsAt = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  updateAras(dt);
  updateScaleBar();
  renderScene(() => renderGizmo());
  frames += 1;
  const now = performance.now();
  if (now - fpsAt >= 1000) {
    const el = document.getElementById('fps');
    if (el) el.textContent = String(frames);
    state.fps = frames;
    frames = 0;
    fpsAt = now;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
