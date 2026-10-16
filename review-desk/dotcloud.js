/* Dot cloud — the AI-working visual for Review Desk pop-ups.
 * A loose cloud of white dots swirling in shallow depth: dots near the focal plane are small and crisp,
 * dots in front of or behind it are larger, softer and dimmer (bokeh). Two modes:
 *   "work" — the cloud spreads out and swirls while a scan or check runs
 *   "rest" — the dots gather into a calm, slow cluster once the result lands
 * Deterministic (seeded) so the rendered walkthrough matches the live app frame for frame.
 * Draws on a <canvas> with requestAnimationFrame; stops when the canvas leaves the DOM, skips frames while
 * the tab is hidden, and renders a single still frame under prefers-reduced-motion. */
(function () {
  "use strict";
  const TAU = Math.PI * 2;

  function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

  function DotCloud(canvas, opts) {
    opts = opts || {};
    const ctx = canvas.getContext("2d");
    const rand = rng(opts.seed || 97);
    const count = opts.count || 46;
    const dots = Array.from({ length: count }, (_, i) => ({
      a: rand() * TAU,                         // orbit angle
      r: 0.25 + Math.pow(rand(), 0.8) * 0.75,  // orbit radius (fraction of the cloud's half-width)
      w: (0.35 + rand() * 0.55) * (i % 2 ? 1 : -1) * 0.9, // angular speed, mixed directions
      tilt: (rand() - 0.5) * 0.9,              // vertical squash/offset of each orbit
      ph: rand() * TAU,                        // phase for bobbing, depth and twinkle
      size: 0.7 + rand() * 0.6,
      rgb: i % 4 === 0 ? "255,183,46" : i % 7 === 0 ? "125,187,234" : "255,255,255" // brand amber and sky among white
    }));
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let mode = opts.mode || "work";
    let spread = mode === "work" ? 1 : 0.32, energy = mode === "work" ? 1 : 0.18, glow = mode === "work" ? 1 : 0.75;
    let clock = 0, last = null, raf = 0, stopped = false;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || 300, h = canvas.clientHeight || 140;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    }

    function draw(dt) {
      const { w, h } = size();
      // ease spread/energy towards the mode's targets (~350 ms time constant)
      const k = 1 - Math.exp(-dt / 350);
      spread += ((mode === "work" ? 1 : 0.32) - spread) * k;
      energy += ((mode === "work" ? 1 : 0.18) - energy) * k;
      glow += ((mode === "work" ? 1 : 0.75) - glow) * k;
      clock += (dt / 1000) * energy;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, rx = Math.min(w * 0.42, 165) * spread, ry = Math.min(h * 0.4, 60) * spread;
      for (const d of dots) {
        const a = d.a + d.w * clock;
        const z = Math.sin(a + d.ph);                       // −1 (far) … 1 (near)
        const x = cx + Math.cos(a) * d.r * rx;
        const y = cy + (Math.sin(a) * d.tilt + Math.sin(clock * 0.9 + d.ph) * 0.18) * d.r * ry * 1.6;
        const blur = Math.abs(z - 0.15);                    // distance from the focal plane
        const radius = (1.6 + blur * blur * 5.2) * d.size;
        const twinkle = 0.78 + 0.22 * Math.sin(clock * 2.3 + d.ph * 3);
        const alpha = Math.max(0.06, (0.95 - blur * 0.62) * twinkle * glow);
        if (blur < 0.35) {
          ctx.globalAlpha = alpha;
          ctx.fillStyle = `rgb(${d.rgb})`;
          ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
        } else {
          const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.6);
          g.addColorStop(0, `rgba(${d.rgb},${(alpha * 0.75).toFixed(3)})`);
          g.addColorStop(0.55, `rgba(${d.rgb},${(alpha * 0.35).toFixed(3)})`);
          g.addColorStop(1, `rgba(${d.rgb},0)`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, radius * 1.6, 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    function loop(now) {
      if (stopped || !canvas.isConnected) { stopped = true; return; }
      const dt = last === null ? 16 : Math.min(64, now - last);
      last = now;
      if (!document.hidden) draw(dt);
      raf = requestAnimationFrame(loop);
    }

    if (reduce) { clock = 1.3; draw(0); }
    else raf = requestAnimationFrame(loop);

    return {
      setMode(m) { mode = m; if (reduce) { spread = m === "work" ? 1 : 0.32; glow = m === "work" ? 1 : 0.75; draw(0); } },
      stop() { stopped = true; cancelAnimationFrame(raf); }
    };
  }

  window.DotCloud = DotCloud;
})();
