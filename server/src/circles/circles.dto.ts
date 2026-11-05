import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  ValidateIf,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import type { Access } from "../../../shared/types.js";
export class MemberDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsEmail()
  @MaxLength(320)
  email?: string;
  @IsString() @MaxLength(200) label!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(["coPlanner", "contributor", "viewer"])
  access?: Exclude<Access, "owner">;
}
export class CircleDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsString() @MaxLength(30) color!: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  linkedCalendarId?: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  members!: MemberDto[];
}
export class CircleUpdateDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(30)
  color?: string;
  @IsOptional() @IsString() @MaxLength(1000) linkedCalendarId?: string | null;
}
export class MemberUpdateDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(["coPlanner", "contributor", "viewer"])
  access?: Exclude<Access, "owner">;
}
