import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

import { ISttService, SttResult, TranscribeOptions } from '../interfaces';
import { OPENAI_CLIENT } from '../openai.constants';

/**
 * Speech-to-text service using OpenAI Whisper API.
 */
@Injectable()
export class WhisperService implements ISttService {
  private readonly logger = new Logger(WhisperService.name);
  private readonly defaultLanguage: string;

  constructor(
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    private readonly configService: ConfigService,
  ) {
    this.defaultLanguage = this.configService.get<string>('openai.defaultLang', 'ar');
  }

  /**
   * Transcribe audio to text using Whisper.
   */
  async transcribe(audio: Buffer, options: TranscribeOptions = {}): Promise<SttResult> {
    const language = options.language ?? this.defaultLanguage;
    const temperature = options.temperature ?? 0;

    try {
      // Convert buffer to file using OpenAI's helper
      const file = await toFile(audio, 'audio.ogg', { type: 'audio/ogg' });

      const response = await this.openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language,
        temperature,
        response_format: 'verbose_json',
      });

      // Extract confidence from avg_logprob if available
      // avg_logprob is typically between -1 and 0, where 0 is highest confidence
      // We map it to 0-1 scale
      const confidence = this.calculateConfidence(response);

      this.logger.debug(
        `Transcribed audio: "${response.text?.slice(0, 50)}..." (confidence: ${confidence.toFixed(2)})`,
      );

      return {
        text: response.text,
        language: response.language ?? language,
        confidence,
        duration: response.duration,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Transcription failed: ${errorMessage}`);

      return {
        text: '',
        language,
        confidence: 0,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Calculate confidence score from Whisper response.
   * Uses avg_logprob from segments if available.
   */
  private calculateConfidence(response: OpenAI.Audio.Transcription): number {
    // The verbose_json response includes segments with avg_logprob
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const segments = (response as any).segments as Array<{ avg_logprob?: number }> | undefined;

    if (!segments || segments.length === 0) {
      // If no segments, assume moderate confidence
      return 0.7;
    }

    // Calculate average logprob across all segments
    const totalLogprob = segments.reduce((sum, seg) => sum + (seg.avg_logprob ?? -0.5), 0);
    const avgLogprob = totalLogprob / segments.length;

    // Map logprob to confidence (logprob is typically -1 to 0)
    // -0 → 1.0 (highest confidence)
    // -0.5 → 0.7 (moderate confidence)
    // -1.0 → 0.4 (low confidence)
    // < -1.0 → clamped to 0.1
    const confidence = Math.max(0.1, Math.min(1, 1 + avgLogprob * 0.6));

    return confidence;
  }
}
