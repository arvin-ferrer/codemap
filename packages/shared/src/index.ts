export interface CodeNode {
  id: string;      // Relative file path (unique identifier)
  name: string;    // Base file name
  type: string;    // File extension (js, ts, py, etc.)
  size: number;    // File size in bytes
  lines: number;   // Total lines of code
}

export interface CodeLink {
  source: string;  // id of importing file
  target: string;  // id of imported file
  relation: string;// "static-import" | "dynamic-require"
}

export interface GraphDataResponse {
  nodes: CodeNode[];
  links: CodeLink[];
}

export interface QueryResponse {
  explanation: string; // Markdown text output
  path: string[];     // Array of node IDs representing chronological path
  payloads: Record<string, any>[];
}
