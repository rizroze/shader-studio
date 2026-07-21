// Manages the input media (image or video) and keeps a GL texture in sync with it.

export class MediaSource {
  constructor(gl) {
    this.gl = gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // Mipmaps let effects sample the AVERAGE tone over a cell (via textureLod),
    // so big halftone/ascii cells stay smooth instead of sampling one stray pixel.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.el = null;         // <img> or <video>
    this.kind = null;       // 'image' | 'video'
    this.width = 1;
    this.height = 1;
    this.ready = false;
  }

  async loadImage(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    this.el = img;
    this.kind = 'image';
    this.width = img.naturalWidth;
    this.height = img.naturalHeight;
    this.ready = true;
    this._uploadFull();
  }

  async loadVideo(url) {
    const vid = document.createElement('video');
    vid.crossOrigin = 'anonymous';
    vid.muted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.src = url;
    await new Promise((res, rej) => {
      vid.onloadeddata = res;
      vid.onerror = rej;
    });
    this.el = vid;
    this.kind = 'video';
    this.width = vid.videoWidth;
    this.height = vid.videoHeight;
    this.ready = true;
    vid.play().catch(() => {});
    this._uploadFull();
  }

  async loadFile(file) {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video')) await this.loadVideo(url);
    else await this.loadImage(url);
  }

  _uploadFull() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.el);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  // Call each frame; only re-uploads for playing video.
  update() {
    if (!this.ready) return;
    if (this.kind === 'video' && !this.el.paused && !this.el.ended) {
      this._uploadFull();
    }
  }

  get isAnimated() {
    return this.kind === 'video';
  }
}
