import { getUsers, createUser, deleteUser } from "../modules/users/users.service.js";

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// Returns false when the request belongs to another route.
export async function handleUsersRoutes(req, res) {
  const pathname = (req.url || "/").split("?")[0];
  const collection = /^\/api\/users\/?$/.test(pathname);
  const match = pathname.match(/^\/api\/users\/([^/]+)\/?$/);
  if (!collection && !match) return false;

  const allowed = collection ? ["GET", "POST"] : ["DELETE"];
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    sendJson(res, 405, { error: "Method not allowed." });
    return true;
  }

  try {
    if (match) {
      const id = Number(match[1]);
      if (!/^\d+$/.test(match[1]) || !Number.isSafeInteger(id) || id < 1) {
        sendJson(res, 400, { error: "User ID must be a positive integer." });
        return true;
      }
      sendJson(res, 200, deleteUser(id));
    } else if (req.method === "GET") {
      sendJson(res, 200, getUsers());
    } else {
      let body = "";
      req.setEncoding("utf8");
      for await (const chunk of req) body += chunk;

      let data;
      try {
        data = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Request body must contain valid JSON." });
        return true;
      }

      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        sendJson(res, 400, { error: "Request body must be a JSON object." });
        return true;
      }

      sendJson(res, 201, createUser(data));
    }
  } catch (error) {
    if (error.code === "USER_NOT_FOUND") {
      sendJson(res, 404, { error: error.message });
    } else if (error.code === "USER_HAS_TASKS") {
      sendJson(res, 409, { error: error.message });
    } else if (error.message === "User name must be a non-empty string.") {
      sendJson(res, 400, { error: error.message });
    } else {
      sendJson(res, 500, { error: "Internal server error." });
    }
  }

  return true;
}
