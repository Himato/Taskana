import { Global, Module } from '@nestjs/common';

/**
 * OpenAI Module
 *
 * Provides Whisper STT and GPT-powered conversation AI services.
 * Global module - exports are available throughout the application.
 */
@Global()
@Module({
  imports: [],
  providers: [],
  exports: [],
})
export class OpenAiModule {}
