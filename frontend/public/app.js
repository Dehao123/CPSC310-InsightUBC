// frontend/public/app.js

// 如果前端是直接用文件打开 / 用另一个 dev server，
// 就走完整 URL。如果你以后把前端也挂在 4321 端口下，
// 可以把 baseUrl 改成空字符串 ""。
const baseUrl = "http://localhost:4321";
let simpleQueryRows = [];
let simpleSortDirection = "DESC"; // 初始和后端一样：按 avg 从高到低
let simpleSortKey = "avgMark";     // 当前按哪一列排序

// Sections 所有字段的元数据（来自产品手册）
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

// 选择一个“默认排序字段”：优先 avg，其次 year，再其次第一个
function chooseDefaultOrderField(columnKeys) {
	const cols = columnKeys && columnKeys.length
		? columnKeys
		: ["dept", "id", "title", "avg"];

	if (cols.includes("avg")) return "avg";
	if (cols.includes("year")) return "year";
	return cols[0];
}

// ========= 工具函数 =========
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

	// 表头
	const headerRow = document.createElement("tr");
	keys.forEach((key) => {
		const th = document.createElement("th");
		th.textContent = key;
		headerRow.appendChild(th);
	});
	thead.appendChild(headerRow);

	// 数据
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


// ========= simple query 专用表格渲染（带可点击排序列） =========
function renderSimpleQueryTable(containerId, rows) {
	const container = document.getElementById("query-table-container");
	container.innerHTML = "";

	if (!rows || rows.length === 0) {
		container.textContent = "No results.";
		return;
	}

// 获取 Top N 设置
	const topN = parseInt(document.getElementById("simple-top-n").value, 10) || 5;

	const table = document.createElement("table");
	const thead = document.createElement("thead");
	const tbody = document.createElement("tbody");

	const keys = Object.keys(rows[0]);

	// 哪些列可排序：sections_id / avgMark
	const sortableKeys = new Set(keys);

	// 表头
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

			// 当前正在按哪一列排，就显示 ▲ / ▼，否则用一个淡淡的双箭头
			if (key === simpleSortKey) {
				arrowSpan.textContent =
					simpleSortDirection === "ASC" ? "▲" : "▼";
			} else {
				arrowSpan.textContent = "↕";
				arrowSpan.style.opacity = "0.4";
			}

			th.appendChild(labelSpan);
			th.appendChild(arrowSpan);

			// 点击切换排序
			th.addEventListener("click", () => {
				if (simpleSortKey === key) {
					// 再点同一列 → 翻转方向
					simpleSortDirection =
						simpleSortDirection === "ASC" ? "DESC" : "ASC";
				} else {
					// 换到另一列 → 默认升序（你想默认降序也可以）
					simpleSortKey = key;
					simpleSortDirection = "ASC";
				}

				// ⭐ 关键修改：对完整数据排序
				simpleQueryRows.sort((a, b) => {
					const av = Number(a[simpleSortKey]);
					const bv = Number(b[simpleSortKey]);

					// 优先按数字排，如果不是数字再按字符串排
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
				// ⭐ 排序后只取前 N 行显示
				const displayRows = simpleQueryRows.slice(0, topN);

				// 更新状态信息
				setStatus("query-status", `Query success. Showing ${displayRows.length} of ${simpleQueryRows.length} row(s).`);
				// 用新的顺序重新渲染
				renderSimpleQueryTable(containerId, displayRows);
			});
		} else {
			th.textContent = key;
		}

		headerRow.appendChild(th);
	});
	thead.appendChild(headerRow);

	// 数据
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


function updateDatasetDropdowns(datasets) {
	const removeSelect = document.getElementById("remove-dataset-select");
	const querySelect = document.getElementById("query-dataset-select");
	if (!removeSelect || !querySelect) {
		return;
	}

	const selects = [removeSelect, querySelect];

	selects.forEach((sel) => {
		const previous = sel.value; // 记住之前选中的 id
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


// ========= 1. 上传 dataset =========
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
			// ✅ 上传成功后，自动刷新 List Datasets
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

// ========= 2. 列出 datasets =========
async function listDatasets() {
	setStatus("list-status", "Loading...");
	try {
		const res = await fetch(`${baseUrl}/api/v1/datasets`);
		const json = await res.json().catch(() => ({}));

		if (res.ok) {
			setStatus("list-status", `Loaded ${json.result?.length || 0} dataset(s).`);
			const datasets = json.result || [];
			renderAdvancedQueryTable("datasets-table-container", datasets);

			// ✅ 用新的数据更新两个下拉菜单
			updateDatasetDropdowns(datasets);
		} else {
			setStatus("list-status", `Error: ${json.error || res.statusText}`, true);
		}
	} catch (e) {
		console.error(e);
		setStatus("list-status", "Network error while listing datasets.", true);
	}
}

// ========= 3. 删除 dataset =========
async function removeDataset() {
	const select = document.getElementById("remove-dataset-select");

	// 从下拉框里拿 value（就是纯 id，比如 "333"）
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
			await listDatasets(); // ✅ 删除成功后刷新列表和下拉菜单
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


// ========= 4. 查询（Simple / Advanced） =========

// Simple：单字段过滤，返回原始 section 行，按一个合适的数值字段降序排序
function buildSimpleQuery(datasetId, fieldKey, fieldValue, columnKeys) {
	const p = `${datasetId}_`;

	// 1. WHERE：根据字段类型选择 IS / EQ
	let where = {};
	if (fieldKey && fieldValue !== "") {
		const fullKey = `${p}${fieldKey}`;

		if (SECTION_STRING_FIELDS.has(fieldKey)) {
			// 字符串 → 模糊匹配 *value*
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

	// 2. COLUMNS：根据用户勾选
	const cols =
		columnKeys && columnKeys.length
			? columnKeys
			: ["dept", "id", "title", "avg"];
	const columns = cols.map((c) => `${p}${c}`);

	// 3. ORDER：默认字段（avg → year → 第一个）
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


// Advanced：组合多个条件（dept / instructor / year range / minPass / minAvg）
// 返回原始 section 行，不做 TRANSFORMATIONS
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
		where = {}; // 无条件 → 全部 section
	} else if (filters.length === 1) {
		where = filters[0];
	} else {
		where = { AND: filters };
	}

	// COLUMNS：根据用户勾选
	const cols =
		options.columns && options.columns.length
			? options.columns
			: ["uuid", "dept", "id", "title", "instructor", "year", "avg"];

	const columns = cols.map((c) => `${p}${c}`);

	// ORDER：用 UI 里选的字段
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
	let topN = undefined; // simple 模式下会用到

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

			// 收集 simple 列选择
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

			// 为前端表格记住默认排序 key（要和 buildSimpleQuery 的逻辑一致）
			const orderField = chooseDefaultOrderField(selectedColumns);
			simpleSortKey = `${datasetId}_${orderField}`;
			simpleSortDirection = "DESC";

		} else {
			// === Advanced 分支 ===
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

			// 数字校验
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

			// 收集列选择
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

			// 排序选择（如果下拉框不存在，就用默认 avg / DOWN）
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

// 构建高级查询
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

		document.getElementById("query-json-output").textContent =
			JSON.stringify(json, null, 2);

		if (res.ok) {
			let allRows = json.result || [];

			// ⭐ 关键修改：在 Simple 模式下
			if (currentQueryMode === "simple") {
				// 1. 先保存完整数据到全局变量
				simpleQueryRows = allRows.slice();

				// 2. 重置排序状态
				const orderField = chooseDefaultOrderField(
					Array.from(document.querySelectorAll("#simple-columns input[type='checkbox']"))
						.filter(cb => cb.checked)
						.map(cb => cb.value)
				);
				simpleSortKey = `${datasetId}_${orderField}`;
				simpleSortDirection = "DESC";

				// 3. 只截取前 N 行用于显示
				const displayRows = typeof topN === "number" && allRows.length > topN
					? allRows.slice(0, topN)
					: allRows;

				setStatus("query-status", `Query success. Showing ${displayRows.length} of ${allRows.length} row(s).`);
				renderSimpleQueryTable("query-table-container", displayRows);
			} else {
				setStatus("query-status", `Query success. ${allRows.length} row(s).`);
				renderAdvancedQueryTable("query-table-container", allRows);
			}
		} else {
			setStatus("query-status", `Query failed: ${json.error || res.statusText}`, true);
		}
	} catch (e) {
		console.error(e);
		setStatus("query-status", "Network error while performing query.", true);
	} finally {
		document.getElementById("run-query-btn").disabled = false;
	}
}


// ========= 事件绑定 =========
window.addEventListener("DOMContentLoaded", () => {
	document.getElementById("upload-btn").addEventListener("click", uploadDataset);
	document.getElementById("list-btn").addEventListener("click", listDatasets);
	document.getElementById("remove-btn").addEventListener("click", removeDataset);
	document.getElementById("run-query-btn").addEventListener("click", runQuery);

	// 模式切换按钮
	const simpleBtn = document.getElementById("simple-query-btn");
	const advBtn = document.getElementById("advanced-query-btn");
	if (simpleBtn && advBtn) {
		simpleBtn.addEventListener("click", () => switchQueryMode("simple"));
		advBtn.addEventListener("click", () => switchQueryMode("advanced"));
		// 默认简单查询
		switchQueryMode("simple");
	}


	// 页面加载时自动刷新一次 dataset 列表
	listDatasets().catch(() => {});
});
