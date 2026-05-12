import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import chalk from "chalk";
import { checkbox, confirm, input } from "@inquirer/prompts";

const SKILL_FILE_NAME = "port-killer.md";

const AGENT_SKILL_PATHS = [
  { agent: "OpenCode (project)", paths: [".opencode/skills"] },
  { agent: "OpenCode (user)", paths: [path.join(os.homedir(), ".config/opencode/skills")] },
  { agent: "Claude Code (project)", paths: [".claude/skills"] },
  { agent: "Claude Code (user)", paths: [path.join(os.homedir(), ".claude/skills")] },
  { agent: "Agents (project)", paths: [".agents/skills"] },
  { agent: "Agents (user)", paths: [path.join(os.homedir(), ".agents/skills")] },
  { agent: "Aider", paths: [path.join(os.homedir(), ".aider/skills")] },
  { agent: "Cursor", paths: [path.join(os.homedir(), ".cursor/skills")] },
  { agent: "Windsurf", paths: [path.join(os.homedir(), ".windsurf/skills")] },
];

function discoverAgentSkillDirs() {
  const found = [];
  for (const { agent, paths } of AGENT_SKILL_PATHS) {
    for (const p of paths) {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        found.push({ agent, path: p });
        break;
      }
    }
  }
  return found;
}

function findExistingSkillFiles(dirs) {
  const existing = [];
  for (const d of dirs) {
    const candidate = path.join(d.path, SKILL_FILE_NAME);
    if (fs.existsSync(candidate)) {
      existing.push({ ...d, file: candidate });
    }
  }
  return existing;
}

function isPkInPath() {
  try {
    execSync("which pk 2>/dev/null", { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

function generateSkillContent() {
  return `# Port Killer (pk) — AI Agent Skill

Use the \`pk\` CLI to discover and kill processes listening on network ports. Essential for freeing blocked ports during development.

## Quick Reference

| Command | Description |
|---------|-------------|
| \`pk\` | Interactive TUI with checkboxes (multi-select) |
| \`pk 3000\` | Kill port 3000 (TCP+UDP) |
| \`pk 3000 8080\` | Kill multiple ports |
| \`pk --pid 1234\` | Kill process by PID |
| \`pk 3000 --yes\` | Kill without confirmation (headless/CI) |
| \`pk --list\` | List ports as table (no kill) |
| \`pk --json\` | List ports as JSON (machine-readable) |
| \`pk --json --list\` | List JSON explicitly (no kill) |
| \`pk -a --json\` | Include system ports (< 1000) in JSON |

## Flags

| Flag | Short | Description |
|------|-------|-------------|
| \`--all\` | \`-a\` | Show system ports (< 1000) |
| \`--list\` | \`-l\` | List only, no kill |
| \`--json\` | — | Machine-readable JSON output |
| \`--yes\` | \`-y\` | Skip confirmation prompt (headless/CI) |
| \`--pid <n>\` | — | Kill by PID |
| \`--help\` | \`-h\` | Show help |

## JSON Schema

\`pk --json\` returns an array:

\`\`\`json
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
\`\`\`

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (port not found, kill failed) |

## Integration Examples

### Bash

\`\`\`bash
# Discover what is listening
pk --json

# Parse JSON and kill port 3000
ports=$(pk --json)
port_3000=$(echo "$ports" | jq '.[] | select(.port==3000)')
if [ -n "$port_3000" ]; then
  pk 3000 --yes
fi
\`\`\`

### Node.js / Bun

\`\`\`js
import { execSync } from "child_process";

const out = execSync("pk --json", { encoding: "utf8" });
const ports = JSON.parse(out);

const target = ports.find(p => p.port === 3000);
if (target) {
  execSync("pk 3000 --yes", { stdio: "inherit" });
}
\`\`\`

### Python

\`\`\`python
import subprocess, json

out = subprocess.check_output(["pk", "--json"])
ports = json.loads(out)

for p in ports:
    if p["port"] == 3000:
        subprocess.run(["pk", "3000", "--yes"])
\`\`\`

## Agent Workflow

1. **Discover**: Run \`pk --json\` to get structured port data
2. **Identify**: Find the port blocking your task (match by port number, process name, or project)
3. **Kill**: Run \`pk <port> --yes\` to free the port without interactive prompt
4. **Verify**: Run \`pk --json --list\` to confirm the port is free
`;
}

async function agentInstall(customPath = null, dryRun = false, skipConfirm = false) {
  const pkOk = isPkInPath();
  if (!pkOk && !dryRun) {
    console.log(
      chalk.yellow("\n ⚠ pk is not in PATH. The agent may not be able to use it.\n")
    );
  }

  let targetDirs = [];

  if (customPath) {
    const resolved = path.resolve(customPath);
    if (!fs.existsSync(resolved)) {
      console.log(chalk.yellow(`\n Path does not exist: ${resolved}`));
      const create = await confirm({ message: "Create it?", default: false });
      if (create) {
        fs.mkdirSync(resolved, { recursive: true });
        targetDirs.push({ agent: "custom", path: resolved });
      } else {
        console.log(chalk.dim(" Skipped."));
        return;
      }
    } else {
      targetDirs.push({ agent: "custom", path: resolved });
    }
  } else {
    const discovered = discoverAgentSkillDirs();

    if (discovered.length === 0) {
      console.log(chalk.yellow("\n No agent skill directories found.\n"));
      const manualPath = await input({
        message: "Enter the path where the skill should be installed:",
      });
      if (manualPath.trim()) {
        const resolved = path.resolve(manualPath.trim());
        if (!fs.existsSync(resolved)) {
          console.log(chalk.yellow(` Path does not exist: ${resolved}`));
          const create = await confirm({ message: "Create it?", default: false });
          if (create) {
            fs.mkdirSync(resolved, { recursive: true });
            targetDirs.push({ agent: "manual", path: resolved });
          }
        } else {
          targetDirs.push({ agent: "manual", path: resolved });
        }
      }
      if (targetDirs.length === 0) {
        console.log(chalk.dim(" No target selected. Exiting."));
        return;
      }
    } else if (discovered.length === 1) {
      console.log(
        chalk.cyan(`\n Found 1 agent skill directory:\n`) +
          chalk.white(`   ${discovered[0].agent}: ${chalk.gray(discovered[0].path)}\n`)
      );
      if (skipConfirm) {
        targetDirs.push(discovered[0]);
      } else {
        const ok = await confirm({
          message: `Install port-killer skill in ${discovered[0].agent}?`,
          default: true,
        });
        if (ok) targetDirs.push(discovered[0]);
      }
    } else {
      console.log(chalk.cyan(`\n Found ${discovered.length} agent skill directories:\n`));
      for (const d of discovered) {
        console.log(`   ${chalk.white(d.agent)}: ${chalk.gray(d.path)}`);
      }
      console.log("");

      const selected = await checkbox({
        message: "Select where to install port-killer skill (space = toggle, enter = confirm)",
        choices: discovered.map((d) => ({
          name: `${d.agent}  ${chalk.dim(d.path)}`,
          value: d,
          short: d.agent,
        })),
        pageSize: 15,
        loop: false,
      });

      targetDirs = selected;
    }
  }

  if (targetDirs.length === 0) {
    console.log(chalk.dim("\n No targets selected. Exiting.\n"));
    return;
  }

  const content = generateSkillContent();
  const existing = findExistingSkillFiles(targetDirs);
  const existingMap = new Map(existing.map((e) => [e.path, e]));
  const installed = [];
  const skipped = [];

  for (const dir of targetDirs) {
    const filePath = path.join(dir.path, SKILL_FILE_NAME);
    const existingEntry = existingMap.get(dir.path);

    if (existingEntry) {
      if (skipConfirm) {
        console.log(chalk.yellow(`   Overwriting existing: ${filePath}`));
      } else {
        const overwrite = await confirm({
          message: `Skill already exists at ${filePath}. Overwrite?`,
          default: false,
        });
        if (!overwrite) {
          console.log(chalk.dim(`   Skipped: ${filePath}`));
          skipped.push(filePath);
          continue;
        }
      }
    }

    if (dryRun) {
      console.log(chalk.cyan(`   [DRY RUN] Would write: ${filePath}`));
      installed.push(filePath);
      continue;
    }

    try {
      fs.writeFileSync(filePath, content, "utf8");
      console.log(chalk.green(`   ✔ Installed: ${filePath}`));
      installed.push(filePath);
    } catch (err) {
      console.log(chalk.red(`   ✘ Failed: ${filePath} — ${err.message}`));
      skipped.push(filePath);
    }
  }

  console.log(
    chalk.bold(`\n 📦 ${installed.length} skill(s) ${dryRun ? "would be " : ""}installed`)
  );
  if (skipped.length > 0) {
    console.log(chalk.yellow(`   ${skipped.length} skipped`));
  }
  if (!pkOk) {
    console.log(
      chalk.yellow("   ⚠ pk not in PATH — agents may not be able to invoke it")
    );
  }
  console.log("");
}

async function agentUninstall(customPath = null, dryRun = false, skipConfirm = false) {
  const withExisting = [];

  if (customPath) {
    const resolved = path.resolve(customPath);
    const candidate = path.join(resolved, SKILL_FILE_NAME);
    if (fs.existsSync(candidate)) {
      withExisting.push({ agent: "custom", path: resolved, file: candidate });
    } else {
      console.log(chalk.yellow(`\n No skill file found at: ${candidate}\n`));
      return;
    }
  } else {
    const discovered = discoverAgentSkillDirs();
    const found = findExistingSkillFiles(discovered);
    withExisting.push(...found);

    if (withExisting.length === 0) {
      const manualDirs = AGENT_SKILL_PATHS.flatMap(({ paths }) => paths);
      for (const p of manualDirs) {
        const candidate = path.join(p, SKILL_FILE_NAME);
        if (fs.existsSync(candidate)) {
          withExisting.push({ agent: "manual", path: p, file: candidate });
        }
      }
    }
  }

  if (withExisting.length === 0) {
    console.log(chalk.yellow("\n No port-killer skill files found.\n"));

    const manualPath = await input({
      message: "Enter the path where the skill was installed (or press Enter to skip):",
    });
    if (manualPath.trim()) {
      const resolved = path.resolve(manualPath.trim());
      const candidate = path.join(resolved, SKILL_FILE_NAME);
      if (fs.existsSync(candidate)) {
        withExisting.push({ agent: "manual", path: resolved, file: candidate });
      } else {
        console.log(chalk.red(` Not found: ${candidate}`));
        return;
      }
    } else {
      return;
    }
  }

  let toRemove = [];

  if (withExisting.length === 1) {
    console.log(
      chalk.cyan(`\n Found 1 skill file:\n`) +
        chalk.white(`   ${withExisting[0].agent}: ${chalk.gray(withExisting[0].file)}\n`)
    );
    if (skipConfirm) {
      toRemove = withExisting;
    } else {
      const ok = await confirm({
        message: `Uninstall port-killer skill from ${withExisting[0].agent}?`,
        default: false,
      });
      if (ok) toRemove = withExisting;
    }
  } else {
    console.log(chalk.cyan(`\n Found ${withExisting.length} skill files:\n`));
    for (const e of withExisting) {
      console.log(` ${chalk.white(e.agent)}: ${chalk.gray(e.file)}`);
    }
    console.log("");

    const selected = await checkbox({
      message: "Select skill files to remove (space = toggle, enter = confirm)",
      choices: withExisting.map((e) => ({
        name: `${e.agent} ${chalk.dim(e.file)}`,
        value: e,
        short: e.agent,
      })),
      pageSize: 15,
      loop: false,
    });

    toRemove = selected;
  }

  if (toRemove.length === 0) {
    console.log(chalk.dim("\n Nothing selected. Exiting.\n"));
    return;
  }

  const removed = [];
  const failed = [];

  for (const entry of toRemove) {
    if (dryRun) {
      console.log(chalk.cyan(` [DRY RUN] Would remove: ${entry.file}`));
      removed.push(entry.file);
      continue;
    }

    try {
      fs.unlinkSync(entry.file);
      console.log(chalk.green(` ✔ Removed: ${entry.file}`));
      removed.push(entry.file);
    } catch (err) {
      console.log(chalk.red(` ✘ Failed: ${entry.file} — ${err.message}`));
      failed.push(entry.file);
    }
  }

  console.log(
    chalk.bold(`\n 🗑 ${removed.length} skill(s) ${dryRun ? "would be " : ""}removed`)
  );
  if (failed.length > 0) {
    console.log(chalk.red(` ${failed.length} failed`));
  }
  console.log("");
}

export { agentInstall, agentUninstall, generateSkillContent, discoverAgentSkillDirs };
