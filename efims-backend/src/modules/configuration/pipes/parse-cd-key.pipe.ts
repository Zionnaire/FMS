import { BadRequestException, PipeTransform } from '@nestjs/common';
import { CdKey } from '@prisma/client';

/** Validates a `:key` route param against the `CdKey` enum, so an unrecognized key 400s with a
 * useful message instead of silently matching zero configuration rows further down. */
export class ParseCdKeyPipe implements PipeTransform<string, CdKey> {
  transform(value: string): CdKey {
    if (!Object.values(CdKey).includes(value as CdKey)) {
      throw new BadRequestException(
        `Unknown configuration key "${value}". Valid keys: ${Object.values(CdKey).join(', ')}`,
      );
    }
    return value as CdKey;
  }
}
