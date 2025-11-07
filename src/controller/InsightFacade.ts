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
const parse5 = require("parse5");

let zip: any;

// Section dataset row
interface SectionRow {
	uuid: string;
	id: string;
	dept: string;
	avg: number;
	instructor: string;
	title: string;
	pass: number;
	fail: number;
	audit: number;
	year: number;
}

// Room dataset row
interface RoomRow {
	fullname: string;
	shortname: string;
	number: string;
	name: string;
	address: string;
	lat: number;
	lon: number;
	seats: number;
	type: string;
	furniture: string;
	href: string;
}

const DATA_DIR = path.join(".", "data");

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {
	private datasets = new Map<string, InsightDataset>();
	private data = new Map<string, SectionRow[]>();
	private dataRooms = new Map<string, RoomRow[]>();
	private readonly initialized: Promise<void>;

	//# Generated with the assistance of ChatGPT
	private async geoLookup(address: string): Promise<{ lat?: number; lon?: number; error?: string } | undefined> {
		const http = require("http");
		const team = "project_team196";
		const encoded = encodeURIComponent(address);
		const url = `http://cs310.students.cs.ubc.ca:11316/api/v1/${team}/${encoded}`;

		return new Promise((resolve) => {
			http
				.get(url, (res: any) => {
					let data = "";
					res.on("data", (chunk: any) => (data += chunk));
					res.on("end", () => {
						try {
							resolve(JSON.parse(data));
						} catch {
							resolve(undefined);
						}
					});
				})
				.on("error", () => resolve(undefined));
		});
	}

	constructor() {
		this.initialized = this.loadPersistedDatasets();
	}

	private async ensureInitialized(): Promise<void> {
		return this.initialized;
	}

	private isValidId(id: string): boolean {
		return typeof id === "string" && id.trim().length > 0 && !id.includes("_");
	}

	// private makePersistPath(id: string): string {
	// 	return path.join(DATA_DIR, `${id}.sections.json`);
	// }

	private makePersistPathByKind(id: string, kind: InsightDatasetKind): string {
		const suffix = kind === InsightDatasetKind.Sections ? ".sections.json" : ".rooms.json";
		return path.join(DATA_DIR, `${id}${suffix}`);
	}

	private isFiniteNumber(x: any): x is number {
		return typeof x === "number" && Number.isFinite(x);
	}

	//# Generated with the assistance of ChatGPT
	private async loadPersistedDatasets(): Promise<void> {
		try {
			const exists = await fs.pathExists(DATA_DIR);
			if (!exists) {
				return;
			}

			const entries = await fs.readdir(DATA_DIR);
			for (const entry of entries) {
				if (entry.endsWith(".rooms.json")) {
					const id = entry.slice(0, -".rooms.json".length);
					const filePath = path.join(DATA_DIR, entry);
					try {
						const stored = await fs.readJson(filePath);
						if (!stored || stored.kind !== InsightDatasetKind.Rooms || !Array.isArray(stored.rooms)) {
							continue;
						}
						const rooms = stored.rooms as RoomRow[];
						if (rooms.length === 0) continue;
						const rows = rooms.map((r) => ({ ...r }));
						const numRows = typeof stored.numRows === "number" ? stored.numRows : rows.length;

						if (!this.dataRooms.has(id)) this.dataRooms.set(id, rows);
						if (!this.datasets.has(id)) this.datasets.set(id, { id, kind: InsightDatasetKind.Rooms, numRows });
					} catch {}
					continue;
				}
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

	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		await this.ensureInitialized();

		if (!this.isValidId(id)) throw new InsightError("Invalid id");
		if (this.datasets.has(id)) throw new InsightError("Duplicate id");

		// make persist path by kind
		const persistPath = this.makePersistPathByKind(id, kind);
		if (await fs.pathExists(persistPath)) throw new InsightError("Duplicate id on disk");

		// load
		try {
			zip = await JSZip.loadAsync(Buffer.from(content, "base64"));
		} catch {
			throw new InsightError("Invalid base64 zip");
		}

		// Sections
		if (kind === InsightDatasetKind.Sections) {
			const rows = await this.parseSectionsFromZip(zip); // 旧逻辑
			if (rows.length === 0) throw new InsightError("No valid rows");

			await fs.ensureDir(DATA_DIR);
			await fs.writeJson(persistPath, { kind, numRows: rows.length, sections: rows });

			this.data.set(id, rows);
			this.datasets.set(id, { id, kind, numRows: rows.length });
			return Array.from(this.datasets.keys()).sort();
		}

		// Rooms
		if (kind === InsightDatasetKind.Rooms) {
			const rooms = await this.parseRoomsFromZipAndGeocode(zip); // 见 2.2 / 2.3
			if (rooms.length === 0) throw new InsightError("No valid rows");

			await fs.ensureDir(DATA_DIR);
			await fs.writeJson(persistPath, { kind, numRows: rooms.length, rooms });

			this.dataRooms.set(id, rooms);
			this.datasets.set(id, { id, kind, numRows: rooms.length });
			return Array.from(this.datasets.keys()).sort();
		}

		throw new InsightError("Unknown dataset kind");
	}

	public async removeDataset(id: string): Promise<string> {
		if (!this.isValidId(id)) throw new InsightError("Invalid id");
		await this.ensureInitialized();

		const paths = [
			this.makePersistPathByKind(id, InsightDatasetKind.Sections),
			this.makePersistPathByKind(id, InsightDatasetKind.Rooms),
		];

		const onDisk = (await Promise.all(paths.map((p) => fs.pathExists(p)))).some(Boolean);
		const inMem = this.datasets.has(id);

		if (!onDisk && !inMem) throw new NotFoundError("Dataset not found");

		for (const p of paths) {
			if (await fs.pathExists(p)) await fs.remove(p);
		}
		this.datasets.delete(id);
		this.data.delete(id);
		this.dataRooms.delete(id);
		return id;
	}

	public async listDatasets(): Promise<InsightDataset[]> {
		await this.ensureInitialized();
		return Array.from(this.datasets.values()).sort((a, b) => a.id.localeCompare(b.id));
	}

	// Is dataset key（e.g. "<id>_<field>"）
	private isDatasetKey(k: any): k is string {
		return typeof k === "string" && k.includes("_");
	}

	private assertNoUnknownKeys(obj: any, allowed: string[], ctx: string): void {
		for (const k of Object.keys(obj)) {
			if (!allowed.includes(k)) {
				throw new InsightError(`${ctx} has unknown keys`);
			}
		}
	}

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		await this.ensureInitialized();

		if (!this.isObject(query)) throw new InsightError("Query must be an object");
		const q = query as any;
		if (!("WHERE" in q) || !("OPTIONS" in q)) throw new InsightError("Query must have WHERE and OPTIONS");
		if (!this.isObject(q.WHERE)) throw new InsightError("WHERE must be an object");

		const where = q.WHERE;
		const options = q.OPTIONS;
		const transf = q.TRANSFORMATIONS;

		if (!options || !Array.isArray(options.COLUMNS) || options.COLUMNS.length === 0) {
			throw new InsightError("OPTIONS.COLUMNS must be a non-empty array");
		}

		// assert COLUMNS / ORDER OPTIONS
		this.assertNoUnknownKeys(options, ["COLUMNS", "ORDER"], "OPTIONS");

		const columnKeys: string[] = options.COLUMNS.slice();

		// parse ORDER
		const orderKeys: string[] = this.extractOrderKeys(options.ORDER);
		for (const k of orderKeys) {
			if (!columnKeys.includes(k)) throw new InsightError("ORDER must use keys from COLUMNS");
		}

		if (this.isObject(where) && Object.keys(where).length > 0) {
			this.assertValidFilter(where);
		}

		// parse TRANSFORMATIONS
		let groupKeys: string[] = [];
		let applyRules: Array<{ applykey: string; token: "MAX" | "MIN" | "AVG" | "SUM" | "COUNT"; key: string }> = [];
		if (transf !== undefined) {
			if (!this.isObject(transf)) throw new InsightError("TRANSFORMATIONS must be object");

			// assert GROUP / APPLY
			this.assertNoUnknownKeys(transf, ["GROUP", "APPLY"], "TRANSFORMATIONS");

			// GROUP：非空数组，且每一项必须是 dataset key
			if (!Array.isArray(transf.GROUP) || transf.GROUP.length === 0) {
				throw new InsightError("GROUP must be a non-empty array");
			}
			groupKeys = transf.GROUP.slice();
			for (const g of groupKeys) {
				if (!this.isDatasetKey(g)) {
					throw new InsightError("GROUP entries must be dataset keys");
				}
			}

			//# Generated with the assistance of ChatGPT
			if (transf.APPLY !== undefined) {
				if (!Array.isArray(transf.APPLY)) throw new InsightError("APPLY must be an array");

				for (const rule of transf.APPLY) {
					if (!this.isObject(rule) || Object.keys(rule).length !== 1) {
						throw new InsightError("APPLYRULE shape error");
					}
					const applykey = Object.keys(rule)[0];

					if (typeof applykey !== "string" || applykey.trim().length === 0) {
						throw new InsightError("applykey must be a non-empty string");
					}
					if (applykey.includes("_")) {
						throw new InsightError("applykey must not contain underscore");
					}

					const inner = (rule as any)[applykey];
					if (!this.isObject(inner) || Object.keys(inner).length !== 1) {
						throw new InsightError("APPLYRULE inner shape error");
					}
					const token = Object.keys(inner)[0] as any;
					const key = inner[token];

					const allowedTokens = new Set(["MAX", "MIN", "AVG", "SUM", "COUNT"]);
					if (!allowedTokens.has(token)) {
						throw new InsightError("Unknown APPLY token");
					}

					if (!this.isDatasetKey(key)) {
						throw new InsightError("APPLY key must be a dataset key");
					}

					applyRules.push({ applykey, token, key });
				}

				const s = new Set(applyRules.map((r) => r.applykey));
				if (s.size !== applyRules.length) throw new InsightError("Duplicate applykey");

				for (const r of applyRules) {
					if (groupKeys.includes(r.applykey)) {
						throw new InsightError("applykey must not duplicate a GROUP key");
					}
				}
			}

			const allowedCols = new Set<string>([...groupKeys, ...applyRules.map((r) => r.applykey)]);
			for (const c of columnKeys) {
				if (!allowedCols.has(c)) {
					throw new InsightError("COLUMNS must be subset of GROUP keys and applykeys");
				}
			}
		}

		if (transf === undefined) {
			for (const c of columnKeys) {
				if (!this.isDatasetKey(c)) {
					throw new InsightError("COLUMNS entries must be dataset keys when no TRANSFORMATIONS");
				}
			}
		}

		// Collect all the "underlined real data keys" to infer the datasetId
		const whereKeys = this.collectWhereKeys(where);
		const isDatasetKey = (k: string) => typeof k === "string" && k.includes("_");

		const idKeys: string[] = [
			...whereKeys,
			...groupKeys,
			...applyRules.map((r) => r.key),
			...orderKeys.filter(isDatasetKey),
			...(transf ? [] : columnKeys.filter(isDatasetKey)),
		];

		const datasetId = this.validateAndGetDatasetId(idKeys);
		const meta = this.datasets.get(datasetId);
		if (!meta) throw new InsightError(`Dataset '${datasetId}' not added`);

		const isRooms = meta.kind === InsightDatasetKind.Rooms;
		const fieldTable = isRooms ? this.roomsFieldTypes : this.sectionsFieldTypes;
		const allRows: any[] | undefined = isRooms ? this.dataRooms.get(datasetId) : this.data.get(datasetId);
		if (!allRows) throw new InsightError(`Dataset '${datasetId}' not added`);

		// assert dataset valid
		const assertValidKey = (full: string, expected?: "number" | "string") => {
			if (!isDatasetKey(full)) return;
			const [ds, f] = this.splitKey(full);
			if (ds !== datasetId) throw new InsightError("Mixed dataset ids");
			if (!(f in fieldTable)) throw new InsightError(`Unknown field '${f}'`);
			if (expected && fieldTable[f] !== expected) throw new InsightError(`Field '${f}' must be ${expected}`);
		};
		[
			...whereKeys,
			...groupKeys,
			...applyRules.map((r) => r.key),
			...orderKeys.filter(isDatasetKey),
			...(transf ? [] : columnKeys.filter(isDatasetKey)),
		].forEach((k) => assertValidKey(k));

		// WHERE filter
		const filtered = allRows.filter((r) => this.evalWhereGeneric(where, r, datasetId, fieldTable));

		let results: InsightResult[] = [];

		if (transf === undefined) {
			results = filtered.map((row) => {
				const out: InsightResult = {};
				for (const col of columnKeys) {
					const [, f] = this.splitKey(col);
					out[col] = row[f];
				}
				return out;
			});
		} else {
			const groupMap = new Map<string, any[]>();
			const makeGroupKey = (row: any) => {
				const kv: any = {};
				for (const g of groupKeys) {
					const [, f] = this.splitKey(g);
					kv[g] = row[f];
				}
				return JSON.stringify(kv);
			};
			for (const r of filtered) {
				const k = makeGroupKey(r);
				if (!groupMap.has(k)) groupMap.set(k, []);
				groupMap.get(k)!.push(r);
			}

			const Decimal = require("decimal.js");
			const compute = (token: string, key: string, rs: any[]) => {
				const [, f] = this.splitKey(key);
				if (token === "COUNT") {
					const s = new Set<any>();
					for (const r of rs) s.add(r[f]);
					return s.size;
				}
				if (fieldTable[f] !== "number") throw new InsightError(`${token} requires numeric field`);
				if (token === "MAX") return Math.max(...rs.map((r) => Number(r[f])));
				if (token === "MIN") return Math.min(...rs.map((r) => Number(r[f])));
				if (token === "SUM") {
					const total = rs.reduce((acc, r) => acc.plus(new Decimal(r[f])), new Decimal(0));
					return Number(total.toNumber().toFixed(2));
				}
				if (token === "AVG") {
					const total = rs.reduce((acc, r) => acc.plus(new Decimal(r[f])), new Decimal(0));
					const avg = total.toNumber() / rs.length;
					return Number(avg.toFixed(2));
				}
				throw new InsightError(`Unknown APPLY token '${token}'`);
			};

			const out: InsightResult[] = [];
			for (const [gKey, rs] of groupMap) {
				const base = JSON.parse(gKey); // { "rooms_shortname": "DMP", ... }
				const row: any = { ...base };
				for (const r of applyRules) row[r.applykey] = compute(r.token, r.key, rs);

				const proj: InsightResult = {};
				for (const c of columnKeys) proj[c] = row[c];
				out.push(proj);
			}
			results = out;
		}

		if (results.length > 5000) throw new ResultTooLargeError("Result too large");

		// sort (string or {dir, keys})
		if (options.ORDER !== undefined) {
			const ord = options.ORDER;
			if (typeof ord === "string") {
				results.sort((a, b) => this.cmp(a[ord], b[ord]));
			} else {
				const dir = ord.dir === "DOWN" ? -1 : 1;
				const keys: string[] = ord.keys;
				results.sort((a, b) => {
					for (const k of keys) {
						if (a[k] === b[k]) continue;
						return (a[k] < b[k] ? -1 : 1) * dir;
					}
					return 0;
				});
			}
		}

		return results;
	}

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
		if (pat.includes("*")) {
			const first = pat.indexOf("*");
			const last = pat.lastIndexOf("*");
			const atStart = first === 0;
			const atEnd = last === pat.length - 1;
			const isOnlyStar = pat === "*";
			const allowed = isOnlyStar || atStart || atEnd;
			if (!allowed || (first !== last && !(atStart && atEnd))) {
				throw new InsightError("IS pattern may only use '*' at the start and/or end");
			}
		}
	}

	//# Generated with the assistance of ChatGPT
	private async parseSectionsFromZip(zip: any): Promise<SectionRow[]> {
		const rows: SectionRow[] = [];
		const tasks: Array<Promise<void>> = [];
		let sawCoursesFolder = false;

		zip.forEach((relativePath: string, file: any) => {
			if (file.dir) return;
			if (!relativePath.startsWith("courses/")) return;
			sawCoursesFolder = true;

			tasks.push(
				file
					.async("string")
					.then((text: string) => {
						let obj: any;
						try {
							obj = JSON.parse(text);
						} catch {
							return;
						}
						if (!obj || !Array.isArray(obj.result)) {
							return;
						}

						for (const r of obj.result) {
							const dept = r.Subject;
							const id = r.Course;
							const avgNum = Number(r.Avg);
							const passNum = Number(r.Pass);
							const failNum = Number(r.Fail);
							const auditNum = Number(r.Audit);

							const instructor = r.Professor;
							const title = r.Title;
							const uuid = String(r.id);

							let yearNum: number;
							if (typeof r.Section === "string" && r.Section.toLowerCase() === "overall") {
								yearNum = 1900;
							} else {
								yearNum = Number(r.Year);
							}

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
					.catch(() => {})
			);
		});

		if (!sawCoursesFolder) return [];
		await Promise.all(tasks);
		return rows;
	}

	// HTML parse（parse5）
	private findAll(node: any, pred: (n: any) => boolean, out: any[] = []): any[] {
		if (!node) return out;
		if (pred(node)) out.push(node);
		if (node.childNodes) {
			for (const c of node.childNodes) this.findAll(c, pred, out);
		}
		return out;
	}

	private getAttr(node: any, name: string): string | undefined {
		if (!node?.attrs) return undefined;
		const f = node.attrs.find((a: any) => a.name === name);
		return f?.value;
	}

	private getText(node: any): string {
		if (!node) return "";
		if (node.nodeName === "#text") return node.value ?? "";
		let s = "";
		if (node.childNodes) for (const c of node.childNodes) s += this.getText(c);
		return s.trim();
	}

	private findTableByTdClass(doc: any, classSubstr: string): any | undefined {
		const tds = this.findAll(doc, (n) => n.nodeName === "td" && (this.getAttr(n, "class") ?? "").includes(classSubstr));
		if (tds.length === 0) return undefined;
		const parents: any[] = [];
		const parentMap = new Map<any, any>();
		const buildParent = (n: any) => {
			if (!n?.childNodes) return;
			for (const c of n.childNodes) {
				parentMap.set(c, n);
				buildParent(c);
			}
		};
		buildParent(doc);

		const tableOf = (n: any): any | undefined => {
			let p = n;
			while (p) {
				if (p.nodeName === "table") return p;
				p = parentMap.get(p);
			}
			return undefined;
		};

		for (const td of tds) {
			const t = tableOf(td);
			if (t) return t;
		}
		return undefined;
	}

	//# Generated with the assistance of ChatGPT
	private async parseRoomsFromZipAndGeocode(zip: any): Promise<RoomRow[]> {
		// Read the index.htm file in the root directory
		const indexFile = zip.file("index.htm");
		if (!indexFile) return [];
		const indexHtml = await indexFile.async("string");
		const indexDoc = parse5.parse(indexHtml);

		// Locate the "Building List Table"
		const bldgTable =
			this.findTableByTdClass(indexDoc, "views-field-field-building-address") ??
			this.findTableByTdClass(indexDoc, "views-field-title");
		if (!bldgTable) return [];

		// Extraction Items: shortname/fullname/address/Building file href
		const buildings: Array<{ shortname: string; fullname: string; address: string; href: string }> = [];
		const trs = this.findAll(bldgTable, (n) => n.nodeName === "tr");
		for (const tr of trs) {
			const tds = (tr.childNodes ?? []).filter((n: any) => n.nodeName === "td");
			if (tds.length === 0) continue;

			let fullname = "";
			let shortname = "";
			let address = "";
			let href = "";

			for (const td of tds) {
				const cls = this.getAttr(td, "class") ?? "";
				if (cls.includes("views-field-title")) {
					const a = this.findAll(td, (n: any) => n.nodeName === "a")[0];
					if (a) {
						fullname = this.getText(a);
						const h = this.getAttr(a, "href");
						if (h) href = h.startsWith("./") ? h.slice(2) : h; // 统一相对路径
					}
				}
				if (cls.includes("views-field-field-building-address")) {
					address = this.getText(td);
				}
				if (cls.includes("views-field-field-building-code")) {
					shortname = this.getText(td);
				}
			}
			if (fullname && shortname && address && href) {
				buildings.push({ fullname, shortname, address, href });
			}
		}

		// Read the room tables of each building, temporarily not adding lat/lon first
		type TempRoom = Omit<RoomRow, "lat" | "lon">;
		const byBuilding = new Map<
			string,
			{ meta: { fullname: string; shortname: string; address: string }; rooms: TempRoom[] }
		>();

		for (const b of buildings) {
			const file = zip.file(b.href);
			if (!file) continue;
			const html = await file.async("string");
			const doc = parse5.parse(html);
			const roomTable =
				this.findTableByTdClass(doc, "views-field-field-room-number") ??
				this.findTableByTdClass(doc, "views-field-field-room-capacity") ??
				this.findTableByTdClass(doc, "views-field-title");
			if (!roomTable) continue;

			const trs2 = this.findAll(roomTable, (n) => n.nodeName === "tr");
			for (const tr of trs2) {
				const tds = (tr.childNodes ?? []).filter((n: any) => n.nodeName === "td");
				if (tds.length === 0) continue;

				let number = "",
					seatsStr = "",
					type = "",
					furniture = "",
					href = "";
				for (const td of tds) {
					const cls = this.getAttr(td, "class") ?? "";
					if (cls.includes("views-field-field-room-number")) {
						number = this.getText(td);
						const a = this.findAll(td, (n) => n.nodeName === "a")[0];
						if (a) href = this.getAttr(a, "href") ?? "";
					}
					if (cls.includes("views-field-field-room-capacity")) seatsStr = this.getText(td);
					if (cls.includes("views-field-field-room-type")) type = this.getText(td);
					if (cls.includes("views-field-field-room-furniture")) furniture = this.getText(td);
				}
				const seats = Number(seatsStr);
				if (!number || !Number.isFinite(seats)) continue;

				const meta = { fullname: b.fullname, shortname: b.shortname, address: b.address };
				if (!byBuilding.has(b.shortname)) byBuilding.set(b.shortname, { meta, rooms: [] });
				const br = byBuilding.get(b.shortname)!;

				const name = `${b.shortname}_${number}`;
				br.rooms.push({
					fullname: b.fullname,
					shortname: b.shortname,
					number,
					name,
					address: b.address,
					seats,
					type,
					furniture,
					href,
				});
			}
		}

		// Geocode the buildings that have "available rooms" and add them to each individual room.
		const out: RoomRow[] = [];
		for (const [shortname, pack] of byBuilding) {
			if (pack.rooms.length === 0) continue;
			const geo = await this.geoLookup(pack.meta.address); // 2.3
			if (!geo || typeof geo.lat !== "number" || typeof geo.lon !== "number") {
				continue;
			}
			for (const r of pack.rooms) {
				out.push({ ...r, lat: geo.lat, lon: geo.lon });
			}
		}
		return out;
	}

	private isObject(x: any): x is Record<string, any> {
		return x !== null && typeof x === "object" && !Array.isArray(x);
	}

	// Sections field types
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

	// Rooms field types
	private readonly roomsFieldTypes: Record<string, "number" | "string"> = {
		fullname: "string",
		shortname: "string",
		number: "string",
		name: "string",
		address: "string",
		lat: "number",
		lon: "number",
		seats: "number",
		type: "string",
		furniture: "string",
		href: "string",
	};

	private splitKey(k: string): [string, string] {
		const idx = k.indexOf("_");
		if (idx <= 0 || idx === k.length - 1) throw new InsightError(`Invalid key '${k}'`);
		return [k.slice(0, idx), k.slice(idx + 1)];
	}

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

	private assertValidSectionsKey(key: string): void {
		const [_, field] = this.splitKey(key);
		if (!(field in this.sectionsFieldTypes)) {
			throw new InsightError(`Unknown sections field '${field}'`);
		}
	}

	//# Generated with the assistance of ChatGPT
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

		if (op === "LT" || op === "GT" || op === "EQ" || op === "IS") {
			if (!this.isObject(val) || Object.keys(val).length !== 1) {
				throw new InsightError(`${op} must have exactly one key`);
			}
			return [Object.keys(val)[0]];
		}
		throw new InsightError(`Unknown WHERE operator '${op}'`);
	}

	private extractOrderKeys(order: any): string[] {
		if (order === undefined) return [];
		if (typeof order === "string") return [order];
		if (this.isObject(order)) {
			const dir = order.dir ?? "UP";
			if (dir !== "UP" && dir !== "DOWN") throw new InsightError("ORDER.dir must be 'UP' or 'DOWN'");
			if (!Array.isArray(order.keys) || order.keys.length === 0) {
				throw new InsightError("ORDER.keys must be a non-empty array");
			}
			const s = new Set(order.keys);
			if (s.size !== order.keys.length) {
				throw new InsightError("ORDER.keys must not contain duplicates");
			}
			return order.keys.slice();
		}
		throw new InsightError("Invalid ORDER");
	}

	private getFieldValue(row: SectionRow, field: string): string | number {
		return (row as any)[field];
	}

	private cmp(a: any, b: any): number {
		if (a < b) return -1;
		if (a > b) return 1;
		return 0;
	}

	private wildcardMatch(text: string, pattern: string): boolean {
		if (pattern === "*") return true;

		const starts = pattern.startsWith("*");
		const ends = pattern.endsWith("*");
		const core = pattern.substring(starts ? 1 : 0, ends ? pattern.length - 1 : pattern.length);

		if (starts && ends) return text.includes(core); // *foo*
		if (starts) return text.endsWith(core); // *foo
		if (ends) return text.startsWith(core); // foo*
		return text === core; // foo
	}

	private evalWhereGeneric(
		where: any,
		row: any,
		datasetId: string,
		fieldTable: Record<string, "number" | "string">
	): boolean {
		if (!where || Object.keys(where).length === 0) return true;
		const op = Object.keys(where)[0];
		const val = where[op];

		switch (op) {
			case "AND":
				if (!Array.isArray(val) || val.length === 0) throw new InsightError("AND needs non-empty array");
				return val.every((c: any) => this.evalWhereGeneric(c, row, datasetId, fieldTable));
			case "OR":
				if (!Array.isArray(val) || val.length === 0) throw new InsightError("OR needs non-empty array");
				return val.some((c: any) => this.evalWhereGeneric(c, row, datasetId, fieldTable));
			case "NOT":
				return !this.evalWhereGeneric(val, row, datasetId, fieldTable);

			case "LT":
			case "GT":
			case "EQ": {
				if (!this.isObject(val) || Object.keys(val).length !== 1) throw new InsightError(`${op} shape error`);
				const key = Object.keys(val)[0];
				const [ds, f] = this.splitKey(key);
				if (ds !== datasetId) throw new InsightError("Mixed dataset ids");
				if (fieldTable[f] !== "number") throw new InsightError(`${op} requires numeric field`);
				const cmpVal = val[key];
				if (typeof cmpVal !== "number") throw new InsightError(`${op} value must be number`);
				const cur = (row as any)[f] as number;
				if (op === "LT") return cur < cmpVal;
				if (op === "GT") return cur > cmpVal;
				return cur === cmpVal;
			}

			case "IS": {
				if (!this.isObject(val) || Object.keys(val).length !== 1) throw new InsightError("IS shape error");
				const key = Object.keys(val)[0];
				const [ds, f] = this.splitKey(key);
				if (ds !== datasetId) throw new InsightError("Mixed dataset ids");
				if (fieldTable[f] !== "string") throw new InsightError("IS requires string field");
				const pattern = val[key];
				if (typeof pattern !== "string") throw new InsightError("IS value must be string");
				if (pattern.slice(1, -1).includes("*")) throw new InsightError("'*' only allowed at ends");
				const str = String((row as any)[f]);
				return this.wildcardMatch(str, pattern);
			}

			default:
				throw new InsightError(`Unknown WHERE operator '${op}'`);
		}
	}
}
