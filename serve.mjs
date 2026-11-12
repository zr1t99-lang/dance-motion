// Zero-dependency static file server:  node serve.mjs [port]
// Serves this folder on http://localhost:<port> (default 8080).
// On the same computer `localhost` counts as a secure context, so the camera works there.
// A phone needs HTTPS: see README.md ("Testing on a real phone").
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const file = normalize(join(root, p));
    if (!file.startsWith(root) || /\/(node_modules|tests|src)\//.test(p)) throw new Error("blocked");
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      // lets the camera permission prompt work when embedded/tunnelled
      "Permissions-Policy": "camera=(self)",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Dance Motion  →  http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces()))
    for (const n of list || [])
      if (n.family === "IPv4" && !n.internal) console.log(`LAN (camera will be BLOCKED on a phone over plain http)  →  http://${n.address}:${port}`);
  console.log("For a phone you need HTTPS: see README.md");
});
