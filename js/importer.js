'use strict';

window.ImporterModule = {
  _inputCamera: null,
  _inputGallery: null,

  init() {
    // Input per a la càmera de fotos directe
    this._inputCamera = document.createElement('input');
    this._inputCamera.type = 'file';
    this._inputCamera.accept = 'image/*';
    this._inputCamera.capture = 'environment';
    this._inputCamera.style.display = 'none';
    document.body.appendChild(this._inputCamera);

    // Input per a seleccionar imatge de la galeria o PDF
    this._inputGallery = document.createElement('input');
    this._inputGallery.type = 'file';
    this._inputGallery.accept = 'image/*,application/pdf';
    this._inputGallery.style.display = 'none';
    document.body.appendChild(this._inputGallery);

    this._setupListeners();
    return this;
  },

  _setupListeners() {
    this._inputCamera.addEventListener('change', (e) => this._handleFileSelection(e));
    this._inputGallery.addEventListener('change', (e) => this._handleFileSelection(e));

    // Escolta comandes d'importació des de la UI
    window.EventBus.on('ui:import-requested', (data) => {
      // Es gestiona des del UI directament cridant openCamera() o openGallery()
    });
  },

  openCamera() {
    this._inputCamera.value = '';
    this._inputCamera.click();
  },

  openGallery() {
    this._inputGallery.value = '';
    this._inputGallery.click();
  },

  _handleFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      // Si és un PDF, avisem l'usuari de la limitació temporal
      // i li suggerim que en faci una captura de pantalla.
      window.EventBus.emit('gps:error', {
        message: 'Els fitxers PDF no es poden importar directament. Si us plau, fes-ne una captura de pantalla i puja la imatge.'
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      window.EventBus.emit('gps:error', { message: 'El fitxer seleccionat no és una imatge vàlida.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this._processImage(e.target.result, file.name);
    };
    reader.onerror = () => {
      window.EventBus.emit('gps:error', { message: 'Error en llegir el fitxer d\'imatge.' });
    };
    reader.readAsDataURL(file);
  },

  _processImage(dataUrl, fileName) {
    const img = new Image();
    img.onload = () => {
      const maxDimension = 4096;
      let width = img.width;
      let height = img.height;

      // Comprovar si superem els límits de dimensions per optimitzar el rendiment
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Exportar imatge redimensionada amb format original o fallback jpeg
        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        window.EventBus.emit('image:imported', {
          imageDataUrl: resizedDataUrl,
          fileName: fileName,
          width: width,
          height: height
        });
      } else {
        window.EventBus.emit('image:imported', {
          imageDataUrl: dataUrl,
          fileName: fileName,
          width: width,
          height: height
        });
      }
    };
    img.onerror = () => {
      window.EventBus.emit('gps:error', { message: 'La imatge està corrupta o no es pot renderitzar.' });
    };
    img.src = dataUrl;
  },

  clear() {
    this._inputCamera.value = '';
    this._inputGallery.value = '';
    window.EventBus.emit('image:cleared', {});
  }
};
