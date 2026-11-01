import * as THREE from "three";
import { CORE, EXTRACTION, OBSTACLES, RELAYS, VENTS } from "./map";
import { COLORS, type Input, type World } from "./types";

interface Rig {
  group: THREE.Group;
  legs: THREE.Object3D[];
  flash: THREE.Mesh;
  body: THREE.Mesh;
  target: THREE.Vector3;
}
const v3 = new THREE.Vector3();
export class Battlefield {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(44, 1, 0.1, 140);
  private clock = 0;
  private follow = new THREE.Vector3(-3, 0, 0);
  private actors = new Map<string, Rig>();
  private enemies = new Map<number, THREE.Group>();
  private bullets = new Map<number, THREE.Mesh>();
  private particles = new Map<number, THREE.Group>();
  private terminals: THREE.Group[] = [];
  private medkits: THREE.Group[] = [];
  private labels: THREE.Sprite[] = [];
  private materials = new Map<string, THREE.Material>();
  private door = new THREE.Group();
  private core = new THREE.Group();
  private exfil = new THREE.Group();
  private reticle: THREE.Mesh;
  private observer: ResizeObserver;
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.05);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private aimTarget = new THREE.Vector3();
  private mobile = matchMedia("(pointer: coarse)").matches;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  private bulletGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.85, 6);
  private particleGeometry = new THREE.IcosahedronGeometry(0.11, 0);
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.mobile,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio || 1, this.mobile ? 1.3 : 1.75),
    );
    this.renderer.shadowMap.enabled = !this.mobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene.background = new THREE.Color("#0a111e");
    this.scene.fog = new THREE.FogExp2("#111c2b", 0.014);
    this.scene.add(new THREE.HemisphereLight("#b5caed", "#151b2b", 1.35));
    const sun = new THREE.DirectionalLight("#ffe7b9", 3.2);
    sun.position.set(-12, 28, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -32;
    sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    sun.shadow.camera.far = 75;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    const cold = new THREE.PointLight("#62a7e0", 42, 40, 2);
    cold.position.set(-15, 9, 5);
    this.scene.add(cold);
    const gold = new THREE.PointLight("#ffc164", 65, 24, 2);
    gold.position.set(0, 5, -13);
    this.scene.add(gold);
    const purple = new THREE.PointLight("#8a6ce0", 35, 30, 2);
    purple.position.set(18, 7, -8);
    this.scene.add(purple);
    this.buildLevel();
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.3, 24),
      new THREE.MeshBasicMaterial({
        color: "#a9ffe8",
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.position.y = 0.06;
    this.scene.add(this.reticle);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  private material(color: string, emissive = false, metal = 0.35) {
    const key = color + emissive + metal;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: emissive ? 0.35 : 0.65,
          metalness: metal,
          emissive: emissive ? color : "#000000",
          emissiveIntensity: emissive ? 2 : 0,
        }),
      );
    return this.materials.get(key)!;
  }
  private box(
    w: number,
    h: number,
    d: number,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = this.scene,
    glow = false,
  ) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, this.material(color, glow));
    mesh.position.set(x, y, z);
    mesh.castShadow = !glow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private cylinder(
    r: number,
    h: number,
    color: string,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const geometry = new THREE.CylinderGeometry(r, r, h, 12);
    const mesh = new THREE.Mesh(geometry, this.material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private ring(
    radius: number,
    width: number,
    color: string,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const geometry = new THREE.RingGeometry(radius - width, radius, 64);
    const mesh = new THREE.Mesh(geometry, this.material(color, true));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  private label(text: string, color = "#c8bd9b", width = 3): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#111c2ddd";
    ctx.fillRect(0, 8, 512, 80);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 10, 508, 76);
    ctx.fillStyle = color;
    ctx.font = "700 34px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 49);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      }),
    );
    sprite.scale.set(width, (width * 96) / 512, 1);
    this.labels.push(sprite);
    return sprite;
  }
  private buildLevel() {
    this.box(51, 0.7, 41, "#263244", 0, -0.5, 0);
    this.box(50, 0.12, 40, "#293b4c", 0, -0.1, 0);
    const tileGeo = new THREE.BoxGeometry(1.97, 0.03, 1.97),
      tileMat = this.material("#304351");
    const tiles = new THREE.InstancedMesh(tileGeo, tileMat, 250);
    const matrix = new THREE.Matrix4();
    let k = 0;
    for (let x = 0; x < 25; x++)
      for (let z = 0; z < 20; z++)
        if ((x + z) % 2 === 0) {
          matrix.makeTranslation(-24 + x * 2, 0.01, -19 + z * 2);
          tiles.setMatrixAt(k++, matrix);
        }
    tiles.receiveShadow = true;
    this.scene.add(tiles);
    this.box(51, 3.2, 0.8, "#1b293b", 0, 1.4, -20.4);
    this.box(0.8, 2.4, 40, "#1c2b3e", -25.4, 1, 0);
    this.box(0.8, 2.4, 40, "#1c2b3e", 25.4, 1, 0);
    this.box(51, 0.55, 0.8, "#1c2938", 0, 0, 20.4);
    for (const x of [-24.8, 24.8]) {
      this.box(0.06, 0.1, 39, "#5a9ca8", x, 0.15, 0, this.scene, true);
      for (let z = -18; z <= 18; z += 6) {
        this.box(0.65, 3.6, 0.8, "#293951", x, 1.5, z);
        this.box(
          0.08,
          1.6,
          0.12,
          "#c4a264",
          x - (x > 0 ? 0.38 : -0.38),
          1.5,
          z,
          this.scene,
          true,
        );
      }
    }
    this.box(49, 0.06, 0.05, "#82734a", 0, 0.04, -19.5, this.scene, true);
    for (const o of OBSTACLES) {
      if (o.kind === "door") continue;
      const g = new THREE.Group();
      g.position.set(o.x, 0, o.z);
      this.scene.add(g);
      this.box(
        o.w,
        o.h,
        o.d,
        o.kind === "crate" ? "#364b5b" : "#24384c",
        0,
        o.h / 2,
        0,
        g,
      );
      if (o.kind === "crate") {
        this.box(o.w + 0.08, 0.13, o.d + 0.08, "#4c6572", 0, o.h, 0, g);
        for (const x of [-o.w * 0.31, o.w * 0.31]) {
          this.box(0.13, o.h + 0.13, o.d + 0.11, "#b69b5b", x, o.h / 2, 0, g);
        }
        this.box(
          o.w * 0.5,
          0.23,
          0.07,
          "#1a2b38",
          0,
          o.h * 0.55,
          o.d / 2 + 0.04,
          g,
        );
        this.box(
          0.4,
          0.1,
          0.09,
          "#71b9c2",
          0,
          o.h * 0.55,
          o.d / 2 + 0.09,
          g,
          true,
        );
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(
            new THREE.BoxGeometry(o.w + 0.02, o.h + 0.02, o.d + 0.02),
          ),
          new THREE.LineBasicMaterial({ color: "#57727b" }),
        );
        edges.position.y = o.h / 2;
        g.add(edges);
      } else this.box(o.w + 0.06, 0.12, o.d + 0.06, "#53606e", 0, o.h, 0, g);
    }
    // Monumental vault and its hinged, animated door.
    this.box(2.7, 5.8, 1.2, "#324357", -4.8, 2.8, -9);
    this.box(2.7, 5.8, 1.2, "#324357", 4.8, 2.8, -9);
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(3.55, 0.36, 12, 64),
      this.material("#b39458"),
    );
    frame.position.set(0, 3.35, -8.9);
    frame.castShadow = true;
    this.scene.add(frame);
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(3.1, 0.1, 8, 64),
      this.material("#ecc87c", true),
    );
    inner.position.set(0, 3.35, -8.85);
    this.scene.add(inner);
    this.door.position.set(-3.3, 0, -8.75);
    this.scene.add(this.door);
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.6, 48),
      this.material("#66727b", false, 0.8),
    );
    plate.rotation.x = Math.PI / 2;
    plate.position.set(3.3, 3.35, 0);
    plate.castShadow = true;
    this.door.add(plate);
    const doorRim = new THREE.Mesh(
      new THREE.TorusGeometry(2.82, 0.08, 8, 48),
      this.material("#bda066"),
    );
    doorRim.position.set(3.3, 3.35, 0.33);
    this.door.add(doorRim);
    const lock = this.cylinder(0.5, 0.3, "#c2a068", 3.3, 3.35, 0.5, this.door);
    lock.rotation.x = Math.PI / 2;
    for (let a = 0; a < 3; a++) {
      const arm = this.box(
        0.13,
        2.6,
        0.16,
        "#b3aa8b",
        3.3,
        3.35,
        0.7,
        this.door,
      );
      arm.rotation.z = (a * Math.PI) / 3;
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const bolt = this.cylinder(
        0.12,
        0.15,
        "#d1b47d",
        3.3 + Math.cos(a) * 2.9,
        3.35 + Math.sin(a) * 2.9,
        0.4,
        this.door,
      );
      bolt.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 7; i++)
      this.box(
        1.5,
        0.4,
        0.65,
        "#c3a14f",
        -3.5 + (i % 3) * 1.8,
        0.25 + Math.floor(i / 3) * 0.42,
        -18 + Math.floor(i / 3) * 0.75,
      );
    const vaultLabel = this.label("AEGIS // CORE VAULT", "#e0c682", 5);
    vaultLabel.position.set(0, 7.4, -9);
    this.scene.add(vaultLabel);
    RELAYS.forEach((p, i) => {
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z);
      this.scene.add(g);
      this.box(1.4, 0.3, 1.2, "#172b3b", 0, 0.15, 0, g);
      this.box(1.1, 1.35, 0.9, "#38536a", 0, 0.85, 0, g);
      this.box(0.8, 0.55, 0.06, "#102438", 0, 1.23, 0.48, g);
      this.box(0.6, 0.11, 0.08, "#f1aa65", 0, 1.25, 0.53, g, true);
      this.cylinder(0.16, 0.25, "#dbc686", 0, 1.7, 0, g);
      this.ring(1.7, 0.05, "#b37b55", 0, 0.06, 0, g);
      const l = this.label("RELAY 0" + (i + 1), "#ecc888", 2.6);
      l.position.set(0, 2.4, 0);
      g.add(l);
      this.terminals.push(g);
    });
    this.core.position.set(CORE.x, 1.7, CORE.z);
    this.scene.add(this.core);
    const coreGeo = new THREE.OctahedronGeometry(0.65, 0);
    this.core.add(new THREE.Mesh(coreGeo, this.material("#ae8bf1", true)));
    const cage = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.87, 0),
      new THREE.MeshBasicMaterial({ color: "#f2d48a", wireframe: true }),
    );
    this.core.add(cage);
    this.cylinder(1.05, 1.2, "#43546a", CORE.x, 0.6, CORE.z);
    this.ring(1.15, 0.08, "#a289e9", CORE.x, 1.23, CORE.z);
    this.exfil.position.set(EXTRACTION.x, 0, EXTRACTION.z);
    this.scene.add(this.exfil);
    this.ring(2.7, 0.12, "#5ccca8", 0, 0.07, 0, this.exfil);
    this.ring(2.35, 0.035, "#79b5b0", 0, 0.075, 0, this.exfil);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.box(
        0.25,
        0.09,
        0.45,
        "#8cbf9c",
        Math.cos(a) * 2.85,
        0.06,
        Math.sin(a) * 2.85,
        this.exfil,
        true,
      );
    }
    const exit = this.label("EXTRACTION", "#9be4c0", 3);
    exit.position.set(0, 2.7, 0);
    this.exfil.add(exit);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 2.7, 5, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: "#78e7bf",
        transparent: true,
        opacity: 0.035,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.y = 2.5;
    this.exfil.add(beam);
    for (const p of [
      { x: -8, z: 14 },
      { x: 17, z: 0 },
      { x: -15, z: -16 },
    ]) {
      const g = new THREE.Group();
      g.position.set(p.x, 0.45, p.z);
      this.scene.add(g);
      this.box(0.65, 0.4, 0.65, "#d3e5dc", 0, 0, 0, g);
      this.box(0.16, 0.07, 0.45, "#71deab", 0, 0.24, 0, g, true);
      this.box(0.45, 0.07, 0.16, "#71deab", 0, 0.24, 0, g, true);
      this.medkits.push(g);
    }
    for (const p of VENTS) {
      this.box(2, 0.09, 1.7, "#142736", p.x, 0.04, p.z);
      for (let i = 0; i < 5; i++)
        this.box(0.14, 0.11, 1.55, "#42566a", p.x - 0.65 + i * 0.33, 0.1, p.z);
    }
    // Ground chevrons and lit conduits establish readable paths through the arena.
    for (let z = -16; z < 17; z += 4)
      this.box(0.07, 0.035, 1.7, "#789c9e", -8, 0.04, z);
    for (let x = -21; x < 22; x += 4)
      this.box(1.8, 0.035, 0.06, "#866f49", x, 0.04, 10);
    this.camera.position.set(21, 29, 30);
    this.camera.lookAt(0, 0, -2);
  }
  private operative(color: number): Rig {
    const g = new THREE.Group(),
      c = COLORS[color];
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.48, 4, 8),
      this.material("#1c2739").clone(),
    );
    body.position.y = 0.9;
    body.castShadow = true;
    g.add(body);
    this.box(0.52, 0.4, 0.28, c, 0, 1, 0.24, g);
    this.box(0.34, 0.08, 0.05, "#bceae3", 0, 1.11, 0.4, g, true);
    this.box(0.56, 0.12, 0.44, "#0d1929", 0, 0.59, 0, g);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 12, 8),
      this.material("#748c9b"),
    );
    head.scale.y = 1.05;
    head.position.y = 1.48;
    head.castShadow = true;
    g.add(head);
    this.box(0.49, 0.12, 0.24, "#102238", 0, 1.5, 0.18, g);
    this.box(0.38, 0.035, 0.05, c, 0, 1.51, 0.32, g, true);
    this.box(0.22, 0.4, 0.2, c, -0.44, 1.07, 0, g);
    this.box(0.22, 0.4, 0.2, c, 0.44, 1.07, 0, g);
    const legL = this.box(0.2, 0.52, 0.24, "#25384c", -0.2, 0.32, 0, g),
      legR = this.box(0.2, 0.52, 0.24, "#25384c", 0.2, 0.32, 0, g);
    this.box(0.25, 0.16, 0.38, "#132132", -0.2, 0.08, 0.08, g);
    this.box(0.25, 0.16, 0.38, "#132132", 0.2, 0.08, 0.08, g);
    this.box(0.18, 0.2, 0.7, "#8b9ba4", 0.3, 1.03, 0.62, g);
    this.box(0.12, 0.13, 0.4, "#202c3b", 0.3, 1.03, 1.06, g);
    this.box(0.05, 0.05, 0.25, c, 0.3, 1.13, 0.66, g, true);
    const flash = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      this.material("#ffe7a3", true),
    );
    flash.position.set(0.3, 1.03, 1.35);
    flash.visible = false;
    g.add(flash);
    this.ring(0.57, 0.035, c, 0, 0.035, 0, g);
    this.scene.add(g);
    return {
      group: g,
      body,
      legs: [legL, legR],
      flash,
      target: new THREE.Vector3(),
    };
  }
  private drone(heavy: boolean) {
    const g = new THREE.Group(),
      radius = heavy ? 0.62 : 0.44;
    const body = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 1),
      this.material(heavy ? "#70534a" : "#62586d"),
    );
    body.castShadow = true;
    g.add(body);
    this.box(
      radius * 1.3,
      0.14,
      0.12,
      "#ff765b",
      0,
      0.03,
      radius * 0.85,
      g,
      true,
    );
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        this.box(
          0.13,
          0.1,
          0.63,
          "#28394a",
          x * radius,
          0.05,
          z * radius * 0.5,
          g,
        );
        this.cylinder(0.26, 0.08, "#263e4c", x * radius, 0.07, z * radius, g);
        this.ring(0.24, 0.055, "#a78b7d", x * radius, 0.14, z * radius, g);
      }
    this.ring(radius * 1.05, 0.03, "#d47865", 0, -0.9, 0, g);
    this.scene.add(g);
    return g;
  }
  groundPoint(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      (-(clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = this.raycaster.ray.intersectPlane(this.plane, v3);
    return p ? { x: p.x, z: p.z } : null;
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth,
      h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  private removeRig(group: THREE.Group) {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.scene.remove(group);
  }
  render(
    w: World,
    selfId: string,
    dt: number,
    active: boolean,
    input: Input | null,
    guest = false,
  ) {
    this.clock += dt;
    const t = this.clock,
      self = w.players.find((p) => p.id === selfId) ?? w.players[0];
    if (active && self) {
      this.follow.lerp(
        new THREE.Vector3(self.x, 0, self.z),
        1 - Math.exp(-dt * 7),
      );
      this.camera.position.copy(this.follow).add(new THREE.Vector3(16, 26, 21));
      this.camera.lookAt(this.follow.x, 0, this.follow.z - 1.4);
    } else {
      const a = this.reducedMotion ? 0 : t * 0.025;
      this.camera.position.set(
        Math.sin(a + 0.43) * 38,
        30,
        Math.cos(a + 0.43) * 31,
      );
      this.camera.lookAt(0, 0.2, -3);
    }
    const ids = new Set(w.players.map((p) => p.id));
    for (const [id, rig] of this.actors)
      if (!ids.has(id)) {
        (rig.body.material as THREE.Material).dispose();
        this.removeRig(rig.group);
        this.actors.delete(id);
      }
    for (const p of w.players) {
      let rig = this.actors.get(p.id);
      if (!rig) {
        rig = this.operative(p.color);
        rig.group.position.set(p.x, 0, p.z);
        this.actors.set(p.id, rig);
      }
      let tx = p.x,
        tz = p.z;
      if (guest && p.id === selfId && input && p.health > 0) {
        tx += input.mx * 0.45;
        tz += input.mz * 0.45;
      }
      rig.target.set(
        tx,
        p.health > 0 ? Math.abs(Math.sin(t * 14)) * 0.04 * p.moving : 0,
        tz,
      );
      rig.group.position.lerp(
        rig.target,
        1 - Math.exp(-dt * (guest ? 16 : 30)),
      );
      rig.group.rotation.y =
        p.id === selfId && input ? Math.atan2(input.ax, input.az) : p.angle;
      rig.group.rotation.z = p.health > 0 ? 0 : Math.PI / 2;
      rig.legs[0].rotation.x = Math.sin(t * 14) * p.moving * 0.6;
      rig.legs[1].rotation.x = -Math.sin(t * 14) * p.moving * 0.6;
      rig.flash.visible = p.fire > 0.09 && p.health > 0;
      rig.flash.rotation.z = t * 31;
      (rig.body.material as THREE.MeshStandardMaterial).emissive.set(
        p.hurt > 4.3 ? "#8b3524" : "#000000",
      );
      rig.group.visible = active || p.id === w.players[0].id;
    }
    const enemies = new Set(w.enemies.map((e) => e.id));
    for (const [id, g] of this.enemies)
      if (!enemies.has(id)) {
        this.removeRig(g);
        this.enemies.delete(id);
      }
    for (const e of w.enemies) {
      let g = this.enemies.get(e.id);
      if (!g) {
        g = this.drone(e.type === "heavy");
        g.position.set(e.x, 1.3, e.z);
        this.enemies.set(e.id, g);
      }
      g.position.lerp(
        new THREE.Vector3(e.x, 1.35 + Math.sin(t * 4 + e.id) * 0.1, e.z),
        1 - Math.exp(-dt * 16),
      );
      g.rotation.y = e.angle;
      g.rotation.z = Math.sin(t * 5 + e.id) * 0.04;
    }
    const bullets = new Set(w.bullets.map((b) => b.id));
    for (const [id, m] of this.bullets)
      if (!bullets.has(id)) {
        this.scene.remove(m);
        this.bullets.delete(id);
      }
    for (const b of w.bullets) {
      let mesh = this.bullets.get(b.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          this.bulletGeometry,
          this.material(b.enemy ? "#ff875f" : "#9aefe0", true),
        );
        this.scene.add(mesh);
        this.bullets.set(b.id, mesh);
      }
      mesh.position.set(b.x, b.enemy ? 1.3 : 1.06, b.z);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(b.vx, 0, b.vz).normalize(),
      );
    }
    this.door.rotation.y = THREE.MathUtils.lerp(
      this.door.rotation.y,
      w.relays.every((r) => r.done) ? -Math.PI * 0.76 : 0,
      1 - Math.exp(-dt * 2),
    );
    for (let i = 0; i < this.terminals.length; i++) {
      const g = this.terminals[i],
        r = w.relays[i];
      g.children[g.children.length - 1].visible = !r.done;
      const screen = g.children[3] as THREE.Mesh;
      screen.material = this.material(r.done ? "#65d5b1" : "#d2a365", true);
    }
    const carrier = w.players.find((p) => p.id === w.core.carrier);
    this.core.position.set(
      w.core.x,
      carrier ? 2.4 : 1.85 + Math.sin(t * 2) * 0.13,
      w.core.z,
    );
    this.core.rotation.y = t * 0.9;
    this.core.visible = w.relays.every((r) => r.done) || !active;
    this.core.scale.setScalar(carrier ? 0.7 : 1);
    this.exfil.rotation.y = 0;
    for (let i = 0; i < this.medkits.length; i++) {
      this.medkits[i].visible = w.pickups[i].active;
      this.medkits[i].rotation.y = t * 0.6;
      this.medkits[i].position.y = 0.5 + Math.sin(t * 3 + i) * 0.08;
    }
    const events = new Set(w.effects.map((e) => e.id));
    for (const [id, g] of this.particles)
      if (!events.has(id)) {
        this.scene.remove(g);
        this.particles.delete(id);
      }
    for (const e of w.effects) {
      let g = this.particles.get(e.id);
      if (!g) {
        g = new THREE.Group();
        g.position.set(e.x, 0.9, e.z);
        const count = e.kind === "explosion" ? 12 : 6;
        for (let i = 0; i < count; i++) {
          const m = new THREE.Mesh(
            this.particleGeometry,
            this.material(
              e.kind === "heal"
                ? "#76e2ba"
                : e.kind === "hack"
                  ? "#bc92ed"
                  : "#ffd17e",
              true,
            ),
          );
          m.userData.angle = (i / count) * Math.PI * 2;
          m.userData.height = ((i % 3) + 1) * 0.3;
          g.add(m);
        }
        this.particles.set(e.id, g);
        this.scene.add(g);
      }
      const age = w.time - e.t;
      for (const child of g.children) {
        const angle = child.userData.angle;
        child.position.set(
          Math.cos(angle) * age * 3,
          age * child.userData.height * 3 - age * age * 3,
          Math.sin(angle) * age * 3,
        );
        child.scale.setScalar(Math.max(0, 1 - age / 0.7));
      }
    }
    if (active && self && input && self.health > 0) {
      this.aimTarget.set(self.x + input.ax * 5, 0.045, self.z + input.az * 5);
      this.reticle.position.copy(this.aimTarget);
      this.reticle.visible = true;
    } else this.reticle.visible = false;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.observer.disconnect();
    this.renderer.setAnimationLoop(null);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
    this.bulletGeometry.dispose();
    this.particleGeometry.dispose();
    this.renderer.dispose();
  }
}
