import {
  Matches,
  IsIn,
  IsOptional,
  ValidateIf,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
export class EventDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsString() @MaxLength(10) startDate!: string;
  @IsString() @MaxLength(10) endDate!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(5)
  startTime?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(5)
  endTime?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  place?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  @Matches(/^(https?:\/\/|$)/)
  url?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  priceText?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(10)
  ticketOnSaleDate?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
export class PlanDto extends EventDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  circleId?: string;
  @IsIn(["radar", "committed"]) status!: "radar" | "committed";
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  timeZone?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  note?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(["manual", "capture", "email", "breeze", "discover"])
  source?: "manual" | "capture" | "email" | "breeze" | "discover";
}
export class PlanUpdateDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(10)
  startDate?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(10)
  endDate?: string;
  @IsOptional() @IsString() @MaxLength(5) startTime?: string | null;
  @IsOptional() @IsString() @MaxLength(5) endTime?: string | null;
  @IsOptional() @IsString() @MaxLength(200) circleId?: string | null;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  place?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  @Matches(/^(https?:\/\/|$)/)
  url?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  note?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  priceText?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(10)
  ticketOnSaleDate?: string;
}
export class RangeDto {
  @IsString() @MaxLength(10) from!: string;
  @IsString() @MaxLength(10) to!: string;
}
