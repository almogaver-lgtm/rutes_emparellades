'use strict';

window.EventBus = {
  _listeners: {},
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  },
  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  },
  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(cb => cb(data));
  }
};

window.AppState = {
  mode: 'navigate',
  currentMapId: null,
  isRecordingRoute: false,
  isRoutePaused: false,
  pendingMapSaveSync: false,
  compassActive: false,
  isOffline: !navigator.onLine
};

window.bindPress = function bindPress(element, handler) {
  if (!element || typeof handler !== 'function') return;

  let lastTouchLikePressAt = 0;
  element.style.touchAction = 'manipulation';

  element.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse') return;
    lastTouchLikePressAt = Date.now();
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  });

  element.addEventListener('click', (event) => {
    if (Date.now() - lastTouchLikePressAt < 700) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  });
};

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Starting Rutes Emparellades PWA initialization...');

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      console.log('Service Worker registered successfully with scope:', reg.scope);
    } catch (err) {
      console.error('Service Worker registration failed:', err);
    }
  }

  try {
    await window.StorageModule.init();

    window.MapModule.init();
    window.ImporterModule.init();
    window.AlignerModule.init();
    window.ControlPointsModule.init();
    window.GPSTracker.init();
    window.CompassModule.init();
    window.CameraGuideModule.init();
    window.UIModule.init();

    setupConnectivityMonitor();
    setupAppStateOrchestration();

    window.EventBus.emit('app:offline', { offline: !navigator.onLine });

    console.log('Rutes Emparellades fully initialized and ready!');
  } catch (err) {
    console.error('Critical initialization error:', err);
  }
});

function setupConnectivityMonitor() {
  window.addEventListener('online', () => {
    window.AppState.isOffline = false;
    window.EventBus.emit('app:offline', { offline: false });
    window.UIModule.showToast('Connexio de xarxa restablerta.', 'success');
  });

  window.addEventListener('offline', () => {
    window.AppState.isOffline = true;
    window.EventBus.emit('app:offline', { offline: true });
    window.UIModule.showToast('Mode offline actiu. Els mapes cached seguiran disponibles.', 'warning', 5000);
  });
}

function setupAppStateOrchestration() {
  window.EventBus.on('app:mode-changed', (data) => {
    window.AppState.mode = data.mode;

    const alignBtn = document.getElementById('btn-align');

    if (data.mode === 'align') {
      alignBtn.classList.add('active');
    } else if (data.mode === 'control-points') {
      alignBtn.classList.add('active');
      window.UIModule.showToast('Mode de punts de control. Selecciona 3 correspondencies.', 'info');
    } else {
      alignBtn.classList.remove('active');
      document.getElementById('align-toolbar').classList.add('hidden');
    }
  });

  window.EventBus.on('image:imported', () => {
    window.AppState.mode = 'align';
    window.EventBus.emit('app:mode-changed', { mode: 'align' });
  });

  window.EventBus.on('route:started', () => {
    window.AppState.isRecordingRoute = true;
    window.AppState.isRoutePaused = false;
  });

  window.EventBus.on('route:paused', () => {
    window.AppState.isRecordingRoute = true;
    window.AppState.isRoutePaused = true;
  });

  window.EventBus.on('route:stopped', () => {
    window.AppState.isRecordingRoute = false;
    window.AppState.isRoutePaused = false;
  });

  window.EventBus.on('align:confirmed', () => {
    if (window.AppState.pendingMapSaveSync) return;
    window.AppState.pendingMapSaveSync = true;
    window.EventBus.on('storage:map-saved', function handleMapSaved(saved) {
      window.AppState.currentMapId = saved.id;
      window.AppState.pendingMapSaveSync = false;
      window.EventBus.off('storage:map-saved', handleMapSaved);
    });
  });

  window.EventBus.on('image:cleared', () => {
    window.AppState.pendingMapSaveSync = false;
  });

  window.EventBus.on('storage:map-loaded', (data) => {
    window.AppState.currentMapId = data.mapData.id;
    window.UIModule.showToast(`Mapa "${data.mapData.name}" carregat.`, 'success');
  });

  window.EventBus.on('ui:align-requested', () => {
    const aligner = window.AlignerModule;

    if (window.AppState.mode === 'navigate' && aligner._imageDataUrl) {
      aligner.resumeAlignment();
    } else if (window.AppState.mode === 'align') {
      aligner.confirmAlignment();
    } else if (window.AppState.mode === 'control-points') {
      aligner.confirmAlignment();
    }
  });

  window.EventBus.on('compass:toggled', (data) => {
    window.AppState.compassActive = data.active;
  });
}
