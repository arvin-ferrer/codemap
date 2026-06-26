import { Test, TestingModule } from '@nestjs/testing';
import { ParserController } from './parser.controller';
import { SecurityService } from './security.service';
import { FileScannerService } from './file-scanner.service';
import { ImportParserService } from './import-parser.service';
import * as path from 'path';

describe('ParserController', () => {
  let controller: ParserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParserController],
      providers: [
        SecurityService,
        {
          provide: FileScannerService,
          useValue: {
            scan: jest.fn().mockReturnValue([
              {
                id: 'src/main.ts',
                name: 'main.ts',
                type: 'ts',
                size: 100,
                lines: 10,
              },
            ]),
          },
        },
        {
          provide: ImportParserService,
          useValue: {
            parse: jest.fn().mockReturnValue([
              {
                source: 'src/main.ts',
                target: 'src/app.module.ts',
                relation: 'static-import',
              },
            ]),
          },
        },
      ],
    }).compile();

    controller = module.get<ParserController>(ParserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getGraph', () => {
    it('should scan, parse, and return graph data response structure', () => {
      // Create a path that actually exists so realpathSync doesn't throw
      const testPath = path.resolve(process.cwd());
      const response = controller.getGraph(testPath);

      expect(response).toBeDefined();
      expect(response.nodes).toBeDefined();
      expect(response.nodes.length).toBe(1);
      expect(response.nodes[0].name).toBe('main.ts');

      expect(response.links).toBeDefined();
      expect(response.links.length).toBe(1);
      expect(response.links[0].relation).toBe('static-import');
    });
  });
});
