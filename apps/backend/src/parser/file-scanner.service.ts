import { Injectable } from '@nestjs/common';
import { CodeNode } from '@codemap/shared';
import * as path from 'path';
import * as fs from 'fs';

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
    '.js', '.ts', '.tsx', '.jsx',
    '.py', '.go', '.rs', '.java',
    '.cpp', '.c', '.h', '.html',
    '.css', '.json'
  ];

  private readonly maxFileSizeBytes = 1 * 1024 * 1024; // 1 MB limit

  /**
   * Scans a workspace directory and builds a list of CodeNode objects.
   * 
   * @param workspaceRoot The real absolute path to the workspace root
   * @param scanDir The directory to scan (defaults to workspaceRoot)
   * @param nodes Accumulated file nodes
   * @returns List of parsed CodeNode objects
   */
  scan(
    workspaceRoot: string,
    scanDir: string = workspaceRoot,
    nodes: CodeNode[] = [],
    gitignoreRules: string[] = []
  ): CodeNode[] {
    const files = fs.readdirSync(scanDir);

    // If scanning the root, load gitignore rules
    if (scanDir === workspaceRoot) {
      gitignoreRules = this.loadGitignore(workspaceRoot);
    }

    for (const file of files) {
      const fullPath = path.join(scanDir, file);
      const relativePath = path.relative(workspaceRoot, fullPath);

      // 1. Enforce default ignores
      if (this.defaultIgnores.includes(file)) {
        continue;
      }

      // 2. Enforce gitignore rules
      if (this.isIgnored(relativePath, gitignoreRules)) {
        continue;
      }

      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        this.scan(workspaceRoot, fullPath, nodes, gitignoreRules);
      } else {
        const ext = path.extname(file).toLowerCase();

        // 3. Enforce extension whitelist and file size limits
        if (this.extensionWhitelist.includes(ext) && stat.size <= this.maxFileSizeBytes) {
          const linesCount = this.countLines(fullPath);

          nodes.push({
            id: relativePath,
            name: file,
            type: ext.substring(1), // strip the leading dot
            size: stat.size,
            lines: linesCount,
          });
        }
      }
    }

    return nodes;
  }

  /**
   * Loads gitignore rules and cleans them up.
   */
  private loadGitignore(workspaceRoot: string): string[] {
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      return [];
    }

    const content = fs.readFileSync(gitignorePath, 'utf8');
    return content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')); // ignore empty lines and comments
  }

  /**
   * Basic matching algorithm to check if a relative path matches gitignore.
   */
  private isIgnored(relativePath: string, rules: string[]): boolean {
    const normalizedPath = relativePath.replace(/\\/g, '/'); // normalize windows paths
    
    for (const rule of rules) {
      // Simple exact match or prefix check for folders
      const cleanRule = rule.endsWith('/') ? rule.slice(0, -1) : rule;
      
      // If the rule is a folder ignore, match if relative path starts with it
      if (rule.endsWith('/')) {
        if (normalizedPath === cleanRule || normalizedPath.startsWith(cleanRule + '/')) {
          return true;
        }
      } else {
        // Filename or path contains rule
        if (
          normalizedPath === rule ||
          normalizedPath.endsWith('/' + rule) ||
          normalizedPath.startsWith(rule + '/')
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Reads a file and counts the total lines of code.
   */
  private countLines(filePath: string): number {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return content.split(/\r?\n/).length;
    } catch {
      return 0;
    }
  }
}
