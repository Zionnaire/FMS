import { Module } from '@nestjs/common';
import { MlGatewayController } from './ml-gateway.controller';
import { MlGatewayService } from './ml-gateway.service';

@Module({
  controllers: [MlGatewayController],
  providers: [MlGatewayService],
  exports: [MlGatewayService],
})
export class MlGatewayModule {}
