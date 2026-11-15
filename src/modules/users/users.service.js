import { users } from "./users.data.js";
import { tasks } from "../tasks/tasks.data.js";

let nextUserId = Math.max(0, ...users.map((user) => user.id)) + 1;

export function getUsers() {
  return users;
}

export function createUser({ name } = {}) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("User name must be a non-empty string.");
  }

  nextUserId = Math.max(nextUserId, ...users.map((user) => user.id + 1));
  const user = { id: nextUserId++, name: name.trim() };
  users.push(user);
  return user;
}

export function deleteUser(id) {
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) {
    const error = new Error(`User with ID ${id} was not found.`);
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  const assignedCount = tasks.filter((task) => task.userId === id).length;
  if (assignedCount > 0) {
    const error = new Error(
      `Cannot delete this person: ${assignedCount} assigned ${assignedCount === 1 ? "task remains" : "tasks remain"}. Delete their tasks before deleting this person.`,
    );
    error.code = "USER_HAS_TASKS";
    throw error;
  }

  return users.splice(index, 1)[0];
}
