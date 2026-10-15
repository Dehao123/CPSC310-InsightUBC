// test/rest/Server.spec.ts

import { expect } from "chai";
import request from "supertest";
import * as fs from "fs";
import Server from "../../src/rest/Server";

describe("Server integration tests", function () {
	this.timeout(10000);

	let server: Server;

	let agent: any;

	before(async () => {
		if (fs.existsSync("./data")) {
			fs.rmSync("./data", { recursive: true, force: true });
		}

		const port = 4321;
		server = new Server(port);
		await server.start();

		agent = request(server.getExpress());
	});

	after(async () => {
		await server.stop();
	});

	it("US1: PUT /api/v1/datasets/sections should add sections dataset", async () => {
		const zip = fs.readFileSync("./test/resources/archives/pair.zip");

		const res = await agent
			.put("/api/v1/datasets/sections")
			.set("Content-Type", "application/x-zip-compressed")
			.send(zip);

		expect(res.status).to.equal(200);
		expect(res.body).to.have.property("result");
		expect(res.body.result).to.be.an("array");
		expect(res.body.result).to.include("sections");
	});

	it("US2: GET /api/v1/datasets should include sections dataset", async () => {
		const res = await agent.get("/api/v1/datasets");

		expect(res.status).to.equal(200);
		expect(res.body).to.have.property("result");
		const datasets = res.body.result;

		expect(datasets).to.be.an("array");

		const sections = datasets.find((d: any) => d.id === "sections");
		expect(sections).to.exist;
		expect(sections.kind).to.equal("sections");
		expect(sections.numRows).to.be.greaterThan(0);
	});

	it("US3: POST /api/v1/query should return avg grade per dept in descending order", async () => {
		const query = {
			WHERE: {},
			OPTIONS: {
				COLUMNS: ["sections_dept", "avgGrade"],
				ORDER: {
					dir: "DOWN",
					keys: ["avgGrade"],
				},
			},
			TRANSFORMATIONS: {
				GROUP: ["sections_dept"],
				APPLY: [
					{
						avgGrade: { AVG: "sections_avg" },
					},
				],
			},
		};

		const res = await agent.post("/api/v1/query").set("Content-Type", "application/json").send(query);

		expect(res.status).to.equal(200);
		expect(res.body).to.have.property("result");
		const rows = res.body.result;
		expect(rows).to.be.an("array");
		expect(rows.length).to.be.greaterThan(0);

		for (let i = 1; i < rows.length; i++) {
			expect(rows[i - 1].avgGrade).to.be.at.least(rows[i].avgGrade);
		}
	});

	it("US3-invalid: POST /api/v1/query should return 400 for invalid query", async () => {
		const badQuery = {
			OPTIONS: {
				COLUMNS: ["sections_dept", "sections_id", "sections_avg"],
			},
		};

		const res = await agent.post("/api/v1/query").set("Content-Type", "application/json").send(badQuery);

		expect(res.status).to.equal(400);
		expect(res.body).to.have.property("error");
	});

	it("US4: DELETE /api/v1/datasets/sections should remove dataset", async () => {
		const res = await agent.delete("/api/v1/datasets/sections");

		expect(res.status).to.equal(200);
		expect(res.body).to.have.property("result");
		expect(res.body.result).to.equal("sections");
	});

	it("US4-invalid: DELETE /api/v1/datasets/sections again should return 404", async () => {
		const res = await agent.delete("/api/v1/datasets/sections");

		expect(res.status).to.equal(404);
		expect(res.body).to.have.property("error");
	});

	it("Unknown route should return 404", async () => {
		const res = await agent.get("/api/v1/this/route/does/not/exist");
		expect(res.status).to.equal(404);
	});
});
