/* ==========================================================================
   TARa — simulated camera feed
   Draws a mechanical-keyboard bench on canvas so the prototype looks alive
   without a webcam. Also generates evidence frames for the report.
   ========================================================================== */

window.TARa = window.TARa || {};

(function () {
  const M = window.TARa;

  const VW = 1000;
  const VH = 562;

  // All coordinates are in the 1000 × 562 virtual camera space.
  const KEY = {
    size: 36,
    height: 33,
    gapX: 4,
    gapY: 4,
    cols: 14,
    rows: 5,
    startX: 222,
    startY: 196,
  };

  const FOCUS = {
    device: { zoom: 1.05, x: 500, y: 288 },
    wide: { zoom: 1.05, x: 500, y: 288 },
    label: { zoom: 1.9, x: 500, y: 300, ty: 292 },
    key: { zoom: 4.2, x: 360, y: 248, ty: 250 },
    switch: { zoom: 4.6, x: 360, y: 248, ty: 250 },
  };

  const ROWS = [
    ['esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'del'],
    ['tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
    ['caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'enter'],
    ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '', '', ''],
    ['ctrl', 'alt', 'cmd', '', '', '', '', '', '', '', '', 'cmd', 'alt', 'ctrl'],
  ];

  let noisePattern = null;

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function ensureNoise(ctx) {
    if (noisePattern) return;
    const tile = document.createElement('canvas');
    tile.width = 96;
    tile.height = 96;
    const tctx = tile.getContext('2d');
    const image = tctx.createImageData(96, 96);
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
    tctx.putImageData(image, 0, 0);
    noisePattern = ctx.createPattern(tile, 'repeat');
  }

  function drawBench(ctx, t, swayX) {
    const bg = ctx.createLinearGradient(0, 0, VW, VH);
    bg.addColorStop(0, '#252d36');
    bg.addColorStop(0.45, '#161d25');
    bg.addColorStop(1, '#0a0f15');
    ctx.fillStyle = bg;
    ctx.fillRect(-260, -260, VW + 520, VH + 520);

    // warm work lamp, upper left
    const lamp = ctx.createRadialGradient(295, 80, 20, 330, 150, 610);
    lamp.addColorStop(0, 'rgba(255, 216, 168, 0.24)');
    lamp.addColorStop(0.4, 'rgba(255, 196, 141, 0.08)');
    lamp.addColorStop(1, 'rgba(255, 190, 130, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(-260, -260, VW + 520, VH + 520);

    // cool rim from the right
    const cool = ctx.createRadialGradient(880, 450, 10, 820, 420, 500);
    cool.addColorStop(0, 'rgba(120, 170, 255, 0.1)');
    cool.addColorStop(1, 'rgba(120, 170, 255, 0)');
    ctx.fillStyle = cool;
    ctx.fillRect(-260, -260, VW + 520, VH + 520);

    // speckled bench texture
    let seed = 9173;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 180; i++) {
      const x = -80 + rnd() * 1160;
      const y = -40 + rnd() * 640;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.012 + rnd() * 0.03) + ')';
      ctx.fillRect(x + swayX * 0.3, y, 1 + rnd() * 1.6, 1 + rnd() * 1.2);
    }
  }

  function keycap(ctx, x, y, label, opts) {
    const w = KEY.size;
    const h = KEY.height;
    const flagged = opts.highlight;
    const fixed = opts.fixed;

    // side / base
    ctx.fillStyle = flagged ? '#3a2d1c' : '#171b21';
    roundRect(ctx, x, y + 3, w, h, 6);
    ctx.fill();

    // top face
    const face = ctx.createLinearGradient(x, y, x, y + h);
    if (flagged) {
      face.addColorStop(0, fixed ? '#2a3230' : '#4a3821');
      face.addColorStop(1, fixed ? '#1c2322' : '#332615');
    } else {
      face.addColorStop(0, '#343c45');
      face.addColorStop(0.5, '#293039');
      face.addColorStop(1, '#1f252c');
    }
    ctx.fillStyle = face;
    roundRect(ctx, x, y, w, h, 5.5);
    ctx.fill();
    ctx.strokeStyle = flagged && !fixed ? 'rgba(255,192,107,0.75)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = flagged && !fixed ? 1.8 : 1;
    ctx.stroke();

    if (flagged && !fixed) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,192,107,0.75)';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = 'rgba(255,192,107,0.85)';
      ctx.lineWidth = 1.6;
      roundRect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 6.5);
      ctx.stroke();
      ctx.restore();
    }

    if (label) {
      ctx.fillStyle = flagged && !fixed ? '#ffe3b5' : 'rgba(232,240,246,0.82)';
      ctx.font = (label.length > 2 ? '7.2px' : '9.4px') + ' ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
    }
  }

  function drawSwitch(ctx, x, y) {
    // exposed hot-swap socket
    ctx.save();
    ctx.fillStyle = '#0c1116';
    roundRect(ctx, x - 19, y - 19, 38, 38, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#2a3138';
    roundRect(ctx, x - 15, y - 15, 30, 30, 4);
    ctx.fill();

    // socket contacts
    ctx.fillStyle = '#c8b06a';
    ctx.fillRect(x - 8, y + 11, 5, 3);
    ctx.fillRect(x + 4, y + 11, 5, 3);

    // switch housing
    const housing = ctx.createLinearGradient(x, y - 14, x, y + 14);
    housing.addColorStop(0, '#5a6470');
    housing.addColorStop(1, '#2c343d');
    ctx.fillStyle = housing;
    roundRect(ctx, x - 13, y - 14, 26, 27, 3);
    ctx.fill();

    // cross stem
    ctx.fillStyle = '#d8e2ea';
    ctx.fillRect(x - 1.7, y - 11, 3.4, 9);
    ctx.fillRect(x - 5.5, y - 7.6, 11, 3.2);

    // mint rim = hot-swap verified
    ctx.strokeStyle = 'rgba(111,240,193,0.42)';
    ctx.lineWidth = 1.4;
    roundRect(ctx, x - 16, y - 17, 32, 32, 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawKeyboard(ctx, opts) {
    const t = opts.t || 0;

    // cable
    ctx.save();
    ctx.strokeStyle = 'rgba(10,14,18,0.9)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(806, 244);
    ctx.bezierCurveTo(856, 236, 878, 190, 922, 178);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // case shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#0c1116';
    roundRect(ctx, 176, 170, 648, 246, 20);
    ctx.fill();
    ctx.restore();

    // aluminium case
    const casing = ctx.createLinearGradient(176, 170, 824, 416);
    casing.addColorStop(0, '#3b444e');
    casing.addColorStop(0.45, '#222a32');
    casing.addColorStop(1, '#141a20');
    ctx.fillStyle = casing;
    roundRect(ctx, 176, 170, 648, 246, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // inner plate
    ctx.fillStyle = '#0d1217';
    roundRect(ctx, 194, 186, 612, 214, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.stroke();

    // key grid
    for (let r = 0; r < KEY.rows; r++) {
      for (let c = 0; c < KEY.cols; c++) {
        const x = KEY.startX + c * (KEY.size + KEY.gapX);
        const y = KEY.startY + r * (KEY.height + KEY.gapY);
        const isE = r === 1 && c === 3;
        if (isE && opts.focus === 'switch') continue;
        keycap(ctx, x, y, ROWS[r][c], {
          highlight: isE && !opts.fixed,
          fixed: !!opts.fixed,
        });
      }
    }

    // exposed switch in place of the E key
    if (opts.focus === 'switch') {
      drawSwitch(ctx, 360, 248);
      // loose keycap on the bench
      ctx.save();
      ctx.translate(760, 386);
      ctx.rotate(-0.18);
      keycap(ctx, -18, -16, 'e', { highlight: false });
      ctx.restore();
    }

    // subtle RGB underglow
    const rgb = ctx.createLinearGradient(220, 402, 780, 402);
    rgb.addColorStop(0, 'rgba(111,240,193,0.0)');
    rgb.addColorStop(0.5, 'rgba(111,240,193,' + (0.06 + Math.sin(t * 0.8) * 0.012) + ')');
    rgb.addColorStop(1, 'rgba(120,170,255,0.0)');
    ctx.fillStyle = rgb;
    ctx.fillRect(210, 396, 580, 8);

    // case screws + logo
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    [[196, 191], [804, 191], [196, 395], [804, 395]].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = 'rgba(232,240,246,0.28)';
    ctx.font = '7px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('K2', 790, 397);

    drawTools(ctx);
  }

  function drawTools(ctx) {
    // switch puller
    ctx.save();
    ctx.translate(878, 328);
    ctx.rotate(0.28);
    ctx.fillStyle = '#1b2229';
    roundRect(ctx, -6, -26, 12, 52, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.stroke();
    ctx.fillStyle = '#11161b';
    roundRect(ctx, -12, -38, 24, 14, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,210,220,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-5, -38);
    ctx.lineTo(-5, -48);
    ctx.moveTo(5, -38);
    ctx.lineTo(5, -48);
    ctx.stroke();
    ctx.restore();

    // loose replacement switch
    ctx.save();
    ctx.translate(850, 430);
    ctx.fillStyle = 'rgba(58,68,78,0.9)';
    roundRect(ctx, -11, -11, 22, 22, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,238,245,0.7)';
    ctx.fillRect(-1.4, -8, 2.8, 7);
    ctx.fillRect(-4.5, -5.5, 9, 2.6);
    ctx.restore();
  }

  function drawLabel(ctx, t) {
    // underside of the board
    ctx.save();
    const casing = ctx.createLinearGradient(260, 150, 740, 410);
    casing.addColorStop(0, '#39424c');
    casing.addColorStop(0.5, '#202830');
    casing.addColorStop(1, '#11171d');
    ctx.fillStyle = casing;
    roundRect(ctx, 262, 150, 476, 268, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();

    // label sticker
    ctx.fillStyle = '#e7e0cd';
    roundRect(ctx, 344, 218, 312, 132, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#1d2329';
    ctx.textAlign = 'left';
    ctx.font = '700 12px ui-monospace, Menlo, monospace';
    ctx.fillText('KEYCHRON K2', 360, 242);
    ctx.font = '8.5px ui-monospace, Menlo, monospace';
    ctx.fillText('MODEL  K2-A3', 360, 260);
    ctx.fillText('SERIAL K2A-88214', 360, 274);
    ctx.fillText('65% · HOT-SWAP · RGB', 360, 288);

    // barcode
    let x = 360;
    let seed = 41;
    for (let i = 0; i < 34; i++) {
      seed = (seed * 16807) % 2147483647;
      const w = 1 + (seed % 3);
      if (i % 2 === 0) ctx.fillRect(x, 302, w, 30);
      x += w + 1;
    }
    ctx.font = '6.5px ui-monospace, Menlo, monospace';
    ctx.fillText('K2A-88214-65', 360, 342);

    // screws
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    [[284, 172], [716, 172], [284, 396], [716, 396]].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // warm highlight sweep
    const g = ctx.createLinearGradient(300, 180, 700, 380);
    g.addColorStop(0, 'rgba(255,216,168,' + (0.05 + Math.sin(t * 0.6) * 0.012) + ')');
    g.addColorStop(1, 'rgba(255,216,168,0)');
    ctx.fillStyle = g;
    roundRect(ctx, 262, 150, 476, 268, 18);
    ctx.fill();
    ctx.restore();
  }

  function draw(ctx, W, H, t, opts) {
    const focus = FOCUS[opts.focus] || FOCUS.device;
    const zoom = opts.zoom || focus.zoom;
    const swayX = opts.motion === false ? 0 : Math.sin(t * 0.55) * 2;
    const swayY = opts.motion === false ? 0 : Math.cos(t * 0.41) * 1.5;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const scale = Math.max(W / VW, H / VH);
    ctx.setTransform(scale, 0, 0, scale, (W - VW * scale) / 2, (H - VH * scale) / 2);

    drawBench(ctx, t, swayX);

    ctx.save();
    const focusY = focus.ty != null ? focus.ty : focus.y;
    if (zoom > 1.12) {
      ctx.translate(VW / 2 + swayX, focusY + swayY);
      ctx.scale(zoom, zoom);
      ctx.translate(-focus.x, -focus.y);
    } else {
      ctx.translate(swayX, swayY);
    }

    if (opts.focus === 'label') {
      drawLabel(ctx, t);
    } else {
      drawKeyboard(ctx, { focus: opts.focus, fixed: opts.fixed, t: t });
    }
    ctx.restore();

    // contact light
    const glow = ctx.createRadialGradient(500, 450, 40, 500, 450, 420);
    glow.addColorStop(0, 'rgba(140,200,255,0.05)');
    glow.addColorStop(1, 'rgba(140,200,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-200, -200, VW + 400, VH + 400);

    // vignette
    const vig = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.95);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = vig;
    ctx.fillRect(-200, -200, VW + 400, VH + 400);

    // scanline texture
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let y = 0; y < VH; y += 4) ctx.fillRect(0, y, VW, 0.6);
    ctx.restore();

    // grain
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ensureNoise(ctx);
    if (noisePattern) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = noisePattern;
      const ox = opts.motion === false ? 0 : (t * 19) % 96;
      const oy = opts.motion === false ? 0 : (t * 11) % 96;
      ctx.translate(-ox, -oy);
      ctx.fillRect(0, 0, W + 96, H + 96);
      ctx.restore();
    }
  }

  M.scene = {
    still(opts) {
      const c = document.createElement('canvas');
      c.width = 760;
      c.height = 428;
      const cctx = c.getContext('2d');
      draw(
        cctx,
        c.width,
        c.height,
        (opts && opts.t) || 12,
        Object.assign({ focus: 'device', fixed: false, motion: false }, opts || {})
      );
      return c.toDataURL('image/jpeg', 0.74);
    },

    create(canvas) {
      const ctx = canvas.getContext('2d');
      let width = 0;
      let height = 0;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let opts = { focus: 'device', fixed: false, zoom: null, motion: true };
      let paused = false;
      let destroyed = false;
      let raf = 0;
      let clock = 0;
      let last = performance.now();
      const reduceMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function resize() {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        width = Math.round(rect.width * dpr);
        height = Math.round(rect.height * dpr);
        canvas.width = width;
        canvas.height = height;
        render(0);
      }

      function render(delta) {
        if (destroyed) return;
        if (!paused) clock += reduceMotion ? 0 : delta;
        draw(ctx, width || canvas.width, height || canvas.height, clock, opts);
      }

      function loop(now) {
        if (destroyed) return;
        const delta = Math.min(64, now - last);
        last = now;
        render(delta);
        raf = requestAnimationFrame(loop);
      }

      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      resize();
      raf = requestAnimationFrame(loop);

      return {
        set(next) {
          opts = Object.assign({}, opts, next);
        },
        setPaused(value) {
          paused = !!value;
          if (paused) render(0);
        },
        setMotion(value) {
          opts.motion = !!value;
        },
        capture(captureOpts) {
          const c = document.createElement('canvas');
          c.width = 760;
          c.height = 428;
          const cctx = c.getContext('2d');
          draw(
            cctx,
            c.width,
            c.height,
            (captureOpts && captureOpts.t) || clock || 12,
            Object.assign({}, opts, { motion: false }, captureOpts || {})
          );
          return c.toDataURL('image/jpeg', 0.74);
        },
        destroy() {
          destroyed = true;
          cancelAnimationFrame(raf);
          ro.disconnect();
        },
      };
    },
  };
})();
