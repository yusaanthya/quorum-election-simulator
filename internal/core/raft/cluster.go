package raft

// Cluster is the fixed set of members a node votes and counts quorum against.
type Cluster struct {
	size int
}

func NewCluster(size int) Cluster {
	return Cluster{size: size}
}

func (c Cluster) Size() int {
	return c.size
}

// Majority is the number of members (self included) needed to win an election or keep leadership.
func (c Cluster) Majority() int {
	return c.size/2 + 1
}
