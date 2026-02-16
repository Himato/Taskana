import { Module } from '@nestjs/common';

import {
  BaileysAuthService,
  BaileysMapperService,
  BaileysMediaService,
  BaileysMessagingService,
} from './baileys';
import { AllowedSenderGuard } from './guards/allowed-sender.guard';
import { MESSAGING_SERVICE } from './messaging.constants';

/**
 * Messaging Module
 *
 * Gateway between the application and WhatsApp.
 * Provides a provider-agnostic interface for sending/receiving messages.
 */
@Module({
  imports: [],
  providers: [
    // Internal Baileys services (not exported)
    BaileysAuthService,
    BaileysMediaService,
    BaileysMapperService,
    AllowedSenderGuard,

    // The abstraction token → Baileys implementation
    {
      provide: MESSAGING_SERVICE,
      useClass: BaileysMessagingService,
    },
  ],
  exports: [MESSAGING_SERVICE, AllowedSenderGuard],
})
export class MessagingModule {}
