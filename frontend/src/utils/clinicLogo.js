// Limite generoso para o data URL guardado na linha da clínica (~250 KB).
export const MAX_LOGO_DATA_URL = 250 * 1024;

// Lê o arquivo enviado e devolve um data URL pronto para o papel
// timbrado. Bitmaps são redimensionados (lado maior ≤ maxSize px) e
// recomprimidos em PNG para manter transparência. SVG é mantido como vetor
// só quando keepSvg = true (SuperAdm); no fluxo do admin da clínica ele é
// rasterizado em PNG — o banco (clinic_admin_update_logo) só aceita bitmap.
export function readLogoFile(file, { maxSize = 480, keepSvg = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (!/^image\//.test(file.type)) {
      return reject(new Error('Selecione um arquivo de imagem (PNG, JPG, WEBP ou SVG).'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const isSvg = file.type === 'image/svg+xml';

      if (isSvg && keepSvg) {
        if (dataUrl.length > MAX_LOGO_DATA_URL) {
          return reject(new Error('SVG muito grande. Use um arquivo de até ~250 KB.'));
        }
        return resolve(dataUrl);
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Não foi possível processar a imagem.'));
      img.onload = () => {
        // SVG sem width/height intrínsecos chega com 0 — usa o lado máximo.
        const naturalWidth = img.width || maxSize;
        const naturalHeight = img.height || maxSize;
        const longest = Math.max(naturalWidth, naturalHeight) || 1;
        const scale = isSvg ? maxSize / longest : Math.min(1, maxSize / longest);
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // PNG preserva transparência; cai para JPEG se ficar grande demais.
        let out = canvas.toDataURL('image/png');
        if (out.length > MAX_LOGO_DATA_URL) {
          out = canvas.toDataURL('image/jpeg', 0.85);
        }
        if (out.length > MAX_LOGO_DATA_URL) {
          return reject(new Error('Logo muito pesada após o ajuste. Tente uma imagem menor.'));
        }
        resolve(out);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
