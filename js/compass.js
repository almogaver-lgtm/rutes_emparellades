'use strict';

window.CompassModule = {
  _active: false,
  _rotateMap: false,
  _currentHeading: 0,
  _smoothedHeading: 0,
  
  _listener: null,

  init() {
    this._setupListeners();
    return this;
  },

  _setupListeners() {
    window.EventBus.on('ui:toggle-compass', () => {
      this.toggle();
    });
  },

  async toggle() {
    if (this._active) {
      this.deactivate();
    } else {
      await this.activate();
    }
  },

  async activate() {
    if (this._active) return;

    // Gestió especial per a iOS 13+ (requereix permís de sensor)
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permissionState = await DeviceOrientationEvent.requestPermission();
        if (permissionState === 'granted') {
          this._startSensorListener();
        } else {
          window.UIModule.showToast('Permís de brúixola denegat per l\'usuari.', 'error');
        }
      } catch (err) {
        console.error('Error requesting orientation permission:', err);
        window.UIModule.showToast('No es pot demanar permís de brúixola.', 'error');
      }
    } else {
      // Android o dispositius sense permís requerit
      this._startSensorListener();
    }
  },

  deactivate() {
    if (!this._active) return;

    if (this._listener) {
      window.removeEventListener('deviceorientationabsolute', this._listener);
      window.removeEventListener('deviceorientation', this._listener);
      this._listener = null;
    }

    this._active = false;
    this._rotateMap = false;
    
    // Ocultar indicador brúixola de UI
    document.getElementById('compass-indicator').classList.add('hidden');
    
    // Restablir rotació del mapa
    window.EventBus.emit('compass:toggled', { active: false });
    window.EventBus.emit('compass:heading', { heading: 0 });
    
    console.log('Compass deactivated');
  },

  _startSensorListener() {
    this._listener = (e) => this._onOrientationChange(e);

    // deviceorientationabsolute és millor per a Android per tenir el Nord absolut
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', this._listener, true);
    } else {
      window.addEventListener('deviceorientation', this._listener, true);
    }

    this._active = true;
    
    // Mostrar indicador brúixola a la UI
    document.getElementById('compass-indicator').classList.remove('hidden');

    // Per defecte activem la rotació de mapa si cliquen
    this._rotateMap = true;
    window.EventBus.emit('compass:toggled', { active: true });
    
    window.UIModule.showToast('Brúixola activada (el mapa s\'orientarà automàticament).', 'success');
    console.log('Compass activated');
  },

  _onOrientationChange(event) {
    let heading = 0;

    // Detectar si és iOS (webkitCompassHeading) o Android (alpha)
    if (event.webkitCompassHeading !== undefined) {
      heading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
      // Per a Android, el valor va del revés en alguns navegadors
      heading = 360 - event.alpha;
    } else {
      return; // Sense sensor
    }

    this._currentHeading = heading;

    // Filtre pas-baix per suavitzar la vibració de la brúixola (típic de mòbils)
    let diff = this._currentHeading - this._smoothedHeading;
    // Corregir salts circulars (360 -> 0 graus)
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    this._smoothedHeading = (this._smoothedHeading + 0.15 * diff + 360) % 360;

    // Actualitzar visualment la brúixola a la cantonada superior esquerra
    const compassDiv = document.querySelector('#compass-indicator .compass-rose');
    if (compassDiv) {
      // Rotem la brúixola en direcció contrària a l'orientació del mòbil per marcar el nord
      compassDiv.style.transform = `rotate(${-this._smoothedHeading}deg)`;
    }

    // Emetre event
    window.EventBus.emit('compass:heading', { heading: this._smoothedHeading });
  }
};
