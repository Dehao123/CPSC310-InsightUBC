// src/rest/Server.ts
import express, { Express, Request, Response } from "express";
import cors from "cors";
import { Server as HttpServer } from "http";
// 根据你的项目结构，controller 在上一级目录
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

		// === 按 C3 要求的中间件顺序 ===
		this.express.use(express.json());
		this.express.use(express.raw({ type: "application/*", limit: "10mb" }));

		// 允许跨域请求，方便前端调你的后端
		this.express.use(cors());

		// 注册所有 REST 路由
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
				// 还没 start 过，直接 resolve 就行
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

	// 以后写 Server 的集成测试时会用到这个
	public getExpress(): Express {
		return this.express;
	}

	// ================== 这里是你 4 个功能的路由 ==================
	private registerRoutes(): void {
		// 1. 添加 dataset：PUT /api/v1/datasets/:id
		this.express.put("/api/v1/datasets/:id", (req: Request, res: Response) => {
			const id = req.params.id;
			const body = req.body; // Buffer，因为用了 express.raw

			if (!Buffer.isBuffer(body)) {
				res.status(400).json({ error: "Body must be a zip file" });
				return;
			}

			// InsightFacade.addDataset 需要 base64 字符串
			const content = body.toString("base64");

			this.insightFacade
				.addDataset(id, content, InsightDatasetKind.Sections)
				.then((result) => {
					// 这里统一用 200，就当“添加或更新成功”
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

		// 2. 列出 datasets：GET /api/v1/datasets
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

		// 3. 删除 dataset：DELETE /api/v1/datasets/:id
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

		// 4. 运行查询：POST /api/v1/query
		this.express.post("/api/v1/query", (req: Request, res: Response) => {
			const query = req.body; // JSON，由 express.json() 解析

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
