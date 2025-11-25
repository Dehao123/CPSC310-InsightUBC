// frontend/public/app.js

// 如果前端是直接用文件打开 / 用另一个 dev server，
// 就走完整 URL。如果你以后把前端也挂在 4321 端口下，
// 可以把 baseUrl 改成空字符串 ""。
const baseUrl = "http://localhost:4321";

// ========= 工具函数 =========
function setStatus(id, message, isError = false) {
	const el = document.getElementById(id);
	if (!el) return;
	el.textContent = message || "";
	el.style.color = isError ? "#c62828" : "#555";
}

function renderTable(containerId, rows) {
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
			renderTable("datasets-table-container", json.result || []);
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
	const id = (document.getElementById("remove-dataset-id").value || "").trim();
	if (!id) {
		setStatus("remove-status", "Please enter dataset id to remove.", true);
		return;
	}

	setStatus("remove-status", "Removing...");
	try {
		const res = await fetch(`${baseUrl}/api/v1/datasets/${encodeURIComponent(id)}`, {
			method: "DELETE"
		});
		const json = await res.json().catch(() => ({}));

		if (res.ok) {
			setStatus("remove-status", `Removed dataset: ${json.result}`);
		} else {
			setStatus("remove-status", `Error: ${json.error || res.statusText}`, true);
		}
	} catch (e) {
		console.error(e);
		setStatus("remove-status", "Network error while removing dataset.", true);
	}
}

// ========= 4. 经典查询模板 =========

// ① 某院系 + 课程号 → 按 instructor 聚合平均分
function buildQuery_avgByInstructor(datasetId, dept, courseId) {
	const p = `${datasetId}_`;
	return {
		WHERE: {
			AND: [
				{ IS: { [`${p}dept`]: dept } },
				{ IS: { [`${p}id`]: courseId } }
			]
		},
		OPTIONS: {
			COLUMNS: [`${p}instructor`, "maxAvg"],
			ORDER: { dir: "DOWN", keys: ["maxAvg"] }
		},
		TRANSFORMATIONS: {
			GROUP: [`${p}instructor`],
			APPLY: [
				{
					maxAvg: { MAX: `${p}avg` }
				}
			]
		}
	};
}

// ② 某院系 → 按课程号聚合平均分（前端取前 N 行）
function buildQuery_topCoursesByAvg(datasetId, dept) {
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

// ③ 按平均分区间筛选所有 sections
function buildQuery_avgRange(datasetId, minAvg, maxAvg) {
	const p = `${datasetId}_`;
	return {
		WHERE: {
			AND: [
				{ GT: { [`${p}avg`]: minAvg } },
				{ LT: { [`${p}avg`]: maxAvg } }
			]
		},
		OPTIONS: {
			COLUMNS: [`${p}dept`, `${p}id`, `${p}uuid`, `${p}avg`],
			ORDER: { dir: "UP", keys: [`${p}avg`] }
		}
	};
}

async function runQuery() {
	const datasetId = (document.getElementById("query-dataset-id").value || "").trim();
	if (!datasetId) {
		setStatus("query-status", "Please enter dataset id (e.g., sections).", true);
		return;
	}

	const template = document.getElementById("query-template-select").value;
	const dept = (document.getElementById("param-dept").value || "").trim();
	const courseId = (document.getElementById("param-course-id").value || "").trim();
	const topN = parseInt(document.getElementById("param-top-n").value, 10) || 5;
	const minAvgStr = document.getElementById("param-min-avg").value;
	const maxAvgStr = document.getElementById("param-max-avg").value;

	let query;

	try {
		if (template === "avgByInstructor") {
			if (!dept || !courseId) {
				setStatus("query-status", "Template ① needs dept and course id.", true);
				return;
			}
			query = buildQuery_avgByInstructor(datasetId, dept, courseId);
		} else if (template === "topCoursesByAvg") {
			if (!dept) {
				setStatus("query-status", "Template ② needs dept.", true);
				return;
			}
			query = buildQuery_topCoursesByAvg(datasetId, dept);
		} else if (template === "avgRange") {
			const minAvg = Number(minAvgStr);
			const maxAvg = Number(maxAvgStr);
			if (Number.isNaN(minAvg) || Number.isNaN(maxAvg)) {
				setStatus("query-status", "Template ③ needs minAvg and maxAvg (numbers).", true);
				return;
			}
			query = buildQuery_avgRange(datasetId, minAvg, maxAvg);
		} else {
			setStatus("query-status", "Unknown template.", true);
			return;
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
			// 模板 ②：只取前 N 行
			if (template === "topCoursesByAvg" && rows.length > topN) {
				rows = rows.slice(0, topN);
			}
			setStatus("query-status", `Query success. ${rows.length} row(s).`);
			renderTable("query-table-container", rows);
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

	// 页面加载时自动刷新一次 dataset 列表
	listDatasets().catch(() => {});
});
