import { Injectable } from '@nestjs/common';
import { CodeNode } from '@codemap/shared';
import ignore from 'ignore';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, readFileSync } from 'fs';

export interface ScannerContext {
  fileCount: number;
  totalBytes: number;
  startTime: number;
  maxFiles: number;
  maxBytes: number;
  maxDepth: number;
  maxTimeMs: number;
  ig: ReturnType<typeof ignore>;
}

@Injectable()
export class FileScannerService {
  private readonly defaultIgnores = [
    'node_modules',
    '.git',
    '.vscode',
    '.idea',
    'dist',
    'build',
    'coverage',
    'out',
  ];

  private readonly extensionWhitelist = [
    '.js',
    '.ts',
    '.tsx',
    '.jsx',
    '.py',
    '.go',
    '.rs',
    '.java',
    '.cpp',
    '.c',
    '.h',
    '.html',
    '.css',
    '.json',
  ];

  private readonly maxFileSizeBytes = 1 * 1024 * 1024; // 1 MB limit

  /**
   * Scans a workspace directory and builds a list of CodeNode objects asynchronously.
   */
  async scan(
    workspaceRoot: string,
    scanDir: string = workspaceRoot,
    nodes: CodeNode[] = [],
    depth: number = 0,
    ctx?: ScannerContext,
  ): Promise<CodeNode[]> {
    if (!ctx) {
      const ig = ignore().add(this.defaultIgnores);
      const gitignorePath = path.join(workspaceRoot, '.gitignore');
      if (existsSync(gitignorePath)) {
        ig.add(readFileSync(gitignorePath, 'utf8'));
      }

      ctx = {
        fileCount: 0,
        totalBytes: 0,
        startTime: Date.now(),
        maxFiles: 50000,
        maxBytes: 500 * 1024 * 1024, // 500MB
        maxDepth: 30,
        maxTimeMs: 60000, // 60s
        ig,
      };
    }

    let files: string[] = [];
    try {
      files = await fs.readdir(scanDir);
    } catch {
      return nodes;
    }

    for (const file of files) {
      if (Date.now() - ctx.startTime > ctx.maxTimeMs) break;
      if (ctx.fileCount >= ctx.maxFiles) break;
      if (ctx.totalBytes >= ctx.maxBytes) break;

      const fullPath = path.join(scanDir, file);
      let relativePath = path.relative(workspaceRoot, fullPath);
      // standardize for ignore
      relativePath = relativePath.replace(/\\/g, '/');

      // 1. Enforce gitignore / default rules
      if (ctx.ig.ignores(relativePath)) {
        continue;
      }

      let stat;
      try {
        stat = await fs.lstat(fullPath);
        const realPath = await fs.realpath(fullPath);

        if (!realPath.startsWith(workspaceRoot)) {
          continue;
        }

        if (stat.isSymbolicLink()) {
          stat = await fs.stat(realPath);
        }
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (depth < ctx.maxDepth) {
          if (ctx.ig.ignores(relativePath + '/')) {
            continue;
          }

          await this.scan(workspaceRoot, fullPath, nodes, depth + 1, ctx);
        }
      } else {
        const ext = path.extname(file).toLowerCase();

        if (
          this.extensionWhitelist.includes(ext) &&
          stat.size <= this.maxFileSizeBytes
        ) {
          ctx.fileCount++;
          ctx.totalBytes += stat.size;
          const linesCount = await this.countLines(fullPath);

          nodes.push({
            id: relativePath,
            name: file,
            type: ext.substring(1),
            size: stat.size,
            lines: linesCount,
          });
        }
      }
    }

    return nodes;
  }

  private async countLines(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.split(/\r?\n/).length;
    } catch {
      return 0;
    }
  }
}
