# 🔌 Port Killer CLI

CLI to kill processes listening on ports in Linux — interactive mode **and** agent-friendly.

## ✨ Features

- 🎯 Interactive checkbox interface (multi-select)
- 🎨 Color-coded icons by process type (Node, Python, Docker, DBs...)
- 📁 Auto-detects projects and directories
- ⏱️ Process uptime display
- 🔒 Hides system ports (< 1000) by default
- 🤖 **Agent Mode**: direct args, JSON output, headless (`-y`)

## 🚀 Installation

```bash
npm install -g pk-port
```

Or with `npx`:

```bash
npx pk-port
```

## 📦 Upgrade

```bash
npm update -g pk-port
```

## 💡 Usage

### Interactive Mode (default)

```bash
pk
```

Navigate with ↑↓, select with Space, confirm with Enter, exit with ESC.

### Agent Mode (headless)

```bash
pk 3000                # Kill port 3000 (TCP+UDP)
pk 3000 8080           # Kill multiple ports
pk --pid 1234          # Kill by PID
pk 3000 --yes          # Kill without confirmation
pk --list              # List ports (table)
pk --json              # List ports (JSON)
pk --json --list       # List JSON explicitly
pk -a --json           # List JSON including system ports
```

### Common combinations for agents

```bash
# 1. Discover what is listening
pk --json

# 2. Parse JSON and kill specific port
pk 3000 --yes

# 3. Kill by PID
pk --pid 12345 --yes
```

## Flags

| Flag | Description |
|------|-------------|
| `-a, --all` | Show system ports (< 1000) |
| `-l, --list` | List only, no kill |
| `--json` | JSON output (machine-readable) |
| `-y, --yes` | Skip confirmation (headless/CI) |
| `--pid <n>` | Kill process by PID |
| `-h, --help` | Show help |

## JSON Schema

`pk --json` returns an array of objects:

```json
[
  {
    "port": 3000,
    "proto": "TCP",
    "pid": 1234,
    "process": "node",
    "project": "my-app",
    "cwd": "/home/user/my-app",
    "uptime": "02:15:00",
    "command": "node server.js"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `port` | number | Port number |
| `proto` | string | `TCP` or `UDP` |
| `pid` | number | Process PID |
| `process` | string\|null | Process name (e.g. `node`, `python3`) |
| `project` | string\|null | Project name (based on directory) |
| `cwd` | string\|null | Process working directory |
| `uptime` | string\|null | Uptime (format `hh:mm:ss` or `dd:hh:mm`) |
| `command` | string\|null | Full process command |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success (ports closed or listed OK) |
| `1` | Error (port not found, kill failed) |

## Agent integration examples

### Agent CLI (bash)

```bash
# List ports and kill 3000
ports=$(pk --json)
port_3000=$(echo "$ports" | jq '.[] | select(.port==3000)')
if [ -n "$port_3000" ]; then
  pk 3000 --yes
fi
```

### Agent Node.js (Bun/Node)

```ts
const { execSync } = require("child_process");

const out = execSync("pk --json", { encoding: "utf8" });
const ports = JSON.parse(out);

const target = ports.find((p) => p.port === 3000);
if (target) {
  execSync("pk 3000 --yes", { stdio: "inherit" });
}
```

### Agent Python

```python
import subprocess, json

out = subprocess.check_output(["pk", "--json"])
ports = json.loads(out)

for p in ports:
    if p["port"] == 3000:
        subprocess.run(["pk", "3000", "--yes"])
```

## 🤖 Agent Skill Install

Install `pk` as a skill in AI agents (OpenCode, Claude Code, Aider, Cursor, Windsurf, etc.) so they know how to use it:

```bash
pk --agent-install                 # Auto-discover agents and install interactively
pk --agent-install --path ~/my-agent/skills/  # Install to custom path
pk --agent-install --dry-run       # Simulate without writing files
pk --agent-uninstall               # Remove skill from agents
pk --agent-uninstall --dry-run     # Simulate removal
```

The skill file (`port-killer.md`) is written in English and contains all CLI commands, flags, JSON schema, exit codes, and integration examples in Bash, Node.js, and Python.

### Searched Paths

| Agent | Project | User |
|-------|---------|------|
| OpenCode | `.opencode/skills/` | `~/.config/opencode/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Generic Agents | `.agents/skills/` | `~/.agents/skills/` |
| Aider | — | `~/.aider/skills/` |
| Cursor | — | `~/.cursor/skills/` |
| Windsurf | — | `~/.windsurf/skills/` |

If no directories are found, you will be prompted for a custom path.

## 📋 Requirements

- Linux (`ss` command available)
- Node.js 18+
- npm, bun, or npx

## 📝 License

MIT © [LeonardoWSR](https://github.com/leonardowsr)
