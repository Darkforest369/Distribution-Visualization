const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Constants & Theme Palette (Matching Pendulum exactly)
const MAX_BODIES = 5;
const universeColors = ["#00e5ff", "#ff3366", "#ff9900", "#e5ff00", "#00ff7f"];
const SUBSTEPS = 6; 
let G = 1.0;
let softening = 15.0; 

// Viewport / State
let cx, cy;
let bodies = [];
let isRunning = false;
let showTrails = true;
let showGrid = true;
let showTelemetry = true;

// Interaction State
let draggedBody = null;
let launchMode = false;
let launchStart = { x: 0, y: 0 };
let launchCurrent = { x: 0, y: 0 };

// UI Elements
const actionBtn = document.getElementById("actionBtn");
const trailsBtn = document.getElementById("trailsBtn");
const gridBtn = document.getElementById("gridBtn");
const telemetryPanel = document.getElementById("telemetry-panel");
const colorLegends = document.getElementById("colorLegends");

// Utility to ensure opacity works perfectly with the hex codes
function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ----------------------------------------------------
// Core Physics Engine (Substepped Symplectic Euler)
// ----------------------------------------------------
function updatePhysics() {
    if (!isRunning) return;
    const dt = 0.016 / SUBSTEPS;

    for (let step = 0; step < SUBSTEPS; step++) {
        // Calculate gravitational forces (Kick)
        for (let i = 0; i < bodies.length; i++) {
            let ax = 0, ay = 0;
            for (let j = 0; j < bodies.length; j++) {
                if (i === j) continue;
                let dx = bodies[j].x - bodies[i].x;
                let dy = bodies[j].y - bodies[i].y;
                let distSq = dx * dx + dy * dy + (softening * softening);
                let dist = Math.sqrt(distSq);
                
                let force = (G * bodies[j].mass) / distSq;
                ax += force * (dx / dist);
                ay += force * (dy / dist);
            }
            if (bodies[i] !== draggedBody) {
                bodies[i].vx += ax * dt;
                bodies[i].vy += ay * dt;
            }
        }

        // Apply velocities to positions (Drift)
        for (let i = 0; i < bodies.length; i++) {
            if (bodies[i] !== draggedBody) {
                bodies[i].x += bodies[i].vx * dt;
                bodies[i].y += bodies[i].vy * dt;
            }
        }
    }

    // Handle Trails Cache
    if (showTrails) {
        for (let b of bodies) {
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 150) b.trail.shift();
        }
    }
}

// ----------------------------------------------------
// UI & Input Binding
// ----------------------------------------------------
function setupUI() {
    const tabs = ["tabLiveBtn", "tabPresetsBtn", "tabEnvBtn"];
    const pages = ["pageControls", "pagePresets", "pageEnv"];

    // Fixed Bug: Properly navigating tabs using classList
    tabs.forEach((tabId, idx) => {
        document.getElementById(tabId).addEventListener("click", () => {
            tabs.forEach(t => document.getElementById(t).classList.remove("active"));
            pages.forEach(p => document.getElementById(p).style.display = "none");
            
            document.getElementById(tabId).classList.add("active");
            document.getElementById(pages[idx]).style.display = "block";
        });
    });

    document.getElementById("panelHeader").addEventListener("click", () => {
        document.getElementById("ui-layer").classList.toggle("collapsed");
        document.getElementById("toggleIcon").innerText = 
            document.getElementById("ui-layer").classList.contains("collapsed") ? "▼" : "▲";
    });

    actionBtn.addEventListener("click", () => {
        isRunning = !isRunning;
        actionBtn.innerText = isRunning ? "🛑 PAUSE ENGINE" : "🚀 RELEASE ENGINE";
        actionBtn.classList.toggle("running", isRunning);
        if(!isRunning) {
            actionBtn.style.backgroundColor = "#00ff7f";
            actionBtn.style.color = "#000";
        } else {
            actionBtn.style.backgroundColor = ""; 
            actionBtn.style.color = "";
        }
    });

    document.getElementById("clearBtn").addEventListener("click", () => { bodies = []; updateLegends(); });

    trailsBtn.addEventListener("click", () => {
        showTrails = !showTrails;
        trailsBtn.innerText = showTrails ? "Trails: ON" : "Trails: OFF";
        trailsBtn.style.backgroundColor = showTrails ? "#ff9900" : "#222";
        trailsBtn.style.color = showTrails ? "#000" : "#888";
        trailsBtn.style.borderColor = showTrails ? "transparent" : "#444";
        if (!showTrails) bodies.forEach(b => b.trail = []);
    });

    gridBtn.addEventListener("click", () => {
        showGrid = !showGrid;
        gridBtn.innerText = showGrid ? "Grid Overlay: ON" : "Grid Overlay: OFF";
        gridBtn.style.backgroundColor = showGrid ? "#e5ff00" : "#222";
        gridBtn.style.color = showGrid ? "#000" : "#888";
        gridBtn.style.borderColor = showGrid ? "transparent" : "#444";
    });

    document.getElementById("telemetryBtn").addEventListener("click", () => {
        showTelemetry = !showTelemetry;
        telemetryPanel.style.display = showTelemetry ? "block" : "none";
        document.getElementById("telemetryBtn").innerText = showTelemetry ? "TELEMETRY: ON" : "TELEMETRY: OFF";
    });

    document.getElementById("gSlider").addEventListener("input", (e) => {
        G = parseFloat(e.target.value);
        document.getElementById("gTxt").innerText = G.toFixed(2);
    });

    document.getElementById("softeningSlider").addEventListener("input", (e) => {
        softening = parseFloat(e.target.value);
        document.getElementById("softeningTxt").innerText = `${softening} px`;
    });

    document.getElementById("spawnMassSlider").addEventListener("input", (e) => {
        document.getElementById("massDisplayTxt").innerText = `Mass: ${e.target.value}`;
    });

    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.addEventListener("click", (e) => loadPreset(e.target.getAttribute("data-preset")));
    });
}

function initMouseInteractions() {
    canvas.addEventListener("mousedown", (e) => {
        // Prevent launching if clicking inside the UI elements
        if (e.clientX < 360 && e.clientY < window.innerHeight * 0.8) return;

        let mX = e.clientX - cx;
        let mY = e.clientY - cy;

        // Check if clicking an existing body to drag it
        draggedBody = null;
        for (let i = bodies.length - 1; i >= 0; i--) {
            let b = bodies[i];
            if (Math.hypot(mX - b.x, mY - b.y) <= b.radius + 5) {
                draggedBody = b;
                draggedBody.vx = 0; draggedBody.vy = 0; // stop moving
                break;
            }
        }

        // If not grabbing a body, start slingshot (ONLY if under MAX_BODIES)
        if (!draggedBody) {
            if (bodies.length >= MAX_BODIES) {
                alert(`Maximum limit of ${MAX_BODIES} bodies reached! Clear the board to add more.`);
                return;
            }
            launchMode = true;
            launchStart = { x: mX, y: mY };
            launchCurrent = { x: mX, y: mY };
        }
    });

    canvas.addEventListener("mousemove", (e) => {
        let mX = e.clientX - cx;
        let mY = e.clientY - cy;
        
        if (draggedBody) {
            draggedBody.x = mX;
            draggedBody.y = mY;
            draggedBody.trail = []; 
        } else if (launchMode) {
            launchCurrent = { x: mX, y: mY };
        }
    });

    window.addEventListener("mouseup", () => {
        if (draggedBody) {
            draggedBody = null; 
        } else if (launchMode) {
            launchMode = false;
            // Spawn new body based on slingshot vector
            let mass = parseFloat(document.getElementById("spawnMassSlider").value);
            let vx = (launchStart.x - launchCurrent.x) * 0.05;
            let vy = (launchStart.y - launchCurrent.y) * 0.05;
            
            bodies.push({
                x: launchStart.x, y: launchStart.y,
                vx: vx, vy: vy,
                mass: mass,
                radius: Math.max(4, Math.log10(mass) * 4),
                color: universeColors[bodies.length % universeColors.length],
                trail: []
            });
            updateLegends();
        }
    });

    // Hotkeys
    window.addEventListener("keydown", (e) => {
        if (e.code === "Space") { e.preventDefault(); actionBtn.click(); }
        if (e.key.toLowerCase() === "c") document.getElementById("clearBtn").click();
        if (e.key.toLowerCase() === "t") trailsBtn.click();
        if (e.key.toLowerCase() === "g") gridBtn.click();
        
        // Presets Hotkeys
        if (e.key === "1") loadPreset("solar");
        if (e.key === "2") loadPreset("figure8");
        if (e.key === "3") loadPreset("lagrange");
        if (e.key === "4") loadPreset("chaos");
    });
}

// ----------------------------------------------------
// Presets & Rendering
// ----------------------------------------------------
function loadPreset(type) {
    bodies = [];
    if (type === "solar") {
        bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 2500, radius: 15, color: "#e5ff00", trail: [] });
        bodies.push({ x: 0, y: -120, vx: 4.5, vy: 0, mass: 10, radius: 5, color: "#00e5ff", trail: [] });
        bodies.push({ x: 0, y: -220, vx: 3.3, vy: 0, mass: 45, radius: 8, color: "#00ff7f", trail: [] });
        bodies.push({ x: 320, y: 0, vx: 0, vy: 2.7, mass: 80, radius: 10, color: "#ff9900", trail: [] });
    } else if (type === "figure8") {
        let m = 1000, x1 = -180, y1 = 45, vx1 = 2.3, vy1 = 2.1;
        bodies.push({ x: x1, y: y1, vx: vx1, vy: vy1, mass: m, radius: 12, color: "#00e5ff", trail: [] });
        bodies.push({ x: -x1, y: -y1, vx: vx1, vy: vy1, mass: m, radius: 12, color: "#ff3366", trail: [] });
        bodies.push({ x: 0, y: 0, vx: -2*vx1, vy: -2*vy1, mass: m, radius: 12, color: "#00ff7f", trail: [] });
    } else if (type === "lagrange") {
        bodies.push({ x: 0, y: 0, vx: 0, vy: 0, mass: 3000, radius: 18, color: "#ff9900", trail: [] });
        bodies.push({ x: 200, y: 0, vx: 0, vy: 3.8, mass: 150, radius: 10, color: "#00e5ff", trail: [] });
        let angle = Math.PI / 3; // L4 is 60 degrees ahead
        bodies.push({ x: 200*Math.cos(angle), y: 200*Math.sin(angle), vx: -3.8*Math.sin(angle), vy: 3.8*Math.cos(angle), mass: 0.1, radius: 4, color: "#fff", trail: [] });
    } else if (type === "chaos") {
        bodies.push({ x: -100, y: 0, vx: 0, vy: -2, mass: 1500, radius: 14, color: "#ff3366", trail: [] });
        bodies.push({ x: 100, y: 0, vx: 0, vy: 2, mass: 1500, radius: 14, color: "#00e5ff", trail: [] });
        bodies.push({ x: 0, y: 150, vx: -3, vy: 0, mass: 50, radius: 7, color: "#e5ff00", trail: [] });
    }
    updateLegends();
}

function updateLegends() {
    colorLegends.innerHTML = "";
    bodies.forEach((b, i) => {
        let div = document.createElement("div");
        div.className = "color-legend";
        div.innerHTML = `<div class="color-box" style="background: ${b.color}"></div> <span>Body ${i+1} [M: ${b.mass}]</span>`;
        colorLegends.appendChild(div);
    });
}

function drawGrid() {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    for (let x = cx % 100; x < canvas.width; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = cy % 100; y < canvas.height; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    ctx.restore();
}

function updateTelemetry() {
    document.getElementById("telCount").innerText = `${bodies.length} / ${MAX_BODIES}`;
    let ke = 0, pe = 0;
    for (let i = 0; i < bodies.length; i++) {
        ke += 0.5 * bodies[i].mass * (bodies[i].vx**2 + bodies[i].vy**2);
        for (let j = i + 1; j < bodies.length; j++) {
            let dist = Math.hypot(bodies[j].x - bodies[i].x, bodies[j].y - bodies[i].y) + softening;
            pe -= (G * bodies[i].mass * bodies[j].mass) / dist;
        }
    }
    document.getElementById("telEnergy").innerText = `${(ke + pe).toFixed(2)} J`;
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (showGrid) drawGrid();
    
    updatePhysics();
    if (showTelemetry) updateTelemetry();

    ctx.save();
    ctx.translate(cx, cy);

    // Draw fading trails
    if (showTrails) {
        for (let b of bodies) {
            if (b.trail.length < 2) continue;
            ctx.beginPath();
            for (let i = 0; i < b.trail.length; i++) {
                if (i === 0) ctx.moveTo(b.trail[i].x, b.trail[i].y);
                else ctx.lineTo(b.trail[i].x, b.trail[i].y);
            }
            ctx.strokeStyle = hexToRgba(b.color, 0.4);
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // Draw predictive slingshot line
    if (launchMode) {
        ctx.beginPath();
        ctx.moveTo(launchStart.x, launchStart.y);
        ctx.lineTo(launchCurrent.x, launchCurrent.y);
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = "rgba(0, 229, 255, 0.5)";
        ctx.beginPath();
        ctx.arc(launchStart.x, launchStart.y, Math.max(4, Math.log10(parseFloat(document.getElementById("spawnMassSlider").value)) * 4), 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Bodies
    for (let b of bodies) {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        
        if (b === draggedBody) {
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
    
    ctx.restore();
    requestAnimationFrame(render);
}

function resizeViewport() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cx = canvas.width / 2;
    cy = canvas.height / 2;
}

window.addEventListener("resize", resizeViewport);
window.onload = () => {
    resizeViewport();
    setupUI();
    initMouseInteractions();
    loadPreset("solar");
    requestAnimationFrame(render);
};