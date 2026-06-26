import { Injectable } from '@nestjs/common';
import { CodeNode, CodeLink } from '@codemap/shared';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ImportParserService {
  private readonly importPatterns = [
    /require\(['"]([^'"]+)['"]\)/g,
    /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
  ];

  private readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

  /**
   * Parses the import statements in each code node and resolves connections (links).
   * 
   * @param workspaceRoot Real absolute path to the workspace root
   * @param nodes Scanned file nodes in the workspace
   * @returns List of CodeLink relationships
   */
  parse(workspaceRoot: string, nodes: CodeNode[]): CodeLink[] {
    const links: CodeLink[] = [];
    const nodeMap = new Map<string, CodeNode>(nodes.map(node => [node.id, node]));

    for (const node of nodes) {
      const fullPath = path.resolve(workspaceRoot, node.id);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');

      // 1. Static imports
      const staticImports = this.extractPattern(content, /import\s+.*\s+from\s+['"]([^'"]+)['"]/g)
        .concat(this.extractPattern(content, /import\s+['"]([^'"]+)['"]/g));

      for (const imp of staticImports) {
        if (imp.startsWith('.') || imp.startsWith('/')) {
          const resolvedPath = this.resolveImportPath(workspaceRoot, path.dirname(fullPath), imp);
          if (resolvedPath) {
            const relativeTarget = path.relative(workspaceRoot, resolvedPath).replace(/\\/g, '/');
            if (nodeMap.has(relativeTarget)) {
              links.push({
                source: node.id,
                target: relativeTarget,
                relation: 'static-import',
              });
            }
          }
        }
      }

      // 2. Dynamic requires
      const dynamicRequires = this.extractPattern(content, /require\(['"]([^'"]+)['"]\)/g);
      for (const imp of dynamicRequires) {
        if (imp.startsWith('.') || imp.startsWith('/')) {
          const resolvedPath = this.resolveImportPath(workspaceRoot, path.dirname(fullPath), imp);
          if (resolvedPath) {
            const relativeTarget = path.relative(workspaceRoot, resolvedPath).replace(/\\/g, '/');
            if (nodeMap.has(relativeTarget)) {
              links.push({
                source: node.id,
                target: relativeTarget,
                relation: 'dynamic-require',
              });
            }
          }
        }
      }
    }

    return links;
  }

  /**
   * Helper to extract matches for a specific regex pattern from text content.
   */
  private extractPattern(content: string, pattern: RegExp): string[] {
    const matches: string[] = [];
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const val = match[1];
      if (!matches.includes(val)) {
        matches.push(val);
      }
    }
    return matches;
  }

  /**
   * Resolves a relative import path to a real physical file.
   * Handles extensionless imports and directory index files (e.g. `./utils` -> `./utils/index.ts`).
   */
  private resolveImportPath(workspaceRoot: string, currentDir: string, importPath: string): string | null {
    const resolvedBase = path.resolve(currentDir, importPath);

    // 1. Direct file check
    if (fs.existsSync(resolvedBase) && fs.statSync(resolvedBase).isFile()) {
      return fs.realpathSync(resolvedBase);
    }

    // 2. Extension resolution (e.g. './utils' -> './utils.ts')
    for (const ext of this.extensions) {
      const fileWithExt = resolvedBase + ext;
      if (fs.existsSync(fileWithExt) && fs.statSync(fileWithExt).isFile()) {
        return fs.realpathSync(fileWithExt);
      }
    }

    // 3. Directory index resolution (e.g. './components/Button' -> './components/Button/index.tsx')
    if (fs.existsSync(resolvedBase) && fs.statSync(resolvedBase).isDirectory()) {
      for (const ext of this.extensions) {
        const indexFile = path.join(resolvedBase, 'index' + ext);
        if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
          return fs.realpathSync(indexFile);
        }
      }
    }

    return null;
  }
}
