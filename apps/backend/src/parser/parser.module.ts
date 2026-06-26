import { Module } from '@nestjs/common';
import { SecurityService } from './security.service';
import { FileScannerService } from './file-scanner.service';
import { ImportParserService } from './import-parser.service';
import { ParserController } from './parser.controller';

@Module({
  controllers: [ParserController],
  providers: [SecurityService, FileScannerService, ImportParserService]
})
export class ParserModule {}
