import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { CreatePaymentDto } from 'src/payments/dto/create-payment.dto';
import { PaymentsService } from 'src/payments/payments.service';

@Controller()
export class RabbitMQConsumerController {
  private readonly logger = new Logger(RabbitMQConsumerController.name);

  constructor(private readonly paymentService: PaymentsService) {}

  @EventPattern('booking.created')
  async handleBookingCreated(@Payload() data: CreatePaymentDto, @Ctx() context: RmqContext) {
    try {
      this.logger.log(`Received booking.created event: ${JSON.stringify(data)}`);
      
      if (!data.userId || !data.bookingId || !data.amount || !data.method) {
        throw new Error('Missing required fields: userId, bookingId, amount, method');
      }
      
      await this.paymentService.createPayment(data.userId, data);

      const channel = context.getChannelRef();
      channel.ack(context.getMessage());
    } catch (error) {
      this.logger.error(`Error processing booking.created: ${error.message}`, error.stack);
      const channel = context.getChannelRef();
      channel.nack(context.getMessage(), false, true);
    }
  }

  @EventPattern('booking.canceled')
  async handleBookingCanceled(@Payload() data: { bookingId: string; userId: string; reason?: string }, @Ctx() context: RmqContext) {
    try {
      this.logger.log(`Received booking.canceled event: ${JSON.stringify(data)}`);
      
      // Find and update payment status to FAILED for canceled booking
      const payment = await this.paymentService.findPaymentByReference(data.bookingId);
      if (payment && payment.status === 'PENDING') {
        await this.paymentService.updateStatusByPaymentId(payment.id, 'FAILED');
        this.logger.log(`Payment ${payment.id} canceled for booking ${data.bookingId}`);
      }

      const channel = context.getChannelRef();
      channel.ack(context.getMessage());
    } catch (error) {
      this.logger.error(`Error processing booking.canceled: ${error.message}`, error.stack);
      const channel = context.getChannelRef();
      channel.nack(context.getMessage(), false, true);
    }
  }
}