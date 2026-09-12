/*!
 * Canvas UI — Particle Reveal (vanilla WebGL build)
 * Source: https://github.com/DavidHDev/canvas-ui (canvasui.dev) — src/lib/rect-cache.ts
 *         and the ParticleReveal WebGL vanilla component source.
 * License: MIT + Commons Clause v1.0 — Copyright (c) 2026 David Haz.
 *          Included in this site as part of an application, per the license.
 * Ported to plain JavaScript for a no-build static site; logic and GLSL are unchanged.
 */
(function () {
  "use strict";

  /* ---- vendored: src/lib/rect-cache.ts ---- */
  function createRectCache(element) {
    var current = element.getBoundingClientRect();
    var refresh = function () { current = element.getBoundingClientRect(); };
    var observer = new ResizeObserver(refresh);
    observer.observe(element);
    window.addEventListener("resize", refresh, { passive: true });
    window.addEventListener("scroll", refresh, { capture: true, passive: true });
    return {
      get current() { return current; },
      destroy: function () {
        observer.disconnect();
        window.removeEventListener("resize", refresh);
        window.removeEventListener("scroll", refresh, true);
      },
    };
  }

  var VERT = "#version 300 es\nprecision highp float;\nlayout(location = 0) in vec2 aPos;\nout vec2 vUv;\nvoid main () {\n  vUv = aPos * 0.5 + 0.5;\n  gl_Position = vec4(aPos, 0.0, 1.0);\n}";

  var FRAG = "#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 outColor;\nuniform sampler2D uContent;\nuniform vec2 uRes;\nuniform float uDpr;\nuniform vec2 uPointer;\nuniform float uActive;\nuniform float uRadius;\nuniform float uSoftness;\nuniform float uSize;\nuniform float uScatter;\nuniform float uDrift;\nuniform float uAberration;\nuniform float uBend;\nuniform float uFade;\nuniform float uThreshold;\nuniform vec3 uBg;\nuniform float uTime;\nuniform float uMaxX;\nuniform float uCrisp;\n\nfloat hash (vec2 p) {\n  vec3 p3 = fract(vec3(p.xyx) * 0.1031);\n  p3 += dot(p3, p3.yzx + 33.33);\n  return fract((p3.x + p3.y) * p3.z);\n}\n\nvec4 samp (vec2 p) {\n  vec2 uv = p / uRes;\n  uv = clamp(uv, vec2(0.001), vec2(uMaxX - 0.001, 0.999));\n  return texture(uContent, uv);\n}\n\nvoid main () {\n  vec2 pc = vec2(vUv.x, 1.0 - vUv.y) * uRes;\n  if (pc.x > uMaxX * uRes.x) {\n    outColor = vec4(0.0);\n    return;\n  }\n  if (uCrisp > 0.5) {\n    outColor = samp(pc);\n    return;\n  }\n\n  float dist = length(pc - uPointer);\n  float radius = max(uRadius, 1.0);\n  float inner = radius * (1.0 - clamp(uSoftness, 0.02, 1.0));\n  float e = (1.0 - smoothstep(inner, radius, dist)) * uActive;\n\n  float band = radius * 0.9;\n  float ring = smoothstep(inner, radius, dist)\n    * (1.0 - smoothstep(radius, radius + band, dist))\n    * uActive;\n\n  vec2 dir = (pc - uPointer) / max(dist, 1e-3);\n  vec2 tang = vec2(-dir.y, dir.x);\n  vec2 warp = (dir * -1.0 + tang * 0.6) * uBend * ring;\n  float ca = uAberration * ring;\n\n  float cellPx = max(uSize, 0.5) * uDpr;\n  vec2 cell = floor(gl_FragCoord.xy / cellPx);\n  float n1 = hash(cell);\n  float n2 = hash(cell + vec2(3.1, 7.7));\n  float n3 = hash(cell + vec2(9.3, 1.3));\n  float ft = floor(uTime * (2.0 + uDrift * 6.0));\n  float n4 = hash(cell + vec2(ft * 0.613, ft * 0.831));\n\n  float g0 = uThreshold * 0.6;\n  float g1 = uThreshold * 1.6 + 0.01;\n  vec3 lw = vec3(0.299, 0.587, 0.114);\n\n  vec2 bp = pc + warp;\n  vec4 bR = samp(bp + dir * ca);\n  vec4 bC = samp(bp);\n  vec4 bB = samp(bp - dir * ca);\n  vec3 baseRgb = vec3(bR.r, bC.g, bB.b);\n  float uiHome = smoothstep(g0, g1, dot(abs(baseRgb - uBg), lw));\n\n  float rad = uScatter * pow(n1, 2.5) * (1.0 - e);\n  float ang = n2 * 6.2832 + uTime * uDrift * (0.5 + n3 * 1.5);\n  vec2 dustP = bp + vec2(cos(ang), sin(ang)) * rad;\n\n  vec4 dR = samp(dustP + dir * ca);\n  vec4 dC = samp(dustP);\n  vec4 dB = samp(dustP - dir * ca);\n  vec3 dustRgb = vec3(dR.r, dC.g, dB.b);\n  float lumD = dot(dustRgb, lw);\n  float dDust = dot(abs(dustRgb - uBg), lw);\n\n  float gate = smoothstep(g0, g1, dDust);\n  float falloff = 1.0 - 0.7 * rad / max(uScatter, 1.0);\n  float prob = clamp(gate * (0.15 + 1.2 * sqrt(dDust)) * falloff, 0.0, 1.0) * uiHome;\n  float speck = step(n4 * 0.999, prob);\n\n  float shade = pow(lumD, 0.4) * (0.8 + 0.4 * n3);\n  vec3 dustCol = mix(uBg, vec3(shade), clamp(uFade, 0.0, 1.0));\n\n  vec3 unrevealed = mix(mix(baseRgb, uBg, uiHome), dustCol, speck);\n  vec3 col = mix(unrevealed, baseRgb, e);\n  float alpha = mix(bC.a, dC.a, speck * (1.0 - e));\n  outColor = vec4(col, alpha);\n}";

  var colorProbe = null;
  function parseColor(input) {
    if (typeof document === "undefined") return [0, 0, 0];
    if (!colorProbe) {
      var probe = document.createElement("canvas");
      probe.width = 1; probe.height = 1;
      colorProbe = probe.getContext("2d", { willReadFrequently: true });
    }
    if (!colorProbe) return [0, 0, 0];
    colorProbe.fillStyle = "#000000";
    colorProbe.fillStyle = input;
    colorProbe.clearRect(0, 0, 1, 1);
    colorProbe.fillRect(0, 0, 1, 1);
    var d = colorProbe.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  }

  function supportsHtmlInCanvas() {
    if (typeof document === "undefined") return false;
    var probe = document.createElement("canvas");
    var ctx = probe.getContext("2d");
    return Boolean(ctx && typeof ctx.drawElementImage === "function" && typeof probe.requestPaint === "function");
  }

  var DEFAULTS = {
    radius: 500, softness: 0.75, size: 1, scatter: 25, drift: 1,
    aberration: 40, bend: 50, fade: 0.85, threshold: 0.1,
    background: "#000000", smoothing: 0.25,
  };

  function createParticleReveal(elements, options) {
    var config = Object.assign({}, DEFAULTS, options || {});
    var source = elements.source, content = elements.content, output = elements.output;

    var gl = output.getContext("webgl2", {
      alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: false,
    });
    if (!gl || gl.isContextLost()) return null;

    var sourceCtx = source.getContext("2d");
    var paintable = source;
    var htmlInCanvas = Boolean(sourceCtx && typeof sourceCtx.drawElementImage === "function" && typeof paintable.requestPaint === "function");

    var contentDirty = false;
    var wake = function () {};

    if (htmlInCanvas) {
      paintable.onpaint = function () {
        try {
          sourceCtx.reset();
          sourceCtx.drawElementImage(content, 0, 0);
          contentDirty = true;
          wake();
        } catch (e) {}
      };
    }

    function compile(type, text) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("ParticleReveal shader error:", gl.getShaderInfoLog(shader));
      }
      return shader;
    }

    var vertexShader = compile(gl.VERTEX_SHADER, VERT);
    var fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    var uniforms = {};
    var count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) {
      var info = gl.getActiveUniform(program, i);
      uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    var contentMaxX = 1;

    function syncCanvasSize() {
      var dpr = Math.min(window.devicePixelRatio || 1,  emulation=1);
      var width = Math.max(1, Math.round(output.clientWidth * dpr));
      var height = Math.max(1, Math.round(output.clientHeight * dpr));
      if (output.width !== width || output.height !== height) {
        output.width = width;
        output.height = height;
      }
      contentMaxX = Math.min(1, Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)));
      if (htmlInCanvas) {
        var cssWidth = Math.max(1, Math.round(source.clientWidth));
        var cssHeight = Math.max(1, Math.round(source.clientHeight));
        if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
          source.width = cssWidth * dpr;
          source.height = cssHeight * dpr;
        }
        paintable.requestPaint();
      }
    }

    var pointer = { x: -1e5, y: -1e5, tx: -1e5, ty: -1e5, active: 0, target: 0 };
    var time = 0;
    var bgKey = "";
    var bg = [0, 0, 0];

    var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var reducedMotion = motionQuery.matches;

    syncCanvasSize();

    function uploadContent() {
      if (!htmlInCanvas || !contentDirty) return;
      contentDirty = false;
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }

    function render() {
      uploadContent();
      var w = Math.max(output.clientWidth, 1);
      var h = Math.max(output.clientHeight, 1);
      var dpr = output.width / w;
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, contentTexture);
      gl.uniform1i(uniforms.uContent, 0);
      gl.uniform2f(uniforms.uRes, w, h);
      gl.uniform1f(uniforms.uDpr, dpr);
      gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
      gl.uniform1f(uniforms.uActive, pointer.active);
      gl.uniform1f(uniforms.uRadius, Math.max(config.radius, 1));
      gl.uniform1f(uniforms.uSoftness, config.softness);
      gl.uniform1f(uniforms.uSize, Math.max(config.size, 0.5));
      gl.uniform1f(uniforms.uScatter, Math.max(config.scatter, 0));
      gl.uniform1f(uniforms.uDrift, Math.max(config.drift, 0));
      gl.uniform1f(uniforms.uAberration, Math.max(config.aberration, 0));
      gl.uniform1f(uniforms.uBend, Math.max(config.bend, 0));
      gl.uniform1f(uniforms.uFade, config.fade);
      gl.uniform1f(uniforms.uThreshold, Math.max(config.threshold, 0));
      if (config.background !== bgKey) {
        bgKey = config.background;
        bg = parseColor(config.background);
      }
      gl.uniform3f(uniforms.uBg, bg[0], bg[1], bg[2]);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uMaxX, contentMaxX);
      gl.uniform1f(uniforms.uCrisp, reducedMotion || !htmlInCanvas ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0,0, output.width, output.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    var raf = 0;
    var lastTime = performance.now();
    var destroyed = false;
    var running = false;
    var visible = true;

    function frame(now) {
      if (destroyed) return;
      if (!visible) { running = false; return; }
      var delta = Math.min((now - lastTime) / 1000, 1 / 30);
      lastTime = now;
      time += delta;
      var tau = Math.max(config.smoothing, 1e-4);
      var k = reducedMotion ? 1 : 1 - Math.exp(-delta / tau);
      pointer.x += (pointer.tx - pointer.x) * k;
      pointer.y += (pointer.ty - pointer.y) * k;
      pointer.active += (pointer.target - pointer.active) * k;
      render();
      var settled =
        Math.abs(pointer.tx - pointer.x) < 0.1 &&
        Math.abs(pointer.ty - pointer.y) < 0.1 &&
        Math.abs(pointer.target - pointer.active) < 1e-3;
      if (settled && !contentDirty && (reducedMotion || !htmlInCanvas || config.drift <= 0)) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
        pointer.active = pointer.target;
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (destroyed || running || !visible) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(frame);
    }

    wake = start;
    start();

    function onMotionChange() {
      reducedMotion = motionQuery.matches;
      start();
    }
    motionQuery.addEventListener("change", onMotionChange);

    var observer = new ResizeObserver(function () { syncCanvasSize(); start(); });
    observer.observe(output);
    observer.observe(content);

    var intersection = new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1] ? entries[entries.length - 1].isIntersecting : true;
      if (visible) start();
    });
    intersection.observe(output);

    var listenTarget = output.parentElement || output;
    var rectCache = createRectCache(output);

    function onPointerMove(event) {
      var rect = rectCache.current;
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;
      if (pointer.target === 0 && pointer.active < 1e-3) {
        pointer.x = x;
        pointer.y = y;
      }
      pointer.tx = x;
      pointer.ty = y;
      pointer.target = 1;
      start();
    }

    function onPointerLeave() {
      pointer.target = 0;
      start();
    }

    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return {
      setOptions: function (next) {
        var keys = Object.keys(next || {});
        var changed = keys.some(function (key) { return config[key] !== next[key]; });
        if (!changed) return;
        Object.assign(config, next);
        start();
      },
      resize: function () { syncCanvasSize(); start(); },
      destroy: function () {
        destroyed = true;
        rectCache.destroy();
        cancelAnimationFrame(raf);
        observer.disconnect();
        intersection.disconnect();
        motionQuery.removeEventListener("change", onMotionChange);
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        gl.deleteTexture(contentTexture);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(quad);
        if (htmlInCanvas) paintable.onpaint = null;
      },
    };
  }

  window.CanvasUIParticleReveal = {
    supportsHtmlInCanvas: supportsHtmlInCanvas,
    createParticleReveal: createParticleReveal,
  };
})();
