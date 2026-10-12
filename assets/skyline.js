
// ===== GITHUB CONTRIBUTION SKYLINE =====
(function() {
  const DAY_MS = 86400000;
  const clamp01 = v => (v > 0 ? (v < 1 ? v : 1) : 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOutCubic = x => {
    const t = clamp01(x);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  const easeOutCubic = x => 1 - Math.pow(1 - clamp01(x), 3);
  const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  
  const toKey = ms => new Date(ms).toISOString().slice(0, 10);
  const dayMs = v => {
    if (typeof v === "number") return Math.floor(v / DAY_MS) * DAY_MS;
    if (typeof v === "string") {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
      if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
      v = new Date(v);
    }
    return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  };
  
  const rng = seed => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  
  const generateContributions = (endMs, seed = 7, days = 371) => {
    const r = rng(seed);
    const bursts = Array.from({ length: 4 }, () => ({ at: r(), width: 0.035 + r() * 0.07, gain: 0.6 + r() * 1.1 }));
    const out = [];
    let mood = 0.5;
    for (let i = 0; i < days; i++) {
      const ms = endMs - (days - 1 - i) * DAY_MS;
      const x = i / Math.max(1, days - 1);
      const dow = new Date(ms).getUTCDay();
      const weekend = dow === 0 || dow === 6;
      let heat = 0.2;
      for (const b of bursts) heat += b.gain * Math.exp(-Math.pow(x - b.at, 2) / (2 * b.width * b.width));
      mood = mood * 0.85 + r() * 0.15;
      heat *= 0.55 + mood * 0.9;
      const pActive = Math.min(0.94, (weekend ? 0.22 : 0.5) + heat * 0.4);
      let count = 0;
      if (r() < pActive) count = 1 + Math.floor(-Math.log(1 - r()) * (1.2 + heat * 7) * (weekend ? 0.5 : 1));
      if (r() < 0.01) count += 18 + Math.floor(r() * 24);
      out.push({ date: toKey(ms), count });
    }
    return out;
  };
  
  const levelOf = (count, busy) => count <= 0 ? 0 : busy <= 0 ? 4 : 1 + Math.min(3, Math.floor((count / busy) * 4));
  
  const buildGrid = (data, endMs, weekStart = 0) => {
    const counts = new Map();
    for (const d of data) {
      if (!d || typeof d.date !== "string") continue;
      const ms = dayMs(d.date);
      const c = Number(d.count);
      if (!Number.isFinite(ms) || !(c > 0) || !Number.isFinite(c)) continue;
      const k = toKey(ms);
      counts.set(k, (counts.get(k) || 0) + c);
    }
    let start = endMs - 364 * DAY_MS;
    start -= ((new Date(start).getUTCDay() - weekStart + 7) % 7) * DAY_MS;
    const cells = [];
    for (let ms = start, i = 0; ms <= endMs; ms += DAY_MS, i++) {
      const date = toKey(ms);
      cells.push({ date, count: counts.get(date) || 0, level: 0, week: Math.floor(i / 7), day: i % 7 });
    }
    const nz = cells.map(c => c.count).filter(c => c > 0).sort((a, b) => a - b);
    const busy = nz.length ? nz[Math.floor(0.95 * (nz.length - 1))] : 0;
    for (const c of cells) c.level = levelOf(c.count, busy);
    return { cells, weeks: cells.length ? cells[cells.length - 1].week + 1 : 0, max: nz.length ? nz[nz.length - 1] : 0 };
  };
  
  const computeStats = cells => {
    let total = 0;
    for (const c of cells) total += c.count;
    return { total };
  };
  
  const monthLabels = (cells, weeks) => {
    const fmt = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
    const out = [];
    let prev = -1;
    for (let w = 0; w < weeks; w++) {
      const c = cells[w * 7];
      if (!c) break;
      const m = +c.date.slice(5, 7);
      if (m !== prev) out.push({ week: w, label: fmt.format(dayMs(c.date)) });
      prev = m;
    }
    if (out.length > 1 && out[1].week - out[0].week < 3) out.shift();
    return out;
  };
  
  const barHeight = (count, max, scale = 1) => count > 0 && max > 0 ? 0.4 + Math.pow(count / max, 0.85) * 7.2 * scale : 0.2;
  const riseAt = (t, week, weeks, day) => {
    const d = (weeks > 1 ? week / (weeks - 1) : 0) * 0.36 + (day / 6) * 0.06;
    return easeOutCubic((t - d) / (1 - 0.42));
  };
  
  const YAW_3D = Math.PI / 4;
  const ELEV_3D = (34 * Math.PI) / 180;
  const YAW_RANGE = [(8 * Math.PI) / 180, (82 * Math.PI) / 180];
  const ELEV_RANGE = [(18 * Math.PI) / 180, (62 * Math.PI) / 180];
  
  const camera = (e, dYaw = 0, dElev = 0) => {
    const yaw = Math.min(YAW_RANGE[1], Math.max(0, lerp(0, YAW_3D + dYaw, e)));
    const elev = lerp(Math.PI / 2, Math.min(ELEV_RANGE[1], Math.max(ELEV_RANGE[0], ELEV_3D + dElev)), e);
    return { cs: Math.cos(yaw), sn: Math.sin(yaw), se: Math.sin(elev), ce: Math.cos(elev) };
  };
  
  const project = (c, x, y, z) => [
    x * c.cs - y * c.sn,
    (x * c.sn + y * c.cs) * c.se - z * c.ce
  ];
  
  const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  
  const pointInQuad = (p, o, x, y) => {
    let sign = 0;
    for (let k = 0; k < 4; k++) {
      const ax = p[o + k * 2];
      const ay = p[o + k * 2 + 1];
      const bx = p[o + ((k + 1) % 4) * 2];
      const by = p[o + ((k + 1) % 4) * 2 + 1];
      const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (Math.abs(cross) < 1e-9) continue;
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return sign !== 0;
  };
  
  const quadPath = (ctx, p, o, r) => {
    if (r < 0.3) {
      ctx.moveTo(p[o], p[o + 1]);
      ctx.lineTo(p[o + 2], p[o + 3]);
      ctx.lineTo(p[o + 4], p[o + 5]);
      ctx.lineTo(p[o + 6], p[o + 7]);
      ctx.closePath();
      return;
    }
    ctx.moveTo((p[o + 6] + p[o]) / 2, (p[o + 7] + p[o + 1]) / 2);
    for (let k = 0; k < 4; k++) {
      const b = (k + 1) % 4;
      ctx.arcTo(p[o + k * 2], p[o + k * 2 + 1], p[o + b * 2], p[o + b * 2 + 1], r);
    }
    ctx.closePath();
  };
  
  const root = document.getElementById('skyline-root');
  if(!root) return;
  const stage = document.getElementById('skyline-stage');
  const canvas = document.getElementById('skyline-canvas');
  const tip = document.getElementById('skyline-tip');
  const ctx = canvas.getContext('2d');
  
  const fg = [20, 20, 20];
  const bg = [255, 255, 255];
  const empty = [250, 250, 250];
  const palRGB = [
    empty,
    [180, 180, 180],
    [120, 120, 120],
    [70, 70, 70],
    [20, 20, 20]
  ];
  
  let endMs = dayMs(new Date());
  let days = generateContributions(endMs, 7);
  let grid = buildGrid(days, endMs, 0);
  let stats = computeStats(grid.cells);
  let months = monthLabels(grid.cells, grid.weeks);
  
  document.getElementById('skyline-title').innerHTML = `<span style="font-weight: 600;">${stats.total.toLocaleString()}</span> contributions in the last year`;
  
  let n = grid.cells.length;
  let weeks = grid.weeks;
  
  let wk = new Float32Array(n);
  let dy = new Float32Array(n);
  let lv = new Uint8Array(n);
  let hgt = new Float32Array(n);
  let zs = new Float32Array(n);
  let polys = new Float32Array(n * 24);
  let faces = new Uint8Array(n);
  let order = Array.from({ length: n }, (_, i) => i);
  
  for(let i=0; i<n; i++) {
      wk[i] = grid.cells[i].week;
      dy[i] = grid.cells[i].day;
      lv[i] = grid.cells[i].level;
      hgt[i] = barHeight(grid.cells[i].count, grid.max, 1);
  }
  
  let targetView = 1; // 1 = 3D, 0 = 2D
  let t = 0;
  let yaw = 0, elev = 0, yawGoal = 0, elevGoal = 0;
  let W = 0, Hmax = 0;
  let lastH = -1;
  let activeIdx = -1;
  let hovered = -1;
  let raf = 0, lastTime = performance.now();
  
  const extent = (cam, e, full) => {
    const w = lerp(0.78, 0.9, e);
    const off = (1 - w) / 2;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    const add = (x, y, z) => {
      const p = project(cam, x, y, z);
      if(p[0] < minx) minx = p[0]; if(p[0] > maxx) maxx = p[0];
      if(p[1] < miny) miny = p[1]; if(p[1] > maxy) maxy = p[1];
    };
    for(let i=0; i<n; i++){
      const x0 = wk[i] + off, y0 = dy[i] + off, z = full ? hgt[i]*e : zs[i];
      add(x0, y0, z); add(x0+w, y0, z); add(x0, y0+w, z);
      add(x0+w, y0+w, 0); add(x0, y0+w, 0); add(x0+w, y0, 0);
    }
    add(0, 7 + 1.5*e, 0); add(weeks, 7 + 1.5*e, 0);
    return { minx, maxx, miny, maxy };
  };
  
  const relayout = () => {
    canvas.style.width = "100%";
    const rect = stage.getBoundingClientRect();
    const parentW = stage.parentElement ? stage.parentElement.clientWidth : 0;
    W = Math.round(stage.clientWidth || rect.width || parentW || (window.innerWidth - 32));
    if (W > window.innerWidth - 32) W = window.innerWidth - 32;
    if(!W || W <= 0) return;
    const b2 = extent(camera(0), 0, true);
    let H2 = 24 + ((b2.maxy - b2.miny) / (b2.maxx - b2.minx)) * (W - 20);
    const b3 = extent(camera(1), 1, true);
    let H3 = Math.max(Math.min(((b3.maxy - b3.miny) / (b3.maxx - b3.minx)) * (W - 20) + 40, 520), 240);
    Hmax = Math.ceil(Math.max(H2, H3));
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(Hmax * dpr);
    canvas.style.width = "100%";
    canvas.style.height = Hmax + "px";
    lastH = -1;
    draw();
  };
  
  const draw = () => {
    if(!W) return;
    const e = easeInOutCubic(t);
    const cam = camera(e, yaw, elev);
    
    const b2 = extent(camera(0), 0, true);
    const H2 = 24 + ((b2.maxy - b2.miny) / (b2.maxx - b2.minx)) * (W - 20);
    const b3 = extent(camera(1), 1, true);
    const H3 = Math.max(Math.min(((b3.maxy - b3.miny) / (b3.maxx - b3.minx)) * (W - 20) + 40, 520), 240);
    
    const Hc = lerp(H2, H3, e);
    if(Math.abs(Hc - lastH) > 0.2) {
      stage.style.height = Hc.toFixed(1) + "px";
      lastH = Hc;
    }
    
    for(let i=0; i<n; i++) zs[i] = riseAt(t, wk[i], weeks, dy[i]) * hgt[i];
    
    const b = extent(cam, e, false);
    const pad = lerp(4, W < 600 ? 12 : 20, e);
    const left = pad + 10 * (1-e);
    const top = pad + 14 * (1-e);
    const aw = W - left - pad, ah = Hc - top - pad;
    const bw = Math.max(1e-6, b.maxx - b.minx), bh = Math.max(1e-6, b.maxy - b.miny);
    // Perfectly proportioned on mobile so it looks big and prominent in the frame with zero clipping
    const zoomFactor = W < 600 ? 0.58 : (W < 900 ? 0.72 : 0.85);
    const s = Math.min(aw / bw, ah / bh) * zoomFactor;
    const ox = left + (aw - bw * s) / 2 - b.minx * s;
    const oy = top + (ah - bh * s) / 2 - b.miny * s;
    
    const px = (x,y) => ox + (x * cam.cs - y * cam.sn) * s;
    const py = (x,y,z) => oy + ((x * cam.sn + y * cam.cs) * cam.se - z * cam.ce) * s;
    
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hmax);
    
    order.sort((a, c) => (wk[a] + 0.5) * cam.sn + (dy[a] + 0.5) * cam.cs - ((wk[c] + 0.5) * cam.sn + (dy[c] + 0.5) * cam.cs));
    
    const w = lerp(0.78, 0.9, e);
    const off = (1 - w) / 2;
    const radius = lerp(0.17, 0.03, e) * s;
    const outline = (1 - e) * 0.07;
    const lift = 0.7 * e;
    
    for(let k=0; k<n; k++) {
      const i = order[k];
      const x0 = wk[i] + off, y0 = dy[i] + off, x1 = x0 + w, y1 = y0 + w;
      const z = zs[i] + (activeIdx === i ? lift : 0);
      const o = i * 24;
      polys[o] = px(x0, y0); polys[o+1] = py(x0, y0, z);
      polys[o+2] = px(x1, y0); polys[o+3] = py(x1, y0, z);
      polys[o+4] = px(x1, y1); polys[o+5] = py(x1, y1, z);
      polys[o+6] = px(x0, y1); polys[o+7] = py(x0, y1, z);
      
      polys[o+8] = px(x0, y1); polys[o+9] = py(x0, y1, 0);
      polys[o+10] = px(x1, y1); polys[o+11] = py(x1, y1, 0);
      polys[o+12] = polys[o+4]; polys[o+13] = polys[o+5];
      polys[o+14] = polys[o+6]; polys[o+15] = polys[o+7];
      
      polys[o+16] = px(x1, y0); polys[o+17] = py(x1, y0, 0);
      polys[o+18] = polys[o+10]; polys[o+19] = polys[o+11];
      polys[o+20] = polys[o+4]; polys[o+21] = polys[o+5];
      polys[o+22] = polys[o+2]; polys[o+23] = polys[o+3];
      
      const tall = z * cam.ce * s;
      let f = 0;
      if(tall > 0.35 && w * cam.cs * s > 0.35) f |= 1;
      if(tall > 0.35 && w * cam.sn * s > 0.35) f |= 2;
      faces[i] = f;
      
      let [r,g,b_c] = palRGB[lv[i]];
      if(activeIdx === i) {
        r += (fg[0]-r)*0.16; g += (fg[1]-g)*0.16; b_c += (fg[2]-b_c)*0.16;
      }
      
      if(f & 1) { ctx.beginPath(); quadPath(ctx, polys, o+8, 0); ctx.fillStyle = `rgb(${r*0.84},${g*0.84},${b_c*0.84})`; ctx.fill(); }
      if(f & 2) { ctx.beginPath(); quadPath(ctx, polys, o+16, 0); ctx.fillStyle = `rgb(${r*0.68},${g*0.68},${b_c*0.68})`; ctx.fill(); }
      ctx.beginPath(); quadPath(ctx, polys, o, radius); ctx.fillStyle = `rgb(${r},${g},${b_c})`; ctx.fill();
      
      if(outline > 0.004) { ctx.strokeStyle = `rgba(${fg[0]},${fg[1]},${fg[2]},${outline})`; ctx.lineWidth = 1; ctx.stroke(); }
      if(activeIdx === i) { ctx.strokeStyle = `rgba(${fg[0]},${fg[1]},${fg[2]},0.85)`; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    
    const a2 = 1 - smoothstep(0, 0.4, e);
    const a3 = smoothstep(0.62, 1, e);
    ctx.font = "10px sans-serif";
    if(a2 > 0.004) {
      ctx.fillStyle = `rgba(120,120,120,${a2})`;
      ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      let edge = -Infinity;
      for(let m of months) {
        let x = px(m.week + off, -0.3);
        let tw = ctx.measureText(m.label).width;
        if(x > edge && x + tw < W) { ctx.fillText(m.label, x, py(m.week+off, -0.3, 0)-3); edge = x + tw + 6; }
      }
    }
    if(a3 > 0.004) {
      ctx.fillStyle = `rgba(120,120,120,${a3})`;
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      let edge = -Infinity;
      for(let m of months) {
        let x = px(m.week + 0.5, 7.3);
        let tw = ctx.measureText(m.label).width;
        if(x > edge && x + tw < W) { ctx.fillText(m.label, x, py(m.week+0.5, 7.3, 0)+2); edge = x + tw + 10; }
      }
    }
    
    if(activeIdx >= 0) {
      const i = activeIdx;
      const z = zs[i] + lift;
      const tx = px(wk[i] + 0.5, dy[i] + 0.5);
      const ty = Math.min(py(wk[i]+off, dy[i]+off, z), py(wk[i]+off+w, dy[i]+off, z), py(wk[i]+off, dy[i]+off+w, z));
      const tipW = tip.offsetWidth;
      const half = tipW / 2;
      const cx = Math.min(W - half - 2, Math.max(half + 2, tx));
      tip.style.transform = `translate(${(cx - half).toFixed(1)}px, ${(ty - 8).toFixed(1)}px) translateY(-100%)`;
      tip.style.setProperty('--arrow', (tx - cx + half).toFixed(1) + "px");
    }
  };
  
  const tick = now => {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    let moving = false;
    
    if(t !== targetView) {
      const step = (dt * 1000) / 1300;
      t = targetView > t ? Math.min(targetView, t + step) : Math.max(targetView, t - step);
      moving = true;
    }
    
    const ko = 1 - Math.exp(-dt * 12);
    yaw += (yawGoal - yaw) * ko;
    elev += (elevGoal - elev) * ko;
    if(Math.abs(yawGoal - yaw) > 1e-4 || Math.abs(elevGoal - elev) > 1e-4) moving = true;
    else { yaw = yawGoal; elev = elevGoal; }
    
    draw();
    if(moving) raf = requestAnimationFrame(tick);
  };
  
  const kick = () => {
    if(raf) return;
    lastTime = performance.now();
    raf = requestAnimationFrame(tick);
  };
  
  window.addEventListener('resize', () => relayout());
  window.addEventListener('orientationchange', () => setTimeout(relayout, 150));
  if (typeof ResizeObserver !== 'undefined' && stage) {
    new ResizeObserver(() => relayout()).observe(stage);
  }
  relayout();
  // On mobile, re-run layout after a short delay so CSS overflow constraints are applied first
  if (window.innerWidth < 768) {
    setTimeout(relayout, 300);
    setTimeout(relayout, 800);
  }
  kick();
  
  document.getElementById('btn-2d').onclick = (e) => {
    targetView = 0; yawGoal = 0; elevGoal = 0; kick();
    e.target.style.background = 'var(--text-primary)'; e.target.style.color = 'var(--bg-primary)';
    document.getElementById('btn-3d').style.background = 'transparent'; document.getElementById('btn-3d').style.color = 'var(--text-muted)';
    document.getElementById('skyline-hint').innerText = "Hover a day for details";
  };
  document.getElementById('btn-3d').onclick = (e) => {
    targetView = 1; kick();
    e.target.style.background = 'var(--text-primary)'; e.target.style.color = 'var(--bg-primary)';
    document.getElementById('btn-2d').style.background = 'transparent'; document.getElementById('btn-2d').style.color = 'var(--text-muted)';
    document.getElementById('skyline-hint').innerText = "Drag to orbit \u00b7 double-click to reset";
  };
  
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if(targetView !== 1) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: yawGoal, elev: elevGoal, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if(drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dyy = e.clientY - drag.y;
      if(drag.moved || Math.hypot(dx, dyy) > 4) {
        drag.moved = true;
        yawGoal = Math.min(YAW_RANGE[1] - YAW_3D, Math.max(YAW_RANGE[0] - YAW_3D, drag.yaw + dx * 0.006));
        elevGoal = Math.min(ELEV_RANGE[1] - ELEV_3D, Math.max(ELEV_RANGE[0] - ELEV_3D, drag.elev + dyy * 0.004));
        canvas.style.cursor = "grabbing";
        kick(); return;
      }
    }
    
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let hit = -1;
    for(let k=n-1; k>=0; k--) {
      const i = order[k], o = i*24;
      if(pointInQuad(polys, o, x, y)) { hit = i; break; }
      if(faces[i]&1 && pointInQuad(polys, o+8, x, y)) { hit = i; break; }
      if(faces[i]&2 && pointInQuad(polys, o+16, x, y)) { hit = i; break; }
    }
    if(hit !== hovered) {
      hovered = hit;
      activeIdx = hit;
      if(activeIdx >= 0) {
        const c = grid.cells[activeIdx];
        document.getElementById('tip-count').innerText = c.count ? `${c.count} contributions` : `No contributions`;
        document.getElementById('tip-date').innerText = new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric'}).format(dayMs(c.date));
        tip.style.opacity = 1;
      } else {
        tip.style.opacity = 0;
      }
      draw();
    }
    if(!drag) canvas.style.cursor = hit >= 0 ? "pointer" : (targetView === 1 ? "grab" : "default");
  });
  canvas.addEventListener('pointerup', e => { if(drag && e.pointerId === drag.id) { drag = null; canvas.releasePointerCapture(e.pointerId); canvas.style.cursor = targetView === 1 ? "grab" : "default"; } });
  canvas.addEventListener('dblclick', () => { yawGoal = 0; elevGoal = 0; kick(); });
  canvas.addEventListener('pointerleave', () => { hovered = -1; activeIdx = -1; tip.style.opacity = 0; draw(); });

})();
