// src/rest/Server.ts
import express, { Express, Request, Response } from "express";
import cors from "cors";
import { Server as HttpServer } from "http";
import InsightFacade from "../controller/InsightFacade";
import { InsightDatasetKind, InsightError, NotFoundError } from "../controller/IInsightFacade";

export default class Server {
	private port: number;
	private express: Express;
	private insightFacade: InsightFacade;

	private server: HttpServer | null = null; // ⭐ 新增

	constructor(port: number) {
		this.port = port;
		this.express = express();
		this.insightFacade = new InsightFacade();

		this.express.use(express.json());
		this.express.use(express.raw({ type: "application/*", limit: "10mb" }));

		this.express.use(cors());

		this.registerRoutes();
	}

	public start(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.express
				.listen(this.port, () => {
					resolve();
				})
				.on("error", (err) => {
					reject(err);
				});
		});
	}

	public stop(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.server) {

				resolve();
				return;
			}

			this.server.close((err) => {
				if (err) {
					reject(err);
				} else {
					this.server = null;
					resolve();
				}
			});
		});
	}


	public getExpress(): Express {
		return this.express;
	}


	private registerRoutes(): void {
		// PUT /api/v1/datasets/:id
		this.express.put("/api/v1/datasets/:id", (req: Request, res: Response) => {
			const id = req.params.id;
			const body = req.body;

			if (!Buffer.isBuffer(body)) {
				res.status(400).json({ error: "Body must be a zip file" });
				return;
			}

			const content = body.toString("base64");

			this.insightFacade
				.addDataset(id, content, InsightDatasetKind.Sections)
				.then((result) => {
					res.status(200).json({ result });
				})
				.catch((err: any) => {
					if (err instanceof InsightError) {
						res.status(400).json({
							error: err.message ?? "InsightError",
						});
					} else {
						res.status(500).json({
							error: "Internal error while adding dataset",
						});
					}
				});
		});

		// GET /api/v1/datasets
		this.express.get("/api/v1/datasets", (_req: Request, res: Response) => {
			this.insightFacade
				.listDatasets()
				.then((result) => {
					res.status(200).json({ result });
				})
				.catch((_err: any) => {
					res.status(500).json({
						error: "Internal error while listing datasets",
					});
				});
		});

		// DELETE /api/v1/datasets/:id
		this.express.delete("/api/v1/datasets/:id", (req: Request, res: Response) => {
			const id = req.params.id;

			this.insightFacade
				.removeDataset(id)
				.then((result) => {
					res.status(200).json({ result });
				})
				.catch((err: any) => {
					if (err instanceof NotFoundError) {
						res.status(404).json({
							error: err.message ?? "NotFoundError",
						});
					} else if (err instanceof InsightError) {
						res.status(400).json({
							error: err.message ?? "InsightError",
						});
					} else {
						res.status(500).json({
							error: "Internal error while removing dataset",
						});
					}
				});
		});

		// POST /api/v1/query
		this.express.post("/api/v1/query", (req: Request, res: Response) => {
			const query = req.body;

			this.insightFacade
				.performQuery(query)
				.then((result) => {
					res.status(200).json({ result });
				})
				.catch((err: any) => {
					if (err instanceof InsightError) {
						res.status(400).json({
							error: err.message ?? "InsightError",
						});
					} else {
						res.status(500).json({
							error: "Internal error while performing query",
						});
					}
				});
		});
	}
}
