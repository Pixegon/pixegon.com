// Pixegon hero: procedural half-realistic / half-ASCII laptop.
// Canvas 2D, zero dependencies. Driven by one normalized scroll progress [0..1].
// The ASCII layer is generated procedurally from surface sample points (never baked).

export interface LaptopSceneOptions {
  density?: number;
  glow?: number;
  reduced?: boolean;
  calm?: boolean;
}

export interface LaptopSceneController {
  setProgress(progress: number): void;
  setPointer(x: number, y: number): void;
  setPointerPx(x: number | null, y?: number): void;
  setGlow(glow: number): void;
  setDensity(density: number): void;
  setCalm(calm: boolean): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

type Vec3 = [number, number, number];
type Projection = [number, number, number, number];
type Surface =
  | 'top'
  | 'key'
  | 'pad'
  | 'front'
  | 'back'
  | 'right'
  | 'left'
  | 'lidF'
  | 'screen'
  | 'lidB';

interface Patch {
  s: Surface;
  kind: string;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  r: number;
  su: number;
  sv: number;
}

interface SurfacePoint {
  s: Surface;
  a: number;
  b: number;
  scr: boolean;
  r: number;
  r2: number;
  acc: boolean;
  part: boolean;
  amp: number;
  dx: number;
  dy: number;
  dz: number;
  frag: string | null;
}

interface SolidPatch {
  z: number;
  q0: Projection;
  q1: Projection;
  q2: Projection;
  q3: Projection;
  f: string;
}

interface FragmentGlyph {
  x: number;
  y: number;
  t: string;
  a: number;
}

const GLYPHS = '.:-=+*#%@';
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const S = (p: number, a: number, b: number): number => {
  const t = clamp((p - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createLaptopScene(
  canvas: HTMLCanvasElement,
  opts: LaptopSceneOptions = {},
): LaptopSceneController {
  const ctx = canvas.getContext('2d')!;
  // Model dimensions (arbitrary units)
  const BX = 1.65;
  const BZF = 1.10;
  const BZB = -1.03;
  const BT = 0.13;
  const LIDL = 2.08;
  const SCR = { x0: -BX + 0.16, x1: BX - 0.16, u0: 0.15, u1: LIDL - 0.13 };
  const SD = { x: 0.88, y: 0.30, z: 0.36 }; // Scan plane direction (model space)
  const FRAGS = ['build()', 'deploy', 'scale', 'product'];
  const LGT: Vec3 = (() => {
    const l: Vec3 = [-0.45, 0.82, 0.5];
    const n = Math.hypot(...l);
    return l.map((v) => v / n) as Vec3;
  })();

  let density = clamp(opts.density || 1, 0.4, 2);
  let glow = opts.glow == null ? 0.6 : opts.glow;
  const reduced = !!opts.reduced;
  let calm = !!opts.calm;

  let W = 10;
  let H = 10;
  let target = 0;
  let prog = 0;
  let ptx = 0;
  let pty = 0;
  let sptx = 0;
  let spty = 0;
  let hx: number | null = null;
  let hy = 0;
  let shx = -999;
  let shy = -999;
  let hA = 0;
  let raf = 0;
  let dead = false;
  let lastT = performance.now();
  let ema = 9;
  let stride = 1;
  const t0 = performance.now();

  // ---------- surfaces ----------
  function P(s: Surface, a: number, b: number, A: number): Vec3 {
    switch (s) {
      case 'top': return [a, BT, b];
      case 'key': return [a, BT + 0.015, b];
      case 'pad': return [a, BT + 0.006, b];
      case 'front': return [a, b, BZF];
      case 'back': return [a, b, BZB];
      case 'right': return [BX, a, b];
      case 'left': return [-BX, a, b];
      case 'lidF':
      case 'screen': {
        const o = s === 'screen' ? 0.031 : 0.036;
        const sn = Math.sin(A);
        const cs = Math.cos(A);
        return [a, BT + b * sn + o * cs, BZB - b * cs + o * sn];
      }
      case 'lidB': {
        const o = -0.02;
        const sn = Math.sin(A);
        const cs = Math.cos(A);
        return [a, BT + b * sn + o * cs, BZB - b * cs + o * sn];
      }
    }
  }

  function N(s: Surface, A: number): Vec3 {
    switch (s) {
      case 'top':
      case 'key':
      case 'pad': return [0, 1, 0];
      case 'front': return [0, 0, 1];
      case 'back': return [0, 0, -1];
      case 'right': return [1, 0, 0];
      case 'left': return [-1, 0, 0];
      case 'lidF':
      case 'screen': return [0, Math.cos(A), Math.sin(A)];
      case 'lidB': return [0, -Math.cos(A), -Math.sin(A)];
    }
  }

  const inScreen = (a: number, b: number): boolean => (
    a > SCR.x0 && a < SCR.x1 && b > SCR.u0 && b < SCR.u1
  );

  // ---------- build model ----------
  let patches: Patch[] = [];
  let points: SurfacePoint[] = [];
  let scanMin = 0;
  let scanMax = 0;

  function build(): void {
    patches = [];
    points = [];
    const r = rng(77);
    const grid = (
      s: Surface,
      a0: number,
      a1: number,
      b0: number,
      b1: number,
      na: number,
      nb: number,
      kind: string,
    ): void => {
      for (let i = 0; i < na; i++) {
        for (let j = 0; j < nb; j++) {
          const pa0 = a0 + (a1 - a0) * i / na;
          const pa1 = a0 + (a1 - a0) * (i + 1) / na;
          const pb0 = b0 + (b1 - b0) * j / nb;
          const pb1 = b0 + (b1 - b0) * (j + 1) / nb;
          let k = kind;
          if (s === 'lidF') {
            const ca = (pa0 + pa1) / 2;
            const cb = (pb0 + pb1) / 2;
            k = inScreen(ca, cb) ? 'screen' : 'bezel';
          }
          patches.push({
            s: k === 'screen' ? 'screen' : s,
            kind: k,
            a0: pa0,
            a1: pa1,
            b0: pb0,
            b1: pb1,
            r: r(),
            su: ((pa0 + pa1) / 2 - SCR.x0) / (SCR.x1 - SCR.x0),
            sv: ((pb0 + pb1) / 2 - SCR.u0) / (SCR.u1 - SCR.u0),
          });
        }
      }
    };

    grid('top', -BX, BX, BZB, BZF, 12, 7, 'top');
    grid('front', -BX, BX, 0, BT, 10, 1, 'front');
    grid('back', -BX, BX, 0, BT, 5, 1, 'back');
    grid('right', 0, BT, BZB, BZF, 1, 3, 'side');
    grid('left', 0, BT, BZB, BZF, 1, 3, 'side');
    grid('lidF', -BX, BX, 0, LIDL, 14, 9, 'bezel');
    grid('lidB', -BX, BX, 0, LIDL, 7, 4, 'lidB');

    // Keyboard keys
    const KX0 = -1.38;
    const KX1 = 1.38;
    const KZ0 = -0.86;
    const KZ1 = -0.08;
    const cols = 13;
    const rows = 5;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const cw = (KX1 - KX0) / cols;
        const ch = (KZ1 - KZ0) / rows;
        const x0 = KX0 + i * cw + cw * 0.09;
        const x1 = KX0 + (i + 1) * cw - cw * 0.09;
        const z0 = KZ0 + j * ch + ch * 0.12;
        const z1 = KZ0 + (j + 1) * ch - ch * 0.12;
        patches.push({
          s: 'key',
          kind: 'key',
          a0: x0,
          a1: x1,
          b0: z0,
          b1: z1,
          r: r(),
          su: 0,
          sv: 0,
        });
      }
    }
    patches.push({
      s: 'pad',
      kind: 'pad',
      a0: -0.44,
      a1: 0.44,
      b0: 0.14,
      b1: 0.84,
      r: r(),
      su: 0,
      sv: 0,
    });

    // ---- point cloud ----
    const pr = rng(1234);
    const sample = (
      s: Surface,
      a0: number,
      a1: number,
      b0: number,
      b1: number,
      na: number,
      nb: number,
    ): void => {
      const ca = Math.max(2, Math.round(na * Math.sqrt(density)));
      const cb = Math.max(2, Math.round(nb * Math.sqrt(density)));
      for (let i = 0; i < ca; i++) {
        for (let j = 0; j < cb; j++) {
          const a = a0 + (a1 - a0) * ((i + 0.5 + (pr() - 0.5) * 0.8) / ca);
          const b = b0 + (b1 - b0) * ((j + 0.5 + (pr() - 0.5) * 0.8) / cb);
          const part = pr() < 0.16;
          // Drift direction: toward screen centre + up + jitter
          let dx = -a * 0.25 + (pr() - 0.5) * 0.9;
          let dy = 0.55 + pr() * 0.7;
          let dz = -0.4 + (pr() - 0.5) * 0.6;
          const dn = Math.hypot(dx, dy, dz);
          points.push({
            s,
            a,
            b,
            scr: s === 'lidF' && inScreen(a, b),
            r: pr(),
            r2: pr(),
            acc: pr() < 0.07,
            part,
            amp: 0.5 + pr() * 1.2,
            dx: dx / dn,
            dy: dy / dn,
            dz: dz / dn,
            frag: null,
          });
        }
      }
    };

    sample('top', -BX, BX, BZB, BZF, 30, 16);
    sample('lidF', -BX, BX, 0, LIDL, 30, 18);
    sample('front', -BX, BX, 0, BT, 24, 2);
    sample('lidB', -BX, BX, 0, LIDL, 15, 8);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        points.push({
          s: 'key',
          a: KX0 + (i + 0.5) * (KX1 - KX0) / cols,
          b: KZ0 + (j + 0.5) * (KZ1 - KZ0) / rows,
          scr: false,
          r: pr(),
          r2: pr(),
          acc: pr() < 0.05,
          part: pr() < 0.3,
          amp: 0.6 + pr(),
          dx: pr() - 0.5,
          dy: 0.8,
          dz: -0.5,
          frag: null,
        });
      }
    }

    // Semantic fragments on a few particles (rare, per spec)
    let fi = 0;
    for (let i = 40; i < points.length && fi < FRAGS.length; i += 197) {
      if (points[i].part) {
        points[i].frag = FRAGS[fi++];
      }
    }

    // Scan extent
    scanMin = 1e9;
    scanMax = -1e9;
    const A0 = 1.2;
    for (const pt of points) {
      const m = P(pt.s, pt.a, pt.b, A0);
      const d = m[0] * SD.x + m[1] * SD.y + m[2] * SD.z;
      if (d < scanMin) scanMin = d;
      if (d > scanMax) scanMax = d;
    }
  }

  build();

  // ---------- sizing ----------
  let ro: ResizeObserver | null = null;

  function fit(): void {
    const host = canvas.parentElement || canvas;
    const w = host.clientWidth || 300;
    const h = host.clientHeight || 300;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    W = w;
    H = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduced) drawFrame(performance.now(), true);
  }

  if (window.ResizeObserver) {
    ro = new ResizeObserver(fit);
    ro.observe(canvas.parentElement || canvas);
  }
  fit();

  // ---------- render ----------
  function drawFrame(now: number, force: boolean): void {
    const dt = Math.min(64, now - lastT);
    lastT = now;
    ema = ema * 0.92 + dt * 0.08;
    stride = ema > 36 ? 3 : ema > 25 ? 2 : 1;
    prog += (target - prog) * (force ? 1 : 0.17);
    const p = clamp(prog, 0, 1);
    const time = (now - t0) / 1000;
    const amb = reduced ? 0 : (calm ? 0.45 : 1);
    sptx += (ptx - sptx) * 0.06;
    spty += (pty - spty) * 0.06;

    // Hover reveal: local ASCII bubble around the pointer, fades as the scroll scan takes over
    const hT = (hx != null && !reduced) ? 1 : 0;
    hA += (hT - hA) * 0.1;
    if (hx != null) {
      shx += (hx - shx) * 0.22;
      shy += (hy - shy) * 0.22;
    }
    const hR = Math.min(W, H) * 0.17;
    const hK = hA * (1 - S(p, 0.18, 0.5));
    const hov = (sx2: number, sy2: number): number => {
      if (hK < 0.01) return 0;
      return hK * S(1 - Math.hypot(sx2 - shx, sy2 - shy) / hR, 0, 1);
    };

    const A = 1.13 + 0.36 * S(p, 0.5, 0.95);
    const mix = 0.40 + 0.26 * S(p, 0, 0.55) + 0.30 * S(p, 0.55, 0.92);
    const yaw = -0.55 + 0.40 * S(p, 0, 0.8) + Math.sin(time * 0.45) * 0.022 * amb + sptx * 0.06 * (1 - p);
    const pit = 0.13 - 0.05 * S(p, 0, 0.8) + Math.sin(time * 0.31) * 0.008 * amb - spty * 0.045 * (1 - p);
    const fy = Math.sin(time * 0.7) * 0.014 * amb * (1 - 0.7 * p);
    const zoom = 1 + 0.30 * S(p, 0.35, 0.8) + 2.6 * S(p, 0.85, 1);
    const fitK = clamp(W / 1100, 0.84, 1);
    const unit = Math.min(W * 0.205, H * 0.335) * zoom * fitK;
    const cx0 = W * (0.54 - 0.22 * S(p, 0.3, 0.78));
    const cy0 = H * 0.54;
    const F = 5.2;
    const MCY = 0.92;
    const MCZ = 0.08;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const cosP = Math.cos(pit);
    const sinP = Math.sin(pit);

    const proj = (px: number, py: number, pz: number): Projection => {
      const x0 = px;
      const y0 = py + fy - MCY;
      const z0 = pz - MCZ;
      const x1 = x0 * cosY + z0 * sinY;
      const z1 = -x0 * sinY + z0 * cosY;
      const y2 = y0 * cosP - z1 * sinP;
      const z2 = y0 * sinP + z1 * cosP;
      const s = F / (F - z2);
      return [cx0 + x1 * unit * s, cy0 - y2 * unit * s, s, z2];
    };

    const rotN = (n: Vec3): Vec3 => {
      const nx1 = n[0] * cosY + n[2] * sinY;
      const nz1 = -n[0] * sinY + n[2] * cosY;
      const ny2 = n[1] * cosP - nz1 * sinP;
      const nz2 = n[1] * sinP + nz1 * cosP;
      return [nx1, ny2, nz2];
    };

    // Portal offset: pull the screen centre toward a fixed focal point late in the scroll
    let OX = 0;
    let OY = 0;
    const pk = S(p, 0.85, 0.985);
    if (pk > 0) {
      const sc = P('screen', 0, LIDL * 0.55, A);
      const sp2 = proj(sc[0], sc[1], sc[2]);
      OX = (W * 0.42 - sp2[0]) * pk;
      OY = (H * 0.5 - sp2[1]) * pk;
    }

    ctx.clearRect(0, 0, W, H);

    // Rim / ambient glow
    const ga = 0.10 + glow * 0.12 + 0.16 * S(p, 0.5, 1);
    const g0 = ctx.createRadialGradient(
      cx0 + OX,
      cy0 + OY - unit * 0.2,
      unit * 0.1,
      cx0 + OX,
      cy0 + OY,
      unit * 2.4,
    );
    g0.addColorStop(0, `rgba(0,150,230,${ga})`);
    g0.addColorStop(1, 'rgba(0,150,230,0)');
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, W, H);

    const scan = scanMax + 0.45 - mix * (scanMax - scanMin + 0.9);
    const portalFade = 1 - 0.92 * S(p, 0.86, 1);
    const scrB = 0.30 + 0.85 * S(p, 0.4, 0.96);

    // ---- solid patches ----
    const list: SolidPatch[] = [];
    for (const pc of patches) {
      const c00 = P(pc.s, pc.a0, pc.b0, A);
      const c10 = P(pc.s, pc.a1, pc.b0, A);
      const c11 = P(pc.s, pc.a1, pc.b1, A);
      const c01 = P(pc.s, pc.a0, pc.b1, A);
      const cx = (c00[0] + c11[0]) / 2;
      const cy = (c00[1] + c11[1]) / 2;
      const cz = (c00[2] + c11[2]) / 2;
      const d = cx * SD.x + cy * SD.y + cz * SD.z + (pc.r - 0.5) * 0.18;
      const gg = S((d - scan) / 0.55 + 0.5, 0, 1);
      let alpha = (1 - gg) * (pc.kind === 'screen' ? 1 : portalFade);
      if (alpha < 0.03) continue;
      const n = rotN(N(pc.s, A));
      if (n[2] <= 0.02) continue;
      const q0 = proj(...c00);
      const q1 = proj(...c10);
      const q2 = proj(...c11);
      const q3 = proj(...c01);
      const l = Math.max(0, n[0] * LGT[0] + n[1] * LGT[1] + n[2] * LGT[2]);
      const fres = Math.pow(1 - Math.min(1, n[2]), 2);
      let cr: number;
      let cg: number;
      let cb: number;
      if (pc.kind === 'screen') {
        const e = Math.exp(-(Math.pow(pc.su - 0.5, 2) * 2.6 + Math.pow(pc.sv - 0.45, 2) * 3.2));
        const fl = 0.97 + 0.03 * Math.sin(time * 2.7 + pc.su * 9);
        cr = 8 + (12 + 130 * e) * scrB * fl;
        cg = 16 + (44 + 165 * e) * scrB * fl;
        cb = 30 + (86 + 200 * e) * scrB * fl;
      } else {
        let base: Vec3;
        switch (pc.kind) {
          case 'top': base = [30, 38, 54]; break;
          case 'front': base = [20, 27, 40]; break;
          case 'back': base = [18, 24, 36]; break;
          case 'side': base = [24, 31, 46]; break;
          case 'bezel': base = [13, 18, 30]; break;
          case 'lidB': base = [21, 28, 43]; break;
          case 'key': base = [16 + pc.r * 5, 22 + pc.r * 5, 34 + pc.r * 6]; break;
          case 'pad': base = [36, 45, 64]; break;
          default: base = [24, 30, 44];
        }
        const sh = 0.42 + 0.72 * l;
        cr = base[0] * sh + fres * 9;
        cg = base[1] * sh + fres * 26;
        cb = base[2] * sh + fres * 48;
        const eg = Math.max(0, 1 - Math.abs(d - scan) / 0.4);
        cr += 18 * eg;
        cg += 70 * eg;
        cb += 120 * eg;
      }
      const hk = pc.kind === 'screen' ? 0 : hov(
        (q0[0] + q2[0]) / 2 + OX,
        (q0[1] + q2[1]) / 2 + OY,
      );
      if (hk > 0.01) {
        alpha *= 1 - 0.88 * hk;
        if (alpha < 0.03) continue;
      }
      const bias = pc.kind === 'key' || pc.kind === 'pad' || pc.kind === 'screen'
        ? 0.02
        : (pc.kind === 'bezel' ? 0.01 : 0);
      list.push({
        z: (q0[3] + q2[3]) / 2 + bias,
        q0,
        q1,
        q2,
        q3,
        f: `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha.toFixed(3)})`,
      });
    }
    list.sort((a, b) => a.z - b.z);
    for (const it of list) {
      ctx.fillStyle = it.f;
      ctx.beginPath();
      ctx.moveTo(it.q0[0] + OX, it.q0[1] + OY);
      ctx.lineTo(it.q1[0] + OX, it.q1[1] + OY);
      ctx.lineTo(it.q2[0] + OX, it.q2[1] + OY);
      ctx.lineTo(it.q3[0] + OX, it.q3[1] + OY);
      ctx.closePath();
      ctx.fill();
    }

    // ---- ASCII glyph layer ----
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const buckets = new Map<number, Array<number | string>>();
    const frags: FragmentGlyph[] = [];
    const glyphFade = 1 - S(p, 0.9, 1);
    for (let i = 0; i < points.length; i += stride) {
      const pt = points[i];
      const m = P(pt.s, pt.a, pt.b, A);
      const d = m[0] * SD.x + m[1] * SD.y + m[2] * SD.z + (pt.r - 0.5) * 0.30;
      const gg = S((d - scan) / 0.5 + 0.5, 0, 1);
      if (gg < 0.04 && hK < 0.01) continue;
      let alpha = gg;
      let mx = m[0];
      let my = m[1];
      let mz = m[2];
      if (pt.part && amb > 0) {
        const k = pt.amp * S(p, 0.32, 0.9) * (calm ? 0.35 : 0.8);
        if (k > 0.002) {
          mx += pt.dx * k + Math.sin(time * 0.8 + pt.r * 40) * 0.06 * k;
          my += pt.dy * k + Math.cos(time * 0.6 + pt.r * 31) * 0.05 * k;
          mz += pt.dz * k;
          alpha *= 1 - 0.7 * S(k / pt.amp, 0.5, 0.85);
        }
      }
      if (!pt.scr) alpha *= glyphFade;
      const n = rotN(N(pt.s, A));
      const l = Math.max(0.05, n[0] * LGT[0] + n[1] * LGT[1] + n[2] * LGT[2]);
      const q = proj(mx, my, mz);
      const sx = q[0] + OX;
      const sy = q[1] + OY;
      if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
      if (hK >= 0.01 && !pt.scr) {
        alpha = Math.max(alpha, hov(sx, sy) * (0.35 + 0.65 * l));
      }
      if (alpha < 0.035) continue;
      if (pt.frag) {
        const k2 = pt.amp * S(p, 0.32, 0.9);
        if (k2 > 0.25) {
          frags.push({ x: sx, y: sy, t: pt.frag, a: Math.min(0.85, alpha) });
        }
        continue;
      }
      const size = clamp(0.062 * unit * q[2], 6, 22) | 0;
      const gi = clamp(
        Math.round((0.12 + l * 0.9 + (pt.r2 - 0.5) * 0.25) * (GLYPHS.length - 1)),
        0,
        GLYPHS.length - 1,
      );
      let fill: string;
      const aa = alpha.toFixed(3);
      if (pt.scr) {
        fill = `rgba(111,210,255,${aa})`;
      } else if (pt.acc) {
        fill = `rgba(70,190,255,${aa})`;
      } else {
        const cr = 145 + 90 * l;
        const cg = 178 + 68 * l;
        const cb = 212 + 43 * l;
        fill = `rgba(${cr | 0},${cg | 0},${cb | 0},${aa})`;
      }
      let arr = buckets.get(size);
      if (!arr) {
        arr = [];
        buckets.set(size, arr);
      }
      arr.push(sx, sy, GLYPHS[gi], fill);
    }
    for (const [size, arr] of buckets) {
      ctx.font = `${size}px "JetBrains Mono", ui-monospace, monospace`;
      for (let i = 0; i < arr.length; i += 4) {
        ctx.fillStyle = arr[i + 3] as string;
        ctx.fillText(arr[i + 2] as string, arr[i] as number, arr[i + 1] as number);
      }
    }
    if (frags.length) {
      ctx.font = '500 12px "JetBrains Mono", ui-monospace, monospace';
      for (const f of frags) {
        ctx.fillStyle = `rgba(70,190,255,${f.a.toFixed(3)})`;
        ctx.fillText(f.t, f.x, f.y);
      }
    }

    // Fade out toward the canvas edges so clipping is never a hard seam
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const eg = ctx.createLinearGradient(0, 0, W * 0.18, 0);
    eg.addColorStop(0, 'rgba(0,0,0,1)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, W * 0.18, H);
    const rg = ctx.createLinearGradient(W - W * 0.09, 0, W, 0);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = rg;
    ctx.fillRect(W - W * 0.09, 0, W * 0.09, H);
    const bg = ctx.createLinearGradient(0, H - H * 0.10, 0, H);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, H - H * 0.10, W, H * 0.10);
    ctx.restore();
  }

  function loop(now: number): void {
    if (dead) return;
    drawFrame(now, false);
    raf = requestAnimationFrame(loop);
  }

  if (!reduced) {
    raf = requestAnimationFrame(loop);
  } else {
    target = 0.22;
    drawFrame(performance.now(), true);
  }

  return {
    setProgress(p: number): void {
      target = clamp(p, 0, 1);
      if (reduced) return; // Stays static under reduced motion
    },
    setPointer(nx: number, ny: number): void {
      ptx = clamp(nx, -1, 1);
      pty = clamp(ny, -1, 1);
    },
    setPointerPx(x: number | null, y?: number): void {
      if (x == null) {
        hx = null;
      } else {
        if (shx < -900) {
          shx = x;
          shy = y as number;
        }
        hx = x;
        hy = y as number;
      }
    },
    setGlow(g: number): void {
      glow = clamp(g, 0, 1);
    },
    setDensity(d: number): void {
      density = clamp(d, 0.4, 2);
      build();
    },
    setCalm(c: boolean): void {
      calm = !!c;
    },
    pause(): void {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    resume(): void {
      if (!raf && !dead && !reduced) {
        raf = requestAnimationFrame(loop);
      }
    },
    destroy(): void {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    },
  };
}
