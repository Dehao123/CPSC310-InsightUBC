import {
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
	ResultTooLargeError,
} from "../../src/controller/IInsightFacade";
import InsightFacade from "../../src/controller/InsightFacade";
import { clearDisk, getContentFromArchives, loadTestQuery } from "../TestUtil";

import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";

use(chaiAsPromised);

export interface ITestQuery {
	title?: string;
	input: unknown;
	errorExpected: boolean;
	expected: any;
}

describe("InsightFacade", function () {
	let facade: InsightFacade;
	let sections: string;
	let rooms: string; // ✅ 添加 rooms

	before(async function () {
		sections = await getContentFromArchives("pair.zip");
		rooms = await getContentFromArchives("campus.zip"); // ✅ 加载 rooms 数据
	});

	// ========== addDataset (Sections - C1) ==========
	describe("addDataset - Sections", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("should reject with an empty dataset id", async function () {
			try {
				await facade.addDataset("", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with a whitespace-only dataset id", async function () {
			try {
				await facade.addDataset(" ", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with a dataset id containing underscore", async function () {
			try {
				await facade.addDataset("egan_ubc", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should successfully add a valid dataset", async function () {
			const result = await facade.addDataset("egan", sections, InsightDatasetKind.Sections);
			expect(result).to.include("egan");
		});

		it("should reject when adding a dataset with duplicate id", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			try {
				await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("add again after deleted", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			await facade.removeDataset("ubc");
			const result = await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			expect(result).to.include("ubc");
		});

		it("should add with successful caching", async function () {
			await facade.addDataset("s1", sections, InsightDatasetKind.Sections);
			const newFacade = new InsightFacade();
			const result = await newFacade.addDataset("s2", sections, InsightDatasetKind.Sections);
			expect(result).to.be.an("array").that.includes("s1");
			expect(result).to.be.an("array").that.includes("s2");
		});

		it("should reject when not base64 content", async function () {
			try {
				await facade.addDataset("s1", "pair.zip", InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("reject when courses has no JSON files", async function () {
			const z = await getContentFromArchives("courses_no_json.zip");
			try {
				await facade.addDataset("section", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("reject when zip is empty", async function () {
			const z = await getContentFromArchives("empty.zip");
			try {
				await facade.addDataset("sections", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});
	});

	// ========== addDataset (Rooms - C2) ==========
	describe("addDataset - Rooms", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("should successfully add a valid rooms dataset", async function () {
			const result = await facade.addDataset("rooms", rooms, InsightDatasetKind.Rooms);
			expect(result).to.include("rooms");

			const datasets = await facade.listDatasets();
			const roomsDataset = datasets.find((d) => d.id === "rooms");
			expect(roomsDataset).to.exist;
			expect(roomsDataset!.kind).to.equal(InsightDatasetKind.Rooms);
			expect(roomsDataset!.numRows).to.be.greaterThan(0);
		});

		it("should reject empty rooms zip", async function () {
			const empty = await getContentFromArchives("empty.zip");
			try {
				await facade.addDataset("rooms", empty, InsightDatasetKind.Rooms);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with invalid id containing underscore", async function () {
			try {
				await facade.addDataset("rooms_ubc", rooms, InsightDatasetKind.Rooms);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject duplicate rooms id", async function () {
			await facade.addDataset("rooms", rooms, InsightDatasetKind.Rooms);
			try {
				await facade.addDataset("rooms", rooms, InsightDatasetKind.Rooms);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should persist rooms to disk", async function () {
			await facade.addDataset("rooms", rooms, InsightDatasetKind.Rooms);
			const newFacade = new InsightFacade();
			const datasets = await newFacade.listDatasets();
			expect(datasets.map((d) => d.id)).to.include("rooms");
		});
	});

	// ========== removeDataset ==========
	describe("removeDataset", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("should remove an existing sections dataset", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const removed = await facade.removeDataset("ubc");
			expect(removed).to.equal("ubc");
		});

		it("should remove an existing rooms dataset", async function () {
			await facade.addDataset("rooms", rooms, InsightDatasetKind.Rooms);
			const removed = await facade.removeDataset("rooms");
			expect(removed).to.equal("rooms");
		});

		it("should reject when removing non-existent dataset", async function () {
			try {
				await facade.removeDataset("ghost");
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(NotFoundError);
			}
		});

		it("should reject with empty id", async function () {
			try {
				await facade.removeDataset("");
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with id containing underscore", async function () {
			try {
				await facade.removeDataset("bad_id");
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should allow removing from a new instance", async function () {
			await facade.addDataset("persist", sections, InsightDatasetKind.Sections);
			const facade2 = new InsightFacade();
			const removed = await facade2.removeDataset("persist");
			expect(removed).to.equal("persist");
		});

		it("should reject removing same dataset twice", async function () {
			await facade.addDataset("twice", sections, InsightDatasetKind.Sections);
			await facade.removeDataset("twice");
			try {
				await facade.removeDataset("twice");
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(NotFoundError);
			}
		});
	});

	// ========== listDatasets ==========
	describe("listDatasets", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		it("returns empty array when nothing added", async function () {
			const listed = await facade.listDatasets();
			expect(listed).to.deep.equal([]);
		});

		it("lists one sections dataset with metadata", async function () {
			await facade.addDataset("sections", sections, InsightDatasetKind.Sections);
			const listed = await facade.listDatasets();

			expect(listed).to.have.length(1);
			expect(listed[0].id).to.equal("sections");
			expect(listed[0].kind).to.equal(InsightDatasetKind.Sections);
			expect(listed[0].numRows).to.be.greaterThan(0);
		});

		it("lists one rooms dataset with metadata", async function () {
			await facade.addDataset("rooms", rooms, InsightDatasetKind.Rooms);
			const listed = await facade.listDatasets();

			expect(listed).to.have.length(1);
			expect(listed[0].id).to.equal("rooms");
			expect(listed[0].kind).to.equal(InsightDatasetKind.Rooms);
			expect(listed[0].numRows).to.be.greaterThan(0);
		});

		it("lists multiple datasets of different kinds", async function () {
			await facade.addDataset("sections", sections, InsightDatasetKind.Sections);
			await facade.addDataset("rooms", rooms, InsightDatasetKind.Rooms);

			const listed = await facade.listDatasets();
			const ids = listed.map((d) => d.id);
			expect(ids).to.have.members(["sections", "rooms"]);
		});

		it("persists to disk across instances", async function () {
			await facade.addDataset("persist", sections, InsightDatasetKind.Sections);
			const facade2 = new InsightFacade();
			const listed = await facade2.listDatasets();

			expect(listed.map((d) => d.id)).to.include("persist");
		});
	});

	// ========== PerformQuery (Sectisons - C1) ==========
	describe("PerformQuery - Sections", function () {
		const errors = new Map<string, typeof InsightError | typeof NotFoundError | typeof ResultTooLargeError>([
			["InsightError", InsightError],
			["NotFoundError", NotFoundError],
			["ResultTooLargeError", ResultTooLargeError],
		]);

		async function checkQuery(this: Mocha.Context): Promise<void> {
			if (!this.test) {
				throw new Error("Invalid call to checkQuery");
			}
			const { input, expected, errorExpected } = await loadTestQuery(this.test.title);
			try {
				const result = await facade.performQuery(input);
				if (errorExpected) {
					expect.fail(`Should have rejected with ${expected}`);
				} else {
					expect(result).to.have.deep.members(expected);
				}
			} catch (err) {
				if (!errorExpected) {
					expect.fail(`Unexpected error: ${err}`);
				} else {
					expect(err).to.be.instanceOf(errors.get(expected));
				}
			}
		}

		before(async function () {
			await clearDisk();
			facade = new InsightFacade();
			await facade.addDataset("sections", sections, InsightDatasetKind.Sections);
		});

		after(async function () {
			await clearDisk();
		});

		// C1 基础测试
		it("[valid/simple.json] SELECT dept, avg WHERE avg > 97", checkQuery);
		it("[invalid/invalid.json] Query missing WHERE", checkQuery);
		it("[invalid/emptyColumns.json] empty COLUMNS", checkQuery);
		it("[invalid/orderKeyNotInColumns.json] ORDER key not in COLUMNS", checkQuery);
		it("[invalid/unknownDatasetId.json] unknown dataset id in query", checkQuery);
		it("[invalid/malformedFilterType.json] GT expects number but got string", checkQuery);
		it("[invalid/tooLarge.json] result too large", checkQuery);
		it("[invalid/emptyAnd.json] empty AND array", checkQuery);
		it("[invalid/emptyOr.json] empty OR array", checkQuery);

		// ❌ 删除这行（C2 支持 TRANSFORMATIONS）
		// it("[invalid/unexpectedTransformations.json] unexpected Transformations", checkQuery);

		it("[invalid/isMiddleWildcard.json] is Middle Wildcard", checkQuery);
		it("[invalid/queryNotObject.json] query Not Object", checkQuery);
		it("[invalid/whereNotObject.json] where Not Object", checkQuery);
		it("[invalid/mcomparatorOnStringKey.json] mcomparator On String Key", checkQuery);
		it("[invalid/scomparisonOnNumericKey.json] s comparison On Numeric Key", checkQuery);

		// Valid queries
		it("[valid/is_suffix_wildcard.json] *son", checkQuery);
		it("[valid/is_contains_wildcard.json] *data*", checkQuery);
		it("[valid/and_numeric.json] AND: avg > 95 AND year = 2014", checkQuery);
		it("[valid/equal.json] EQ avg = 95", checkQuery);
		it("[valid/lt.json] LT avg < 60", checkQuery);
		it("[valid/or.json] OR dept=cpsc OR avg=95", checkQuery);
		it("[valid/complex_1.json] complex 1", checkQuery);
		it("[valid/complex_2.json] complex 2", checkQuery);
		it("[valid/complex_3.json] complex 3", checkQuery);
	});

	// ========== PerformQuery (Rooms - C2) ==========
	describe("PerformQuery - Rooms", function () {
		const errors = new Map<string, typeof InsightError | typeof NotFoundError | typeof ResultTooLargeError>([
			["InsightError", InsightError],
			["NotFoundError", NotFoundError],
			["ResultTooLargeError", ResultTooLargeError],
		]);

		async function checkQuery(this: Mocha.Context): Promise<void> {
			if (!this.test) {
				throw new Error("Invalid call to checkQuery");
			}
			const { input, expected, errorExpected } = await loadTestQuery(this.test.title);
			try {
				const result = await facade.performQuery(input);
				if (errorExpected) {
					expect.fail(`Should have rejected with ${expected}`);
				} else {
					expect(result).to.have.deep.members(expected);
				}
			} catch (err) {
				if (!errorExpected) {
					expect.fail(`Unexpected error: ${err}`);
				} else {
					expect(err).to.be.instanceOf(errors.get(expected));
				}
			}
		}

		before(async function () {
			await clearDisk();
			facade = new InsightFacade();
			await facade.addDataset("rooms", rooms, InsightDatasetKind.Rooms);
		});

		after(async function () {
			await clearDisk();
		});
	});

	// ========== PerformQuery (TRANSFORMATIONS - C2) ==========
	describe("PerformQuery - TRANSFORMATIONS", function () {
		const errors = new Map<string, typeof InsightError | typeof NotFoundError | typeof ResultTooLargeError>([
			["InsightError", InsightError],
			["NotFoundError", NotFoundError],
			["ResultTooLargeError", ResultTooLargeError],
		]);

		async function checkQuery(this: Mocha.Context): Promise<void> {
			if (!this.test) {
				throw new Error("Invalid call to checkQuery");
			}
			const { input, expected, errorExpected } = await loadTestQuery(this.test.title);
			try {
				const result = await facade.performQuery(input);
				if (errorExpected) {
					expect.fail(`Should have rejected with ${expected}`);
				} else {
					expect(result).to.have.deep.members(expected);
				}
			} catch (err) {
				if (!errorExpected) {
					expect.fail(`Unexpected error: ${err}`);
				} else {
					expect(err).to.be.instanceOf(errors.get(expected));
				}
			}
		}

		before(async function () {
			await clearDisk();
			facade = new InsightFacade();
			await facade.addDataset("sections", sections, InsightDatasetKind.Sections);
			await facade.addDataset("rooms", rooms, InsightDatasetKind.Rooms);
		});

		after(async function () {
			await clearDisk();
		});

		// ✅ GROUP/APPLY 测试（需要创建对应的 JSON 文件）
		// it("[valid/group_single.json] GROUP BY single key", checkQuery);
		// it("[valid/apply_max.json] APPLY MAX", checkQuery);
		// it("[valid/apply_min.json] APPLY MIN", checkQuery);
		// it("[valid/apply_avg.json] APPLY AVG with decimal precision", checkQuery);
		// it("[valid/apply_sum.json] APPLY SUM", checkQuery);
		// it("[valid/apply_count.json] APPLY COUNT", checkQuery);
		it("[valid/gROUPBYDept.json] GROUP BY dept", checkQuery);
		it("[valid/simpleRoomsQuery.json] Simple rooms query", checkQuery);
		it("[valid/getAllRooms(NoFilter).json] Get all rooms (no filter)", checkQuery);
		it("[valid/iS_AND_GT.json] IS_AND_GT", checkQuery);
		it("[valid/complex_4.json] AND_IS_GT", checkQuery);
		it("[valid/cOUNTOnStringField.json] COUNT on string field", checkQuery);
		it("[valid/aPPLYMIN.json] APPLY MIN", checkQuery);
		it("[valid/aPPLYSUM.json] APPLY SUM", checkQuery);
		it("[valid/and_two_predicates.Input.json] and_two_predicates.Input", checkQuery);
		it("[valid/order_multi_keys_equal.Input.json] order_multi_keys_equal.Input", checkQuery);

		// ✅ 多键排序
		// it("[valid/order_multi_keys.json] ORDER BY multiple keys", checkQuery);
		// it("[valid/order_direction_down.json] ORDER direction DOWN", checkQuery);

		// ✅ 错误情况
		it("[invalid/duplicateApplykey.json] Duplicate applykey", checkQuery);
		it("[invalid/transformations_not_object.json] TRANSFORMATIONS not an object", checkQuery);
		it("[invalid/gROUPNotAnArray.json] GROUP not an array", checkQuery);
		it("[invalid/aPPLYNotAnArray.json] APPLY not an array", checkQuery);
		it("[invalid/aPPLYRULEHasMultipleKeys.json] APPLYRULE has multiple keys", checkQuery);
		it("[invalid/over5000Result.json] over 5000 result", checkQuery);
		it("[invalid/lt_shape_error.json] lt_shape_error", checkQuery);
		it("[invalid/number_comp_mixed_dataset.json] number_comp_mixed_dataset", checkQuery);
		it("[invalid/gt_value_not_number.json] gt_value_not_number", checkQuery);
		it("[invalid/is_shape_error.json] is_shape_error", checkQuery);
		it("[invalid/is_mixed_dataset.json] is_mixed_dataset", checkQuery);
		it("[invalid/is_value_not_string_2.json] is_value_not_string_2", checkQuery);
		it("[invalid/is_middle_star_again.json] is_middle_star_again", checkQuery);
		it("[invalid/where_unknown_operator.json] where_unknown_operator", checkQuery);

		it("[invalid/orderDirInvalid.json] ORDER.dir not UP/DOWN", async function () {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["sections_dept"],
					ORDER: { dir: "SIDEWAYS", keys: ["sections_dept"] },
				},
			};
			await expect(facade.performQuery(q as any)).to.be.rejectedWith(InsightError);
		});

		it("[invalid/orderTypeInvalid.json] ORDER not string or object", async function () {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["sections_dept"],
					ORDER: 123,
				},
			};
			await expect(facade.performQuery(q as any)).to.be.rejectedWith(InsightError);
		});

		it("[invalid/orderEmptyKeys.json] ORDER.keys is empty", async function () {
			const q = {
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["sections_dept"],
					ORDER: { dir: "UP", keys: [] },
				},
			};
			await expect(facade.performQuery(q as any)).to.be.rejectedWith(InsightError);
		});

		it("[invalid/unknownApplyToken.json] unknown APPLY token", async function () {
			const q = {
				WHERE: {},
				OPTIONS: { COLUMNS: ["sections_dept", "x"], ORDER: "sections_dept" },
				TRANSFORMATIONS: {
					GROUP: ["sections_dept"],
					APPLY: [{ x: { FOO: "sections_avg" } }], //
				},
			};
			await expect(facade.performQuery(q as any)).to.be.rejectedWith(InsightError);
		});

		it("[invalid/unknownWhereOp.json] WHERE unknown operation", async function () {
			const q = {
				WHERE: { WEIRD: { sections_avg: 90 } },
				OPTIONS: { COLUMNS: ["sections_dept", "sections_avg"] },
			};
			await expect(facade.performQuery(q as any)).to.be.rejectedWith(InsightError);
		});

		it("[invalid/keyNoUnderscore.json] key no _", async function () {
			const q = {
				WHERE: { GT: { sectionsavg: 90 } },
				OPTIONS: { COLUMNS: ["sections_dept", "sections_avg"] },
			};
			await expect(facade.performQuery(q as any)).to.be.rejectedWith(InsightError);
		});
	});
});
