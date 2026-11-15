# Task Management Backend Starter

A task management application built with native Node.js. Manage tasks through a responsive web interface, an interactive CLI, or a JSON HTTP API.

## Features

- Create, list, find, update completion, and delete tasks.
- Assign tasks to existing users and view available users.
- Validate input and return descriptive errors.
- Use a responsive web interface with task summaries and deletion confirmation.
- Test service behavior with Node.js built-in testing tools.

## Technologies

Node.js, native HTTP, ESM, `node:readline/promises`, `node:test`, and `node:assert/strict`. The frontend uses HTML, CSS, vanilla JavaScript, and the Fetch API.

## Project Structure

```text
src/
  app.js                 HTTP server and static file serving
  cli.js                 Interactive command-line interface
  modules/
    tasks/               In-memory task data and services
    users/               In-memory user data and services
  routes/                Tasks and users HTTP handlers
public/                  HTML, CSS, and browser JavaScript
tests/tasks.test.js       Service tests
package.json
.gitignore
README.md
```

## Setup and Usage

Use Node.js 18 or later. Run these commands from the project root; the application uses built-in Node.js modules and needs no additional packages.

```sh
# Start the web server
npm start

# Start the interactive CLI
npm run cli

# Run service tests
npm test
```

Open [http://localhost:3000](http://localhost:3000) after starting the server. Set the `PORT` environment variable to use another port.

## API

Send request bodies as JSON with `Content-Type: application/json`.

| Method | Endpoint | Description | Success |
| --- | --- | --- | --- |
| POST | `/api/tasks` | Create a task with `title` and `userId` | 201 |
| GET | `/api/tasks` | List all tasks | 200 |
| GET | `/api/tasks/:id` | Get a task by numeric ID | 200 |
| PATCH | `/api/tasks/:id` | Set `completed` to `true` or `false` | 200 |
| DELETE | `/api/tasks/:id` | Delete a task and return it | 200 |
| GET | `/api/users` | List available users | 200 |

New tasks start with `completed: false`. Titles must be non-empty, and the assigned user must exist. Invalid input returns 400, missing tasks return 404, and unexpected errors return a generic 500 response.

## Storage

Data is stored in mutable in-memory arrays, seeded with three users and three tasks. Changes are lost when the process exits. The server and CLI run in separate processes and do not share changes.
