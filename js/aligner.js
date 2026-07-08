'use strict';

window.AlignerModule = {
  _active: false,
  _imageDataUrl: null,
  _imageWidth: null,
  _imageHeight: null,
  _topLeft: null,
  _topRight: null,
  _bottomLeft: null,
  _opacity: 0.6,
  
  // Marcadors per arrossegar els cantons
  _markers: [],
  _map: null,

  init() {
    this._setupListeners();
    return this;
  },

  _setupListeners() {
    window.EventBus.on('map:ready', (data) => {
      this._map = data.leafletMap;
    });

    window.EventBus.on('image:imported', (data) => {
      this._imageDataUrl = data.imageDataUrl;
      this._imageWidth = data.width;
      this._imageHeight = data.height;
      this.startAlignment(data.imageDataUrl, data.width, data.height);
    });

    window.EventBus.on('storage:map-loaded', (data) => {
      const mapData = data.mapData;
      this._imageDataUrl = mapData.imageDataUrl;
      this._topLeft = L.latLng(mapData.topLeft);
      this._topRight = L.latLng(mapData.topRight);
      this._bottomLeft = L.latLng(mapData.bottomLeft);
      this._opacity = typeof mapData.opacity === 'number' ? mapData.opacity : 0.6;
      document.getElementById('opacity-slider').value = Math.round(this._opacity * 100);
    });

    window.EventBus.on('controlpoints:result', (data) => {
      this.applyControlPointsResult(data.topLeft, data.topRight, data.bottomLeft);
      window.EventBus.emit('app:mode-changed', { mode: 'align' });
    });

    // Vincular botons d'ajust manual (nudge, scale, rotate, etc.)
    document.getElementById('opacity-slider').addEventListener('input', (e) => {
      this._opacity = parseFloat(e.target.value) / 100;
      window.MapModule.updateOverlayOpacity(this._opacity);
    });

    window.bindPress(document.getElementById('nudge-up'), () => this._nudge(0, 1));
    window.bindPress(document.getElementById('nudge-down'), () => this._nudge(0, -1));
    window.bindPress(document.getElementById('nudge-left'), () => this._nudge(-1, 0));
    window.bindPress(document.getElementById('nudge-right'), () => this._nudge(1, 0));

    window.bindPress(document.getElementById('btn-scale-up'), () => this._scale(1.02));
    window.bindPress(document.getElementById('btn-scale-down'), () => this._scale(0.98));

    window.bindPress(document.getElementById('btn-rotate-cw'), () => this._rotate(1));
    window.bindPress(document.getElementById('btn-rotate-ccw'), () => this._rotate(-1));

    window.bindPress(document.getElementById('btn-align-confirm'), () => this.confirmAlignment());
    window.bindPress(document.getElementById('btn-align-cancel'), () => this.cancelAlignment());

    window.bindPress(document.getElementById('btn-perspective'), () => this._togglePerspectiveMode());
    window.bindPress(document.getElementById('btn-controlpoints'), () => {
      window.EventBus.emit('app:mode-changed', { mode: 'control-points' });
    });
  },

  startAlignment(imageDataUrl, width, height) {
    if (!this._map) return;
    this._active = true;
    this._imageDataUrl = imageDataUrl;
    this._imageWidth = width;
    this._imageHeight = height;

    // Calcular posició inicial de la imatge centrada al mapa
    const center = this._map.getCenter();
    const zoom = this._map.getZoom();
    
    // Distància angular aproximada basada en el zoom actual
    const spanLat = 1.5 / Math.pow(2, zoom - 8);
    const aspectRatio = width / height;
    const spanLng = spanLat * aspectRatio;

    // Definir els 3 corners inicials de l'overlay
    this._topLeft = L.latLng(center.lat + spanLat / 2, center.lng - spanLng / 2);
    this._topRight = L.latLng(center.lat + spanLat / 2, center.lng + spanLng / 2);
    this._bottomLeft = L.latLng(center.lat - spanLat / 2, center.lng - spanLng / 2);

    // Dibuixar la imatge al mapa
    window.MapModule.setImageOverlay(
      this._imageDataUrl,
      this._topLeft,
      this._topRight,
      this._bottomLeft,
      this._opacity
    );

    // Crear els marcadors de manipulació
    this._createMarkers();

    // Activar toolbar d'alineació a la UI
    document.getElementById('align-toolbar').classList.remove('hidden');
    
    window.EventBus.emit('align:started', {});
    window.EventBus.emit('app:mode-changed', { mode: 'align' });
  },

  resumeAlignment() {
    if (!this._map || !this._imageDataUrl || !this._topLeft || !this._topRight || !this._bottomLeft) {
      return;
    }

    this._active = true;
    document.getElementById('opacity-slider').value = Math.round(this._opacity * 100);
    window.MapModule.setImageOverlay(
      this._imageDataUrl,
      this._topLeft,
      this._topRight,
      this._bottomLeft,
      this._opacity
    );
    this._createMarkers();
    document.getElementById('align-toolbar').classList.remove('hidden');

    window.EventBus.emit('align:started', {});
    window.EventBus.emit('app:mode-changed', { mode: 'align' });
  },

  _createMarkers() {
    this._clearMarkers();

    const markerOptions = {
      draggable: true,
      icon: L.divIcon({
        className: 'perspective-handle',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      }),
      zIndexOffset: 2000
    };

    // Crear 3 marcadors pels 3 corners controlables
    const mTL = L.marker(this._topLeft, markerOptions).addTo(this._map);
    const mTR = L.marker(this._topRight, markerOptions).addTo(this._map);
    const mBL = L.marker(this._bottomLeft, markerOptions).addTo(this._map);

    this._markers = [mTL, mTR, mBL];

    // Listeners d'arrossegament pels marcadors
    mTL.on('drag', () => {
      this._topLeft = mTL.getLatLng();
      this._updateOverlay();
    });

    mTR.on('drag', () => {
      this._topRight = mTR.getLatLng();
      this._updateOverlay();
    });

    mBL.on('drag', () => {
      this._bottomLeft = mBL.getLatLng();
      this._updateOverlay();
    });
  },

  _clearMarkers() {
    this._markers.forEach(m => this._map.removeLayer(m));
    this._markers = [];
  },

  _updateOverlay() {
    window.MapModule.updateOverlayPosition(this._topLeft, this._topRight, this._bottomLeft);
    window.EventBus.emit('align:updated', {
      topLeft: this._topLeft,
      topRight: this._topRight,
      bottomLeft: this._bottomLeft,
      opacity: this._opacity
    });
  },

  confirmAlignment() {
    if (!this._active) return;
    this._active = false;
    this._clearMarkers();
    document.getElementById('align-toolbar').classList.add('hidden');

    window.EventBus.emit('align:confirmed', {
      topLeft: this._topLeft,
      topRight: this._topRight,
      bottomLeft: this._bottomLeft,
      opacity: this._opacity,
      imageDataUrl: this._imageDataUrl
    });
    window.EventBus.emit('app:mode-changed', { mode: 'navigate' });
  },

  cancelAlignment() {
    if (!this._active) return;
    this._active = false;
    this._clearMarkers();
    document.getElementById('align-toolbar').classList.add('hidden');
    window.MapModule.removeImageOverlay();

    window.EventBus.emit('align:cancelled', {});
    window.EventBus.emit('app:mode-changed', { mode: 'navigate' });
  },

  _nudge(dx, dy) {
    // Desplaçar la imatge proporcionalment al nivell de zoom del mapa
    const zoom = this._map.getZoom();
    const factor = 0.00002 * Math.pow(2, 18 - zoom);
    
    const dLat = dy * factor;
    const dLng = dx * factor;

    this._topLeft = L.latLng(this._topLeft.lat + dLat, this._topLeft.lng + dLng);
    this._topRight = L.latLng(this._topRight.lat + dLat, this._topRight.lng + dLng);
    this._bottomLeft = L.latLng(this._bottomLeft.lat + dLat, this._bottomLeft.lng + dLng);

    this._syncMarkers();
    this._updateOverlay();
  },

  _scale(factor) {
    // Escalar els 3 corners respecte al centre de l'overlay
    const center = this._getCenter();

    this._topLeft = this._scalePoint(this._topLeft, center, factor);
    this._topRight = this._scalePoint(this._topRight, center, factor);
    this._bottomLeft = this._scalePoint(this._bottomLeft, center, factor);

    this._syncMarkers();
    this._updateOverlay();
  },

  _rotate(angleDegrees) {
    // Rotar els 3 corners respecte al centre de l'overlay
    const center = this._getCenter();
    const angleRad = (angleDegrees * Math.PI) / 180;

    this._topLeft = this._rotatePoint(this._topLeft, center, angleRad);
    this._topRight = this._rotatePoint(this._topRight, center, angleRad);
    this._bottomLeft = this._rotatePoint(this._bottomLeft, center, angleRad);

    this._syncMarkers();
    this._updateOverlay();
  },

  _getCenter() {
    // Calcular el punt mitjà de la diagonal
    // Com que L.imageOverlay.rotated es recolza en un paral·lelogram format pels 3 punts:
    // El quart cantó seria: bottomRight = bottomLeft + (topRight - topLeft)
    const lat = (this._topLeft.lat + (this._bottomLeft.lat + (this._topRight.lat - this._topLeft.lat))) / 2;
    const lng = (this._topLeft.lng + (this._bottomLeft.lng + (this._topRight.lng - this._topLeft.lng))) / 2;
    return L.latLng(lat, lng);
  },

  _scalePoint(point, center, factor) {
    const lat = center.lat + (point.lat - center.lat) * factor;
    const lng = center.lng + (point.lng - center.lng) * factor;
    return L.latLng(lat, lng);
  },

  _rotatePoint(point, center, angleRad) {
    const cosVal = Math.cos(angleRad);
    const sinVal = Math.sin(angleRad);
    const dLat = point.lat - center.lat;
    const dLng = point.lng - center.lng;

    const lat = center.lat + dLat * cosVal - dLng * sinVal;
    const lng = center.lng + dLat * sinVal + dLng * cosVal;
    return L.latLng(lat, lng);
  },

  _syncMarkers() {
    if (this._markers.length === 3) {
      this._markers[0].setLatLng(this._topLeft);
      this._markers[1].setLatLng(this._topRight);
      this._markers[2].setLatLng(this._bottomLeft);
    }
  },

  _togglePerspectiveMode() {
    // Mode perspectiva / deformació simple
    // Per a l'MVP, fem servir els 3 marcadors del Leaflet.ImageOverlay.Rotated,
    // que ja permeten escalat, rotació i inclinació (skew) arrossegant lliurement.
    // Mostrem una notificació informativa de com deformar el mapa arrossegant-ne els cantons.
    window.EventBus.emit('gps:error', {
      message: 'Per inclinar o deformar el mapa, arrossega lliurement els 3 punts dels cantons.'
    });
  },

  applyControlPointsResult(topLeft, topRight, bottomLeft) {
    this._topLeft = topLeft;
    this._topRight = topRight;
    this._bottomLeft = bottomLeft;
    this._syncMarkers();
    this._updateOverlay();
  }
};
