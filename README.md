# 🔌 Port Killer CLI

CLI para fechar portas de processos no Linux — modo interativo **e** agent-friendly.

## ✨ Features

- 🎯 Interface interativa com checkboxes (multiplas portas)
- 🎨 Cores e ícones por tipo de processo (Node, Python, Docker, DBs...)
- 📁 Detecta projetos e diretórios automaticamente
- ⏱️ Uptime dos processos
- 🔒 Oculta portas de sistema (< 1000) por padrão
- 🤖 **Modo Agent**: args direto, JSON output, headless (`-y`)

## 🚀 Instalação

```bash
npm install -g pk-port
```

Ou com `npx`:

```bash
npx pk-port
```

## 📦 Upgrade

```bash
npm update -g pk-port
```

## 💡 Uso

### Modo Interativo (default)

```bash
pk
```

Navegue com ↑↓, selecione com Space, confirme com Enter, saia com ESC.

### Modo Agent (headless)

```bash
pk 3000                # Mata porta 3000 (TCP+UDP)
pk 3000 8080           # Mata multiplas portas
pk --pid 1234          # Mata por PID
pk 3000 --yes          # Mata sem confirmacao
pk --list              # Lista portas (tabela)
pk --json              # Lista portas (JSON)
pk --json --list       # Lista JSON explicito
pk -a --json           # Lista JSON incluindo portas sistema
```

### Combinacoes comuns para agents

```bash
# 1. Descobrir o que esta ouvindo
pk --json

# 2. Parsear JSON e matar porta especifica
pk 3000 --yes

# 3. Matar por PID
pk --pid 12345 --yes
```

## Flags

| Flag | Descrição |
|------|-----------|
| `-a, --all` | Mostrar portas de sistema (< 1000) |
| `-l, --list` | Apenas listar, sem matar |
| `--json` | Output JSON (machine-readable) |
| `-y, --yes` | Pular confirmacao (headless/CI) |
| `--pid <n>` | Matar processo por PID |
| `-h, --help` | Mostrar ajuda |

## JSON Schema

`pk --json` retorna um array de objetos:

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

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `port` | number | Numero da porta |
| `proto` | string | `TCP` ou `UDP` |
| `pid` | number | PID do processo |
| `process` | string\|null | Nome do processo (ex: `node`, `python3`) |
| `project` | string\|null | Nome do projeto (baseado no diretorio) |
| `cwd` | string\|null | Diretorio de trabalho do processo |
| `uptime` | string\|null | Tempo de atividade (formato `hh:mm:ss` ou `dd:hh:mm`) |
| `command` | string\|null | Comando completo do processo |

## Exit Codes

| Code | Significado |
|------|-------------|
| `0` | Sucesso (portas fechadas ou listagem OK) |
| `1` | Erro (porta nao encontrada, kill falhou) |

## Exemplos de integracao com agent

### Agent CLI (bash)

```bash
# Listar portas e matar a 3000
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

## 📋 Requisitos

- Linux (comando `ss` disponivel)
- Node.js 18+
- npm, bun, ou npx

## 📝 Licença

MIT © [LeonardoWSR](https://github.com/leonardowsr)
