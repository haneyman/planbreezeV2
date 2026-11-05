import {
  IsArray,
  IsIn,
  IsOptional,
  ValidateIf,
  IsString,
  MaxLength,
  ArrayMaxSize,
} from "class-validator";
export class ProfileDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  name?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  timeZone?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  homeArea?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  interests?: string[];
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  defaultCalendarId?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(["appOnly", "warnOnly"])
  radarSyncMode?: "appOnly" | "warnOnly";
}
