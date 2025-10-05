import {
		IInsightFacade,
		InsightDataset,
		InsightDatasetKind,
		InsightError,
		InsightResult,
		NotFoundError,
		ResultTooLargeError
		} from "./IInsightFacade";

import JSZip from "jszip";
import * as fs from "fs-extra";
import * as path from "path";




// ---- C1 内部数据模型（你也可以放到单独文件）----
interface SectionRow {
	uuid: string;
	id: string;        // 课程号（如 "310"）
	dept: string;      // 学院（如 "cpsc"）
	avg: number;
	instructor: string;
	title: string;
	pass: number;
	fail: number;
	audit: number;
	year: number;      // "overall" 设为 1900
}


const DATA_DIR = path.join(".", "data");// 相对工程根目录

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {

	private datasets: Map<string, InsightDataset> = new Map();
	private data: Map<string, SectionRow[]> = new Map();

	private isValidId(id: string): boolean {
		return typeof id === "string"     		// id是string类型
			&& id.trim().length > 0		  		// id不为空
			&& !id.includes("_");	// id不包含下划线
	}

	private makePersistPath(id: string): string {
		return path.join(DATA_DIR, `${id}.sections.json`);
	}

	private isFiniteNumber(x: any): x is number {
		return typeof x === "number" && Number.isFinite(x);
	}

	private isFiniteInteger(x: any): x is number {
		return this.isFiniteNumber(x) && Number.isInteger(x);
	}


	// ====== C1: addDataset（Sections）======
	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {

		//先检查id是否合规
		if (!this.isValidId(id)) throw new InsightError("Invalid id");

		//再检查是否是section类型
		if (kind !== InsightDatasetKind.Sections) throw new InsightError("not section");

		//检查是否是重复id
		if (this.datasets.has(id)) throw new InsightError("Duplicate id");

		// 如果想防止“磁盘已存在同名”：
		const persistPath = path.join("./data", `${id}.sections.json`);
		if (await fs.pathExists(persistPath)) throw new InsightError("Duplicate id on disk");

		// base64 → zip
		let zip: JSZip;
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
		return Array.from(this.datasets.values()).sort((a, b) => a.id.localeCompare(b.id));
	}

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		// 1) 基础结构校验
		if (!this.isObject(query)) throw new InsightError("Query must be an object");
		const q = query as any;
		if (!("WHERE" in q) || !("OPTIONS" in q)) throw new InsightError("Query must have WHERE and OPTIONS");

		// 2) 解析/收集本次查询涉及到的所有字段（用于提取 datasetId）
		const where = q.WHERE;
		const options = q.OPTIONS;

		// COLUMNS 必须是非空数组
		if (!options || !Array.isArray(options.COLUMNS) || options.COLUMNS.length === 0) {
			throw new InsightError("OPTIONS.COLUMNS must be a non-empty array");
		}

		// 收集所有用到的 key（WHERE 中 & COLUMNS 中 & ORDER 中）
		const whereKeys = this.collectWhereKeys(where);
		const columnKeys: string[] = options.COLUMNS.slice();
		const orderKeys: string[] = this.extractOrderKeys(options.ORDER);

		const allKeys = [...whereKeys, ...columnKeys, ...orderKeys];

		// 3) 解析 datasetId，并确保只引用了一个数据集、且该数据集存在
		const datasetId = this.validateAndGetDatasetId(allKeys);
		const dataset = this.data.get(datasetId);
		if (!dataset) throw new InsightError(`Dataset '${datasetId}' not added`);

		// 4) 字段名与类型校验（根据 Sections 规格）
		allKeys.forEach((k) => this.assertValidSectionsKey(k));

		// 5) 执行 WHERE 过滤
		const filtered = dataset.filter((row) => this.evalWhere(where, row, datasetId));

		// 6) 结果过大检查
		if (filtered.length > 5000) {
			throw new ResultTooLargeError("Result too large");
		}

		// 7) 选择列（投影）
		const projected: InsightResult[] = filtered.map((row) => {
			const out: InsightResult = {};
			for (const col of columnKeys) {
				const [_, field] = this.splitKey(col);
				out[col] = this.getFieldValue(row, field);
			}
			return out;
		});

		// 8) 排序（可为字符串或 { dir, keys }）
		if (options.ORDER !== undefined) {
			const ord = options.ORDER;
			if (typeof ord === "string") {
				if (!columnKeys.includes(ord)) throw new InsightError("ORDER must use a key from COLUMNS");
				const [_, field] = this.splitKey(ord);
				projected.sort((a, b) => this.cmp(a[ord], b[ord]));
			} else if (this.isObject(ord)) {
				const dir = ord.dir;
				const keys: string[] = ord.keys;
				if ((dir !== "UP" && dir !== "DOWN") || !Array.isArray(keys) || keys.length === 0) {
					throw new InsightError("Invalid ORDER object");
				}
				// 所有排序键必须属于 COLUMNS
				for (const k of keys) {
					if (!columnKeys.includes(k)) throw new InsightError("ORDER keys must be in COLUMNS");
				}
				projected.sort((a, b) => {
					for (const k of keys) {
						const va = a[k]; const vb = b[k];
						const c = this.cmp(va, vb);
						if (c !== 0) return dir === "UP" ? c : -c;
					}
					return 0;
				});
			} else {
				throw new InsightError("Invalid ORDER");
			}
		}

		return projected;
	}


	// ====== 解析函数：把 zip 里 courses/*.json 读成 SectionRow[] ======
	private async parseSectionsFromZip(zip: JSZip): Promise<SectionRow[]> {
		const folder = zip.folder("courses");
		if (!folder) return [];

		const rows: SectionRow[] = [];
		const tasks: Array<Promise<void>> = [];

		folder.forEach((relativePath, file) => {
			if (!file.dir && relativePath.toLowerCase().endsWith(".json")) {
				tasks.push(
					file
						.async("text")
						.then((text) => {
							let obj: any;
							try {
								obj = JSON.parse(text);
							} catch {
								return; // 单个坏文件忽略
							}
							if (!obj || !Array.isArray(obj.result)) return;

							for (const r of obj.result) {
								// 映射并校验必需字段
								const dept = r.Subject;
								const id = r.Course;
								const avg = r.Avg;
								const instructor = r.Professor;
								const title = r.Title;
								const pass = r.Pass;
								const fail = r.Fail;
								const audit = r.Audit;
								const uuid = r.id;
								let year = r.Year;

								if (typeof r.Section === "string" && r.Section.toLowerCase() === "overall") {
									year = 1900;
								}

								if (
									typeof dept === "string" &&
									typeof id === "string" &&
									this.isFiniteNumber(avg) &&
									typeof instructor === "string" &&
									typeof title === "string" &&
									this.isFiniteInteger(pass) &&
									this.isFiniteInteger(fail) &&
									this.isFiniteInteger(audit) &&
									typeof uuid === "string" &&
									this.isFiniteInteger(year)
								) {
									rows.push({
										dept,
										id,
										avg: Number(avg),
										instructor,
										title,
										pass: Number(pass),
										fail: Number(fail),
										audit: Number(audit),
										uuid,
										year: Number(year),
									});
								}
							}
						})
						.catch(() => {
							// 读取该文件失败：忽略，不影响整体
						})
				);
			}
		});

		await Promise.all(tasks);
		return rows;
	}


	/* ---------------- 辅助函数（私有）---------------- */

	private isObject(x: any): x is Record<string, any> {
		return x !== null && typeof x === "object" && !Array.isArray(x);
	}

// Sections 可用字段与类型（key 的后半段）
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
		// 转成正则：^...$，其中 * => .*
		const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
		if (pattern === "*") return true;
		const startsStar = pattern.startsWith("*");
		const endsStar = pattern.endsWith("*");
		const core = pattern.substring(startsStar ? 1 : 0, endsStar ? pattern.length - 1 : pattern.length);
		const coreEsc = esc(core);
		let rx: RegExp;
		if (startsStar && endsStar) rx = new RegExp(coreEsc ? `${coreEsc}` : "", "i");
		else if (startsStar) rx = new RegExp(`${coreEsc}$`, "i");
		else if (endsStar) rx = new RegExp(`^${coreEsc}`, "i");
		else rx = new RegExp(`^${coreEsc}$`, "i");
		return rx.test(text);
	}

}




