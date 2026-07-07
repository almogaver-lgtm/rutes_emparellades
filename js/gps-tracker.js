'use strict';

window.GPSTracker = {
  _watchId: null,
  _isTracking: false,
  _isRecording: false,
  
  _routePoints: [],
  _routeStartTime: null,
  _pausedDuration: 0,
  _pauseStartTime: null,

  _lastPosition: null,

  init() {
    this._setupListeners();
    return this;
  },

  _setupListeners() {
    window.EventBus.on('ui:toggle-route', (data) => {
      const action = data.action;
      if (action === 'start') {
        if (!this._isRecording) {
          this.startRecording();
        }
      } else if (action === 'pause') {
        this.pauseRecording();
      } else if (action === 'resume') {
        this.resumeRecording();
      } else if (action === 'stop') {
        this.stopRecording();
      }
    });
  },

  startTracking() {
    if (this._isTracking) return;
    if (!navigator.geolocation) {
      window.EventBus.emit('gps:error', { message: 'La geolocalització no és suportada pel teu navegador.' });
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    this._watchId = navigator.geolocation.watchPosition(
      (pos) => this._onPositionSuccess(pos),
      (err) => this._onPositionError(err),
      options
    );
    this._isTracking = true;
    console.log('GPS tracking started');
  },

  stopTracking() {
    if (!this._isTracking) return;
    navigator.geolocation.clearWatch(this._watchId);
    this._watchId = null;
    this._isTracking = false;
    console.log('GPS tracking stopped');
  },

  startRecording() {
    if (this._isRecording && !this._pauseStartTime) return;

    this.startTracking();
    window.MapModule.clearRoute();
    this._isRecording = true;
    this._routePoints = [];
    this._routeStartTime = Date.now();
    this._pausedDuration = 0;
    this._pauseStartTime = null;
    this._lastPosition = null;

    window.EventBus.emit('route:started', {});
    window.UIModule.showToast('Gravació de ruta iniciada.', 'success');
  },

  pauseRecording() {
    if (!this._isRecording || this._pauseStartTime) return;
    this._pauseStartTime = Date.now();
    window.EventBus.emit('route:paused', {});
    window.UIModule.showToast('Gravació en pausa.', 'warning');
  },

  resumeRecording() {
    if (!this._isRecording || !this._pauseStartTime) return;
    this._pausedDuration += (Date.now() - this._pauseStartTime);
    this._pauseStartTime = null;
    window.EventBus.emit('route:started', {}); // reinicia visualment a UI
    window.UIModule.showToast('Gravació represa.', 'success');
  },

  stopRecording() {
    if (!this._isRecording) return;
    
    // Si estava en pausa, sumar l'últim tram de pausa
    if (this._pauseStartTime) {
      this._pausedDuration += (Date.now() - this._pauseStartTime);
    }

    const durationSeconds = Math.round((Date.now() - this._routeStartTime - this._pausedDuration) / 1000);
    const stats = this._calculateStats(this._routePoints, durationSeconds);

    const routeData = {
      id: window.StorageModule.generateUUID(),
      name: `Ruta ${new Date().toLocaleDateString('ca-ES')}`,
      mapId: window.AppState ? window.AppState.currentMapId : null,
      points: this._routePoints,
      stats: stats,
      startedAt: new Date(this._routeStartTime).toISOString(),
      finishedAt: new Date().toISOString()
    };

    this._isRecording = false;
    this._pauseStartTime = null;
    this._pausedDuration = 0;
    this._routeStartTime = null;
    this._lastPosition = null;
    this._routePoints = [];

    window.EventBus.emit('route:stopped', { routeData });
    return routeData;
  },

  _onPositionSuccess(position) {
    const coords = position.coords;
    const currentPoint = {
      lat: coords.latitude,
      lng: coords.longitude,
      alt: coords.altitude || 0,
      accuracy: coords.accuracy,
      timestamp: position.timestamp
    };

    // Emetre sempre la posició de l'usuari (per pintar el marcador blau)
    window.EventBus.emit('gps:position', currentPoint);

    // Filtrar punts si estem gravant una ruta
    if (this._isRecording && !this._pauseStartTime) {
      if (this._isValidPoint(currentPoint)) {
        this._routePoints.push(currentPoint);
        this._lastPosition = currentPoint;
        
        window.EventBus.emit('route:point', currentPoint);

        const elapsedSeconds = Math.round((Date.now() - this._routeStartTime - this._pausedDuration) / 1000);
        const stats = this._calculateStats(this._routePoints, elapsedSeconds);
        window.EventBus.emit('route:stats', stats);
      }
    }
  },

  _onPositionError(error) {
    let msg = 'Error desconegut del GPS';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        msg = 'Permís de geolocalització denegat.';
        break;
      case error.POSITION_UNAVAILABLE:
        msg = 'Posició GPS no disponible.';
        break;
      case error.TIMEOUT:
        msg = 'Temps d\'espera del GPS esgotat.';
        break;
    }
    window.EventBus.emit('gps:error', { code: error.code, message: msg });
  },

  _isValidPoint(point) {
    // 1. Ignorar punts amb precisió molt dolenta (> 50m)
    if (point.accuracy > 50) return false;

    if (this._lastPosition) {
      const dist = this._getDistance(this._lastPosition, point);
      const timeDiff = (point.timestamp - this._lastPosition.timestamp) / 1000;

      // 2. Ignorar soroll (si no ens hem mogut almenys 3 metres)
      if (dist < 3) return false;

      // 3. Ignorar salts de posició impossibles (velocitat > 120 km/h o 33 m/s caminant)
      if (timeDiff > 0) {
        const speed = dist / timeDiff;
        if (speed > 33) return false;
      }
    }

    return true;
  },

  _getDistance(p1, p2) {
    // Fórmula Haversine
    const R = 6371000; // Radi de la Terra en metres
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLng = (p2.lng - p1.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * 
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  _calculateStats(points, durationSeconds) {
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      totalDistance += this._getDistance(points[i - 1], points[i]);
    }

    const duration = Math.max(durationSeconds, 1);
    const avgSpeed = (totalDistance / 1000) / (duration / 3600); // km/h

    return {
      distance: totalDistance, // en metres
      duration: duration, // en segons
      avgSpeed: parseFloat(avgSpeed.toFixed(1))
    };
  }
};
