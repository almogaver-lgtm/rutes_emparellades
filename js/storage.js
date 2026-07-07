'use strict';

window.StorageModule = {
  _db: null,
  _dbName: 'rutes-emparellades-db',
  _dbVersion: 1,

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this._dbName, this._dbVersion);

      request.onerror = (event) => {
        console.error('Database error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this._db = event.target.result;
        console.log('Database initialized successfully');
        this._setupListeners();
        resolve(this);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store per als mapes
        if (!db.objectStoreNames.contains('maps')) {
          const mapStore = db.createObjectStore('maps', { keyPath: 'id' });
          mapStore.createIndex('name', 'name', { unique: false });
          mapStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Store per a les rutes
        if (!db.objectStoreNames.contains('routes')) {
          const routeStore = db.createObjectStore('routes', { keyPath: 'id' });
          routeStore.createIndex('name', 'name', { unique: false });
          routeStore.createIndex('startedAt', 'startedAt', { unique: false });
        }

        // Store per a configuracions key-value
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  },

  _setupListeners() {
    // Escolta confirmació d'alineació per guardar el mapa
    window.EventBus.on('align:confirmed', (data) => {
      // El diàleg de guardar es gestiona a ui.js, que emet ui:save-map-requested.
      // Guardem temporalment les dades per quan es demani el nom del mapa.
      this._pendingMapData = data;
    });

    window.EventBus.on('ui:save-map-requested', async (data) => {
      if (!this._pendingMapData) return;
      try {
        const blob = await this.dataUrlToBlob(this._pendingMapData.imageDataUrl);
        const mapData = {
          id: this.generateUUID(),
          name: data.name || 'Mapa sense nom',
          imageBlob: blob,
          topLeft: this._pendingMapData.topLeft,
          topRight: this._pendingMapData.topRight,
          bottomLeft: this._pendingMapData.bottomLeft,
          opacity: this._pendingMapData.opacity,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await this.saveMap(mapData);
        this._pendingMapData = null;
        window.EventBus.emit('storage:map-saved', { id: mapData.id, name: mapData.name });
        // Recarregar llista de mapes
        this.listMaps();
      } catch (err) {
        console.error('Error saving map:', err);
        window.EventBus.emit('gps:error', { message: 'Error al desar el mapa' });
      }
    });

    window.EventBus.on('ui:load-map-requested', async (data) => {
      try {
        const mapData = await this.loadMap(data.id);
        window.EventBus.emit('storage:map-loaded', { mapData });
      } catch (err) {
        console.error('Error loading map:', err);
      }
    });

    window.EventBus.on('ui:delete-map-requested', async (data) => {
      try {
        await this.deleteMap(data.id);
        this.listMaps(); // actualitza llista
      } catch (err) {
        console.error('Error deleting map:', err);
      }
    });
  },

  // --- MAPES ---

  saveMap(mapData) {
    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction(['maps'], 'readwrite');
      const store = transaction.objectStore('maps');
      const request = store.put(mapData);

      request.onsuccess = () => resolve(mapData.id);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  loadMap(id) {
    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction(['maps'], 'readonly');
      const store = transaction.objectStore('maps');
      const request = store.get(id);

      request.onsuccess = async (e) => {
        const mapData = e.target.result;
        if (!mapData) {
          reject(new Error('Mapa no trobat'));
          return;
        }
        // Convertir el Blob a DataUrl per poder-lo pintar a Leaflet
        try {
          mapData.imageDataUrl = await this.blobToDataUrl(mapData.imageBlob);
          resolve(mapData);
        } catch (err) {
          reject(err);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  listMaps() {
    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction(['maps'], 'readonly');
      const store = transaction.objectStore('maps');
      const request = store.openCursor();
      const maps = [];

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const val = cursor.value;
          // Retornem sense el blob pesat per a optimització de llistes
          maps.push({
            id: val.id,
            name: val.name,
            createdAt: val.createdAt,
            updatedAt: val.updatedAt,
            opacity: val.opacity
          });
          cursor.continue();
        } else {
          // Ordenar per data de creació descendent
          maps.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
          window.EventBus.emit('storage:maps-listed', { maps });
          resolve(maps);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  deleteMap(id) {
    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction(['maps'], 'readwrite');
      const store = transaction.objectStore('maps');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  },

  // --- RUTES ---

  saveRoute(routeData) {
    return new Promise((resolve, reject) => {
      if (!routeData.id) {
        routeData.id = this.generateUUID();
      }
      const transaction = this._db.transaction(['routes'], 'readwrite');
      const store = transaction.objectStore('routes');
      const request = store.put(routeData);

      request.onsuccess = () => {
        window.EventBus.emit('storage:route-saved', { id: routeData.id, name: routeData.name });
        this.listRoutes();
        resolve(routeData.id);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  loadRoute(id) {
    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction(['routes'], 'readonly');
      const store = transaction.objectStore('routes');
      const request = store.get(id);

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  listRoutes() {
    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction(['routes'], 'readonly');
      const store = transaction.objectStore('routes');
      const request = store.openCursor();
      const routes = [];

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const val = cursor.value;
          // Retornem només metadades i estadístiques
          routes.push({
            id: val.id,
            name: val.name,
            mapId: val.mapId,
            stats: val.stats,
            startedAt: val.startedAt,
            finishedAt: val.finishedAt
          });
          cursor.continue();
        } else {
          routes.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
          window.EventBus.emit('storage:routes-listed', { routes });
          resolve(routes);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  deleteRoute(id) {
    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction(['routes'], 'readwrite');
      const store = transaction.objectStore('routes');
      const request = store.delete(id);

      request.onsuccess = () => {
        this.listRoutes();
        resolve();
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  exportRouteAsJSON(id) {
    return this.loadRoute(id).then((routeData) => {
      if (!routeData) {
        throw new Error('Ruta no trobada');
      }
      return JSON.stringify(routeData, null, 2);
    });
  },

  // --- SETTINGS ---

  getSetting(key, defaultValue) {
    return new Promise((resolve) => {
      if (!this._db) {
        resolve(defaultValue);
        return;
      }
      const transaction = this._db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = (e) => {
        const res = e.target.result;
        resolve(res ? res.value : defaultValue);
      };
      request.onerror = () => resolve(defaultValue);
    });
  },

  setSetting(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this._db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  },

  // --- UTILS ---

  generateUUID() {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback manual si no està disponible
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  dataUrlToBlob(dataUrl) {
    return fetch(dataUrl).then(res => res.blob());
  },

  blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};
