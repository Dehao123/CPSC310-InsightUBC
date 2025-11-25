// frontend/public/app.js

// 如果前端是直接用文件打开 / 用另一个 dev server，
// 就走完整 URL。如果你以后把前端也挂在 4321 端口下，
// 可以把 baseUrl 改成空字符串 ""。
const baseUrl = "http://localhost:4321";
let simpleQueryRows = [];
let simpleSortDirection = "DESC"; // 初始和后端一样：按 avg 从高到低
let simpleSortKey = "avgMark";     // 当前按哪一列排序

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
	const container = document.getElementById(containerId);
	container.innerHTML = "";

	if (!rows || rows.length === 0) {
		container.textContent = "No results.";
		simpleQueryRows = [];
		return;
	}

	// 存一份全局，方便排序后再次渲染
	simpleQueryRows = rows.slice();

	const table = document.createElement("table");
	const thead = document.createElement("thead");
	const tbody = document.createElement("tbody");

	const keys = Object.keys(rows[0]);

	// 哪些列可排序：sections_id / avgMark
	const sortableKeys = new Set(["sections_id", "avgMark"]);

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

				// 用新的顺序重新渲染
				renderSimpleQueryTable(containerId, simpleQueryRows);
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

// Simple：某院系 → 按课程号聚合平均分，按 avg 从高到低排
function buildSimpleQuery(datasetId, dept) {
	const p = `${datasetId}_`;
	return {
		WHERE: {
			IS: { [`${p}dept`]: dept }
		},
		OPTIONS: {
			COLUMNS: [`${p}dept`, `${p}id`, `${p}title`, "avgMark"],
			ORDER: { dir: "DOWN", keys: ["avgMark"] }
		},
		TRANSFORMATIONS: {
			GROUP: [`${p}dept`, `${p}id`, `${p}title`],
			APPLY: [
				{
					avgMark: { AVG: `${p}avg` }
				}
			]
		}
	};
}

// Advanced：指定院系 + 最小 pass + 最小 avg
// （用 pass 大致代表“上课人数”）
function buildAdvancedQuery(datasetId, dept, minPass, minAvg) {
	const p = `${datasetId}_`;
	return {
		WHERE: {
			AND: [
				{ IS: { [`${p}dept`]: dept } },
				{ GT: { [`${p}pass`]: minPass } },
				{ GT: { [`${p}avg`]: minAvg } }
			]
		},
		OPTIONS: {
			COLUMNS: [
				`${p}dept`,
				`${p}id`,
				`${p}title`,
				`${p}instructor`,
				`${p}pass`,
				`${p}avg`
			],
			ORDER: { dir: "DOWN", keys: [`${p}avg`] }
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
			const dept = (document.getElementById("simple-dept").value || "").trim();
			topN = parseInt(
				document.getElementById("simple-top-n").value,
				10
			) || 5;

			if (!dept) {
				setStatus("query-status", "Simple Query: please enter dept (e.g., cpsc).", true);
				return;
			}

			query = buildSimpleQuery(datasetId, dept);
		} else {
			const dept = (document.getElementById("adv-dept").value || "").trim();
			const minPassStr = document.getElementById("adv-min-pass").value;
			const minAvgStr = document.getElementById("adv-min-avg").value;
			const minPass = Number(minPassStr);
			const minAvg = Number(minAvgStr);

			if (!dept || Number.isNaN(minPass) || Number.isNaN(minAvg)) {
				setStatus(
					"query-status",
					"Advanced Query: please enter dept, min pass, and min avg.",
					true
				);
				return;
			}

			query = buildAdvancedQuery(datasetId, dept, minPass, minAvg);
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
			let rows = json.result || [];

			// Simple 模式可以只展示前 N 行
			if (currentQueryMode === "simple" && typeof topN === "number" && rows.length > topN) {
				rows = rows.slice(0, topN);
			}

			setStatus("query-status", `Query success. ${rows.length} row(s).`);
			if (currentQueryMode === "simple") {
				// ⭐ 每次跑新 simple query 时重置为按 avgMark 降序
				simpleSortKey = "avgMark";
				simpleSortDirection = "DESC";
				renderSimpleQueryTable("query-table-container", rows);
			} else {
				renderAdvancedQueryTable("query-table-container", rows);
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
