import { IsObject } from 'class-validator';

/** `filingDetails`'s real shape depends on the obligation's own `obligationType` (see
 * `schema.prisma`'s doc comment on the field) — the frontend is responsible for sending the
 * right shape for the type it already knows it's editing, same "no backend-enforced polymorphic
 * validation" precedent as `AccessChangeRequest.payload`. This DTO only guards that it's a real
 * JSON object, not a string/array/primitive someone could otherwise post. */
export class UpdateFilingDetailsDto {
  @IsObject()
  filingDetails!: Record<string, unknown>;
}
