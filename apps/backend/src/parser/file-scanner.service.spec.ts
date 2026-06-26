import { Test, TestingModule } from '@nestjs/testing';
import { FileScannerService } from './file-scanner.service';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('FileScannerService', () => {
  let service: FileScannerService;
  let testRoot: string;

  beforeAll(() => {
    // Create a temporary project directory
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-scanner-'));

    // Create subfolders
    fs.mkdirSync(path.join(testRoot, 'src'));
    fs.mkdirSync(path.join(testRoot, 'node_modules'));
    fs.mkdirSync(path.join(testRoot, 'ignored-folder'));

    // Create whitelisted files
    fs.writeFileSync(
      path.join(testRoot, 'src', 'index.ts'),
      'console.log("TS");\nconsole.log("Line 2");',
    );
    fs.writeFileSync(
      path.join(testRoot, 'src', 'utils.js'),
      'module.exports = {};',
    );
    fs.writeFileSync(path.join(testRoot, 'package.json'), '{"name": "test"}');

    // Create non-whitelisted files
    fs.writeFileSync(path.join(testRoot, 'src', 'logo.png'), 'image-bytes');
    fs.writeFileSync(
      path.join(testRoot, 'node_modules', 'helper.js'),
      'module.exports = {};',
    );

    // Create oversized file (1.5 MB)
    const largeData = Buffer.alloc(1.5 * 1024 * 1024, 'a');
    fs.writeFileSync(path.join(testRoot, 'src', 'huge.ts'), largeData);

    // Create files to be ignored by .gitignore
    fs.writeFileSync(
      path.join(testRoot, 'ignored-folder', 'temp.js'),
      'console.log("temp");',
    );
    fs.writeFileSync(path.join(testRoot, 'src', 'cache.json'), '{}');

    // Create .gitignore
    fs.writeFileSync(
      path.join(testRoot, '.gitignore'),
      `
# Comments
ignored-folder/
src/cache.json
    `,
    );
  });

  afterAll(() => {
    // Cleanup files
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileScannerService],
    }).compile();

    service = module.get<FileScannerService>(FileScannerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scan', () => {
    it('should recursively scan whitelisted files and gather correct metadata', () => {
      const nodes = service.scan(testRoot);

      // Expected files to find:
      // - src/index.ts (TypeScript, small, whitelisted)
      // - src/utils.js (JavaScript, small, whitelisted)
      // - package.json (JSON, small, whitelisted)
      // Excluded:
      // - src/logo.png (png not whitelisted)
      // - node_modules/helper.js (node_modules default ignore)
      // - src/huge.ts (oversized, >1MB)
      // - ignored-folder/temp.js (ignored by .gitignore folder rule)
      // - src/cache.json (ignored by .gitignore file rule)

      expect(nodes.length).toBe(3);

      const indexNode = nodes.find(
        (n) => n.id === path.join('src', 'index.ts').replace(/\\/g, '/'),
      );
      expect(indexNode).toBeDefined();
      expect(indexNode?.name).toBe('index.ts');
      expect(indexNode?.type).toBe('ts');
      expect(indexNode?.lines).toBe(2);
      expect(indexNode?.size).toBeGreaterThan(0);

      const utilsNode = nodes.find(
        (n) => n.id === path.join('src', 'utils.js').replace(/\\/g, '/'),
      );
      expect(utilsNode).toBeDefined();

      const pkgNode = nodes.find((n) => n.id === 'package.json');
      expect(pkgNode).toBeDefined();
    });
  });
});
