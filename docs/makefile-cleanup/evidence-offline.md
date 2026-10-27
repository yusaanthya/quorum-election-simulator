# Offline evidence (collected 2026-10-27 by the main agent, network-capable shell)

Purpose: let read-only critics without network access inspect claims that
otherwise need api.github.com.

## E9 — v0.1.1 release asset

`gh release view v0.1.1 -R yusaanthya/quorum-election-simulator --json tagName,name,publishedAt,assets`:

```
{"assets":[{"digest":"sha256:0cd1872b5767e987b8d5a2f5151fb9b5ccf4d8f1453a5467b049a65e9f4d10fd","name":"quorum-election_v0.1.rar","size":12028701}],"name":"Quorum Election v0.1.1","publishedAt":"2025-10-20T14:57:24Z","tagName":"v0.1.1"}
```

Local download `$TMPDIR/rel011/quorum-election_v0.1.rar`:
`sha256sum` = `0cd1872b5767e987b8d5a2f5151fb9b5ccf4d8f1453a5467b049a65e9f4d10fd` (matches the
GitHub-reported digest above).

Entry listing (RAR5 header parser, no extraction; columns: type, unpacked size, name):

```
file       413 quorum-election_v0.1/log/log_output.txt
file   3716288 quorum-election_v0.1/quorum_election_app_darwin_amd64
file   3675234 quorum-election_v0.1/quorum_election_app_darwin_arm64
file   3723018 quorum-election_v0.1/quorum_election_app_linux_amd64
file   3725122 quorum-election_v0.1/quorum_election_app_linux_arm64
file   4114432 quorum-election_v0.1/quorum_election_app_windows_amd64.exe
file   3973120 quorum-election_v0.1/quorum_election_app_windows_arm64.exe
dir          0 quorum-election_v0.1/log
dir          0 quorum-election_v0.1
```

So the v0.1.1 archive has `log/` beside the six binaries, and `log/` is not empty
(it contains `log_output.txt`).

## Linkage of the six outputs (spec section 9)

Built from commit c257e98 with the current Makefile (`make all VERSION=0.2.0`,
go1.24.1 linux/amd64 host); `file` output (BuildID trimmed):

```
quorum_election_app_darwin_amd64:      Mach-O 64-bit x86_64 executable, flags:<|DYLDLINK|PIE>
quorum_election_app_darwin_arm64:      Mach-O 64-bit arm64 executable, flags:<|DYLDLINK|PIE>
quorum_election_app_linux_amd64:       ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, with debug_info, not stripped
quorum_election_app_linux_arm64:       ELF 64-bit LSB executable, ARM aarch64, version 1 (SYSV), statically linked, with debug_info, not stripped
quorum_election_app_windows_amd64.exe: PE32+ executable (console) x86-64, for MS Windows
quorum_election_app_windows_arm64.exe: PE32+ executable (console) Aarch64, for MS Windows
```

The native linux/amd64 build is dynamically linked (cgo enabled for the host platform);
the cross-compiled linux/arm64 build is static.
