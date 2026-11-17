//go:build js && wasm

// Command wasm runs the election simulation inside a browser, so the visualizer can be
// hosted as a static site. It exposes globalThis.quorumSim to JavaScript:
//
//	quorumSim.start({members, timeScale}, onEvent) // onEvent receives one JSON string per event
//	quorumSim.kill(id)
//	quorumSim.restart(members)                     // 0 keeps the current size
//	quorumSim.pause()
//	quorumSim.resume()
//	quorumSim.setTimeScale(n)                      // Chosen factor, clamped to 1-20
//
// Every call except start does nothing before start.
package main

import (
	"encoding/json"
	"syscall/js"

	"github.com/Anthya1104/quorum-election-cli/internal/core"
	"github.com/Anthya1104/quorum-election-cli/internal/sim"
	"github.com/sirupsen/logrus"
)

func main() {
	// The browser console is the only log sink; keep it to problems.
	logrus.SetLevel(logrus.WarnLevel)

	var session *sim.Session

	api := map[string]any{
		"start": js.FuncOf(func(this js.Value, args []js.Value) any {
			if session != nil || len(args) < 2 {
				return nil
			}
			opts, onEvent := args[0], args[1]
			cfg := sim.Config{Members: 5, TimeScale: 3}
			if v := opts.Get("members"); v.Type() == js.TypeNumber {
				cfg.Members = v.Int()
			}
			if v := opts.Get("timeScale"); v.Type() == js.TypeNumber {
				cfg.TimeScale = v.Float()
			}
			session = sim.New(cfg, func(e core.Event) {
				data, err := json.Marshal(e)
				if err == nil {
					onEvent.Invoke(string(data))
				}
			})
			session.Start()
			return nil
		}),
		"kill": js.FuncOf(func(this js.Value, args []js.Value) any {
			if session != nil && len(args) > 0 {
				// KillMember logs and locks; run it off the JS callback.
				id := args[0].Int()
				go session.Kill(id)
			}
			return nil
		}),
		"restart": js.FuncOf(func(this js.Value, args []js.Value) any {
			if session != nil {
				n := 0
				if len(args) > 0 && args[0].Type() == js.TypeNumber {
					n = args[0].Int()
				}
				session.Restart(n)
			}
			return nil
		}),
		"pause": js.FuncOf(func(this js.Value, args []js.Value) any {
			if session != nil {
				session.Pause()
			}
			return nil
		}),
		"resume": js.FuncOf(func(this js.Value, args []js.Value) any {
			if session != nil {
				session.Resume()
			}
			return nil
		}),
		"setTimeScale": js.FuncOf(func(this js.Value, args []js.Value) any {
			if session != nil && len(args) > 0 && args[0].Type() == js.TypeNumber {
				session.SetTimeScale(args[0].Float())
			}
			return nil
		}),
	}
	js.Global().Set("quorumSim", js.ValueOf(api))
	js.Global().Call("dispatchEvent", js.Global().Get("Event").New("quorumsim-ready"))

	select {} // Keep the Go runtime alive for callbacks.
}
