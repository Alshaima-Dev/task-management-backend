import { tasks } from "./tasks.data.js";
import { users } from "../users/users.data.js";

let nextTaskId = Math.max(0, ...tasks.map((task) => task.id)) + 1;

export function getTasks() {
  return tasks;
}

export function getTaskById(id) {
  const task = tasks.find((task) => task.id === id);

  if (!task) {
    throw new Error(`Task with ID ${id} was not found.`);
  }

  return task;
}

export function createTask({ title, userId } = {}) {
  if (typeof title !== "string" || title.trim() === "") {
    throw new Error("Task title must be a non-empty string.");
  }

  if (!users.some((user) => user.id === userId)) {
    throw new Error(`User with ID ${userId} was not found.`);
  }

  nextTaskId = Math.max(nextTaskId, ...tasks.map((task) => task.id + 1));

  const task = {
    id: nextTaskId++,
    title: title.trim(),
    completed: false,
    userId,
  };

  tasks.push(task);
  return task;
}

export function updateTask(id, { completed } = {}) {
  const task = getTaskById(id);

  if (typeof completed !== "boolean") {
    throw new Error("Task completion must be a boolean.");
  }

  task.completed = completed;
  return task;
}

export function deleteTask(id) {
  const task = getTaskById(id);
  tasks.splice(tasks.indexOf(task), 1);
  return task;
}
