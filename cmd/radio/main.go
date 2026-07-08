package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"free-radio/internal/stations"
)

var (
	loadedStations = make(map[string]stations.Station)
	stationsList   []map[string]interface{}
	stationsMutex  sync.RWMutex
)

// Scan configured directory for station folders
func loadStations() {
	stationsMutex.Lock()
	defer stationsMutex.Unlock()

	loadedStations = make(map[string]stations.Station)
	stationsList = nil

	stationsDir := os.Getenv("STATIONS_DIR")
	if stationsDir == "" {
		stationsDir = "."
	}
	log.Printf("Scanning stations from directory: %s", stationsDir)

	entries, err := os.ReadDir(stationsDir)
	if err != nil {
		log.Printf("Error scanning stations directory '%s': %v", stationsDir, err)
		return
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		// Skip system/code folders if scanning the current directory
		if stationsDir == "." {
			if strings.HasPrefix(name, ".") || name == "cmd" || name == "internal" || name == "static" {
				continue
			}
		} else if strings.HasPrefix(name, ".") {
			continue
		}

		folderPath := filepath.Join(stationsDir, name)

		// Look for 'songs' subfolder to identify as a station folder
		songsDir := filepath.Join(folderPath, "songs")
		if _, err := os.Stat(songsDir); os.IsNotExist(err) {
			continue
		}

		// Instantiate station
		station, err := stations.NewLocalStation(folderPath)
		if err != nil {
			log.Printf("Failed to load station from folder '%s': %v", folderPath, err)
			continue
		}

		// Generate uniform slug ID
		id := slugify(station.Name())
		loadedStations[id] = station

		// Check avatar availability
		hasAvatar := false
		pic, _ := station.Avatar()
		if len(pic) > 0 {
			hasAvatar = true
		}

		logoURL := ""
		if hasAvatar {
			logoURL = fmt.Sprintf("/api/stations/%s/avatar", id)
		}

		genre := "Local Station"
		if len(station.Tags()) > 0 {
			genre = strings.Join(station.Tags(), " / ")
		} else if desc := station.Description(); desc != "" {
			genre = desc
		}

		stationsList = append(stationsList, map[string]interface{}{
			"id":      id,
			"name":    station.Name(),
			"genre":   genre,
			"logoUrl": logoURL,
		})
	}
	log.Printf("Successfully loaded %d local stations", len(loadedStations))
}

func slugify(s string) string {
	slug := strings.ToLower(s)
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			return r
		}
		return -1
	}, slug)
	if slug == "" {
		slug = fmt.Sprintf("station-%d", time.Now().UnixNano())
	}
	return slug
}

func main() {
	// Dynamically scan and load stations from local folders
	loadStations()

	// API endpoints
	http.HandleFunc("/api/stations", handleStationsList)
	http.HandleFunc("/api/stations/", handleStationSubpath)

	// Serve static frontend files from "./static"
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Go Radio Server starting on http://localhost:%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

// Handler for retrieving JSON list of available stations
func handleStationsList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	stationsMutex.RLock()
	defer stationsMutex.RUnlock()

	// Handle empty case
	if stationsList == nil {
		_, _ = w.Write([]byte("[]"))
		return
	}

	_ = json.NewEncoder(w).Encode(stationsList)
}

// Router dispatcher for play stream and avatar requests
func handleStationSubpath(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if strings.HasSuffix(path, "/play") {
		handlePlay(w, r)
	} else if strings.HasSuffix(path, "/avatar") {
		handleAvatar(w, r)
	} else {
		http.Error(w, "Not found", http.StatusNotFound)
	}
}

// Play station: generates random or indexed audio bytes and streams it
func handlePlay(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Range")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/stations/")
	id = strings.TrimSuffix(id, "/play")

	stationsMutex.RLock()
	station, exists := loadedStations[id]
	stationsMutex.RUnlock()

	if !exists {
		http.Error(w, "Station not found", http.StatusNotFound)
		return
	}

	// Parse query params for seed and position
	seedStr := r.URL.Query().Get("seed")
	posStr := r.URL.Query().Get("position")

	seed := time.Now().UnixNano()
	if seedStr != "" {
		if val, err := strconv.ParseInt(seedStr, 10, 64); err == nil {
			seed = val
		}
	}

	var position uint32 = 0
	if posStr != "" {
		if val, err := strconv.ParseUint(posStr, 10, 32); err == nil {
			position = uint32(val)
		}
	}

	audioBytes, err := station.Play(seed, position)
	if err != nil {
		log.Printf("Error playing station '%s' (seed=%d, pos=%d): %v", id, seed, position, err)
		http.Error(w, fmt.Sprintf("Failed to load song: %v", err), http.StatusInternalServerError)
		return
	}

	// Serve track with built-in range request seeking support
	reader := bytes.NewReader(audioBytes)
	http.ServeContent(w, r, "track.mp3", time.Time{}, reader)
}

// Serve station avatar binary with correct MIME type caching
func handleAvatar(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/stations/")
	id = strings.TrimSuffix(id, "/avatar")

	stationsMutex.RLock()
	station, exists := loadedStations[id]
	stationsMutex.RUnlock()

	if !exists {
		http.Error(w, "Station not found", http.StatusNotFound)
		return
	}

	pic, err := station.Avatar()
	if err != nil || len(pic) == 0 {
		http.Error(w, "Avatar not found", http.StatusNotFound)
		return
	}

	contentType := http.DetectContentType(pic)
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400") // Cache avatar for 24h
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(pic)
}
