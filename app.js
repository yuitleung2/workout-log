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
  const importButton = document.querySelector("#import-button");
  const csvInput = document.querySelector("#csv-input");
  const chartEmpty = document.querySelector("#chart-empty");
  const chartContainer = document.querySelector("#chart-container");
  const chartLegend = document.querySelector("#chart-legend");
  const progressChart = document.querySelector("#progress-chart");

  const trackedLifts = [
    { key: "SQ", label: "Squat", color: "#5861d8" },
    { key: "BP", label: "Bench press", color: "#e87853" },
    { key: "DL", label: "Deadlift", color: "#259b83" },
  ];

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
      importButton.disabled = true;
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

  function getLiftKey(exerciseName) {
    // Accept common names and abbreviations so charting does not depend on exact capitalization.
    const name = exerciseName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (["sq", "squat", "squats", "backsquat", "frontsquat"].includes(name)) {
      return "SQ";
    }
    if (["bp", "bench", "benchpress", "barbellbenchpress"].includes(name)) {
      return "BP";
    }
    if (["dl", "deadlift", "sumodeadlift", "conventionaldeadlift"].includes(name)) {
      return "DL";
    }
    return null;
  }

  function createSvgElement(tagName, attributes, text) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function renderProgressChart() {
    const liftDates = new Map();
    for (const entry of entries) {
      const liftKey = getLiftKey(entry.exercise);
      if (!liftKey) {
        continue;
      }

      if (!liftDates.has(entry.date)) {
        liftDates.set(entry.date, new Map());
      }
      const dateLifts = liftDates.get(entry.date);
      dateLifts.set(liftKey, Math.max(dateLifts.get(liftKey) ?? 0, entry.weight));
    }

    const dates = [...liftDates.keys()].sort();
    if (dates.length === 0) {
      chartEmpty.hidden = false;
      chartContainer.hidden = true;
      return;
    }

    // Limit the chart to the 12 latest lifting dates so labels remain readable on a phone.
    const chartDates = dates.slice(-12);
    const maxWeight = Math.max(...chartDates.flatMap((date) => [...liftDates.get(date).values()]));
    const yMaximum = Math.max(25, Math.ceil(maxWeight / 25) * 25);
    const plot = { left: 42, right: 346, top: 16, bottom: 184 };
    const chartWidth = plot.right - plot.left;
    const chartHeight = plot.bottom - plot.top;
    const xForDate = (index) => chartDates.length === 1
      ? plot.left + chartWidth / 2
      : plot.left + (index / (chartDates.length - 1)) * chartWidth;
    const yForWeight = (weight) => plot.bottom - (weight / yMaximum) * chartHeight;

    progressChart.replaceChildren();
    progressChart.append(
      createSvgElement("title", { id: "chart-svg-title" }, "Squat, bench press, and deadlift weight progress"),
      createSvgElement(
        "desc",
        { id: "chart-svg-description" },
        `Highest weight in kilograms per exercise on each date, over the latest ${chartDates.length} lifting dates.`,
      ),
    );

    // Draw four horizontal guides to make it easier to estimate weights from the chart.
    for (let step = 0; step <= 4; step += 1) {
      const weight = (yMaximum / 4) * step;
      const y = yForWeight(weight);
      progressChart.append(
        createSvgElement("line", {
          x1: plot.left,
          y1: y,
          x2: plot.right,
          y2: y,
          class: "chart-grid-line",
        }),
        createSvgElement("text", {
          x: plot.left - 7,
          y: y + 3.5,
          class: "chart-axis-label",
          "text-anchor": "end",
        }, Number.isInteger(weight) ? String(weight) : weight.toFixed(1)),
      );
    }

    const labelIndexes = new Set([0, chartDates.length - 1]);
    if (chartDates.length > 3) {
      labelIndexes.add(Math.round((chartDates.length - 1) / 3));
      labelIndexes.add(Math.round(((chartDates.length - 1) * 2) / 3));
    }
    for (const index of [...labelIndexes].sort((first, second) => first - second)) {
      const [year, month, day] = chartDates[index].split("-").map(Number);
      const dateLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
        .format(new Date(year, month - 1, day));
      progressChart.append(
        createSvgElement("text", {
          x: xForDate(index),
          y: plot.bottom + 22,
          class: "chart-axis-label chart-date-label",
          "text-anchor": index === 0 ? "start" : index === chartDates.length - 1 ? "end" : "middle",
        }, dateLabel),
      );
    }

    chartLegend.replaceChildren();
    for (const lift of trackedLifts) {
      const legendItem = makeElement("span", "legend-item");
      const swatch = makeElement("span", "legend-swatch");
      swatch.style.backgroundColor = lift.color;
      swatch.setAttribute("aria-hidden", "true");
      legendItem.append(swatch, document.createTextNode(`${lift.key} · ${lift.label}`));
      chartLegend.append(legendItem);

      let segment = [];
      const drawSegment = () => {
        if (segment.length > 1) {
          const pathData = segment
            .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
            .join(" ");
          progressChart.append(createSvgElement("path", {
            d: pathData,
            class: "chart-series-line",
            stroke: lift.color,
          }));
        }

        for (const point of segment) {
          const circle = createSvgElement("circle", {
            cx: point.x,
            cy: point.y,
            r: 4.5,
            class: "chart-point",
            fill: lift.color,
          });
          circle.append(createSvgElement(
            "title",
            {},
            `${lift.key} · ${point.dateLabel}: ${point.weight} kg`,
          ));
          progressChart.append(circle);
        }
        segment = [];
      };

      chartDates.forEach((date, index) => {
        const weight = liftDates.get(date).get(lift.key);
        if (weight === undefined) {
          drawSegment();
          return;
        }

        const [year, month, day] = date.split("-").map(Number);
        const dateLabel = new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(new Date(year, month - 1, day));
        segment.push({ x: xForDate(index), y: yForWeight(weight), dateLabel, weight });
      });
      drawSegment();
    }

    chartEmpty.hidden = true;
    chartContainer.hidden = false;
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
    renderProgressChart();
  }

  function createEntryId() {
    // The timestamp plus a random number is enough to identify entries on this device.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function parseCsv(text) {
    // Parse quoted CSV cells so commas and quotes in exercise names survive a backup round-trip.
    const rows = [];
    let row = [];
    let cell = "";
    let insideQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (insideQuotes) {
        if (character === '"' && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (character === '"') {
          insideQuotes = false;
        } else {
          cell += character;
        }
      } else if (character === '"' && cell.length === 0) {
        insideQuotes = true;
      } else if (character === ",") {
        row.push(cell);
        cell = "";
      } else if (character === "\n" || character === "\r") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        if (character === "\r" && text[index + 1] === "\n") {
          index += 1;
        }
      } else {
        if (character === '"') {
          throw new Error(`Unexpected quote on row ${rows.length + 1}.`);
        }
        cell += character;
      }
    }

    if (insideQuotes) {
      throw new Error("The CSV ends inside a quoted field.");
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }

    const nonEmptyRows = rows.filter((csvRow) => csvRow.some((value) => value.trim() !== ""));
    if (nonEmptyRows.length === 0) {
      throw new Error("The CSV file is empty.");
    }

    const expectedHeaders = ["Date", "Exercise", "Weight (kg)", "Reps per set", "Sets"];
    const headers = nonEmptyRows[0].map((header) => header.trim().toLowerCase());
    if (!expectedHeaders.every((header, index) => headers[index] === header.toLowerCase())
      || headers.length !== expectedHeaders.length) {
      throw new Error("This file is not a Workout Log CSV backup.");
    }
    if (nonEmptyRows.length === 1) {
      throw new Error("The CSV contains no workout entries.");
    }

    const importedEntries = [];
    for (const [index, csvRow] of nonEmptyRows.slice(1).entries()) {
      const rowNumber = index + 2;
      if (csvRow.length !== expectedHeaders.length) {
        throw new Error(`Row ${rowNumber} must contain exactly five columns.`);
      }

      const [date, rawExercise, rawWeight, rawReps, rawSets] = csvRow.map((value) => value.trim());
      const exercise = rawExercise;
      const dateParts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const parsedDate = dateParts ? new Date(`${date}T00:00:00Z`) : null;
      const validDate = parsedDate
        && Number.isFinite(parsedDate.getTime())
        && parsedDate.toISOString().slice(0, 10) === date;
      const weight = Number(rawWeight);
      const reps = Number(rawReps);
      const sets = Number(rawSets);
      if (!validDate || !exercise || exercise.length > 60
        || !/^\d+(?:\.\d+)?$/.test(rawWeight) || !Number.isFinite(weight) || weight > 1000
        || !/^\d+$/.test(rawReps) || !Number.isInteger(reps) || reps < 1 || reps > 1000
        || !/^\d+$/.test(rawSets) || !Number.isInteger(sets) || sets < 1 || sets > 100) {
        throw new Error(`Row ${rowNumber} has an invalid date, exercise, weight, reps, or sets value.`);
      }

      importedEntries.push({ date, exercise, weight, reps, sets });
    }
    return importedEntries;
  }

  function mergeImportedEntries(importedEntries) {
    const entryCounts = new Map();
    const entryKey = (entry) => JSON.stringify([
      entry.date,
      entry.exercise,
      entry.weight,
      entry.reps,
      entry.sets,
    ]);

    for (const entry of entries) {
      const key = entryKey(entry);
      entryCounts.set(key, (entryCounts.get(key) ?? 0) + 1);
    }

    const importedCounts = new Map();
    const addedEntries = [];
    for (const entry of importedEntries) {
      const key = entryKey(entry);
      const importedCount = (importedCounts.get(key) ?? 0) + 1;
      importedCounts.set(key, importedCount);
      if (importedCount > (entryCounts.get(key) ?? 0)) {
        addedEntries.push({
          ...entry,
          id: createEntryId(),
          createdAt: new Date().toISOString(),
        });
      }
    }
    return addedEntries;
  }

  async function importCsv() {
    const file = csvInput.files[0];
    if (!file) {
      return;
    }

    let readingFile = true;
    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");
      readingFile = false;
      const importedEntries = parseCsv(text);
      const addedEntries = mergeImportedEntries(importedEntries);
      if (addedEntries.length === 0) {
        setStatus("All workouts in this CSV are already saved on this device.");
      } else if (saveEntries([...addedEntries, ...entries])) {
        setStatus(`Imported ${addedEntries.length} ${addedEntries.length === 1 ? "workout" : "workouts"} from CSV.`);
      }
    } catch (error) {
      if (readingFile) {
        setStatus("Could not read this CSV file. Please try selecting it again.");
        console.error("Could not read the selected workout CSV.", error);
      } else {
        const message = error instanceof Error ? error.message : "Unexpected CSV error.";
        setStatus(`Could not import CSV: ${message}`);
      }
    } finally {
      csvInput.value = "";
    }
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
      setStatus(`${entry.exercise} saved on this device.`);
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
  importButton.addEventListener("click", () => csvInput.click());
  csvInput.addEventListener("change", importCsv);

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
