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
	// ---- 统一作用域：addDataset 与 PerformQuery 共用 ----
	let facade: InsightFacade;
	let sections: string;
	before(async function () {
		sections = await getContentFromArchives("pair.zip");
	});
	describe("addDataset", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});
		it("addDataset: should reject with an empty dataset id", async function () {
			try {
				await facade.addDataset("", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: should reject with a whitespace-only dataset id", async function () {
			try {
				await facade.addDataset(" ", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: should reject with a dataset id containing underscore", async function () {
			try {
				await facade.addDataset("egan_ubc", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: should successfully add a valid dataset", async function () {
			try {
				const result = await facade.addDataset("egan", sections, InsightDatasetKind.Sections);
				expect(result).to.include("egan");
			} catch (err) {
				expect.fail(`Should not have thrown, but got error: ${err}`);
			}
		});

		it("addDataset: should reject when adding a dataset with duplicate id", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			try {
				await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: add again after deleted", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			await facade.removeDataset("ubc");
			try {
				const result = await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
				expect(result).to.include("ubc");
			} catch (err) {
				expect.fail(`Should not have thrown, but got error: ${err}`);
			}
		});

		it("addDataset: should add a valid dataset successful caching", async function () {
			try {
				await facade.addDataset("s1", sections, InsightDatasetKind.Sections);
				const newFacade = new InsightFacade();
				const result = await newFacade.addDataset("s2", sections, InsightDatasetKind.Sections);
				expect(result).to.be.an("array").that.include("s1");
				expect(result).to.be.an("array").that.include("s2");
			} catch (err: any) {
				expect.fail("should not throw at here: " + err.message);
			}
		});

		it("addDataset: should reject adding when not base 64 content", async function () {
			try {
				await facade.addDataset("s1", "pair.zip", InsightDatasetKind.Sections);
				expect.fail("Should have thrown by empty zip.");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: reject when courses has no JSON files", async function () {
			let z: string;
			try {
				z = await getContentFromArchives("courses_no_json.zip");
				await facade.addDataset("section", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError for missing JSON files.");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: reject when zip is empty", async function () {
			let z: string;
			try {
				z = await getContentFromArchives("empty.zip");
				await facade.addDataset("sections", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError for empty zip.");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: reject when a JSON file bad", async function () {
			let z: string;
			try {
				z = await getContentFromArchives("bad_json.zip");
				await facade.addDataset("sections", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError for malformed JSON.");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: reject when all parsed rows are invalid", async function () {
			try {
				const z = await getContentFromArchives("courses_invalid_rows.zip");
				await facade.addDataset("sections", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError for all-invalid rows.");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: reject when content is base64 but not a zip", async function () {
			try {
				const txt = await getContentFromArchives("not_zip.txt");
				await facade.addDataset("nz", txt, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError for non-zip base64 content.");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: bad zip 1", async function () {
			try {
				const z = await getContentFromArchives("bad_json.zip");
				await facade.addDataset("sec_nr", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError: missing 'result'");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: bad zip 2", async function () {
			try {
				const z = await getContentFromArchives("courses_invalid_rows.zip");
				await facade.addDataset("sec_nr", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError: missing 'result'");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: bad zip 3", async function () {
			try {
				const z = await getContentFromArchives("courses_no_json.zip");
				await facade.addDataset("sec_nr", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError: missing 'result'");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: bad zip 4", async function () {
			try {
				const z = await getContentFromArchives("empty.zip");
				await facade.addDataset("sec_nr", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError: missing 'result'");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: bad zip 5", async function () {
			try {
				const z = await getContentFromArchives("not_zip.txt");
				await facade.addDataset("sec_nr", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError: missing 'result'");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: reject when zip root is not 'courses/'", async function () {
			try {
				const z = await getContentFromArchives("no_courses_root.zip");
				await facade.addDataset("sec_badroot", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError: files not under courses/");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: no result zip", async function () {
			try {
				const z = await getContentFromArchives("no_result.zip");
				await facade.addDataset("sec_badroot", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError: files not under courses/");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("addDataset: picture", async function () {
			try {
				const z = await getContentFromArchives("picture.zip");
				await facade.addDataset("sec_badroot", z, InsightDatasetKind.Sections);
				expect.fail("Should have thrown InsightError: files not under courses/");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});
	});
	// ===== removeDataset =====
	describe("removeDataset", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});
		it("removeDataset: should remove an existing dataset and return the id", async function () {
			// Arrange
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			// Act
			const removed = await facade.removeDataset("ubc");
			// Assert
			expect(removed).to.equal("ubc");
		});

		it("removeDataset: should reject when removing a dataset that was never added (NotFoundError)", async function () {
			try {
				await facade.removeDataset("ghost");
				expect.fail("Should have thrown!");
			} catch (err) {
				// 课程要求：有效但不存在 → NotFoundError
				expect(err).to.be.instanceOf(NotFoundError);
			}
		});

		it("removeDataset: should reject with an empty dataset id", async function () {
			try {
				await facade.removeDataset("");
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("removeDataset: should reject with a whitespace-only dataset id", async function () {
			try {
				await facade.removeDataset(" ");
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("removeDataset: should reject with a dataset id containing underscore", async function () {
			try {
				await facade.removeDataset("bad_id");
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("removeDataset: should allow removing from a new instance (persistence on disk)", async function () {
			// 在同一个测试里：先用实例A添加 → 再用实例B删除（期间不要 clearDisk）
			await facade.addDataset("persist", sections, InsightDatasetKind.Sections);
			const facade2 = new InsightFacade();
			const removed = await facade2.removeDataset("persist");
			expect(removed).to.equal("persist");
		});

		it("removeDataset: should reject on removing the same dataset twice (second time NotFoundError)", async function () {
			await facade.addDataset("twice", sections, InsightDatasetKind.Sections);
			await facade.removeDataset("twice"); // 第一次成功
			try {
				await facade.removeDataset("twice"); // 第二次应 NotFoundError
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(NotFoundError);
			}
		});
	});
	// listDataSet
	describe("listDatasets", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});
		it("listDatasets: returns empty array when nothing added", async function () {
			const listed = await facade.listDatasets();
			expect(listed).to.deep.equal([]);
		});

		it("listDatasets: lists one added dataset with metadata", async function () {
			await facade.addDataset("sections", sections, InsightDatasetKind.Sections);

			const listed = await facade.listDatasets();

			expect(listed).to.have.length(1);
			// 元数据检查
			expect(listed[0].id).to.equal("sections");
			expect(listed[0].kind).to.equal(InsightDatasetKind.Sections);
			expect(listed[0].numRows).to.be.greaterThan(0); // 不要写死具体行数
		});

		it("listDatasets: lists multiple datasets (order not specified)", async function () {
			await facade.addDataset("a", sections, InsightDatasetKind.Sections);
			await facade.addDataset("b", sections, InsightDatasetKind.Sections);

			const listed = await facade.listDatasets();

			// 顺序未指定，按集合来断言
			const ids = listed.map((d) => d.id);
			expect(ids).to.have.members(["a", "b"]);
			listed.forEach((d) => {
				expect(d.kind).to.equal(InsightDatasetKind.Sections);
				expect(d.numRows).to.be.greaterThan(0);
			});
		});

		it("listDatasets: persists to disk across instances", async function () {
			// 同一个 it 里：先用 facade1 添加，再 new 一个实例列出（不要清盘）
			await facade.addDataset("persist", sections, InsightDatasetKind.Sections);

			const facade2 = new InsightFacade();
			const listed = await facade2.listDatasets();

			expect(listed.map((d) => d.id)).to.include("persist");
			const entry = listed.find((d) => d.id === "persist")!;
			expect(entry.kind).to.equal(InsightDatasetKind.Sections);
			expect(entry.numRows).to.be.greaterThan(0);
		});
	});
	//PerformQuery
	describe("PerformQuery", function () {
		/**
		 * Loads the TestQuery specified in the test name and asserts the behaviour of performQuery.
		 *
		 * Note: the 'this' parameter is automatically set by Mocha and contains information about the test.
		 */
		const errors = new Map<string, typeof InsightError | typeof NotFoundError | typeof ResultTooLargeError>([
			["InsightError", InsightError],
			["NotFoundError", NotFoundError],
			["ResultTooLargeError", ResultTooLargeError],
		]);

		async function checkQuery(this: Mocha.Context): Promise<void> {
			if (!this.test) {
				throw new Error(
					"Invalid call to checkQuery." +
						"Usage: 'checkQuery' must be passed as the second parameter of Mocha's it(..) function." +
						"Do not invoke the function directly."
				);
			}
			// Destructuring assignment to reduce property accesses
			const { input, expected, errorExpected } = await loadTestQuery(this.test.title);
			let result: InsightResult[];
			try {
				result = await facade.performQuery(input);
				if (errorExpected) {
					expect.fail(`performQuery resolved when it should have rejected with ${expected}`);
				} else {
					expect(result).to.have.deep.members(expected);
				}
			} catch (err) {
				if (!errorExpected) {
					expect.fail(`performQuery threw unexpected error: ${err}`);
				} else {
					expect(err).to.be.instanceOf(errors.get(expected));
				}
			}
		}

		before(async function () {
			await clearDisk();
			facade = new InsightFacade();

			// Add the datasets to InsightFacade once.
			// Will *fail* if there is a problem reading ANY dataset.
			// 向 InsightFacade 添加一次数据集。如果读取数据集有问题，就会失败。
			const loadDatasetPromises: Promise<string[]>[] = [
				facade.addDataset("sections", sections, InsightDatasetKind.Sections),
			];

			try {
				await Promise.all(loadDatasetPromises);
			} catch (err) {
				throw new Error(`In PerformQuery Before hook, dataset(s) failed to be added. \n${err}`);
				// 如果添加数据集失败，在 PerformQuery 的 before 钩子里抛出错误
			}
		});

		after(async function () {
			await clearDisk();
			// 测试结束后清理磁盘
		});

		// 示例：演示如何使用 JSON 测试查询来测试 performQuery。
		// 注意：查询文件的相对路径必须放在中括号里。
		it("[valid/simple.json] SELECT dept, avg WHERE avg > 97", checkQuery);
		it("[invalid/invalid.json] Query missing WHERE", checkQuery);
		// 新增 invalid
		it("[invalid/emptyColumns.json] empty COLUMNS", checkQuery);
		it("[invalid/orderKeyNotInColumns.json] ORDER key not in COLUMNS", checkQuery);
		it("[invalid/invalidKeyDatasetIdWithUnderscore.json] invalid key: dataset id contains underscore", checkQuery);
		it("[invalid/unknownDatasetId.json] unknown dataset id in query", checkQuery);
		it("[invalid/malformedFilterType.json] GT expects number but got string", checkQuery);
		it("[invalid/emptyQueryObject.json] empty query object", checkQuery);
		it("[invalid/tooLarge.json] result too large", checkQuery);
		it("[invalid/missingCOLUMNS.json] missing COLUMNS", checkQuery);
		it("[invalid/columnsContainsKeysFromTwoDatasets.json] mix two datasets in columns", checkQuery);
		it("[invalid/emptyAnd.json] empty AND array", checkQuery);
		it("[invalid/emptyOr.json] empty OR array", checkQuery);
		// 新增 invalid 0915
		it("[invalid/orderAsObject.json] order As Object", checkQuery);
		it("[invalid/isMiddleWildcard.json] is Middle Wildcard", checkQuery);
		it("[invalid/queryNotObject.json] query Not Object", checkQuery);
		it("[invalid/whereNotObject.json] where Not Object", checkQuery);
		it("[invalid/missingOPTIONS.json] missing OPTIONS", checkQuery);
		it("[invalid/orderNotAQueryKey.json] order Not A Query Key", checkQuery);
		it("[invalid/isValueNotString.json] is Value Not String", checkQuery);
		it("[invalid/orderKeyFromOtherDataset.json] order Key From Other Dataset", checkQuery);
		it("[invalid/unexpectedTransformations.json] unexpected Transformations", checkQuery);
		it("[invalid/emptyNot.json] empty NOT", checkQuery);
		// 新增 invalid 0916
		it("[invalid/mcomparatorOnStringKey.json] mcomparator On String Key", checkQuery);
		it("[invalid/scomparisonOnNumericKey.json] s comparison On Numeric Key", checkQuery);
		it("[invalid/logicListHasNonFilter.json] logic List Has Non Filter", checkQuery);
		// 新增 valid
		it("[valid/is_suffix_wildcard.json] *son", checkQuery);
		it("[valid/is_contains_wildcard.json] *data*", checkQuery);
		it("[valid/and_numeric.json] AND: avg > 95 AND year = 2014", checkQuery);
		// 新增 valid 0916
		it("[valid/equal.json] EQ avg = 95", checkQuery);
		it("[valid/lt.json] LT avg < 60", checkQuery);
		it("[valid/or.json] OR dept=cpsc OR avg=95", checkQuery);
		// 新增 valid 0916
		it("[valid/complex_1.json] complex 1", checkQuery);
		it("[valid/complex_2.json] complex 2", checkQuery);
		it("[valid/complex_3.json] complex 3", checkQuery);
	});
});
