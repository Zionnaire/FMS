import { Module } from '@nestjs/common';
import { MlGatewayService } from './ml-gateway.service';

@Module({
  providers: [MlGatewayService],
  exports: [MlGatewayService],
})
export class MlGatewayModule {}
