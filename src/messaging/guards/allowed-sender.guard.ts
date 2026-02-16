import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guard to check if a message sender is allowed.
 * Only processes messages from the configured MY_PHONE_NUMBER.
 */
@Injectable()
export class AllowedSenderGuard {
  private readonly logger = new Logger(AllowedSenderGuard.name);
  private readonly allowedNumber: string;

  constructor(private readonly configService: ConfigService) {
    this.allowedNumber = this.configService.get<string>('whatsapp.myPhoneNumber', '');
  }

  /**
   * Check if the sender is allowed to send messages.
   * If MY_PHONE_NUMBER is not set, allows all senders (with a warning).
   */
  isAllowed(senderNumber: string): boolean {
    if (!this.allowedNumber) {
      this.logger.warn('MY_PHONE_NUMBER not set — allowing all senders');
      return true;
    }
    return senderNumber === this.allowedNumber;
  }
}
