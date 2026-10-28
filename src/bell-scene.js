import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Color, Vector2, Vector3,
  CatmullRomCurve3, LatheGeometry, TorusGeometry, CylinderGeometry, SphereGeometry, BoxGeometry, PlaneGeometry,
  MeshPhysicalMaterial, MeshBasicMaterial, ShaderMaterial, PMREMGenerator,
  BackSide, DoubleSide, ACESFilmicToneMapping, SRGBColorSpace
} from "three";

/* ------------------------------------------------------------------ */
/* Geometry and look (same model as the coin image)                   */
/* ------------------------------------------------------------------ */

function profilePoints() {
  const pts = [
    [0.000, 1.000], [0.100, 0.998], [0.190, 0.988], [0.255, 0.966], [0.300, 0.932],
    [0.326, 0.886], [0.336, 0.830], [0.338, 0.760], [0.342, 0.680], [0.352, 0.590],
    [0.372, 0.495], [0.405, 0.395], [0.452, 0.290], [0.512, 0.190], [0.572, 0.110],
    [0.622, 0.056], [0.660, 0.024], [0.684, 0.006], [0.690, -0.012], [0.680, -0.028],
    [0.655, -0.031], [0.628, -0.020], [0.600, 0.000], [0.555, 0.035], [0.500, 0.090],
    [0.445, 0.170], [0.398, 0.270], [0.360, 0.390], [0.334, 0.520], [0.320, 0.650],
    [0.314, 0.760], [0.300, 0.850], [0.260, 0.905], [0.170, 0.932], [0.000, 0.940]
  ];
  const curve = new CatmullRomCurve3(pts.map(([x, y]) => new Vector3(x, y, 0)), false, "centripetal");
  return curve.getPoints(300).map((p) => new Vector2(Math.max(0, p.x), p.y));
}

function buildEnv(renderer) {
  const env = new Scene();
  env.background = new Color(0x03080a);
  env.add(new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial({ color: 0x050d10, side: BackSide })));
  env.add(new Mesh(
    new SphereGeometry(9, 48, 24),
    new ShaderMaterial({
      side: BackSide, depthWrite: false,
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `varying vec3 vP;
        void main(){
          float y = vP.y;
          vec3 floorC = vec3(0.004, 0.012, 0.015) * 0.6;
          vec3 horizon = vec3(0.055, 0.13, 0.16) * 1.1;
          vec3 sky = vec3(0.62, 0.84, 0.93) * 1.25;
          vec3 c = mix(floorC, horizon, smoothstep(-0.55, 0.0, y));
          c = mix(c, sky, smoothstep(0.05, 0.95, y));
          gl_FragColor = vec4(c, 1.0);
        }`
    })
  ));
  const box = (w, h, color, k, pos) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(k), side: DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(7, 9, 0xbfe6f5, 3.2, [-6.5, 3, 4]);
  box(12, 1.6, 0xffffff, 5.0, [0, 9.5, 1]);
  box(1.4, 10, 0x52e0a6, 4.0, [7.5, 1, -3]);
  box(1.2, 8, 0x8fc6dc, 2.6, [-7, 0, -5]);
  box(9, 3, 0x9fd0e2, 0.9, [0, -8, 3]);
  box(3, 3, 0xffffff, 1.6, [3, 2, 9]);
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return tex;
}

/* ------------------------------------------------------------------ */
/* Physics                                                             */
/* ------------------------------------------------------------------ */

export const PHYS = {
  g: 9.0,          // bell pendulum stiffness (rad/s^2 per rad)
  damp: 0.5,
  idle: 0.05,      // gentle resonant sway when nothing happens
  g2: 22,          // clapper pendulum
  damp2: 0.5,
  rel: 0.18,       // clapper travel before it hits the sound bow
  restitution: 0.45,
  strikeMin: 0.3
};

export function stepPhysics(s, dt, t, P = PHYS) {
  const a = -P.g * Math.sin(s.th) - P.damp * s.om + P.idle * Math.sin(t * Math.sqrt(P.g));
  s.om += a * dt;
  s.th += s.om * dt;
  const a2 = -P.g2 * Math.sin(s.ph) - P.damp2 * s.phw;
  s.phw += a2 * dt;
  s.ph += s.phw * dt;
  let strike = 0;
  const rel = s.ph - s.th;
  if (Math.abs(rel) > P.rel) {
    const sgn = Math.sign(rel);
    s.ph = s.th + sgn * P.rel;
    const relV = s.phw - s.om;
    if (relV * sgn > 0) {
      strike = Math.abs(relV);
      s.phw = s.om - relV * P.restitution;
    }
  }
  return strike >= P.strikeMin ? strike : 0;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export function createBell(canvas, opts = {}) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    return null;
  }
  if (!renderer.getContext()) return null;

  const dpr = Math.min(2, opts.dpr || window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  scene.environment = buildEnv(renderer);

  const camera = new PerspectiveCamera(24, 1, 0.1, 100);
  camera.position.set(0, 0.95, 6.5);
  camera.lookAt(0, 0.5, 0);

  const mat = new MeshPhysicalMaterial({
    color: 0xb4e0f0, metalness: 0.75, roughness: 0.2, clearcoat: 1.0, clearcoatRoughness: 0.06,
    envMapIntensity: 1.15, side: DoubleSide
  });
  const darker = mat.clone();
  darker.color = new Color(0x6aa5bd);
  darker.roughness = 0.32;

  const PIVOT_Y = 1.14;
  const root = new Group();            // pointer tilt (yaw / pitch)
  scene.add(root);
  const pivot = new Group();           // bell swing
  pivot.position.y = PIVOT_Y;
  root.add(pivot);
  const bell = new Group();
  bell.position.y = -PIVOT_Y;
  pivot.add(bell);

  bell.add(new Mesh(new LatheGeometry(profilePoints(), 180), mat));
  const bead = new Mesh(new TorusGeometry(0.640, 0.0135, 20, 200), mat);
  bead.rotation.x = Math.PI / 2; bead.position.y = 0.04; bell.add(bead);
  for (const [y, r] of [[0.826, 0.338], [0.862, 0.333]]) {
    const band = new Mesh(new TorusGeometry(r, 0.0062, 12, 160), mat);
    band.rotation.x = Math.PI / 2; band.position.y = y; bell.add(band);
  }
  const cap = new Mesh(new CylinderGeometry(0.07, 0.11, 0.05, 48), mat);
  cap.position.y = 1.015; bell.add(cap);
  const loop = new Mesh(new TorusGeometry(0.085, 0.026, 24, 96), mat);
  loop.position.y = 1.115; loop.rotation.y = 0.9; bell.add(loop);

  const CLAP_Y = PIVOT_Y - 0.25;
  const clapper = new Group();
  clapper.position.y = CLAP_Y;
  root.add(clapper);
  const rod = new Mesh(new CylinderGeometry(0.014, 0.014, 1.0, 16), darker);
  rod.position.y = -0.5; clapper.add(rod);
  const ball = new Mesh(new SphereGeometry(0.088, 48, 32), mat);
  ball.position.y = -1.1; clapper.add(ball);

  const s = { th: opts.startAngle || 0, om: 0, ph: opts.startAngle || 0, phw: 0 };
  let pointer = { x: 0, y: 0 }, pointerS = { x: 0, y: 0 };
  let shine = 0;
  let active = true, raf = 0, last = performance.now(), t0 = last;
  let strikeCb = null;
  const still = !!opts.still;
  const mouth = new Vector3();

  function setSize(px) {
    renderer.setSize(px, px, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  }
  setSize(opts.size || 640);

  function frame() {
    raf = 0;
    // Use the real clock, never the rAF stamp: the first stamp can predate the scene build.
    const now = performance.now();
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
    last = now;
    const t = (now - t0) / 1000;
    if (!still) {
      // two half steps keep the clapper contact stable
      for (let i = 0; i < 2; i++) {
        const hit = stepPhysics(s, dt / 2, t);
        if (hit && strikeCb) strikeCb(hit);
        if (hit) shine = Math.min(1, shine + hit * 0.45);
      }
    }
    pointerS.x += (pointer.x - pointerS.x) * 0.06;
    pointerS.y += (pointer.y - pointerS.y) * 0.06;
    root.rotation.y = pointerS.x * 0.38;
    root.rotation.x = 0.08 + pointerS.y * 0.07;
    pivot.rotation.z = s.th;
    clapper.rotation.z = s.ph;
    shine *= 0.94;
    mat.envMapIntensity = 1.15 + shine * 0.7;
    renderer.render(scene, camera);
    if (active) raf = requestAnimationFrame(frame);
  }

  function setActive(on) {
    if (on === active) return;
    active = on;
    if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  raf = requestAnimationFrame(frame);

  return {
    setSize,
    setActive,
    setPointer(x, y) { pointer.x = x; pointer.y = y; },
    ring(power = 1) {
      // A push in the current swing direction (or to the right from rest).
      const dir = Math.abs(s.om) > 0.05 ? Math.sign(s.om) : 1;
      s.om += dir * 1.5 * power;
    },
    onStrike(cb) { strikeCb = cb; },
    mouth() {
      // Screen position (0..1) of the bell mouth, for ripples.
      mouth.set(0, 0.02, 0);
      bell.localToWorld(mouth);
      mouth.project(camera);
      return { x: (mouth.x + 1) / 2, y: (1 - mouth.y) / 2 };
    },
    renderOnce() { frame(); },
    get angle() { return s.th; }
  };
}
