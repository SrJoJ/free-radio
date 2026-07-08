// UI State
let stations = [];
let activeStation = null;
let isPlaying = false;
let playTime = 0;
let timerInterval = null;

// Playlist Stream Seed/Position State
let activeSeed = 0;
let activePosition = 0;

// Visualizer State
let audioCtx = null;
let analyser = null;
let source = null;
let dataArray = [];
let animationFrameId = null;
let currentThemeIndex = 0;
const visualizerThemes = [
    { name: 'Classic Bars', code: 'bars' },
    { name: 'Neon Waveform', code: 'wave' },
    { name: 'Orbit Ring', code: 'ring' }
];

// DOM Elements
const audioPlayer = document.getElementById('audio-player');
const stationList = document.getElementById('station-list');
const playBtn = document.getElementById('play-btn');
const muteBtn = document.getElementById('mute-btn');
const volumeSlider = document.getElementById('volume-slider');
const volumeTooltip = document.getElementById('volume-tooltip');
const streamTimer = document.getElementById('stream-timer');
const searchInput = document.getElementById('search-input');

// Player Card Elements
const playerStationName = document.getElementById('player-station-name');
const playerGenre = document.getElementById('player-genre');
const playerTrackTitle = document.getElementById('player-track-title');
const playerLogo = document.getElementById('player-logo');
const vinylDisc = document.getElementById('vinyl-disc');

// Visualizer Elements
const canvas = document.getElementById('visualizer-canvas');
const ctx = canvas.getContext('2d');
const themeBtn = document.getElementById('visualizer-theme-btn');
const themeLabel = document.getElementById('visualizer-theme-label');

// Core Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Set Canvas Dimensions
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Load Local Storage Volume
    const savedVolume = localStorage.getItem('radio-volume');
    if (savedVolume !== null) {
        audioPlayer.volume = parseFloat(savedVolume);
        volumeSlider.value = savedVolume;
        updateVolumeUI(parseFloat(savedVolume));
    }

    // Fetch stations from backend API
    fetchStations();

    // Setup Event Listeners
    setupEventListeners();
});

// Resize visualizer canvas to fit container
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}

// Fetch Stations from Go backend
async function fetchStations() {
    try {
        const response = await fetch('/api/stations');
        if (!response.ok) throw new Error("Failed to load stations list");
        
        stations = await response.json();
        renderStations(stations);
        
        // Auto-select first station
        if (stations.length > 0) {
            selectStation(stations[0]);
        } else {
            playerStationName.textContent = "No Stations Found";
            playerGenre.textContent = "Create local station folders";
            playerTrackTitle.textContent = "Please add folders with a 'songs' subfolder to the server directory.";
            stationList.innerHTML = `<div class="loading-spinner">No local folders with a 'songs/' subfolder found.</div>`;
        }
    } catch (err) {
        console.error(err);
        stationList.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger)"></i> Error loading stations.</div>`;
    }
}

// Setup all DOM interaction events
function setupEventListeners() {
    // Play/Pause Action
    playBtn.addEventListener('click', togglePlayback);

    // Mute/Volume Actions
    muteBtn.addEventListener('click', toggleMute);
    volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        audioPlayer.volume = val;
        localStorage.setItem('radio-volume', val);
        updateVolumeUI(val);
    });

    // Theme Selector
    themeBtn.addEventListener('click', cycleVisualizerTheme);

    // Search filter
    searchInput.addEventListener('input', filterStations);

    // Handle audio buffering states
    audioPlayer.addEventListener('waiting', () => {
        playerTrackTitle.textContent = "Buffering stream...";
    });

    audioPlayer.addEventListener('playing', () => {
        playerTrackTitle.textContent = `Song #${activePosition + 1} Playing`;
        startTimer();
    });

    audioPlayer.addEventListener('error', (e) => {
        console.error("Audio playback error:", e);
        playerTrackTitle.textContent = "Error: Check connection or song format.";
        stopTimer();
    });

    // Automatically transition and play next song when current one finishes
    audioPlayer.addEventListener('ended', () => {
        if (activeStation) {
            activePosition++;
            playerTrackTitle.textContent = "Loading next song...";
            
            // Update source for the next song using same seed but incremented position
            audioPlayer.src = `/api/stations/${activeStation.id}/play?seed=${activeSeed}&position=${activePosition}`;
            audioPlayer.play()
                .catch(err => {
                    console.error("Failed to play next song:", err);
                    playerTrackTitle.textContent = "Transition failed. Click Play to retry.";
                });
        }
    });
}

// Render Station List DOM
function renderStations(stationArr) {
    stationList.innerHTML = '';
    
    if (stationArr.length === 0) {
        stationList.innerHTML = `<div class="loading-spinner">No stations available.</div>`;
        return;
    }

    stationArr.forEach(station => {
        const li = document.createElement('li');
        li.className = `station-item ${activeStation && activeStation.id === station.id ? 'active' : ''}`;
        li.dataset.id = station.id;
        
        let avatarContent = `<i class="fa-solid fa-radio"></i>`;
        if (station.logoUrl) {
            avatarContent = `<img src="${station.logoUrl}" alt="${station.name}" onerror="this.outerHTML='<i class=&quot;fa-solid fa-radio&quot;></i>'">`;
        }

        li.innerHTML = `
            <div class="station-avatar">
                ${avatarContent}
            </div>
            <div class="station-info">
                <div class="station-name">${escapeHTML(station.name)}</div>
                <div class="station-genre">${escapeHTML(station.genre)}</div>
            </div>
            <div class="playing-bars">
                <span class="bar"></span>
                <span class="bar"></span>
                <span class="bar"></span>
            </div>
        `;

        // Click handler to select station
        li.addEventListener('click', () => {
            selectStation(station);
        });

        stationList.appendChild(li);
    });
}

// Select a radio station to play
function selectStation(station) {
    const isNew = !activeStation || activeStation.id !== station.id;
    activeStation = station;
    
    // Update player card details
    playerStationName.textContent = station.name;
    playerGenre.textContent = station.genre;
    playerTrackTitle.textContent = "Ready to stream";
    
    // Set logo
    if (station.logoUrl) {
        playerLogo.src = station.logoUrl;
        playerLogo.style.display = 'block';
    } else {
        playerLogo.style.display = 'none';
    }

    // Highlight active in list
    document.querySelectorAll('.station-item').forEach(item => {
        item.classList.remove('active');
        item.classList.remove('playing');
        if (item.dataset.id === station.id) {
            item.classList.add('active');
            if (isPlaying) {
                item.classList.add('playing');
            }
        }
    });

    if (isNew) {
        // Initialize random seed and start at position 0 for the newly selected station
        activeSeed = Math.floor(Math.random() * 2147483647);
        activePosition = 0;
        
        audioPlayer.src = `/api/stations/${station.id}/play?seed=${activeSeed}&position=${activePosition}`;
        resetTimer();
    }

    if (isPlaying && isNew) {
        audioPlayer.play().catch(err => console.error("Error playing stream:", err));
    }
}

// Play / Pause stream toggle
function togglePlayback() {
    if (!activeStation) return;

    if (isPlaying) {
        audioPlayer.pause();
        isPlaying = false;
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        vinylDisc.classList.add('paused');
        
        stopTimer();
        
        document.querySelectorAll('.station-item').forEach(item => item.classList.remove('playing'));
    } else {
        // Initialize AudioContext on first user interaction
        initAudioContext();

        audioPlayer.play()
            .then(() => {
                isPlaying = true;
                playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
                vinylDisc.classList.remove('paused');
                vinylDisc.classList.add('vinyl-spin');
                
                // Start visualizer animation loop
                visualize();
                
                // Update active list item UI
                const activeItem = document.querySelector(`.station-item[data-id="${activeStation.id}"]`);
                if (activeItem) activeItem.classList.add('playing');
            })
            .catch(err => {
                console.error("Playback block/error:", err);
                playerTrackTitle.textContent = "Playback failed. Check stream URL.";
            });
    }
}

// Manage volume slider mute states
function toggleMute() {
    if (audioPlayer.muted) {
        audioPlayer.muted = false;
        updateVolumeUI(audioPlayer.volume);
    } else {
        audioPlayer.muted = true;
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
        volumeTooltip.textContent = 'Muted';
    }
}

function updateVolumeUI(val) {
    if (audioPlayer.muted) audioPlayer.muted = false;
    
    if (val === 0) {
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-off"></i>';
    } else if (val < 0.4) {
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-low"></i>';
    } else {
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
    }
    volumeTooltip.textContent = Math.round(val * 100) + '%';
}

// Filter station lists on search input
function filterStations() {
    const query = searchInput.value.toLowerCase().trim();
    const filtered = stations.filter(station => {
        return station.name.toLowerCase().includes(query) || 
               (station.genre && station.genre.toLowerCase().includes(query));
    });
    renderStations(filtered);
}

// Timer Functions
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        playTime++;
        
        const hrs = Math.floor(playTime / 3600);
        const mins = Math.floor((playTime % 3600) / 60);
        const secs = playTime % 60;
        
        streamTimer.textContent = 
            (hrs > 0 ? (hrs < 10 ? '0' + hrs : hrs) + ':' : '') +
            (mins < 10 ? '0' + mins : mins) + ':' +
            (secs < 10 ? '0' + secs : secs);
    }, 1000);
}

// Stop playback elapsed timer
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// Reset playback elapsed timer
function resetTimer() {
    stopTimer();
    playTime = 0;
    streamTimer.textContent = "00:00:00";
}

// Initialize Web Audio API components
function initAudioContext() {
    if (audioCtx) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    
    // Connect audio player
    source = audioCtx.createMediaElementSource(audioPlayer);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

// Cycle visualizer themes
function cycleVisualizerTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % visualizerThemes.length;
    const theme = visualizerThemes[currentThemeIndex];
    themeLabel.textContent = theme.name;
}

// Visualizer Render Animation Loop
function visualize() {
    if (!isPlaying || !analyser) return;

    animationFrameId = requestAnimationFrame(visualize);
    const bufferLength = analyser.frequencyBinCount;
    const theme = visualizerThemes[currentThemeIndex].code;

    if (theme === 'bars') {
        analyser.getByteFrequencyData(dataArray);
        drawBars(bufferLength);
    } else if (theme === 'wave') {
        analyser.getByteTimeDomainData(dataArray);
        drawWaveform(bufferLength);
    } else if (theme === 'ring') {
        analyser.getByteFrequencyData(dataArray);
        drawOrbitRing(bufferLength);
    }
}

// 1. Theme: Classic Bars
function drawBars(bufferLength) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const barWidth = (canvas.width / bufferLength) * 1.5;
    let barHeight;
    let x = 0;

    const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0, '#7c3aed'); // Violet
    gradient.addColorStop(0.5, '#06b6d4'); // Cyan
    gradient.addColorStop(1, '#ec4899'); // Pink

    for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height * 0.75;

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(6, 182, 212, 0.4)';
        
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
    }
    ctx.shadowBlur = 0;
}

// 2. Theme: Neon Waveform
function drawWaveform(bufferLength) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#06b6d4'; // Cyan
    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(6, 182, 212, 0.8)';
    ctx.beginPath();

    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

// 3. Theme: Orbit Ring (Around Vinyl)
function drawOrbitRing(bufferLength) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const baseRadius = 102; 
    
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(139, 92, 246, 0.6)';

    ctx.beginPath();
    ctx.arc(centerX, centerY, baseRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 0; i < bufferLength; i += 2) {
        const angle = (i / bufferLength) * 2 * Math.PI;
        const amplitude = (dataArray[i] / 255.0) * 45; 
        
        const startX = centerX + Math.cos(angle) * baseRadius;
        const startY = centerY + Math.sin(angle) * baseRadius;
        
        const endX = centerX + Math.cos(angle) * (baseRadius + amplitude);
        const endY = centerY + Math.sin(angle) * (baseRadius + amplitude);

        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        gradient.addColorStop(0, '#06b6d4'); // Cyan
        gradient.addColorStop(1, '#8b5cf6'); // Violet

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
}

// Utility: HTML Escaping
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
