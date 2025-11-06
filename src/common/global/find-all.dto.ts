import { IsOptional, IsString, IsInt, Min, IsIn, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';

export class FindAllDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(id => parseInt(id, 10));
    }
    return value;
  })
  genreIds?: number[];

  @IsOptional()
  upcoming?: boolean;
}