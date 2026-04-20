import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");

function spawnLogged(cmd, args, opts = {}) {
	const child = spawn(cmd, args, {
		cwd: projectRoot,
		stdio: "inherit",
		shell: false,
		...opts,
	});
	child.on("exit", (code) => {
		if (code && code !== 0) process.exitCode = code;
	});
	return child;
}

function npmExec(args) {
	return spawnLogged("npm", ["exec", "--", ...args]);
}

function watchAndMinify({ input, output }) {
	let timer = null;
	let running = false;
	let rerun = false;

	function run() {
		if (running) {
			rerun = true;
			return;
		}
		running = true;
		rerun = false;

		const args = [
			"--compress",
			"--mangle",
			"--mangle-props",
			"regex=/^_.+/",
			input,
			"-o",
			output,
		];

		const child = spawn("npm", ["exec", "--", "uglifyjs", ...args], { stdio: "inherit" });
		child.on("exit", () => {
			running = false;
			if (rerun) run();
		});
	}

	function schedule() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(run, 50);
	}

	if (fs.existsSync(input)) schedule();
	fs.watch(input, { persistent: true }, schedule);
}

// The Codex sandbox may block binding a local port. Start a server separately if needed.
// For example: `cd website && python3 -m http.server 8000`

// Run TS compilers in watch mode (emit JS even with type errors).
npmExec([
	"tsc",
	"--watch",
	"--target",
	"ES5",
	"--ignoreDeprecations",
	"6.0",
	"--strictNullChecks",
	"--noImplicitAny",
	"--noImplicitReturns",
	"--noFallthroughCasesInSwitch",
	"--removeComments",
	path.join("editor", "SongEditor.ts"),
	"--outFile",
	path.join("website", "beepbox_editor.js"),
]);

npmExec([
	"tsc",
	"--watch",
	"--target",
	"ES5",
	"--ignoreDeprecations",
	"6.0",
	"--strictNullChecks",
	"--noImplicitAny",
	"--noImplicitReturns",
	"--noFallthroughCasesInSwitch",
	"--removeComments",
	path.join("synth", "synth.ts"),
	"--outFile",
	path.join("website", "beepbox_synth.js"),
]);

watchAndMinify({
	input: path.join(projectRoot, "website", "beepbox_editor.js"),
	output: path.join(projectRoot, "website", "beepbox_editor.min.js"),
});

watchAndMinify({
	input: path.join(projectRoot, "website", "beepbox_synth.js"),
	output: path.join(projectRoot, "website", "beepbox_synth.min.js"),
});

console.log("Dev mode (watchers only):");
console.log("- Run `npm install` once to get local dev tools");
console.log("- Edit files in editor/ and synth/");
console.log("- Serve website/ separately and refresh the browser");
