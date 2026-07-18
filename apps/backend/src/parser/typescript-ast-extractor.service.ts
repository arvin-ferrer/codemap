import { Injectable } from '@nestjs/common';
import { CodeNode, CodeLink } from '@codemap/shared';
import { ImportExtractor } from './import-parser.service';
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class TypeScriptAstExtractorService implements ImportExtractor {
  private readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

  async parse(workspaceRoot: string, nodes: CodeNode[]): Promise<CodeLink[]> {
    const links: CodeLink[] = [];
    const nodeMap = new Map<string, CodeNode>(
      nodes.map((node) => [node.id, node]),
    );

    for (const node of nodes) {
      if (!this.extensions.some((ext) => node.name.endsWith(ext))) {
        continue;
      }

      const fullPath = path.resolve(workspaceRoot, node.id);
      let content;
      try {
        content = await fs.readFile(fullPath, 'utf8');
      } catch {
        continue;
      }

      const sourceFile = ts.createSourceFile(
        node.name,
        content,
        ts.ScriptTarget.Latest,
        true,
      );

      const imports = this.extractImports(sourceFile);

      for (const imp of imports) {
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
    }

    return links;
  }

  private extractImports(sourceFile: ts.SourceFile): string[] {
    const imports: string[] = [];

    const visit = (node: ts.Node) => {
      // import { X } from 'module'
      if (ts.isImportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push(node.moduleSpecifier.text);
        }
      }
      // export { X } from 'module'
      else if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          imports.push(node.moduleSpecifier.text);
        }
      }
      // import('module') or require('module')
      else if (ts.isCallExpression(node)) {
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === 'require')
        ) {
          if (
            node.arguments.length > 0 &&
            ts.isStringLiteral(node.arguments[0])
          ) {
            imports.push(node.arguments[0].text);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return imports;
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
    } catch {}

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
