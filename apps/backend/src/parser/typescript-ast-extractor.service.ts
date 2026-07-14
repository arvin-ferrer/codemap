import { Injectable } from '@nestjs/common';
import { CodeNode, CodeLink } from '@codemap/shared';
import { ImportExtractor } from './import-parser.service';
import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class TypeScriptAstExtractorService implements ImportExtractor {
  private readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

  parse(workspaceRoot: string, nodes: CodeNode[]): CodeLink[] {
    const links: CodeLink[] = [];
    const nodeMap = new Map<string, CodeNode>(
      nodes.map((node) => [node.id, node]),
    );

    for (const node of nodes) {
      if (!this.extensions.some((ext) => node.name.endsWith(ext))) {
        continue;
      }

      const fullPath = path.resolve(workspaceRoot, node.id);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, 'utf8');

      const sourceFile = ts.createSourceFile(
        node.name,
        content,
        ts.ScriptTarget.Latest,
        true,
      );

      const imports = this.extractImports(sourceFile);

      for (const imp of imports) {
        if (imp.startsWith('.') || imp.startsWith('/')) {
          const resolvedPath = this.resolveImportPath(
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

  private resolveImportPath(
    workspaceRoot: string,
    currentDir: string,
    importPath: string,
  ): string | null {
    const resolvedBase = path.resolve(currentDir, importPath);

    if (fs.existsSync(resolvedBase) && fs.statSync(resolvedBase).isFile()) {
      return fs.realpathSync(resolvedBase);
    }

    for (const ext of this.extensions) {
      const fileWithExt = resolvedBase + ext;
      if (fs.existsSync(fileWithExt) && fs.statSync(fileWithExt).isFile()) {
        return fs.realpathSync(fileWithExt);
      }
    }

    if (
      fs.existsSync(resolvedBase) &&
      fs.statSync(resolvedBase).isDirectory()
    ) {
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
