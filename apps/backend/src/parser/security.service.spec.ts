import { Test, TestingModule } from '@nestjs/testing';
import { SecurityService } from './security.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('SecurityService', () => {
  let service: SecurityService;
  let testRoot: string;
  let allowedSubdir: string;
  let allowedFile: string;
  let outsideDir: string;

  beforeAll(() => {
    // 1. Create a secure temporary test environment
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-test-root-'));
    allowedSubdir = path.join(testRoot, 'src');
    fs.mkdirSync(allowedSubdir);

    allowedFile = path.join(allowedSubdir, 'app.ts');
    fs.writeFileSync(allowedFile, 'console.log("hello");');

    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemap-outside-root-'));
  });

  afterAll(() => {
    // Clean up temporary folders safely
    fs.rmSync(testRoot, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SecurityService],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validatePath', () => {
    it('should allow valid paths inside the workspace root', () => {
      const result = service.validatePath(testRoot, allowedSubdir);
      expect(result).toBe(fs.realpathSync(allowedSubdir));

      const fileResult = service.validatePath(testRoot, allowedFile);
      expect(fileResult).toBe(fs.realpathSync(allowedFile));
    });

    it('should throw NotFoundException if workspace root does not exist', () => {
      const missingRoot = path.join(testRoot, 'missing-root-folder');
      expect(() => {
        service.validatePath(missingRoot, allowedSubdir);
      }).toThrow(NotFoundException);
    });

    it('should throw NotFoundException if target path does not exist', () => {
      const missingTarget = path.join(testRoot, 'missing-file.ts');
      expect(() => {
        service.validatePath(testRoot, missingTarget);
      }).toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for basic relative directory traversal escape', () => {
      const escapePath = path.join(testRoot, '..');
      // To run existence checks successfully, we point to an existing parent directory
      expect(() => {
        service.validatePath(allowedSubdir, testRoot); // allowedSubdir is root, testRoot lies outside it
      }).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for absolute paths outside the workspace root', () => {
      expect(() => {
        service.validatePath(testRoot, outsideDir);
      }).toThrow(ForbiddenException);
    });

    it('should resolve and block symlink escapes pointing outside the root', () => {
      const symlinkPath = path.join(allowedSubdir, 'outside-symlink');
      const outsideFile = path.join(outsideDir, 'secret.txt');
      fs.writeFileSync(outsideFile, 'secret content');
      
      // Create symlink: allowedSubdir/outside-symlink -> outsideDir/secret.txt
      fs.symlinkSync(outsideFile, symlinkPath);

      expect(() => {
        service.validatePath(testRoot, symlinkPath);
      }).toThrow(ForbiddenException);
    });
  });
});
