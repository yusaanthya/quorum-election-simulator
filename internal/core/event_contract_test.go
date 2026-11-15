package core

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/Anthya1104/quorum-election-cli/internal/core/raft"
)

const (
	observerPath = "observer.go"
	eventsTSPath = "../../web/src/sim/events.ts"
)

var (
	tsUnionBody = `(?s)export type %s =([^;]*);`
	tsQuoted    = regexp.MustCompile(`"([^"]*)"`)
	tsStruct    = regexp.MustCompile(`(?s)export interface SimEvent \{(.*?)\n\}`)
	tsField     = regexp.MustCompile(`(?m)^  (\w+)(\??):`)
)

func readTS(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile(eventsTSPath)
	if err != nil {
		t.Fatalf("read %s: %v", eventsTSPath, err)
	}
	return string(b)
}

// tsUnion returns the string members of `export type <name> = "a" | "b";`.
func tsUnion(t *testing.T, src, name string) []string {
	t.Helper()
	m := regexp.MustCompile(strings.Replace(tsUnionBody, "%s", name, 1)).FindStringSubmatch(src)
	if m == nil {
		t.Fatalf("%s: union type %q not found", eventsTSPath, name)
	}
	var out []string
	for _, q := range tsQuoted.FindAllStringSubmatch(m[1], -1) {
		out = append(out, q[1])
	}
	// Anything besides quoted strings, "|" and whitespace means the regex is not reading this union correctly.
	if rest := strings.NewReplacer("|", "", " ", "", "\n", "", "\t", "").Replace(tsQuoted.ReplaceAllString(m[1], "")); rest != "" || len(out) == 0 {
		t.Fatalf("%s: union %q has unparsable content %q", eventsTSPath, name, m[1])
	}
	return out
}

// goConsts returns the string values of const specs in observer.go whose
// declared type is typeName ("" for untyped) and whose name has the given prefix.
func goConsts(t *testing.T, typeName, prefix string) []string {
	t.Helper()
	f, err := parser.ParseFile(token.NewFileSet(), observerPath, nil, 0)
	if err != nil {
		t.Fatalf("parse %s: %v", observerPath, err)
	}
	var out []string
	for _, d := range f.Decls {
		gd, ok := d.(*ast.GenDecl)
		if !ok || gd.Tok != token.CONST {
			continue
		}
		for _, s := range gd.Specs {
			vs := s.(*ast.ValueSpec)
			declared := ""
			if id, ok := vs.Type.(*ast.Ident); ok {
				declared = id.Name
			}
			if declared != typeName {
				continue
			}
			for i, n := range vs.Names {
				lit, ok := vs.Values[i].(*ast.BasicLit)
				if !strings.HasPrefix(n.Name, prefix) || !ok || lit.Kind != token.STRING {
					continue
				}
				v, _ := strconv.Unquote(lit.Value)
				out = append(out, v)
			}
		}
	}
	if len(out) == 0 {
		t.Fatalf("%s: no %q constants with prefix %q found", observerPath, typeName, prefix)
	}
	return out
}

func compareSets(t *testing.T, what string, goSide, tsSide []string) {
	t.Helper()
	g, ts := toSet(goSide), toSet(tsSide)
	if missing := diff(g, ts); len(missing) > 0 {
		t.Errorf("%s: in Go (%s) but missing from TypeScript (%s): %v", what, observerPath, eventsTSPath, missing)
	}
	if extra := diff(ts, g); len(extra) > 0 {
		t.Errorf("%s: in TypeScript (%s) but missing from Go (%s): %v", what, eventsTSPath, observerPath, extra)
	}
}

func toSet(s []string) map[string]bool {
	m := map[string]bool{}
	for _, v := range s {
		m[v] = true
	}
	return m
}

func diff(a, b map[string]bool) []string {
	var out []string
	for k := range a {
		if !b[k] {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

func TestEventContractFields(t *testing.T) {
	m := tsStruct.FindStringSubmatch(readTS(t))
	if m == nil {
		t.Fatalf("%s: interface SimEvent not found", eventsTSPath)
	}
	tsOptional := map[string]bool{}
	var tsNames []string
	for _, f := range tsField.FindAllStringSubmatch(m[1], -1) {
		tsNames = append(tsNames, f[1])
		tsOptional[f[1]] = f[2] == "?"
	}
	if len(tsNames) == 0 {
		t.Fatalf("%s: no fields parsed from SimEvent", eventsTSPath)
	}

	goOptional := map[string]bool{}
	var goNames []string
	typ := reflect.TypeOf(Event{})
	for i := 0; i < typ.NumField(); i++ {
		name, opts, _ := strings.Cut(typ.Field(i).Tag.Get("json"), ",")
		if name == "" || name == "-" {
			t.Fatalf("Event.%s has no usable json tag", typ.Field(i).Name)
		}
		goNames = append(goNames, name)
		goOptional[name] = strings.Contains(","+opts+",", ",omitempty,")
	}

	compareSets(t, "SimEvent fields", goNames, tsNames)
	for _, n := range goNames {
		if _, ok := tsOptional[n]; ok && goOptional[n] != tsOptional[n] {
			t.Errorf("field %q: Go omitempty=%v (%s) but TypeScript optional=%v (%s)",
				n, goOptional[n], observerPath, tsOptional[n], eventsTSPath)
		}
	}
}

func TestEventContractEventTypes(t *testing.T) {
	compareSets(t, "EventType", goConsts(t, "EventType", "Event"), tsUnion(t, readTS(t), "EventType"))
}

func TestEventContractMessageKinds(t *testing.T) {
	compareSets(t, "MessageKind", goConsts(t, "", "Message"), tsUnion(t, readTS(t), "MessageKind"))
}

func TestEventContractRoles(t *testing.T) {
	// raft.Role is an iota enum whose String() returns "Unknown" past the last role.
	var roles []string
	for r := raft.Role(0); r.String() != "Unknown"; r++ {
		roles = append(roles, r.String())
	}
	compareSets(t, "Role", roles, tsUnion(t, readTS(t), "Role"))
}
