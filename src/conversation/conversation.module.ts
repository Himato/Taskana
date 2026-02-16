import { Module } from '@nestjs/common';

/**
 * Conversation Module
 *
 * Central router that receives all incoming messages and dispatches
 * to the correct handler based on intent classification.
 */
@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class ConversationModule {}
