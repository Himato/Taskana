/**
 * Result of speech-to-text transcription.
 */
export interface SttResult {
  /** Transcribed text */
  text: string;

  /** Language detected or specified */
  language: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Duration of audio in seconds */
  duration?: number;

  /** Whether transcription was successful */
  success: boolean;

  /** Error message if transcription failed */
  error?: string;
}

/**
 * Options for transcription.
 */
export interface TranscribeOptions {
  /** Language hint (ISO 639-1 code, e.g., 'ar', 'en') */
  language?: string;

  /** Temperature for transcription (0 = deterministic) */
  temperature?: number;
}

/**
 * Interface for speech-to-text services.
 */
export interface ISttService {
  /**
   * Transcribe audio to text.
   * @param audio Audio buffer (wav, mp3, ogg, etc.)
   * @param options Transcription options
   * @returns Transcription result
   */
  transcribe(audio: Buffer, options?: TranscribeOptions): Promise<SttResult>;
}

export const STT_SERVICE = Symbol('STT_SERVICE');
