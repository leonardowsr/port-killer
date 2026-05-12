#!/usr/bin/env node

import { execSync } from "node:child_process";
import { checkbox, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { agentInstall, agentUninstall } from "./installator.mjs";

let rawModeWasActive = false;

function setupEscHandler() {
	if (process.stdin.isTTY) {
		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		rawModeWasActive = true;
		process.stdin.on("keypress", (str, key) => {
			if (key.name === "escape") {
				process.exit(0);
			}
		});
	}
}

function cleanup() {
	if (rawModeWasActive && process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
	cleanup();
	process.exit(0);
});
process.on("SIGTERM", () => {
	cleanup();
	process.exit(0);
});

function isValidPid(pid) {
	return pid && /^\d+$/.test(pid) && Number(pid) > 0 && Number(pid) < 100000000;
}

function isValidPort(port) {
	const p = Number(port);
	return !isNaN(p) && p > 0 && p <= 65535;
}

function getProcessDetails(pid) {
	if (!pid) return {};
	try {
		const cmd = execSync(
			`ps -p ${pid} -o etime=,comm=,args= --no-headers 2>/dev/null`,
			{ encoding: "utf8" },
		).trim();
		if (!cmd) return {};
		const parts = cmd.split(/\s+/);
		const etime = parts[0];
		const comm = parts[1];
		const fullCmd = parts.slice(2).join(" ");
		return { etime, comm, fullCmd };
	} catch {
		return {};
	}
}

function getProcessCwd(pid) {
	if (!pid) return null;
	try {
		const cwd = execSync(`readlink /proc/${pid}/cwd 2>/dev/null`, {
			encoding: "utf8",
		}).trim();
		return cwd || null;
	} catch {
		return null;
	}
}

function shortenPath(p, maxLen = 40) {
	if (!p) return "";
	const home = os.homedir();
	let s = p.startsWith(home) ? "~" + p.slice(home.length) : p;
	if (s.length <= maxLen) return s;
	return "..." + s.slice(-(maxLen - 3));
}

function extractProjectName(fullCmd, cwd) {
	if (cwd) {
		const base = path.basename(cwd);
		if (base && base !== "/" && base !== "home") return base;
	}
	const match = fullCmd?.match(
		/(?:\/|^)([\w.-]+)(?:\/(?:src|server|app|index|main))\.\w$/,
	);
	if (match) return match[1];
	return null;
}

function classifyPort(port, processName) {
	const p = Number(port);
	if (p <= 1023) return { type: "system", color: chalk.red, icon: "🔒" };
	if (
		processName === "node" ||
		processName === "nodejs" ||
		processName === "deno" ||
		processName === "bun"
	)
		return { type: "node", color: chalk.green, icon: "📦" };
	if (processName === "python" || processName === "python3")
		return { type: "python", color: chalk.yellow, icon: "🐍" };
	if (processName === "ruby" || processName === "java" || processName === "go")
		return { type: "lang", color: chalk.blue, icon: "⚡" };
	if (processName === "docker" || processName === "containerd")
		return { type: "docker", color: chalk.cyan, icon: "🐳" };
	if (
		processName === "postgres" ||
		processName === "mysqld" ||
		processName === "redis"
	)
		return { type: "db", color: chalk.magenta, icon: "🗄️" };
	return { type: "app", color: chalk.white, icon: "🔌" };
}

function parseSsOutput(output, proto) {
	const lines = output.trim().split("\n").slice(1);
	return lines
		.map((line) => {
			const parts = line.trim().split(/\s+/);
			if (parts.length < 4) return null;

			const localAddr = parts[3];
			const processInfo = parts.slice(4).join(" ");

			if (!localAddr) return null;

			const lastColon = localAddr.lastIndexOf(":");
			const host = localAddr.slice(0, lastColon) || "*";
			const port = localAddr.slice(lastColon + 1);

			if (!port || isNaN(Number(port))) return null;

			let processName = "";
			let pid = "";
			const pidMatch = processInfo.match(/pid=(\d+)/);
			const nameMatch = processInfo.match(/"([^"]*)"/);

			if (pidMatch) pid = pidMatch[1];
			if (nameMatch) processName = nameMatch[1];

			if (!isValidPort(Number(port)) || !isValidPid(pid)) return null;

			return { host, port, pid, processName, proto };
		})
		.filter(Boolean);
}

function getListeningPorts() {
	const results = [];
	try {
		const tcp = execSync("ss -tlnp 2>/dev/null", { encoding: "utf8" });
		results.push(...parseSsOutput(tcp, "TCP"));
	} catch {}
	try {
		const udp = execSync("ss -ulnp 2>/dev/null", { encoding: "utf8" });
		results.push(...parseSsOutput(udp, "UDP"));
	} catch {}
	return results;
}

function findPorts(portNum, ports) {
	return ports.filter(
		(p) => Number(p.port) === Number(portNum),
	);
}

function killByPid(pid) {
	if (!isValidPid(pid)) return false;
	try {
		process.kill(Number(pid), "SIGKILL");
		return true;
	} catch {
		return false;
	}
}

function killByPort(port, proto) {
	if (!isValidPort(port)) return false;
	if (!["tcp", "udp"].includes(proto.toLowerCase())) return false;
	try {
		execSync(`fuser -k ${port}/${proto.toLowerCase()} 2>/dev/null`, {
			encoding: "utf8",
		});
		return true;
	} catch {
		return false;
	}
}

function killEntry(p) {
	const ok = p.pid ? killByPid(p.pid) : false;
	if (ok) return { method: "pid" };
	const fb = killByPort(p.port, p.proto);
	if (fb) return { method: "fuser" };
	return null;
}

function formatUptime(etime) {
	if (!etime) return "";
	return etime
		.replace(/^ /, "")
		.replace(/(\d+)-/, "$1d ")
		.replace(/:/, "h ")
		.replace(/:/, "m ");
}

function parseArgs() {
	const args = process.argv.slice(2);
  const flags = { showAll: false, list: false, json: false, yes: false, pid: null, ports: [], agentInstall: false, agentUninstall: false, dryRun: false, agentPath: null };

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--all" || arg === "-a") flags.showAll = true;
		else if (arg === "--list" || arg === "-l") flags.list = true;
		else if (arg === "--json") flags.json = true;
		else if (arg === "--yes" || arg === "-y") flags.yes = true;
		else if (arg === "--pid") {
			i++;
			flags.pid = args[i] || null;
} else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--agent-install") {
      flags.agentInstall = true;
    } else if (arg === "--agent-uninstall") {
      flags.agentUninstall = true;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--path") {
      i++;
      flags.agentPath = args[i] || null;
    } else if (!arg.startsWith("-") && isValidPort(arg)) {
			flags.ports.push(Number(arg));
		}
	}

	return flags;
}

function printHelp() {
  console.log(`
 🔌 Port Killer CLI — Agent-Friendly

 USAGE:
 pk                                 Interactive mode (checkbox)
 pk 3000                            Kill port 3000 (TCP+UDP)
 pk 3000 3001 8080                  Kill multiple ports
 pk --list                          List ports and exit
 pk --json                          List ports as JSON
 pk --list --json                   List ports as JSON, no kill
 pk --pid 1234                      Kill process by PID
 pk -y 3000                         Kill without confirmation (headless)
 pk --agent-install                 Install port-killer skill in agents
 pk --agent-install --path <dir>    Install in custom directory
 pk --agent-install --dry-run       Simulate installation without writing
 pk --agent-uninstall               Remove port-killer skill from agents
 pk --agent-uninstall --dry-run     Simulate removal without deleting

 FLAGS:
 -a, --all                          Show system ports (< 1000)
 -l, --list                         List only, no kill
 --json                             JSON output (machine-readable)
 -y, --yes                          Skip confirmation
 --pid <n>                          Kill by PID
 --agent-install                    Install skill in AI agents
 --agent-uninstall                  Remove skill from AI agents
 --dry-run                          Simulate without writing/deleting
 --path <dir>                       Custom skill path
 -h, --help                         Show help

 AGENTS:
 pk --json                          → JSON of listening processes
 pk --json --list                   → JSON without killing
 pk 3000 --yes                      → Kill 3000 without prompt
 pk --pid 1234 --yes                → Kill PID 1234 without prompt
 pk --agent-install                 → Install port-killer skill
  `);
}

function enrichPorts(ports) {
	const unique = [];
	const seen = new Set();
	for (const p of ports) {
		const key = `${p.proto}:${p.host}:${p.port}`;
		if (!seen.has(key)) {
			seen.add(key);
			unique.push(p);
		}
	}
	unique.sort((a, b) => Number(a.port) - Number(b.port));

	return unique.map((p) => {
		const details = getProcessDetails(p.pid);
		const cwd = getProcessCwd(p.pid);
		const project = extractProjectName(details.fullCmd, cwd);
		const cls = classifyPort(p.port, p.processName);
		return { ...p, ...details, cwd, project, cls };
	});
}

function formatJson(enriched) {
	return JSON.stringify(
		enriched.map((p) => ({
			port: Number(p.port),
			proto: p.proto,
			pid: Number(p.pid),
			process: p.processName || null,
			project: p.project || null,
			cwd: p.cwd || null,
			uptime: p.etime || null,
			command: p.fullCmd || null,
		})),
		null,
		2,
	);
}

function printTableHeader() {
	const header = [
		chalk.bold.gray(" PORTA "),
		chalk.bold.gray("PROTO"),
		chalk.bold.gray("PROCESS       "),
		chalk.bold.gray("PROJECT/DIR       "),
		chalk.bold.gray("UPTIME"),
	].join(" ");
	console.log(header);
	console.log(chalk.dim("─".repeat(70)));
}

function printPortRow(p) {
	const portLabel = p.cls.color(p.port.padEnd(6));
	const protoLabel = chalk.dim(p.proto.padEnd(4));
	const nameLabel = p.processName
		? p.cls.color(p.processName.padEnd(14))
		: chalk.dim("—".padEnd(14));
	const projectLabel = p.project
		? chalk.bold.white(p.project.padEnd(18))
		: p.cwd
			? chalk.gray(shortenPath(p.cwd, 18).padEnd(18))
			: chalk.dim("—".padEnd(18));
	const uptimeStr = p.etime ? chalk.dim(formatUptime(p.etime).padEnd(12)) : "";
	console.log(`${portLabel} ${protoLabel} ${nameLabel} ${projectLabel} ${uptimeStr}`);
}

function getMatchingPorts(portNum, enriched) {
	return enriched.filter((p) => Number(p.port) === portNum);
}

async function interactiveMode() {
	setupEscHandler();
	const showAll = process.argv.includes("--all") || process.argv.includes("-a");

	console.log(
		chalk.bold.cyan("\n  ┌─────────────────────────────────┐\n") +
			chalk.bold.cyan("  │   🔌  Port Killer CLI            │\n") +
			chalk.bold.cyan("  │   Kill ports with style          │\n") +
			chalk.bold.cyan("  └─────────────────────────────────┘\n") +
			chalk.dim("  Press ESC to exit anytime\n"),
	);

	let ports = getListeningPorts();

	if (!showAll) {
		const hidden = ports.filter((p) => Number(p.port) < 1000).length;
		ports = ports.filter((p) => Number(p.port) >= 1000);
		if (hidden > 0) {
		console.log(
			chalk.dim(
				`  ${hidden} system port(s) hidden — use ${chalk.white("pk --all")} to see all\n`,
			),
		);
		}
	}

	if (ports.length === 0) {
		console.log(chalk.yellow("  No open ports found."));
		process.exit(0);
	}

	const enriched = enrichPorts(ports);

	const tcpCount = enriched.filter((p) => p.proto === "TCP").length;
	const udpCount = enriched.filter((p) => p.proto === "UDP").length;
	console.log(
		chalk.dim(`  ${tcpCount} TCP | ${udpCount} UDP | ${enriched.length} total\n`),
	);

	const choices = enriched.map((p) => {
		const portLabel = p.cls.color(p.port.padEnd(6));
		const protoLabel = chalk.dim(p.proto.padEnd(4));
		const nameLabel = p.processName
			? p.cls.color(p.processName.padEnd(14))
			: chalk.dim("—".padEnd(14));
		const projectLabel = p.project
			? chalk.bold.white(p.project.padEnd(18))
			: p.cwd
				? chalk.gray(shortenPath(p.cwd, 18).padEnd(18))
				: chalk.dim("—".padEnd(18));
		const uptimeStr = p.etime ? chalk.dim(formatUptime(p.etime).padEnd(12)) : "";

		const label = `${portLabel} ${protoLabel} ${nameLabel} ${projectLabel} ${uptimeStr}`;

		let desc = "";
		if (p.fullCmd) {
			desc = chalk.dim(shortenPath(p.fullCmd, 70));
		} else if (
			p.host &&
			p.host !== "0.0.0.0" &&
			p.host !== "*" &&
			p.host !== "[::]"
		) {
			desc = chalk.dim(`bind: ${p.host}`);
		}

		return {
			name: desc ? `${label}\n    ${desc}` : label,
			value: p,
			short: `${p.proto}/${p.port}`,
		};
	});

	printTableHeader();

	const selected = await checkbox({
		message:
			"Select ports to close (↑↓ navigate • space select • enter confirm • esc exit)",
		choices,
		pageSize: 15,
		loop: false,
	});

	if (selected.length === 0) {
		console.log(chalk.yellow("\n  No ports selected. Bye!\n"));
		process.exit(0);
	}

	console.log(chalk.bold(`\n  ⚠️  Going to close ${selected.length} port(s):\n`));
	for (const p of selected) {
		const proj = p.project ? chalk.white(` → ${p.project}`) : "";
		console.log(
			`   ${chalk.red("✕")} ${chalk.bold(p.cls.color(p.port))} ${chalk.gray(p.proto)} ${chalk.gray(p.processName || "?")}${proj}`,
		);
	}

	const sure = await confirm({ message: "Confirm?", default: false });

	if (!sure) {
		console.log(chalk.yellow("\n  Cancelled. No ports closed.\n"));
		process.exit(0);
	}

	await executeKill(selected);
}

async function executeKill(targets) {
	console.log("");
	let killed = 0;
	let failed = 0;

	for (const p of targets) {
		const result = killEntry(p);
		if (result) {
			console.log(`  ${chalk.green("✔")} ${chalk.bold(p.port)} (${p.proto}) closed`);
			killed++;
		} else {
			console.log(`  ${chalk.red("✘")} Failed to close ${chalk.bold(p.port)} (${p.proto})`);
			failed++;
		}
	}

	console.log(
		chalk.bold(`\n  ✅ ${killed} closed`) +
			(failed ? chalk.red(` | ❌ ${failed} failed`) : "") +
			"\n",
	);

	return { killed, failed };
}

function printKillSummary(results) {
	const { killed, failed } = results;
	console.log(
		chalk.bold(`\n  ✅ ${killed} closed`) +
			(failed ? chalk.red(` | ❌ ${failed} failed`) : "") +
			"\n",
	);
}

async function main() {
  const flags = parseArgs();

  if (flags.agentInstall) {
    await agentInstall(flags.agentPath, flags.dryRun, flags.yes);
    return;
  }

  if (flags.agentUninstall) {
    await agentUninstall(flags.agentPath, flags.dryRun, flags.yes);
    return;
  }

  const hasNonInteractiveArgs =
    flags.ports.length > 0 || flags.pid || flags.list || flags.json;

	if (!hasNonInteractiveArgs) {
		await interactiveMode();
		return;
	}

	let ports = getListeningPorts();

	if (!flags.showAll) {
		ports = ports.filter((p) => Number(p.port) >= 1000);
	}

	if (ports.length === 0) {
		if (flags.json) {
			console.log(JSON.stringify([]));
		} else {
			console.log(chalk.yellow("No open ports found."));
		}
		process.exit(0);
	}

	const enriched = enrichPorts(ports);

	if (flags.list || (flags.json && flags.ports.length === 0 && !flags.pid)) {
		if (flags.json) {
			console.log(formatJson(enriched));
		} else {
			const tcpCount = enriched.filter((p) => p.proto === "TCP").length;
			const udpCount = enriched.filter((p) => p.proto === "UDP").length;
			console.log(chalk.dim(`  ${tcpCount} TCP | ${udpCount} UDP | ${enriched.length} total\n`));
			printTableHeader();
			for (const p of enriched) {
				printPortRow(p);
			}
		}
		process.exit(0);
	}

	if (flags.pid) {
		const pid = Number(flags.pid);
		if (!isValidPid(pid)) {
			console.error(chalk.red(`Invalid PID: ${flags.pid}`));
			process.exit(1);
		}

		const match = enriched.find((p) => Number(p.pid) === pid);
		if (!match) {
			console.error(chalk.red(`No process listening on port with PID ${pid}`));
			process.exit(1);
		}

		if (!flags.yes) {
			console.log(chalk.bold(`\n  ⚠️  Going to kill PID ${pid} (${match.processName}, port ${match.port})\n`));
			const sure = await confirm({ message: "Confirm?", default: false });
			if (!sure) {
				console.log(chalk.yellow("\n  Cancelled.\n"));
				process.exit(0);
			}
		}

		const ok = killByPid(pid);
		if (ok) {
			console.log(chalk.green(`\n  ✔ PID ${pid} killed (port ${match.port})\n`));
		} else {
			console.log(chalk.red(`\n  ✘ Failed to kill PID ${pid}\n`));
		}
		process.exit(ok ? 0 : 1);
	}

	if (flags.ports.length > 0) {
		const targets = [];
		const notFound = [];

		for (const portNum of flags.ports) {
			const matches = getMatchingPorts(portNum, enriched);
			if (matches.length === 0) {
				notFound.push(portNum);
			} else {
				targets.push(...matches);
			}
		}

		if (notFound.length > 0 && targets.length === 0) {
			console.error(chalk.red(`No open ports: ${notFound.join(", ")}`));
			process.exit(1);
		}

		if (notFound.length > 0) {
			console.warn(chalk.yellow(`Ports not found: ${notFound.join(", ")}`));
		}

		if (!flags.yes) {
			console.log(chalk.bold(`\n  ⚠️  Going to close ${targets.length} port(s):\n`));
			for (const p of targets) {
				printPortRow(p);
			}
			const sure = await confirm({ message: "Confirm?", default: false });
			if (!sure) {
				console.log(chalk.yellow("\n  Cancelled.\n"));
				process.exit(0);
			}
		}

		const deduped = [];
		const seenPids = new Set();
		for (const p of targets) {
			const key = `${p.port}:${p.proto}:${p.pid}`;
			if (!seenPids.has(key)) {
				seenPids.add(key);
				deduped.push(p);
			}
		}

		const results = await executeKill(deduped);
		process.exit(results.failed > 0 ? 1 : 0);
	}
}

main().catch((err) => {
	if (err.name === "ExitPromptError") {
		console.log(chalk.yellow("\n\n  Cancelled.\n"));
		process.exit(0);
	}
	console.error(chalk.red(err.message));
	process.exit(1);
});
