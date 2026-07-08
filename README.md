# Free Radio | Dynamic Local Station Server

A premium, lightweight radio player and server powered by **Go** and **Vanilla Frontend Technologies** (HTML5, CSS3, ES6 JavaScript).

Exposes local folder directories containing a `songs/` subfolder as play-ready radio stations by integrating your internal `stations.Station` package.

---

## Features

1. **Dynamic Local Folder Scanning**:
   - Scans the root server directory for folders.
   - Any folder containing a `songs/` subfolder is dynamically registered as an active radio station on start.
   - Integrates the `internal/stations.NewLocalStation` method.

2. **Avatar Binary Server (`/api/stations/{id}/avatar`)**:
   - Safely reads your local station's `avatar.png` and streams the image byte buffer to the client with correct cache and MIME headers.

3. **Randomized Playlist Streaming (`/api/stations/{id}/play`)**:
   - Interacts with your station's `.Play(seed, position)` signature.
   - Converts song data into a seekable stream supporting range requests using Go's built-in `http.ServeContent`.
   - The frontend automatically increments the playlist position index when a song finishes playing, ensuring continuous, infinite playback.

4. **Interactive Web Audio Visualizers**:
   - Toggle between **Classic Bars**, **Neon Waveform**, and **Orbit Ring** visualizer tracks rendered on canvas.

---

## Quick Start

### 1. Structure Your Stations
Place your station folders in the root directory. Structure:
```text
Example Satation
├── avatar.png
└── songs
    └── track1.mp3
    └── track2.wav
```

### 2. Run the Server
Ensure you have Go installed, then execute:
```bash
go run cmd/radio/main.go
```

By default, the server scans the current working directory (`.`). You can customize the port and configure the directory where your stations are located using environment variables:
```bash
PORT=9000 STATIONS_DIR="/path/to/stations" go run cmd/radio/main.go
```

### 3. Access the Player
Open your web browser and navigate to:
[http://localhost:8080](http://localhost:8080)

---

## Code Architecture

* [cmd/radio/main.go](file:///home/sealekse/GolandProjects/free-radio/cmd/radio/main.go) - Main server file. Handles static serving, directory scans, and REST API play/avatar streams.
* [internal/stations/stations.go](file:///home/sealekse/GolandProjects/free-radio/internal/stations/stations.go) - Interface structure.
* [internal/stations/local-station.go](file:///home/sealekse/GolandProjects/free-radio/internal/stations/local-station.go) - LocalStation struct representing files directory logic. We fixed byte-slice reading bugs here.
* [static/index.html](file:///home/sealekse/GolandProjects/free-radio/static/index.html) - Structural markup.
* [static/style.css](file:///home/sealekse/GolandProjects/free-radio/static/style.css) - Premium visual design stylesheet.
* [static/app.js](file:///home/sealekse/GolandProjects/free-radio/static/app.js) - App state client that queries backend endpoints, hooks the HTML5 audio element lifecycle, and loops visualizer canvases.