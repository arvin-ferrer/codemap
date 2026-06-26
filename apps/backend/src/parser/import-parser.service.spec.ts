import { Test, TestingModule } from '@nestjs/testing';
import { ImportParserService } from './import-parser.service';
import { CodeNode } from '@codemap/shared';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('ImportParserService', () => {
  let service: ImportParserService;
  let testRoot: string;
  let mockNodes: CodeNode[];

  beforeAll(() => {
    // Create temporary workspace structure
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-parser-test-'));

    fs.mkdirSync(path.join(testRoot, 'src'));
    fs.mkdirSync(path.join(testRoot, 'src', 'components'));

    // Create file index.ts that imports local helper.ts and external express
    fs.writeFileSync(
      path.join(testRoot, 'src', 'index.ts'),
      `
      import { helper } from './helper';
      import * as express from 'express';
      const logger = require('./utils/logger');
      import './components/Button';
      `,
    );

    fs.writeFileSync(
      path.join(testRoot, 'src', 'helper.ts'),
      'export const helper = 1;',
    );
    fs.mkdirSync(path.join(testRoot, 'src', 'utils'));
    fs.writeFileSync(
      path.join(testRoot, 'src', 'utils', 'logger.js'),
      'module.exports = {};',
    );

    // Setup component folder with index.tsx
    fs.mkdirSync(path.join(testRoot, 'src', 'components', 'Button'));
    fs.writeFileSync(
      path.join(testRoot, 'src', 'components', 'Button', 'index.tsx'),
      'export const Button = () => {};',
    );

    // Create CodeNode models corresponding to these files
    mockNodes = [
      { id: 'src/index.ts', name: 'index.ts', type: 'ts', size: 100, lines: 6 },
      {
        id: 'src/helper.ts',
        name: 'helper.ts',
        type: 'ts',
        size: 20,
        lines: 1,
      },
      {
        id: 'src/utils/logger.js',
        name: 'logger.js',
        type: 'js',
        size: 25,
        lines: 1,
      },
      {
        id: 'src/components/Button/index.tsx',
        name: 'index.tsx',
        type: 'tsx',
        size: 30,
        lines: 1,
      },
    ];
  });

  afterAll(() => {
    // Cleanup temporary files
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportParserService],
    }).compile();

    service = module.get<ImportParserService>(ImportParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parse', () => {
    it('should parse and resolve imports into dependency links', () => {
      const links = service.parse(testRoot, mockNodes);

      // Expected links:
      // 1. src/index.ts ➔ src/helper.ts (static-import, extensionless)
      // 2. src/index.ts ➔ src/utils/logger.js (dynamic-require)
      // 3. src/index.ts ➔ src/components/Button/index.tsx (index-fallback)
      // Ignored:
      // - express (external module, not in node list)

      expect(links.length).toBe(3);

      const linkHelper = links.find(
        (l) => l.source === 'src/index.ts' && l.target === 'src/helper.ts',
      );
      expect(linkHelper).toBeDefined();
      expect(linkHelper?.relation).toBe('static-import');

      const linkLogger = links.find(
        (l) =>
          l.source === 'src/index.ts' && l.target === 'src/utils/logger.js',
      );
      expect(linkLogger).toBeDefined();
      expect(linkLogger?.relation).toBe('dynamic-require');

      const linkButton = links.find(
        (l) =>
          l.source === 'src/index.ts' &&
          l.target === 'src/components/Button/index.tsx',
      );
      expect(linkButton).toBeDefined();
      expect(linkButton?.relation).toBe('static-import');
    });
  });
});
