import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..", "website");
const port = Number.parseInt(process.env.PORT || "8000", 10);

const contentTypes = new Map([
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".css", "text/css; charset=utf-8"],
	[".png", "image/png"],
	[".ico", "image/x-icon"],
	[".txt", "text/plain; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
]);

function send(res, statusCode, body, headers = {}) {
	res.writeHead(statusCode, { "cache-control": "no-store", ...headers });
	res.end(body);
}

function safeJoin(base, requestPath) {
	const decoded = decodeURIComponent(requestPath);
	const withoutQuery = decoded.split("?")[0].split("#")[0];
	const normalized = path.posix.normalize(withoutQuery).replace(/^(\.\.(\/|\\|$))+/, "");
	return path.join(base, normalized);
}

const server = http.createServer((req, res) => {
	if (!req.url) return send(res, 400, "Bad Request");

	let filePath = safeJoin(root, req.url);
	if (req.url === "/" || req.url === "") filePath = path.join(root, "index.html");

	let stat;
	try {
		stat = fs.statSync(filePath);
	} catch {
		return send(res, 404, "Not Found");
	}

	if (stat.isDirectory()) filePath = path.join(filePath, "index.html");

	try {
		const ext = path.extname(filePath).toLowerCase();
		const contentType = contentTypes.get(ext) || "application/octet-stream";
		const data = fs.readFileSync(filePath);
		return send(res, 200, data, { "content-type": contentType });
	} catch {
		return send(res, 500, "Internal Server Error");
	}
});

server.listen(port, "0.0.0.0", () => {
	console.log(`Serving ${root}`);
	console.log(`http://localhost:${port}/`);
});
