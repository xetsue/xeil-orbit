# This is simply an alternative Script to run the game from a terminal via port-forwarding locally.
import http.server
import socketserver

PORT = 8000

HTML_CONTENT = r"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>ASCII Space Explorer</title>
    <style>
        body {
            margin: 0;
            overflow: hidden;
            background-color: #000;
            color: #fff;
            font-family: monospace;
            line-height: 1;
            cursor: none;
            touch-action: none;
            user-select: none;
        }
        #game {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            white-space: pre;
            font-size: 16px;
            letter-spacing: 0.5px;
        }
        #player {
            color: #ff0000; /* Player color changed to red */
            position: absolute;
            z-index: 100;
            pointer-events: none;
        }
        #player.autopilot-outline {
            outline: 2px solid white; /* White outline for autopilot */
        }
        #trail-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 99;
        }
        .trail-segment {
            position: absolute;
            color: rgba(0, 255, 255, 0.3);
        }
        #controls {
            position: fixed;
            bottom: 20px;
            width: 100%;
            text-align: center;
            opacity: 1;
            transition: opacity 1s ease-out;
            font-size: 12px;
            color: #aaa;
            pointer-events: none;
        }
        #mobile-controls {
            position: fixed;
            bottom: 0;
            width: 100%;
            height: 150px;
            display: none;
            z-index: 1000;
        }
        .control-area {
            position: absolute;
            width: 40%;
            height: 100%;
            opacity: 0.3;
        }
        #left-control {
            left: 0;
            background-color: red;
        }
        #right-control {
            right: 0;
            background-color: blue;
        }
        #up-control {
            left: 40%;
            width: 20%;
            height: 50%;
            top: 0;
            background-color: green;
        }
        #down-control {
            left: 40%;
            width: 20%;
            height: 50%;
            bottom: 0;
            background-color: yellow;
        }

        /* Scanning UI */
        .scan-outline {
            position: absolute;
            border: 1px solid white;
            border-radius: 50%;
            box-sizing: border-box;
            pointer-events: none;
            z-index: 101;
        }
        .scan-loading-bar-container {
            position: absolute;
            width: 100%;
            height: 8px;
            background-color: rgba(255, 255, 255, 0.3);
            bottom: -20px;
            left: 0;
            pointer-events: none;
            overflow: hidden;
            z-index: 102;
        }
        .scan-loading-bar {
            width: 0%;
            height: 100%;
            background-color: white;
            transition: width 0.1s linear;
        }
        .scan-details {
            position: absolute;
            background-color: rgba(0, 0, 0, 0.7);
            border: 1px solid white;
            color: white;
            padding: 15px; /* Increased padding again */
            font-size: 20px; /* Significantly larger font size for details */
            white-space: pre;
            pointer-events: none;
            z-index: 103;
            transform: translateX(100%);
            transition: transform 0.3s ease-out;
        }
        .scan-details.visible {
            transform: translateX(0);
        }
        .scan-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 101;
        }

        /* Code Button */
        #code-button {
            position: fixed;
            top: 15px; /* Slightly moved down */
            left: 15px; /* Slightly moved right */
            background-color: #333;
            color: #fff;
            border: 1px solid #555;
            border-radius: 12px; /* Slightly more rounded */
            padding: 10px 18px; /* Slightly increased padding */
            font-family: monospace;
            font-size: 20px; /* Significantly larger font */
            cursor: pointer;
            z-index: 1001;
        }
        #code-button:hover {
            background-color: #555;
        }


        @media (max-width: 768px) {
            #mobile-controls {
                display: block;
            }
            #game {
                font-size: 14px;
            }
            .scan-details {
                font-size: 18px; /* Adjust for mobile if needed, but 16px is generally good */
            }
            #code-button {
                font-size: 18px;
                padding: 8px 15px;
            }
        }
    </style>
</head>
<body>
    <div id="game"></div>
    <div id="player">■</div>
    <div id="trail-container"></div>
    <div id="scan-container"></div>
    <div id="controls">
        Use WASD or arrow keys to move | Hold mouse/touch to move in that direction<br>
        Scroll/pinch to zoom | Current zoom: <span id="zoom-level">100%</span>
    </div>
    <div id="mobile-controls">
        <div class="control-area" id="left-control"></div>
        <div class="control-area" id="right-control"></div>
        <div class="control-area" id="up-control"></div>
        <div class="control-area" id="down-control"></div>
    </div>
    <button id="code-button">Code</button>

    <script>
        // Game constants
        const PLAYER_SPEED = 0.1;
        const DRAG = 0.95;
        const TRAIL_LENGTH = 30;
        const STAR_DENSITY = 0.005;
        const PLANET_DENSITY = 0.00005;
        const CHUNK_SIZE = 1000;
        const STAR_BLINK_INTERVAL = 100;
        const MIN_ZOOM = 50;
        const MAX_ZOOM = 200;
        const ZOOM_SPEED = 5;
        const SCAN_RADIUS = 150;
        const SCAN_DELAY = 2000;
        const SCAN_DURATION = 3000;
        const SCAN_DETAIL_OFFSET_X = 20;
        const AUTOPILOT_SPEED_MULTIPLIER = 5;

        // Dynamic viewport sizing
        let viewportCols, viewportRows;
        let cellWidth, cellHeight;
        
        // Game state
        let playerX = 0;
        let playerY = 0;
        let velocityX = 0;
        let velocityY = 0;
        let keys = {};
        let touchControls = { up: false, down: false, left: false, right: false };
        let mouseControl = { active: false, x: 0, y: 0 };
        let lastTime = 0;
        let trail = [];
        let generatedChunks = new Set();
        let stars = [];
        let planets = [];
        let blinkTimer = 0;
        let zoomLevel = 100;
        let lastTouchDistance = 0;

        // Scanning state
        let scanTimer = 0;
        let isScanning = false;
        let lastPlayerMoveTime = Date.now();
        let closestScannablePlanet = null;
        let activeScanElements = new Map();

        // Autopilot state
        let autopilotActive = false;
        let autopilotTargetX = 0;
        let autopilotTargetY = 0;
        let autopilotArrivalThreshold = 10;
        let autopilotTargetPlanetName = ''; // Stores the name (seed) of the target planet
        
        // DOM elements
        const gameElement = document.getElementById('game');
        const playerElement = document.getElementById('player');
        const trailContainer = document.getElementById('trail-container');
        const scanContainer = document.getElementById('scan-container');
        const controlsElement = document.getElementById('controls');
        const zoomLevelElement = document.getElementById('zoom-level');
        const codeButton = document.getElementById('code-button');
        
        function calculateViewport() {
            const temp = document.createElement('div');
            temp.innerHTML = 'X';
            temp.style.position = 'absolute';
            temp.style.visibility = 'hidden';
            temp.style.fontFamily = 'monospace';
            temp.style.fontSize = '16px';
            temp.style.letterSpacing = '0.5px';
            document.body.appendChild(temp);
            cellWidth = temp.offsetWidth;
            cellHeight = temp.offsetHeight;
            document.body.removeChild(temp);
            
            const effectiveCellWidth = cellWidth * (100 / zoomLevel);
            const effectiveCellHeight = cellHeight * (100 / zoomLevel);
            
            viewportCols = Math.floor(window.innerWidth / effectiveCellWidth);
            viewportRows = Math.floor(window.innerHeight / effectiveCellHeight);
            
            if (viewportCols % 2 === 0) viewportCols--;
            if (viewportRows % 2 === 0) viewportRows--;
        }
        
        function init() {
            playerElement.textContent = '■';
            
            calculateViewport();
            window.addEventListener('resize', () => {
                calculateViewport();
                render();
            });
            
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
            window.addEventListener('mousedown', handleMouseDown);
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('wheel', handleWheel);
            window.addEventListener('touchstart', handleTouchStart);
            window.addEventListener('touchmove', handleTouchMove);
            window.addEventListener('touchend', handleTouchEnd);
            
            document.getElementById('up-control').addEventListener('touchstart', (e) => { touchControls.up = true; e.preventDefault(); });
            document.getElementById('up-control').addEventListener('touchend', (e) => { touchControls.up = false; e.preventDefault(); });
            document.getElementById('down-control').addEventListener('touchstart', (e) => { touchControls.down = true; e.preventDefault(); });
            document.getElementById('down-control').addEventListener('touchend', (e) => { touchControls.down = false; e.preventDefault(); });
            document.getElementById('left-control').addEventListener('touchstart', (e) => { touchControls.left = true; e.preventDefault(); });
            document.getElementById('left-control').addEventListener('touchend', (e) => { touchControls.left = false; e.preventDefault(); });
            document.getElementById('right-control').addEventListener('touchstart', (e) => { touchControls.right = true; e.preventDefault(); });
            document.getElementById('right-control').addEventListener('touchend', (e) => { touchControls.right = false; e.preventDefault(); });
            
            codeButton.addEventListener('click', handleCodeButton);

            generateWorld();
            requestAnimationFrame(gameLoop);
            
            setTimeout(() => {
                controlsElement.style.opacity = '0';
                setTimeout(() => { controlsElement.style.display = 'none'; }, 1000);
            }, 5000);
        }
        
        function handleKeyDown(e) {
            keys[e.key.toLowerCase()] = true;
            if (autopilotActive) stopAutopilot();
            lastPlayerMoveTime = Date.now();
        }
        
        function handleKeyUp(e) {
            keys[e.key.toLowerCase()] = false;
        }
        
        function handleMouseDown(e) {
            mouseControl.active = true;
            handleMouseMove(e);
            if (autopilotActive) stopAutopilot();
            lastPlayerMoveTime = Date.now();
        }
        
        function handleMouseMove(e) {
            if (mouseControl.active) {
                const rect = gameElement.getBoundingClientRect();
                mouseControl.x = e.clientX - rect.left;
                mouseControl.y = e.clientY - rect.y;
                if (autopilotActive) stopAutopilot();
                lastPlayerMoveTime = Date.now();
            }
        }
        
        function handleMouseUp() {
            mouseControl.active = false;
        }
        
        function handleWheel(e) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED;
            setZoom(zoomLevel + delta);
            if (autopilotActive) stopAutopilot();
        }
        
        function handleTouchStart(e) {
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = gameElement.getBoundingClientRect();
                mouseControl.x = touch.clientX - rect.left;
                mouseControl.y = touch.clientY - rect.y;
                mouseControl.active = true;
                if (autopilotActive) stopAutopilot();
                lastPlayerMoveTime = Date.now();
            } else if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                lastTouchDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
            }
            e.preventDefault();
        }
        
        function handleTouchMove(e) {
            if (e.touches.length === 1 && mouseControl.active) {
                const touch = e.touches[0];
                const rect = gameElement.getBoundingClientRect();
                mouseControl.x = touch.clientX - rect.left;
                mouseControl.y = touch.clientY - rect.y;
                if (autopilotActive) stopAutopilot();
                lastPlayerMoveTime = Date.Now();
            } else if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                
                if (lastTouchDistance > 0) {
                    const delta = (currentDistance - lastTouchDistance) * 0.5;
                    setZoom(zoomLevel + delta);
                }
                
                lastTouchDistance = currentDistance;
            }
            e.preventDefault();
        }
        
        function handleTouchEnd(e) {
            if (e.touches.length === 0) {
                mouseControl.active = false;
                lastTouchDistance = 0;
            } else if (e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = gameElement.getBoundingClientRect();
                mouseControl.x = touch.clientX - rect.left;
                mouseControl.y = touch.clientY - rect.y;
            }
        }
        
        function setZoom(newZoom) {
            zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
            zoomLevelElement.textContent = `${Math.round(zoomLevel)}%`;
            calculateViewport();
            render(); 
        }
        
        function gameLoop(timestamp) {
            const deltaTime = Math.min(timestamp - lastTime, 100);
            lastTime = timestamp;
            
            handleInput(deltaTime);
            handleAutopilot(deltaTime);

            playerX += velocityX * (100 / zoomLevel);
            playerY += velocityY * (100 / zoomLevel);
            
            velocityX *= DRAG;
            velocityY *= DRAG;
            
            generateWorld();
            updateStars(deltaTime);
            updateTrail();
            updateScanning(deltaTime);
            render();
            
            requestAnimationFrame(gameLoop);
        }
        
        function handleInput(deltaTime) {
            const speed = PLAYER_SPEED * (deltaTime / 16); 
            
            let movedByInput = false;
            if (keys['w'] || keys['arrowup']) { velocityY -= speed; movedByInput = true; }
            if (keys['s'] || keys['arrowdown']) { velocityY += speed; movedByInput = true; }
            if (keys['a'] || keys['arrowleft']) { velocityX -= speed; movedByInput = true; }
            if (keys['d'] || keys['arrowright']) { velocityX += speed; movedByInput = true; }
            
            if (touchControls.up) { velocityY -= speed; movedByInput = true; }
            if (touchControls.down) { velocityY += speed; movedByInput = true; }
            if (touchControls.left) { velocityX -= speed; movedByInput = true; }
            if (touchControls.right) { velocityX += speed; movedByInput = true; }
            
            if (mouseControl.active) {
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                const dirX = mouseControl.x - centerX;
                const dirY = mouseControl.y - centerY;
                const length = Math.sqrt(dirX * dirX + dirY * dirY);
                
                if (length > 10) { 
                    const normX = dirX / length;
                    const normY = dirY / length;
                    velocityX += normX * speed;
                    velocityY += normY * speed;
                    movedByInput = true;
                }
            }

            if (movedByInput || velocityX > 0.01 || velocityY > 0.01) {
                lastPlayerMoveTime = Date.now();
            }
        }
        
        function mulberry32(a) {
            return function() {
                var t = a += 0x6D2B79F5;
                t = Math.imul(t ^ t >>> 15, t | 1);
                t = t ^ t >>> 13;
                return ((t >>> 0) / 4294967296);
            }
        }

        function hashString(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash |= 0;
            }
            return Math.abs(hash);
        }

        function generateSpecies(rand, planetName = null) {
            const categories = ['Flora', 'Fauna', 'Fungi', 'Microbial', 'Sentient'];
            const subCategories = {
                'Flora': ['Photosynthetic', 'Chemosynthetic', 'Carnivorous', 'Arboreal', 'Aquatic'],
                'Fauna': ['Mammalian', 'Reptilian', 'Avian', 'Insectoid', 'Aquatic', 'Amphibious'],
                'Fungi': ['Mycorrhizal', 'Saprophytic', 'Parasitic', 'Symbiotic'],
                'Microbial': ['Bacterial', 'Viral', 'Archaeal', 'Protist'],
                'Sentient': ['Bipedal', 'Quadrupedal', 'Avianoid', 'Aquatic-Intelligent']
            };
            const descriptors = ['Bio-luminescent', 'Cryo-tolerant', 'Hydrophilic', 'Xenomorphic', 'Symbiotic', 'Silicate-based', 'Carbon-based', 'Silicon-based'];

            if (planetName && planetName.toLowerCase() === 'ollivia') {
                return "Aesthetiflora (Luminescent, Harmonious Ecosystem)";
            }

            const category = categories[Math.floor(rand() * categories.length)];
            const subCategory = subCategories[category][Math.floor(rand() * subCategories[category].length)];
            const descriptor = descriptors[Math.floor(rand() * descriptors.length)];

            return `${descriptor} ${subCategory} ${category}`;
        }

        function generatePlanetData(seed, isMoon = false, specificName = null) {
            const rand = mulberry32(seed);

            let hasLife = rand() > 0.65;
            let population = hasLife ? Math.floor(rand() * 10000000000) : 0;
            
            let tempBase = -100 + rand() * 200;
            if (isMoon) tempBase += (rand() - 0.5) * 50;
            const tempVariation = rand() * 50 - 25;
            const temperature = Math.round(tempBase + tempVariation);

            const ageBillionYears = (rand() * 10) + 1;
            const ageString = `${ageBillionYears.toFixed(2)} billion years`;

            const planetNames = ["Xylos", "Aelon", "Veridian", "Obsidian", "Celestia", "Aethel", "Solara", "Lunara", "Titanus", "Zephyr", "Astra", "Cosmos", "Orion", "Lyra", " Lilith", "Nebula", "Terra", "Yeawn", " Eudes", "Xia", " Caleb", "Sylus", " Zayne", "Rafayel", " Xavier", "Calypso", "Aether", " Lumine"];
            const moonNames = ["Lune", "Phobos", "Elxi", "Miranda", "Tsuko", "Io", "Callisto", "Triton", "Elxi", "Oberon", "Hae", "Elxi", "Umbriel", "Paimon", "Ariel", "Rhea", "Iapetus", "Daiso"];
            
            let name;
            // Use specificName only if it's explicitly provided (for the autopilot target planet)
            // Otherwise, generate a random name.
            if (specificName) { 
                name = specificName;
            } else if (isMoon) {
                name = moonNames[Math.floor(rand() * moonNames.length)] + "-" + Math.floor(rand() * 9);
            } else {
                name = planetNames[Math.floor(rand() * planetNames.length)] + "-" + Math.floor(rand() * 999);
            }
            
            // Special case for "Ollivia"
            if (name.toLowerCase() === 'ollivia') { // Check against the determined name, not just specificName input
                hasLife = true; // Ensure it has life
                if (population === 0) population = Math.floor(rand() * 5000000000) + 100000000; // Ensure some population if it was 0
                tempBase = 15 + rand() * 10; // More temperate
            }
            
            const species = hasLife ? generateSpecies(rand, name) : "None";

            return {
                name: name,
                lifeForm: hasLife ? "Yes" : "No",
                population: population.toLocaleString(),
                temperature: `${temperature}°C`,
                age: ageString,
                species: species
            };
        }

        function generateWorld() {
            const chunkX = Math.floor(playerX / CHUNK_SIZE);
            const chunkY = Math.floor(playerY / CHUNK_SIZE);
            
            for (let y = -1; y <= 1; y++) {
                for (let x = -1; x <= 1; x++) {
                    const cx = chunkX + x;
                    const cy = chunkY + y;
                    const chunkKey = `${cx},${cy}`;
                    
                    if (!generatedChunks.has(chunkKey)) {
                        generateChunk(cx, cy);
                        generatedChunks.add(chunkKey);
                    }
                }
            }

            const renderDistance = CHUNK_SIZE * 2;
            stars = stars.filter(star => {
                return Math.abs(star.x - playerX) < renderDistance && Math.abs(star.y - playerY) < renderDistance;
            });
            planets = planets.filter(planet => {
                return Math.abs(planet.x - playerX) < renderDistance && Math.abs(planet.y - playerY) < renderDistance;
            });
        }
        
        function generateChunk(chunkX, chunkY) {
            const chunkStartX = chunkX * CHUNK_SIZE;
            const chunkStartY = chunkY * CHUNK_SIZE;
            
            const chunkSeed = hashString(`${chunkX},${chunkY}`);
            const chunkRand = mulberry32(chunkSeed);

            const starCount = CHUNK_SIZE * CHUNK_SIZE * STAR_DENSITY;
            for (let i = 0; i < starCount; i++) {
                const x = chunkStartX + chunkRand() * CHUNK_SIZE;
                const y = chunkStartY + chunkRand() * CHUNK_SIZE;
                const brightness = Math.floor(chunkRand() * 4) + 1;
                const char = chunkRand() > 0.5 ? '.' : '*';
                const blinkSpeed = chunkRand() * 5000 + 2000;
                const nextBlink = Date.now() + chunkRand() * blinkSpeed;
                
                stars.push({
                    x, y, char, brightness, blinkSpeed, nextBlink,
                    originalBrightness: brightness,
                    visible: true
                });
            }
            
            const planetCount = CHUNK_SIZE * CHUNK_SIZE * PLANET_DENSITY;
            for (let i = 0; i < planetCount; i++) {
                const planetSeed = hashString(`${chunkX},${chunkY},${i}`); // Unique seed for each planet
                const planetRand = mulberry32(planetSeed);

                const x = chunkStartX + planetRand() * CHUNK_SIZE;
                const y = chunkStartY + planetRand() * CHUNK_SIZE;
                const size = Math.floor(planetRand() * 20) + 10;
                
                const hasMoons = planetRand() > 0.6; 
                const moons = [];
                if (hasMoons) {
                    const numMoons = Math.floor(planetRand() * 3) + 1; 
                    for (let m = 0; m < numMoons; m++) {
                        const moonSeed = hashString(`${planetSeed}-${m}`);
                        const moonRand = mulberry32(moonSeed);
                        const moonSize = Math.floor(moonRand() * 5) + 3; 
                        const orbitRadius = size / 2 + moonSize + moonRand() * 10;
                        const orbitAngle = moonRand() * Math.PI * 2;
                        moons.push({
                            id: `moon-${chunkX}-${chunkY}-${i}-${m}`, // Unique ID for each moon
                            size: moonSize,
                            orbitRadius: orbitRadius,
                            orbitAngle: orbitAngle,
                            pattern: generatePlanetPattern(moonSize, true, null, moonRand) 
                        });
                    }
                }

                const planet = {
                    id: `planet-${chunkX}-${chunkY}-${i}`, // Unique ID for the main planet
                    x, y, size,
                    pattern: generatePlanetPattern(size, false, null, planetRand), // Pass planetRand for pattern generation
                    moons: moons
                };
                planets.push(planet);
            }
        }
        
        function generatePlanetPattern(size, isMoon = false, specificName = null, rand = Math.random) {
            // If rand is not a function (e.g., if Math.random was passed directly), wrap it
            const seededRand = typeof rand === 'function' ? rand : () => Math.random();

            const pattern = [];
            const center = size / 2;
            const maxDist = center * center;
            
            const hasRings = !isMoon && seededRand() > 0.7; 
            const isGasGiant = seededRand() > 0.5;
            const craterCount = Math.floor(seededRand() * 5) + 1;
            const craters = [];
            
            let baseColor;
            let secondaryColor;
            let highlightColor;

            if (specificName && specificName.toLowerCase() === 'ollivia') {
                baseColor = '#FFC0CB'; // Pink
                secondaryColor = '#FFFFFF'; // White
                highlightColor = '#F0F0F0'; // Off-white
            } else {
                baseColor = getRandomColor(seededRand);
                secondaryColor = getRandomColor(seededRand);
                highlightColor = getRandomColor(seededRand);
            }
            
            for (let i = 0; i < craterCount; i++) {
                craters.push({
                    x: seededRand() * size - center,
                    y: seededRand() * size - center,
                    size: seededRand() * (size/4) + 1
                });
            }
            
            for (let y = -center; y < center; y++) {
                let line = '';
                let colors = '';
                for (let x = -center; x < center; x++) {
                    const dist = x*x + y*y;
                    
                    if (dist > maxDist) {
                        if (hasRings && Math.abs(y) < 2 && dist < maxDist * 1.5 && dist > maxDist * 0.8) {
                            const ringChar = seededRand() > 0.7 ? '=' : seededRand() > 0.7 ? '+' : '-';
                            line += ringChar;
                            colors += highlightColor + '|';
                        } else {
                            line += ' ';
                            colors += '|';
                        }
                    } else {
                        if (isGasGiant) {
                            const noise = Math.floor(seededRand() * 4);
                            let color;
                            const angle = Math.atan2(y, x);
                            const distFactor = dist / maxDist;
                            
                            if (Math.sin(angle * 5 + distFactor * 10) > 0.7) {
                                color = highlightColor;
                            } else if (Math.sin(angle * 3 + distFactor * 15) > 0.5) {
                                color = secondaryColor;
                            } else {
                                color = baseColor;
                            }
                            
                            if (noise < 1) {
                                line += getRandomPlanetChar(seededRand);
                            } else {
                                line += getRandomPlanetChar(seededRand);
                            }
                            colors += color + '|';
                        } else {
                            let inCrater = false;
                            for (const crater of craters) {
                                const craterDist = (x-crater.x)*(x-crater.x) + (y-crater.y)*(y-crater.y);
                                if (craterDist < crater.size * crater.size) {
                                    inCrater = true;
                                    break;
                                }
                            }
                            
                            const altitude = 1 - (dist / maxDist);
                            let char, color;
                            
                            if (inCrater) {
                                char = seededRand() > 0.7 ? 'o' : 'O';
                                color = '#888'; 
                            } else if (altitude > 0.9) {
                                char = seededRand() > 0.7 ? '^' : '*';
                                color = mixColors(baseColor, '#ffffff', 0.7);
                            } else if (altitude > 0.7) {
                                char = seededRand() > 0.7 ? '#' : '%';
                                color = mixColors(baseColor, secondaryColor, 0.5);
                            } else if (altitude > 0.4) {
                                char = seededRand() > 0.7 ? '@' : '&';
                                color = baseColor;
                            } else {
                                char = seededRand() > 0.7 ? '~' : ':';
                                color = mixColors(baseColor, '#000000', 0.3);
                            }
                            
                            line += char;
                            colors += color + '|';
                        }
                    }
                }
                pattern.push({ line, colors });
            }
            
            return pattern;
        }
        
        function mixColors(color1, color2, weight) {
            const r1 = parseInt(color1.substring(1, 3), 16);
            const g1 = parseInt(color1.substring(3, 5), 16);
            const b1 = parseInt(color1.substring(5, 7), 16);
            
            const r2 = parseInt(color2.substring(1, 3), 16);
            const g2 = parseInt(color2.substring(3, 5), 16);
            const b2 = parseInt(color2.substring(5, 7), 16);
            
            const r = Math.round(r1 * weight + r2 * (1 - weight));
            const g = Math.round(g1 * weight + g2 * (1 - weight));
            const b = Math.round(b1 * weight + b2 * (1 - weight));
            
            return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        }
        
        function getRandomPlanetChar(rand = Math.random) {
            const chars = ['@', '░', '%', '&', '*', '+', '=', '-', '~', ':', '.'];
            return chars[Math.floor(rand() * chars.length)];
        }
        
        function getRandomColor(rand = Math.random) {
            const commonColors = [
                '#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3',
                '#33FFF3', '#8A2BE2', '#FF6347', '#7CFC00', '#FFD700',
                '#FF8C00', '#E6E6FA', '#40E0D0', '#F08080', '#90EE90'
            ];
            const whitePinkColors = [
                '#FFFFFF', '#F8F8F8', '#F0F0F0',
                '#FFC0CB', '#FFB6C1', '#FFD1DC'
            ];

            if (rand() < 0.35) { // Increased chance for white/pink
                return whitePinkColors[Math.floor(rand() * whitePinkColors.length)];
            } else {
                return commonColors[Math.floor(rand() * commonColors.length)];
            }
        }
        
        function updateStars(deltaTime) {
            const now = Date.now();
            blinkTimer += deltaTime;
            
            if (blinkTimer > STAR_BLINK_INTERVAL) {
                blinkTimer = 0;
                
                for (const star of stars) {
                    if (now > star.nextBlink) {
                        star.visible = !star.visible;
                        star.nextBlink = now + star.blinkSpeed;
                    }
                }
            }
        }
        
        function updateTrail() {
            const now = Date.now();
            
            const minDistanceForTrail = 0.5 * (100 / zoomLevel); 
            
            if (trail.length === 0 || 
                Math.abs(playerX - trail[trail.length - 1].x) > minDistanceForTrail ||
                Math.abs(playerY - trail[trail.length - 1].y) > minDistanceForTrail) {
                
                trail.push({
                    x: playerX,
                    y: playerY,
                    time: now
                });
            }
            
            while (trail.length > 0 && now - trail[0].time > TRAIL_LENGTH * 100) {
                trail.shift();
            }
        }

        function updateScanning(deltaTime) {
            const now = Date.now();
            const isPlayerEffectivelyStopped = (Math.abs(velocityX) < 0.01 && Math.abs(velocityY) < 0.01) && !autopilotActive;
            
            if (isPlayerEffectivelyStopped) {
                scanTimer += deltaTime;
            } else {
                scanTimer = 0;
                clearScanElements();
                isScanning = false;
                closestScannablePlanet = null;
                return;
            }

            let currentClosestPlanet = null;
            let closestPlanetDistSq = Infinity;
            for (const planet of planets) {
                const distSq = (playerX - planet.x) ** 2 + (playerY - planet.y) ** 2;
                const effectiveScanRadius = SCAN_RADIUS + planet.size / 2;
                if (distSq < effectiveScanRadius ** 2 && distSq < closestPlanetDistSq) {
                    closestPlanetDistSq = distSq;
                    currentClosestPlanet = planet;
                }
            }

            if (currentClosestPlanet) {
                if (!isScanning || closestScannablePlanet !== currentClosestPlanet) {
                    isScanning = true;
                    closestScannablePlanet = currentClosestPlanet;
                    scanTimer = 0;
                    clearScanElements(); 
                }
            } else {
                if (isScanning) {
                    isScanning = false;
                    closestScannablePlanet = null;
                    scanTimer = 0;
                    clearScanElements();
                }
            }
        }

        function clearScanElements() {
            scanContainer.innerHTML = '';
            activeScanElements.clear();
        }
        
        function render() {
            gameElement.innerHTML = '';
            trailContainer.innerHTML = '';
            
            const viewportLeft = playerX - viewportCols / 2;
            const viewportTop = playerY - viewportRows / 2;

            const currentEffectiveCellWidth = cellWidth * (100 / zoomLevel);
            const currentEffectiveCellHeight = cellHeight * (100 / zoomLevel);
            
            const grid = [];
            for (let y = 0; y < viewportRows; y++) {
                grid[y] = new Array(viewportCols).fill(' ');
            }
            
            for (const star of stars) {
                if (!star.visible) continue;
                
                const screenX = Math.floor(star.x - viewportLeft);
                const screenY = Math.floor(star.y - viewportTop);
                
                if (screenX >= 0 && screenX < viewportCols && 
                    screenY >= 0 && screenY < viewportRows) {
                    grid[screenY][screenX] = `<span style="opacity:${star.brightness/5}">${star.char}</span>`;
                }
            }
            
            for (const planet of planets) {
                const planetLeft = planet.x - planet.size/2;
                const planetTop = planet.y - planet.size/2;
                const planetRight = planet.x + planet.size/2;
                const planetBottom = planet.y + planet.size/2;
                
                if (planetRight < viewportLeft || planetLeft > viewportLeft + viewportCols ||
                    planetBottom < viewportTop || planetTop > viewportTop + viewportRows) {
                    continue;
                }
                
                for (let py = 0; py < planet.pattern.length; py++) {
                    for (let px = 0; px < planet.pattern[py].line.length; px++) {
                        const worldX = planetLeft + px;
                        const worldY = planetTop + py;
                        
                        const screenX = Math.floor(worldX - viewportLeft);
                        const screenY = Math.floor(worldY - viewportTop);
                        
                        if (screenX >= 0 && screenX < viewportCols && 
                            screenY >= 0 && screenY < viewportRows) {
                            const char = planet.pattern[py].line[px];
                            if (char !== ' ') {
                                const colors = planet.pattern[py].colors.split('|');
                                const color = colors[px] || '#FFFFFF';
                                grid[screenY][screenX] = `<span style="color:${color}">${char}</span>`;
                            }
                        }
                    }
                }

                for (const moon of planet.moons) {
                    const moonOrbitSpeed = 0.0005; 
                    const animatedAngle = moon.orbitAngle + (Date.now() * moonOrbitSpeed);

                    const moonWorldX = planet.x + moon.orbitRadius * Math.cos(animatedAngle);
                    const moonWorldY = planet.y + moon.orbitRadius * Math.sin(animatedAngle);

                    const moonLeft = moonWorldX - moon.size / 2;
                    const moonTop = moonWorldY - moon.size / 2;
                    const moonRight = moonWorldX + moon.size / 2;
                    const moonBottom = moonWorldY + moon.size / 2;

                    if (moonRight < viewportLeft || moonLeft > viewportLeft + viewportCols ||
                        moonBottom < viewportTop || moonTop > viewportTop + viewportRows) {
                        continue;
                    }

                    for (let my = 0; my < moon.pattern.length; my++) {
                        for (let mx = 0; mx < moon.pattern[my].line.length; mx++) {
                            const worldX = moonLeft + mx;
                            const worldY = moonTop + my;

                            const screenX = Math.floor(worldX - viewportLeft);
                            const screenY = Math.floor(worldY - viewportTop);

                            if (screenX >= 0 && screenX < viewportCols &&
                                screenY >= 0 && screenY < viewportRows) {
                                const char = moon.pattern[my].line[mx];
                                if (char !== ' ') {
                                    const colors = moon.pattern[my].colors.split('|');
                                    const color = colors[mx] || '#FFFFFF';
                                    grid[screenY][screenX] = `<span style="color:${color}">${char}</span>`;
                                }
                            }
                        }
                    }
                }
            }
            
            for (let y = 0; y < viewportRows; y++) {
                const line = document.createElement('div');
                line.innerHTML = grid[y].join('');
                gameElement.appendChild(line);
            }

            for (let i = 0; i < trail.length; i++) {
                const segment = trail[i];
                const age = (Date.now() - segment.time) / (TRAIL_LENGTH * 100);
                const opacity = 0.3 * (1 - age);
                
                if (opacity > 0) {
                    const pixelX = (segment.x - viewportLeft) * currentEffectiveCellWidth;
                    const pixelY = (segment.y - viewportTop) * currentEffectiveCellHeight;

                    const trailSpan = document.createElement('span');
                    trailSpan.className = 'trail-segment';
                    trailSpan.textContent = '■';
                    trailSpan.style.left = `${pixelX - (currentEffectiveCellWidth / 2)}px`;
                    trailSpan.style.top = `${pixelY - (currentEffectiveCellHeight / 2)}px`;
                    trailSpan.style.opacity = opacity;
                    trailSpan.style.fontSize = `${16 * (zoomLevel / 100)}px`;
                    trailSpan.style.letterSpacing = `${0.5 * (zoomLevel / 100)}px`;

                    trailContainer.appendChild(trailSpan);
                }
            }
            
            playerElement.style.left = '50%';
            playerElement.style.top = '50%';
            playerElement.style.transform = 'translate(-50%, -50%)';
            playerElement.style.fontSize = `${16 * (zoomLevel / 100)}px`;
            playerElement.style.letterSpacing = `${0.5 * (zoomLevel / 100)}px`;

            if (autopilotActive) {
                playerElement.classList.add('autopilot-outline');
            } else {
                playerElement.classList.remove('autopilot-outline');
            }

            if (isScanning && closestScannablePlanet) {
                const entitiesToScan = [closestScannablePlanet, ...closestScannablePlanet.moons];

                entitiesToScan.forEach(entity => {
                    const isMoon = !!entity.orbitRadius;
                    const id = entity.id;
                    let existingElements = activeScanElements.get(id);

                    if (!existingElements) {
                        existingElements = {
                            outline: document.createElement('div'),
                            loadingBarContainer: document.createElement('div'),
                            loadingBar: document.createElement('div'),
                            details: document.createElement('div')
                        };

                        existingElements.outline.className = 'scan-outline';
                        existingElements.loadingBarContainer.className = 'scan-loading-bar-container';
                        existingElements.loadingBar.className = 'scan-loading-bar';
                        existingElements.details.className = 'scan-details';

                        existingElements.loadingBarContainer.appendChild(existingElements.loadingBar);
                        existingElements.outline.appendChild(existingElements.loadingBarContainer);
                        existingElements.outline.style.position = 'absolute';
                        existingElements.details.style.position = 'absolute';

                        scanContainer.appendChild(existingElements.outline);
                        scanContainer.appendChild(existingElements.details);
                        activeScanElements.set(id, existingElements);
                    }

                    let entityWorldX, entityWorldY, entitySize;
                    if (isMoon) {
                        const moonOrbitSpeed = 0.0005;
                        const animatedAngle = entity.orbitAngle + (Date.now() * moonOrbitSpeed);
                        entityWorldX = closestScannablePlanet.x + entity.orbitRadius * Math.cos(animatedAngle);
                        entityWorldY = closestScannablePlanet.y + entity.orbitRadius * Math.sin(animatedAngle);
                        entitySize = entity.size;
                    } else {
                        entityWorldX = entity.x;
                        entityWorldY = entity.y;
                        entitySize = entity.size;
                    }

                    const screenPixelX = (entityWorldX - viewportLeft) * currentEffectiveCellWidth;
                    const screenPixelY = (entityWorldY - viewportTop) * currentEffectiveCellHeight;

                    const radiusPixels = entitySize / 2 * currentEffectiveCellWidth;
                    const diameterPixels = radiusPixels * 2;

                    existingElements.outline.style.width = `${diameterPixels}px`;
                    existingElements.outline.style.height = `${diameterPixels}px`;
                    existingElements.outline.style.left = `${screenPixelX - radiusPixels - 1}px`;
                    existingElements.outline.style.top = `${screenPixelY - radiusPixels - 1}px`;

                    const scanProgress = Math.min(1, scanTimer / SCAN_DURATION);
                    existingElements.loadingBar.style.width = `${scanProgress * 100}%`;

                    if (scanProgress >= 1) {
                        existingElements.loadingBarContainer.style.display = 'none';
                        existingElements.details.classList.add('visible');
                        
                        let data;
                        let dataSeed;
                        let dataSpecificName = null;

                        // Only apply the specific name if this entity is the autopilot target planet itself.
                        // Moons of the target planet, and all other planets, get randomized names.
                        if (!isMoon && closestScannablePlanet === entity && autopilotTargetPlanetName && entity.id === `planet-${autopilotTargetPlanetName}`) {
                            dataSeed = hashString(autopilotTargetPlanetName);
                            dataSpecificName = autopilotTargetPlanetName;
                        } else {
                            // For all other planets/moons, use their unique ID as a seed for random data.
                            dataSeed = hashString(id); 
                        }

                        if (!entity.scanData || entity.scanData.seed !== dataSeed || entity.scanData.specificName !== dataSpecificName) { // Check specificName too
                            entity.scanData = generatePlanetData(dataSeed, isMoon, dataSpecificName);
                            entity.scanData.seed = dataSeed;
                            entity.scanData.specificName = dataSpecificName; // Store for comparison
                        }
                        data = entity.scanData;
                        
                        let detailsHtml = `Code: ${data.name}<br>Life form: ${data.lifeForm}<br>Species: ${data.species}<br>Population: ${data.population}<br>Temperature: ${data.temperature}<br>Age: ${data.age}`;
                        if (!isMoon) {
                            detailsHtml += `<br>Number of Moons: ${closestScannablePlanet.moons.length}`;
                        }
                        existingElements.details.innerHTML = detailsHtml;

                        existingElements.details.style.left = `${screenPixelX + radiusPixels + SCAN_DETAIL_OFFSET_X}px`;
                        existingElements.details.style.top = `${screenPixelY - radiusPixels}px`;
                    } else {
                        existingElements.loadingBarContainer.style.display = 'block';
                        existingElements.details.classList.remove('visible');
                    }
                });

                const currentScanTargetIds = new Set(entitiesToScan.map(e => e.id));
                for (const [id, elements] of activeScanElements.entries()) {
                    if (!currentScanTargetIds.has(id)) {
                        elements.outline.remove();
                        elements.details.remove();
                        activeScanElements.delete(id);
                    }
                }
            } else {
                clearScanElements();
            }
        }

        function handleCodeButton() {
            const input = prompt("Enter a planet name (Seed):");
            if (input && input.trim() !== "") {
                autopilotTargetPlanetName = input.trim();
                const seedHash = hashString(autopilotTargetPlanetName);
                
                // Determine a location outside the current viewport, far enough to feel like travel
                const offsetDistance = Math.max(window.innerWidth, window.innerHeight) * 5; // A significant distance
                const angle = Math.random() * Math.PI * 2;
                
                autopilotTargetX = playerX + offsetDistance * Math.cos(angle);
                autopilotTargetY = playerY + offsetDistance * Math.sin(angle);
                
                startAutopilot(autopilotTargetX, autopilotTargetY, autopilotTargetPlanetName);
            }
        }

        function startAutopilot(targetX, targetY, targetPlanetName) {
            autopilotActive = true;
            autopilotTargetX = targetX;
            autopilotTargetY = targetY;
            
            stars = [];
            planets = [];
            generatedChunks.clear();

            // Teleport player near the target system, not exactly on it
            playerX = targetX - (Math.random() - 0.5) * CHUNK_SIZE * 0.5;
            playerY = targetY - (Math.random() - 0.5) * CHUNK_SIZE * 0.5;
            
            // Generate the specific seeded planet at the target coordinates
            const mainPlanetSeed = hashString(targetPlanetName);
            const mainPlanetRand = mulberry32(mainPlanetSeed);
            const mainPlanetSize = Math.floor(mainPlanetRand() * 20) + 10;
            
            let hasMoonsForOllivia = mainPlanetRand() > 0.6; // Use regular random for moon presence
            if (targetPlanetName.toLowerCase() === 'ollivia') {
                hasMoonsForOllivia = true; // Ensure Ollivia has moons
            }
            
            const moons = [];
            if (hasMoonsForOllivia) {
                const numMoons = Math.floor(mainPlanetRand() * 3) + 1;
                for (let m = 0; m < numMoons; m++) {
                    const moonSeed = hashString(`${mainPlanetSeed}-${m}`);
                    const moonRand = mulberry32(moonSeed);
                    const moonSize = Math.floor(moonRand() * 5) + 3;
                    const orbitRadius = mainPlanetSize / 2 + moonSize + moonRand() * 10;
                    const orbitAngle = moonRand() * Math.PI * 2;
                    moons.push({
                        id: `moon-specific-${targetPlanetName}-${m}`, // Differentiate specific moons from generic ones
                        size: moonSize,
                        orbitRadius: orbitRadius,
                        orbitAngle: orbitAngle,
                        pattern: generatePlanetPattern(moonSize, true, targetPlanetName.toLowerCase() === 'ollivia' ? 'ollivia' : null, moonRand) 
                    });
                }
            }

            // Create the main seeded planet object
            const seededPlanet = {
                id: `planet-${targetPlanetName}`, // Unique ID for the main planet
                x: targetX,
                y: targetY,
                size: mainPlanetSize,
                pattern: generatePlanetPattern(mainPlanetSize, false, targetPlanetName, mainPlanetRand), // Pass targetName and rand for pattern
                moons: moons
            };
            planets.push(seededPlanet); // Add the main planet

            // Generate surrounding chunks using a generic random seed for other celestial bodies
            const targetChunkX = Math.floor(targetX / CHUNK_SIZE);
            const targetChunkY = Math.floor(targetY / CHUNK_SIZE);

            for (let y = -1; y <= 1; y++) {
                for (let x = -1; x <= 1; x++) {
                    const cx = targetChunkX + x;
                    const cy = targetChunkY + y;
                    const chunkKey = `${cx},${cy}`;
                    if (!generatedChunks.has(chunkKey)) { 
                        generateChunk(cx, cy); // Use original generateChunk for surrounding random elements
                        generatedChunks.add(chunkKey);
                    }
                }
            }
            
            isScanning = false;
            scanTimer = 0;
            closestScannablePlanet = null;
            clearScanElements();
        }

        function handleAutopilot(deltaTime) {
            if (!autopilotActive) return;

            const dx = autopilotTargetX - playerX;
            const dy = autopilotTargetY - playerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < autopilotArrivalThreshold) {
                stopAutopilot();
                playerX = autopilotTargetX;
                playerY = autopilotTargetY;
                
                // Find the main seeded planet by its ID
                closestScannablePlanet = planets.find(p => p.id === `planet-${autopilotTargetPlanetName}`);
                
                if (closestScannablePlanet) {
                    // Pre-generate scan data for the main planet and its moons
                    const mainPlanetSeed = hashString(autopilotTargetPlanetName);
                    closestScannablePlanet.scanData = generatePlanetData(mainPlanetSeed, false, autopilotTargetPlanetName);
                    closestScannablePlanet.scanData.seed = mainPlanetSeed;
                    closestScannablePlanet.scanData.specificName = autopilotTargetPlanetName;

                    closestScannablePlanet.moons.forEach((moon, index) => {
                        const moonSeed = hashString(`${mainPlanetSeed}-${index}`); // Consistent moon seed
                        // Pass specificName as null for moons to ensure they get random names
                        moon.scanData = generatePlanetData(moonSeed, true, null); 
                        moon.scanData.seed = moonSeed;
                        moon.scanData.specificName = null;
                    });
                }

                // Trigger scan immediately on arrival
                isScanning = true;
                scanTimer = SCAN_DELAY;
                lastPlayerMoveTime = Date.now();
                return;
            }

            const directionX = dx / distance;
            const directionY = dy / distance;

            const autoSpeed = PLAYER_SPEED * AUTOPILOT_SPEED_MULTIPLIER * (deltaTime / 16);
            velocityX = directionX * autoSpeed;
            velocityY = directionY * autoSpeed;
        }

        function stopAutopilot() {
            autopilotActive = false;
            velocityX = 0;
            velocityY = 0;
            playerElement.classList.remove('autopilot-outline');
            // Do NOT clear autopilotTargetPlanetName here, it's needed for scan info
        }
        
        init();
    </script>
</body>
</html>
"""

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(HTML_CONTENT.encode("utf-8"))
        else:
            # For any other requested paths, respond with 404 Not Found
            self.send_error(404, "File Not Found: %s" % self.path)

with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
    print(f"Serving ASCII Space Explorer at http://localhost:{PORT}/")
    print("Press Ctrl+C to stop the server.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
