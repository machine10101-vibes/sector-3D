import "./styles.css";
import { Viewport } from "./render/engine.js";
import { defaultParams, reconstructFromImage, fidelityAgainst } from "./vision/reconstruct.js";
import { generateFloorPlan, generateHarborDistrict, canvasToImage } from "./samples/demo.js";
import { buildingsToJson, downloadBlob, downloadDataUrl, renderOverlay } from "./ui/overlay.js";

const $ = (id) => document.getElementById(id);

const state = {
  sourceType: "auto",
  style: "hologram",
  image: null,
  imageName: null,
  reconstruction: null,
  groundTruth: null,
  view: "3d",
  busy: false,
  selected: null,
};

const params = defaultParams();
const viewport = new Viewport($("viewport"));
let liveTimer = 0;

function log(msg) {
  $("log").textContent = msg;
  $("status-left").textContent = msg.toUpperCase();
}

function readParams() {
  params.sensitivity = Number($("sensitivity").value);
  params.minArea = Number($("minArea").value);
  params.simplify = Number($("simplify").value);
  params.heightScale = Number($("heightScale").value);
  params.wallHeight = Number($("wallHeight").value);
  params.metersPerPixel = Number($("metersPerPixel").value);
  params.showGroundTexture = $("groundTex").checked;
  params.showGrid = $("grid").checked;
  params.showLights = $("lights").checked;
  $("v-sens").textContent = params.sensitivity.toFixed(2);
  $("v-area").textContent = String(params.minArea);
  $("v-simp").textContent = params.simplify.toFixed(1);
  $("v-h").textContent = params.heightScale.toFixed(2);
  $("v-wall").textContent = String(params.wallHeight);
  $("v-mpp").textContent = params.metersPerPixel.toFixed(2);
}

function setStats() {
  const rec = state.reconstruction;
  if (!rec) {
    $("s-count").textContent = "0";
    $("s-cov").textContent = "—";
    $("s-h").textContent = "—";
    $("s-iou").textContent = "—";
    return;
  }
  $("s-count").textContent = String(rec.buildings.length);
  $("s-cov").textContent = `${Math.round(rec.coverage * 100)}%`;
  const meanH = rec.buildings.reduce((s, b) => s + b.height, 0) / Math.max(1, rec.buildings.length);
  $("s-h").textContent = `${meanH.toFixed(1)} u`;
  const fid = fidelityAgainst(rec, state.groundTruth);
  $("s-iou").textContent = fid ? `${Math.round(fid.meanIoU * 100)}%` : "src";
}

function applyView() {
  const overlay = $("overlay-view");
  const stage = $("stage");
  stage.classList.toggle("split", state.view === "split");
  const showOverlay = (state.view === "source" || state.view === "split") && state.reconstruction;
  overlay.classList.toggle("active", !!showOverlay);
  if (showOverlay) renderOverlay($("overlay-canvas"), state.reconstruction, state.selected?.id ?? null);
}

function applyScene() {
  if (!state.reconstruction) return;
  $("empty").style.display = "none";
  showInspect(null);
  viewport.setBloom($("bloom").checked);
  viewport.autoRotate = $("orbit").checked;
  viewport.setScene(state.reconstruction, params, state.style);
  applyView();
  setStats();
}

function setProgress(label, t, show) {
  const el = $("progress");
  el.hidden = !show;
  $("progress-label").textContent = label;
  $("progress-bar").style.width = `${Math.round((t || 0) * 100)}%`;
}

async function reconstruct() {
  if (!state.image || state.busy) return;
  state.busy = true;
  $("rebuild").disabled = true;
  readParams();
  setProgress("Normalizing raster", 0.05, true);
  try {
    const rec = await reconstructFromImage(state.image, state.sourceType, params, (p) => {
      log(`${p.label} · ${Math.round(p.t * 100)}%`);
      setProgress(p.label, p.t, true);
    });
    state.reconstruction = rec;
    log(`Locked ${rec.buildings.length} structures · ${rec.sourceType} mode`);
    applyScene();
  } catch (err) {
    console.error(err);
    log(`Reconstruction failed: ${err.message || err}`);
  } finally {
    state.busy = false;
    $("rebuild").disabled = false;
    setProgress("", 1, false);
  }
}

function scheduleLive() {
  readParams();
  if (!$("live").checked || !state.image) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => reconstruct(), 420);
}

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.image = img;
    state.imageName = file.name;
    state.groundTruth = null;
    state.sourceType = "auto";
    document.querySelectorAll("#source-type button").forEach((b) => {
      b.classList.toggle("active", b.dataset.type === "auto");
    });
    log(`Loaded ${file.name} · ${img.width}×${img.height}`);
    reconstruct();
  };
  img.onerror = () => log("Unable to decode raster");
  img.src = url;
}

async function loadDemo(kind) {
  const demo = kind === "blueprint" ? generateFloorPlan() : generateHarborDistrict();
  state.sourceType = demo.sourceType;
  document.querySelectorAll("#source-type button").forEach((b) => {
    b.classList.toggle("active", b.dataset.type === demo.sourceType);
  });
  const img = await canvasToImage(demo.canvas);
  state.image = img;
  state.imageName = demo.name;
  state.groundTruth = demo.groundTruth;
  log(`Calibration raster · ${demo.name}`);
  await reconstruct();
}

function showInspect(building) {
  state.selected = building;
  const card = $("inspect");
  if (!building) {
    card.hidden = true;
    applyView();
    return;
  }
  card.hidden = false;
  $("inspect-body").innerHTML = [
    `<span>ID</span> ${building.id}`,
    `<span>Class</span> ${building.className}`,
    `<span>Height</span> ${building.height.toFixed(1)} u`,
    `<span>Area</span> ${Math.round(building.area)} px`,
  ].join("<br>");
  applyView();
}

$("source-type").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  state.sourceType = btn.dataset.type;
  document.querySelectorAll("#source-type button").forEach((b) => b.classList.toggle("active", b === btn));
});

$("style").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  state.style = btn.dataset.style;
  document.querySelectorAll("#style button").forEach((b) => b.classList.toggle("active", b === btn));
  applyScene();
});

$("cam").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || !state.reconstruction) return;
  document.querySelectorAll("#cam button").forEach((b) => b.classList.toggle("active", b === btn));
  viewport.setView(btn.dataset.cam === "iso" ? "iso" : btn.dataset.cam, state.reconstruction, params);
});

document.querySelectorAll(".view-switch .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    state.view = chip.dataset.view;
    document.querySelectorAll(".view-switch .chip").forEach((c) => c.classList.toggle("active", c === chip));
    applyView();
    viewport.resize();
  });
});

["sensitivity", "minArea", "simplify", "heightScale", "wallHeight", "metersPerPixel"].forEach((id) => {
  $(id).addEventListener("input", () => {
    readParams();
    scheduleLive();
  });
});
["bloom", "groundTex", "grid", "lights", "orbit"].forEach((id) => {
  $(id).addEventListener("change", () => {
    readParams();
    if (id === "orbit") viewport.autoRotate = $("orbit").checked;
    else if (id === "bloom") viewport.setBloom($("bloom").checked);
    else applyScene();
  });
});

const drop = $("drop");
$("file").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) loadFile(file);
});
for (const ev of ["dragenter", "dragover"]) {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
  $("stage").addEventListener(ev, (e) => e.preventDefault());
}
drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("drag");
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});
$("stage").addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

$("rebuild").addEventListener("click", reconstruct);
$("demo-sat").addEventListener("click", () => loadDemo("satellite"));
$("demo-bp").addEventListener("click", () => loadDemo("blueprint"));
$("fullscreen").addEventListener("click", () => {
  const el = $("stage");
  if (!document.fullscreenElement) el.requestFullscreen?.();
  else document.exitFullscreen?.();
});

$("exp-png").addEventListener("click", () => {
  if (!state.reconstruction) return;
  downloadDataUrl(viewport.screenshot(), "sector-3d.png");
});
$("exp-glb").addEventListener("click", async () => {
  if (!state.reconstruction) return;
  const blob = await viewport.exportGltf();
  downloadBlob(blob, "sector-3d.glb");
});
$("exp-json").addEventListener("click", () => {
  if (!state.reconstruction) return;
  const json = buildingsToJson(state.reconstruction, params, { name: state.imageName, type: state.sourceType });
  downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), "sector-3d.json");
});

viewport.onPick = showInspect;

function closeDrawers() {
  $("source-panel").classList.remove("open");
  $("recon-panel").classList.remove("open");
  $("backdrop").hidden = true;
  $("open-source").setAttribute("aria-expanded", "false");
  $("open-recon").setAttribute("aria-expanded", "false");
  requestAnimationFrame(() => viewport.resize());
}

function toggleDrawer(id) {
  const el = $(id);
  const willOpen = !el.classList.contains("open");
  closeDrawers();
  if (!willOpen) return;
  el.classList.add("open");
  $("backdrop").hidden = false;
  $(id === "source-panel" ? "open-source" : "open-recon").setAttribute("aria-expanded", "true");
}

$("open-source").addEventListener("click", () => toggleDrawer("source-panel"));
$("open-recon").addEventListener("click", () => toggleDrawer("recon-panel"));
$("backdrop").addEventListener("click", closeDrawers);
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", closeDrawers);
});

window.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  if (e.key === "Escape") closeDrawers();
  if (e.key === "1") $("cam").querySelector("[data-cam=iso]")?.click();
  if (e.key === "2") $("cam").querySelector("[data-cam=top]")?.click();
  if (e.key === "3") $("cam").querySelector("[data-cam=street]")?.click();
  if (e.key === "f" || e.key === "F") $("fullscreen").click();
  if (e.key === "r" || e.key === "R") reconstruct();
  if (e.key === " ") {
    e.preventDefault();
    $("orbit").checked = !$("orbit").checked;
    viewport.autoRotate = $("orbit").checked;
  }
});

function tickClock() {
  $("clock").textContent = new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
}
tickClock();
setInterval(tickClock, 1000);
readParams();

window.addEventListener("load", () => {
  setTimeout(() => $("boot").classList.add("hide"), 700);
  loadDemo("satellite");
});
