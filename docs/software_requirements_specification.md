# Software Requirements Specification (SRS)
## Project: CodeMap (CodeGraph)
**Version:** 1.1.0  
**Date:** June 25, 2026  
**Role:** System Architect  

---

## 1. Introduction

### 1.1 Purpose
This document specifies the software requirements and system architecture for **CodeMap (CodeGraph)**. CodeMap is an interactive visual codebase exploration tool. It traverses a local project repository, computes file dependency connections via Abstract Syntax Tree (AST) parsing, visualizes the relationships on an interactive 2D canvas, and leverages Google Gemini to resolve semantic queries by highlighting dependency pathways.

### 1.2 Scope
CodeMap targets developers, architects, and technical educators. Key features include:
*   A high-performance interactive dependency canvas showing file nodes and import links.
*   A sandboxed, multi-language codebase dependency parser.
*   A query API that prunes context and routes queries to Google Gemini.
*   A structured representation of codebase execution traces mapped directly onto the canvas.

---

## 2. Architecture Overview

CodeMap is built as a client-server web application. The frontend uses Next.js and React, employing HTML5 Canvas for graphing. The backend utilizes Next.js API Routes for workspace parsing and Gemini coordination.

### 2.1 Component Block Diagram

```mermaid
graph TD
    subgraph Client [Client Frontend - Next.js / React]
        UI[Workspace Control & Chat Panel]
        Canvas[HTML5 Canvas Renderer]
        Worker[Web Worker - D3-Force Physics Engine]
        QuadTree[D3 Quadtree Spatial Index]
        CoordCache[Coord Cache Ref]

        UI --> Canvas
        Canvas -->|MouseMove Events| QuadTree
        Worker -->|postMessage x, y coordinates| CoordCache
        Canvas -.->|requestAnimationFrame read| CoordCache
    end

    subgraph SecurityBoundary [Security Sandbox Boundary]
        subgraph Server [Server Backend - Next.js API Routes]
            API_Parse[Parse API Endpoint /api/parse]
            API_Query[Query RAG Endpoint /api/query]
            DirWalker[Directory Traverser]
            RealpathResolver[RealPath & Extension Validator]
            ASTParser[AST Dependency Resolver]
            Pruner[Sub-Graph BFS Extractor]
            GeminiClient[Gemini API Client]

            API_Parse --> DirWalker
            DirWalker --> RealpathResolver
            RealpathResolver --> ASTParser
            API_Query --> Pruner
            Pruner --> GeminiClient
        end
        
        subgraph FileSystem [Local Filesystem]
            TargetRepo[Target Repository Root]
        end
        
        RealpathResolver -.->|fs.realpath Check| TargetRepo
    end

    UI <==>|POST /api/parse| API_Parse
    UI <==>|POST /api/query| API_Query
    GeminiClient <==>|Gemini API (Structured Outputs)| Gemini[Google Gemini Model]

    style SecurityBoundary fill:#fdf3e2,stroke:#ffc107,stroke-width:2px,stroke-dasharray: 5 5
    style FileSystem fill:#f8f9fa,stroke:#6c757d,stroke-width:1px
```

### 2.2 System Execution Flow
1.  **Safety Verification**: The backend processes target directory input, resolving physical paths to prevent directory traversal and symlink escapes.
2.  **Code Compilation**: The `Directory Traverser` walks safe files, sending code to the AST parsing engine to build nodes and links.
3.  **Visualization Thread Decoupling**: The serialized graph JSON is returned to the client. Node and link structures are loaded into the **Web Worker** which runs the D3 physics math. The canvas context draws coordinates using `requestAnimationFrame`.
4.  **Spatial Indexing**: Node coordinates are loaded into a **D3 Quadtree** to handle hover checks.
5.  **RAG Context Pipeline**: When the user enters a query, the backend executes a **BFS sub-graph trace** around semantic "Seed Nodes", serializes the structure, chunks file code snippets, and returns the path highlight sequences via Gemini's structured response.

---

## 3. Data Schema & Graph Models

### 3.1 Node Model Schema
A **Node** represents a structural entity (directory, file, or class/function) inside the repository.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier. Formatted as root-relative file path (e.g., `src/db/client.ts`). |
| `name` | `string` | Display name of the file or directory. |
| `path` | `string` | Absolute path (re-validated on server) or relative path. |
| `type` | `'file' \| 'directory' \| 'symbol'` | Node granularity classification. |
| `size` | `number` | Size in bytes (must not exceed configured max size). |
| `language` | `string` | Normalized language identifier (e.g., `typescript`, `python`). |

### 3.2 Link Model Schema
A **Link** represents a directed dependency or container connection between nodes.

| Field Name | Type | Description |
| :--- | :--- | :--- |
| `source` | `string` | The dependent source node `id`. |
| `target` | `string` | The dependency target node `id`. |
| `type` | `'import' \| 'contains'` | Relationship type. |

### 3.3 TypeScript Interfaces

```typescript
export type NodeType = 'file' | 'directory' | 'symbol';
export type LinkType = 'import' | 'contains';

export interface CodeGraphNode {
  id: string;
  name: string;
  path: string;
  type: NodeType;
  size: number;
  language: string;
}

export interface CodeGraphLink {
  source: string;
  target: string;
  type: LinkType;
}

export interface CodeGraph {
  rootPath: string;
  nodes: CodeGraphNode[];
  links: CodeGraphLink[];
}

export interface QueryPathResponse {
  paths: string[][]; // Multi-step sequences: [["src/index.ts", "src/db/client.ts"]]
  explanation: string; // Explanatory text summarizing the pathway
}
```

---

## 4. Code Dependency Parser & Security Sandbox

To protect server integrity, the backend directory traverser implements strict sandboxing.

### 4.1 Security Boundaries (ACT-01 & ACT-02)

> [!IMPORTANT]
> To prevent directory traversal bypasses and symlink file leaks, simple string checks (like `startsWith`) are prohibited. All paths must be normalized and verified against physical disk location.

1.  **Symlink Resolution (`fs.realpath`)**: Every node's physical path must be resolved using `fs.realpath` before safety checks to prevent directory escaping via symlinks.
2.  **Relative Path Verification (`path.relative`)**: Safety boundary checking must confirm the target path resides strictly inside the root container.

```typescript
// Conceptual Validation Logic (Required Backend Check)
import path from 'path';
import { promises as fs } from 'fs';

async function validatePathSecurity(targetPath: string, rootPath: string): Promise<string> {
  const resolvedRoot = await fs.realpath(path.resolve(rootPath));
  const resolvedTarget = await fs.realpath(path.resolve(targetPath));
  
  const relative = path.relative(resolvedRoot, resolvedTarget);
  
  const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (!isSafe && resolvedTarget !== resolvedRoot) {
    throw new Error("Access Denied: Path escapes sandbox boundary");
  }
  return resolvedTarget;
}
```

### 4.2 File Validation Policies (ACT-07)
*   **File Extension Whitelist**: Only parse code and text files: `.js`, `.jsx`, `.ts`, `.tsx`, `.py`, `.go`, `.rs`, `.json`, `.md`, `.css`.
*   **File Size Limit**: Reject processing any file larger than **1 MB** to prevent server exhaustion and parsing timeouts.

### 4.3 Resolution Rules
*   **Relative Paths**: Map `import { x } from './utils'` relative to the source node's path.
*   **Alias Resolution**: Parse the workspaces' config files (e.g. `tsconfig.json` or `package.json` exports) to resolve custom alias mappings (e.g. `@/components/*`).
*   **Cascading Lookup**: Try resolving in sequence: `.ts` -> `.tsx` -> `.js` -> `.jsx` -> `/index.ts` -> `/index.js`.

---

## 5. RAG & Gemini Integration

The query RAG system analyzes questions, gathers localized code architecture snapshots, and uses Gemini to map execution flow paths.

### 5.1 Sub-Graph Context Extraction (ACT-04)
To provide continuous context paths without exceeding Gemini's token budget, the system extracts a localized sub-graph:
1.  **Seed Node Selection**: Perform a keyword match or semantic index query on nodes to find files containing queried terms.
2.  **Breadth-First Search (BFS)**: From these seeds, perform a BFS traversal of links up to depth $D = 2$ to discover intermediate files.
3.  **Topology Assembly**: Collect the identifiers and dependency connections of all files in this sub-graph.
4.  **AST-Based Snippet Chunking**: Instead of sending full files, extract only export declarations, class names, method signatures, and code chunks containing the target keywords. Remove imports, static configuration tables, and internal utility lines.

### 5.2 Dense Prompt Graph Serialization
Format nodes and links using token-efficient representations instead of verbose JSON configurations:

```
[NODES]
src/index.ts [file, 12KB, ts]
src/db/client.ts [file, 4KB, ts]
src/db/connector.ts [file, 8KB, ts]

[DEPENDENCY EDGES]
src/index.ts -> src/db/client.ts
src/db/client.ts -> src/db/connector.ts
```

### 5.3 Structured Prompt Template
The backend prompt contains the serialized graph, AST code snippets, user query, and formatting rules:

```
You are an expert codebase exploration assistant.
Below is a sub-graph of dependency relations and code fragments.

--- DEPENDENCY SUB-GRAPH ---
[Dense Graph Serialization]

--- AST SNIPPETS ---
File: src/db/client.ts
[AST Chunks]

File: src/db/connector.ts
[AST Chunks]
--------------------

Query: "[User Query]"

Tasks:
1. Trace the sequential execution paths mapping source nodes to destination nodes answering the user query.
2. Output a structured JSON response matching the schema.
```

### 5.4 JSON Schema Enforcement
The request to Gemini enforces the structured schema:
```json
{
  "type": "OBJECT",
  "properties": {
    "paths": {
      "type": "ARRAY",
      "items": {
        "type": "ARRAY",
        "items": { "type": "STRING" }
      }
    },
    "explanation": { "type": "STRING" }
  },
  "required": ["paths", "explanation"]
}
```

---

## 6. Canvas Force Simulation & Visual Performance

To render 1,000+ nodes smoothly at 60 FPS, the client decouples math execution and rendering.

### 6.1 Web Worker Architecture (ACT-03)
Calculations are offloaded to a Web Worker thread, keeping the main React/UI thread non-blocking.

```
+---------------------------------------+
|             Main UI Thread            |
+---------------------------------------+
   |                                 ^
   | 1. Send Nodes/Links             | 3. postMessage(Updated Coords)
   v                                 |
+---------------------------------------+
|           Web Worker Thread           |
|  - Runs: d3.forceSimulation           |
|  - Listens to tick events             |
+---------------------------------------+
```

1.  **Initialization**: The main thread creates the worker and passes the node/link arrays:
    `worker.postMessage({ type: 'init', nodes, links, width, height })`.
2.  **Worker Loop**: The worker instantiates `d3.forceSimulation()`, updating node coordinates asynchronously.
3.  **Coordinate Dispatch**: On tick updates, the worker pushes the node coordinates array (e.g. `Float32Array` or light objects `{id, x, y}`) to the main thread:
    `postMessage({ type: 'tick', coordinates })`.
4.  **React State Decoupling**: The main thread intercepts these ticks and updates a mutable `useRef` coordinate cache (`nodeCoordsRef.current`). React state is **not** updated on simulation ticks.
5.  **Rendering Loop**: A `requestAnimationFrame` loop reads coordinates directly from `nodeCoordsRef.current` and draws to the `<canvas>` context.

### 6.2 Spatial Indexing for Interactions (ACT-06)
To keep mouse hover detection latency below **10ms**:
*   The main thread constructs a **D3 Quadtree** (`d3.quadtree()`) using the coordinates stored in the `nodeCoordsRef.current` cache.
*   On canvas mouse movements, the spatial index is queried to identify target nodes within a search radius:
    `const hoveredNode = quadtree.find(mouseX, mouseY, radiusLimit)`.
*   This drops the lookup complexity from $O(N)$ to $O(\log N)$.

### 6.3 Force Layout Configuration
The worker runs D3-force simulation constraints configured for workspace visual networks:
*   `charge`: `-180` (repulsion to separate files).
*   `link`: Distance configured to `60` pixels to maintain clear import steps.
*   `collision`: Radius calculated dynamically to prevent overlapping:
    $$\text{Radius}(x) = R_{\min} + k \cdot \ln(\text{Size} + 1)$$
*   `center`: Pulls nodes toward coordinates `(width / 2, height / 2)`.

---

## 7. Developer Milestone & Learning Roadmap (ACT-05)

The implementation path is structured into five milestones to guide developers through compilation, physics, and RAG architectures.

```mermaid
gantt
    title CodeMap Implementation Phases
    dateFormat  X
    axisFormat %d
    section Backend Core
    Milestone 1: File Traverser & Regex Engine     :active, 0, 7
    Milestone 2: AST Parser & Path Resolvers       : 7, 14
    section UI & Canvas
    Milestone 3: Worker-Decoupled Canvas & Quadtree: 14, 21
    section AI & RAG
    Milestone 4: BFS Sub-Graph & Chunk Pruning     : 21, 28
    Milestone 5: Gemini Structured API & Highlighting: 28, 35
```

### Milestone 1: Traverser & Regex Engine (The Foundation)
*   **Tasks**: Implement recursive directory walker checking `.gitignore` limits, file whitelists, and maximum sizes (1MB limit). Apply `fs.realpath` and `path.relative` validations.
*   **Assessment Checkpoint**: CLI script parsing target workspace and returning list of whitelisted files, failing with error on directory traversal or symlink escape inputs.

### Milestone 2: AST Parser & Path Resolvers (The Compiler)
*   **Tasks**: Integrate `@babel/parser` to capture imports. Implement path resolver to transform relative paths and configuration aliases into valid target nodes.
*   **Assessment Checkpoint**: CLI test verifying exact resolution of relative (`../utils`) and aliased (`@/db`) paths into correct edge entries in the output graph.

### Milestone 3: Canvas Rendering & Web Workers (The Visualization)
*   **Tasks**: Setup Web Worker running D3-force physics, decouple coordinate ticks from React state via `useRef`, build `requestAnimationFrame` render loop, and implement a `d3.quadtree` hover detector.
*   **Assessment Checkpoint**: Rendering test demonstrating smooth 60 FPS performance for 1,000+ nodes under continuous drag, zoom, and sub-10ms hover detection.

### Milestone 4: Context Pruning & Sub-Graphs (The Retrieval)
*   **Tasks**: Build BFS-based graph crawling up to depth $D=2$ around semantic seed nodes. Implement AST snippet chunking for matched files and compact token-efficient graph serialization.
*   **Assessment Checkpoint**: Unit test verifying that a search query produces a cohesive sub-graph structure containing only relevant, chunked export/class signatures.

### Milestone 5: Structured Gemini Integration (The Execution)
*   **Tasks**: Configure backend `/api/query` API route running Gemini structured output schema. Set up frontend pathway highlighting mapping returned routes with distinct styling.
*   **Assessment Checkpoint**: End-to-end integration test demonstrating natural language trace requests successfully rendering highlight paths on the canvas.
