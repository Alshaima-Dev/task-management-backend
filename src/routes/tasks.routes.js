import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} from "../modules/tasks/tasks.service.js";

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = "";
  req.setEncoding("utf8");

  for await (const chunk of req) {
    body += chunk;
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.statusCode = 400;
    throw error;
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    const error = new Error("Request body must be a JSON object.");
    error.statusCode = 400;
    throw error;
  }

  return data;
}

// Returns false when the request belongs to another route.
export async function handleTasksRoutes(req, res) {
  const pathname = (req.url || "/").split("?")[0];
  const collection = /^\/api\/tasks\/?$/.test(pathname);
  const match = pathname.match(/^\/api\/tasks\/([^/]+)\/?$/);

  if (!collection && !match) return false;

  const allowed = collection ? ["GET", "POST"] : ["GET", "PATCH", "DELETE"];
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    sendJson(res, 405, { error: "Method not allowed." });
    return true;
  }

  try {
    let id;
    if (match) {
      id = Number(match[1]);
      if (!/^\d+$/.test(match[1]) || !Number.isSafeInteger(id) || id < 1) {
        sendJson(res, 400, { error: "Task ID must be a positive integer." });
        return true;
      }
    }

    if (collection && req.method === "GET") {
      sendJson(res, 200, getTasks());
    } else if (collection) {
      sendJson(res, 201, createTask(await readJson(req)));
    } else if (req.method === "GET") {
      sendJson(res, 200, getTaskById(id));
    } else if (req.method === "PATCH") {
      sendJson(res, 200, updateTask(id, await readJson(req)));
    } else {
      sendJson(res, 200, deleteTask(id));
    }
  } catch (error) {
    if (error.statusCode === 400) {
      sendJson(res, 400, { error: error.message });
    } else if (/^Task with ID \d+ was not found\.$/.test(error.message)) {
      sendJson(res, 404, { error: error.message });
    } else if (
      error.message === "Task title must be a non-empty string." ||
      error.message === "Task completion must be a boolean." ||
      /^User with ID .* was not found\.$/.test(error.message)
    ) {
      sendJson(res, 400, { error: error.message });
    } else {
      sendJson(res, 500, { error: "Internal server error." });
    }
  }

  return true;
}
