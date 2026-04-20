import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "website");

const outputs = [
	"beepbox_editor.js",
	"beepbox_editor.min.js",
	"beepbox_synth.js",
	"beepbox_synth.min.js",
	"beepbox_offline.html",
];

let removed = 0;
for (const file of outputs) {
	const filePath = path.join(outDir, file);
	try {
		fs.unlinkSync(filePath);
		removed++;
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
		throw error;
	}
}

console.log(`Cleaned ${removed} file(s) from ${outDir}`);
