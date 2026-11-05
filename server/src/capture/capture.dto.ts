import { Type } from "class-transformer";
import {
  IsDefined,
  IsIn,
  IsOptional,
  ValidateIf,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { EventDto } from "../plans/plans.dto.js";
export class ExtractDto {
  @IsString() @MinLength(1) @MaxLength(20000) input!: string;
}
export class SaveCaptureDto {
  @IsDefined() @ValidateNested() @Type(() => EventDto) event!: EventDto;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  circleId?: string;
  @IsIn(["radar", "committed"]) status!: "radar" | "committed";
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  captureId?: string;
}
