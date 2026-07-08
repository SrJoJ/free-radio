package stations

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"

	"github.com/gabriel-vasile/mimetype"
)

var MIMETYPES = []string{"audio/basic", "audio/flac", "audio/mid", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/vnd.wav",
	"audio/vorbis", "audio/wav", "audio/wave", "audio/webm", "audio/x-aiff", "audio/x-mpegurl", "audio/x-pn-wav",
	"audio/x-wav", "auido/L24"}

func isAudio(mimeType string) bool {
	for _, t := range MIMETYPES {
		if t == mimeType {
			return true
		}
	}
	return false
}

// To expensive for my servers
//type Song struct {
//	Name   string
//	Length time.Duration
//	Picture []byte
//	Path   string
//}

type LocalStation struct {
	Title   string
	Picture []byte
	Songs   []string
}

// NewLocalStation creates station from foler
// Example Satation - Name
// ├── avatar.png   - Picture
// └── songs        - Songs
//
//	└── Неизвестный - Без Названия.mp3 - path is element
func NewLocalStation(path string) (*LocalStation, error) {
	name := filepath.Base(path)
	pic, err := os.ReadFile(filepath.Join(path, "avatar.png"))
	if err != nil {
		return nil, fmt.Errorf("failed to load avatar to memory: %v", err)
	}

	var songs []string
	entries, err := os.ReadDir(path + "/songs")
	if err != nil {
		return nil, fmt.Errorf("failed to read songs directory: %v", err)
	}
	for i, _ := range entries {
		entry := entries[i] // TODO: add folding support
		if entry.IsDir() {
			fmt.Printf("Skipping directory: %s\n", entry.Name())
		}
		filePath := filepath.Join(path, "songs", entry.Name())

		filetype, err := mimetype.DetectFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("failed to detect file type: %v", err)
		}
		if isAudio(filetype.String()) {
			songs = append(songs, filePath)
		}
	}

	return &LocalStation{
		Title:   name,
		Picture: pic,
		Songs:   songs,
	}, nil
}

func (s LocalStation) Play(seed int64, position uint32) ([]byte, error) {
	if len(s.Songs) == 0 {
		return nil, fmt.Errorf("no songs in station")
	}
	generator := rand.New(rand.NewSource(seed))
	idx := (generator.Uint32() + position) % uint32(len(s.Songs))

	return os.ReadFile(s.Songs[idx])
}

func (s LocalStation) Name() string {
	return s.Title
}

func (s LocalStation) Description() string {
	return "Local station"
}

func (s LocalStation) Tags() []string {
	return []string{}
}

func (s LocalStation) Avatar() ([]byte, error) {
	return s.Picture, nil
}
