export type FileExtension = string; // Broad strings replaced by specific types later or just stick to string for now?
// Actually, the user asked to: "Replace broad string fields with unions, eliminate any in QueryResponse"

export type NodeType =
  | "ts"
  | "tsx"
  | "js"
  | "jsx"
  | "py"
  | "go"
  | "rs"
  | "json"
  | "css"
  | "html"
  | "md"
  | "unknown"
  | string;
// Because we might scan other things, string is needed, but we can do a strict union.
export type LinkRelation = "static-import" | "dynamic-require" | "type-import";

export interface CodeNode {
  id: string; // Relative file path (unique identifier)
  name: string; // Base file name
  type: NodeType; // File extension (js, ts, py, etc.)
  size: number; // File size in bytes
  lines: number; // Total lines of code
}

export interface CodeLink {
  source: string; // id of importing file
  target: string; // id of imported file
  relation: LinkRelation;
}

export interface GraphDataResponse {
  nodes: CodeNode[];
  links: CodeLink[];
}

export interface QueryPayload {
  nodeId: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface QueryResponse {
  explanation: string; // Markdown text output
  path: string[]; // Array of node IDs representing chronological path
  payloads: QueryPayload[];
}

export type WorkerMessageOutbound =
  | { type: "INIT_DONE" }
  | { type: "TICK"; positions: Float32Array; isComplete: boolean };

export type WorkerMessageInbound =
  | { type: "INIT"; nodes: CodeNode[]; links: CodeLink[] }
  | { type: "UPDATE_DIMENSIONS"; width: number; height: number }
  | { type: "DRAG_START"; nodeId: string; x: number; y: number }
  | { type: "DRAG"; nodeId: string; x: number; y: number }
  | { type: "DRAG_END"; nodeId: string };
