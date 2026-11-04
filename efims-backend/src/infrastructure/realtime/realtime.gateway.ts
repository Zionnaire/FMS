import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthenticatedUser } from '../../common/types/authenticated-user.interface';

/** Room-naming helpers — kept here (not duplicated in every caller) so the convention only
 * exists in one place: `tenant:<id>` for tenant-wide broadcasts, `user:<id>` for one person's
 * notifications. */
export const tenantRoom = (tenantId: string): string => `tenant:${tenantId}`;
export const userRoom = (userId: string): string => `user:${userId}`;

/**
 * The one Socket.IO endpoint this backend exposes. Deliberately thin: no business logic lives
 * here, and no feature module talks to `Server` directly — they inject `RealtimeService`
 * instead (see that file), which is the only thing that calls `server.to(room).emit(...)`.
 * That indirection means a feature module never needs to know this gateway exists to push a
 * live update; it just calls a plain method.
 *
 * Auth happens once, at handshake, the same way every other entry point in this codebase
 * verifies a JWT — same `JWT_ACCESS_SECRET`, same payload shape (`AuthenticatedUser`). A socket
 * that fails verification is disconnected immediately, before ever being able to join a room or
 * receive anything. There is no per-message re-auth beyond that (a revoked/expired access token
 * doesn't retroactively drop an already-connected socket at MVP — see the module doc comment on
 * `RealtimeModule` for that as a known, accepted gap).
 *
 * CORS here is deliberately permissive (`origin: true`), unlike the Express CORS in `main.ts`
 * (`CORS_ORIGINS` allow-list) — NOT an oversight. `@WebSocketGateway()`'s `cors` option is
 * static decorator metadata, evaluated before Nest's DI container exists, so it can't read
 * `ConfigService` the way `main.ts` does. That's fine here specifically because this gateway's
 * real access-control boundary is the mandatory JWT handshake above, not CORS: unlike a
 * cookie-authenticated endpoint (where a permissive CORS origin lets a malicious page ride along
 * on a victim's ambient session), this gateway requires the connecting page to already possess a
 * valid bearer token — a page on an untrusted origin has nothing to ride along on.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true }, // see the class doc comment for why this is safe here
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) {
      this.logger.warn(`Rejected socket ${socket.id}: no token presented`);
      socket.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      socket.data.user = payload;
      await socket.join([tenantRoom(payload.tenantId), userRoom(payload.sub)]);
    } catch {
      this.logger.warn(`Rejected socket ${socket.id}: invalid or expired token`);
      socket.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Nothing to clean up explicitly — socket.io removes a disconnected socket from every room
    // it was in automatically.
  }

  /** Socket.IO client conventions vary (`auth.token`, a query param, an Authorization-style
   * header) — accept the two most common so either a browser client or a server-to-server one
   * works without the caller needing to know which this backend expects. */
  private extractToken(socket: Socket): string | undefined {
    const fromAuth = socket.handshake.auth?.token as string | undefined;
    if (fromAuth) {
      return fromAuth;
    }
    const fromQuery = socket.handshake.query?.token;
    return typeof fromQuery === 'string' ? fromQuery : undefined;
  }
}
