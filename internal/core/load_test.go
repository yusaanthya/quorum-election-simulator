package core

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

// simulateLoad runs a load test by broadcasting numRequests heartbeats concurrently.
func simulateLoad(q *Quorum, numRequests int) (time.Duration, error) {
	if q.LeaderID == -1 {
		return 0, fmt.Errorf("no leader elected, cannot simulate load")
	}
	start := time.Now()
	wg := sync.WaitGroup{}
	for i := 0; i < numRequests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			msg := Message{From: q.LeaderID, Type: Heartbeat}
			q.Broadcast(msg)
		}()
	}
	wg.Wait()
	return time.Since(start), nil
}

func TestSimulateLoad(t *testing.T) {
	mockTimer := NewMockTimer(time.Now())
	mockNotifier := NewMockNotifier()
	q := NewQuorum(5, mockTimer, mockNotifier)
	q.networker = NewTestNetworkRouter(q)
	q.Start()

	// Wait for leader election
	time.Sleep(500 * time.Millisecond)

	// Run load test
	numRequests := 1000
	duration, err := simulateLoad(q, numRequests)
	if err != nil {
		t.Fatalf("Load test failed: %v", err)
	}
	logrus.Infof("Processed %d heartbeats in %v", numRequests, duration)

	q.Stop()
}
