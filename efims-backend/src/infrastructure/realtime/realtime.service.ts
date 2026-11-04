import { Injectable } from '@nestjs/common';
import { RealtimeGateway, tenantRoom, userRoom } from './realtime.gateway';

/** The only thing a feature module should ever inject to push a live update — never
 * `RealtimeGateway` directly. Keeps every caller ignorant of Socket.IO's own API (`server.to`,
 * rooms, namespaces); if the transport ever changed, only this file would need to. */
@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    this.gateway.server.to(tenantRoom(tenantId)).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.gateway.server.to(userRoom(userId)).emit(event, payload);
  }
}
