const $ = (id) => document.getElementById(id);
let users = [];
let tasks = [];
let ready = false;
let busy = false;
let deletionToastTimer;

function showDeletionToast(message) {
  clearTimeout(deletionToastTimer);
  const toast = $("deletion-toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  deletionToastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    toast.textContent = "";
    deletionToastTimer = undefined;
  }, 3000);
}

window.addEventListener("pagehide", () => {
  clearTimeout(deletionToastTimer);
  deletionToastTimer = undefined;
  $("deletion-toast").classList.remove("is-visible");
  $("deletion-toast").textContent = "";
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an unreadable response. Please try again.");
  }
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function notify(message, error = false) {
  const feedback = $("feedback");
  feedback.textContent = message;
  feedback.classList.toggle("error", error);
  feedback.setAttribute("role", error ? "alert" : "status");
  feedback.hidden = false;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function userName(id) {
  return users.find((user) => user.id === id)?.name || "Unavailable person";
}

function syncControls() {
  $("refresh").disabled = busy;
  $("add-person").disabled = busy || !ready;
  $("save-person").disabled = busy;
  $("cancel-person").disabled = busy;
  $("person-name").disabled = busy;
  $("create-button").disabled = busy || !ready || users.length === 0;
  $("user").disabled = busy || !ready || users.length === 0;
  document.querySelectorAll(".task-toggle, .delete-button, .delete-person").forEach((control) => {
    control.disabled = busy;
  });
}

function renderAssignees() {
  const select = $("user");
  const previous = select.value;
  const query = $("assignee-search").value.trim().toLocaleLowerCase();
  const matches = users.filter((user) => user.name.toLocaleLowerCase().includes(query));
  select.replaceChildren(new Option(matches.length ? "Choose a person" : "No matching people", ""));
  for (const user of matches) {
    select.add(new Option(user.name, String(user.id)));
  }
  if (matches.some((user) => String(user.id) === previous)) select.value = previous;
  $("assignee-help").textContent = matches.length
    ? `${matches.length} ${matches.length === 1 ? "person available" : "people available"}. Choose a person below.`
    : "No matching people. Try another name.";
}

function renderUsers() {
  $("user-list").replaceChildren();
  const query = $("people-search").value.trim().toLocaleLowerCase();
  const matches = users.filter((user) => user.name.toLocaleLowerCase().includes(query));
  for (const user of matches) {
    const row = element("li", "user");
    const initials = user.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
    const avatar = element("span", "avatar", initials);
    avatar.setAttribute("aria-hidden", "true");
    row.append(avatar, element("span", "user-name", user.name));
    const remove = element("button", "delete-button delete-person", "Delete");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete person ${user.name}`);
    remove.addEventListener("click", () => removePerson(user, remove));
    row.append(remove);
    $("user-list").append(row);
  }
  $("users-state").hidden = matches.length > 0;
  $("users-state").textContent = users.length
    ? "No matching people. Try another name."
    : "No people available. A user is needed to create a task.";
  syncControls();
}

async function removePerson(user, button) {
  if (busy) return;
  busy = true;
  syncControls();
  button.textContent = "Checking…";
  let deleted = false;
  try {
    const [currentUsers, currentTasks] = await Promise.all([
      api("/api/users"),
      api("/api/tasks"),
    ]);
    const currentUser = currentUsers.find((person) => person.id === user.id);
    if (!currentUser) {
      showDeletionToast("This person no longer exists. Refresh the workspace to update the People list.");
      return;
    }

    // Match the backend rule: every assigned task blocks deletion, completed or not.
    const assignedCount = currentTasks.filter((task) => task.userId === user.id).length;
    if (assignedCount > 0) {
      showDeletionToast(
        `Cannot delete this person: ${assignedCount} assigned ${assignedCount === 1 ? "task remains" : "tasks remain"}. Delete their tasks before deleting this person.`,
      );
      return;
    }

    if (!window.confirm(`Delete “${currentUser.name}”? This cannot be undone.`)) return;
    button.textContent = "Deleting…";
    await api(`/api/users/${user.id}`, { method: "DELETE" });
    users = users.filter((person) => person.id !== user.id);
    renderUsers();
    renderAssignees();
    renderTasks();
    deleted = true;
    notify("Person deleted successfully.");
  } catch (error) {
    if (error.status === 409 || error.status === 404) {
      showDeletionToast(error.message);
    } else {
      notify(`Couldn't delete the person. ${error.message}`, true);
    }
  } finally {
    busy = false;
    button.textContent = "Delete";
    syncControls();
    if (deleted) $("people-search").focus();
    else button.focus();
  }
}

function renderTasks() {
  $("task-list").replaceChildren();
  const query = $("task-search").value.trim().toLocaleLowerCase();
  const status = $("task-filter").value;
  const visibleTasks = tasks.filter((task) =>
    (task.title.toLocaleLowerCase().includes(query) || userName(task.userId).toLocaleLowerCase().includes(query)) &&
    (status === "all" || (status === "completed" ? task.completed : !task.completed)),
  );
  $("task-state").hidden = visibleTasks.length > 0;
  $("task-state").textContent = tasks.length
    ? "No tasks match your search. Try another title, person's name, or status."
    : "A fresh start. Create your first task to get things moving.";
  $("task-results").textContent = `Showing ${visibleTasks.length} of ${tasks.length} tasks`;
  $("total-count").textContent = tasks.length;
  $("completed-count").textContent = tasks.filter((task) => task.completed).length;
  $("pending-count").textContent = tasks.filter((task) => !task.completed).length;

  for (const task of visibleTasks) {
    const row = element("li", `task${task.completed ? " done" : ""}`);
    const toggle = element("input", "task-toggle");
    toggle.type = "checkbox";
    toggle.id = `task-toggle-${task.id}`;
    toggle.checked = task.completed;
    toggle.setAttribute("aria-label", `Mark ${task.title} as ${task.completed ? "incomplete" : "completed"}`);
    toggle.addEventListener("change", () => updateCompletion(task, toggle));
    const details = element("div");
    const meta = element("div", "task-meta");
    meta.append(element("span", "status", task.completed ? "Completed" : "In progress"), element("span", "", userName(task.userId)));
    details.append(element("span", "task-title", task.title), meta);
    const remove = element("button", "delete-button", "Delete");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete ${task.title}`);
    remove.addEventListener("click", () => removeTask(task));
    row.append(toggle, details, remove);
    $("task-list").append(row);
  }
  syncControls();
}

async function load() {
  if (busy) return;
  busy = true;
  syncControls();
  $("refresh").textContent = "Loading…";
  $("task-list").setAttribute("aria-busy", "true");
  $("feedback").hidden = true;
  try {
    const [loadedUsers, loadedTasks] = await Promise.all([api("/api/users"), api("/api/tasks")]);
    users = loadedUsers;
    tasks = loadedTasks;
    ready = true;
    renderAssignees();
    renderUsers();
    renderTasks();
  } catch (error) {
    notify(`Couldn't load the workspace. ${error.message} Use Refresh to try again.`, true);
    if (!ready) {
      $("task-state").textContent = "Tasks couldn't be loaded. Try refreshing.";
      $("users-state").textContent = "People couldn't be loaded.";
      $("user").replaceChildren(new Option("People unavailable", ""));
    }
  } finally {
    busy = false;
    $("refresh").textContent = "↻ Refresh";
    $("task-list").setAttribute("aria-busy", "false");
    syncControls();
  }
}

async function updateCompletion(task, toggle) {
  if (busy) { toggle.checked = task.completed; return; }
  busy = true;
  syncControls();
  try {
    const updated = await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ completed: toggle.checked }) });
    tasks = tasks.map((item) => item.id === updated.id ? updated : item);
    renderTasks();
    notify(updated.completed ? "Task completed. Nice work!" : "Task marked as incomplete.");
  } catch (error) {
    toggle.checked = task.completed;
    notify(`Couldn't update the task. ${error.message}`, true);
  } finally {
    busy = false;
    syncControls();
    const updatedToggle = $(`task-toggle-${task.id}`);
    if (updatedToggle) updatedToggle.focus();
    else $("tasks-heading").focus();
  }
}

async function removeTask(task) {
  if (busy || !window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
  busy = true;
  syncControls();
  try {
    await api(`/api/tasks/${task.id}`, { method: "DELETE" });
    tasks = tasks.filter((item) => item.id !== task.id);
    renderTasks();
    $("tasks-heading").tabIndex = -1;
    $("tasks-heading").focus();
    notify("Task deleted.");
  } catch (error) {
    notify(`Couldn't delete the task. ${error.message}`, true);
  } finally { busy = false; syncControls(); }
}

$("create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !ready) return;
  const title = $("title").value.trim();
  const userId = Number($("user").value);
  if (!title) { notify("Enter a task title, not just spaces.", true); $("title").focus(); return; }
  if (!users.some((user) => user.id === userId)) { notify("Choose an available person.", true); return; }
  busy = true;
  syncControls();
  $("create-button").textContent = "Creating…";
  try {
    const task = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title, userId }) });
    tasks.push(task);
    renderTasks();
    $("create-form").reset();
    renderAssignees();
    $("title").focus();
    notify("Task created. You're ready to go.");
  } catch (error) {
    notify(`Couldn't create the task. ${error.message}`, true);
  } finally {
    busy = false;
    $("create-button").textContent = "Create task ＋";
    syncControls();
  }
});

$("refresh").addEventListener("click", load);
function closePersonForm() {
  $("person-form").hidden = true;
  $("person-form").reset();
  $("add-person").setAttribute("aria-expanded", "false");
  $("add-person").focus();
}

$("add-person").addEventListener("click", () => {
  if (!$("person-form").hidden) { closePersonForm(); return; }
  $("person-form").hidden = false;
  $("add-person").setAttribute("aria-expanded", "true");
  $("person-name").focus();
});
$("cancel-person").addEventListener("click", closePersonForm);
$("person-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !ready) return;
  const name = $("person-name").value.trim();
  if (!name) {
    notify("Enter a person's name, not just spaces.", true);
    $("person-name").focus();
    return;
  }

  busy = true;
  syncControls();
  $("save-person").textContent = "Saving…";
  let saved = false;
  try {
    const user = await api("/api/users", { method: "POST", body: JSON.stringify({ name }) });
    users.push(user);
    $("people-search").value = "";
    $("assignee-search").value = "";
    renderUsers();
    renderAssignees();
    renderTasks();
    saved = true;
    notify("Person added. They are now available to assign tasks.");
  } catch (error) {
    notify(`Couldn't add the person. ${error.message}`, true);
  } finally {
    busy = false;
    $("save-person").textContent = "Save person";
    syncControls();
    if (saved) closePersonForm();
    else $("person-name").focus();
  }
});
$("task-search").addEventListener("input", () => { if (ready) renderTasks(); });
$("task-filter").addEventListener("change", () => { if (ready) renderTasks(); });
$("people-search").addEventListener("input", () => { if (ready) renderUsers(); });
$("assignee-search").addEventListener("input", () => { if (ready) renderAssignees(); });
load();
