'use strict';

window.UIModule = {
  init() {
    this._setupListeners();
    this._setupDOMEvents();
    return this;
  },

  _setupListeners() {
    window.EventBus.on('storage:map-saved', (data) => {
      this.showToast(`Mapa "${data.name}" desat correctament!`, 'success');
      this.setButtonState('btn-align', 'active');
    });

    window.EventBus.on('storage:route-saved', (data) => {
      this.showToast(`Ruta "${data.name}" desada!`, 'success');
    });

    window.EventBus.on('storage:maps-listed', (data) => {
      this.updateMapsList(data.maps);
    });

    window.EventBus.on('storage:routes-listed', (data) => {
      this.updateRoutesList(data.routes);
    });

    window.EventBus.on('route:stats', (stats) => {
      this.updateStatsBar(stats);
    });

    window.EventBus.on('route:started', () => {
      this.setButtonState('btn-record', 'active');
      this._setRecordButtonAppearance('recording');
      document.getElementById('stats-bar').classList.remove('hidden');
    });

    window.EventBus.on('route:paused', () => {
      this.setButtonState('btn-record', 'active');
      this._setRecordButtonAppearance('paused');
    });

    window.EventBus.on('route:stopped', (data) => {
      this.setButtonState('btn-record', 'default');
      this._setRecordButtonAppearance('idle');
      this.hideStatsBar();
      this.showSaveRouteDialog(data.routeData);
    });

    window.EventBus.on('app:offline', (data) => {
      const badge = document.getElementById('offline-badge');
      if (data.offline) {
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    });

    window.EventBus.on('image:imported', () => {
      this.setButtonState('btn-align', 'default');
      document.getElementById('btn-align').removeAttribute('disabled');
      document.getElementById('btn-align').classList.remove('disabled');
      this.showToast('Imatge carregada. Iniciant alineacio...', 'info');
    });

    window.EventBus.on('align:confirmed', () => {
      this.showSaveMapDialog();
    });

    window.EventBus.on('gps:error', (data) => {
      this.showToast(data.message, 'error', 5000);
    });
  },

  _setupDOMEvents() {
    document.getElementById('btn-import').addEventListener('click', () => {
      this.showImportDialog();
    });

    document.getElementById('btn-align').addEventListener('click', () => {
      window.EventBus.emit('ui:align-requested', {});
    });

    document.getElementById('btn-gps').addEventListener('click', () => {
      window.GPSTracker.startTracking();
      window.MapModule.centerOnPosition();
      this.showToast('Centrant posicio GPS...', 'info', 1500);
    });

    document.getElementById('btn-record').addEventListener('click', () => {
      const isRecording = window.AppState ? window.AppState.isRecordingRoute : false;
      const isPaused = window.AppState ? window.AppState.isRoutePaused : false;

      if (!isRecording) {
        window.EventBus.emit('ui:toggle-route', { action: 'start' });
      } else {
        this.showModal({
          title: 'Gravacio de Ruta',
          content: 'Que vols fer amb la ruta actual?',
          buttons: [
            {
              text: isPaused ? 'Reprendre' : 'Pausar',
              class: 'secondary',
              onClick: () => {
                this.closeModal();
                window.EventBus.emit('ui:toggle-route', { action: isPaused ? 'resume' : 'pause' });
              }
            },
            {
              text: 'Aturar i Desar',
              class: 'primary',
              onClick: () => {
                this.closeModal();
                window.EventBus.emit('ui:toggle-route', { action: 'stop' });
              }
            },
            {
              text: 'Cancelar',
              class: 'secondary',
              onClick: () => this.closeModal()
            }
          ]
        });
      }
    });

    document.getElementById('btn-compass').addEventListener('click', () => {
      window.EventBus.emit('ui:toggle-compass', {});
    });

    document.getElementById('btn-menu').addEventListener('click', () => {
      this.showSidebar();
    });

    document.getElementById('btn-close-sidebar').addEventListener('click', () => {
      this.hideSidebar();
    });
  },

  showModal({ title, content, buttons }) {
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = '';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<h3>${title}</h3>`;
    modal.appendChild(header);

    const body = document.createElement('div');
    body.className = 'modal-body';
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else {
      body.appendChild(content);
    }
    modal.appendChild(body);

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'modal-buttons';

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.className = `modal-btn ${btn.class || 'secondary'}`;
      button.textContent = btn.text;
      button.addEventListener('click', btn.onClick);
      buttonsContainer.appendChild(button);
    });

    modal.appendChild(buttonsContainer);
    overlay.appendChild(modal);
    overlay.classList.remove('hidden');
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-overlay').innerHTML = '';
  },

  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
    }, duration);
  },

  showSidebar() {
    document.getElementById('sidebar').classList.remove('hidden');
    window.StorageModule.listMaps();
    window.StorageModule.listRoutes();
  },

  hideSidebar() {
    document.getElementById('sidebar').classList.add('hidden');
  },

  updateMapsList(maps) {
    const list = document.getElementById('saved-maps-list');
    list.innerHTML = '';

    if (maps.length === 0) {
      list.innerHTML = '<li class="empty-list-msg">No hi ha cap mapa guardat.</li>';
      return;
    }

    maps.forEach(map => {
      const li = document.createElement('li');

      const info = document.createElement('div');
      info.className = 'item-info';

      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = map.name;
      info.appendChild(name);

      const date = document.createElement('span');
      date.className = 'item-date';
      date.textContent = this.formatDate(map.createdAt);
      info.appendChild(date);

      li.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      const btnLoad = document.createElement('button');
      btnLoad.className = 'item-btn';
      btnLoad.textContent = '📂';
      btnLoad.title = 'Carregar mapa';
      btnLoad.addEventListener('click', () => {
        window.EventBus.emit('ui:load-map-requested', { id: map.id });
        this.hideSidebar();
      });
      actions.appendChild(btnLoad);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'item-btn delete';
      btnDelete.textContent = '🗑️';
      btnDelete.title = 'Eliminar mapa';
      btnDelete.addEventListener('click', () => {
        if (confirm(`Segur que vols eliminar el mapa "${map.name}"?`)) {
          window.EventBus.emit('ui:delete-map-requested', { id: map.id });
        }
      });
      actions.appendChild(btnDelete);

      li.appendChild(actions);
      list.appendChild(li);
    });
  },

  updateRoutesList(routes) {
    const list = document.getElementById('saved-routes-list');
    list.innerHTML = '';

    if (routes.length === 0) {
      list.innerHTML = '<li class="empty-list-msg">No hi ha cap ruta guardada.</li>';
      return;
    }

    routes.forEach(route => {
      const li = document.createElement('li');

      const info = document.createElement('div');
      info.className = 'item-info';

      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = route.name;
      info.appendChild(name);

      const date = document.createElement('span');
      date.className = 'item-date';
      date.textContent = `${this.formatDate(route.startedAt)} · ${this.formatDistance(route.stats.distance)}`;
      info.appendChild(date);

      li.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'item-actions';

      const btnExport = document.createElement('button');
      btnExport.className = 'item-btn';
      btnExport.textContent = '📤';
      btnExport.title = 'Exportar JSON';
      btnExport.addEventListener('click', async () => {
        try {
          const jsonStr = await window.StorageModule.exportRouteAsJSON(route.id);
          this.downloadFile(jsonStr, `${route.name.replace(/\s+/g, '_')}.json`, 'application/json');
        } catch (err) {
          console.error(err);
        }
      });
      actions.appendChild(btnExport);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'item-btn delete';
      btnDelete.textContent = '🗑️';
      btnDelete.title = 'Eliminar ruta';
      btnDelete.addEventListener('click', () => {
        if (confirm(`Segur que vols eliminar la ruta "${route.name}"?`)) {
          window.StorageModule.deleteRoute(route.id);
        }
      });
      actions.appendChild(btnDelete);

      li.appendChild(actions);
      list.appendChild(li);
    });
  },

  updateStatsBar(stats) {
    document.getElementById('stat-distance').textContent = this.formatDistance(stats.distance);
    document.getElementById('stat-duration').textContent = this.formatDuration(stats.duration);
    document.getElementById('stat-speed').textContent = `${stats.avgSpeed.toFixed(1)} km/h`;
  },

  _setRecordButtonAppearance(state) {
    const btn = document.getElementById('btn-record');
    if (!btn) return;

    if (state === 'recording') {
      btn.textContent = '⏸️';
      btn.title = 'Ruta en gravacio';
    } else if (state === 'paused') {
      btn.textContent = '▶️';
      btn.title = 'Ruta en pausa';
    } else {
      btn.textContent = '⏺️';
      btn.title = 'Gravar ruta';
    }
  },

  hideStatsBar() {
    document.getElementById('stats-bar').classList.add('hidden');
  },

  setButtonState(buttonId, state) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    if (state === 'active') {
      btn.classList.add('active');
    } else if (state === 'default') {
      btn.classList.remove('active');
    } else if (state === 'disabled') {
      btn.setAttribute('disabled', 'true');
      btn.classList.add('disabled');
    }
  },

  showImportDialog() {
    this.showModal({
      title: 'Importar Mapa',
      content: 'La via recomanada es obrir la camera guia amb OSM transparent al damunt i capturar quan coincideixi amb el mapa fisic.',
      buttons: [
        {
          text: 'Camera Guia OSM',
          class: 'primary',
          onClick: () => {
            this.closeModal();
            window.CameraGuideModule.start();
          }
        },
        {
          text: 'Fer Foto Directa',
          class: 'secondary',
          onClick: () => {
            this.closeModal();
            window.ImporterModule.openCamera();
          }
        },
        {
          text: 'Triar Imatge o Fitxer',
          class: 'secondary',
          onClick: () => {
            this.closeModal();
            window.ImporterModule.openGallery();
          }
        },
        {
          text: 'Cancelar',
          class: 'secondary',
          onClick: () => this.closeModal()
        }
      ]
    });
  },

  showSaveMapDialog() {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '10px';

    const label = document.createElement('label');
    label.textContent = 'Introdueix un nom per al mapa:';
    content.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.value = `Mapa ${new Date().toLocaleDateString('ca-ES')}`;
    content.appendChild(input);

    this.showModal({
      title: 'Desar Mapa Calibrat',
      content: content,
      buttons: [
        {
          text: 'Desar al Dispositiu',
          class: 'primary',
          onClick: () => {
            const name = input.value.trim();
            this.closeModal();
            window.EventBus.emit('ui:save-map-requested', { name });
          }
        },
        {
          text: 'Descartar',
          class: 'secondary',
          onClick: () => {
            this.closeModal();
            window.ImporterModule.clear();
          }
        }
      ]
    });
  },

  showSaveRouteDialog(routeData) {
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '10px';

    const summary = document.createElement('div');
    summary.style.fontSize = '13px';
    summary.style.lineHeight = '1.4';
    summary.innerHTML = `
      <strong>Resum de la Ruta:</strong><br>
      Distancia: ${this.formatDistance(routeData.stats.distance)}<br>
      Durada: ${this.formatDuration(routeData.stats.duration)}<br>
      Velocitat Mitjana: ${routeData.stats.avgSpeed} km/h
    `;
    content.appendChild(summary);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.value = routeData.name;
    content.appendChild(input);

    this.showModal({
      title: 'Desar Ruta Enregistrada',
      content: content,
      buttons: [
        {
          text: 'Desar Ruta',
          class: 'primary',
          onClick: () => {
            routeData.name = input.value.trim() || routeData.name;
            this.closeModal();
            window.StorageModule.saveRoute(routeData);
          }
        },
        {
          text: 'Descartar',
          class: 'secondary',
          onClick: () => {
            this.closeModal();
            window.MapModule.clearRoute();
            this.showToast('Ruta descartada.', 'info');
          }
        }
      ]
    });
  },

  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
  },

  formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
      return `${h}h ${m}m`;
    }
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(m)}:${pad(s)}`;
  },

  formatDate(isoString) {
    const d = new Date(isoString);
    return `${d.toLocaleDateString('ca-ES')} ${d.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })}`;
  },

  downloadFile(content, fileName, contentType) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }
};
