# InsightUBC Architecture Documentation

## 1. Architecture Diagram (Components + Arrows + Data Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  index.html + app.js                                       │  │
│  │  - UI rendering                                            │  │
│  │  - User interaction handling                                │  │
│  │  - HTTP request sending                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP (REST API)
                              │ JSON / Binary (zip)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      REST API Layer (Server.ts)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Express Server                                           │  │
│  │  - Route registration (registerRoutes)                    │  │
│  │  - Request parsing (express.json, express.raw)            │  │
│  │  - CORS handling                                          │  │
│  │  - Error handling (InsightError, NotFoundError)          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ calls                             │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  InsightFacade (Business Logic Layer)                     │  │
│  │  - addDataset()                                           │  │
│  │  - removeDataset()                                        │  │
│  │  - listDatasets()                                         │  │
│  │  - performQuery()                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ data operations
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Persistence Layer                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  In-Memory Storage                                        │  │
│  │  - Map<string, InsightDataset> datasets                  │  │
│  │  - Map<string, SectionRow[]> data                        │  │
│  │  - Map<string, RoomRow[]> dataRooms                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ persistence                       │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  File System                                              │  │
│  │  - ./data/*.sections.json                                 │  │
│  │  - ./data/*.rooms.json                                    │  │
│  │  - fs-extra (read/write operations)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ external service calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Geocoding Service                                        │  │
│  │  http://cs310.students.cs.ubc.ca:11316/api/v1/...        │  │
│  │  - geoLookup(address) → {lat, lon}                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

Data Flow Direction:
1. User action → Frontend → HTTP request → REST API
2. REST API → InsightFacade → Business logic processing
3. InsightFacade → In-memory storage (read/write)
4. InsightFacade → File system (persistence)
5. InsightFacade → External service (geocoding)
6. Response data flows back to frontend
```

## 2. Architecture Analysis

### Strength: Single Responsibility Principle

**The `InsightFacade` class follows the Single Responsibility Principle by focusing solely on dataset business logic, making each method independently testable and maintainable.**

### Weakness: Tight Coupling and Testing Difficulties

**The `Server` class directly instantiates `InsightFacade` without dependency injection, creating tight coupling that makes it difficult to mock the facade in integration tests and violates the Dependency Inversion Principle.**

## 3. End-to-End Workflow

**A user uploads a dataset (PUT request with zip file → parsed and persisted) then executes a query (POST request with query object → filtered, projected, and sorted results returned to frontend for display).**

```
┌──────────┐
│   User   │
└────┬─────┘
     │ 1. Select sections.zip, enter dataset id = "cpsc310"
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (app.js)                                           │
│  - uploadDataset()                                           │
│  - Read file as ArrayBuffer                                   │
│  - Build PUT request                                          │
└────┬────────────────────────────────────────────────────────┘
     │ 2. PUT /api/v1/datasets/cpsc310
     │    Body: ArrayBuffer (zip file)
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Server.ts (registerRoutes)                                  │
│  - Receive PUT request                                       │
│  - Validate body is Buffer                                  │
│  - Convert to base64 string                                  │
└────┬────────────────────────────────────────────────────────┘
     │ 3. insightFacade.addDataset(id, content, kind)
     ▼
┌─────────────────────────────────────────────────────────────┐
│  InsightFacade.addDataset()                                  │
│  - Validate id format (no underscores)                     │
│  - Check if exists (memory + disk)                          │
│  - JSZip.loadAsync() parse zip                              │
│  - parseSectionsFromZip() parse JSON files                 │
│  - Write data to memory Map                                 │
│  - fs.writeJson() persist to ./data/cpsc310.sections.json  │
└────┬────────────────────────────────────────────────────────┘
     │ 4. Return string[] (all dataset ids)
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Server.ts                                                    │
│  - Wrap response: { result: string[] }                       │
│  - Return HTTP 200                                           │
└────┬────────────────────────────────────────────────────────┘
     │ 5. HTTP 200 { result: ["cpsc310"] }
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (app.js)                                           │
│  - Display success message                                   │
│  - Auto-call listDatasets() to refresh list                 │
└─────────────────────────────────────────────────────────────┘

┌──────────┐
│   User   │
└────┬─────┘
     │ 6. Select dataset "cpsc310", enter query conditions
     │    (dept = "CPSC", avg > 80)
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (app.js)                                           │
│  - buildSimpleQuery() build query object                    │
│  - { WHERE: { AND: [{IS: {cpsc310_dept: "CPSC"}},          │
│                     {GT: {cpsc310_avg: 80}}]},            │
│     OPTIONS: { COLUMNS: [...], ORDER: {...} } }            │
└────┬────────────────────────────────────────────────────────┘
     │ 7. POST /api/v1/query
     │    Body: JSON query object
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Server.ts                                                    │
│  - Receive POST request                                      │
│  - Extract req.body (query object)                          │
└────┬────────────────────────────────────────────────────────┘
     │ 8. insightFacade.performQuery(query)
     ▼
┌─────────────────────────────────────────────────────────────┐
│  InsightFacade.performQuery()                                │
│  - Validate query structure (WHERE, OPTIONS)                │
│  - Extract dataset id from WHERE ("cpsc310")                 │
│  - Get data from memory Map: data.get("cpsc310")            │
│  - evalWhereGeneric() filter data                            │
│  - Apply OPTIONS.COLUMNS projection                         │
│  - Apply OPTIONS.ORDER sorting                               │
│  - Check result count (≤ 5000)                              │
└────┬────────────────────────────────────────────────────────┘
     │ 9. Return InsightResult[]
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Server.ts                                                    │
│  - Wrap response: { result: InsightResult[] }                │
│  - Return HTTP 200                                            │
└────┬────────────────────────────────────────────────────────┘
     │ 10. HTTP 200 { result: [...] }
     ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (app.js)                                           │
│  - renderSimpleQueryTable() render table                     │
│  - updateInsightCharts() generate visualization charts      │
└─────────────────────────────────────────────────────────────┘
```

## 4. Alternative Design

**An alternative design introduces Repository pattern and Service layer (QueryService → DatasetRepository → DataStore + QueryEngine) to improve extensibility and testability, but increases code complexity and development time.**

```
Current Architecture:
Frontend → Server → InsightFacade → Memory/FileSystem

Alternative Architecture:
Frontend → Server → QueryService → DatasetRepository → DataStore
                              ↓
                         QueryEngine
```

**Tradeoff 1: Complexity vs Extensibility**

**The Repository pattern increases code complexity with multiple interfaces and classes, but provides strong extensibility by allowing easy replacement of data storage implementations (memory → database → distributed storage) and better separation of concerns for testing.**

**Tradeoff 2: Performance vs Flexibility**

**The layered architecture adds abstraction overhead and learning curve, but enables query optimization (indexing, caching, parallel processing) and flexible data source switching without affecting business logic.**

## 5. REST API Endpoints

### Endpoint List

| Method | Path | Function | Request Body | Response Body |
|--------|------|----------|--------------|--------------|
| `PUT` | `/api/v1/datasets/:id` | Add dataset | Binary (zip file) | `{ result: string[] }` |
| `GET` | `/api/v1/datasets` | List all datasets | - | `{ result: InsightDataset[] }` |
| `DELETE` | `/api/v1/datasets/:id` | Remove dataset | - | `{ result: string }` |
| `POST` | `/api/v1/query` | Execute query | `{ WHERE: {...}, OPTIONS: {...} }` | `{ result: InsightResult[] }` |

### Design Rationale

#### 1. `PUT /api/v1/datasets/:id` - Add Dataset

**Uses PUT for idempotency (duplicate id returns 400) and semantic clarity (placing resource at specific location), with `/api/v1/datasets/:id` following RESTful resource-oriented naming and versioning conventions.**

#### 2. `GET /api/v1/datasets` - List Datasets

**Uses GET for safe, idempotent read-only operations that are cache-friendly, following REST standard for resource collection retrieval.**

#### 3. `DELETE /api/v1/datasets/:id` - Remove Dataset

**Uses DELETE for clear semantic meaning and idempotency, with `:id` in path to explicitly identify the resource and prevent accidental deletion of all datasets.**

#### 4. `POST /api/v1/query` - Execute Query

**Uses POST instead of GET because complex query objects (WHERE, OPTIONS, TRANSFORMATIONS) exceed URL length limits and should be in request body, with `/query` as an independent operation rather than a dataset sub-resource to allow future multi-dataset queries.**

