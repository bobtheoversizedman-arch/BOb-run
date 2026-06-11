// ==UserScript==
// @name         Bob Run 8.0 - Ultimate Edition
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  Full effects, Mute button, Speed Fix, and Isolated UI.
// @author       BOB
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Prevent duplicate loading
    if (window.hasBobRunLoaded) return;
    window.hasBobRunLoaded = true;

    // --- GAME STATE VARIABLES ---
    let isOpen = false;
    let gameStarted = false;
    let isGameOver = false;
    let isPaused = false;
    let isMuted = false;
    let musicStarted = false;
    let animationId;
    let frame = 0;
    let score = 0;
    let gameSpeed = 6;
    let isRaining = false;
    let canLightning = true;
    let isSandstorm = false;
    let isSnowing = false;
    let isShower = false;
    let spacerock = false;

    const snowflakes = Array.from({length: 400}, () => ({
    x: Math.random() * 1200,
    y: Math.random() * 400,
    s: Math.random() * 3 + 1, // Size
    v: Math.random() * 1 + 0.5 // Falling speed
}));

    const sandParticles = Array.from({length: 500}, () => ({
        x: Math.random() * 1200,
        y: Math.random() * 400,
        vx: -5 - Math.random() * 5,
        vy: (Math.random() - 0.5) * 2
    }));

    const cycle = 1800; // Frames per day/night cycle

    // --- 1. STYLES ---
    const style = document.createElement('style');
    style.innerHTML = `
        #bob-wrapper {
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 1240px;
            background: #f0f0f0;
            border: 5px solid #535353;
            box-shadow: 0 10px 60px rgba(0,0,0,0.8);
            z-index: 2147483647;
            padding: 20px;
            border-radius: 12px;
            font-family: 'Courier New', monospace;
            text-align: center;
            color: #333;
            transition: background 2s, color 2s;
        }

        #bob-wrapper.night {
            background: #1a1a2e !important;
            color: #eee !important;
        }

        #bob-canvas-container {
            position: relative;
            width: 1200px;
            height: 400px;
            margin: 0 auto;
            overflow: hidden;
            border-radius: 4px;
        }

        #bob-canvas {
            background: #fff;
            border-bottom: 4px solid #535353;
            display: block;
            transition: filter 0.5s;
        }

        #bob-wrapper.night #bob-canvas {
            filter: invert(0.9) hue-rotate(180deg);
        }

        #bob-wrapper.flash #bob-canvas {
            filter: brightness(4) !important;
            transition: filter 0.1s;
        }

        #bob-mute-btn {
            position: absolute;
            top: 15px;
            left: 20px;
            cursor: pointer;
            font-size: 24px;
            user-select: none;
            z-index: 100;
        }

        #bob-close-btn {
            position: absolute;
            top: 10px;
            right: 20px;
            cursor: pointer;
            font-size: 30px;
            font-weight: bold;
            color: #888;
        }

        #bob-death-screen {
            display: none;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10;
        }

        .bob-blink {
            animation: bob-blink-anim 1.5s infinite;
        }

        @keyframes bob-blink-anim {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }
    `;
    document.head.appendChild(style);

    // --- 2. HTML STRUCTURE ---
    const wrapper = document.createElement('div');
    wrapper.id = "bob-wrapper";
    wrapper.innerHTML = `
        <div id="bob-mute-btn">🔊</div>
        <div id="bob-close-btn">×</div>
        <div style="font-size: 32px; font-weight: bold; margin-bottom: 15px;">
        <div id="bob-full-btn" style="position:absolute; top:15px; left:60px; cursor:pointer; font-size: 24px;">⛶</div>

            DAY <span id="bob-dayNum">1</span> | HI <span id="bob-hiScore">00000</span> | <span id="bob-score">00000</span>
            <div id="bob-lBoard" style="font-size: 14px; color: #888; margin-top: 5px;">TOP RUNS: 00000</div>
        </div>
        <div id="bob-canvas-container">
            <canvas id="bob-canvas" width="1200" height="400"></canvas>
            <div id="bob-death-screen">
                <h1 style="font-size:70px; color:#ffffff; margin:0; letter-spacing: 10px;">YOU DIED</h1>
                <div style="font-size: 28px; margin: 25px 0;">FINAL SCORE: <span id="bob-death-score">00000</span></div>
                <div class="bob-blink" style="font-size: 20px; color: #aaa;">Press SPACE to Restart</div>
            </div>
        </div>
        <p style="margin-top:15px; font-size:14px; color:#888;">
            <b>SPACE</b> Jump/Start | <b>DOWN</b> Crawl | <b>P</b> Pause | <b>M</b> Mute | <b>CTRL+B</b> Toggle
        </p>
    `;
    document.body.appendChild(wrapper);

    // --- 3. AUDIO ENGINE ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    function playSound(freq, type, duration, vol = 0.1, slide = 0) {
        if (isMuted) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            if (slide) {
                osc.frequency.exponentialRampToValueAtTime(slide, audioCtx.currentTime + duration);
            }
            gain.gain.setValueAtTime(vol, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (err) {
            console.warn("Audio error:", err);
        }
    }

    function playMusic(frame, isCity) {
        if (!musicStarted || isGameOver || isPaused || !gameStarted || isMuted) return;
        if (frame % 15 === 0) {
            let beat = Math.floor(frame / 15) % 8;
            let notes = isCity
                ? [220, 220, 330, 220, 392, 220, 330, 246]
                : [110, 110, 146, 110, 164, 110, 146, 123];
            playSound(notes[beat], isCity ? 'square' : 'triangle', 0.2, 0.02);
        }
    }

    // --- 4. GAME ASSETS ---
    const canvas = document.getElementById('bob-canvas');
    const ctx = canvas.getContext('2d');

    const meteorites = Array.from({length: 5}, () => ({
    x: Math.random() * 1400,
    y: Math.random() * 150,
    speed: Math.random() * 4 + 7,
    len: 20
}));

    const stars = Array.from({length: 80}, () => ({
        x: Math.random() * 1200,
        y: Math.random() * 150,
        s: Math.random() * 1 + 1.5
    }));

    const clouds = [
        {x: 100, y: 60}, {x: 500, y: 100},
        {x: 900, y: 40}, {x: 1100, y: 80}
    ];

    const mountains = [
        {x: 0, w: 500, h: 150},
        {x: 500, w: 600, h: 220},
        {x: 900, w: 500, h: 130}
    ];

    const cityBuildings = Array.from({length: 15}, (_, i) => ({
        x: i * 120,
        w: 60 + Math.random() * 80,
        h: 80 + Math.random() * 220,
        windows: Array.from({length: 12}, () => ({
            wx: Math.random() * 0.7 + 0.1,
            wy: Math.random() * 0.8 + 0.05
        }))
    }));

    const groundDetails = Array.from({length: 100}, () => ({
        x: Math.random() * 1200,
        y: 385 + Math.random() * 15,
        w: 2 + Math.random() * 6,
        type: Math.random() > 0.8 ? 'grass' : 'dirt'
    }));

    const raindrops = Array.from({length: 60}, () => ({
        x: Math.random() * 1200,
        y: Math.random() * 400,
        s: 15 + Math.random() * 5
    }));

    const bob = {
        x: 150,
        y: 300,
        w: 60,
        h: 85,
        dy: 0,
        jumpForce: 15,
        gravity: 0.7,
        grounded: false,
        isDucking: false,

        draw() {
            ctx.strokeStyle = "#999";
            ctx.fillStyle = "#f2f2f2";
            ctx.lineWidth = 2;
            let s = (!gameStarted || isPaused || !this.grounded) ? 0 : Math.sin(frame * 0.2) * 0.9;

            if (this.isDucking) {
                let cY = this.y + 45;
                ctx.beginPath();
                ctx.ellipse(this.x+30, cY+25, 35, 15, 0, 0, Math.PI*2);
                ctx.fill(); ctx.stroke();
                ctx.beginPath();
                ctx.arc(this.x+70, cY+15, 15, 0, Math.PI*2);
                ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#999";
                ctx.beginPath();
                ctx.arc(this.x+78, cY+12, 2, 0, Math.PI*2);
                ctx.fill();
                this.drawLimb(this.x+20, cY+30, 1.5+s, 15);
                this.drawLimb(this.x+50, cY+30, 1.5-s, 15);
            } else {
                ctx.strokeStyle = "#bbb";
                this.drawLimb(this.x + 30, this.y + 45, -0.6 + s);
                this.drawLimb(this.x + 30, this.y + 78, 0.8 + s);
                ctx.strokeStyle = "#999";
                ctx.fillStyle = "#f2f2f2";
                ctx.beginPath();
                ctx.ellipse(this.x+30, this.y+55, 22, 32, 0, 0, Math.PI*2);
                ctx.fill(); ctx.stroke();
                ctx.beginPath();
                ctx.arc(this.x+30, this.y+15, 18, 0, Math.PI*2);
                ctx.fill(); ctx.stroke();
                ctx.fillStyle = "#999";
                ctx.beginPath();
                ctx.arc(this.x+40, this.y+12, 2.5, 0, Math.PI*2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(this.x+38, this.y+20, 5, 0.2, Math.PI-0.5);
                ctx.stroke();
                ctx.strokeStyle = "#666";
                this.drawLimb(this.x + 30, this.y + 45, 0.6 - s);
                this.drawLimb(this.x + 30, this.y + 78, -0.8 - s);
            }
        },
        drawLimb(x, y, a, len=30) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(a);
            ctx.strokeRect(-2, 0, 4, len);
            ctx.restore();
        }
    };

    let obstacles = [];
    function spawnObstacle() {
        let type = Math.random() > 0.6 ? 'bird' : 'cactus';
        if (type === 'bird') {
            obstacles.push({ x: 1250, y: 280, w: 50, h: 30, type: 'bird' });
        } else {
            obstacles.push({ x: 1250, y: 345, w: 25, h: 55, type: 'cactus' });
        }
    }

    // --- 5. MAIN GAME LOOP ---
    function update() {
        if (!isOpen) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let day = Math.floor(frame / cycle) + 1;
        let isNight = (frame % cycle > cycle / 2);
        let isCityTheme = (day % 6 === 5 || day % 6 === 0);

        document.getElementById('bob-dayNum').innerText = day;
        wrapper.className = isNight ? 'night' : '';

        if (!gameStarted) {
            bob.draw();
            ctx.fillStyle = isNight ? "#eee" : "#535353";
            ctx.font = "bold 30px Courier";
            ctx.fillText("PRESS SPACE TO START", 410, 200);
            animationId = requestAnimationFrame(update);
            return;
        }

        if (isGameOver || isPaused) {
            if (isPaused) {
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.fillRect(0,0,1200,400);
                ctx.fillStyle = "white";
                ctx.font = "bold 40px Courier";
                ctx.fillText("PAUSED", 540, 200);
            }
            animationId = requestAnimationFrame(update);
            return;
        }

        frame++;
        playMusic(frame, isCityTheme);

        // --- DRAW BACKGROUND ---
        if (isNight) {
            ctx.fillStyle = "#000000";
            stars.forEach(s => {
                ctx.globalAlpha = Math.sin(frame * 0.05 + s.x) * 0.5 + 0.5;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        // Sun / Moon
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(1100, 70, 40, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Clouds
        ctx.strokeStyle = "#ddd";
        clouds.forEach(c => {
            c.x -= gameSpeed * 0.05;
            if (c.x < -150) c.x = 1300;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 25, 0, Math.PI * 2);
            ctx.arc(c.x + 25, c.y - 15, 25, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Theme Switch
        if (isCityTheme) {
            cityBuildings.forEach(b => {
                b.x -= gameSpeed * 0.12;
                if (b.x + b.w < 0) b.x = 1300;
                ctx.fillStyle = "#ddd";
                ctx.fillRect(b.x, 385 - b.h, b.w, b.h);
                ctx.strokeStyle = "#bbb";
                ctx.strokeRect(b.x, 385 - b.h, b.w, b.h);
                b.windows.forEach(win => {
                    ctx.fillStyle = isNight ? "#fff" : "#999";
                    ctx.fillRect(b.x + (b.w * win.wx), (385 - b.h) + (b.h * win.wy), 8, 12);
                });
            });
        } else {
            ctx.strokeStyle = "#ccc";
            mountains.forEach(m => {
                m.x -= gameSpeed * 0.18;
                if (m.x + m.w < 0) m.x = 1300;
                ctx.beginPath();
                ctx.moveTo(m.x, 385);
                ctx.lineTo(m.x + m.w / 2, 385 - m.h);
                ctx.lineTo(m.x + m.w, 385);
                ctx.stroke();
            });
        }

        // --- DRAW GROUND ---
        ctx.strokeStyle = "#535353";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 385);
        ctx.lineTo(1200, 385);
        ctx.stroke();

        ctx.lineWidth = 2;
        ctx.beginPath();
        groundDetails.forEach(dot => {
            dot.x -= gameSpeed;
            if (dot.x < 0) dot.x = 1200;
            if (dot.type === 'grass') {
                ctx.moveTo(dot.x, dot.y);
                ctx.lineTo(dot.x - 3, dot.y - 10);
            }
        });
        ctx.strokeStyle = "#535353";
        ctx.stroke();

        groundDetails.forEach(dot => {
            if (dot.type !== 'grass') {
                ctx.fillStyle = "#d1d1d1";
                ctx.fillRect(dot.x, dot.y, dot.w, 3);
            }
        });

        // --- WEATHER EFFECTS ---
isSandstorm = (day % 15 === 0);
isRaining = (day % 7 === 3) && !isSandstorm;
let isSnowing = (day % 20 === 0) && !isSandstorm && !isRaining;

// Run this calculation whenever a new day starts
if (day % 10 === 0 && isNight) {
    spacerock = true; // Switch it ON automatically
    
    // 🛡️ CRASH SAFEGUARD: If meteorites array is missing or empty, build it instantly!
    if (typeof meteorites === 'undefined' || !meteorites || meteorites.length === 0) {
        window.meteorites = Array.from({ length: 5 }, () => {
            const baseSize = Math.random() * 8 + 6;
            const totalVertices = 8;
            return {
                x: Math.random() * 1200,
                y: Math.random() * -200,
                size: baseSize,
                vertices: totalVertices,
                offsets: Array.from({ length: totalVertices }, () => Math.random() * 0.4 + 0.8),
                angle: Math.random() * Math.PI * 2,
                spin: Math.random() * 0.05 - 0.025,
                speedY: Math.random() * 3 + 4,
                speedX: Math.random() * 4 - 2,
                sparks: []
            };
        });
    }
} else {
    spacerock = false; // Switch it OFF on other days
}

// ==============================================================
// 3. DRAW JAGGED SPACE ROCKS (Drawn hitting earth layer)
// ==============================================================
if (spacerock && typeof meteorites !== 'undefined' && meteorites) {
    meteorites.forEach(m => {
        if (!m || !m.vertices || !m.offsets) return;
        if (!m.sparks) m.sparks = [];

        // 1. Apply falling physics and spin rotation
        m.y += m.speedY;
        m.x += m.speedX;
        m.angle += m.spin; 

        // 2. DRAW ASYMMETRICAL ASTEROID BODY
        ctx.fillStyle = "#444446"; 
        ctx.strokeStyle = "#222224"; 
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        for (let i = 0; i < m.vertices; i++) {
            let currentAngle = m.angle + (i * (Math.PI * 2 / m.vertices));
            let radius = m.size * m.offsets[i]; 
            
            let vertexX = m.x + Math.cos(currentAngle) * radius;
            let vertexY = m.y + Math.sin(currentAngle) * radius;
            
            if (i === 0) {
                ctx.moveTo(vertexX, vertexY);
            } else {
                ctx.lineTo(vertexX, vertexY);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 3. CRASH DETECTION: Ground impact (Y = 385)
        if (m.y >= 385) {
            // Spawn 8 pieces of exploding debris/dust at the crash site
            for (let i = 0; i < 8; i++) {
                m.sparks.push({
                    sx: m.x,
                    sy: 385,
                    vx: Math.random() * 4 - 2,
                    vy: Math.random() * -3 - 1, 
                    alpha: 1
                });
            }

            // Reset the rock back to space with safe geometry rules
            m.y = Math.random() * -150;
            m.x = Math.random() * 1200;
            m.speedY = Math.random() * 3 + 4;
            m.speedX = Math.random() * 4 - 2;
            m.angle = Math.random() * Math.PI * 2;
            m.offsets = Array.from({ length: m.vertices }, () => Math.random() * 0.4 + 0.8);
        }

        // 4. Update and draw the exploding impact dust
        m.sparks.forEach(s => {
            s.sx += s.vx;
            s.sy += s.vy;
            s.alpha -= 0.04; 

            ctx.fillStyle = `rgba(180, 90, 30, ${s.alpha})`; 
            ctx.beginPath();
            ctx.arc(s.sx, s.sy, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // 5. SAFE CLEANUP: Filter out dead particles safely
        m.sparks = m.sparks.filter(s => s.alpha > 0);
    });
}


        



// ==============================================================
// 3. DRAW METEOR SHOWER (Drawn behind the landscapes)
// ==============================================================
if (isShower) {
    meteorites.forEach(m => {
        // Move diagonally across the upper sky
        m.y += m.speed * 0.5;
        m.x -= m.speed * 1.5;

        // Reset rules: Burn out at Y = 150 (Safely above mountain peaks)
        if (m.y > 150 || m.x < -50) {
            m.y = Math.random() * -50;
            m.x = Math.random() * 1400 + 200;
            m.speed = Math.random() * 4 + 7;
        }

        // Draw sleek high-altitude cosmic lines
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + m.len * 1.5, m.y - m.len);
        ctx.stroke();
    });
}

if (isSandstorm) {
    ctx.fillStyle = "#000";
    sandParticles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = 1200;
        if (p.y < 0) p.y = 400;
        if (p.y > 400) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.0, 0, Math.PI * 2); ctx.fill();
    });
    if (frame % 50 === 0) playSound(100, 'square', 0.1, 0.1, 50);

} else if (isRaining) {
    ctx.strokeStyle = "#000";
    raindrops.forEach(r => {
        r.y += r.s; r.x -= 2;
        if (r.y > 400) { r.y = -20; r.x = Math.random() * 1200; }
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - 2, r.y + 20); ctx.stroke();
    });
    if (canLightning && Math.random() > 0.990) {
        wrapper.classList.add('flash');
        playSound(40, 'sawtooth', 0.5, 0.08, 120);
        setTimeout(() => wrapper.classList.remove('flash'), 500);
    }

} else if (isSnowing) {
    // New Snow Logic
    ctx.fillStyle = "#000000";
    snowflakes.forEach(s => {
        s.y += s.v;
        s.x += Math.sin(frame * 0.02) * 0.5; // Slight sway
        if (s.y > 400) { s.y = -5; s.x = Math.random() * 1200; }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.s * 2.5, 0, Math.PI * 2);
        ctx.fill();
    });
}

        // --- BOB PHYSICS ---
        bob.dy += bob.gravity;
        bob.y += bob.dy;
        if (bob.y > 300) { bob.y = 300; bob.dy = 0; bob.grounded = true; }
        bob.draw();

        // --- OBSTACLE LOGIC ---
        if (frame % 90 === 0) spawnObstacle();

        obstacles.forEach((ob, i) => {
            ob.x -= gameSpeed;
            ctx.fillStyle = "#535353";

            // 1. DRAWING
            if (ob.type === 'bird') {
                ctx.fillStyle = "#535353";
                ctx.fillRect(ob.x, ob.y, ob.w, 15); // Solid body

                let w = Math.sin(frame * 0.3) * 20;
                ctx.strokeStyle = "#535353";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(ob.x + 25, ob.y);
                ctx.lineTo(ob.x + 25, ob.y - w);
                ctx.stroke();
            } else {
                ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
            }

            // 2. COLLISION DETECTION (Required to make the game playable)
            let bx = bob.x + 15, bw = 30;
            let by = bob.isDucking ? bob.y + 60 : bob.y;
            let bh = bob.isDucking ? 35 : 85;

            if (bx < ob.x + ob.w && bx + bw > ob.x && by < ob.y + ob.h && by + bh > ob.y) {
                endGame();
            }

            // 3. CLEANUP (Required to prevent lag/crashing)
            if (ob.x < -100) {
                obstacles.splice(i, 1);
            }
        });
        score++;
        document.getElementById('bob-score').innerText = Math.floor(score / 5).toString().padStart(5, '0');
        gameSpeed += 0.00015;
        animationId = requestAnimationFrame(update);
    }

    function endGame() {
        isGameOver = true;
        playSound(100, 'sawtooth', 0.5, 0.05, 50);
        document.getElementById('bob-death-score').innerText = Math.floor(score / 5).toString().padStart(5, '0');
        document.getElementById('bob-death-screen').style.display = 'flex';

        let localScores = JSON.parse(localStorage.getItem('bobLeaderboard')) || [0];
        localScores.push(score);
        localScores.sort((a, b) => b - a);
        localStorage.setItem('bobLeaderboard', JSON.stringify(localScores.slice(0, 5)));

        let hi = Math.max(...localScores);
        document.getElementById('bob-hiScore').innerText = Math.floor(hi / 5).toString().padStart(5, '0');
        document.getElementById('bob-lBoard').innerText = "TOP RUNS: " + localScores.slice(0, 3).map(s => Math.floor(s/5).toString().padStart(5, '0')).join(" | ");
    }

    function toggleMute() {
        isMuted = !isMuted;
        document.getElementById('bob-mute-btn').innerText = isMuted ? "🔇" : "🔊";
    }

    // --- 6. KEYBOARD & UI EVENTS ---
    window.addEventListener('keydown', e => {
        if (e.ctrlKey && e.code === 'KeyB') {
            e.preventDefault();
            isOpen = !isOpen;
            wrapper.style.display = isOpen ? 'block' : 'none';
            if (isOpen) {
                if (audioCtx.state === 'suspended') audioCtx.resume();
                // If the game was already running, don't restart the loop, just keep it going
                if (!animationId) update();
            } else {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            return;
        }

        if (!isOpen) return;

        if (e.code === 'Space') {
            e.preventDefault();
            if (!musicStarted) { audioCtx.resume(); musicStarted = true; }
            if (!gameStarted) { gameStarted = true; return; }
            if (isGameOver) {
                score = 0; frame = 0; gameSpeed = 6; obstacles = [];
                isGameOver = false;
                document.getElementById('bob-death-screen').style.display = 'none';
                return;
            }
            if (bob.grounded && !bob.isDucking && !isPaused) {
                bob.dy = -bob.jumpForce;
                bob.grounded = false;
                playSound(440, 'square', 0.15, 0.05, 880);
            }
        }
        if (e.code === 'ArrowDown' && bob.grounded) {
            e.preventDefault();
            bob.isDucking = true;
        }
        if (e.code === 'KeyP') {
            e.preventDefault();
            isPaused = !isPaused;
        }
        if (e.code === 'KeyM') {
            e.preventDefault();
            toggleMute();
        }
    }, { passive: false });

    window.addEventListener('keyup', e => {
        if (e.code === 'ArrowDown') bob.isDucking = false;
    });

    document.getElementById('bob-mute-btn').onclick = toggleMute;
    document.getElementById('bob-close-btn').onclick = () => {
        isOpen = false;
        wrapper.style.display = 'none';
        cancelAnimationFrame(animationId);
        animationId = null;
    };

    const savedScores = JSON.parse(localStorage.getItem('bobLeaderboard')) || [0];
    const bestScore = Math.max(...savedScores);
    document.getElementById('bob-hiScore').innerText = Math.floor(bestScore / 5).toString().padStart(5, '0');

    function toggleFullScreen() {
        if (!document.fullscreenElement) {
            wrapper.requestFullscreen().catch(err => {
                console.log(`Error: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    document.getElementById('bob-full-btn').onclick = toggleFullScreen;

})();