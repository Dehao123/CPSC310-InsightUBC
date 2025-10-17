import {
	IInsightFacade,
	InsightDatasetKind,
	InsightResult,
	InsightError,
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
	let facade: IInsightFacade;

	// Declare datasets used in tests. You should add more datasets like this!
	let sections: string;

	before(async function () {
		// This block runs once and loads the datasets.
		sections = await getContentFromArchives("pair.zip");

		// Just in case there is anything hanging around from a previous run of the test suite
		await clearDisk();
	});

	describe("AddDataset", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		// empty dataset id
		it("should reject with  an empty dataset id", async function () {
			try {
				await facade.addDataset("", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// whitespace dataset id
		it("AddDataset: should reject with an whitespace dataset id", async function () {
			try {
				await facade.addDataset(" ", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// underscore dataset id
		it("AddDataset: should reject with an underscore dataset id", async function () {
			// Read the "Free Mutant Walkthrough" in the spec for tips on how to get started!
			try {
				await facade.addDataset("ubc_courses", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// empty content
		it("AddDataset: should reject with an empty content", async function () {
			try {
				await facade.addDataset("ubc", "", InsightDatasetKind.Sections);
				expect.fail("should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceof(InsightError);
			}
		});

		// not base64 content
		it("AddDataset: should reject with an not base64 content", async function () {
			try {
				await facade.addDataset("ubc", "content", InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// empty course
		it("AddDataset: should reject with an empty course", async function () {
			try {
				const emptyCourse = await getContentFromArchives("emptyCourse.zip");
				await facade.addDataset("ubc", emptyCourse, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// empty section
		it("AddDataset: should reject with an empty section", async function () {
			try {
				const emptySection = await getContentFromArchives("emptySection.zip");
				await facade.addDataset("ubc", emptySection, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// empty Txt
		it("AddDataset: should reject with an empty Txt", async function () {
			try {
				const emptyTxt = await getContentFromArchives("emptyTxt.txt");
				await facade.addDataset("ubc", emptyTxt, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// invalid JSON
		it("AddDataset: should reject with an invalid JSON", async function () {
			try {
				const invalidJson = await getContentFromArchives("invalidJson.json");
				await facade.addDataset("ubc", invalidJson, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// not Txt in course
		it("AddDataset: should reject with an not Txt in course", async function () {
			try {
				const notTxtInCourse = await getContentFromArchives("notTxt.zip");
				await facade.addDataset("ubc", notTxtInCourse, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// not zip
		it("AddDataset: should reject with an not zip", async function () {
			try {
				const notZip = await getContentFromArchives("notZip.txt");
				await facade.addDataset("ubc", notZip, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// other name
		it("AddDataset: should reject with an other name", async function () {
			try {
				const otherName = await getContentFromArchives("otherName.zip");
				await facade.addDataset("ubc", otherName, InsightDatasetKind.Sections);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// add the same dataset id twice
		it("AddDataset: should reject with an same dataset id", async function () {
			try {
				await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
				await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
				expect.fail("should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceof(InsightError);
			}
		});

		//add one dataset
		it("AddDataset: should successfully add a dataset with a new id", async function () {
			const result = await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);

			expect(result).to.have.length(1);
			return expect(result).to.have.members(["ubc"]);
		});

		// add two datasets
		it("AddDataset: should successfully add two datasets", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);

			const newFacade = new InsightFacade();
			const courses = await getContentFromArchives("section.zip");
			const result = await newFacade.addDataset("sfu", courses, InsightDatasetKind.Sections);

			expect(result).to.include("ubc");
			expect(result).to.include("sfu");
		});

		// wrong kind
		it("AddDataset: should reject with an wrong kind", async function () {
			try {
				await facade.addDataset("ubc", sections, InsightDatasetKind.Rooms);
				expect.fail("Should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// clear disk
		it("should successfully add a dataset (first)", async function () {
			const result = await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);

			expect(result).to.have.members(["ubc"]);
		});
		it("should successfully add a dataset (second)", async function () {
			const result = await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);

			return expect(result).to.have.members(["ubc"]);
		});
	});

	describe("PerformQuery", function () {
		/**
		 * Loads the TestQuery specified in the test name and asserts the behaviour of performQuery.
		 *
		 * Note: the 'this' parameter is automatically set by Mocha and contains information about the test.
		 */
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
			let result: InsightResult[] = []; // dummy value before being reassigned
			try {
				result = await facade.performQuery(input);
				if (errorExpected) {
					expect.fail(`performQuery resolved when it should have rejected with ${expected}`);
				}
				// TODO: replace this failing assertion with your assertions. You will need to reason about the code in this function
				// to determine what to put here :)
				expect(result).to.deep.equal(expected);
			} catch (err) {
				if (!errorExpected) {
					expect.fail(`performQuery threw unexpected error: ${err}`);
				}
				// TODO: replace this failing assertion with your assertions. You will need to reason about the code in this function
				// to determine what to put here :)
				const errorMap = {
					InsightError,
					NotFoundError,
					ResultTooLargeError,
				} as const;

				const emap = errorMap[expected as keyof typeof errorMap];

				if (!emap) {
					expect.fail(`Unknown error type in test file: ${expected}`);
				}

				expect(err).to.be.instanceOf(emap);
				return;
			}
		}

		before(async function () {
			facade = new InsightFacade();

			// Add the datasets to InsightFacade once.
			// Will *fail* if there is a problem reading ANY dataset.
			const loadDatasetPromises: Promise<string[]>[] = [
				facade.addDataset("sections", sections, InsightDatasetKind.Sections),
			];

			try {
				await Promise.all(loadDatasetPromises);
			} catch (err) {
				throw new Error(`In PerformQuery Before hook, dataset(s) failed to be added. \n${err}`);
			}
		});

		after(async function () {
			await clearDisk();
		});

		// Examples demonstrating how to test performQuery using the JSON Test Queries.
		// The relative path to the query file must be given in square brackets.
		it("[valid/simple.json] SELECT dept, avg WHERE avg > 97", checkQuery);
		it("[invalid/invalid.json] Query missing WHERE", checkQuery);
		it("[invalid/emptyColumn.json] empty COLUMNS", checkQuery);
		it("[invalid/emptyQueryObject.json] empty Query Object", checkQuery);
		it("[invalid/idWithUnderscore.json] id With Underscore", checkQuery);
		it("[invalid/numberButString.json] GT Expects Number but String", checkQuery);
		it("[invalid/tooLarge.json] too large", checkQuery);
		it("[invalid/wrongOrderKey.json] wrongOrderKey", checkQuery);
		it("[invalid/emptyOr.json] emptyOr", checkQuery);
		it("[invalid/unknownDataset.json] unknownDataset", checkQuery);
		it("[invalid/missingOPTIONS.json] missingOPTIONS", checkQuery);
		it("[invalid/emptyAnd.json] emptyAnd", checkQuery);
		it("[invalid/emptyNot.json] emptyNot", checkQuery);
		it("[invalid/mixDataset.json] mixDataset", checkQuery);
		it("[invalid/middleWildcard.json] middleWildcard", checkQuery);
		it("[invalid/invalidKeyTypeInGT.json] invalidKeyTypeInGT", checkQuery);
		it("[invalid/invalidValueTypeInIS.json] invalidValueTypeInIS", checkQuery);
		it("[invalid/oRMustBeObject.json] oRMustBeObject", checkQuery);
		it("[invalid/missingColumn.json] missingColumn", checkQuery);
		it("[invalid/queryMustBeObject.json] queryMustBeObject", checkQuery);
		it("[invalid/whereMustBeObject.json] whereMustBeObject", checkQuery);
		it("[invalid/queryMoreThanOneDataset.json] queryMoreThanOneDataset", checkQuery);
		it("[valid/andStatement.json] and Statement", checkQuery);
		it("[valid/aE.json] *ae*", checkQuery);
		it("[valid/a.json] *a", checkQuery);
		it("[valid/rightWildcards.json] rightWildcards", checkQuery);
		it("[valid/gt91.json] gt 91", checkQuery);
		it("[valid/inputString.json] inputString", checkQuery);
		it("[valid/nestAndOr.json] nestAndOr", checkQuery);
		it("[valid/nestOrAnd.json] nestOrAnd", checkQuery);
		it("[valid/onlyLT.json] onlyLT", checkQuery);
		it("[valid/onlyEQ.json] onlyEQ", checkQuery);
		it("[valid/eqOrLT.json] eqOrLT", checkQuery);
		it("[valid/nest1.json] nest1", checkQuery);
		it("[valid/nest2.json] nest2", checkQuery);
		it("[valid/nest3.json] nest3", checkQuery);
	});

	//Remove Dataset
	describe("removeDataset", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		// empty id
		it("removeDataset: should reject with an empty id", async function () {
			try {
				await facade.removeDataset("");
				expect.fail("should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// invalid id with whitespace
		it("removeDataset: should reject with an invalid id with whitespace", async function () {
			try {
				await facade.removeDataset(" ");
				expect.fail("should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// invalid id with underscore
		it("removeDataset: should reject with an invalid id with underscore", async function () {
			try {
				await facade.removeDataset("ubc_courses");
				expect.fail("should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		// not found id
		it("removeDataset: should reject with an not found id", async function () {
			try {
				await facade.addDataset("UBC", sections, InsightDatasetKind.Sections);
				await facade.removeDataset("SFU");
				expect.fail("should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(NotFoundError);
			}
		});

		// second remove fails
		it("removeDataset: should reject with a not found id", async function () {
			await facade.addDataset("UBC", sections, InsightDatasetKind.Sections);
			const result = await facade.removeDataset("UBC");

			expect(result).to.equal("UBC");

			try {
				await facade.removeDataset("UBC");
				expect.fail("should have thrown!");
			} catch (err) {
				expect(err).to.be.instanceOf(NotFoundError);
			}
		});

		// fulfilled remove one dataset
		it("removeDataset: should successfully remove a dataset", async function () {
			await facade.addDataset("UBC", sections, InsightDatasetKind.Sections);
			const result = await facade.removeDataset("UBC");
			expect(result).to.equal("UBC");
		});

		// fulfilled remove two datasets
		it("removeDataset: should successfully remove two datasets", async function () {
			await facade.addDataset("UBC", sections, InsightDatasetKind.Sections);
			await facade.addDataset("SFU", sections, InsightDatasetKind.Sections);
			const result = await facade.removeDataset("UBC");
			expect(result).to.equal("UBC");
			const result2 = await facade.removeDataset("SFU");
			expect(result2).to.equal("SFU");
		});
	});

	// listDatasets
	describe("listDatasets", function () {
		beforeEach(async function () {
			await clearDisk();
			facade = new InsightFacade();
		});

		// return empty when nothing
		it("listDatasets: should return empty when nothing added", async function () {
			const result = await facade.listDatasets();
			expect(result).to.be.an("array");
			expect(result).to.be.empty;
		});

		// one added dataset
		it("listDatasets: should return one added dataset", async function () {
			await facade.addDataset("UBC", sections, InsightDatasetKind.Sections);

			const result = await facade.listDatasets();
			expect(result).to.have.length(1);
			expect(result[0].id).to.equal("UBC");
			expect(result[0].numRows).to.greaterThan(0);
			expect(result[0].kind).to.equal(InsightDatasetKind.Sections);
		});

		// two added datasets
		it("listDatasets: should return two added dataset", async function () {
			await facade.addDataset("UBC", sections, InsightDatasetKind.Sections);
			await facade.addDataset("SFU", sections, InsightDatasetKind.Sections);

			const result = await facade.listDatasets();
			expect(result).to.have.length(2);
			expect(result[0].id).to.equal("UBC");
			expect(result[0].numRows).to.be.greaterThan(0);
			expect(result[0].kind).to.equal(InsightDatasetKind.Sections);

			expect(result[1].id).to.equal("SFU");
			expect(result[1].numRows).to.be.greaterThan(0);
			expect(result[1].kind).to.equal(InsightDatasetKind.Sections);
		});

		// // after remove dataset
		// it("listDatasets: should return one dataset after remove dataset", async function () {
		// 	await facade.addDataset("UBC", sections, InsightDatasetKind.Sections);
		// 	await facade.addDataset("SFU", sections, InsightDatasetKind.Sections);
		// 	await facade.removeDataset("UBC");
		//
		// 	const result = await facade.listDatasets();
		// 	expect(result).to.have.length(1);
		// 	expect(result[0].id).to.equal("SFU");
		// 	expect(result[0].numRows).to.be.greaterThan(0);
		// 	expect(result[0].kind).to.equal(InsightDatasetKind.Sections);
		// });
		//
		// // after remove two datasets
		// it("listDatasets: should return empty after remove two datasets", async function () {
		// 	await facade.addDataset("UBC", sections, InsightDatasetKind.Sections);
		// 	await facade.addDataset("SFU", sections, InsightDatasetKind.Sections);
		// 	await facade.removeDataset("UBC");
		// 	await facade.removeDataset("SFU");
		//
		// 	const result = await facade.listDatasets();
		// 	expect(result).to.be.an("array");
		// 	expect(result).to.be.empty;
		// });
	});
});
