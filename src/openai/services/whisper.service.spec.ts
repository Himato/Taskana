import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { OPENAI_CLIENT } from '../openai.constants';

import { WhisperService } from './whisper.service';

describe('WhisperService', () => {
  let service: WhisperService;
  let mockOpenAi: {
    audio: {
      transcriptions: {
        create: jest.Mock;
      };
    };
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: unknown) => {
      if (key === 'openai.defaultLang') return 'ar';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    mockOpenAi = {
      audio: {
        transcriptions: {
          create: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhisperService,
        { provide: OPENAI_CLIENT, useValue: mockOpenAi },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WhisperService>(WhisperService);
  });

  describe('transcribe', () => {
    it('should return successful transcription result', async () => {
      const mockResponse = {
        text: 'مرحبا كيف حالك',
        language: 'ar',
        duration: 2.5,
        segments: [{ avg_logprob: -0.3 }],
      };

      mockOpenAi.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const audio = Buffer.from('fake audio data');
      const result = await service.transcribe(audio);

      expect(result.success).toBe(true);
      expect(result.text).toBe('مرحبا كيف حالك');
      expect(result.language).toBe('ar');
      expect(result.duration).toBe(2.5);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should use default language when not specified', async () => {
      mockOpenAi.audio.transcriptions.create.mockResolvedValue({
        text: 'test',
        language: 'ar',
      });

      const audio = Buffer.from('fake audio data');
      await service.transcribe(audio);

      expect(mockOpenAi.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'ar',
        }),
      );
    });

    it('should use specified language option', async () => {
      mockOpenAi.audio.transcriptions.create.mockResolvedValue({
        text: 'hello',
        language: 'en',
      });

      const audio = Buffer.from('fake audio data');
      await service.transcribe(audio, { language: 'en' });

      expect(mockOpenAi.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          language: 'en',
        }),
      );
    });

    it('should use specified temperature', async () => {
      mockOpenAi.audio.transcriptions.create.mockResolvedValue({
        text: 'test',
        language: 'ar',
      });

      const audio = Buffer.from('fake audio data');
      await service.transcribe(audio, { temperature: 0.5 });

      expect(mockOpenAi.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
        }),
      );
    });

    it('should return error result on API failure', async () => {
      mockOpenAi.audio.transcriptions.create.mockRejectedValue(new Error('API error'));

      const audio = Buffer.from('fake audio data');
      const result = await service.transcribe(audio);

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.error).toBe('API error');
    });

    it('should calculate confidence from segments', async () => {
      const mockResponse = {
        text: 'test',
        language: 'ar',
        segments: [{ avg_logprob: -0.2 }, { avg_logprob: -0.3 }, { avg_logprob: -0.25 }],
      };

      mockOpenAi.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const audio = Buffer.from('fake audio data');
      const result = await service.transcribe(audio);

      // Average logprob is -0.25, which maps to approximately 0.85 confidence
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.confidence).toBeLessThan(1);
    });

    it('should use default confidence when no segments', async () => {
      const mockResponse = {
        text: 'test',
        language: 'ar',
        // No segments
      };

      mockOpenAi.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const audio = Buffer.from('fake audio data');
      const result = await service.transcribe(audio);

      expect(result.confidence).toBe(0.7);
    });

    it('should clamp low confidence values', async () => {
      const mockResponse = {
        text: 'test',
        language: 'ar',
        segments: [{ avg_logprob: -2.0 }], // Very low confidence
      };

      mockOpenAi.audio.transcriptions.create.mockResolvedValue(mockResponse);

      const audio = Buffer.from('fake audio data');
      const result = await service.transcribe(audio);

      expect(result.confidence).toBeGreaterThanOrEqual(0.1);
    });
  });
});
