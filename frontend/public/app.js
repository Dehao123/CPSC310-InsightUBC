// frontend/public/app.js

// If the frontend is opened directly as a file / using another dev server,
// use the full URL. If you later host the frontend on port 4321,
// you can change baseUrl to an empty string "".
const baseUrl = "http://localhost:4321";
let simpleQueryRows = [];
let simpleSortDirection = "DESC"; // Initial: same as backend, sort by avg from high to low
let simpleSortKey = "avgMark";     // Current column being sorted
// Charts for visual insights
let chartAvgByCourse = null;
let chartPassFail = null;
let chartYearTrend = null;

// Metadata for all Section fields (from product manual)
const SECTION_FIELDS = [
	{ id: "uuid", label: "id (uuid)", type: "string" },
	{ id: "id", label: "Course (id)", type: "string" },
	{ id: "title", label: "Title", type: "string" },
	{ id: "instructor", label: "Professor (instructor)", type: "string" },
	{ id: "dept", label: "Subject (dept)", type: "string" },
	{ id: "year", label: "Year", type: "number" },
	{ id: "avg", label: "Avg", type: "number" },
	{ id: "pass", label: "Pass", type: "number" },
	{ id: "fail", label: "Fail", type: "number" },
	{ id: "audit", label: "Audit", type: "number" }
];

const SECTION_STRING_FIELDS = new Set(
	SECTION_FIELDS.filter((f) => f.type === "string").map((f) => f.id)
);
const SECTION_NUMBER_FIELDS = new Set(
	SECTION_FIELDS.filter((f) => f.type === "number").map((f) => f.id)
);

function destroyInsightCharts() {
	if (chartAvgByCourse) {
		chartAvgByCourse.destroy();
		chartAvgByCourse = null;
	}
	if (chartPassFail) {
		chartPassFail.destroy();
		chartPassFail = null;
	}
	if (chartYearTrend) {
		chartYearTrend.destroy();
		chartYearTrend = null;
	}
}

// Choose a "default sort field": prioritize avg, then year, then the first one
function chooseDefaultOrderField(columnKeys) {
	const cols = columnKeys && columnKeys.length
		? columnKeys
		: ["dept", "id", "title", "avg"];

	if (cols.includes("avg")) return "avg";
	if (cols.includes("year")) return "year";
	return cols[0];
}

// ========= Utility Functions =========
function setStatus(id, message, isError = false) {
	const el = document.getElementById(id);
	if (!el) return;
	el.textContent = message || "";
	el.style.color = isError ? "#c62828" : "#555";
}

function renderAdvancedQueryTable(containerId, rows) {
	const container = document.getElementById(containerId);
	container.innerHTML = "";

	if (!rows || rows.length === 0) {
		container.textContent = "No results.";
		return;
	}

	const table = document.createElement("table");
	const thead = document.createElement("thead");
	const tbody = document.createElement("tbody");

	const keys = Object.keys(rows[0]);

	// Table header
	const headerRow = document.createElement("tr");
	keys.forEach((key) => {
		const th = document.createElement("th");
		th.textContent = key;
		headerRow.appendChild(th);
	});
	thead.appendChild(headerRow);

	// Data rows
	rows.forEach((row) => {
		const tr = document.createElement("tr");
		keys.forEach((key) => {
			const td = document.createElement("td");
			td.textContent = row[key];
			tr.appendChild(td);
		});
		tbody.appendChild(tr);
	});

	table.appendChild(thead);
	table.appendChild(tbody);
	container.appendChild(table);
}


// ========= Simple query table rendering (with clickable sortable columns) =========
function renderSimpleQueryTable(containerId, rows) {
	const container = document.getElementById("query-table-container");
	container.innerHTML = "";

	if (!rows || rows.length === 0) {
		container.textContent = "No results.";
		return;
	}

	// Get Top N setting
	const topN = parseInt(document.getElementById("simple-top-n").value, 10) || 5;

	const table = document.createElement("table");
	const thead = document.createElement("thead");
	const tbody = document.createElement("tbody");

	const keys = Object.keys(rows[0]);

	// Which columns are sortable: sections_id / avgMark
	const sortableKeys = new Set(keys);

	// Table header
	const headerRow = document.createElement("tr");
	keys.forEach((key) => {
		const th = document.createElement("th");

		if (sortableKeys.has(key)) {
			th.classList.add("sortable");
			th.dataset.key = key;

			const labelSpan = document.createElement("span");
			labelSpan.textContent = key;

			const arrowSpan = document.createElement("span");
			arrowSpan.className = "sort-arrow";

			// If currently sorting by this column, show ▲ / ▼, otherwise show a faint double arrow
			if (key === simpleSortKey) {
				arrowSpan.textContent =
					simpleSortDirection === "ASC" ? "▲" : "▼";
			} else {
				arrowSpan.textContent = "↕";
				arrowSpan.style.opacity = "0.4";
			}

			th.appendChild(labelSpan);
			th.appendChild(arrowSpan);

			// Click to toggle sort
			th.addEventListener("click", () => {
				if (simpleSortKey === key) {
					// Click same column again → flip direction
					simpleSortDirection =
						simpleSortDirection === "ASC" ? "DESC" : "ASC";
				} else {
					// Switch to another column → default ascending (you can change to descending if preferred)
					simpleSortKey = key;
					simpleSortDirection = "ASC";
				}

				// ⭐ Key modification: sort full data
				simpleQueryRows.sort((a, b) => {
					const av = Number(a[simpleSortKey]);
					const bv = Number(b[simpleSortKey]);

					// Prioritize numeric sorting, fall back to string sorting if not numeric
					if (!Number.isNaN(av) && !Number.isNaN(bv)) {
						return simpleSortDirection === "ASC"
							? av - bv
							: bv - av;
					} else {
						const as = String(a[simpleSortKey]);
						const bs = String(b[simpleSortKey]);
						return simpleSortDirection === "ASC"
							? as.localeCompare(bs)
							: bs.localeCompare(as);
					}
				});
				// ⭐ After sorting, only take the first N rows to display
				const displayRows = simpleQueryRows.slice(0, topN);

				// Update status message
				setStatus("query-status", `Query success. Showing ${displayRows.length} of ${simpleQueryRows.length} row(s).`);
				// Re-render with new order
				renderSimpleQueryTable(containerId, displayRows);
			});
		} else {
			th.textContent = key;
		}

		headerRow.appendChild(th);
	});
	thead.appendChild(headerRow);

	// Data rows
	rows.forEach((row) => {
		const tr = document.createElement("tr");
		keys.forEach((key) => {
			const td = document.createElement("td");
			td.textContent = row[key];
			tr.appendChild(td);
		});
		tbody.appendChild(tr);
	});

	table.appendChild(thead);
	table.appendChild(tbody);
	container.appendChild(table);
}

function updateInsightCharts(rows, datasetId) {
	const statusEl = document.getElementById("insights-status");
	if (!statusEl) {
		return;
	}

	destroyInsightCharts();

	if (!rows || rows.length === 0) {
		statusEl.textContent = "No data to draw insights. Run a query first.";
		destroyInsightCharts();
		return;
	}

	if (typeof Chart === "undefined") {
		console.warn("Chart.js not loaded; cannot render charts.");
		statusEl.textContent = "Chart library not loaded.";
		return;
	}

	const prefix = `${datasetId}_`;
	statusEl.textContent = `Showing visual insights for dataset "${datasetId}" (current query result).`;

	// ========= Chart 1: Top courses by average grade =========
	const rowsWithAvg = rows
		.map((r) => {
			const avgVal = Number(r[`${prefix}avg`]);
			return {
				row: r,
				avg: avgVal
			};
		})
		.filter((x) => !Number.isNaN(x.avg));

	if (rowsWithAvg.length > 0) {
		const sorted = rowsWithAvg.sort((a, b) => b.avg - a.avg);
		const top = sorted.slice(0, 10);

		const labels = top.map((x) => {
			const dept = x.row[`${prefix}dept`] || "";
			const id = x.row[`${prefix}id`] || "";
			const uuid = x.row[`${prefix}uuid`] || "";
			const label = `${dept} ${id}`.trim();
			return label || uuid || "N/A";
		});
		const data = top.map((x) => x.avg);

		const canvas1 = document.getElementById("chart-avg-by-course");
		if (canvas1) {
			const ctx1 = canvas1.getContext("2d");
			if (chartAvgByCourse) chartAvgByCourse.destroy();
			chartAvgByCourse = new Chart(ctx1, {
				type: "bar",
				data: {
					labels,
					datasets: [
						{
							label: "Average grade",
							data
						}
					]
				},
				options: {
					responsive: false,
					animation: false,
					plugins: {
						legend: { display: true }
					},
					scales: {
						y: {
							beginAtZero: true,
							title: { display: true, text: "Avg" }
						},
						x: {
							ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 }
						}
					}
				}
			});
		}
	} else {
		// 没有 avg 列时，清理图表
		if (chartAvgByCourse) {
			chartAvgByCourse.destroy();
			chartAvgByCourse = null;
		}
	}

	// ========= Chart 2: Pass vs Fail vs Audit (total students) =========
	let passSum = 0;
	let failSum = 0;
	let auditSum = 0;

	rows.forEach((r) => {
		const pVal = Number(r[`${prefix}pass`]);
		const fVal = Number(r[`${prefix}fail`]);
		const aVal = Number(r[`${prefix}audit`]);
		if (!Number.isNaN(pVal)) passSum += pVal;
		if (!Number.isNaN(fVal)) failSum += fVal;
		if (!Number.isNaN(aVal)) auditSum += aVal;
	});

	if (passSum + failSum + auditSum > 0) {
		const canvas2 = document.getElementById("chart-pass-fail");
		if (canvas2) {
			const ctx2 = canvas2.getContext("2d");
			if (chartPassFail) chartPassFail.destroy();
			chartPassFail = new Chart(ctx2, {
				type: "doughnut",
				data: {
					labels: ["Pass", "Fail", "Audit"],
					datasets: [
						{
							data: [passSum, failSum, auditSum]
						}
					]
				},
				options: {
					responsive: false,
					animation: false,
					plugins: {
						legend: {
							position: "bottom"
						}
					}
				}
			});
		}
	} else {
		if (chartPassFail) {
			chartPassFail.destroy();
			chartPassFail = null;
		}
	}

	// ========= Chart 3: Average grade by year =========
	const yearMap = new Map(); // year -> { sum, count }

	rows.forEach((r) => {
		const y = Number(r[`${prefix}year`]);
		const a = Number(r[`${prefix}avg`]);
		if (!Number.isNaN(y) && !Number.isNaN(a)) {
			if (!yearMap.has(y)) {
				yearMap.set(y, { sum: 0, count: 0 });
			}
			const obj = yearMap.get(y);
			obj.sum += a;
			obj.count += 1;
		}
	});

	if (yearMap.size > 0) {
		const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
		const avgByYear = years.map((y) => {
			const info = yearMap.get(y);
			return info.sum / info.count;
		});

		const canvas3 = document.getElementById("chart-year-avg");
		if (canvas3) {
			const ctx3 = canvas3.getContext("2d");
			if (chartYearTrend) chartYearTrend.destroy();
			chartYearTrend = new Chart(ctx3, {
				type: "line",
				data: {
					labels: years,
					datasets: [
						{
							label: "Average grade",
							data: avgByYear,
							tension: 0.2
						}
					]
				},
				options: {
					responsive: false,
					animation: false,
					plugins: {
						legend: { display: true }
					},
					scales: {
						x: {
							title: { display: true, text: "Year" }
						},
						y: {
							beginAtZero: true,
							title: { display: true, text: "Avg" }
						}
					}
				}
			});
		}
	} else {
		if (chartYearTrend) {
			chartYearTrend.destroy();
			chartYearTrend = null;
		}
	}
}


function updateDatasetDropdowns(datasets) {
	const removeSelect = document.getElementById("remove-dataset-select");
	const querySelect = document.getElementById("query-dataset-select");
	if (!removeSelect || !querySelect) {
		return;
	}

	const selects = [removeSelect, querySelect];

	selects.forEach((sel) => {
		const previous = sel.value; // Remember previously selected id
		sel.innerHTML = "";

		const placeholder = document.createElement("option");
		placeholder.value = "";
		placeholder.disabled = datasets.length > 0;
		placeholder.selected = true;
		placeholder.textContent = datasets.length > 0
			? "-- Select dataset --"
			: "No datasets";
		sel.appendChild(placeholder);

		datasets.forEach((ds) => {
			const opt = document.createElement("option");
			opt.value = ds.id;
			opt.textContent = `${ds.id} (${ds.kind}, ${ds.numRows} rows)`;
			if (ds.id === previous) {
				placeholder.selected = false;
				opt.selected = true;
			}
			sel.appendChild(opt);
		});
	});
}


// ========= 1. Upload dataset =========
async function uploadDataset() {
	const idInput = document.getElementById("upload-dataset-id");
	const fileInput = document.getElementById("upload-dataset-file");
	const id = (idInput.value || "").trim() || "sections";
	const file = fileInput.files[0];

	if (!file) {
		setStatus("upload-status", "Please choose a .zip file.", true);
		return;
	}

	setStatus("upload-status", "Uploading...");
	document.getElementById("upload-btn").disabled = true;

	try {
		const arrayBuffer = await file.arrayBuffer();

		const res = await fetch(`${baseUrl}/api/v1/datasets/${encodeURIComponent(id)}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/x-zip-compressed"
			},
			body: arrayBuffer
		});

		const json = await res.json().catch(() => ({}));

		if (res.ok) {
			setStatus("upload-status", `Upload success. Datasets: ${JSON.stringify(json.result)}`);
			// After successful upload, automatically refresh List Datasets
			await listDatasets();
		} else {
			setStatus(
				"upload-status",
				`Upload failed: ${json.error || res.statusText}`,
				true
			);
		}
	} catch (e) {
		console.error(e);
		setStatus("upload-status", "Network error while uploading dataset.", true);
	} finally {
		document.getElementById("upload-btn").disabled = false;
	}
}

// ========= 2. List datasets =========
async function listDatasets() {
	setStatus("list-status", "Loading...");
	try {
		const res = await fetch(`${baseUrl}/api/v1/datasets`);
		const json = await res.json().catch(() => ({}));

		if (res.ok) {
			setStatus("list-status", `Loaded ${json.result?.length || 0} dataset(s).`);
			const datasets = json.result || [];
			renderAdvancedQueryTable("datasets-table-container", datasets);

			//  Update both dropdown menus with new data
			updateDatasetDropdowns(datasets);
		} else {
			setStatus("list-status", `Error: ${json.error || res.statusText}`, true);
		}
	} catch (e) {
		console.error(e);
		setStatus("list-status", "Network error while listing datasets.", true);
	}
}

// ========= 3. Remove dataset =========
async function removeDataset() {
	const select = document.getElementById("remove-dataset-select");

	// Get value from dropdown (pure id, e.g., "333")
	const id = (select && select.value) ? select.value.trim() : "";

	if (!id) {
		setStatus("remove-status", "Please choose a dataset to remove.", true);
		return;
	}

	setStatus("remove-status", "Removing...");
	try {
		const res = await fetch(
			`${baseUrl}/api/v1/datasets/${encodeURIComponent(id)}`,
			{ method: "DELETE" }
		);

		const json = await res.json().catch(() => ({}));

		if (res.ok) {
			setStatus("remove-status", `Removed dataset: ${json.result}`);
			await listDatasets(); // After successful removal, refresh list and dropdown menus
		} else {
			setStatus(
				"remove-status",
				`Error: ${json.error || res.statusText}`,
				true
			);
		}
	} catch (e) {
		console.error(e);
		setStatus("remove-status", "Network error while removing dataset.", true);
	}
}


// ========= 4. Query (Simple / Advanced) =========

// Simple: single field filter, returns original section rows, sorted by a suitable numeric field in descending order
function buildSimpleQuery(datasetId, fieldKey, fieldValue, columnKeys) {
	const p = `${datasetId}_`;

	// 1. WHERE: choose IS / EQ based on field type
	let where = {};
	if (fieldKey && fieldValue !== "") {
		const fullKey = `${p}${fieldKey}`;

		if (SECTION_STRING_FIELDS.has(fieldKey)) {
			// String → wildcard match *value*
			const pattern = fieldValue.includes("*")
				? fieldValue
				: `*${fieldValue}*`;
			where = { IS: { [fullKey]: pattern } };
		} else if (SECTION_NUMBER_FIELDS.has(fieldKey)) {
			const num = Number(fieldValue);
			if (Number.isNaN(num)) {
				throw new Error("Numeric field requires a number value.");
			}
			where = { EQ: { [fullKey]: num } };
		}
	}

	// 2. COLUMNS: based on user selection
	const cols =
		columnKeys && columnKeys.length
			? columnKeys
			: ["dept", "id", "title", "avg"];
	const columns = cols.map((c) => `${p}${c}`);

	// 3. ORDER: default field (avg → year → first)
	const orderField = chooseDefaultOrderField(cols);
	const orderKeyFull = `${p}${orderField}`;
	if (!columns.includes(orderKeyFull)) {
		columns.push(orderKeyFull);
	}

	return {
		WHERE: where,
		OPTIONS: {
			COLUMNS: columns,
			ORDER: {
				dir: "DOWN",
				keys: [orderKeyFull]
			}
		}
	};
}


// Advanced: combine multiple conditions (dept / instructor / year range / minPass / minAvg)
// Returns original section rows, no TRANSFORMATIONS
function buildAdvancedQuery(datasetId, options) {
	const p = `${datasetId}_`;
	const filters = [];

	if (options.dept) {
		filters.push({ IS: { [`${p}dept`]: options.dept } });
	}

	if (options.instructor) {
		const pattern = options.instructor.includes("*")
			? options.instructor
			: `*${options.instructor}*`;
		filters.push({ IS: { [`${p}instructor`]: pattern } });
	}

	if (typeof options.yearMin === "number" && !Number.isNaN(options.yearMin)) {
		// year >= yearMin  → year > (yearMin - 1)
		filters.push({ GT: { [`${p}year`]: options.yearMin - 1 } });
	}

	if (typeof options.yearMax === "number" && !Number.isNaN(options.yearMax)) {
		// year <= yearMax → year < (yearMax + 1)
		filters.push({ LT: { [`${p}year`]: options.yearMax + 1 } });
	}

	if (typeof options.minPass === "number" && !Number.isNaN(options.minPass)) {
		filters.push({ GT: { [`${p}pass`]: options.minPass } });
	}

	if (typeof options.minAvg === "number" && !Number.isNaN(options.minAvg)) {
		filters.push({ GT: { [`${p}avg`]: options.minAvg } });
	}

	let where;
	if (filters.length === 0) {
		where = {}; // No conditions → all sections
	} else if (filters.length === 1) {
		where = filters[0];
	} else {
		where = { AND: filters };
	}

	// COLUMNS: based on user selection
	const cols =
		options.columns && options.columns.length
			? options.columns
			: ["uuid", "dept", "id", "title", "instructor", "year", "avg"];

	const columns = cols.map((c) => `${p}${c}`);

	// ORDER: use field selected in UI
	const orderField = options.orderKey || "avg";
	const orderDir = options.orderDir || "DOWN";
	const orderKeyFull = `${p}${orderField}`;
	if (!columns.includes(orderKeyFull)) {
		columns.push(orderKeyFull);
	}

	return {
		WHERE: where,
		OPTIONS: {
			COLUMNS: columns,
			ORDER: { dir: orderDir, keys: [orderKeyFull] }
		}
	};
}


let currentQueryMode = "simple";

function switchQueryMode(mode) {
	currentQueryMode = mode;

	const simplePanel = document.getElementById("simple-query-panel");
	const advPanel = document.getElementById("advanced-query-panel");
	const simpleBtn = document.getElementById("simple-query-btn");
	const advBtn = document.getElementById("advanced-query-btn");

	if (!simplePanel || !advPanel || !simpleBtn || !advBtn) {
		return;
	}

	if (mode === "simple") {
		simplePanel.style.display = "block";
		advPanel.style.display = "none";
		simpleBtn.classList.add("active");
		advBtn.classList.remove("active");
	} else {
		simplePanel.style.display = "none";
		advPanel.style.display = "block";
		simpleBtn.classList.remove("active");
		advBtn.classList.add("active");
	}
}

async function runQuery() {
	const dsSelect = document.getElementById("query-dataset-select");
	const datasetId = (dsSelect && dsSelect.value) ? dsSelect.value.trim() : "";

	if (!datasetId) {
		setStatus("query-status", "Please select a dataset id.", true);
		return;
	}

	let query;
	let topN = undefined; // Used in simple mode

	try {
		if (currentQueryMode === "simple") {
			const fieldKey = document.getElementById("simple-field").value;
			const fieldValue = (document.getElementById("simple-value").value || "").trim();
			topN = parseInt(
				document.getElementById("simple-top-n").value,
				10
			) || 5;

			if (!fieldKey || !fieldValue) {
				setStatus(
					"query-status",
					"Simple Query: please select a field and enter a value.",
					true
				);
				return;
			}

			// Collect simple column selections
			const colCheckboxes = document.querySelectorAll(
				"#simple-columns input[type='checkbox']"
			);
			const selectedColumns = Array.from(colCheckboxes)
				.filter((cb) => cb.checked)
				.map((cb) => cb.value);

			if (!selectedColumns.length) {
				setStatus(
					"query-status",
					"Simple Query: please choose at least one column to display.",
					true
				);
				return;
			}

			query = buildSimpleQuery(datasetId, fieldKey, fieldValue, selectedColumns);

			// Remember default sort key for frontend table (must match buildSimpleQuery logic)
			const orderField = chooseDefaultOrderField(selectedColumns);
			simpleSortKey = `${datasetId}_${orderField}`;
			simpleSortDirection = "DESC";

		} else {
			// === Advanced branch ===
			const dept = (document.getElementById("adv-dept").value || "").trim();
			const instructor = (document.getElementById("adv-instructor").value || "").trim();

			const yearMinStr = document.getElementById("adv-year-min").value;
			const yearMaxStr = document.getElementById("adv-year-max").value;
			const minPassStr = document.getElementById("adv-min-pass").value;
			const minAvgStr = document.getElementById("adv-min-avg").value;

			const yearMin = yearMinStr === "" ? undefined : Number(yearMinStr);
			const yearMax = yearMaxStr === "" ? undefined : Number(yearMaxStr);
			const minPass = minPassStr === "" ? undefined : Number(minPassStr);
			const minAvg = minAvgStr === "" ? undefined : Number(minAvgStr);

			// Number validation
			if (
				(yearMinStr !== "" && Number.isNaN(yearMin)) ||
				(yearMaxStr !== "" && Number.isNaN(yearMax)) ||
				(minPassStr !== "" && Number.isNaN(minPass)) ||
				(minAvgStr !== "" && Number.isNaN(minAvg))
			) {
				setStatus(
					"query-status",
					"Advanced Query: year / pass / avg must be numbers.",
					true
				);
				return;
			}

			// Collect column selections
			const colCheckboxes = document.querySelectorAll(
				"#adv-columns input[type='checkbox']"
			);
			const selectedCols = Array.from(colCheckboxes)
				.filter((cb) => cb.checked)
				.map((cb) => cb.value);

			if (!selectedCols.length) {
				setStatus(
					"query-status",
					"Advanced Query: please select at least one column to display.",
					true
				);
				return;
			}

			// Sort selection (if dropdown doesn't exist, use default avg / DOWN)
			let orderKey = "avg";
			let orderDir = "DOWN";

			const orderKeyEl = document.getElementById("adv-order-key");
			const orderDirEl = document.getElementById("adv-order-dir");

			if (orderKeyEl && orderKeyEl.value) {
				orderKey = orderKeyEl.value;
			}
			if (orderDirEl && orderDirEl.value) {
				orderDir = orderDirEl.value;
			}

			// Build advanced query
			query = buildAdvancedQuery(datasetId, {
				dept,
				instructor,
				yearMin,
				yearMax,
				minPass,
				minAvg,
				columns: selectedCols,
				orderKey,
				orderDir
			});

		}
	} catch (e) {
		console.error(e);
		setStatus("query-status", "Error while building query object.", true);
		return;
	}

	setStatus("query-status", "Running query...");
	document.getElementById("run-query-btn").disabled = true;

	try {
		const res = await fetch(`${baseUrl}/api/v1/query`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(query)
		});

		const json = await res.json().catch(() => ({}));


		if (res.ok) {
			let allRows = json.result || [];

			// ⭐ Key modification: in Simple mode
			if (currentQueryMode === "simple") {
				// 1. First save full data to global variable
				simpleQueryRows = allRows.slice();

				// 2. Reset sort state
				const orderField = chooseDefaultOrderField(
					Array.from(document.querySelectorAll("#simple-columns input[type='checkbox']"))
						.filter(cb => cb.checked)
						.map(cb => cb.value)
				);
				simpleSortKey = `${datasetId}_${orderField}`;
				simpleSortDirection = "DESC";

				// 3. Only take first N rows for display
				const displayRows = typeof topN === "number" && allRows.length > topN
					? allRows.slice(0, topN)
					: allRows;

				setStatus("query-status", `Query success. Showing ${displayRows.length} of ${allRows.length} row(s).`);
				renderSimpleQueryTable("query-table-container", displayRows);
			} else {
				setStatus("query-status", `Query success. ${allRows.length} row(s).`);
				renderAdvancedQueryTable("query-table-container", allRows);
			}
			updateInsightCharts(allRows, datasetId);

		} else {
			setStatus("query-status", `Query failed: ${json.error || res.statusText}`, true);
			destroyInsightCharts();
			const statusEl = document.getElementById("insights-status");
			if (statusEl) {
				statusEl.textContent = "Query failed; no insights to show.";
			}
		}
	} catch (e) {
		console.error(e);
		setStatus("query-status", "Network error while performing query.", true);
	} finally {
		document.getElementById("run-query-btn").disabled = false;
	}
}


// ========= Event Bindings =========
window.addEventListener("DOMContentLoaded", () => {
	document.getElementById("upload-btn").addEventListener("click", uploadDataset);
	document.getElementById("list-btn").addEventListener("click", listDatasets);
	document.getElementById("remove-btn").addEventListener("click", removeDataset);
	document.getElementById("run-query-btn").addEventListener("click", runQuery);

	// Update file name display when file is selected
	const fileInput = document.getElementById("upload-dataset-file");
	const fileNameDisplay = document.getElementById("upload-file-name");
	if (fileInput && fileNameDisplay) {
		fileInput.addEventListener("change", (e) => {
			const file = e.target.files[0];
			if (file) {
				fileNameDisplay.textContent = `Selected: ${file.name}`;
			} else {
				fileNameDisplay.textContent = "No file chosen";
			}
		});
	}

	// Mode toggle buttons
	const simpleBtn = document.getElementById("simple-query-btn");
	const advBtn = document.getElementById("advanced-query-btn");
	if (simpleBtn && advBtn) {
		simpleBtn.addEventListener("click", () => switchQueryMode("simple"));
		advBtn.addEventListener("click", () => switchQueryMode("advanced"));
		// Default to simple query
		switchQueryMode("simple");
	}


	// Automatically refresh dataset list once when page loads
	listDatasets().catch(() => {});
});
