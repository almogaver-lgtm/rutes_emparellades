'use strict';

window.CameraGuideModule = {
  _active: false,
  _stream: null,
  _videoEl: null,
  _mapContainerEl: null,
  _map: null,
  _mapOpacity: 0.58,
  _savedOverlayOpacity: null,
  _lastGpsFix: null,
  _pendingGpsCenter: false,

  init() {
    this._videoEl = document.getElementById('camera-preview');
    this._mapContainerEl = document.getElementById('map-container');

    window.EventBus.on('map:ready', (data) => {
      this._map = data.leafletMap;
    });

    window.EventBus.on('gps:position', (position) => {
      this._lastGpsFix = position;
      if (this._active && this._pendingGpsCenter) {
        this._centerMapOnGps(position);
        this._pendingGpsCenter = false;
      }
    });

    this._setupListeners();
    return this;
  },

  _setupListeners() {
    const opacitySlider = document.getElementById('camera-opacity-slider');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        this._mapOpacity = parseFloat(e.target.value) / 100;
        this._updateMapOpacity();
      });
    }

    const btnCapture = document.getElementById('btn-camera-capture');
    if (btnCapture) {
      btnCapture.addEventListener('click', () => this.capture());
    }

    const btnCancel = document.getElementById('btn-camera-cancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => this.stop());
    }
  },

  async start() {
    if (this._active) return;
    if (!this._map) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.UIModule.showToast('La teva plataforma o connexio no permet l\'us de la camera en viu.', 'error', 4000);
      return;
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      this._active = true;
      this._videoEl.srcObject = this._stream;
      this._videoEl.classList.remove('hidden');

      this._savedOverlayOpacity = window.MapModule.getOverlayOpacity();
      if (this._savedOverlayOpacity !== null) {
        window.MapModule.updateOverlayOpacity(0);
      }

      if (window.AppState && window.AppState.compassActive && window.CompassModule && typeof window.CompassModule.deactivate === 'function') {
        window.CompassModule.deactivate();
      }

      window.GPSTracker.startTracking();
      this._prepareGpsCenteredView();

      this._mapContainerEl.classList.add('camera-mode-active');
      this._updateMapOpacity();
      this._map.invalidateSize();

      document.getElementById('camera-guide-controls').classList.remove('hidden');
      document.getElementById('toolbar').classList.add('hidden');

      window.EventBus.emit('app:mode-changed', { mode: 'camera-guide' });
      window.UIModule.showToast('Camera guia activa. Mou i fes zoom fins que OSM coincideixi amb el mapa fisic.', 'info', 5000);
    } catch (err) {
      console.error('Error accessing camera:', err);
      window.UIModule.showToast('No s\'ha pogut accedir a la camera. Comprova els permisos.', 'error', 4000);
      this.stop();
    }
  },

  stop() {
    if (!this._active) return;

    if (this._stream) {
      this._stream.getTracks().forEach(track => track.stop());
      this._stream = null;
    }

    this._active = false;
    this._pendingGpsCenter = false;
    this._videoEl.srcObject = null;
    this._videoEl.classList.add('hidden');

    this._mapContainerEl.classList.remove('camera-mode-active');
    this._mapContainerEl.style.opacity = '1';
    if (this._savedOverlayOpacity !== null) {
      window.MapModule.updateOverlayOpacity(this._savedOverlayOpacity);
      this._savedOverlayOpacity = null;
    }

    document.getElementById('camera-guide-controls').classList.add('hidden');
    document.getElementById('toolbar').classList.remove('hidden');

    window.EventBus.emit('app:mode-changed', { mode: 'navigate' });
  },

  _updateMapOpacity() {
    if (!this._active) return;
    this._mapContainerEl.style.opacity = this._mapOpacity.toString();
  },

  capture() {
    if (!this._active || !this._map) return;

    try {
      const video = this._videoEl;
      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;

      if (!vWidth || !vHeight) {
        window.UIModule.showToast('La camera encara no esta a punt.', 'error');
        return;
      }

      const sWidth = window.innerWidth;
      const sHeight = window.innerHeight;

      const vRatio = vWidth / vHeight;
      const sRatio = sWidth / sHeight;

      let sx;
      let sy;
      let sWidthCrop;
      let sHeightCrop;

      if (vRatio > sRatio) {
        sHeightCrop = vHeight;
        sWidthCrop = vHeight * sRatio;
        sx = (vWidth - sWidthCrop) / 2;
        sy = 0;
      } else {
        sWidthCrop = vWidth;
        sHeightCrop = vWidth / sRatio;
        sx = 0;
        sy = (vHeight - sHeightCrop) / 2;
      }

      const canvas = document.createElement('canvas');
      canvas.width = sWidth;
      canvas.height = sHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, sx, sy, sWidthCrop, sHeightCrop, 0, 0, sWidth, sHeight);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const bounds = this._map.getBounds();
      const topLeft = L.latLng(bounds.getNorth(), bounds.getWest());
      const topRight = L.latLng(bounds.getNorth(), bounds.getEast());
      const bottomLeft = L.latLng(bounds.getSouth(), bounds.getWest());

      this.stop();

      window.EventBus.emit('image:imported', {
        imageDataUrl: dataUrl,
        fileName: `Captura Camera Guia ${new Date().toLocaleDateString('ca-ES')}`,
        width: sWidth,
        height: sHeight
      });

      setTimeout(() => {
        window.EventBus.emit('controlpoints:result', {
          topLeft,
          topRight,
          bottomLeft
        });

        const opacitySlider = document.getElementById('opacity-slider');
        if (opacitySlider) {
          opacitySlider.value = '72';
        }
        window.AlignerModule._opacity = 0.72;
        window.MapModule.updateOverlayOpacity(0.72);
        window.UIModule.showToast('Captura feta. Ara pots retocar inclinacio, deformacio o punts de control.', 'success', 4500);
      }, 250);
    } catch (err) {
      console.error('Error capturing image:', err);
      window.UIModule.showToast('Error en realitzar la captura.', 'error');
    }
  },

  _prepareGpsCenteredView() {
    const knownPosition = this._lastGpsFix || window.GPSTracker.getLastKnownPosition();
    if (knownPosition) {
      this._centerMapOnGps(knownPosition);
      this._pendingGpsCenter = false;
      return;
    }

    this._pendingGpsCenter = true;
    window.UIModule.showToast('Buscant una fixacio GPS precisa per centrar el mapa base...', 'info', 3500);
  },

  _centerMapOnGps(position) {
    if (!position || !this._map) return;
    const targetZoom = Math.max(this._map.getZoom(), 17);
    window.MapModule.centerOnPosition(position.lat, position.lng, targetZoom);
  }
};
