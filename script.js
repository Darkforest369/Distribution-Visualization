const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// System Parameters
let isSpawning = false;
let spawnMode = "continuous"; // continuous or burst
let showOverlay = true;
let totalRows = 8;
let successProb = 0.5;
let ballRadius = 6;
let gravity = 9.81;
let restitution = 0.45;

let balls = [];
let pegs = [];
let binCounts = [];
let totalDropped = 0;

// Layout Geometry Variables
let boardWidth, boardHeight, startX, startY;
let spacingX = 36;
let spacingY = 32;
let pegRadius = 4;
let binY;

// Color Loop Indexing
const themeColors = ["#00e5ff", "#ff9900", "#ff00ff", "#00ff7f", "#ffff00"];

// Performance Metrics
let fps = 0, lastFrameTime = performance.now(), frameCount = 0;

// DOM Linkage
const actionBtn = document.getElementById("actionBtn");
const clearBtn = document.getElementById("clearBtn");
const overlayBtn = document.getElementById("overlayBtn");
const rowsSlider = document.getElementById("rowsSlider");
const rowsTxt = document.getElementById("rowsTxt");
const probSlider = document.getElementById("probSlider");
const probTxt = document.getElementById("probTxt");
const radiusSlider = document.getElementById("radiusSlider");
const radiusTxt = document.getElementById("radiusTxt");
const gravitySlider = document.getElementById("gravitySlider");
const gravityTxt = document.getElementById("gravityTxt");
const elasticitySlider = document.getElementById("elasticitySlider");
const elasticityTxt = document.getElementById("elasticityTxt");

const telemCount = document.getElementById("telemCount");
const telemMean = document.getElementById("telemMean");
const telemVariance = document.getElementById("telemVariance");
const telemFps = document.getElementById("telemFps");
const telemetryBtn = document.getElementById("telemetryBtn");
const telemetryDropdown = document.getElementById("telemetry-dropdown");

// Initialize Setup Layouts
function initSimulationMatrix() {
  pegs = [];
  binCounts = new Array(totalRows + 1).fill(0);
  
  // Re-calculate dimensions contextually based on viewport scaling
  spacingX = Math.min(42, Math.max(24, canvas.width / (totalRows + 4)));
  spacingY = spacingX * 0.85;
  
  startX = canvas.width / 2;
  startY = Math.min(120, canvas.height * 0.15);
  
  // Adjust asymmetric peg shifts using 'p' modifier mapping
  // Simulates systematic trajectory lean
  const pShift = (successProb - 0.5) * spacingX * 0.4;

  // Build Triangle Grid Arrangement
  for (let r = 0; r < totalRows; r++) {
    const pegsInRow = r + 1;
    const rowWidth = (pegsInRow - 1) * spacingX;
    const rowLeft = startX - rowWidth / 2;
    
    for (let i = 0; i < pegsInRow; i++) {
      pegs.push({
        x: rowLeft + i * spacingX + (r * pShift),
        y: startY + r * spacingY,
        flash: 0
      });
    }
  }
  
  // Define Channel Ingestion Line Boundary
  binY = startY + totalRows * spacingY + 20;
}

function resizeViewport() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initSimulationMatrix();
}

window.addEventListener("resize", resizeViewport);
window.onload = () => {
  resizeViewport();
  buildSliderTicks();
  animatePipeline();
};

// Tick Builder Helper
function buildSliderTicks() {
  document.querySelectorAll(".slider-ticks").forEach((container) => {
    container.innerHTML = "";
    const ticks = parseInt(container.getAttribute("data-ticks")) || 0;
    for (let i = 0; i < ticks; i++) {
      const dot = document.createElement("div");
      dot.className = "tick-dot";
      container.appendChild(dot);
    }
  });
}

// Generate Drop Unit
function spawnBall() {
  // Give subtle entry displacement to ensure distribution spread
  const entryOffset = (Math.random() - 0.5) * 6;
  const randomColor = themeColors[Math.floor(Math.random() * themeColors.length)];
  
  balls.push({
    x: startX + entryOffset,
    y: startY - 40,
    vx: (Math.random() - 0.5) * 1.5,
    vy: 0,
    radius: ballRadius,
    color: randomColor,
    settled: false
  });
  totalDropped++;
}

// Factorial Utilities for Overlay Math Models
function nCr(n, r) {
  if (r < 0 || r > n) return 0;
  let res = 1;
  for (let i = 1; i <= r; i++) {
    res = res * (n - i + 1) / i;
  }
  return res;
}

// Process Frame Iterations
let spawnCooldown = 0;
function animatePipeline() {
  const now = performance.now();
  frameCount++;
  if (now > lastFrameTime + 1000) {
    fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
    telemFps.innerText = `FPS: ${fps}`;
    frameCount = 0;
    lastFrameTime = now;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Handle Constant Spawning Intervals
  if (isSpawning && spawnMode === "continuous") {
    spawnCooldown++;
    if (spawnCooldown >= 4) { // Fast pacing flow rate
      spawnBall();
      spawnCooldown = 0;
    }
  }

  // Update & Draw Pins Array
  pegs.forEach(peg => {
    if (peg.flash > 0) peg.flash -= 0.05;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, pegRadius, 0, Math.PI * 2);
    ctx.fillStyle = peg.flash > 0 ? `rgba(0, 225, 255, ${0.3 + peg.flash * 0.7})` : "#555";
    ctx.shadowBlur = peg.flash > 0 ? peg.flash * 8 : 0;
    ctx.shadowColor = "#00e5ff";
    ctx.fill();
    ctx.shadowBlur = 0; // standard clear
  });

  // Render Slots Dividers
  const lastRowPegs = totalRows;
  const bottomWidth = (lastRowPegs) * spacingX;
  const leftEdge = startX - bottomWidth / 2;
  const pShift = (successProb - 0.5) * spacingX * 0.4;
  const finalShift = totalRows * pShift;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 2;
  
  for (let i = 0; i <= totalRows + 1; i++) {
    const posX = leftEdge + (i - 0.5) * spacingX + finalShift;
    ctx.beginPath();
    ctx.moveTo(posX, binY);
    ctx.lineTo(posX, canvas.height);
    ctx.stroke();
  }

  // Render Binned Accumulated Counts Visually
  const binMaxCount = Math.max(...binCounts, 1);
  const maxBarHeight = Math.max(80, canvas.height - binY - 60);

  for (let i = 0; i <= totalRows; i++) {
    const posX = leftEdge + i * spacingX + finalShift;
    const barH = (binCounts[i] / binMaxCount) * maxBarHeight;
    
    if (barH > 0) {
      ctx.fillStyle = "rgba(0, 229, 255, 0.15)";
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 1.5;
      
      ctx.fillRect(posX - spacingX/2 + 2, canvas.height - barH, spacingX - 4, barH);
      ctx.strokeRect(posX - spacingX/2 + 2, canvas.height - barH, spacingX - 4, barH);
      
      // Inline string value markers
      ctx.fillStyle = "#aaa";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(binCounts[i], posX, canvas.height - barH - 8);
    }
  }

  // Theoretical Distribution Line Overlay Mapping
  if (showOverlay) {
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#ff9900";
    
    for (let i = 0; i <= totalRows; i++) {
      const posX = leftEdge + i * spacingX + finalShift;
      const prob = nCr(totalRows, i) * Math.pow(successProb, i) * Math.pow(1 - successProb, totalRows - i);
      
      // Dynamic theoretical scale vs real tracking counts
      const theoreticalY = canvas.height - (prob * (totalDropped > 0 ? totalDropped : 100) / binMaxCount) * maxBarHeight;
      const baselineY = canvas.height - prob * maxBarHeight * 3.5; // fallback absolute shape projection
      
      // Target localized adaptive scale mapping alignment
      const actualTargetY = totalDropped > 50 ? theoreticalY : baselineY;

      if (i === 0) ctx.moveTo(posX, actualTargetY);
      else ctx.lineTo(posX, actualTargetY);
    }
    ctx.stroke();
    
    // Connect anchor nodes to graph layout joints
    for (let i = 0; i <= totalRows; i++) {
      const posX = leftEdge + i * spacingX + finalShift;
      const prob = nCr(totalRows, i) * Math.pow(successProb, i) * Math.pow(1 - successProb, totalRows - i);
      const actualTargetY = totalDropped > 50 ? 
        canvas.height - (prob * totalDropped / binMaxCount) * maxBarHeight : 
        canvas.height - prob * maxBarHeight * 3.5;

      ctx.beginPath();
      ctx.arc(posX, actualTargetY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }
  }

  // Physics Update Execution (Kinematic Vector Resolves)
  const dt = 0.15; // Normalized structural execution delta step
  const activeGravity = gravity * 0.4;

  for (let b = balls.length - 1; b >= 0; b--) {
    let ball = balls[b];

    if (!ball.settled) {
      ball.vy += activeGravity * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // Peg Multi-Collision Matrix Scanning
      pegs.forEach(peg => {
        let dx = ball.x - peg.x;
        let dy = ball.y - peg.y;
        let dist = Math.hypot(dx, dy);
        let minDist = ball.radius + pegRadius;

        if (dist < minDist) {
          // Push out vector separation immediately to stop coordinate sticking
          let nx = dx / dist;
          let ny = dy / dist;
          ball.x = peg.x + nx * minDist;
          ball.y = peg.y + ny * minDist;

          // Reflect velocity matrix relative to hit normal vector
          let dotProduct = ball.vx * nx + ball.vy * ny;
          ball.vx = (ball.vx - 2 * dotProduct * nx) * restitution;
          ball.vy = (ball.vy - 2 * dotProduct * ny) * restitution;

          // Introduce minor probability chaos scatter deviation
          ball.vx += (Math.random() - 0.5) * 0.6;
          peg.flash = 1.0;
        }
      });

      // Side Wall Enclosure Bounds Repulsion
      if (ball.x - ball.radius < 0) {
        ball.x = ball.radius;
        ball.vx *= -restitution;
      } else if (ball.x + ball.radius > canvas.width) {
        ball.x = canvas.width - ball.radius;
        ball.vx *= -restitution;
      }

      // Ingestion detection within structural collector channels
      if (ball.y >= binY) {
        let normalizedX = ball.x - (leftEdge - spacingX / 2) - finalShift;
        let binIndex = Math.floor(normalizedX / spacingX);
        
        // Edge containment correction bounds
        if (binIndex < 0) binIndex = 0;
        if (binIndex > totalRows) binIndex = totalRows;

        binCounts[binIndex]++;
        ball.settled = true;
        
        // Performance management check: clip rendering element count optimization
        balls.splice(b, 1);
        updateTelemetryDisplays();
        continue;
      }
    }

    // Dynamic Tracking Active Balls Render Path
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
  }

  requestAnimationFrame(animatePipeline);
}

// Telemetry Metric Calculations
function updateTelemetryDisplays() {
  telemCount.innerText = `Total Balls: ${totalDropped}`;
  
  // Mathematical distribution metrics
  const mu = totalRows * successProb;
  const variance = totalRows * successProb * (1 - successProb);
  
  telemMean.innerText = `Mean (μ): ${mu.toFixed(2)}`;
  telemVariance.innerText = `Var (σ²): ${variance.toFixed(2)}`;
}

// User Event Interactivity Layout Mapping
function toggleSpawnerState() {
  isSpawning = !isSpawning;
  actionBtn.innerText = isSpawning ? "⏸ PAUSE SPAWNER" : "🚀 ACTIVATE SPAWNER";
  actionBtn.classList.toggle("running", isSpawning);
}

actionBtn.addEventListener("click", () => {
  if (spawnMode === "burst" && !isSpawning) {
    // Generate immediate structured data cluster burst arrays
    for (let i = 0; i < 50; i++) setTimeout(spawnBall, i * 45);
  } else {
    toggleSpawnerState();
  }
});

clearBtn.addEventListener("click", () => {
  balls = [];
  totalDropped = 0;
  binCounts.fill(0);
  updateTelemetryDisplays();
});

overlayBtn.addEventListener("click", () => {
  showOverlay = !showOverlay;
  overlayBtn.innerText = showOverlay ? "Theoretical Curve: ON" : "Theoretical Curve: OFF";
  overlayBtn.classList.toggle("active", showOverlay);
});

// UI Toggles & Panel Controls
document.getElementById("panelHeader").addEventListener("click", () => {
  document.getElementById("ui-layer").classList.toggle("collapsed");
});

let activeTabId = "tabControlsBtn";
function switchPanelTab(targetId) {
  activeTabId = targetId;
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.id === targetId));
  
  document.getElementById("pageControls").style.display = targetId === "tabControlsBtn" ? "block" : "none";
  document.getElementById("pageParams").style.display = targetId === "tabParamsBtn" ? "block" : "none";
  document.getElementById("pageEnv").style.display = targetId === "tabEnvBtn" ? "block" : "none";
  document.getElementById("pageGuide").style.display = targetId === "tabGuideBtn" ? "block" : "none";
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", (e) => switchPanelTab(e.target.id));
});

// Spawn Presets Click Intercept Tracker
document.querySelectorAll(".spawn-mode-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".spawn-mode-btn").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    spawnMode = e.target.getAttribute("data-mode");
    if (isSpawning) toggleSpawnerState(); // clear operational context
    if (spawnMode === "burst") {
      actionBtn.innerText = "💥 TRIGGER BURST (50)";
      actionBtn.style.backgroundColor = "#ff9900";
    } else {
      actionBtn.innerText = "🚀 ACTIVATE SPAWNER";
      actionBtn.style.backgroundColor = "#00ff7f";
    }
  });
});

// Sliders Dynamic Input Matrix Hooks
rowsSlider.addEventListener("input", (e) => {
  totalRows = parseInt(e.target.value);
  rowsTxt.innerText = `${totalRows} ROWS`;
  initSimulationMatrix();
});

probSlider.addEventListener("input", (e) => {
  successProb = parseFloat(e.target.value);
  let status = "Symmetric";
  if (successProb < 0.45) status = "Skewed Left";
  if (successProb > 0.55) status = "Skewed Right";
  probTxt.innerText = `${successProb.toFixed(2)} (${status})`;
  initSimulationMatrix();
});

radiusSlider.addEventListener("input", (e) => {
  ballRadius = parseInt(e.target.value);
  radiusTxt.innerText = `${ballRadius}px`;
});

gravitySlider.addEventListener("input", (e) => {
  gravity = parseFloat(e.target.value);
  gravityTxt.innerText = `${gravity.toFixed(2)} m/s²`;
});

elasticitySlider.addEventListener("input", (e) => {
  restitution = parseFloat(e.target.value);
  elasticityTxt.innerText = `${restitution.toFixed(2)}`;
});

// Bottom Dropdown View Layer Toggle
let showTelemetry = true;
telemetryBtn.addEventListener("click", () => {
  showTelemetry = !showTelemetry;
  telemetryDropdown.style.display = showTelemetry ? "block" : "none";
  telemetryBtn.innerText = showTelemetry ? "STATISTICS ▲" : "STATISTICS ▼";
});

// Keyboard Core Accelerators Hook
window.addEventListener("keydown", (e) => {
  switch (e.key.toLowerCase()) {
    case " ":
      e.preventDefault();
      actionBtn.click();
      break;
    case "c":
      e.preventDefault();
      clearBtn.click();
      break;
    case "h":
      e.preventDefault();
      overlayBtn.click();
      break;
  }
});