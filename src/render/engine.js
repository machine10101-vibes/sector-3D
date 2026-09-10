import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { buildCityGroup, buildGround, pickBuildingAt } from "./city.js";

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class Viewport {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#9aa8b8");
    this.scene.fog = new THREE.Fog("#9aa8b8", 1800, 5200);

    this.persp = new THREE.PerspectiveCamera(42, 1, 0.1, 8000);
    this.persp.position.set(86, 92, 110);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 8000);
    this.camera = this.persp;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setClearColor("#9aa8b8", 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.499;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 2400;
    this.controls.target.set(0, 8, 0);
    this.controls.autoRotateSpeed = 0.55;
    if (window.matchMedia("(pointer: coarse)").matches) {
      this.controls.rotateSpeed = 0.68;
      this.controls.zoomSpeed = 0.85;
      this.controls.touches.ONE = THREE.TOUCH.ROTATE;
      this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    }

    this.scene.add(new THREE.HemisphereLight(0xd7e4f2, 0x4a463c, 1.15));
    this._sun = new THREE.DirectionalLight(0xfff2d8, 1.85);
    this._sun.position.set(-80, 140, -60);
    this._sun.castShadow = true;
    this._sun.shadow.mapSize.set(2048, 2048);
    this._sun.shadow.bias = -0.0007;
    this._sun.shadow.normalBias = 0.045;
    this._sun.shadow.camera.near = 1;
    this._sun.shadow.camera.far = 4000;
    this.scene.add(this._sun);
    this.scene.add(this._sun.target);
    this._fill = new THREE.DirectionalLight(0x8fb4d4, 0.28);
    this._fill.position.set(70, 40, 50);
    this.scene.add(this._fill);
    this._sky = this._makeSky();
    this.scene.add(this._sky);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.composer = null;
    this.bloomPass = null;
    this._renderPass = null;
    this.useBloom = false;
    this._running = true;
    this._clock = new THREE.Clock();
    this._softwareGL = this._detectSoftwareGL();
    this._camAnim = null;
    this._pickables = [];
    this._hover = null;
    this._selected = null;
    this._onPick = null;
    this._scan = null;
    this._viewKind = "iso";
    this._span = 200;

    this._ndc = new THREE.Vector2();
    this.renderer.domElement.addEventListener("pointermove", (e) => this._onPointer(e, false));
    this.renderer.domElement.addEventListener("click", (e) => this._onPointer(e, true));

    this._onResize = () => this.resize();
    window.addEventListener("resize", this._onResize);
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    if (this._softwareGL) {
      this.useBloom = false;
      this.renderer.shadowMap.enabled = false;
      this._sun.castShadow = false;
    }
    this.resize();
    if (!this._softwareGL) this._buildComposer();
    else this.useBloom = false;
    this._loop();
  }

  set onPick(fn) {
    this._onPick = fn;
  }

  get autoRotate() {
    return this.controls.autoRotate;
  }

  set autoRotate(v) {
    this.controls.autoRotate = !!v;
  }

  _detectSoftwareGL() {
    try {
      const gl = this.renderer.getContext();
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
      return /llvmpipe|swiftshader|softpipe|microsoft basic/i.test(name);
    } catch {
      return false;
    }
  }

  _makeSky() {
    const geo = new THREE.SphereGeometry(4200, 32, 16);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const zenith = new THREE.Color("#8ea9c4");
    const horizon = new THREE.Color("#d7cbb8");
    const nadir = new THREE.Color("#1c2228");
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 4200;
      if (y >= 0) tmp.copy(horizon).lerp(zenith, Math.pow(y, 0.65));
      else tmp.copy(horizon).lerp(nadir, Math.min(1, -y * 1.4));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
  }

  _fitSun(span, style) {
    const photo = style !== "hologram";
    this._sun.position.set(-span * 0.52, span * 0.9, -span * 0.38);
    this._sun.target.position.set(0, 0, 0);
    this._sun.intensity = photo ? 1.85 : 1.15;
    this._fill.intensity = photo ? 0.4 : 0.18;
    this._sun.castShadow = photo && !this._softwareGL && this.renderer.shadowMap.enabled;
    this._sky.visible = photo;
    this.scene.background = new THREE.Color(photo ? "#9aa8b8" : "#05070a");
    this.renderer.setClearColor(photo ? "#9aa8b8" : "#05070a", 1);
    if (this.scene.fog) this.scene.fog.color.set(photo ? "#9aa8b8" : "#05070a");
    const d = span * 0.72;
    this._sun.shadow.camera.left = -d;
    this._sun.shadow.camera.right = d;
    this._sun.shadow.camera.top = d;
    this._sun.shadow.camera.bottom = -d;
    this._sun.shadow.camera.far = span * 2.8;
    this._sun.shadow.camera.updateProjectionMatrix();
    if (this.scene.fog) {
      this.scene.fog.near = span * 1.55;
      this.scene.fog.far = span * 3.6;
    }
  }

  _buildComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    this.composer = new EffectComposer(this.renderer);
    this._renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this._renderPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.4, 0.22);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const aspect = w / h;
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    this._fitOrtho(this._span, aspect);
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  _fitOrtho(span, aspect = this.persp.aspect) {
    const half = Math.max(8, span * 0.52);
    this.ortho.left = -half * aspect;
    this.ortho.right = half * aspect;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.updateProjectionMatrix();
  }

  _useCamera(cam) {
    this.camera = cam;
    this.controls.object = cam;
    if (this._renderPass) this._renderPass.camera = cam;
  }

  setBloom(on) {
    this.useBloom = on && !this._softwareGL && !!this.composer;
    if (this.bloomPass) this.bloomPass.enabled = this.useBloom;
  }

  _disposeWorld() {
    const maps = new Set();
    this.world.traverse((obj) => {
      obj.geometry?.dispose?.();
      const mats = obj.material ? [].concat(obj.material) : [];
      for (const m of mats) {
        if (m.map && !m.map.userData?.shared) maps.add(m.map);
        if (!m.userData?.shared) m.dispose?.();
      }
    });
    for (const map of maps) map.dispose();
    this.world.clear();
  }

  setScene(reconstruction, params, style) {
    this._disposeWorld();
    this._pickables = [];
    this._hover = null;
    this._selected = null;
    this._scan = null;
    if (!reconstruction) return;
    this.resize();
    const shadows = params.showShadows !== false && style !== "hologram" && !this._softwareGL;
    const ground = buildGround(reconstruction, params, style, shadows);
    this.world.add(ground);
    const photoTex = ground.userData.photoTexture;
    if (photoTex) photoTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const city = buildCityGroup(reconstruction, params, style, photoTex, shadows);
    this.world.add(city);
    this._pickables = city.userData.pickables || [];
    this._scan = this.world.getObjectByName("scan");
    const span = Math.max(reconstruction.width, reconstruction.height) * params.metersPerPixel;
    this._span = span;
    this._fitSun(span, style);
    this._viewKind = "iso";
    this._useCamera(this.persp);
    this.flyTo(
      new THREE.Vector3(span * 0.62, span * 0.48, span * 0.68),
      new THREE.Vector3(0, span * 0.04, 0),
    );
    this.resize();
  }

  setView(kind, reconstruction, params) {
    if (!reconstruction) return;
    const span = Math.max(reconstruction.width, reconstruction.height) * params.metersPerPixel;
    this._span = span;
    this._viewKind = kind === "top" ? "top" : kind;
    if (kind === "top") {
      this._camAnim = null;
      this.ortho.zoom = 1;
      this._fitOrtho(span);
      this.ortho.position.set(0, span * 1.6, 0);
      this.ortho.up.set(0, 0, -1);
      this.ortho.lookAt(0, 0, 0);
      this.ortho.updateProjectionMatrix();
      this._useCamera(this.ortho);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    } else {
      this._useCamera(this.persp);
      if (kind === "street") {
        this.flyTo(new THREE.Vector3(span * 0.02, span * 0.09, span * 0.48), new THREE.Vector3(0, span * 0.05, 0));
      } else {
        this.flyTo(new THREE.Vector3(span * 0.62, span * 0.48, span * 0.68), new THREE.Vector3(0, span * 0.04, 0));
      }
    }
  }

  flyTo(position, target, duration = 0.85) {
    this._camAnim = {
      t: 0,
      duration,
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
    };
  }

  _onPointer(event, click) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const hit = pickBuildingAt(this._pickables, this.camera, this._ndc);
    if (this._hover && this._hover !== hit) {
      const prev = this._hover.material;
      if (prev.emissive) prev.emissive.setHex(this._hover.userData.baseEmissive ?? 0);
      else prev.opacity = this._hover.userData.baseOpacity ?? prev.opacity;
    }
    this._hover = hit;
    this.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    if (hit) {
      if (hit.material.emissive) {
        hit.userData.baseEmissive ??= hit.material.emissive.getHex();
        if (hit !== this._selected) hit.material.emissive.setHex(0x2a2418);
      } else {
        hit.userData.baseOpacity ??= hit.material.opacity;
        if (hit !== this._selected) hit.material.opacity = Math.min(1, hit.userData.baseOpacity + 0.08);
      }
    }
    if (click) {
      this._selected = hit;
      this._onPick?.(hit?.userData?.building || null);
    }
  }

  screenshot() {
    if (this.useBloom && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  exportGltf() {
    return new Promise((resolve, reject) => {
      const exporter = new GLTFExporter();
      exporter.parse(
        this.world,
        (result) => {
          const blob =
            result instanceof ArrayBuffer
              ? new Blob([result], { type: "model/gltf-binary" })
              : new Blob([JSON.stringify(result)], { type: "model/gltf+json" });
          resolve(blob);
        },
        reject,
        { binary: true },
      );
    });
  }

  _loop() {
    const tick = () => {
      if (!this._running) return;
      requestAnimationFrame(tick);
      const dt = this._clock.getDelta();
      if (this._camAnim) {
        this._camAnim.t += dt / this._camAnim.duration;
        const k = easeInOut(Math.min(1, this._camAnim.t));
        this.camera.position.lerpVectors(this._camAnim.fromPos, this._camAnim.toPos, k);
        this.controls.target.lerpVectors(this._camAnim.fromTarget, this._camAnim.toTarget, k);
        if (this._camAnim.t >= 1) this._camAnim = null;
      }
      if (this._scan) {
        const maxY = this._scan.userData.maxY || 40;
        this._scan.position.y = ((Math.sin(this._clock.elapsedTime * 0.45) + 1) / 2) * maxY;
      }
      this.controls.update();
      if (this.useBloom && this.composer) {
        try {
          this.composer.render();
        } catch {
          this.useBloom = false;
          this.renderer.render(this.scene, this.camera);
        }
      } else this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose() {
    this._running = false;
    this._ro?.disconnect();
    window.removeEventListener("resize", this._onResize);
    this.renderer.dispose();
  }
}
