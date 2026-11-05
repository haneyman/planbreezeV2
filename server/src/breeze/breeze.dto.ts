import { Type } from "class-transformer";
import {
  IsDefined,
  IsBoolean,
  IsOptional,
  ValidateIf,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { EventDto } from "../plans/plans.dto.js";
export class ChatDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  chatId?: string;
  @IsString() @MinLength(1) @MaxLength(5000) text!: string;
}
export class SearchDto {
  @IsString() @MinLength(1) @MaxLength(200) query!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  circleId?: string;
}
export class SearchUpdateDto {
  @IsBoolean() enabled!: boolean;
}
export class RadarDto {
  @IsDefined() @ValidateNested() @Type(() => EventDto) event!: EventDto;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  circleId?: string;
}
export class SuggestionAddDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  circleId?: string;
}
