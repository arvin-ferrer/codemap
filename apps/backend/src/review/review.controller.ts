import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import type { ReviewData, ReviewDiff } from '@codemap/shared';

@Controller('api/review')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  async get(): Promise<ReviewData> {
    try {
      return (await this.reviews.current()).data;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Review failed.',
      );
    }
  }

  @Post('refresh')
  async refresh(): Promise<ReviewData> {
    try {
      return (await this.reviews.refresh()).data;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Refresh failed.',
      );
    }
  }

  @Get('diff')
  async diff(
    @Query('id') id: string,
    @Query('path') file: string,
  ): Promise<ReviewDiff> {
    const review = await this.reviews.current();
    if (review.data.id !== id)
      throw new ConflictException(
        'This review has changed. Refresh before opening its diff.',
      );
    if (typeof file !== 'string' || !Object.hasOwn(review.diffs, file))
      throw new NotFoundException(
        'No captured text diff exists for this file.',
      );
    return review.diffs[file];
  }
}
