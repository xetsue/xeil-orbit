// Xeil constants
const PLAYER_SPEED = 0.1; // How fast the player accelerates. Higher value = faster movement.
const DRAG = 0.95; // Controls how quickly player slows down. Lower value = faster stop.
const TRAIL_LENGTH = 20; // Number of trail segments to keep. Higher = longer trail.
const STAR_DENSITY = 0.005; // How many stars appear per unit of area. Higher = more stars.
const PLANET_DENSITY = 0.00004; // How many planets appear per unit of area. Higher = more planets.
const CHUNK_SIZE = 1000; // Size of generated world chunks. Larger = more content per generation.
const STAR_BLINK_INTERVAL = 100; // How often stars are checked for blinking (ms). Lower = more frequent checks.
const MIN_ZOOM = 50; // Minimum zoom level (smaller numbers mean "zoomed out" more, showing more area).
const MAX_ZOOM = 200; // Maximum zoom level (larger numbers mean "zoomed in" more, showing less area).
const ZOOM_SPEED = 5; // How much zoom changes per scroll/pinch. Higher = faster zoom.
const SCAN_RADIUS = 100; // Distance from player to initiate a scan. Larger = scans from further away.
const SCAN_DELAY = 3000; // Time (ms) after stopping before scan begins.
const SCAN_DURATION = 1500; // Time (ms) it takes for a scan to complete.
const SCAN_DETAIL_OFFSET_X = 20; // Pixel offset for scan details panel from planet.
const AUTOPILOT_SPEED_MULTIPLIER = 5; // How much faster autopilot is than manual movement.
const PLANET_SIZE_MIN = 15; // Minimum character-grid size of a planet.
const PLANET_SIZE_MAX = 22; // Maximum character-grid size of a planet.
const MOON_SIZE_MIN = 2; // Minimum character-grid size of a moon.
const MOON_SIZE_MAX = 10; // Maximum character-grid size of a moon.
const MAX_MOONS = 6; // Maximum number of moons a planet can have.
const PIXELS_PER_KM = 10000; // Conversion factor for displaying realistic distances.

// Dynamic viewport sizing
let viewportCols, viewportRows; // Number of columns and rows visible in the viewport.
let cellWidth, cellHeight; // Actual pixel dimensions of a single character cell.

// Game state
let playerX = 0; // Player's X coordinate in world space.
let playerY = 0; // Player's Y coordinate in world space.
let velocityX = 0; // Player's X velocity.
let velocityY = 0; // Player's Y velocity.
let keys = {}; // Stores which keys are currently pressed.
let touchControls = { up: false, down: false, left: false, right: false }; // State of mobile touch controls.
let mouseControl = { active: false, x: 0, y: 0 }; // State of mouse input for movement.
let lastTime = 0; // Timestamp of the previous game loop frame.
let trail = []; // Array of player's past positions for the trail.
let generatedChunks = new Set(); // Stores keys of already generated world chunks.
let stars = []; // Array of star objects.
let planets = []; // Array of planet objects.
let blinkTimer = 0; // Timer for star blinking animation.
let zoomLevel = 100; // Current zoom level, 100 is default.
let lastTouchDistance = 0; // For pinch-to-zoom on touch devices.
let planetRotationOffset = 0; // Global offset for planet rotation animation.

// Scanning state
let scanTimer = 0; // Timer for current scan progress.
let isScanning = false; // True if a scan is active.
let lastPlayerMoveTime = Date.now(); // Timestamp of last player input, used for scan delay.
let closestScannablePlanet = null; // The planet currently being scanned.
let activeScanElements = new Map(); // Stores DOM elements for active scan UIs.
let totalScans = 0; // Count of completed scans.
let totalDistance = 0; // Total distance travelled in km.
let lastPosition = { x: 0, y: 0 }; // Last player position for distance calculation.

// Autopilot state
let autopilotActive = false; // True if autopilot is engaged.
let autopilotTargetX = 0; // X coordinate of autopilot target.
let autopilotTargetY = 0; // Y coordinate of autopilot target.
let autopilotArrivalThreshold = 10; // Distance from target to consider arrival.
let autopilotTargetPlanetName = ''; // Name of the planet targeted by autopilot for seeded generation.

// DOM elements (references to HTML elements by their IDs)
const gameElement = document.getElementById('game');
const playerElement = document.getElementById('player');
const trailContainer = document.getElementById('trail-container');
const scanContainer = document.getElementById('scan-container');
const controlsElement = document.getElementById('controls');
const zoomLevelElement = document.getElementById('zoom-level');
const codeButton = document.getElementById('code-button');
const coordinateDisplay = document.getElementById('coordinate-display');
const coordinateText = document.getElementById('coordinate-text');
const scansCountElement = document.getElementById('scans-count');
const distanceTravelledElement = document.getElementById('distance-travelled');
const currentSpeedElement = document.getElementById('current-speed');

// Coordinate display state
let isCoordinateExpanded = false; // True if coordinate display is showing details.
let lastTapTime = 0; // For detecting double taps on coordinate display.

function calculateViewport() {
    // Determines how many character cells fit on screen based on font size and zoom.
    const temp = document.createElement('div');
    temp.innerHTML = 'X';
    temp.style.position = 'absolute';
    temp.style.visibility = 'hidden';
    temp.style.fontFamily = 'monospace';
    temp.style.fontSize = '16px';
    temp.style.letterSpacing = '0.5px';
    document.body.appendChild(temp);
    cellWidth = temp.offsetWidth; // Pixel width of one character.
    cellHeight = temp.offsetHeight; // Pixel height of one character.
    document.body.removeChild(temp);

    const effectiveCellWidth = cellWidth * (100 / zoomLevel); // Adjusted by zoom level.
    const effectiveCellHeight = cellHeight * (100 / zoomLevel); // Adjusted by zoom level.

    viewportCols = Math.floor(window.innerWidth / effectiveCellWidth); // Total columns visible.
    viewportRows = Math.floor(window.innerHeight / effectiveCellHeight); // Total rows visible.

    // Ensures odd number of columns/rows for centered player.
    if (viewportCols % 2 === 0) viewportCols--;
    if (viewportRows % 2 === 0) viewportRows--;
}

function init() {
    // Initializes the game, sets up event listeners.
    playerElement.textContent = '✖';

    calculateViewport(); // Set initial viewport size.
    window.addEventListener('resize', () => {
        calculateViewport(); // Recalculate on window resize.
        render(); // Re-render the world.
    });

    // Event listeners for keyboard, mouse, and touch inputs.
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel);
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    // Mobile control button listeners.
    document.getElementById('up-control').addEventListener('touchstart', (e) => { touchControls.up = true; e.preventDefault(); });
    document.getElementById('up-control').addEventListener('touchend', (e) => { touchControls.up = false; e.preventDefault(); });
    document.getElementById('down-control').addEventListener('touchstart', (e) => { touchControls.down = true; e.preventDefault(); });
    document.getElementById('down-control').addEventListener('touchend', (e) => { touchControls.down = false; e.preventDefault(); });
    document.getElementById('left-control').addEventListener('touchstart', (e) => { touchControls.left = true; e.preventDefault(); });
    document.getElementById('left-control').addEventListener('touchend', (e) => { touchControls.left = false; e.preventDefault(); });
    document.getElementById('right-control').addEventListener('touchstart', (e) => { touchControls.right = true; e.preventDefault(); });
    document.getElementById('right-control').addEventListener('touchend', (e) => { touchControls.right = false; e.preventDefault(); });

    codeButton.addEventListener('click', handleCodeButton); // Listener for the code button.

    // Coordinate display interaction listener.
    coordinateDisplay.addEventListener('click', handleCoordinateDisplayClick);

    generateWorld(); // Generate initial world content.
    requestAnimationFrame(gameLoop); // Start the game loop.

    // Fade out controls after a delay.
    setTimeout(() => {
        controlsElement.style.opacity = '0';
        setTimeout(() => { controlsElement.style.display = 'none'; }, 1000);
    }, 5000);
}

function handleCoordinateDisplayClick(e) {
    // Manages single and double taps on the coordinate display for expansion/autopilot.
    const currentTime = Date.now();

    if (currentTime - lastTapTime < 300) { // Double tap detection.
        e.preventDefault();
        e.stopPropagation();
        handleCoordinateDoubleTap(); // Initiates autopilot prompt.
        lastTapTime = 0;
    } else { // Single tap.
        lastTapTime = currentTime;
        toggleCoordinateDisplay(); // Expands/collapses display.
    }
}

function handleCoordinateDoubleTap() {
    // Prompts user for destination coordinates for autopilot.
    const input = prompt("Enter destination coordinates (X,Y):");
    if (input && input.trim() !== "") {
        const coords = input.trim().split(',').map(Number);
        if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            const targetX = coords[0];
            const targetY = coords[1];

            autopilotTargetPlanetName = `coord-${targetX}-${targetY}`; // Sets a special name for coordinate-based autopilot.
            autopilotTargetX = targetX;
            autopilotTargetY = targetY;

            startAutopilot(targetX, targetY, autopilotTargetPlanetName); // Starts autopilot to specified coords.
        }
    }
}

function toggleCoordinateDisplay() {
    // Toggles the expanded/minimized state of the coordinate display.
    isCoordinateExpanded = !isCoordinateExpanded;

    if (isCoordinateExpanded) {
        coordinateDisplay.classList.remove('minimized');
        coordinateDisplay.classList.add('expanded');
    } else {
        coordinateDisplay.classList.remove('expanded');
        coordinateDisplay.classList.add('minimized');
    }
}

function updateCoordinateDisplay() {
    // Updates player's coordinates, speed, and total distance travelled.
    coordinateText.textContent = `X: ${Math.round(playerX)}, Y: ${Math.round(playerY)}`;

    // Calculate speed in km/s (using PIXELS_PER_KM conversion).
    const speedKmPerS = Math.sqrt(velocityX * velocityX + velocityY * velocityY) * (100 / zoomLevel) * PIXELS_PER_KM / 1000;
    currentSpeedElement.textContent = `${speedKmPerS.toFixed(2)} km/s`;

    // Update distance travelled (add distance since last frame).
    const distanceDelta = Math.sqrt(Math.pow(playerX - lastPosition.x, 2) + Math.pow(playerY - lastPosition.y, 2)) * PIXELS_PER_KM;
    totalDistance += distanceDelta;
    distanceTravelledElement.textContent = `${(totalDistance / 1000).toFixed(2)} km`;

    lastPosition = { x: playerX, y: playerY };
}

function handleKeyDown(e) {
    // Handles keyboard key presses for movement. Stops autopilot if active.
    keys[e.key.toLowerCase()] = true;
    if (autopilotActive) stopAutopilot();
    lastPlayerMoveTime = Date.now();
}

function handleKeyUp(e) {
    // Handles keyboard key releases.
    keys[e.key.toLowerCase()] = false;
}

function handleMouseDown(e) {
    // Activates mouse control for movement. Stops autopilot.
    mouseControl.active = true;
    handleMouseMove(e);
    if (autopilotActive) stopAutopilot();
    lastPlayerMoveTime = Date.now();
}

function handleMouseMove(e) {
    // Updates mouse position for movement if active. Stops autopilot.
    if (mouseControl.active) {
        const rect = gameElement.getBoundingClientRect();
        mouseControl.x = e.clientX - rect.left;
        mouseControl.y = e.clientY - rect.y;
        if (autopilotActive) stopAutopilot();
        lastPlayerMoveTime = Date.now();
    }
}

function handleMouseUp() {
    // Deactivates mouse control.
    mouseControl.active = false;
}

function handleWheel(e) {
    // Handles mouse wheel for zooming. Stops autopilot.
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED;
    setZoom(zoomLevel + delta);
    if (autopilotActive) stopAutopilot();
}

function handleTouchStart(e) {
    // Handles touch input for movement (single touch) and zoom (two touches). Stops autopilot.
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
    // Continues handling touch movement and zoom. Stops autopilot.
    if (e.touches.length === 1 && mouseControl.active) {
        const touch = e.touches[0];
        const rect = gameElement.getBoundingClientRect();
        mouseControl.x = touch.clientX - rect.left;
        mouseControl.y = touch.clientY - rect.y;
        if (autopilotActive) stopAutopilot();
        lastPlayerMoveTime = Date.now();
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
    // Ends touch control.
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
    // Sets the game's zoom level within min/max bounds.
    zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    zoomLevelElement.textContent = `${Math.round(zoomLevel)}%`;
    calculateViewport(); // Recalculate viewport as zoom affects it.
    render(); // Re-render the world with new zoom.
}

function gameLoop(timestamp) {
    // Main game loop, updates game state and renders.
    const deltaTime = Math.min(timestamp - lastTime, 100); // Time since last frame.
    lastTime = timestamp;

    planetRotationOffset += deltaTime * 0.0001; // Controls the speed of planet/moon rotation animation.

    handleInput(deltaTime); // Process player input.
    handleAutopilot(deltaTime); // Update autopilot movement.

    playerX += velocityX * (100 / zoomLevel); // Update player position based on velocity and zoom.
    playerY += velocityY * (100 / zoomLevel);

    velocityX *= DRAG; // Apply drag to slow down velocity.
    velocityY *= DRAG;

    generateWorld(); // Generate new world chunks if player moved.
    updateStars(deltaTime); // Update star blinking.
    updateTrail(); // Update player trail.
    updateScanning(deltaTime); // Update scanning process.
    updateCoordinateDisplay(); // Update on-screen coordinate info.
    render(); // Draw everything to the screen.

    requestAnimationFrame(gameLoop); // Request next frame.
}

function handleInput(deltaTime) {
    // Processes player movement input from keyboard, touch, and mouse.
    const speed = PLAYER_SPEED * (deltaTime / 16);

    let movedByInput = false;
    // Apply speed based on pressed keys or active touch controls.
    if (keys['w'] || keys['arrowup']) { velocityY -= speed; movedByInput = true; }
    if (keys['s'] || keys['arrowdown']) { velocityY += speed; movedByInput = true; }
    if (keys['a'] || keys['arrowleft']) { velocityX -= speed; movedByInput = true; }
    if (keys['d'] || keys['arrowright']) { velocityX += speed; movedByInput = true; }

    if (touchControls.up) { velocityY -= speed; movedByInput = true; }
    if (touchControls.down) { velocityY += speed; movedByInput = true; }
    if (touchControls.left) { velocityX -= speed; movedByInput = true; }
    if (touchControls.right) { velocityX += speed; movedByInput = true; }

    if (mouseControl.active) {
        // Calculate direction from screen center to mouse for mouse movement.
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const dirX = mouseControl.x - centerX;
        const dirY = mouseControl.y - centerY;
        const length = Math.sqrt(dirX * dirX + dirY * dirY);

        if (length > 10) { // Only move if mouse is a certain distance from center.
            const normX = dirX / length;
            const normY = dirY / length;
            velocityX += normX * speed;
            velocityY += normY * speed;
            movedByInput = true;
        }
    }

    if (movedByInput || velocityX > 0.01 || velocityY > 0.01) {
        lastPlayerMoveTime = Date.now(); // Reset scan timer if player is moving.
    }
}

function mulberry32(a) {
    // Pseudorandom number generator function for consistent results from seeds.
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t = t ^ t >>> 13;
        return ((t >>> 0) / 4294967296);
    }
}

function hashString(str) {
    // Simple string hashing function to create seeds.
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function generateSpecies(rand, planetName = null) {
    // Generates a random species name based on a provided random function (rand).
    // `rand`: Function providing pseudorandom numbers (0-1). Its quality affects randomness of species.
    // `planetName`: If provided and matches "Mao", returns a specific species name, overriding randomness.
    const categories = ['Flora', 'Fauna', 'Fungi', 'Microbial', 'Sentient'];
    const subCategories = {
        // Subcategories add more specific detail to the generated species.
        'Flora': ['Photosynthetic', 'Chemosynthetic', 'Carnivorous', 'Arboreal', 'Aquatic', 'Crystalline', 'Bioluminescent', 'Parasitic', 'Symbiotic', 'Epiphytic'],
        'Fauna': ['Mammalian', 'Reptilian', 'Avian', 'Insectoid', 'Aquatic', 'Amphibious', 'Arachnid', 'Cephalopod', 'Exoskeletal', 'Endoskeletal', 'Flying', 'Burrowing', 'Gliding', 'Bioluminescent'],
        'Fungi': ['Mycorrhizal', 'Saprophytic', 'Parasitic', 'Symbiotic', 'Bioluminescent', 'Carnivorous', 'Spore-based', 'Hyphal', 'Yeast-based'],
        'Microbial': ['Bacterial', 'Viral', 'Archaeal', 'Protist', 'Nanobiotic', 'Plasmid-based', 'Extremophilic', 'Photosynthetic', 'Chemosynthetic'],
        'Sentient': ['Bipedal', 'Quadrupedal', 'Avianoid', 'Aquatic-Intelligent', 'Arboreal', 'Subterranean', 'Aerial', 'Hive-mind', 'Telepathic', 'Technological']
    };

    const descriptors = [
        // Adjectives describing the species' properties or appearance.
        'Bio-luminescent', 'Cryo-tolerant', 'Hydrophilic', 'Xenomorphic', 'Symbiotic',
        'Silicate-based', 'Carbon-based', 'Silicon-based', 'Metallic', 'Crystalline',
        'Photosynthetic', 'Chemosynthetic', 'Radiotrophic', 'Thermophilic', 'Psychrophilic',
        'Acidophilic', 'Alkaliphilic', 'Halophilic', 'Barophilic', 'Electrogenic',
        'Magnetic', 'Gaseous', 'Plasmic', 'Chitinous', 'Exo-skeletal',
        'Endo-skeletal', 'Amorphous', 'Modular', 'Colonial', 'Hive-minded',
        'Telepathic', 'Psionic', 'Energy-based', 'Phase-shifting', 'Dimensional',
        'Quantum-entangled', 'Time-perceptive', 'Gravity-resistant', 'Anti-matter', 'Dark-matter'
    ];

    const prefixes = [
        // Prefixes for more complex species names.
        'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
        'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho',
        'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega', 'Nova', 'Quasar',
        'Pulsar', 'Nebula', 'Galaxy', 'Cosmo', 'Astro', 'Stellar', 'Lunar', 'Solar',
        'Void', 'Ether', 'Aether', 'Quantum', 'Chrono', 'Hyper', 'Ultra', 'Mega',
        'Giga', 'Tera', 'Peta', 'Exa', 'Zetta', 'Yotta'
    ];

    const suffixes = [
        // Suffixes for more complex species names.
        'phage', 'vore', 'morph', 'pod', 'nid', 'form', 'oid', 'ite', 'ling',
        'spore', 'cell', 'zyme', 'plasm', 'cyte', 'phyll', 'root', 'stem',
        'leaf', 'flower', 'spike', 'scale', 'shell', 'wing', 'eye', 'mouth',
        'limb', 'tentacle', 'flagella', 'cillia', 'spine', 'fang', 'claw',
        'talon', 'hoof', 'paw', 'fin', 'gill', 'antenna', 'sensor', 'node'
    ];

    // Special species name for Custom planet example -- "Mao" 
    if (planetName && planetName.toLowerCase() === 'mao') {
        return "Aesthetiflora (6th Dimensional Being)"; // Specific species for this planet.
    }

    // Randomly select components using the provided `rand` function.
    const category = categories[Math.floor(rand() * categories.length)];
    const subCategory = subCategories[category][Math.floor(rand() * subCategories[category].length)];
    const descriptor = descriptors[Math.floor(rand() * descriptors.length)];
    const prefix = prefixes[Math.floor(rand() * prefixes.length)];
    const suffix = suffixes[Math.floor(rand() * suffixes.length)];

    // 30% chance for a more complex name structure.
    if (rand() > 0.7) {
        return `${prefix}-${subCategory} ${descriptor} ${suffix}`;
    }

    return `${descriptor} ${subCategory} ${category}`; // Simpler name structure.
}

function generatePlanetData(seed, isMoon = false, specificName = null) {
    // Generates detailed scan data for a planet or moon.
    // `seed`: A numerical seed for consistent data generation. Changes to seed mean different data.
    // `isMoon`: Boolean, true if generating data for a moon, affects some values like temp and name pool.
    // `specificName`: If provided, overrides random naming and can trigger special data.
    const rand = mulberry32(seed); // Seeded random number generator.

    let hasLife = rand() > 0.65; // Probability of life. Lower value = less life.
    let population = hasLife ? Math.floor(rand() * 10000000000) : 0; // Random population if has life.

    let tempBase = -100 + rand() * 200; // Base temperature range.
    if (isMoon) tempBase += (rand() - 0.5) * 50; // Moons have wider temp variation.
    const tempVariation = rand() * 50 - 25;
    const temperature = Math.round(tempBase + tempVariation); // Final temperature.

    const ageBillionYears = (rand() * 10) + 1; // Age of the celestial body.
    const ageString = `${ageBillionYears.toFixed(2)} billion years`;

    // Generate day length (hours) and year length (days).
    const dayLengthHours = (rand() * 100 + 5).toFixed(1);
    const yearLengthDays = (rand() * 1000 + 50).toFixed(0);

    // Lists of potential names for planets and moons.
    const planetNames = ["Xylos", "Aelon", "Veridian", "Obsidian", "Celestia", "Aethel", "Solara", "Lunara", "Titanus", "Zephyr", "Astra", "Mo", "Orion", "Lyra", " Lilith", "Nebula", "Terra", "Yeawn", " Xavier", "Xia", " Caleb", "Sylus", " Zayne", "Rafayel", "Mao", "Calypso", "Aether", " Lumine"];
    const moonNames = ["Lune", "Paimon", "Mo", "Mao", "Tsuko", "Io", "Callisto", "Triton", "Elxi", "Oberon", "Hae", "Elxi", "Umbriel", "Xue", "Ariel", "Rhea", "Iapetus", "Daiso"];

    let name;

    // Special handling for specific coordinates (e.g., Mao, Mo).
    if (specificName && specificName.startsWith('coord-')) {
        const coords = specificName.replace('coord-', '').split('-');
        const x = parseInt(coords[0]);
        const y = parseInt(coords[1]);

        if (x === 1000 && y === 69) {
            name = "Mao"; // Specific name for these coordinates.
        } else if (x === 1050 && y === 69) {
            name = "Mo"; // Specific name for these coordinates.
        } else {
            // Random name if not special coordinates.
            name = isMoon ?
                moonNames[Math.floor(rand() * moonNames.length)] + "-" + Math.floor(rand() * 9) :
                planetNames[Math.floor(rand() * planetNames.length)] + "-" + Math.floor(rand() * 999);
        }
    } else if (specificName) {
        name = specificName; // Use the provided specific name.
    } else if (isMoon) {
        // Random moon name.
        name = moonNames[Math.floor(rand() * moonNames.length)] + "-" + Math.floor(rand() * 9);
    } else {
        // Random planet name.
        name = planetNames[Math.floor(rand() * planetNames.length)] + "-" + Math.floor(rand() * 999);
    }

    // Custom planet example -- "Mao" - overrides generated data.
    if (name.toLowerCase() === 'mao') {
        hasLife = true;
        if (population === 0) population = Math.floor(rand() * 5000000000) + 100000000;
        tempBase = 15 + rand() * 10;
    }

    // Custom-2 -- "Mo" - overrides generated data.
    if (name.toLowerCase() === 'mo') {
        hasLife = rand() > 0.3; // Higher chance of life for Mo.
        if (hasLife && population === 0) population = Math.floor(rand() * 3000000000) + 50000000;
        tempBase = -20 + rand() * 40; // Mo is a colder planet.
    }

    const species = hasLife ? generateSpecies(rand, name) : "None"; // Generate species if life exists.

    return {
        name: name,
        lifeForm: hasLife ? "Yes" : "No",
        population: population.toLocaleString(),
        temperature: `${temperature}°C`,
        age: ageString,
        species: species,
        dayLength: `${dayLengthHours} hours`,
        yearLength: `${yearLengthDays} days`
    };
}

function generateWorld() {
    // Generates new world chunks (stars and planets) around the player.
    const chunkX = Math.floor(playerX / CHUNK_SIZE);
    const chunkY = Math.floor(playerY / CHUNK_SIZE);

    // Check and generate special "Mao" and "Mo" systems if player is near.
    if (Math.abs(playerX - 1000) < CHUNK_SIZE * 2 && Math.abs(playerY - 69) < CHUNK_SIZE * 2) {
        const specialKey = "1000,69";
        if (!generatedChunks.has(specialKey)) {
            generateSpecialChunk(1000, 69, "Mao");
            generatedChunks.add(specialKey);
        }
    }

    if (Math.abs(playerX - 1050) < CHUNK_SIZE * 2 && Math.abs(playerY - 69) < CHUNK_SIZE * 2) {
        const specialKey = "1050,69";
        if (!generatedChunks.has(specialKey)) {
            generateSpecialChunk(1050, 69, "Mo");
            generatedChunks.add(specialKey);
        }
    }

    // Generate surrounding 3x3 grid of chunks.
    for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
            const cx = chunkX + x;
            const cy = chunkY + y;
            const chunkKey = `${cx},${cy}`;

            if (!generatedChunks.has(chunkKey)) {
                generateChunk(cx, cy); // Generate stars and planets for a given chunk.
                generatedChunks.add(chunkKey);
            }
        }
    }

    // Filter out stars and planets that are too far from the player to optimize rendering.
    const renderDistance = CHUNK_SIZE * 2;
    stars = stars.filter(star => {
        return Math.abs(star.x - playerX) < renderDistance && Math.abs(star.y - playerY) < renderDistance;
    });
    planets = planets.filter(planet => {
        return Math.abs(planet.x - playerX) < renderDistance && Math.abs(planet.y - playerY) < renderDistance;
    });
}

function generateSpecialChunk(x, y, planetName) {
    // Generates a specific chunk with a predetermined planet (e.g., "Mao", "Mo").
    // `x`, `y`: World coordinates for the special planet.
    // `planetName`: The name of the special planet to generate.
    const planetSeed = hashString(planetName); // Seed based on planet name for consistent generation.
    const planetRand = mulberry32(planetSeed);

    const size = Math.floor(planetRand() * (PLANET_SIZE_MAX - PLANET_SIZE_MIN)) + PLANET_SIZE_MIN;

    // Generate moons for the special planet.
    const hasMoons = true; // Special planets always have moons.
    const moons = [];
    if (hasMoons) {
        const numMoons = Math.floor(planetRand() * MAX_MOONS) + 1;
        for (let m = 0; m < numMoons; m++) {
            const moonSeed = hashString(`${planetSeed}-${m}`); // Seed for individual moon.
            const moonRand = mulberry32(moonSeed);
            const moonSize = Math.floor(moonRand() * (MOON_SIZE_MAX - MOON_SIZE_MIN)) + MOON_SIZE_MIN;
            const orbitRadius = size / 2 + moonSize + moonRand() * 20;
            const orbitAngle = moonRand() * Math.PI * 2;
            const orbitInclination = (moonRand() - 0.5) * Math.PI / 3;
            moons.push({
                id: `moon-special-${planetName}-${m}`,
                size: moonSize,
                orbitRadius: orbitRadius,
                orbitAngle: orbitAngle,
                orbitInclination: orbitInclination,
                pattern: generatePlanetPattern(moonSize, true, planetName, moonRand) // Pattern generation for moon.
            });
        }
    }

    const planet = {
        id: `planet-${planetName}`,
        x: x,
        y: y,
        size: size,
        pattern: generatePlanetPattern(size, false, planetName, planetRand), // Pattern generation for main planet.
        moons: moons
    };
    planets.push(planet);

    // Generate some stars around the special planet.
    const starCount = 50;
    for (let i = 0; i < starCount; i++) {
        const angle = planetRand() * Math.PI * 2;
        const distance = planetRand() * 100 + 50;
        const starX = x + Math.cos(angle) * distance;
        const starY = y + Math.sin(angle) * distance;
        const brightness = Math.floor(planetRand() * 4) + 1;
        const char = planetRand() > 0.5 ? '.' : '*';
        const blinkSpeed = planetRand() * 5000 + 2000;
        const nextBlink = Date.now() + planetRand() * blinkSpeed;

        stars.push({
            x: starX, y: starY, char, brightness, blinkSpeed, nextBlink,
            originalBrightness: brightness,
            visible: true
        });
    }
}

function generateChunk(chunkX, chunkY) {
    // Generates stars and planets within a given chunk.
    // `chunkX`, `chunkY`: Coordinates of the chunk to generate.
    const chunkStartX = chunkX * CHUNK_SIZE;
    const chunkStartY = chunkY * CHUNK_SIZE;

    const chunkSeed = hashString(`${chunkX},${chunkY}`); // Seed for consistent chunk generation.
    const chunkRand = mulberry32(chunkSeed);

    // Generate stars based on STAR_DENSITY.
    const starCount = CHUNK_SIZE * CHUNK_SIZE * STAR_DENSITY;
    for (let i = 0; i < starCount; i++) {
        const x = chunkStartX + chunkRand() * CHUNK_SIZE;
        const y = chunkStartY + chunkRand() * CHUNK_SIZE;
        const brightness = Math.floor(chunkRand() * 4) + 1; // Star brightness (1-4).
        const char = chunkRand() > 0.5 ? '.' : '*'; // Star character.
        const blinkSpeed = chunkRand() * 5000 + 2000; // Time before next blink.
        const nextBlink = Date.now() + chunkRand() * blinkSpeed;

        stars.push({
            x, y, char, brightness, blinkSpeed, nextBlink,
            originalBrightness: brightness,
            visible: true
        });
    }

    // Generate planets based on PLANET_DENSITY.
    const planetCount = CHUNK_SIZE * CHUNK_SIZE * PLANET_DENSITY;
    for (let i = 0; i < planetCount; i++) {
        const planetSeed = hashString(`${chunkX},${chunkY},${i}`); // Unique seed for each planet.
        const planetRand = mulberry32(planetSeed);

        const x = chunkStartX + planetRand() * CHUNK_SIZE;
        const y = chunkStartY + planetRand() * CHUNK_SIZE;
        const size = Math.floor(planetRand() * (PLANET_SIZE_MAX - PLANET_SIZE_MIN)) + PLANET_SIZE_MIN;

        const hasMoons = planetRand() > 0.5; // 50% chance for moons.
        const moons = [];
        if (hasMoons) {
            const numMoons = Math.floor(planetRand() * MAX_MOONS) + 1;
            for (let m = 0; m < numMoons; m++) {
                const moonSeed = hashString(`${planetSeed}-${m}`);
                const moonRand = mulberry32(moonSeed);
                const moonSize = Math.floor(moonRand() * (MOON_SIZE_MAX - MOON_SIZE_MIN)) + MOON_SIZE_MIN;
                const orbitRadius = size / 2 + moonSize + moonRand() * 20; // Moon orbit distance.
                const orbitAngle = moonRand() * Math.PI * 2; // Initial moon orbit angle.
                const orbitInclination = (moonRand() - 0.5) * Math.PI / 3; // Moon orbit tilt.
                moons.push({
                    id: `moon-${chunkX}-${chunkY}-${i}-${m}`,
                    size: moonSize,
                    orbitRadius: orbitRadius,
                    orbitAngle: orbitAngle,
                    orbitInclination: orbitInclination,
                    pattern: generatePlanetPattern(moonSize, true, null, moonRand)
                });
            }
        }

        const planet = {
            id: `planet-${chunkX}-${chunkY}-${i}`,
            x, y, size,
            pattern: generatePlanetPattern(size, false, null, planetRand), // Pattern generation for planet.
            moons: moons
        };
        planets.push(planet);
    }
}

function generatePlanetPattern(size, isMoon = false, specificName = null, rand = Math.random) {
    // Generates the ASCII art pattern for a planet or moon.
    // `size`: Diameter of the planet/moon. Affects pattern scale.
    // `isMoon`: Boolean, true if generating for a moon. Affects gas giant/ring chances.
    // `specificName`: If provided, forces specific colors/patterns for special planets (Mao, Mo).
    // `rand`: A seeded random function for consistent patterns.

    const seededRand = typeof rand === 'function' ? rand : () => Math.random;
    const pattern = [];
    const center = size / 2;
    const maxDistSq = center * center;

    const patternType = seededRand(); // Randomly selects a pattern style.
    let isGasGiant = false;
    let hasRings = false;
    let ringTiltFactor = 1;

    if (!isMoon) {
        if (seededRand() > 0.7) { // 30% chance for rings on planets.
            hasRings = true;
            ringTiltFactor = 0.3 + seededRand() * 0.3; // Random tilt for rings.
        }
        isGasGiant = seededRand() > 0.5; // 50% chance for gas giant on planets.
    }

    let baseColor, secondaryColor, highlightColor;

    // Specific colors for "Mao" and "Mo" planets.
    if (specificName && specificName.toLowerCase() === 'mao') {
        baseColor = '#FFC0CB'; // Pink
        secondaryColor = '#FFFFFF'; // White
        highlightColor = '#FFFFFF'; // White
    } else if (specificName && specificName.toLowerCase() === 'mo') {
        baseColor = '#FFFFFF'; // White
        secondaryColor = '#E0E0E0'; // Light grey
        highlightColor = '#C0C0C0'; // Grey
        hasRings = true; // Mo always has rings.
        ringTiltFactor = 0.4;
    } else {
        // Random colors from predefined palettes.
        baseColor = getRandomColor(seededRand);
        secondaryColor = getRandomColor(seededRand);
        highlightColor = getRandomColor(seededRand);
    }

    const craterCount = Math.floor(seededRand() * 5) + 1; // Number of craters.
    const craters = [];
    for (let i = 0; i < craterCount; i++) {
        craters.push({
            x: seededRand() * size - center,
            y: seededRand() * size - center,
            size: seededRand() * (size / 4) + 1 // Size of craters.
        });
    }

    let sites = [];
    const useVoronoi = !isGasGiant && patternType >= 0.45 && patternType < 0.6; // Whether to use Voronoi patterns.
    if (useVoronoi) {
        const numSites = 5 + Math.floor(seededRand() * 10); // Number of Voronoi sites.
        for (let i = 0; i < numSites; i++) {
            sites.push({
                x: (seededRand() * size) - center,
                y: (seededRand() * size) - center,
                color: mixColors(baseColor, highlightColor, seededRand()), // Color for Voronoi cells.
                char: getRandomPlanetChar(seededRand) // Character for Voronoi cells.
            });
        }
    }

    const rotationOffset = planetRotationOffset * (0.5 + seededRand()); // Adds global rotation to pattern.
    const loopRadius = hasRings ? Math.ceil(center * 1.8) : Math.ceil(center); // Extend render area for rings.

    for (let y = -loopRadius; y < loopRadius; y++) {
        let line = '';
        let colors = '';
        for (let x = -loopRadius; x < loopRadius; x++) {
            const planetDistSq = x * x + y * y;

            let onRing = false;
            let ringIsInFront = false;
            if (hasRings) {
                const innerRingRadiusSq = (center * 1.1) * (center * 1.1);
                const outerRingRadiusSq = (center * 1.7) * (center * 1.7);

                const rotX_ring = x * Math.cos(rotationOffset) - y * Math.sin(rotationOffset);
                const rotY_ring = x * Math.sin(rotationOffset) + y * Math.cos(rotationOffset);

                const ellipseY = rotY_ring / ringTiltFactor;
                const ringDistSq = rotX_ring * rotX_ring + ellipseY * ellipseY;

                if (ringDistSq > innerRingRadiusSq && ringDistSq < outerRingRadiusSq) {
                    onRing = true; // Determines if current pixel is part of a ring.
                }
                ringIsInFront = rotY_ring > 0; // Determines if ring is in front of planet for rendering order.
            }

            if (onRing && ringIsInFront) {
                // Character and color for rings that are in front.
                line += seededRand() > 0.6 ? ':' : '.';
                colors += highlightColor + '|';
            } else if (planetDistSq <= maxDistSq) { // If inside the planet's main body.
                let char, color;
                if (isGasGiant) {
                    // Gas giant patterns: uses sine waves or banding for character and color.
                    // This section generates different patterns typical for gas giants.
                    const angle = Math.atan2(y, x) + rotationOffset;
                    const distFactor = planetDistSq / maxDistSq;
                    const noise = seededRand() * 0.4;
                    if (patternType < 0.25) {
                        // Pattern 1: Wavy, fluid bands based on angle and distance.
                        const value = Math.sin(angle * 10 + distFactor * 20 + noise * 3);
                        color = value > 0.7 ? highlightColor : value > 0.4 ? secondaryColor : baseColor;
                    } else if (patternType < 0.5) {
                        // Pattern 2: Horizontal banding based on y-coordinate.
                        const band = Math.floor((y + center + rotationOffset * 30) / (size / 10));
                        color = band % 2 === 0 ? baseColor : secondaryColor;
                    } else if (patternType < 0.75) {
                        // Pattern 3: More chaotic, swirling noise pattern.
                        const value = Math.sin(x * 0.4 + y * 0.4 + rotationOffset * 20 + noise * 4);
                        color = value > 0.5 ? highlightColor : value > 0 ? secondaryColor : baseColor;
                    } else {
                        // Pattern 4: More randomized, speckled look for gas giants.
                        const value = seededRand();
                        color = value > 0.6 ? highlightColor : value > 0.3 ? secondaryColor : baseColor;
                    }
                    char = getRandomPlanetChar(seededRand); // Random character for gas giants.
                } else {
                    // Solid planet patterns: craters, Voronoi, or other procedural textures.
                    let inCrater = false;
                    for (const crater of craters) {
                        const craterDist = (x - crater.x) * (x - crater.x) + (y - crater.y) * (y - crater.y);
                        if (craterDist < crater.size * crater.size) {
                            inCrater = true; // Check if current pixel is within a crater.
                            break;
                        }
                    }

                    if (inCrater) {
                        char = seededRand() > 0.7 ? 'o' : 'O'; // Characters for craters.
                        color = '#888'; // Color for craters.
                    } else if (useVoronoi) {
                        // Voronoi pattern: determines character and color based on closest "site".
                        // This pattern creates a cellular, fractured, or mosaic-like appearance.
                        let closestSiteIndex = -1;
                        let minSiteDistSq = Infinity;
                        const unrotX = x * Math.cos(rotationOffset) + y * Math.sin(rotationOffset);
                        const unrotY = -x * Math.sin(rotationOffset) + y * Math.cos(rotationOffset);

                        for (let i = 0; i < sites.length; i++) {
                            const dx = unrotX - sites[i].x;
                            const dy = unrotY - sites[i].y;
                            const siteDistSq = dx * dx + dy * dy;
                            if (siteDistSq < minSiteDistSq) {
                                minSiteDistSq = siteDistSq;
                                closestSiteIndex = i;
                            }
                        }
                        char = sites[closestSiteIndex].char;
                        color = sites[closestSiteIndex].color;
                    } else {
                        // Other general procedural patterns for solid planets.
                        if (patternType < 0.15) {
                            // Pattern 1: Angular/radial bands with star-like characters.
                            const angle = Math.atan2(y, x) + rotationOffset;
                            const noise = seededRand() * 0.3;
                            if (Math.sin(angle * 12 + noise * 2) > 0.7) {
                                char = seededRand() > 0.7 ? '^' : '*';
                                color = mixColors(baseColor, highlightColor, 0.7);
                            } else {
                                char = seededRand() > 0.7 ? '#' : '%';
                                color = mixColors(baseColor, secondaryColor, 0.5);
                            }
                        } else if (patternType < 0.45) {
                            // Pattern 2: Horizontal banding using different characters.
                            const band = Math.floor((y + center + rotationOffset * 25) / (size / 12));
                            char = band % 2 === 0 ? '×' : '8';
                            color = band % 2 === 0 ? baseColor : secondaryColor;
                        } else if (patternType < 0.75) {
                            // Pattern 3: Wavy, almost "Perlin-like" noise for a textured surface.
                            const noise = seededRand() * 0.5;
                            const value = Math.sin(x * 0.3 + y * 0.3 + rotationOffset * 15 + noise * 3);
                            char = value > 0.5 ? '@' : value > 0 ? '&' : '~';
                            color = value > 0.5 ? highlightColor : value > 0 ? secondaryColor : baseColor;
                        } else {
                            // Pattern 4: Spiral or swirling pattern.
                            const angle = Math.atan2(y, x);
                            const radius = Math.sqrt(planetDistSq);
                            const spiral = Math.sin(radius * 0.4 + angle * 3 + rotationOffset * 10);
                            char = spiral > 0.5 ? '#' : (spiral > 0) ? '%' : '~';
                            color = spiral > 0.5 ? highlightColor : (spiral > 0) ? secondaryColor : baseColor;
                        }
                    }
                }
                line += char; // Add character to the current line.
                colors += color + '|'; // Add color to the current line.
            } else if (onRing) {
                // Characters and colors for rings that are behind or at the same depth as planet.
                // This applies to rings that are visually behind the main planet body.
                line += seededRand() > 0.6 ? ':' : '.';
                colors += highlightColor + '|';
            } else {
                line += ' '; // Empty space outside planet/rings.
                colors += '|';
            }
        }
        pattern.push({ line, colors }); // Add the completed line and its colors to the pattern.
    }
    return pattern; // Returns the full pattern for rendering.
}

function mixColors(color1, color2, weight) {
    // Mixes two HEX colors based on a weight (0-1). Weight 1 = color1, 0 = color2.
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
    // Returns a random character for planet patterns from a predefined set.
    const chars = ['@', '⋮⋮', '#', '-', '•', '+', '=', '8', '~', '.', ':', 'o'];
    return chars[Math.floor(rand() * chars.length)];
}

function getRandomColor(rand = Math.random) {
    // Returns a random color from either a pastel or bright palette.
    // `rand`: Function providing pseudorandom numbers (0-1).
    const pastels = [
        // List of pastel colors.
        '#FFD1DC', '#FFECB8', '#B5EAD7', '#C7CEEA', '#E2F0CB',
        '#FFDAC1', '#B5EAD7', '#FF9AA2', '#FFB7B2', '#FFDAC1',
        '#E2F0CB', '#B5EAD7', '#C7CEEA', '#F8B195', '#F67280',
        '#C06C84', '#6C5B7B', '#355C7D', '#A8E6CE', '#DCEDC2',
        '#FFD3B5', '#FFAAA6', '#FF8C94', '#F6CD61', '#4DD0E1',
        '#FFEE58', '#FFCA28', '#FFA000', '#FF8F00', '#FF6F00',
        '#E0BBE4', '#957DAD', '#D291BC', '#FFC72C', '#FDCA40',
        '#F79C81', '#FC94AF', '#BDE0FE', '#A2D2FF', '#FFEDD8',
        '#C3F8FA', '#FFFD98', '#FFD1DC', '#FFECB8', '#B5EAD7',
        '#FFDAC1', '#B5EAD7', '#FF9AA2', '#FFB7B2', '#FFDAC1',
        '#E2F0CB', '#B5EAD7', '#C7CEEA', '#F8B195', '#F67280',
        '#C06C84', '#6C5B7B', '#355C7D', '#A8E6CE', '#DCEDC2',
        '#FFD3B5', '#FFAAA6', '#FF8C94', '#F6CD61', '#4DD0E1',
        '#FFEE58', '#FFCA28', '#FFA000', '#FF8F00', '#FF6F00',
        '#E0BBE4', '#957DAD', '#D291BC', '#FFC72C', '#FDCA40',
        '#F79C81', '#FC94AF', '#BDE0FE', '#A2D2FF', '#FFEDD8',
        '#C3F8FA', '#FFFD98', '#FFB347', '#FFCC99', '#FFDDC1',
        '#FFEEBB', '#FFFACD', '#F0FFF0', '#E6E6FA', '#FFE4E1',
        '#F5F5DC', '#FAFAD2', '#F0F8FF', '#F8F8FF', '#F5F5F5',
        '#FFF5EE', '#F5FFFA', '#F0FFFF', '#F0F0F0', '#FFF0F5',
        '#FAF0E6', '#FFF8DC', '#FFFAF0', '#FFFFF0', '#F8F0E6'
    ];

    const brights = [
        // List of bright colors (duplicates removed for brevity in this annotation).
        '#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3',
        '#33FFF3', '#8A2BE2', '#FF6347', '#7CFC00', '#FFD700',
        '#FF8C00', '#E6E6FA', '#40E0D0', '#F08080', '#90EE90',
        '#FF69B4', '#00FFFF', '#FFA07A', '#98FB98', '#DDA0DD',
        '#FFA500', '#7B68EE', '#00FA9A', '#FF4500', '#DA70D6',
        '#FF00FF', '#1E90FF', '#FFDAB9', '#00BFFF', '#FF1493',
        '#7FFFD4', '#FF00FF', '#FF7F50', '#6495ED', '#DC143C',
        '#00FFFF', '#0000FF', '#8B0000', '#9932CC', '#8FBC8F',
        '#483D8B', '#2F4F4F', '#00CED1', '#9400D3', '#FF8C00',
        '#E9967A', '#8A2BE2', '#A52A2A', '#DEB887', '#5F9EA0',
        '#7FFF00', '#D2691E', '#FF7F50', '#6495ED', '#FFF8DC'
    ];

    return rand() < 0.8 ? pastels[Math.floor(rand() * pastels.length)] : // 80% chance for pastel.
        brights[Math.floor(rand() * brights.length)]; // 20% chance for bright.
}

function updateStars(deltaTime) {
    // Updates the blinking state of stars.
    const now = Date.now();
    blinkTimer += deltaTime;

    if (blinkTimer > STAR_BLINK_INTERVAL) { // Checks for blinking every STAR_BLINK_INTERVAL ms.
        blinkTimer = 0;

        for (const star of stars) {
            if (now > star.nextBlink) {
                star.visible = !star.visible; // Toggles star visibility.
                star.nextBlink = now + star.blinkSpeed; // Sets next blink time.
            }
        }
    }
}

function updateTrail() {
    // Updates the player's movement trail.
    const now = Date.now();

    const minDistanceForTrail = 0.5 * (100 / zoomLevel); // Minimum distance to add a new trail segment.

    if (trail.length === 0 ||
        Math.abs(playerX - trail[trail.length - 1].x) > minDistanceForTrail ||
        Math.abs(playerY - trail[trail.length - 1].y) > minDistanceForTrail) {

        trail.push({
            x: playerX,
            y: playerY,
            time: now
        }); // Adds current player position to trail.
    }

    while (trail.length > 0 && now - trail[0].time > TRAIL_LENGTH * 100) {
        trail.shift(); // Removes old trail segments based on TRAIL_LENGTH.
    }
}

function updateScanning(deltaTime) {
    // Manages the scanning process for nearby planets.
    const now = Date.now();
    // Checks if player is effectively stopped and not on autopilot.
    const isPlayerEffectivelyStopped = (Math.abs(velocityX) < 0.01 && Math.abs(velocityY) < 0.01) && !autopilotActive;

    if (isPlayerEffectivelyStopped) {
        scanTimer += deltaTime; // Increment scan timer if stopped.
    } else {
        scanTimer = 0; // Reset scan timer if moving.
        clearScanElements(); // Clear scanning UI.
        isScanning = false;
        closestScannablePlanet = null;
        return;
    }

    let currentClosestPlanet = null;
    let closestPlanetDistSq = Infinity;
    // Find the closest scannable planet.
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
            scanTimer = 0; // Reset scan timer for new target.
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

    // Update scan count when scan completes for a new planet.
    if (isScanning && scanTimer >= SCAN_DURATION && closestScannablePlanet && !closestScannablePlanet.scanned) {
        closestScannablePlanet.scanned = true; // Mark planet as scanned.
        totalScans++; // Increment total scans.
        scansCountElement.textContent = totalScans;
    }
}

function clearScanElements() {
    // Removes all active scan UI elements from the DOM.
    scanContainer.innerHTML = '';
    activeScanElements.clear();
}

function render() {
    // Renders all game elements (stars, planets, player, trail) to the screen.
    gameElement.innerHTML = '';
    trailContainer.innerHTML = '';

    const viewportLeft = playerX - viewportCols / 2;
    const viewportTop = playerY - viewportRows / 2;

    const currentEffectiveCellWidth = cellWidth * (100 / zoomLevel);
    const currentEffectiveCellHeight = cellHeight * (100 / zoomLevel);

    // Create an empty grid representing the viewport.
    const grid = [];
    for (let y = 0; y < viewportRows; y++) {
        grid[y] = new Array(viewportCols).fill(' ');
    }

    // Render stars onto the grid.
    for (const star of stars) {
        if (!star.visible) continue;

        const screenX = Math.floor(star.x - viewportLeft);
        const screenY = Math.floor(star.y - viewportTop);

        if (screenX >= 0 && screenX < viewportCols &&
            screenY >= 0 && screenY < viewportRows) {
            grid[screenY][screenX] = `<span style="opacity:${star.brightness/5}">${star.char}</span>`;
        }
    }

    // Render planets (and their moons) onto the grid.
    for (const planet of planets) {
        // Calculate planet's screen bounds.
        const planetLeft = planet.x - planet.pattern[0].line.length/2;
        const planetTop = planet.y - planet.pattern.length/2;
        const planetRight = planet.x + planet.pattern[0].line.length/2;
        const planetBottom = planet.y + planet.pattern.length/2;

        // Skip rendering if planet is outside viewport.
        if (planetRight < viewportLeft || planetLeft > viewportLeft + viewportCols ||
            planetBottom < viewportTop || planetTop > viewportTop + viewportRows) {
            continue;
        }

        // Render planet's pattern characters.
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

        // Render moons for the current planet.
        for (const moon of planet.moons) {
            const moonOrbitSpeed = 0.0005;
            const animatedAngle = moon.orbitAngle + (Date.now() * moonOrbitSpeed); // Animate moon orbit.
            const moonWorldX = planet.x + moon.orbitRadius * Math.cos(animatedAngle) * Math.cos(moon.orbitInclination);
            const moonWorldY = planet.y + moon.orbitRadius * Math.sin(animatedAngle);

            const moonLeft = moonWorldX - moon.size / 2;
            const moonTop = moonWorldY - moon.size / 2;
            const moonRight = moonWorldX + moon.size / 2;
            const moonBottom = moonWorldY + moon.size / 2;

            // Skip rendering if moon is outside viewport.
            if (moonRight < viewportLeft || moonLeft > viewportLeft + viewportCols ||
                moonBottom < viewportTop || moonTop > viewportTop + viewportRows) {
                continue;
            }

            // Render moon's pattern characters.
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

    // Join grid lines and append to game element.
    for (let y = 0; y < viewportRows; y++) {
        const line = document.createElement('div');
        line.innerHTML = grid[y].join('');
        gameElement.appendChild(line);
    }

    // Render player trail segments.
    for (let i = 0; i < trail.length; i++) {
        const segment = trail[i];
        const age = (Date.now() - segment.time) / (TRAIL_LENGTH * 100); // Calculate age for opacity.
        const opacity = 0.3 * (1 - age);

        if (opacity > 0) {
            const pixelX = (segment.x - viewportLeft) * currentEffectiveCellWidth;
            const pixelY = (segment.y - viewportTop) * currentEffectiveCellHeight;

            const trailSpan = document.createElement('span');
            trailSpan.className = 'trail-segment';
            trailSpan.textContent = '■';
            trailSpan.style.left = `${pixelX - (currentEffectiveCellWidth / 50)}px`;
            trailSpan.style.top = `${pixelY - (currentEffectiveCellHeight / 50)}px`;
            trailSpan.style.opacity = opacity;
            trailSpan.style.fontSize = `${16 * (zoomLevel / 100)}px`; // Adjust font size by zoom.
            trailSpan.style.letterSpacing = `${0.5 * (zoomLevel / 100)}px`;

            trailContainer.appendChild(trailSpan);
        }
    }

    // Position player in the center of the screen and adjust size by zoom.
    playerElement.style.left = '50%';
    playerElement.style.top = '50%';
    playerElement.style.transform = 'translate(-50%, -50%)';
    playerElement.style.fontSize = `${16 * (zoomLevel / 100)}px`;
    playerElement.style.letterSpacing = `${0.5 * (zoomLevel / 100)}px`;

    // Add/remove autopilot outline.
    if (autopilotActive) {
        playerElement.classList.add('autopilot-outline');
    } else {
        playerElement.classList.remove('autopilot-outline');
    }

    // Render scanning UI (outlines, loading bars, details).
    if (isScanning && closestScannablePlanet) {
        const entitiesToScan = [closestScannablePlanet, ...closestScannablePlanet.moons];

        entitiesToScan.forEach(entity => {
            const isMoon = !!entity.orbitRadius;
            const id = entity.id;
            let existingElements = activeScanElements.get(id);

            if (!existingElements) {
                // Create DOM elements if they don't exist for this entity.
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
                entityWorldX = closestScannablePlanet.x + entity.orbitRadius * Math.cos(animatedAngle) * Math.cos(entity.orbitInclination);
                entityWorldY = closestScannablePlanet.y + entity.orbitRadius * Math.sin(animatedAngle);
                entitySize = entity.size;
            } else {
                entityWorldX = entity.x;
                entityWorldY = entity.y;
                entitySize = entity.size;
            }

            // Convert world coordinates to pixel coordinates for UI positioning.
            const screenPixelX = (entityWorldX - viewportLeft) * currentEffectiveCellWidth;
            const screenPixelY = (entityWorldY - viewportTop) * currentEffectiveCellHeight;

            const radiusPixels = entitySize / 2 * currentEffectiveCellWidth;
            const diameterPixels = radiusPixels * 2;

            // Position and size scan outline.
            existingElements.outline.style.width = `${diameterPixels}px`;
            existingElements.outline.style.height = `${diameterPixels}px`;
            existingElements.outline.style.left = `${screenPixelX - radiusPixels - 1}px`;
            existingElements.outline.style.top = `${screenPixelY - radiusPixels - 1}px`;

            const scanProgress = Math.min(1, scanTimer / SCAN_DURATION); // Calculate scan progress.
            existingElements.loadingBar.style.width = `${scanProgress * 100}%`; // Update loading bar width.

            if (scanProgress >= 1) {
                // If scan is complete, hide loading bar and show details.
                existingElements.loadingBarContainer.style.display = 'none';
                existingElements.details.classList.add('visible');

                let data;
                let dataSeed;
                let dataSpecificName = null;

                // Determine seed and specific name for scan data generation.
                if (!isMoon && closestScannablePlanet === entity && autopilotTargetPlanetName && entity.id === `planet-${autopilotTargetPlanetName}`) {
                    dataSeed = hashString(autopilotTargetPlanetName);
                    dataSpecificName = autopilotTargetPlanetName;
                } else {
                    dataSeed = hashString(id);
                }

                // Generate scan data if not already generated or if target changed.
                if (!entity.scanData || entity.scanData.seed !== dataSeed || entity.scanData.specificName !== dataSpecificName) {
                    entity.scanData = generatePlanetData(dataSeed, isMoon, dataSpecificName);
                    entity.scanData.seed = dataSeed;
                    entity.scanData.specificName = dataSpecificName;
                }
                data = entity.scanData;

                // Populate scan details HTML.
                let detailsHtml = `Code: ${data.name}<br>Life form: ${data.lifeForm}<br>Species: ${data.species}<br>Population: ${data.population}<br>Temperature: ${data.temperature}<br>Age: ${data.age}`;

                if (!isMoon) {
                    detailsHtml += `<br>Day Length: ${data.dayLength}<br>Year Length: ${data.yearLength}`;
                    detailsHtml += `<br>Number of Moons: ${closestScannablePlanet.moons.length}`;
                }

                existingElements.details.innerHTML = detailsHtml;

                // Position scan details panel.
                existingElements.details.style.left = `${screenPixelX + radiusPixels + SCAN_DETAIL_OFFSET_X}px`;
                existingElements.details.style.top = `${screenPixelY - radiusPixels}px`;
            } else {
                // If scan is not complete, show loading bar and hide details.
                existingElements.loadingBarContainer.style.display = 'block';
                existingElements.details.classList.remove('visible');
            }
        });

        // Remove scan elements for entities no longer in range.
        const currentScanTargetIds = new Set(entitiesToScan.map(e => e.id));
        for (const [id, elements] of activeScanElements.entries()) {
            if (!currentScanTargetIds.has(id)) {
                elements.outline.remove();
                elements.details.remove();
                activeScanElements.delete(id);
            }
        }
    } else {
        clearScanElements(); // Clear all scan UI if not scanning.
    }
}

function handleCodeButton() {
    // Prompts user for a planet name (seed) and starts autopilot to it.
    const input = prompt("Enter a planet name (Seed):");
    if (input && input.trim() !== "") {
        autopilotTargetPlanetName = input.trim();
        const seedHash = hashString(autopilotTargetPlanetName);

        // Determine a location outside the current viewport, far enough to feel like travel.
        const offsetDistance = Math.max(window.innerWidth, window.innerHeight) * 5;
        const angle = Math.random() * Math.PI * 2;

        autopilotTargetX = playerX + offsetDistance * Math.cos(angle);
        autopilotTargetY = playerY + offsetDistance * Math.sin(angle);

        startAutopilot(autopilotTargetX, autopilotTargetY, autopilotTargetPlanetName);
    }
}

function startAutopilot(targetX, targetY, targetPlanetName) {
    // Initiates autopilot to a specific target.
    // `targetX`, `targetY`: Coordinates of the destination.
    // `targetPlanetName`: The name used as a seed for the target planet.
    autopilotActive = true;
    autopilotTargetX = targetX;
    autopilotTargetY = targetY;

    stars = []; // Clear existing stars and planets.
    planets = [];
    generatedChunks.clear();

    // Teleport player near the target system, not exactly on it.
    playerX = targetX - (Math.random() - 0.5) * CHUNK_SIZE * 0.5;
    playerY = targetY - (Math.random() - 0.5) * CHUNK_SIZE * 0.5;

    // Generate the specific seeded planet at the target coordinates.
    const mainPlanetSeed = hashString(targetPlanetName);
    const mainPlanetRand = mulberry32(mainPlanetSeed);
    const mainPlanetSize = Math.floor(mainPlanetRand() * (PLANET_SIZE_MAX - PLANET_SIZE_MIN)) + PLANET_SIZE_MIN;

    let hasMoonsForSpecial = mainPlanetRand() > 0.5;
    if (targetPlanetName.toLowerCase() === 'mao' || targetPlanetName.toLowerCase() === 'mo') {
        hasMoonsForSpecial = true; // Ensure special planets always have moons.
    }

    const moons = [];
    if (hasMoonsForSpecial) {
        const numMoons = Math.floor(mainPlanetRand() * MAX_MOONS) + 1;
        for (let m = 0; m < numMoons; m++) {
            const moonSeed = hashString(`${mainPlanetSeed}-${m}`);
            const moonRand = mulberry32(moonSeed);
            const moonSize = Math.floor(moonRand() * (MOON_SIZE_MAX - MOON_SIZE_MIN)) + MOON_SIZE_MIN;
            const orbitRadius = mainPlanetSize / 2 + moonSize + moonRand() * 20;
            const orbitAngle = moonRand() * Math.PI * 2;
            const orbitInclination = (moonRand() - 0.5) * Math.PI / 3;
            moons.push({
                id: `moon-specific-${targetPlanetName}-${m}`,
                size: moonSize,
                orbitRadius: orbitRadius,
                orbitAngle: orbitAngle,
                orbitInclination: orbitInclination,
                // Pass specificName for moons if the parent planet is Mao/Mo.
                pattern: generatePlanetPattern(moonSize, true, targetPlanetName.toLowerCase() === 'mao' ? 'mao' :
                                                                        targetPlanetName.toLowerCase() === 'mo' ? 'mo' : null, moonRand)
            });
        }
    }

    // Create the main seeded planet object and add to planets array.
    const seededPlanet = {
        id: `planet-${targetPlanetName}`,
        x: targetX,
        y: targetY,
        size: mainPlanetSize,
        pattern: generatePlanetPattern(mainPlanetSize, false, targetPlanetName, mainPlanetRand),
        moons: moons
    };
    planets.push(seededPlanet);

    // Generate surrounding chunks around the target using generic random seeds.
    const targetChunkX = Math.floor(targetX / CHUNK_SIZE);
    const targetChunkY = Math.floor(targetY / CHUNK_SIZE);

    for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
            const cx = targetChunkX + x;
            const cy = targetChunkY + y;
            const chunkKey = `${cx},${cy}`;
            if (!generatedChunks.has(chunkKey)) {
                generateChunk(cx, cy);
                generatedChunks.add(chunkKey);
            }
        }
    }

    isScanning = false; // Reset scanning state.
    scanTimer = 0;
    closestScannablePlanet = null;
    clearScanElements();
}

function handleAutopilot(deltaTime) {
    // Controls autopilot movement towards the target.
    if (!autopilotActive) return;

    const dx = autopilotTargetX - playerX;
    const dy = autopilotTargetY - playerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < autopilotArrivalThreshold) {
        // If arrived at target.
        stopAutopilot();
        playerX = autopilotTargetX; // Snap player to target.
        playerY = autopilotTargetY;

        // Find the main seeded planet by its ID.
        closestScannablePlanet = planets.find(p => p.id === `planet-${autopilotTargetPlanetName}`);

        if (closestScannablePlanet) {
            // Pre-generate scan data for the main planet and its moons to ensure consistent results.
            const mainPlanetSeed = hashString(autopilotTargetPlanetName);
            closestScannablePlanet.scanData = generatePlanetData(mainPlanetSeed, false, autopilotTargetPlanetName);
            closestScannablePlanet.scanData.seed = mainPlanetSeed;
            closestScannablePlanet.scanData.specificName = autopilotTargetPlanetName;

            closestScannablePlanet.moons.forEach((moon, index) => {
                const moonSeed = hashString(`${mainPlanetSeed}-${index}`);
                moon.scanData = generatePlanetData(moonSeed, true, null); // Moons get random names, so `specificName` is null.
                moon.scanData.seed = moonSeed;
                moon.scanData.specificName = null;
            });
        }

        // Trigger scan immediately on arrival.
        isScanning = true;
        scanTimer = SCAN_DELAY; // Start scan timer to show loading.
        lastPlayerMoveTime = Date.now();
        return;
    }

    // Move player towards target.
    const directionX = dx / distance;
    const directionY = dy / distance;

    const autoSpeed = PLAYER_SPEED * AUTOPILOT_SPEED_MULTIPLIER * (deltaTime / 16);
    velocityX = directionX * autoSpeed;
    velocityY = directionY * autoSpeed;
}

function stopAutopilot() {
    // Deactivates autopilot.
    autopilotActive = false;
    velocityX = 0; // Stop player movement.
    velocityY = 0;
    playerElement.classList.remove('autopilot-outline'); // Remove visual indicator.
    // Do NOT clear autopilotTargetPlanetName here, it's needed for scan info
}

init(); // Call init to start the game.
