import { Compartment, Role } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  fullName!: string;

  @IsEnum(Role)
  role!: Role;

  /** 1 = Tier I .. 4 = Executive/Cabinet MLRO — see schema.prisma's User.clearanceLevel doc. */
  @IsInt()
  @Min(1)
  @Max(4)
  clearanceLevel!: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Compartment, { each: true })
  compartments?: Compartment[];

  /** Temporary password issued by the creating admin; a real onboarding flow would send a
   * set-password invite instead of taking a plaintext password over this endpoint at all —
   * flagged as a follow-up, not solved here. */
  @IsString()
  @MinLength(8)
  temporaryPassword!: string;
}
