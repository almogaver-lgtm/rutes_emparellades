'use strict';

window.MapModule = {
  _map: null,
  _overlay: null,
  _userMarker: null,
  _userAccuracyCircle: null,
  _routePolyline: null,
  _rotateActive: false,

  init() {
    this._map = L.map('map-container', {
      center: [41.5, 1.8],
      zoom: 9,
      zoomControl: false,
      minZoom: 3,
      maxZoom: 19
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(this._map);

    L.control.zoom({ position: 'topright' }).addTo(this._map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(this._map);

    this._setupListeners();

    setTimeout(() => {
      window.EventBus.emit('map:ready', { leafletMap: this._map });
    }, 100);

    return this;
  },

  getMap() {
    return this._map;
  },

  _setupListeners() {
    window.EventBus.on('gps:position', (pos) => {
      this.setUserPosition(pos.lat, pos.lng, pos.accuracy);
    });

    window.EventBus.on('route:point', (pt) => {
      this.addRoutePoint(pt.lat, pt.lng);
    });

    window.EventBus.on('compass:heading', (data) => {
      if (this._rotateActive && data.heading !== undefined) {
        this.setBearing(data.heading);
      }
    });

    window.EventBus.on('compass:toggled', (data) => {
      this._rotateActive = data.active;
      if (!this._rotateActive) {
        this.setBearing(0);
      }
    });

    window.EventBus.on('storage:map-loaded', (data) => {
      const mapData = data.mapData;
      this.setImageOverlay(
        mapData.imageDataUrl,
        L.latLng(mapData.topLeft),
        L.latLng(mapData.topRight),
        L.latLng(mapData.bottomLeft),
        mapData.opacity
      );

      const bounds = L.latLngBounds([
        L.latLng(mapData.topLeft),
        L.latLng(mapData.topRight),
        L.latLng(mapData.bottomLeft),
        L.latLng(
          mapData.bottomLeft.lat + (mapData.topRight.lat - mapData.topLeft.lat),
          mapData.bottomLeft.lng + (mapData.topRight.lng - mapData.topLeft.lng)
        )
      ]);
      this._map.fitBounds(bounds);
    });

    window.EventBus.on('image:cleared', () => {
      this.removeImageOverlay();
    });
  },

  setImageOverlay(imageUrl, topLeft, topRight, bottomLeft, opacity) {
    this.removeImageOverlay();

    this._overlay = L.imageOverlay.rotated(imageUrl, topLeft, topRight, bottomLeft, {
      opacity: opacity !== undefined ? opacity : 0.6,
      interactive: false,
      attribution: 'Ruta importada'
    }).addTo(this._map);
  },

  removeImageOverlay() {
    if (this._overlay) {
      this._map.removeLayer(this._overlay);
      this._overlay = null;
    }
  },

  updateOverlayOpacity(opacity) {
    if (this._overlay) {
      this._overlay.setOpacity(opacity);
    }
  },

  getOverlayOpacity() {
    if (!this._overlay) return null;
    return typeof this._overlay.options.opacity === 'number' ? this._overlay.options.opacity : null;
  },

  updateOverlayPosition(topLeft, topRight, bottomLeft) {
    if (this._overlay) {
      this._overlay.reposition(topLeft, topRight, bottomLeft);
    }
  },

  setUserPosition(lat, lng, accuracy) {
    const latlng = L.latLng(lat, lng);

    if (!this._userMarker) {
      this._userMarker = L.circleMarker(latlng, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#3897f0',
        fillOpacity: 1,
        zIndexOffset: 1000
      }).addTo(this._map);

      this._userAccuracyCircle = L.circle(latlng, {
        radius: accuracy || 0,
        color: '#3897f0',
        weight: 1,
        fillColor: '#3897f0',
        fillOpacity: 0.15
      }).addTo(this._map);
    } else {
      this._userMarker.setLatLng(latlng);
      this._userAccuracyCircle.setLatLng(latlng);
      this._userAccuracyCircle.setRadius(accuracy || 0);
    }
  },

  centerOnPosition(lat, lng, zoom) {
    if (lat !== undefined && lng !== undefined) {
      this._map.setView([lat, lng], zoom || this._map.getZoom());
    } else if (this._userMarker) {
      this._map.setView(this._userMarker.getLatLng(), zoom || 17);
    }
  },

  addRoutePoint(lat, lng) {
    const latlng = L.latLng(lat, lng);
    if (!this._routePolyline) {
      this._routePolyline = L.polyline([latlng], {
        color: '#e94560',
        weight: 4,
        opacity: 0.8,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this._map);
    } else {
      this._routePolyline.addLatLng(latlng);
    }
  },

  clearRoute() {
    if (this._routePolyline) {
      this._map.removeLayer(this._routePolyline);
      this._routePolyline = null;
    }
  },

  setBearing(degrees) {
    const mapDiv = document.getElementById('map-container');
    if (mapDiv) {
      const bearing = -degrees;
      mapDiv.style.transform = `rotate(${bearing}deg)`;
      mapDiv.style.width = bearing !== 0 ? '140%' : '100%';
      mapDiv.style.height = bearing !== 0 ? '140%' : '100%';
      mapDiv.style.left = bearing !== 0 ? '-20%' : '0';
      mapDiv.style.top = bearing !== 0 ? '-20%' : '0';
      this._map.invalidateSize();
    }
  }
};
