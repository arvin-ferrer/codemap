import { Injectable } from '@nestjs/common';
import { CodeNode, CodeLink } from '@codemap/shared';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface ImportExtractor {
  parse(workspaceRoot: string, nodes: CodeNode[]): Promise<CodeLink[]>;
}

@Injectable()
export class RegexImportExtractorService implements ImportExtractor {
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
  async parse(workspaceRoot: string, nodes: CodeNode[]): Promise<CodeLink[]> {
    const links: CodeLink[] = [];
    const nodeMap = new Map<string, CodeNode>(
      nodes.map((node) => [node.id, node]),
    );

    for (const node of nodes) {
      const fullPath = path.resolve(workspaceRoot, node.id);
      let content;
      try {
        content = await fs.readFile(fullPath, 'utf8');
      } catch {
        continue;
      }

      // 1. Static imports
      const staticImports = this.extractPattern(
        content,
        /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
      ).concat(this.extractPattern(content, /import\s+['"]([^'"]+)['"]/g));

      for (const imp of staticImports) {
        if (imp.startsWith('.') || imp.startsWith('/')) {
          const resolvedPath = await this.resolveImportPath(
            workspaceRoot,
            path.dirname(fullPath),
            imp,
          );
          if (resolvedPath) {
            const relativeTarget = path
              .relative(workspaceRoot, resolvedPath)
              .replace(/\\/g, '/');
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
      const dynamicRequires = this.extractPattern(
        content,
        /require\(['"]([^'"]+)['"]\)/g,
      );
      for (const imp of dynamicRequires) {
        if (imp.startsWith('.') || imp.startsWith('/')) {
          const resolvedPath = await this.resolveImportPath(
            workspaceRoot,
            path.dirname(fullPath),
            imp,
          );
          if (resolvedPath) {
            const relativeTarget = path
              .relative(workspaceRoot, resolvedPath)
              .replace(/\\/g, '/');
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

  private async resolveImportPath(
    workspaceRoot: string,
    currentDir: string,
    importPath: string,
  ): Promise<string | null> {
    const resolvedBase = path.resolve(currentDir, importPath);

    const directPath = await this.safeResolveFile(workspaceRoot, resolvedBase);
    if (directPath) return directPath;

    for (const ext of this.extensions) {
      const extPath = await this.safeResolveFile(
        workspaceRoot,
        resolvedBase + ext,
      );
      if (extPath) return extPath;
    }

    try {
      const stat = await fs.stat(resolvedBase);
      if (stat.isDirectory()) {
        for (const ext of this.extensions) {
          const indexPath = await this.safeResolveFile(
            workspaceRoot,
            path.join(resolvedBase, 'index' + ext),
          );
          if (indexPath) return indexPath;
        }
      }
    } catch {
      // directory does not exist or cannot be stat'd
    }

    return null;
  }

  private async safeResolveFile(
    workspaceRoot: string,
    candidate: string,
  ): Promise<string | null> {
    try {
      let stat = await fs.lstat(candidate);
      const realPath = await fs.realpath(candidate);

      if (!realPath.startsWith(workspaceRoot)) {
        return null;
      }

      if (stat.isSymbolicLink()) {
        stat = await fs.stat(realPath);
      }

      return stat.isFile() ? realPath : null;
    } catch {
      return null;
    }
  }
}
