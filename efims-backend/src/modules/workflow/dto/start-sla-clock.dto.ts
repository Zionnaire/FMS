import { IsDateString } from 'class-validator';

export class StartSlaClockDto {
  /** Deliberately caller-supplied, not computed — see SlaClock's doc comment in schema.prisma
   * for why this module doesn't invent a severity-to-hours mapping CD-02 never specified. */
  @IsDateString()
  targetDeadline!: string;
}
