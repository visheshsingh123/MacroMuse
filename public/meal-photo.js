// Accept camera originals up to 10 MB while keeping inline AI requests small.
(() => {
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_UPLOAD_BYTES = 1800000;
  const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

  function validate(file) {
    if (!file || !TYPES.has(file.type)) throw new Error('Please use a JPG, PNG or WebP photo.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Please use a photo of 10 MB or smaller.');
    if (!file.size) throw new Error('This photo is empty. Please choose another image.');
  }

  function readDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reader.onabort = () => reject(new Error('Couldn’t read this photo. Please try again.'));
      reader.readAsDataURL(blob);
    });
  }

  async function decode(file) {
    if (typeof window.createImageBitmap === 'function') {
      try { return await window.createImageBitmap(file); } catch { /* Try the image-element decoder. */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Couldn’t open this photo. Please choose another JPG, PNG or WebP image.'));
      };
      image.src = url;
    });
  }

  async function optimize(file) {
    const image = await decode(file);
    let canvas;
    try {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!(width > 0 && height > 0)) throw new Error('Couldn’t open this photo. Please choose another image.');
      let scale = Math.min(1, 2048 / Math.max(width, height));
      canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Couldn’t prepare this photo. Please try another image.');
      for (let attempt = 0; attempt < 4; attempt++) {
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        // A white background keeps transparent PNG/WebP photos readable as JPEG.
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const encoded = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
        if (!encoded?.size) throw new Error('Couldn’t prepare this photo. Please try another image.');
        if (encoded.size <= MAX_UPLOAD_BYTES) return encoded;
        scale *= Math.min(.8, Math.sqrt(MAX_UPLOAD_BYTES / encoded.size) * .9);
      }
      throw new Error('Couldn’t prepare this photo. Please try another image.');
    } finally {
      image.close?.();
      if (canvas) canvas.width = canvas.height = 0;
    }
  }

  async function prepare(file) {
    validate(file);
    const photo = file.size <= MAX_UPLOAD_BYTES ? file : await optimize(file);
    const dataUrl = await readDataUrl(photo);
    return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: photo.type };
  }

  window.NutriPhoto = Object.freeze({ MAX_FILE_BYTES, validate, prepare });
})();
