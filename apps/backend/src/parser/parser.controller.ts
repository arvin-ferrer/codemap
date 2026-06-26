import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { SecurityService } from './security.service';
import { FileScannerService } from './file-scanner.service';
import { ImportParserService } from './import-parser.service';
import type { GraphDataResponse } from '@codemap/shared';
import * as path from 'path';

@Controller('api')
export class ParserController {
  constructor(
    private readonly securityService: SecurityService,
    private readonly fileScannerService: FileScannerService,
    private readonly importParserService: ImportParserService,
  ) {}

  /**
   * Endpoint to parse the codebase directory and return its dependency graph.
   * GET /api/graph?path=/absolute/path/to/scan
   */
  @Get('graph')
  getGraph(@Query('path') scanPath?: string): GraphDataResponse {
    // Default to the main codemap project root directory
    const defaultRoot = path.resolve(process.cwd(), '../../'); 
    const targetPath = scanPath ? path.resolve(scanPath) : defaultRoot;

    try {
      // 1. Enforce security sandboxing (ensure target path resides within target root boundary)
      const workspaceRoot = path.resolve(process.env.WORKSPACE_ROOT ?? defaultRoot);
      const realTarget = this.securityService.validatePath(workspaceRoot, targetPath);

      // 2. Scan for file nodes
      const nodes = this.fileScannerService.scan(workspaceRoot, realTarget);

      // 3. Parse dependency import edges
      const links = this.importParserService.parse(workspaceRoot, nodes);

      return { nodes, links };
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException('An unknown error occurred while scanning the codebase.');
    }
  }
}
