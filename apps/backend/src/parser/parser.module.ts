import { Module } from '@nestjs/common';
import { SecurityService } from './security.service';
import { FileScannerService } from './file-scanner.service';
import { TypeScriptAstExtractorService } from './typescript-ast-extractor.service';
import { ParserController } from './parser.controller';

@Module({
  controllers: [ParserController],
  providers: [
    SecurityService, 
    FileScannerService, 
    {
      provide: 'ImportExtractor',
      useClass: TypeScriptAstExtractorService
    }
  ],
})
export class ParserModule {}
