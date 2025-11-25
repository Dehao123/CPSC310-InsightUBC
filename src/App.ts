// src/App.ts
import Server from "./rest/Server";

const port = 4321; // 你的服务器端口，和前端 baseUrl 里的 4321 对应

const server = new Server(port);

server.start()
	.then(() => {
		console.log(`Server started on port ${port}`);
	})
	.catch((err) => {
		console.error("Server failed to start:", err);
	});
