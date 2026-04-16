#!/usr/bin/env node

import { execSync } from "node:child_process";
import { checkbox, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

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
			{
				encoding: "utf8",
			},
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

function formatUptime(etime) {
	if (!etime) return "";
	return etime
		.replace(/^ /, "")
		.replace(/(\d+)-/, "$1d ")
		.replace(/:/, "h ")
		.replace(/:/, "m ");
}

async function main() {
	setupEscHandler();
	const showAll = process.argv.includes("--all") || process.argv.includes("-a");

	console.log(
		chalk.bold.cyan("\n  ┌─────────────────────────────────┐\n") +
			chalk.bold.cyan("  │   🔌  Port Killer CLI            │\n") +
			chalk.bold.cyan("  │   Feche portas com estilo        │\n") +
			chalk.bold.cyan("  └─────────────────────────────────┘\n") +
			chalk.dim("  Pressione ESC para sair a qualquer momento\n"),
	);

	let ports = getListeningPorts();

	if (!showAll) {
		const hidden = ports.filter((p) => Number(p.port) < 1000).length;
		ports = ports.filter((p) => Number(p.port) >= 1000);
		if (hidden > 0) {
			console.log(
				chalk.dim(
					`  ${hidden} porta(s) de sistema oculta(s) — use ${chalk.white("pk --all")} pra ver tudo\n`,
				),
			);
		}
	}

	if (ports.length === 0) {
		console.log(chalk.yellow("  Nenhuma porta aberta encontrada."));
		process.exit(0);
	}

	const uniquePorts = [];
	const seen = new Set();
	for (const p of ports) {
		const key = `${p.proto}:${p.host}:${p.port}`;
		if (!seen.has(key)) {
			seen.add(key);
			uniquePorts.push(p);
		}
	}

	uniquePorts.sort((a, b) => Number(a.port) - Number(b.port));

	const enriched = uniquePorts.map((p) => {
		const details = getProcessDetails(p.pid);
		const cwd = getProcessCwd(p.pid);
		const project = extractProjectName(details.fullCmd, cwd);
		const cls = classifyPort(p.port, p.processName);
		return { ...p, ...details, cwd, project, cls };
	});

	const tcpCount = enriched.filter((p) => p.proto === "TCP").length;
	const udpCount = enriched.filter((p) => p.proto === "UDP").length;
	console.log(
		chalk.dim(
			`  ${tcpCount} TCP | ${udpCount} UDP | ${enriched.length} total\n`,
		),
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
		const uptime = p.etime ? chalk.dim(formatUptime(p.etime).padEnd(12)) : "";

		const label = `${portLabel} ${protoLabel} ${nameLabel} ${projectLabel} ${uptime}`;

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

	const header = [
		chalk.bold.gray(" PORTA "),
		chalk.bold.gray("PROTO"),
		chalk.bold.gray("PROCESSO      "),
		chalk.bold.gray("PROJETO/DIR       "),
		chalk.bold.gray("TEMPO"),
	].join(" ");
	console.log(header);
	console.log(chalk.dim("─".repeat(70)));

	const selected = await checkbox({
		message:
			"Selecione as portas pra fechar (↑↓ navega • space seleciona • enter confirma • esc sai)",
		choices,
		pageSize: 15,
		loop: false,
	});

	if (selected.length === 0) {
		console.log(chalk.yellow("\n  Nenhuma porta selecionada. Flw!\n"));
		process.exit(0);
	}

	console.log(chalk.bold(`\n  ⚠️  Vai fechar ${selected.length} porta(s):\n`));
	for (const p of selected) {
		const proj = p.project ? chalk.white(` → ${p.project}`) : "";
		console.log(
			`   ${chalk.red("✕")} ${chalk.bold(p.cls.color(p.port))} ${chalk.gray(p.proto)} ${chalk.gray(p.processName || "?")}${proj}`,
		);
	}

	const sure = await confirm({ message: "Confirmar?", default: false });

	if (!sure) {
		console.log(chalk.yellow("\n  Cancelado. Nenhuma porta foi fechada.\n"));
		process.exit(0);
	}

	console.log("");
	let killed = 0;
	let failed = 0;

	for (const p of selected) {
		const ok = p.pid ? killByPid(p.pid) : killByPort(p.port, p.proto);
		if (ok) {
			console.log(
				`  ${chalk.green("✔")} ${chalk.bold(p.port)} (${p.proto}) fechada`,
			);
			killed++;
		} else {
			const fb = killByPort(p.port, p.proto);
			if (fb) {
				console.log(
					`  ${chalk.green("✔")} ${chalk.bold(p.port)} (${p.proto}) fechada (via fuser)`,
				);
				killed++;
			} else {
				console.log(
					`  ${chalk.red("✘")} Falha ao fechar ${chalk.bold(p.port)} (${p.proto})`,
				);
				failed++;
			}
		}
	}

	console.log(
		chalk.bold(`\n  ✅ ${killed} fechada(s)`) +
			(failed ? chalk.red(` | ❌ ${failed} falha(s)`) : "") +
			"\n",
	);
}

main().catch((err) => {
	if (err.name === "ExitPromptError") {
		console.log(chalk.yellow("\n\n  Cancelado.\n"));
		process.exit(0);
	}
	console.error(chalk.red(err.message));
	process.exit(1);
});
