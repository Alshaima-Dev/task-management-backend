import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { users } from "../src/modules/users/users.data.js";
import { tasks } from "../src/modules/tasks/tasks.data.js";
import { getUsers, createUser, deleteUser } from "../src/modules/users/users.service.js";
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} from "../src/modules/tasks/tasks.service.js";

const originalUsers = users.map((user) => ({ ...user }));
const originalTasks = tasks.map((task) => ({ ...task }));

function restoreData() {
  users.splice(0, users.length, ...originalUsers.map((user) => ({ ...user })));
  tasks.splice(0, tasks.length, ...originalTasks.map((task) => ({ ...task })));
}

// Tests run sequentially because the services share mutable arrays.
// The private ID counter is intentionally not reset; tests never assume its value.
beforeEach(restoreData);
afterEach(restoreData);

function validTask() {
  return createTask({ title: "Write service tests", userId: users[0].id });
}

function missingTaskId() {
  return Math.max(0, ...tasks.map((task) => task.id)) + 1;
}

test("gets all users and tasks", () => {
  assert.deepEqual(getUsers(), originalUsers);
  assert.deepEqual(getTasks(), originalTasks);
});

test("creates users with trimmed names and unique numeric IDs", () => {
  const existingIds = users.map((user) => user.id);
  const first = createUser({ name: "  Dana  " });
  const second = createUser({ name: "Evan" });
  assert.equal(first.name, "Dana");
  assert.ok(Number.isSafeInteger(first.id));
  assert.ok(Number.isSafeInteger(second.id));
  assert.ok(!existingIds.includes(first.id));
  assert.ok(!existingIds.includes(second.id));
  assert.notEqual(first.id, second.id);
  assert.deepEqual(getUsers(), [...originalUsers, first, second]);
  const task = createTask({ title: "Assigned to a new user", userId: first.id });
  assert.equal(task.userId, first.id);
});

test("rejects empty, whitespace-only, and non-string user names", () => {
  for (const name of ["", "  \t\n", undefined, null, 42, false, {}, []]) {
    assert.throws(() => createUser({ name }), /name.*non-empty/i);
    assert.deepEqual(users, originalUsers);
  }
  assert.throws(() => createUser(), /name.*non-empty/i);
});

test("deletes an unassigned user without changing existing users or tasks", () => {
  const user = createUser({ name: "Temporary person" });
  assert.deepEqual(deleteUser(user.id), user);
  assert.deepEqual(users, originalUsers);
  assert.deepEqual(tasks, originalTasks);
  const replacement = createUser({ name: "Replacement person" });
  assert.notEqual(replacement.id, user.id);
});

test("rejects deleting a nonexistent user", () => {
  const id = Math.max(...users.map((user) => user.id)) + 1;
  assert.throws(() => deleteUser(id), { code: "USER_NOT_FOUND" });
  assert.deepEqual(users, originalUsers);
  assert.deepEqual(tasks, originalTasks);
});

test("rejects deleting a user with assigned tasks, including completed tasks", () => {
  const user = createUser({ name: "Busy person" });
  const first = createTask({ title: "Pending work", userId: user.id });
  const second = createTask({ title: "Finished work", userId: user.id });
  updateTask(second.id, { completed: true });
  const beforeUsers = users.map((person) => ({ ...person }));
  const beforeTasks = tasks.map((task) => ({ ...task }));
  assert.throws(() => deleteUser(user.id), (error) => {
    assert.equal(error.code, "USER_HAS_TASKS");
    assert.match(error.message, /2 assigned tasks/);
    return true;
  });
  assert.deepEqual(users, beforeUsers);
  assert.deepEqual(tasks, beforeTasks);
  deleteTask(first.id);
  assert.throws(() => deleteUser(user.id), /1 assigned task/);
  deleteTask(second.id);
  assert.deepEqual(deleteUser(user.id), user);
});

test("gets a task by its ID", () => {
  const expected = { ...tasks[0] };
  assert.deepEqual(getTaskById(expected.id), expected);
});

test("creates a task assigned to an existing user with completed false", () => {
  const previousIds = tasks.map((task) => task.id);
  const task = validTask();

  assert.equal(typeof task.id, "number");
  assert.ok(Number.isSafeInteger(task.id));
  assert.ok(!previousIds.includes(task.id));
  assert.equal(task.title, "Write service tests");
  assert.equal(task.userId, users[0].id);
  assert.equal(task.completed, false);
  assert.equal(tasks.length, originalTasks.length + 1);
  assert.deepEqual(getTaskById(task.id), task);
});

test("updates completion to true and back to false", () => {
  const task = validTask();
  const expected = { ...task };

  assert.deepEqual(updateTask(task.id, { completed: true }), {
    ...expected,
    completed: true,
  });
  assert.equal(getTaskById(task.id).completed, true);
  assert.deepEqual(updateTask(task.id, { completed: false }), expected);
  assert.equal(getTaskById(task.id).completed, false);
});

test("deletes a task and returns the deleted task", () => {
  const task = validTask();
  const expected = { ...task };
  const count = tasks.length;

  assert.deepEqual(deleteTask(task.id), expected);
  assert.equal(tasks.length, count - 1);
  assert.ok(!getTasks().some((item) => item.id === task.id));
  assert.throws(() => getTaskById(task.id), /Task .*not found/i);
});

test("rejects empty and whitespace-only titles without changing tasks", () => {
  for (const title of ["", " ", "\t\n  "]) {
    assert.throws(
      () => createTask({ title, userId: users[0].id }),
      /title.*non-empty/i,
    );
    assert.deepEqual(tasks, originalTasks);
  }
});

test("rejects non-string titles without changing tasks", () => {
  for (const title of [undefined, null, 123, false, {}, []]) {
    assert.throws(
      () => createTask({ title, userId: users[0].id }),
      /title.*non-empty/i,
    );
    assert.deepEqual(tasks, originalTasks);
  }
});

test("rejects a nonexistent user without changing tasks", () => {
  const userId = Math.max(0, ...users.map((user) => user.id)) + 1;

  assert.throws(
    () => createTask({ title: "Unassigned task", userId }),
    /User .*not found/i,
  );
  assert.deepEqual(tasks, originalTasks);
});

test("rejects invalid completion values without changing the task", () => {
  const task = validTask();
  const expected = { ...task };

  for (const completed of [undefined, null, "true", "false", 0, 1, {}, []]) {
    assert.throws(() => updateTask(task.id, { completed }), /completion.*boolean/i);
    assert.deepEqual(getTaskById(task.id), expected);
  }
});

test("throws descriptive errors for missing task IDs in get, update, and delete", () => {
  const id = missingTaskId();

  for (const operation of [
    () => getTaskById(id),
    () => updateTask(id, { completed: true }),
    () => deleteTask(id),
  ]) {
    assert.throws(operation, (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Task .*not found/i);
      assert.ok(error.message.includes(String(id)));
      return true;
    });
    assert.deepEqual(tasks, originalTasks);
  }
});

test("keeps task IDs unique after deleting the newest task", () => {
  const first = validTask();
  const deleted = validTask();
  deleteTask(deleted.id);
  const replacement = validTask();

  assert.notEqual(replacement.id, deleted.id);
  assert.notEqual(replacement.id, first.id);
  const ids = getTasks().map((task) => task.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => Number.isSafeInteger(id)));
});

test("keeps IDs unique when all tasks have been deleted", () => {
  const issuedIds = tasks.map((task) => task.id);
  const created = validTask();
  issuedIds.push(created.id);

  for (const task of [...tasks]) deleteTask(task.id);
  assert.deepEqual(getTasks(), []);

  const next = validTask();
  assert.ok(!issuedIds.includes(next.id));
  assert.equal(getTasks().length, 1);
  assert.deepEqual(getTaskById(next.id), next);
});
