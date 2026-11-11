// This small app keeps workout entries in this browser instead of sending them to a server.
(() => {
  const STORAGE_KEY = "workout-log.entries.v1";

  const form = document.querySelector("#workout-form");
  const fields = document.querySelector("#workout-fields");
  const dateInput = document.querySelector("#workout-date");
  const exerciseInput = document.querySelector("#exercise");
  const weightInput = document.querySelector("#weight");
  const repsInput = document.querySelector("#reps");
  const setsInput = document.querySelector("#sets");
  const status = document.querySelector("#status");
  const summary = document.querySelector("#summary");
  const emptyState = document.querySelector("#empty-state");
  const workoutList = document.querySelector("#workout-list");
  const exportButton = document.querySelector("#export-button");

  let entries = [];
  let storageReady = true;

  function localDateString(date = new Date()) {
    // Build YYYY-MM-DD from the phone's local calendar so today's date is not shifted by UTC.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isValidEntry(entry) {
    return entry !== null
      && typeof entry === "object"
      && typeof entry.id === "string"
      && typeof entry.date === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      && typeof entry.exercise === "string"
      && Number.isFinite(entry.weight)
      && entry.weight >= 0
      && Number.isInteger(entry.reps)
      && entry.reps > 0
      && Number.isInteger(entry.sets)
      && entry.sets > 0
      && typeof entry.createdAt === "string";
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function loadEntries() {
    try {
      const savedEntries = localStorage.getItem(STORAGE_KEY);
      if (savedEntries === null) {
        entries = [];
        return;
      }

      const parsedEntries = JSON.parse(savedEntries);
      if (!Array.isArray(parsedEntries) || !parsedEntries.every(isValidEntry)) {
        throw new Error("Saved workout data has an unexpected format.");
      }
      entries = parsedEntries;
    } catch (error) {
      storageReady = false;
      fields.disabled = true;
      exportButton.disabled = true;
      setStatus("Saved workouts could not be read, so adding entries is disabled to protect your data.");
      console.error("Could not load workout entries.", error);
    }
  }

  function saveEntries(nextEntries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
      entries = nextEntries;
      renderEntries();
      return true;
    } catch (error) {
      setStatus("Your browser could not save this workout. Check available device storage and try again.");
      console.error("Could not save workout entries.", error);
      return false;
    }
  }

  function formatDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(year, month - 1, day));
  }

  function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function makeWorkoutCard(entry) {
    const item = makeElement("li", "workout-entry");
    const details = makeElement("div", "entry-details");
    const exercise = makeElement("h3", "", entry.exercise);
    const setWord = entry.sets === 1 ? "set" : "sets";
    const detailsText = `${entry.sets} ${setWord} × ${entry.reps} reps @ ${entry.weight} kg`;
    const numbers = makeElement("p", "", detailsText);
    const deleteButton = makeElement("button", "delete-button", "Delete");

    deleteButton.type = "button";
    deleteButton.dataset.entryId = entry.id;
    deleteButton.setAttribute("aria-label", `Delete ${entry.exercise} entry from ${formatDate(entry.date)}`);

    details.append(exercise, numbers);
    item.append(details, deleteButton);
    return item;
  }

  function renderEntries() {
    const sortedEntries = [...entries].sort((first, second) => {
      return second.date.localeCompare(first.date)
        || second.createdAt.localeCompare(first.createdAt);
    });

    const entriesByDate = new Map();
    for (const entry of sortedEntries) {
      if (!entriesByDate.has(entry.date)) {
        entriesByDate.set(entry.date, []);
      }
      entriesByDate.get(entry.date).push(entry);
    }

    workoutList.replaceChildren();
    for (const [date, dayEntries] of entriesByDate) {
      const daySection = makeElement("section", "workout-day");
      const heading = makeElement("h3", "workout-day-heading", formatDate(date));
      const dayList = makeElement("ul", "workout-day-list");

      for (const entry of dayEntries) {
        dayList.append(makeWorkoutCard(entry));
      }

      daySection.append(heading, dayList);
      workoutList.append(daySection);
    }

    const totalSets = entries.reduce((total, entry) => total + entry.sets, 0);
    summary.textContent = entries.length === 0
      ? "No exercises logged yet."
      : `${entries.length} ${entries.length === 1 ? "exercise" : "exercises"} logged · ${totalSets} total ${totalSets === 1 ? "set" : "sets"}`;
    emptyState.hidden = entries.length !== 0;
    exportButton.disabled = entries.length === 0;
  }

  function createEntryId() {
    // The timestamp plus a random number is enough to identify entries on this device.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function exportCsv() {
    const csvCell = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ["Date", "Exercise", "Weight (kg)", "Reps per set", "Sets"],
      ...entries.map((entry) => [
        entry.date,
        entry.exercise,
        entry.weight,
        entry.reps,
        entry.sets,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const file = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const downloadLink = document.createElement("a");

    downloadLink.href = URL.createObjectURL(file);
    downloadLink.download = `workout-log-${localDateString()}.csv`;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadLink.href), 1000);
    setStatus("Workout backup downloaded as a CSV file.");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!storageReady || !form.reportValidity()) {
      return;
    }

    const entry = {
      id: createEntryId(),
      date: dateInput.value,
      exercise: exerciseInput.value.trim(),
      weight: Number(weightInput.value),
      reps: Number(repsInput.value),
      sets: Number(setsInput.value),
      createdAt: new Date().toISOString(),
    };

    if (saveEntries([entry, ...entries])) {
      form.reset();
      dateInput.value = localDateString();
      repsInput.value = "8";
      setsInput.value = "3";
      setStatus(`${entry.exercise} saved.`);
      exerciseInput.focus();
    }
  });

  workoutList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("button[data-entry-id]");
    if (!deleteButton) {
      return;
    }

    const entry = entries.find((savedEntry) => savedEntry.id === deleteButton.dataset.entryId);
    if (!entry || !window.confirm(`Delete the ${entry.exercise} entry from ${formatDate(entry.date)}?`)) {
      return;
    }

    if (saveEntries(entries.filter((savedEntry) => savedEntry.id !== entry.id))) {
      setStatus(`${entry.exercise} entry deleted.`);
    }
  });

  exportButton.addEventListener("click", exportCsv);

  dateInput.value = localDateString();
  loadEntries();
  renderEntries();

  // Register offline caching only on secure hosted pages; local files still work without it.
  if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      setStatus("Offline app setup failed. Your saved workouts are still available while online.");
      console.error("Could not register the workout app service worker.", error);
    });
  }
})();
