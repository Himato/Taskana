import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { CONVERSATION_AI_SERVICE, STT_SERVICE } from './interfaces';
import { OPENAI_CLIENT } from './openai.constants';
import { ConversationAiService, WhisperService } from './services';

/**
 * OpenAI Module
 *
 * Provides Whisper STT and GPT-powered conversation AI services.
 * Global module - exports are available throughout the application.
 */
@Global()
@Module({
  imports: [],
  providers: [
    // OpenAI client factory
    {
      provide: OPENAI_CLIENT,
      useFactory: (configService: ConfigService) => {
        const apiKey = configService.get<string>('openai.apiKey');
        return new OpenAI({ apiKey });
      },
      inject: [ConfigService],
    },
    // STT Service
    WhisperService,
    {
      provide: STT_SERVICE,
      useExisting: WhisperService,
    },
    // Conversation AI Service
    ConversationAiService,
    {
      provide: CONVERSATION_AI_SERVICE,
      useExisting: ConversationAiService,
    },
  ],
  exports: [
    OPENAI_CLIENT,
    STT_SERVICE,
    WhisperService,
    CONVERSATION_AI_SERVICE,
    ConversationAiService,
  ],
})
export class OpenAiModule {}
