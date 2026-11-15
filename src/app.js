import http from "node:http";
import { readFile } from "node:fs/promises";
import { handleTasksRoutes } from "./routes/tasks.routes.js";
import { handleUsersRoutes } from "./routes/users.routes.js";

const port = process.env.PORT || 3000;

const staticFiles = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
  "/script.js": { file: "script.js", type: "text/javascript; charset=utf-8" },
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = (req.url || "/").split("?")[0];

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      if (await handleTasksRoutes(req, res)) return;
      if (await handleUsersRoutes(req, res)) return;

      sendJson(res, 404, { error: "API route not found." });
      return;
    }

    const asset = Object.hasOwn(staticFiles, pathname)
      ? staticFiles[pathname]
      : undefined;

    if (!asset) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found.");
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, {
        "Content-Type": "text/plain; charset=utf-8",
        Allow: "GET, HEAD",
      });
      res.end("Method not allowed.");
      return;
    }

    let content;
    try {
      content = await readFile(new URL(`../public/${asset.file}`, import.meta.url));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;

      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found.");
      return;
    }

    res.writeHead(200, { "Content-Type": asset.type });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error("Request failed:", error);

    if (res.headersSent) {
      res.destroy();
      return;
    }

    sendJson(res, 500, { error: "Internal server error." });
  }
});

server.on("error", (error) => {
  console.error("Server error:", error);
  process.exitCode = 1;
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
