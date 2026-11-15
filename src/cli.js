import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getUsers } from "./modules/users/users.service.js";
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} from "./modules/tasks/tasks.service.js";

const readline = createInterface({ input: stdin, output: stdout });
const shutdown = new AbortController();
let closed = false;

function close() {
  if (closed) return;
  closed = true;
  shutdown.abort();
  readline.close();
}

readline.on("SIGINT", close);
readline.on("close", () => {
  closed = true;
  shutdown.abort();
});

async function prompt(message) {
  if (closed) throw new Error("CLI is closed.");
  return (await readline.question(message, { signal: shutdown.signal })).trim();
}

async function promptId(message) {
  const value = await prompt(message);
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) {
    throw new Error("Enter a positive whole-number ID.");
  }
  return id;
}

function displayTask(task) {
  const user = getUsers().find((person) => person.id === task.userId);
  console.log(
    `#${task.id} | ${task.title} | ${task.completed ? "Completed" : "Incomplete"} | Assigned to: ${user?.name ?? `User #${task.userId}`}`,
  );
}

function displayUsers() {
  const users = getUsers();
  if (users.length === 0) {
    console.log("No users available.");
    return;
  }
  for (const user of users) console.log(`#${user.id} | ${user.name}`);
}

async function runOperation(choice) {
  switch (choice) {
    case "1": {
      const title = await prompt("Task title: ");
      if (!title) throw new Error("Task title cannot be empty.");
      displayUsers();
      const userId = await promptId("Assigned user ID: ");
      const task = createTask({ title, userId });
      console.log("Task created successfully.");
      displayTask(task);
      break;
    }
    case "2": {
      const tasks = getTasks();
      if (tasks.length === 0) console.log("No tasks yet. Choose Add Task to create one.");
      else tasks.forEach(displayTask);
      break;
    }
    case "3": {
      const id = await promptId("Task ID: ");
      displayTask(getTaskById(id));
      break;
    }
    case "4": {
      const id = await promptId("Task ID: ");
      displayTask(getTaskById(id));
      const value = (await prompt("Mark as completed? (yes/no): ")).toLowerCase();
      if (!["yes", "y", "no", "n"].includes(value)) {
        throw new Error("Enter yes or no for completion.");
      }
      const task = updateTask(id, { completed: value === "yes" || value === "y" });
      console.log("Task completion updated successfully.");
      displayTask(task);
      break;
    }
    case "5": {
      const id = await promptId("Task ID: ");
      displayTask(getTaskById(id));
      const confirmation = (await prompt("Delete this task permanently? (yes/no): ")).toLowerCase();
      if (confirmation === "yes" || confirmation === "y") {
        deleteTask(id);
        console.log("Task deleted successfully.");
      } else {
        console.log("Deletion cancelled. Task was kept.");
      }
      break;
    }
    case "6":
      displayUsers();
      break;
    case "7":
      close();
      break;
    default:
      console.log("Invalid choice. Enter a number from 1 to 7.");
  }
}

async function main() {
  console.log("Welcome to Task Management!");
  console.log("Data is stored in memory for this CLI session only.");

  try {
    while (!closed) {
      console.log(`
1. Add Task
2. View All Tasks
3. Find Task by ID
4. Update Task Completion
5. Delete Task
6. View Users
7. Exit
`);
      try {
        const choice = await prompt("Choose an option: ");
        await runOperation(choice);
      } catch (error) {
        if (closed) break;
        console.error(`Error: ${error.message}`);
      }
    }
  } finally {
    close();
    console.log("\nGoodbye!");
  }
}

await main();
