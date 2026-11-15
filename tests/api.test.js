import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

let server;
let serverExit;
let baseUrl;
let userId;

// Observe the ephemeral port without changing the production application.
const bootstrap = `
  import { Server } from 'node:http';
  const listen = Server.prototype.listen;
  Server.prototype.listen = function (...args) {
    this.once('listening', () => {
      process.send({ port: this.address().port });
    });
    return listen.apply(this, args);
  };
  await import(${JSON.stringify(new URL("../src/app.js", import.meta.url).href)});
`;

before(async () => {
  server = spawn(process.execPath, ["--input-type=module", "--eval", bootstrap], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });

  let diagnostics = "";
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk) => {
    diagnostics = (diagnostics + chunk).slice(-4000);
  });
  serverExit = new Promise((resolve) => server.once("exit", resolve));

  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("API test server startup timed out.")), 10000);
    function finish(error, value) {
      clearTimeout(timer);
      server.off("message", onMessage);
      server.off("error", onError);
      server.off("exit", onExit);
      if (error) reject(error);
      else resolve(value);
    }
    function onMessage(message) {
      if (Number.isInteger(message?.port) && message.port > 0) finish(null, message.port);
    }
    function onError(error) { finish(error); }
    function onExit(code) {
      finish(new Error(`API test server exited before startup (${code}). ${diagnostics}`));
    }
    server.on("message", onMessage);
    server.once("error", onError);
    server.once("exit", onExit);
  });

  baseUrl = `http://127.0.0.1:${port}`;
  const { response, data } = await request("/api/users");
  assert.equal(response.status, 200);
  assert.ok(data.length > 0);
  userId = data[0].id;
});

after(async () => {
  if (!server || !server.pid) return;
  if (server.exitCode === null && server.signalCode === null) server.kill();
  await serverExit;
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    signal: AbortSignal.timeout(5000),
  });
  assert.match(response.headers.get("content-type") || "", /application\/json/i);
  const data = await response.json();
  return { response, data };
}

async function createTask() {
  const { response, data } = await request("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "HTTP test task", userId }),
  });
  assert.equal(response.status, 201);
  return data;
}

async function withTask(operation) {
  const task = await createTask();
  try {
    await operation(task);
  } finally {
    const { response } = await request(`/api/tasks/${task.id}`, { method: "DELETE" });
    assert.ok([200, 404].includes(response.status), "Temporary task cleanup failed.");
  }
}

function assertError(result, status) {
  assert.equal(result.response.status, status);
  assert.equal(typeof result.data.error, "string");
  assert.ok(result.data.error.length > 0);
}

test("GET /api/users lists users", async () => {
  const { response, data } = await request("/api/users");
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
  for (const user of data) {
    assert.equal(typeof user.id, "number");
    assert.equal(typeof user.name, "string");
  }
});

test("POST /api/tasks creates a task with completed false", async () => {
  await withTask(async (task) => {
    assert.ok(Number.isSafeInteger(task.id));
    assert.equal(task.title, "HTTP test task");
    assert.equal(task.userId, userId);
    assert.equal(task.completed, false);
  });
});

test("GET /api/tasks lists tasks including a newly created task", async () => {
  await withTask(async (task) => {
    const { response, data } = await request("/api/tasks");
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(data));
    assert.deepEqual(data.find((item) => item.id === task.id), task);
  });
});

test("GET /api/tasks/:id retrieves a task", async () => {
  await withTask(async (task) => {
    const { response, data } = await request(`/api/tasks/${task.id}`);
    assert.equal(response.status, 200);
    assert.deepEqual(data, task);
  });
});

test("PATCH /api/tasks/:id updates and persists both completion values", async () => {
  await withTask(async (task) => {
    for (const completed of [true, false]) {
      const { response, data } = await request(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(data, { ...task, completed });
      const saved = await request(`/api/tasks/${task.id}`);
      assert.equal(saved.response.status, 200);
      assert.equal(saved.data.completed, completed);
    }
  });
});

test("DELETE /api/tasks/:id removes a task", async () => {
  await withTask(async (task) => {
    const { response, data } = await request(`/api/tasks/${task.id}`, { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual(data, task);
    assertError(await request(`/api/tasks/${task.id}`), 404);
    const listing = await request("/api/tasks");
    assert.equal(listing.response.status, 200);
    assert.ok(!listing.data.some((item) => item.id === task.id));
  });
});

test("POST /api/tasks rejects invalid titles with 400", async () => {
  for (const title of ["", "  \t\n", null, 42]) {
    assertError(await request("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title, userId }),
    }), 400);
  }
});

test("POST /api/tasks rejects a nonexistent user with 400", async () => {
  const { data: users } = await request("/api/users");
  const missingUserId = Math.max(...users.map((user) => user.id)) + 1;
  assertError(await request("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "Invalid assignment", userId: missingUserId }),
  }), 400);
});

test("GET, PATCH, and DELETE return 404 for a missing task", async () => {
  const { data: tasks } = await request("/api/tasks");
  const missingId = Math.max(0, ...tasks.map((task) => task.id)) + 1;
  for (const method of ["GET", "PATCH", "DELETE"]) {
    assertError(await request(`/api/tasks/${missingId}`, {
      method,
      ...(method === "PATCH" ? { body: JSON.stringify({ completed: true }) } : {}),
    }), 404);
  }
});

test("POST and PATCH reject malformed JSON with 400", async () => {
  assertError(await request("/api/tasks", { method: "POST", body: '{"title":' }), 400);
  await withTask(async (task) => {
    assertError(await request(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: '{"completed":',
    }), 400);
  });
});

test("PATCH rejects non-boolean completion with 400", async () => {
  await withTask(async (task) => {
    assertError(await request(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: "true" }),
    }), 400);
    const { data } = await request(`/api/tasks/${task.id}`);
    assert.equal(data.completed, false);
  });
});

test("unknown API routes return JSON 404 responses", async () => {
  assertError(await request("/api/unknown"), 404);
});

test("POST /api/users creates people with unique IDs and makes them assignable", async () => {
  const { data: before } = await request("/api/users");
  const created = [];
  for (const name of ["  Dana  ", "Evan"]) {
    const { response, data } = await request("/api/users", {
      method: "POST", body: JSON.stringify({ name }),
    });
    assert.equal(response.status, 201);
    assert.equal(data.name, name.trim());
    assert.ok(Number.isSafeInteger(data.id));
    created.push(data);
  }
  const listing = await request("/api/users");
  assert.equal(listing.response.status, 200);
  assert.deepEqual(listing.data, [...before, ...created]);
  const ids = listing.data.map((user) => user.id);
  assert.equal(new Set(ids).size, ids.length);

  let task;
  try {
    const result = await request("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "New person's task", userId: created[0].id }),
    });
    task = result.data;
    assert.equal(result.response.status, 201);
    assert.equal(task.userId, created[0].id);
  } finally {
    if (task?.id) await request(`/api/tasks/${task.id}`, { method: "DELETE" });
  }
  // New people live only in this suite's private server and disappear on shutdown.
});

test("POST /api/users rejects invalid names without changing users", async () => {
  const { data: before } = await request("/api/users");
  for (const name of ["", " \t\n ", null, 123, false, {}, []]) {
    assertError(await request("/api/users", {
      method: "POST", body: JSON.stringify({ name }),
    }), 400);
  }
  for (const body of ["{}", "null", "[]", '{"name":']) {
    assertError(await request("/api/users", { method: "POST", body }), 400);
  }
  const { data: after } = await request("/api/users");
  assert.deepEqual(after, before);
});

async function withPerson(operation) {
  const { response, data: person } = await request("/api/users", {
    method: "POST", body: JSON.stringify({ name: "Deletion test person" }),
  });
  assert.equal(response.status, 201);
  try {
    await operation(person);
  } finally {
    const cleanup = await request(`/api/users/${person.id}`, { method: "DELETE" });
    assert.ok([200, 404].includes(cleanup.response.status), "Temporary person cleanup failed.");
  }
}

test("DELETE /api/users/:id deletes an unassigned person", async () => {
  await withPerson(async (person) => {
    const result = await request(`/api/users/${person.id}`, { method: "DELETE" });
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data, person);
    const listing = await request("/api/users");
    assert.equal(listing.response.status, 200);
    assert.ok(!listing.data.some((user) => user.id === person.id));
    assertError(await request(`/api/users/${person.id}`, { method: "DELETE" }), 404);
  });
});

test("DELETE /api/users/:id returns 404 for a nonexistent person", async () => {
  const { data: users } = await request("/api/users");
  const missingId = Math.max(0, ...users.map((user) => user.id)) + 1;
  assertError(await request(`/api/users/${missingId}`, { method: "DELETE" }), 404);
});

test("DELETE /api/users/:id prevents deletion with pending or completed tasks", async () => {
  await withPerson(async (person) => {
    const assigned = [];
    try {
      for (let index = 0; index < 2; index++) {
        const result = await request("/api/tasks", {
          method: "POST",
          body: JSON.stringify({ title: "Assigned work", userId: person.id }),
        });
        assert.equal(result.response.status, 201);
        assigned.push(result.data);
      }
      const update = await request(`/api/tasks/${assigned[1].id}`, {
        method: "PATCH", body: JSON.stringify({ completed: true }),
      });
      assert.equal(update.response.status, 200);
      const blocked = await request(`/api/users/${person.id}`, { method: "DELETE" });
      assertError(blocked, 409);
      assert.match(blocked.data.error, /2 assigned tasks/);
      const listing = await request("/api/users");
      assert.ok(listing.data.some((user) => user.id === person.id));
      for (const task of assigned) {
        const saved = await request(`/api/tasks/${task.id}`);
        assert.equal(saved.response.status, 200);
        assert.equal(saved.data.userId, person.id);
      }
      const removed = await request(`/api/tasks/${assigned[0].id}`, { method: "DELETE" });
      assert.equal(removed.response.status, 200);
      const stillBlocked = await request(`/api/users/${person.id}`, { method: "DELETE" });
      assertError(stillBlocked, 409);
      assert.match(stillBlocked.data.error, /1 assigned task/);
    } finally {
      for (const task of assigned) {
        const cleanup = await request(`/api/tasks/${task.id}`, { method: "DELETE" });
        assert.ok([200, 404].includes(cleanup.response.status));
      }
    }
  });
});

test("DELETE /api/users/:id rejects invalid IDs with 400", async () => {
  for (const id of ["abc", "0", "-1", "1.5"]) {
    assertError(await request(`/api/users/${id}`, { method: "DELETE" }), 400);
  }
});
