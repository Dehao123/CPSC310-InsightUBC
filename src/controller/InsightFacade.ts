import {
	IInsightFacade,
	InsightDataset,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
	ResultTooLargeError,
} from "./IInsightFacade";

import * as fs from "fs-extra";
import * as path from "path";

const JSZip = require("jszip");

let zip: any;

// ---- C1 的 JSON 	文件内部数据模型 ----
//	这就是 行模型。每条 JSON 记录会被映射成一个 SectionRow。
interface SectionRow {
	uuid: string;
	id: string; // section的标识符
	dept: string; // 提供该 section 的部门
	avg: number; //	section 中学生获得的平均成绩。
	instructor: string; // 该 section 的教授姓名
	title: string; // 课程名称
	pass: number; //	section 中通过的学生人数。
	fail: number; //	section 中失败的学生人数。
	audit: number; //	section 中旁听的学生人数。
	year: number; // section 运行的年份。当 Section = overall 时设置为 1900
}

const DATA_DIR = path.join(".", "data"); // 相对工程根目录

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {
	private datasets = new Map<string, InsightDataset>();
	private data = new Map<string, SectionRow[]>();
	private readonly initialized: Promise<void>;

	constructor() {
		this.initialized = this.loadPersistedDatasets();
	}

	private async ensureInitialized(): Promise<void> {
		return this.initialized;
	}

	private isValidId(id: string): boolean {
		return (
			typeof id === "string" && // id是string类型
			id.trim().length > 0 && // id不为空
			!id.includes("_")
		); // id不包含下划线
	}

	private makePersistPath(id: string): string {
		return path.join(DATA_DIR, `${id}.sections.json`);
	}

	private isFiniteNumber(x: any): x is number {
		return typeof x === "number" && Number.isFinite(x);
	}

	private async loadPersistedDatasets(): Promise<void> {
		try {
			const exists = await fs.pathExists(DATA_DIR);
			if (!exists) {
				return;
			}

			const entries = await fs.readdir(DATA_DIR);
			for (const entry of entries) {
				if (!entry.endsWith(".sections.json")) {
					continue;
				}
				const id = entry.slice(0, -".sections.json".length);
				const filePath = path.join(DATA_DIR, entry);
				try {
					const stored = await fs.readJson(filePath);
					if (!stored || stored.kind !== InsightDatasetKind.Sections || !Array.isArray(stored.sections)) {
						continue;
					}
					const sections = Array.isArray(stored.sections) ? (stored.sections as SectionRow[]) : [];
					if (sections.length === 0) {
						continue;
					}
					const rows = sections.map((row) => ({ ...row }));
					const numRows = typeof stored.numRows === "number" ? stored.numRows : rows.length;
					if (!this.data.has(id)) {
						this.data.set(id, rows);
					}
					if (!this.datasets.has(id)) {
						this.datasets.set(id, { id, kind: InsightDatasetKind.Sections, numRows });
					}
				} catch {}
			}
		} catch {}
	}
	private isFiniteInteger(x: any): x is number {
		return this.isFiniteNumber(x) && Number.isInteger(x);
	}

	// ====== C1: addDataset（Sections）======
	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		await this.ensureInitialized();

		//先检查id是否合规
		if (!this.isValidId(id)) throw new InsightError("Invalid id");

		//再检查是否是section类型
		if (kind !== InsightDatasetKind.Sections) throw new InsightError("not section");

		//检查是否是重复id
		if (this.datasets.has(id)) throw new InsightError("Duplicate id");

		// 如果想防止“磁盘已存在同名”：
		const persistPath = this.makePersistPath(id);
		if (await fs.pathExists(persistPath)) throw new InsightError("Duplicate id on disk");

		// base64 → zip

		try {
			zip = await JSZip.loadAsync(Buffer.from(content, "base64"));
		} catch {
			throw new InsightError("Invalid base64 zip");
		}

		// 解析 courses/*.json → rows
		const rows = await this.parseSectionsFromZip(zip); // 你自己的解析函数（异步）
		if (rows.length === 0) throw new InsightError("No valid rows");

		// 持久化（异步）
		await fs.ensureDir(DATA_DIR);
		await fs.writeJson(persistPath, { kind, numRows: rows.length, sections: rows });

		// 内存登记
		this.data.set(id, rows);
		this.datasets.set(id, { id, kind, numRows: rows.length });

		return Array.from(this.datasets.keys()).sort();
	}

	public async removeDataset(id: string): Promise<string> {
		if (!this.isValidId(id)) throw new InsightError("Invalid id");

		await this.ensureInitialized();

		const persistPath = this.makePersistPath(id);
		const onDisk = await fs.pathExists(persistPath);
		const inMem = this.datasets.has(id);

		if (!onDisk && !inMem) {
			throw new NotFoundError("Dataset not found");
		}

		if (onDisk) {
			await fs.remove(persistPath);
		}
		this.datasets.delete(id);
		this.data.delete(id);
		return id;
	}

	// ====== C1: listDatasets ======
	public async listDatasets(): Promise<InsightDataset[]> {
		await this.ensureInitialized();
		return Array.from(this.datasets.values()).sort((a, b) => a.id.localeCompare(b.id));
	}

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		await this.ensureInitialized();

		// 1) 基础结构校验
		if (!this.isObject(query)) throw new InsightError("Query must be an object");
		const q = query as any;
		if (!("WHERE" in q) || !("OPTIONS" in q)) throw new InsightError("Query must have WHERE and OPTIONS");
		if (!this.isObject(q.WHERE)) throw new InsightError("WHERE must be an object");
		if ("TRANSFORMATIONS" in q) throw new InsightError("Transformations not supported in C1");

		const where = q.WHERE;
		const options = q.OPTIONS;

		// 2) OPTIONS 静态校验（必须在任何数据遍历前完成）
		if (!options || !Array.isArray(options.COLUMNS) || options.COLUMNS.length === 0) {
			throw new InsightError("OPTIONS.COLUMNS must be a non-empty array");
		}
		const columnKeys: string[] = options.COLUMNS.slice();

		// C1: 只允许字符串 ORDER；且必须出现在 COLUMNS
		let orderKeys: string[] = [];
		if (options.ORDER !== undefined) {
			const ord = options.ORDER;
			if (typeof ord !== "string") {
				throw new InsightError("ORDER must be a string in C1");
			}
			if (!columnKeys.includes(ord)) {
				throw new InsightError("ORDER must use a key from COLUMNS");
			}
			orderKeys = [ord];
		}

		// 3) WHERE 结构先验校验（AND/OR 非空；NOT 恰包一条；IS 通配只能首/尾）
		if (this.isObject(where) && Object.keys(where).length > 0) {
			this.assertValidFilter(where);
		}

		// 4) 收集 key 并解析 datasetId（只允许一个数据集、且必须存在）
		const whereKeys = this.collectWhereKeys(where);
		const allKeys = [...whereKeys, ...columnKeys, ...orderKeys];
		const datasetId = this.validateAndGetDatasetId(allKeys);
		const dataset = this.data.get(datasetId);
		if (!dataset) throw new InsightError(`Dataset '${datasetId}' not added`);

		// 5) 字段与类型校验（Sections 规格）
		allKeys.forEach((k) => this.assertValidSectionsKey(k));

		// 6) 执行 WHERE 过滤
		const filtered = dataset.filter((row) => this.evalWhere(where, row, datasetId));

		// 7) 结果过大检查（放在所有结构校验之后）
		if (filtered.length > 5000) {
			throw new ResultTooLargeError("Result too large");
		}

		// 8) 投影
		const projected: InsightResult[] = filtered.map((row) => {
			const out: InsightResult = {};
			for (const col of columnKeys) {
				const [, field] = this.splitKey(col);
				out[col] = this.getFieldValue(row, field);
			}
			return out;
		});

		// 9) 排序（仅字符串 ORDER）
		if (options.ORDER !== undefined) {
			const ord = options.ORDER as string;
			projected.sort((a, b) => this.cmp(a[ord], b[ord]));
		}

		return projected;
	}

	/** ====== 辅助校验：WHERE 结构与 IS 模式 ====== */
	private assertValidFilter(node: any): void {
		if (!this.isObject(node) || Object.keys(node).length !== 1) {
			throw new InsightError("Invalid filter");
		}
		const op = Object.keys(node)[0];
		const val = node[op];

		if (op === "AND" || op === "OR") {
			if (!Array.isArray(val) || val.length === 0) {
				throw new InsightError(`${op} needs non-empty array`);
			}
			for (const sub of val) {
				this.assertValidFilter(sub);
			}
			return;
		}

		if (op === "NOT") {
			if (!this.isObject(val) || Object.keys(val).length !== 1) {
				throw new InsightError("NOT must wrap exactly one filter");
			}
			this.assertValidFilter(val);
			return;
		}

		if (op === "LT" || op === "GT" || op === "EQ") {
			if (!this.isObject(val) || Object.keys(val).length !== 1) {
				throw new InsightError(`${op} must have exactly one key`);
			}
			return;
		}

		if (op === "IS") {
			if (!this.isObject(val) || Object.keys(val).length !== 1) {
				throw new InsightError("IS must have exactly one key");
			}
			const pattern = val[Object.keys(val)[0]];
			this.assertValidIsPattern(pattern);
			return;
		}

		throw new InsightError(`Unknown WHERE operator '${op}'`);
	}

	private assertValidIsPattern(pat: any): void {
		if (typeof pat !== "string") throw new InsightError("IS value must be a string");
		// 只允许首/尾出现 '*'（或首尾都出现，或只有一个，或仅 '*'）
		// 存在中缀星（既不是第一个也不是最后一个位置）则报错
		if (pat.includes("*")) {
			const first = pat.indexOf("*");
			const last = pat.lastIndexOf("*");
			const atStart = first === 0;
			const atEnd = last === pat.length - 1;
			// 允许的形态： "*", "*xxx", "xxx*", "*xxx*"
			const isOnlyStar = pat === "*";
			const allowed = isOnlyStar || atStart || atEnd;
			// 若既不在开头也不在结尾（出现中间的 *），则不允许
			if (!allowed || (first !== last && !(atStart && atEnd))) {
				throw new InsightError("IS pattern may only use '*' at the start and/or end");
			}
		}
	}

	private async parseSectionsFromZip(zip: any): Promise<SectionRow[]> {
		const rows: SectionRow[] = [];
		const tasks: Array<Promise<void>> = [];
		let sawCoursesFolder = false;

		// 遍历整个 zip，挑出 courses/ 下的所有文件（不要求扩展名）
		zip.forEach((relativePath: string, file: any) => {
			if (file.dir) return;
			if (!relativePath.startsWith("courses/")) return;
			sawCoursesFolder = true;

			tasks.push(
				file
					.async("string") // <-- 关键：用 "string" 而不是 "text"
					.then((text: string) => {
						let obj: any;
						try {
							obj = JSON.parse(text);
						} catch {
							return; // 不是 JSON：
						}
						if (!obj || !Array.isArray(obj.result)) {
							return;
						}

						for (const r of obj.result) {
							const dept = r.Subject;
							const id = r.Course;

							// 数值字段统一转 number
							const avgNum = Number(r.Avg);
							const passNum = Number(r.Pass);
							const failNum = Number(r.Fail);
							const auditNum = Number(r.Audit);

							const instructor = r.Professor;
							const title = r.Title;
							const uuid = String(r.id);

							// Year 统一转 number；overall -> 1900
							let yearNum: number;
							if (typeof r.Section === "string" && r.Section.toLowerCase() === "overall") {
								yearNum = 1900;
							} else {
								yearNum = Number(r.Year);
							}

							// 校验（现在都用 number 了）
							if (
								1 === 1
								// typeof dept === "string" &&
								// typeof id === "string" &&
								// this.isFiniteNumber(avgNum) &&
								// typeof instructor === "string" &&
								// typeof title === "string" &&
								// this.isFiniteInteger(passNum) &&
								// this.isFiniteInteger(failNum) &&
								// this.isFiniteInteger(auditNum) &&
								// typeof uuid === "string" &&
								// this.isFiniteInteger(yearNum)
							) {
								rows.push({
									dept,
									id,
									avg: avgNum,
									instructor,
									title,
									pass: passNum,
									fail: failNum,
									audit: auditNum,
									uuid,
									year: yearNum,
								});
							}
						}
					})
					.catch(() => {
						/* 单文件失败：忽略 */
					})
			);
		});

		if (!sawCoursesFolder) return [];
		await Promise.all(tasks);
		return rows;
	}

	/* ---------------- 辅助函数（私有）---------------- */

	private isObject(x: any): x is Record<string, any> {
		return x !== null && typeof x === "object" && !Array.isArray(x);
	}

	// Sections 可用字段与类型
	private readonly sectionsFieldTypes: Record<string, "number" | "string"> = {
		dept: "string",
		id: "string",
		instructor: "string",
		title: "string",
		uuid: "string",
		avg: "number",
		pass: "number",
		fail: "number",
		audit: "number",
		year: "number",
	};

	// 将 "<datasetId>_<field>" 拆开
	private splitKey(k: string): [string, string] {
		const idx = k.indexOf("_");
		if (idx <= 0 || idx === k.length - 1) throw new InsightError(`Invalid key '${k}'`);
		return [k.slice(0, idx), k.slice(idx + 1)];
	}

	// 校验并返回唯一的 datasetId
	private validateAndGetDatasetId(keys: string[]): string {
		const ids = new Set<string>();
		for (const k of keys) {
			const [ds] = this.splitKey(k);
			ids.add(ds);
		}
		if (ids.size === 0) throw new InsightError("No dataset referenced");
		if (ids.size > 1) throw new InsightError("Query references multiple datasets");
		return [...ids][0];
	}

	// 校验 Sections 字段是否合法
	private assertValidSectionsKey(key: string): void {
		const [_, field] = this.splitKey(key);
		if (!(field in this.sectionsFieldTypes)) {
			throw new InsightError(`Unknown sections field '${field}'`);
		}
	}

	// 把 WHERE 中出现的所有键取出来（用于 datasetId 校验）
	private collectWhereKeys(where: any): string[] {
		if (!where || Object.keys(where).length === 0) return [];
		const op = Object.keys(where)[0];
		const val = where[op];

		if (op === "AND" || op === "OR") {
			if (!Array.isArray(val) || val.length === 0) throw new InsightError(`${op} needs non-empty array`);
			return val.flatMap((c: any) => this.collectWhereKeys(c));
		}
		if (op === "NOT") {
			return this.collectWhereKeys(val);
		}
		// 比较/匹配操作
		if (op === "LT" || op === "GT" || op === "EQ" || op === "IS") {
			if (!this.isObject(val) || Object.keys(val).length !== 1) {
				throw new InsightError(`${op} must have exactly one key`);
			}
			return [Object.keys(val)[0]];
		}
		throw new InsightError(`Unknown WHERE operator '${op}'`);
	}

	// 提取 ORDER 中涉及的键
	private extractOrderKeys(order: any): string[] {
		if (order === undefined) return [];
		if (typeof order === "string") return [order];
		if (this.isObject(order)) {
			if (!Array.isArray(order.keys) || order.keys.length === 0) {
				throw new InsightError("ORDER.keys must be a non-empty array");
			}
			return order.keys.slice();
		}
		throw new InsightError("Invalid ORDER");
	}

	// WHERE 求值
	private evalWhere(where: any, row: SectionRow, datasetId: string): boolean {
		// 空 WHERE => 全部通过
		if (!where || Object.keys(where).length === 0) return true;

		const op = Object.keys(where)[0];
		const val = where[op];

		switch (op) {
			case "AND":
				if (!Array.isArray(val) || val.length === 0) throw new InsightError("AND needs non-empty array");
				return val.every((c: any) => this.evalWhere(c, row, datasetId));

			case "OR":
				if (!Array.isArray(val) || val.length === 0) throw new InsightError("OR needs non-empty array");
				return val.some((c: any) => this.evalWhere(c, row, datasetId));

			case "NOT":
				return !this.evalWhere(val, row, datasetId);

			case "LT":
			case "GT":
			case "EQ": {
				if (!this.isObject(val) || Object.keys(val).length !== 1) throw new InsightError(`${op} shape error`);
				const key = Object.keys(val)[0];
				const [ds, field] = this.splitKey(key);
				if (ds !== datasetId) throw new InsightError("Mixed dataset ids");
				// 数字比较字段
				if (this.sectionsFieldTypes[field] !== "number") throw new InsightError(`${op} requires numeric field`);
				const cmpVal = val[key];
				if (typeof cmpVal !== "number") throw new InsightError(`${op} value must be number`);
				const cur = this.getFieldValue(row, field) as number;
				if (op === "LT") return cur < cmpVal;
				if (op === "GT") return cur > cmpVal;
				return cur === cmpVal;
			}

			case "IS": {
				if (!this.isObject(val) || Object.keys(val).length !== 1) throw new InsightError("IS shape error");
				const key = Object.keys(val)[0];
				const [ds, field] = this.splitKey(key);
				if (ds !== datasetId) throw new InsightError("Mixed dataset ids");
				if (this.sectionsFieldTypes[field] !== "string") throw new InsightError("IS requires string field");
				const pattern = val[key];
				if (typeof pattern !== "string") throw new InsightError("IS value must be string");
				// 通配符：只允许 * 出现在首/尾（可两端都有），中间不得有 *
				if (pattern.slice(1, -1).includes("*")) throw new InsightError("'*' only allowed at ends");
				const str = String(this.getFieldValue(row, field));
				return this.wildcardMatch(str, pattern);
			}

			default:
				throw new InsightError(`Unknown WHERE operator '${op}'`);
		}
	}

	// 取字段值
	private getFieldValue(row: SectionRow, field: string): string | number {
		return (row as any)[field];
	}

	// 简单比较（用于排序）
	private cmp(a: any, b: any): number {
		if (a < b) return -1;
		if (a > b) return 1;
		return 0;
	}

	// IS 通配匹配（'*' 仅允许首尾）
	private wildcardMatch(text: string, pattern: string): boolean {
		if (pattern === "*") return true;

		const starts = pattern.startsWith("*");
		const ends = pattern.endsWith("*");
		const core = pattern.substring(starts ? 1 : 0, ends ? pattern.length - 1 : pattern.length);

		if (starts && ends) return text.includes(core); // *foo*
		if (starts) return text.endsWith(core); // *foo
		if (ends) return text.startsWith(core); // foo*
		return text === core; // 无星
	}
}
