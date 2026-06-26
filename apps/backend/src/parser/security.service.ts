import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class SecurityService {
  /**
   * Validates that a target path is strictly contained within the workspace root directory.
   * Resolves symlinks to prevent path traversal bypasses.
   * 
   * @param workspaceRoot The absolute path to the workspace root
   * @param targetPath The absolute or relative target path to validate
   * @returns The resolved real absolute path of the target
   * @throws NotFoundException if the target path does not exist
   * @throws ForbiddenException if the path lies outside the workspace root
   */
  validatePath(workspaceRoot: string, targetPath: string): string {
    const resolvedRoot = path.resolve(workspaceRoot);
    const resolvedTarget = path.resolve(targetPath);

    // 1. Check target existence before resolving realpath
    if (!fs.existsSync(resolvedTarget)) {
      throw new NotFoundException(`Target path does not exist: ${targetPath}`);
    }
    if (!fs.existsSync(resolvedRoot)) {
      throw new NotFoundException(`Workspace root path does not exist: ${workspaceRoot}`);
    }

    // 2. Resolve true physical paths (dereferences symlinks)
    const realRoot = fs.realpathSync(resolvedRoot);
    const realTarget = fs.realpathSync(resolvedTarget);

    // 3. Compute relative distance from root to target
    const relative = path.relative(realRoot, realTarget);

    // 4. Block path traversal escapes (e.g. starts with '..' or is absolute outside root)
    const isOutside = relative.startsWith('..') || path.isAbsolute(relative);

    if (isOutside) {
      throw new ForbiddenException(
        `Security violation: Target path '${targetPath}' resolves to '${realTarget}', which is outside the workspace root '${realRoot}'.`
      );
    }

    return realTarget;
  }
}
