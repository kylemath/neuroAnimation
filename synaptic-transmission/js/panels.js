/**
 * panels.js - Draggable and minimizable panel management
 * 
 * Features:
 * - Drag panels by their headers
 * - Minimize/maximize panels
 * - Snap to grid when released
 * - Persist positions in localStorage
 */

const GRID_SIZE = 20; // Grid snap size in pixels
const STORAGE_KEY = 'synaptic-panel-positions';

// Panel configurations
const PANEL_CONFIG = {
  'presynaptic-panel': { defaultMinimized: false },
  'postsynaptic-panel': { defaultMinimized: false },
  'cleft-panel': { defaultMinimized: false },
  'legend': { defaultMinimized: true },
  'controls-panel': { defaultMinimized: false },
  'graphs-panel': { defaultMinimized: false },
  'plasticity-panel': { defaultMinimized: false }
};

// State tracking
let panelStates = {};
let activePanel = null;
let dragOffset = { x: 0, y: 0 };
let isDragging = false;

/**
 * Initialize all panels with drag and minimize functionality
 */
export function initPanels() {
  // Load saved states
  loadPanelStates();
  
  // Setup each panel
  const panels = document.querySelectorAll('.info-panel, .cleft-panel, .legend, .controls-panel, .graphs-panel, .plasticity-panel');
  
  panels.forEach(panel => {
    const panelId = getPanelId(panel);
    if (!panelId) return;
    
    // Add draggable class
    panel.classList.add('draggable-panel');
    
    // Create header wrapper if needed
    wrapPanelHeader(panel, panelId);
    
    // Apply saved state
    applyPanelState(panel, panelId);
    
    // Setup drag events
    setupDragEvents(panel, panelId);
  });
  
  // Global mouse events for dragging
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd);
}

/**
 * Get panel ID from element
 */
function getPanelId(panel) {
  // Check for specific classes
  if (panel.classList.contains('presynaptic-panel')) return 'presynaptic-panel';
  if (panel.classList.contains('postsynaptic-panel')) return 'postsynaptic-panel';
  if (panel.classList.contains('cleft-panel')) return 'cleft-panel';
  if (panel.classList.contains('legend')) return 'legend';
  if (panel.classList.contains('controls-panel')) return 'controls-panel';
  if (panel.classList.contains('graphs-panel')) return 'graphs-panel';
  if (panel.classList.contains('plasticity-panel')) return 'plasticity-panel';
  return null;
}

/**
 * Wrap existing header elements with draggable header
 */
function wrapPanelHeader(panel, panelId) {
  // Check if already wrapped
  if (panel.querySelector('.panel-header-wrapper')) return;
  
  // Find existing title element
  let existingTitle = panel.querySelector('.panel-title, .plasticity-panel-header, h2:first-child');
  let existingSubtitle = panel.querySelector('.panel-subtitle');
  
  // Create header wrapper
  const headerWrapper = document.createElement('div');
  headerWrapper.className = 'panel-header-wrapper';
  
  // Create drag handle
  const dragHandle = document.createElement('div');
  dragHandle.className = 'panel-drag-handle';
  dragHandle.innerHTML = '⋮⋮';
  dragHandle.title = 'Drag to move';
  
  // Create title container
  const titleContainer = document.createElement('div');
  titleContainer.className = 'panel-title-container';
  
  // Create minimize button
  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'panel-minimize-btn';
  minimizeBtn.innerHTML = '−';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMinimize(panel, panelId);
  });
  
  // Move existing title into container
  if (existingTitle) {
    // For plasticity panel, handle differently
    if (panel.classList.contains('plasticity-panel')) {
      const plasticityHeader = panel.querySelector('.plasticity-panel-header');
      if (plasticityHeader) {
        titleContainer.innerHTML = plasticityHeader.innerHTML;
        plasticityHeader.remove();
      }
    } else {
      titleContainer.appendChild(existingTitle.cloneNode(true));
      if (existingSubtitle) {
        titleContainer.appendChild(existingSubtitle.cloneNode(true));
        existingSubtitle.remove();
      }
      existingTitle.remove();
    }
  } else {
    // Create title based on panel type
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = getPanelTitle(panelId);
    titleContainer.appendChild(title);
  }
  
  // Assemble header
  headerWrapper.appendChild(dragHandle);
  headerWrapper.appendChild(titleContainer);
  headerWrapper.appendChild(minimizeBtn);
  
  // Insert at top of panel
  panel.insertBefore(headerWrapper, panel.firstChild);
}

/**
 * Get default title for panel
 */
function getPanelTitle(panelId) {
  const titles = {
    'presynaptic-panel': '🔴 Presynaptic Terminal',
    'postsynaptic-panel': '🔵 Postsynaptic Spine',
    'cleft-panel': '⚡ Synaptic Cleft',
    'legend': '🎨 Legend',
    'controls-panel': '⚙️ Controls',
    'graphs-panel': '📊 Graphs',
    'plasticity-panel': '🧠 Synaptic Plasticity'
  };
  return titles[panelId] || 'Panel';
}

/**
 * Setup drag events for panel
 */
function setupDragEvents(panel, panelId) {
  const header = panel.querySelector('.panel-header-wrapper');
  if (!header) return;
  
  header.addEventListener('mousedown', (e) => {
    // Don't drag if clicking minimize button
    if (e.target.classList.contains('panel-minimize-btn')) return;
    startDrag(e, panel, panelId);
  });
  
  header.addEventListener('touchstart', (e) => {
    if (e.target.classList.contains('panel-minimize-btn')) return;
    startDrag(e, panel, panelId);
  }, { passive: false });
}

/**
 * Start dragging a panel
 */
function startDrag(e, panel, panelId) {
  e.preventDefault();
  
  activePanel = panel;
  isDragging = true;
  
  const rect = panel.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  
  dragOffset.x = clientX - rect.left;
  dragOffset.y = clientY - rect.top;
  
  // Remove any CSS positioning that might interfere
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.transform = 'none';
  
  // Set initial position
  panel.style.left = rect.left + 'px';
  panel.style.top = rect.top + 'px';
  
  panel.classList.add('dragging');
  
  // Bring to front
  bringToFront(panel);
}

/**
 * Handle mouse move during drag
 */
function handleMouseMove(e) {
  if (!isDragging || !activePanel) return;
  
  const x = e.clientX - dragOffset.x;
  const y = e.clientY - dragOffset.y;
  
  // Apply position (will snap on release)
  activePanel.style.left = x + 'px';
  activePanel.style.top = y + 'px';
}

/**
 * Handle touch move during drag
 */
function handleTouchMove(e) {
  if (!isDragging || !activePanel) return;
  
  e.preventDefault();
  
  const touch = e.touches[0];
  const x = touch.clientX - dragOffset.x;
  const y = touch.clientY - dragOffset.y;
  
  activePanel.style.left = x + 'px';
  activePanel.style.top = y + 'px';
}

/**
 * Handle mouse up - snap to grid and save
 */
function handleMouseUp() {
  if (!isDragging || !activePanel) return;
  
  finishDrag();
}

/**
 * Handle touch end
 */
function handleTouchEnd() {
  if (!isDragging || !activePanel) return;
  
  finishDrag();
}

/**
 * Finish dragging - snap and save
 */
function finishDrag() {
  if (!activePanel) return;
  
  const panelId = getPanelId(activePanel);
  
  // Get current position
  let x = parseInt(activePanel.style.left) || 0;
  let y = parseInt(activePanel.style.top) || 0;
  
  // Snap to grid
  x = Math.round(x / GRID_SIZE) * GRID_SIZE;
  y = Math.round(y / GRID_SIZE) * GRID_SIZE;
  
  // Constrain to viewport
  const rect = activePanel.getBoundingClientRect();
  const maxX = window.innerWidth - 50;
  const maxY = window.innerHeight - 50;
  
  x = Math.max(0, Math.min(x, maxX - rect.width + 50));
  y = Math.max(0, Math.min(y, maxY - rect.height + 50));
  
  // Snap again after constraining
  x = Math.round(x / GRID_SIZE) * GRID_SIZE;
  y = Math.round(y / GRID_SIZE) * GRID_SIZE;
  
  // Apply snapped position
  activePanel.style.left = x + 'px';
  activePanel.style.top = y + 'px';
  
  activePanel.classList.remove('dragging');
  
  // Save state
  if (panelId) {
    savePanelPosition(panelId, x, y);
  }
  
  isDragging = false;
  activePanel = null;
}

/**
 * Toggle minimize state
 */
function toggleMinimize(panel, panelId) {
  const isMinimized = panel.classList.toggle('minimized');
  
  // Update button text
  const btn = panel.querySelector('.panel-minimize-btn');
  if (btn) {
    btn.innerHTML = isMinimized ? '+' : '−';
    btn.title = isMinimized ? 'Expand' : 'Minimize';
  }
  
  // Snap to grid when minimizing (panels are smaller)
  if (isMinimized) {
    let x = parseInt(panel.style.left) || 0;
    let y = parseInt(panel.style.top) || 0;
    
    // Re-snap after size change
    x = Math.round(x / GRID_SIZE) * GRID_SIZE;
    y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }
  
  // Save state
  savePanelMinimized(panelId, isMinimized);
}

/**
 * Bring panel to front
 */
function bringToFront(panel) {
  // Get all panels
  const panels = document.querySelectorAll('.draggable-panel');
  let maxZ = 10;
  
  panels.forEach(p => {
    const z = parseInt(getComputedStyle(p).zIndex) || 10;
    if (z > maxZ) maxZ = z;
  });
  
  panel.style.zIndex = maxZ + 1;
}

/**
 * Load panel states from localStorage
 */
function loadPanelStates() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      panelStates = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Could not load panel states:', e);
    panelStates = {};
  }
}

/**
 * Save panel position
 */
function savePanelPosition(panelId, x, y) {
  if (!panelStates[panelId]) {
    panelStates[panelId] = {};
  }
  panelStates[panelId].x = x;
  panelStates[panelId].y = y;
  savePanelStates();
}

/**
 * Save panel minimized state
 */
function savePanelMinimized(panelId, isMinimized) {
  if (!panelStates[panelId]) {
    panelStates[panelId] = {};
  }
  panelStates[panelId].minimized = isMinimized;
  savePanelStates();
}

/**
 * Save all panel states to localStorage
 */
function savePanelStates() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panelStates));
  } catch (e) {
    console.warn('Could not save panel states:', e);
  }
}

/**
 * Apply saved state to panel
 */
function applyPanelState(panel, panelId) {
  const state = panelStates[panelId];
  const config = PANEL_CONFIG[panelId] || {};
  
  // Apply position if saved
  if (state && typeof state.x === 'number' && typeof state.y === 'number') {
    panel.style.left = state.x + 'px';
    panel.style.top = state.y + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transform = 'none';
  }
  
  // Apply minimized state
  const isMinimized = state?.minimized ?? config.defaultMinimized;
  if (isMinimized) {
    panel.classList.add('minimized');
    const btn = panel.querySelector('.panel-minimize-btn');
    if (btn) {
      btn.innerHTML = '+';
      btn.title = 'Expand';
    }
  }
}

/**
 * Reset all panels to default positions
 */
export function resetPanelPositions() {
  // Clear saved states
  panelStates = {};
  savePanelStates();
  
  // Remove inline styles and reload page
  const panels = document.querySelectorAll('.draggable-panel');
  panels.forEach(panel => {
    panel.style.left = '';
    panel.style.top = '';
    panel.style.right = '';
    panel.style.bottom = '';
    panel.style.transform = '';
    panel.style.zIndex = '';
    panel.classList.remove('minimized', 'dragging');
  });
  
  // Re-initialize
  location.reload();
}

/**
 * Minimize all panels
 */
export function minimizeAllPanels() {
  const panels = document.querySelectorAll('.draggable-panel');
  panels.forEach(panel => {
    const panelId = getPanelId(panel);
    if (panelId && !panel.classList.contains('minimized')) {
      toggleMinimize(panel, panelId);
    }
  });
}

/**
 * Expand all panels
 */
export function expandAllPanels() {
  const panels = document.querySelectorAll('.draggable-panel');
  panels.forEach(panel => {
    const panelId = getPanelId(panel);
    if (panelId && panel.classList.contains('minimized')) {
      toggleMinimize(panel, panelId);
    }
  });
}
