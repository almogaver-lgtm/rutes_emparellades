'use strict';

window.ControlPointsModule = {
  _active: false,
  _map: null,
  _points: [], // Llista de parelles de punts: { imageRel: {u,v}, mapLatLng: {lat,lng} }
  
  // Estat de la selecció actual:
  // 'image' -> L'usuari ha de clicar a la imatge superposada
  // 'map'   -> L'usuari ha de clicar al mapa real
  _currentStep: 'image',
  _pendingImagePoint: null,
  
  // Marcadors visuals del procés
  _markers: [],

  init() {
    this._setupListeners();
    return this;
  },

  _setupListeners() {
    window.EventBus.on('map:ready', (data) => {
      this._map = data.leafletMap;
      
      // Capturar els clics al mapa per registrar els punts
      this._map.on('click', (e) => {
        if (!this._active) return;
        this._handleMapClick(e.latlng);
      });
    });

    window.EventBus.on('app:mode-changed', (data) => {
      if (data.mode === 'control-points') {
        this.activate();
      } else {
        this.deactivate();
      }
    });
  },

  activate() {
    this._active = true;
    this._points = [];
    this._currentStep = 'image';
    this._pendingImagePoint = null;
    this._clearVisuals();

    window.UIModule.showToast('Mode Punts de Control actiu. Clica un punt conegut a la Imatge.', 'info', 5000);
  },

  deactivate() {
    this._active = false;
    this._clearVisuals();
  },

  _clearVisuals() {
    if (!this._map) return;
    this._markers.forEach(m => this._map.removeLayer(m));
    this._markers = [];
  },

  _handleMapClick(latlng) {
    if (this._currentStep === 'image') {
      // 1. L'usuari ha clicat sobre la imatge (que està superposada en la posició actual)
      // Convertim les coordenades geogràfiques del clic a coordenades de la imatge (u, v) de 0 a 1.
      const aligner = window.AlignerModule;
      if (!aligner || !aligner._topLeft) {
        window.UIModule.showToast('No hi ha cap mapa importat per calibrar.', 'error');
        return;
      }

      const TL = aligner._topLeft;
      const TR = aligner._topRight;
      const BL = aligner._bottomLeft;

      // Coeficients de transformació afí actual
      const a = TR.lat - TL.lat;
      const b = BL.lat - TL.lat;
      const d = TR.lng - TL.lng;
      const e = BL.lng - TL.lng;

      const D = a * e - b * d;

      if (Math.abs(D) < 1e-9) {
        window.UIModule.showToast('Error de calibratge: els punts de control actuals estan alineats.', 'error');
        return;
      }

      const dy = latlng.lat - TL.lat;
      const dx = latlng.lng - TL.lng;

      // Resoldre per u i v
      const u = (dy * e - dx * b) / D;
      const v = (a * dx - d * dy) / D;

      this._pendingImagePoint = { u, v, originalLatLng: latlng };
      this._currentStep = 'map';

      // Afegir marcador visual temporal de la imatge (Vermell)
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: 'control-point-marker',
          html: (this._points.length + 1).toString(),
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      }).addTo(this._map);
      this._markers.push(marker);

      // Amagar l'overlay temporalment perquè l'usuari vegi el mapa base
      window.MapModule.updateOverlayOpacity(0.05);

      window.UIModule.showToast('Clica el MATEIX punt exactament al mapa base (descobert).', 'info', 5000);

    } else if (this._currentStep === 'map') {
      // 2. L'usuari ha clicat el punt equivalent al mapa base
      const imgPt = this._pendingImagePoint;
      
      this._points.push({
        imageRel: { u: imgPt.u, v: imgPt.v },
        mapLatLng: { lat: latlng.lat, lng: latlng.lng }
      });

      // Crear marcador verd al mapa real
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          className: 'control-point-marker map-point',
          html: this._points.length.toString(),
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      }).addTo(this._map);
      this._markers.push(marker);

      // Restaurar opacitat original del mapa
      const opacity = window.AlignerModule._opacity;
      window.MapModule.updateOverlayOpacity(opacity);

      window.UIModule.showToast(`Punt ${this._points.length} desat amb èxit.`, 'success', 2000);

      this._currentStep = 'image';
      this._pendingImagePoint = null;

      // Si tenim almenys 3 punts, recalculem la georeferenciació!
      if (this._points.length >= 3) {
        this._calculateGeoreference();
      } else {
        setTimeout(() => {
          window.UIModule.showToast(`Marca el punt ${this._points.length + 1} a la imatge superposada.`, 'info');
        }, 1500);
      }
    }
  },

  _calculateGeoreference() {
    // Calculem la transformació afí a partir de 3 punts de referència
    // Agafem els 3 primers punts per resoldre el sistema
    const p1 = this._points[0];
    const p2 = this._points[1];
    const p3 = this._points[2];

    const u1 = p1.imageRel.u, v1 = p1.imageRel.v;
    const u2 = p2.imageRel.u, v2 = p2.imageRel.v;
    const u3 = p3.imageRel.u, v3 = p3.imageRel.v;

    const lat1 = p1.mapLatLng.lat, lng1 = p1.mapLatLng.lng;
    const lat2 = p2.mapLatLng.lat, lng2 = p2.mapLatLng.lng;
    const lat3 = p3.mapLatLng.lat, lng3 = p3.mapLatLng.lng;

    // Resoldre el sistema lineal de 3 equacions per a lat i lng:
    // lat = a*u + b*v + c
    // lng = d*u + e*v + f
    const du1 = u1 - u3, du2 = u2 - u3;
    const dv1 = v1 - v3, dv2 = v2 - v3;

    const D = du1 * dv2 - du2 * dv1;

    if (Math.abs(D) < 1e-9) {
      window.UIModule.showToast('Els punts de control estan alineats o són massa propers. Tria punts diferents.', 'warning', 4000);
      return;
    }

    const dlat1 = lat1 - lat3, dlat2 = lat2 - lat3;
    const dlng1 = lng1 - lng3, dlng2 = lng2 - lng3;

    // Coeficients per a lat
    const a = (dlat1 * dv2 - dlat2 * dv1) / D;
    const b = (du1 * dlat2 - du2 * dlat1) / D;
    const c = lat3 - a * u3 - b * v3;

    // Coeficients per a lng
    const d = (dlng1 * dv2 - dlng2 * dv1) / D;
    const e = (du1 * dlng2 - du2 * dlng1) / D;
    const f = lng3 - d * u3 - e * v3;

    // Ara apliquem aquests coeficients als corners unitaris de la imatge original:
    // topLeft és (0,0), topRight és (1,0), bottomLeft és (0,1)
    const newTL = L.latLng(c, f);
    const newTR = L.latLng(a + c, d + f);
    const newBL = L.latLng(b + c, e + f);

    // Emetre el resultat cap a l'aligner per actualitzar l'overlay i els seus marcadors
    window.EventBus.emit('controlpoints:result', {
      topLeft: newTL,
      topRight: newTR,
      bottomLeft: newBL
    });

    window.UIModule.showToast('Calibratge completat i aplicat! Pots desar o afegir més punts per refinar.', 'success', 4000);
  }
};
