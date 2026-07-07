'use strict';

// 1. Definició del EventBus global de comunicació
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

// 2. Definició de l'estat global de l'aplicació
window.AppState = {
  mode: 'navigate', // 'navigate' | 'align' | 'control-points'
  currentMapId: null,
  isRecordingRoute: false,
  isRoutePaused: false,
  pendingMapSaveSync: false,
  compassActive: false,
  isOffline: !navigator.onLine
};

// 3. Inicialitzador de l'aplicació
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Starting Rutes Emparellades PWA initialization...');

  // Registrar el Service Worker per al suport Offline
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      console.log('Service Worker registered successfully with scope:', reg.scope);
    } catch (err) {
      console.error('Service Worker registration failed:', err);
    }
  }

  // Inicialitzar els mòduls en seqüència lògica de dependència
  try {
    // A) Emmagatzematge (Base de dades IndexedDB)
    await window.StorageModule.init();

    // B) Mapa Leaflet
    window.MapModule.init();

    // C) Importador d'imatges
    window.ImporterModule.init();

    // D) Alineador visual i georeferenciador
    window.AlignerModule.init();
    window.ControlPointsModule.init();

    // E) GPS i brúixola
    window.GPSTracker.init();
    window.CompassModule.init();

    // F) Interfície d'Usuari
    window.UIModule.init();

    // G) Configuració de controls de connectivitat i estat
    setupConnectivityMonitor();
    setupAppStateOrchestration();

    // Notificar estat inicial offline/online
    window.EventBus.emit('app:offline', { offline: !navigator.onLine });
    
    // Iniciar geolocalització passiva per mostrar la ubicació a l'inici

    console.log('Rutes Emparellades fully initialized and ready!');
  } catch (err) {
    console.error('Critical initialization error:', err);
  }
});

// Monitor d'estat de connexió online/offline de la xarxa
function setupConnectivityMonitor() {
  window.addEventListener('online', () => {
    window.AppState.isOffline = false;
    window.EventBus.emit('app:offline', { offline: false });
    window.UIModule.showToast('Connexió de xarxa restablerta.', 'success');
  });

  window.addEventListener('offline', () => {
    window.AppState.isOffline = true;
    window.EventBus.emit('app:offline', { offline: true });
    window.UIModule.showToast('Mode offline actiu. Els mapes cached seguiran disponibles.', 'warning', 5000);
  });
}

// Orquestració centralitzada de modes d'ús de l'aplicació
function setupAppStateOrchestration() {
  // Canvis de mode de treball de l'aplicació
  window.EventBus.on('app:mode-changed', (data) => {
    window.AppState.mode = data.mode;
    
    // Configurar estats visuals globals
    const alignBtn = document.getElementById('btn-align');
    
    if (data.mode === 'align') {
      alignBtn.classList.add('active');
    } else if (data.mode === 'control-points') {
      alignBtn.classList.add('active');
      // Mostrar toast instructiu
      window.UIModule.showToast('Mode de punts de control. Selecciona 3 correspondències.', 'info');
    } else {
      alignBtn.classList.remove('active');
      
      // Amagar barres d'alineació si es torna a mode navegació
      document.getElementById('align-toolbar').classList.add('hidden');
    }
  });

  // Quan s'importa una imatge nova, activar el botó d'alineació a la UI
  window.EventBus.on('image:imported', () => {
    window.AppState.mode = 'align';
    window.EventBus.emit('app:mode-changed', { mode: 'align' });
  });

  // Escolta inici de gravació de rutes
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

  // Quan es confirma l'alineació d'un mapa
  window.EventBus.on('align:confirmed', () => {
    if (window.AppState.pendingMapSaveSync) return;
    window.AppState.pendingMapSaveSync = true;
    // Al desar-se el mapa, en guardarem la referència de id
  window.EventBus.on('storage:map-saved', function handleMapSaved(saved) {
      window.AppState.currentMapId = saved.id;
      window.AppState.pendingMapSaveSync = false;
      window.EventBus.off('storage:map-saved', handleMapSaved);
    });
  });

  window.EventBus.on('image:cleared', () => {
    window.AppState.pendingMapSaveSync = false;
  });

  // Quan es carrega un mapa des del menú lateral
  window.EventBus.on('storage:map-loaded', (data) => {
    window.AppState.currentMapId = data.mapData.id;
    window.UIModule.showToast(`Mapa "${data.mapData.name}" carregat.`, 'success');
  });

  // Maneig de petició d'alineació des del botó toolbar
  window.EventBus.on('ui:align-requested', () => {
    const aligner = window.AlignerModule;
    
    if (window.AppState.mode === 'navigate' && aligner._imageDataUrl) {
      // Si ja hi ha un mapa actiu/carregat, permetre tornar a alinear-lo
      aligner.resumeAlignment();
    } else if (window.AppState.mode === 'align') {
      // Si estem en mode alineació i tornen a prémer, confirmem
      aligner.confirmAlignment();
    } else if (window.AppState.mode === 'control-points') {
      // Si estem en control points, confirmem i sortim
      aligner.confirmAlignment();
    }
  });

  // Brúixola toggles
  window.EventBus.on('compass:toggled', (data) => {
    window.AppState.compassActive = data.active;
  });
}
