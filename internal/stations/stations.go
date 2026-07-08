package stations

type Station interface {
	Name() string
	Description() string
	Tags() []string
	Avatar() ([]byte, error)
	Play(seed int64, position uint32) ([]byte, error)
}
