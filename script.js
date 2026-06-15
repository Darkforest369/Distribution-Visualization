const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Simulation Properties Base
let bodies = [];
let isRunning = true;
let showGrid = true;
let showTrails = true;
let G = 1.0;
let softeningFactor = 15.0; // Prevent collision divide-by-zero singularities
let substeps = 4; // Physics cycles processed internally per frame render
let spawnMass = 100;

// Camera state parameters
let zoom = 1.0;
let panX = 0;
let panY = 0;

// Interaction states
let isDraggingCamera = false;
let draggedBody = null;
let launchMode = false;
let launchStart = { x: 0, y: 0 };
let launchCurrent = { x: 0, y: 0 };
let lastMouseX = 0, lastMouseY = 0;

// Telemetry Metric Histories
const energyHistory = [];
const maxHistoryLength = 250;
let fps = 0;
let lastFpsUpdate = 0;
let framesThisSecond = 0;

// Colors mapping matching the core premium design spec
const palette = ["#00e5ff", "#ff3366", "#00ff7f", "#cc66ff", "#ff9900", "#ffffff"];

// Track mouse position over components
function getWorkspaceCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;
  return {
    x: (screenX - canvas.width / 2 - panX) / zoom,
    y: (screenY - canvas.height / 2 - panY) / zoom,
    screenX,
    screenY
  };
}

class Body {
  constructor(x, y, vx, vy, mass, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.mass = mass;
    this.color = color || palette[Math.floor(Math.random() * palette.length)];
    this.trail = [];
    this.radius = Math.max(3, Math.log10(mass) * 3.5);
  }

  updateRadius() {
    this.radius = Math.max(3, Math.log10(this.mass) * 3.5);
  }
}

// Preset Architectures
function loadPreset(type) {
  bodies = [];
  energyHistory.length = 0;
  panX = 0; panY = 0; zoom = 1.0;

  if (type === "solar") {
    // Massive Sun
    bodies.push(new Body(0, 0, 0, 0, 3000, "#ffff00"));
    // Planet 1
    bodies.push(new Body(0, -120, 5.0, 0, 8, "#00e5ff"));
    // Planet 2
    bodies.push(new Body(0, -200, 3.8, 0, 45, "#00ff7f"));
    // Moon orbiting Planet 2
    bodies.push(new Body(0, -218, 5.4, 0, 0.5, "#ffffff"));
    // Outer Comet
    bodies.push(new Body(280, 200, -2.2, 2.5, 5, "#ff3366"));

  } else if (type === "figure8") {
    // Highly delicate choreography, zero-softening yields perfection
    softeningFactor = 0;
    document.getElementById("softeningSlider").value = 0;
    document.getElementById("softeningTxt").innerText = "0.00 px";
    G = 1.0;
    document.getElementById("gSlider").value = 1.0;
    document.getElementById("gTxt").innerText = "1.00";

    const m = 1000;
    const x1 = -194.144, y1 = 47.925;
    const v1x = 4.614, v1y = 4.302;

    bodies.push(new Body(x1, y1, v1x, v1y, m, "#00e5ff"));
    bodies.push(new Body(-x1, -y1, v1x, v1y, m, "#ff3366"));
    bodies.push(new Body(0, 0, -2 * v1x, -2 * v1y, m, "#00ff7f"));

  } else if (type === "lagrange") {
    // Stable triangular orbit configuration
    bodies.push(new Body(0, 0, 0, 0, 4000, "#ff9900")); // Central star
    bodies.push(new Body(220, 0, 0, 4.26, 150, "#00ff7f")); // Planet
    
    // Trojan Asteroid sitting 60 degrees ahead in Lagrange point L4
    const rad = 220;
    const angle = Math.PI / 3; // 60 degrees
    const lx = rad * Math.cos(angle);
    const ly = rad * Math.sin(angle);
    const speed = 4.18;
    bodies.push(new Body(lx, ly, -speed * Math.sin(angle), speed * Math.cos(angle), 0.1, "#ffffff"));

  } else if (type === "chaos") {
    // Two high-mass stars twisting trajectories erratically
    bodies.push(new Body(-80, 0, 0, -3.0, 1500, "#cc66ff"));
    bodies.push(new Body(80, 0, 0, 3.0, 1500, "#00e5ff"));
    bodies.push(new Body(180, 10, -1.0, 4.0, 10, "#ff3366"));
    bodies.push(new Body(-200, -20, 1.5, -3.5, 25, "#00ff7f"));
  }
}

// Symplectic Leapfrog Integration Loop (Kick-Drift-Kick Method)
function updatePhysics() {
  const dt = 0.015 / substeps;
  const epsSq = softeningFactor * softeningFactor;

  for (let step = 0; step < substeps; step++) {
    const N = bodies.length;
    
    // 1. Half-Kick Velocities
    const ax = new Array(N).fill(0);
    const ay = new Array(N).fill(0);

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const dx = bodies[j].x - bodies[i].x;
        const dy = bodies[j].y - bodies[i].y;
        const distSq = dx * dx + dy * dy + epsSq;
        const dist = Math.sqrt(distSq);
        
        if (dist > 0.1) {
          const forceMag = (G * bodies[j].mass) / (distSq * dist);
          ax[i] += dx * forceMag;
          ay[i] += dy * forceMag;
        }
      }
    }

    for (let i = 0; i < N; i++) {
      if (bodies[i] !== draggedBody) {
        bodies[i].vx += ax[i] * 0.5 * dt;
        bodies[i].vy += ay[i] * 0.5 * dt;
      }
    }

    // 2. Full Drift Positions
    for (let i = 0; i < N; i++) {
      if (bodies[i] !== draggedBody) {
        bodies[i].x += bodies[i].vx * dt;
        bodies[i].y += bodies[i].vy * dt;
      }
    }

    // 3. Final Half-Kick Velocities
    const ax2 = new Array(N).fill(0);
    const ay2 = new Array(N).fill(0);

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const dx = bodies[j].x - bodies[i].x;
        const dy = bodies[j].y - bodies[i].y;
        const distSq = dx * dx + dy * dy + epsSq;
        const dist = Math.sqrt(distSq);
        
        if (dist > 0.1) {
          const forceMag = (G * bodies[j].mass) / (distSq * dist);
          ax2[i] += dx * forceMag;
          ay2[i] += dy * forceMag;
        }
      }
    }

    for (let i = 0; i < N; i++) {
      if (bodies[i] !== draggedBody) {
        bodies[i].vx += ax2[i] * 0.5 * dt;
        bodies[i].vy += ay2[i] * 0.5 * dt;
      }
    }
  }

  // Handle visual history trails appending
  if (showTrails) {
    bodies.forEach(b => {
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 300) b.trail.shift();
    });
  } else {
    bodies.forEach(b => b.trail = []);
  }
}

// Calculate Total Mechanical System Energy Matrix
function getSystemEnergy() {
  let ke = 0;
  let pe = 0;
  const N = bodies.length;
  const epsSq = softeningFactor * softeningFactor;

  for (let i = 0; i < N; i++) {
    const speedSq = bodies[i].vx * bodies[i].vx + bodies[i].vy * bodies[i].vy;
    ke += 0.5 * bodies[i].mass * speedSq;

    for (let j = i + 1; j < N; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy + epsSq);
      if (dist > 0) {
        pe -= (G * bodies[i].mass * bodies[j].mass) / dist;
      }
    }
  }
  return { ke, pe, total: ke + pe };
}

// Drawing Utilities
function drawGridOverlay() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
  ctx.lineWidth = 1;

  const spacing = 80 * zoom;
  const startX = (canvas.width / 2 + panX) % spacing;
  const startY = (canvas.height / 2 + panY) % spacing;

  for (let x = startX; x < canvas.width; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = startY; y < canvas.height; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawTelemetryGraphs() {
  const gw = 280, gh = 110;
  const gx = canvas.width - gw - 25;
  const gy = 25;

  ctx.save();
  ctx.fillStyle = "rgba(14, 14, 18, 0.9)";
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = "#2d2d35";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.fillStyle = "#a5a5b5";
  ctx.font = "10px monospace";
  ctx.fillText(`TOTAL SYSTEM ENERGY MATRIX`, gx + 10, gy + 15);
  ctx.fillText(`FPS: ${fps}`, gx + gw - 60, gy + 15);

  if (energyHistory.length < 2) {
    ctx.restore();
    return;
  }

  // Find graph limits bounds
  let minE = Infinity, maxE = -Infinity;
  energyHistory.forEach(h => {
    if (h.total < minE) minE = h.total;
    if (h.total > maxE) maxE = h.total;
    if (h.ke > maxE) maxE = h.ke;
    if (h.pe < minE) minE = h.pe;
  });

  const pad = 15;
  const plotTop = gy + 28, plotBottom = gy + gh - 10;
  const plotLeft = gx + 10, plotRight = gx + gw - 10;
  const hRange = (maxE - minE === 0) ? 1.0 : (maxE - minE) * 1.2;
  const midE = minE + (maxE - minE) / 2;

  // X Scaling step size helper
  const xStep = (plotRight - plotLeft) / (maxHistoryLength - 1);

  // Helper coordinate converter
  function getY(val) {
    const pct = (val - midE) / hRange + 0.5;
    return plotBottom - pct * (plotBottom - plotTop);
  }

  ctx.beginPath();
  ctx.rect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop);
  ctx.clip();

  // Kinetic Energy Plot Line (Magenta)
  ctx.strokeStyle = "#ff3366"; ctx.lineWidth = 1.2; ctx.beginPath();
  energyHistory.forEach((h, idx) => {
    const x = plotLeft + idx * xStep;
    if (idx === 0) ctx.moveTo(x, getY(h.ke)); else ctx.lineTo(x, getY(h.ke));
  });
  ctx.stroke();

  // Potential Energy Plot Line (Spring Green)
  ctx.strokeStyle = "#00ff7f"; ctx.beginPath();
  energyHistory.forEach((h, idx) => {
    const x = plotLeft + idx * xStep;
    if (idx === 0) ctx.moveTo(x, getY(h.pe)); else ctx.lineTo(x, getY(h.pe));
  });
  ctx.stroke();

  // Total Energy Matrix Line (Cyan Target Check)
  ctx.strokeStyle = "#00e5ff"; ctx.lineWidth = 2.0; ctx.beginPath();
  energyHistory.forEach((h, idx) => {
    const x = plotLeft + idx * xStep;
    if (idx === 0) ctx.moveTo(x, getY(h.total)); else ctx.lineTo(x, getY(h.total));
  });
  ctx.stroke();

  ctx.restore();
}

function renderLoop() {
  // Clear Canvas backbuffer
  ctx.fillStyle = "#0c0c0e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (showGrid) drawGridOverlay();

  // Apply Camera System Matrix Transformations
  ctx.save();
  ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
  ctx.scale(zoom, zoom);

  // 1. Draw Geometric Trails
  if (showTrails) {
    bodies.forEach(b => {
      if (b.trail.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(b.trail[0].x, b.trail[0].y);
      for (let i = 1; i < b.trail.length; i++) {
        ctx.lineTo(b.trail[i].x, b.trail[i].y);
      }
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1.2 / zoom;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });
  }

  // 2. Draw Vector Slingshot Predictive Trajectory Line
  if (launchMode) {
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
    ctx.beginPath();
    ctx.moveTo(launchStart.x, launchStart.y);
    
    // Simulate trajectory prediction path
    let px = launchStart.x;
    let py = launchStart.y;
    let pvx = (launchStart.x - launchCurrent.x) * 0.05;
    let pvy = (launchStart.y - launchCurrent.y) * 0.05;
    const simSteps = 120;
    const simDt = 0.08;
    const epsSq = softeningFactor * softeningFactor;

    for (let i = 0; i < simSteps; i++) {
      let ax = 0, ay = 0;
      bodies.forEach(b => {
        const dx = b.x - px;
        const dy = b.y - py;
        const dSq = dx*dx + dy*dy + epsSq;
        const d = Math.sqrt(dSq);
        if (d > 1) {
          const f = (G * b.mass) / (dSq * d);
          ax += dx * f; ay += dy * f;
        }
      });
      pvx += ax * simDt; pvy += ay * simDt;
      px += pvx * simDt; py += pvy * simDt;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Base Anchor Core Circle preview
    ctx.fillStyle = "#00e5ff";
    ctx.beginPath();
    ctx.arc(launchStart.x, launchStart.y, Math.max(3, Math.log10(spawnMass) * 3.5), 0, Math.PI * 2);
    ctx.fill();

    // Pull stretch vector pipeline line
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.moveTo(launchStart.x, launchStart.y);
    ctx.lineTo(launchCurrent.x, launchCurrent.y);
    ctx.stroke();
  }

  // 3. Draw Massive Orbit Bodies
  bodies.forEach(b => {
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();

    // Core Highlight Aura Ring if grabbed
    if (b === draggedBody) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  ctx.restore(); // Revert Camera Context Matrix

  // Draw Screenspace Telemetry Dashboard HUD Component
  drawTelemetryGraphs();

  // Engine Processing Execution Steps Call
  if (isRunning) {
    updatePhysics();
    
    // Append Energy Metrics Log
    const energy = getSystemEnergy();
    energyHistory.push(energy);
    if (energyHistory.length > maxHistoryLength) energyHistory.shift();
  }

  // Frame counter calculations
  framesThisSecond++;
  const now = performance.now();
  if (now - lastFpsUpdate >= 1000) {
    fps = framesThisSecond;
    framesThisSecond = 0;
    lastFpsUpdate = now;
  }

  requestAnimationFrame(renderLoop);
}

// Viewport Resize Configuration
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);

// UI Initialization Layout Tab-Switches Configurations
function initUI() {
  const tabs = ["tabLiveBtn", "tabPresetsBtn", "tabEnvBtn", "tabGuideBtn"];
  const pages = ["pageControls", "pagePresets", "pageEnv", "pageGuide"];

  tabs.forEach((tabId, idx) => {
    document.getElementById(tabId).addEventListener("click", () => {
      tabs.forEach(t => document.getElementById(t).classList.remove("active"));
      pages.forEach(p => document.getElementById(p).style.display = "none");
      
      document.getElementById(tabId).add("active");
      document.getElementById(pages[idx]).style.display = "block";
    });
  });

  // Action Run state Button
  const actionBtn = document.getElementById("actionBtn");
  actionBtn.addEventListener("click", () => {
    isRunning = !isRunning;
    actionBtn.innerText = isRunning ? "⏸️ PAUSE SIMULATION" : "🚀 RUNNING SIMULATION";
    actionBtn.classList.toggle("paused", !isRunning);
  });

  // Controls triggers checkboxes hooks
  const gridBtn = document.getElementById("gridBtn");
  gridBtn.addEventListener("click", () => {
    showGrid = !showGrid;
    gridBtn.classList.toggle("active", showGrid);
    gridBtn.innerText = showGrid ? "Grid Overlay: ON" : "Grid Overlay: OFF";
  });

  const trailsBtn = document.getElementById("trailsBtn");
  trailsBtn.addEventListener("click", () => {
    showTrails = !showTrails;
    trailsBtn.classList.toggle("active", showTrails);
    trailsBtn.innerText = showTrails ? "Particle Trails: ON" : "Particle Trails: OFF";
    if (!showTrails) bodies.forEach(b => b.trail = []);
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    bodies = [];
    energyHistory.length = 0;
  });

  // Env Sliders Value EventListeners
  const gSlider = document.getElementById("gSlider");
  gSlider.addEventListener("input", (e) => {
    G = parseFloat(e.target.value);
    document.getElementById("gTxt").innerText = G.toFixed(2);
  });

  const softeningSlider = document.getElementById("softeningSlider");
  softeningSlider.addEventListener("input", (e) => {
    softeningFactor = parseFloat(e.target.value);
    document.getElementById("softeningTxt").innerText = `${softeningFactor.toFixed(2)} px`;
  });

  const substepSlider = document.getElementById("substepSlider");
  substepSlider.addEventListener("input", (e) => {
    substeps = parseInt(e.target.value);
    document.getElementById("substepTxt").innerText = `${substeps} steps / frame`;
  });

  const spawnMassSlider = document.getElementById("spawnMassSlider");
  spawnMassSlider.addEventListener("input", (e) => {
    spawnMass = parseInt(e.target.value);
    document.getElementById("massDisplayTxt").innerText = `${spawnMass} Solar Masses`;
  });

  // Preset selectors layout triggers injection
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      loadPreset(e.target.getAttribute("data-preset"));
    });
  });

  // Mini Panel Header minimize trigger hook toggle layout
  document.getElementById("panelHeader").addEventListener("click", () => {
    document.getElementById("ui-layer").classList.toggle("collapsed");
  });

  // Core Telemetry Expand Panel Layout Action hooks 
  document.getElementById("telemetryBtn").addEventListener("click", () => {
    const dropdown = document.getElementById("telemetry-dropdown");
    const active = dropdown.style.display !== "none";
    dropdown.style.display = active ? "none" : "block";
    document.getElementById("telemetryBtn").innerText = active ? "TELEMETRY ▲" : "TELEMETRY ▼";
  });
}

// Setup Deep Interaction Event Listeners Hooks
function initInteractions() {
  canvas.addEventListener("mousedown", (e) => {
    const coords = getWorkspaceCoords(e);
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    // Check right button trigger or modifier shift key -> Map Pan view drag
    if (e.button === 2 || e.shiftKey) {
      isDraggingCamera = true;
      e.preventDefault();
      return;
    }

    // Left click checks for existing body intersections grab targets
    let clickedBody = null;
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      const dist = Math.hypot(coords.x - b.x, coords.y - b.y);
      if (dist <= b.radius + 3) {
        clickedBody = b;
        break;
      }
    }

    if (clickedBody) {
      draggedBody = clickedBody;
      draggedBody.vx = 0; draggedBody.vy = 0; // Temporarily halt velocities
    } else {
      // Enter predictive launch mechanics mode
      launchMode = true;
      launchStart = { x: coords.x, y: coords.y };
      launchCurrent = { x: coords.x, y: coords.y };
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    const coords = getWorkspaceCoords(e);

    if (isDraggingCamera) {
      panX += e.clientX - lastMouseX;
      panY += e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      return;
    }

    if (draggedBody) {
      draggedBody.x = coords.x;
      draggedBody.y = coords.y;
      draggedBody.vx = 0; draggedBody.vy = 0;
      draggedBody.trail = [];
    } else if (launchMode) {
      launchCurrent = { x: coords.x, y: coords.y };
    }
  });

  canvas.addEventListener("mouseup", (e) => {
    if (isDraggingCamera) {
      isDraggingCamera = false;
      return;
    }

    if (draggedBody) {
      // Release body and let physics resume control mapping vectors
      draggedBody = null;
    } else if (launchMode) {
      launchMode = false;
      
      // Calculate inverse structural direction scale force parameters 
      const vx = (launchStart.x - launchCurrent.x) * 0.05;
      const vy = (launchStart.y - launchCurrent.y) * 0.05;
      
      const nb = new Body(launchStart.x, launchStart.y, vx, vy, spawnMass);
      nb.updateRadius();
      bodies.push(nb);
    }
  });

  // Block right click menu options inside workspace
  canvas.addEventListener("contextmenu", e => e.preventDefault());

  // Mouse wheel zoom integration scaling operations
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const oldZoom = zoom;

    if (e.deltaY < 0) {
      zoom = Math.min(4.0, zoom * zoomFactor);
    } else {
      zoom = Math.max(0.2, zoom / zoomFactor);
    }
  }, { passive: false });

  // Keyboard Global Shortcuts Handler Hook
  window.addEventListener("keydown", (e) => {
    switch (e.key.toLowerCase()) {
      case " ":
        e.preventDefault();
        document.getElementById("actionBtn").click();
        break;
      case "c":
        document.getElementById("clearBtn").click();
        break;
      case "g":
        document.getElementById("gridBtn").click();
        break;
      case "t":
        document.getElementById("trailsBtn").click();
        break;
      case "h":
        document.getElementById("panelHeader").click();
        break;
    }
  });
}

// Generate UI Slider Ticks Marks Layout Elements
function buildTicks() {
  const container = document.querySelector(".slider-ticks");
  const count = parseInt(container.getAttribute("data-ticks"));
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("div");
    dot.className = "tick-dot";
    container.appendChild(dot);
  }
}

// Program Boot Entrypoint Initializer Sequence Call
window.onload = () => {
  resize();
  initUI();
  initInteractions();
  buildTicks();
  loadPreset("solar"); // Inject base Solar System profile architecture archetype map
  requestAnimationFrame(renderLoop);
};