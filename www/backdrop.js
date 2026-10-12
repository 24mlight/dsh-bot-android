/*
 * Login-page backdrop: a drifting nebula of white-and-grey particles
 * over the whole screen. No colour, no outlines: a few soft clouds of
 * particles wander, breathe, shear into wisps and trade particles with
 * each other, so density keeps gathering in one place and thinning in
 * another. About a third of the particles are dust spread evenly over
 * the screen, so the field never empties.
 *
 * Each cloud is a stretched, slowly turning Gaussian whose centre moves
 * on a slow Lissajous path; its inner particles orbit faster than its
 * outer ones, which draws the streaks. Every few seconds a quarter of
 * the particles leave for another cloud and flow there with a sideways
 * swirl. Dots are batched into five brightness paths per frame.
 * While 登录 is busy everything runs about three times faster.
 * Stops while hidden; one still frame for reduced motion.
 */
(function () {
  "use strict";
  var canvas = document.getElementById("neural");
  if (!canvas || typeof canvas.getContext !== "function") return;
  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var mq = function (q) {
    return typeof window.matchMedia === "function" ? window.matchMedia(q) : { matches: false };
  };
  var reduced = mq("(prefers-reduced-motion: reduce)");
  var darkQ = mq("(prefers-color-scheme: dark)");

  var CLOUDS = 5, DUST = 0.3, BANDS = 5;
  var SHIFT_EVERY = 4.2, SHIFT_SHARE = 0.25, SHIFT_TIME = 3.2; // seconds of field time

  var w = 0, h = 0, dpr = 1;
  var parts = [], clouds = [], bands = [];
  var t = 0, nextShift = SHIFT_EVERY, last = 0, frame = 0, speed = 1;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function fract(v) { return v - Math.floor(v); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  function gauss() {
    var u = Math.max(1e-6, Math.random()), v = Math.random();
    var r = Math.sqrt(-2 * Math.log(u));
    return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
  }

  function build() {
    clouds = [];
    for (var c = 0; c < CLOUDS; c++) {
      clouds.push({
        ax: rand(0.05, 0.11), px: rand(0, 6.28), ay: rand(0.04, 0.09), py: rand(0, 6.28),
        sx: rand(0.07, 0.15), sy: rand(0.04, 0.09), spin: rand(-0.12, 0.12), tilt: rand(0, 3.14),
        breathe: rand(0.2, 0.4), x: 0, y: 0, cos: 1, sin: 0, k: 1
      });
    }
    var n = Math.round(Math.min(9000, Math.max(4500, (w * h) / 46)));
    parts = [];
    for (var i = 0; i < n; i++) {
      var g = gauss();
      parts.push({
        dust: Math.random() < DUST, u: Math.random(), v: Math.random(), s: Math.random(),
        g1: g[0], g2: g[1], r: Math.sqrt(g[0] * g[0] + g[1] * g[1]),
        c0: (Math.random() * CLOUDS) | 0, c1: -1, t0: 0, x: 0, y: 0, b: 0
      });
    }
  }

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var nw = window.innerWidth, nh = window.innerHeight;
    if (nw === w && nh === h && parts.length) return;
    var rebuild = !parts.length || Math.abs(nw * nh - w * h) > w * h * 0.5;
    w = nw; h = nh;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (rebuild) build();
  }

  /** Move the clouds: centres wander over the upper two thirds of the
   * screen, each cloud stretches, turns and breathes. */
  function moveClouds(time) {
    var size = Math.max(w, h * 0.6);
    for (var c = 0; c < clouds.length; c++) {
      var q = clouds[c];
      q.x = w * (0.5 + 0.34 * Math.sin(time * q.ax + q.px));
      q.y = h * (0.36 + 0.22 * Math.sin(time * q.ay + q.py));
      var a = q.tilt + time * q.spin;
      q.cos = Math.cos(a); q.sin = Math.sin(a);
      q.k = size * (1 + 0.25 * Math.sin(time * q.breathe + q.px));
    }
  }

  var out = [0, 0];
  /** Where particle p sits inside cloud c at this time. */
  function inCloud(p, c, time) {
    var q = clouds[c];
    // inner particles orbit faster: the cloud shears into wisps
    var a = time * (0.22 / (0.45 + p.r)) * (c % 2 ? 1 : -1);
    var ca = Math.cos(a), sa = Math.sin(a);
    var lx = (p.g1 * ca - p.g2 * sa) * q.sx * q.k;
    var ly = (p.g1 * sa + p.g2 * ca) * q.sy * q.k;
    out[0] = q.x + lx * q.cos - ly * q.sin;
    out[1] = q.y + lx * q.sin + ly * q.cos;
  }

  function shift(time) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.dust || p.c1 >= 0 || Math.random() > SHIFT_SHARE) continue;
      p.c1 = (p.c0 + 1 + ((Math.random() * (CLOUDS - 1)) | 0)) % CLOUDS;
      p.t0 = time + p.s * 0.8;
    }
  }

  function update(dt) {
    var go = document.getElementById("go");
    var busy = !!go && typeof go.getAttribute === "function" && go.getAttribute("aria-busy") === "true";
    speed += ((busy ? 3 : 1) - speed) * Math.min(1, dt * 0.004);
    t += dt * 0.001 * speed;
    if (t >= nextShift) {
      shift(t);
      nextShift = t + SHIFT_EVERY;
    }
    moveClouds(t);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.dust) {
        p.x = fract(p.u + t * 0.004 * (0.5 + p.s)) * w;
        p.y = p.v * h + Math.sin(t * 0.3 + p.u * 20) * 6;
        p.b = 0.1 + p.s * 0.22;
        continue;
      }
      inCloud(p, p.c0, t);
      var x = out[0], y = out[1];
      if (p.c1 >= 0) {
        var e = ease(Math.max(0, Math.min(1, (t - p.t0) / SHIFT_TIME)));
        inCloud(p, p.c1, t);
        var swirl = Math.sin(e * Math.PI) * 40 * (p.s - 0.5);
        x += (out[0] - x) * e + swirl;
        y += (out[1] - y) * e - swirl * 0.6;
        if (e >= 1) { p.c0 = p.c1; p.c1 = -1; }
      }
      p.x = x; p.y = y;
      // brighter toward a cloud's core, so density reads as light
      p.b = 0.2 + Math.max(0, 0.75 - p.r * 0.28);
    }
  }

  function draw(time) {
    var dark = darkQ.matches;
    var ink = dark ? "255,255,255" : "28,35,51";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (var b = 0; b < BANDS; b++) bands[b] = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.x < -4 || p.x > w + 4 || p.y < -4 || p.y > h + 4) continue;
      var twinkle = 0.8 + 0.2 * Math.sin(time * 2.2 + p.s * 40);
      bands[Math.max(0, Math.min(BANDS - 1, Math.floor(p.b * twinkle * BANDS)))].push(p);
    }
    for (var band = 0; band < BANDS; band++) {
      var list = bands[band];
      if (!list.length) continue;
      var lv = (band + 0.5) / BANDS;
      var size = 0.9 + lv * 1.2;
      ctx.fillStyle = "rgba(" + ink + "," + ((dark ? 0.1 : 0.06) + lv * (dark ? 0.85 : 0.5)).toFixed(3) + ")";
      ctx.beginPath();
      for (var j = 0; j < list.length; j++) ctx.rect(list[j].x - size / 2, list[j].y - size / 2, size, size);
      ctx.fill();
    }
  }

  function tick(now) {
    frame = 0;
    var dt = last ? Math.min(50, now - last) : 16;
    last = now;
    layout();
    update(dt);
    draw(t);
    start();
  }

  function start() {
    if (frame || document.hidden || reduced.matches) return;
    frame = window.requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  }

  /** Reduced motion: the field drawn once. */
  function still() {
    layout();
    update(0);
    draw(0);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });
  window.addEventListener("resize", function () {
    if (reduced.matches) still();
  });
  if (typeof reduced.addEventListener === "function") reduced.addEventListener("change", function () {
    if (reduced.matches) { stop(); still(); } else { start(); }
  });
  if (typeof darkQ.addEventListener === "function") darkQ.addEventListener("change", function () {
    if (reduced.matches) still();
  });

  if (reduced.matches) still();
  else start();
})();
