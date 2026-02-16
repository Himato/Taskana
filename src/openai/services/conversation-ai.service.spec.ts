import { Test, TestingModule } from '@nestjs/testing';

import { ConversationContext, PendingState } from '../interfaces';
import { OPENAI_CLIENT } from '../openai.constants';

import { ConversationAiService } from './conversation-ai.service';

describe('ConversationAiService', () => {
  let service: ConversationAiService;
  let mockOpenAi: {
    chat: {
      completions: {
        create: jest.Mock;
      };
    };
  };

  const createMockContext = (
    overrides: Partial<ConversationContext> = {},
  ): ConversationContext => ({
    phoneNumber: '201234567890',
    currentDate: '2026-02-16',
    currentSlot: 'after_fajr',
    pendingState: 'idle' as PendingState,
    activeHabits: ['Quran Reading', 'Morning Exercise'],
    todayTasks: ['1. Buy groceries (pending)', '2. Call mom (pending)'],
    recentMessages: [],
    ...overrides,
  });

  beforeEach(async () => {
    mockOpenAi = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ConversationAiService, { provide: OPENAI_CLIENT, useValue: mockOpenAi }],
    }).compile();

    service = module.get<ConversationAiService>(ConversationAiService);
  });

  describe('classify', () => {
    it('should classify greeting intent correctly', async () => {
      mockOpenAi.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'greeting',
                confidence: 0.95,
                entities: {},
              }),
            },
          },
        ],
      });

      const result = await service.classify('مرحبا', createMockContext());

      expect(result.intent).toBe('greeting');
      expect(result.confidence).toBe(0.95);
    });

    it('should classify task_create with entities', async () => {
      mockOpenAi.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'task_create',
                confidence: 0.9,
                entities: {
                  taskTitle: 'اشتري خضار',
                  timeSlot: 'after_dhuhr',
                },
              }),
            },
          },
        ],
      });

      const result = await service.classify('ضيف تاسك اشتري خضار بعد الضهر', createMockContext());

      expect(result.intent).toBe('task_create');
      expect(result.entities.taskTitle).toBe('اشتري خضار');
      expect(result.entities.timeSlot).toBe('after_dhuhr');
    });

    it('should normalize invalid intent to unclear', async () => {
      mockOpenAi.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'invalid_intent_type',
                confidence: 0.8,
                entities: {},
              }),
            },
          },
        ],
      });

      const result = await service.classify('asdfghjkl', createMockContext());

      expect(result.intent).toBe('unclear');
    });

    it('should escalate to gpt-4o on low confidence', async () => {
      // First call returns low confidence
      mockOpenAi.chat.completions.create
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'task_create',
                  confidence: 0.5,
                  entities: { taskTitle: 'something' },
                }),
              },
            },
          ],
        })
        // Second call (escalated) returns higher confidence
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'task_create',
                  confidence: 0.85,
                  entities: { taskTitle: 'something' },
                }),
              },
            },
          ],
        });

      const result = await service.classify('ambiguous message', createMockContext());

      // Should have been called twice (initial + escalation)
      expect(mockOpenAi.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(result.wasEscalated).toBe(true);
      expect(result.confidence).toBe(0.85);
    });

    it('should handle invalid JSON response gracefully', async () => {
      mockOpenAi.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: 'not valid json',
            },
          },
        ],
      });

      const result = await service.classify('test', createMockContext());

      expect(result.intent).toBe('unclear');
      expect(result.followUpQuestion).toBeDefined();
    });

    it('should handle API error gracefully', async () => {
      mockOpenAi.chat.completions.create.mockRejectedValue(new Error('API error'));

      const result = await service.classify('test', createMockContext());

      expect(result.intent).toBe('unclear');
      expect(result.confidence).toBe(0);
      expect(result.followUpQuestion).toBeDefined();
    });

    it('should clamp confidence to 0-1 range', async () => {
      mockOpenAi.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'greeting',
                confidence: 1.5, // Invalid > 1
                entities: {},
              }),
            },
          },
        ],
      });

      const result = await service.classify('hi', createMockContext());

      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('resolveRelativeDate', () => {
    const referenceDate = '2026-02-16'; // Monday

    describe('today expressions', () => {
      it('should resolve "today"', () => {
        expect(service.resolveRelativeDate('today', referenceDate)).toBe('2026-02-16');
      });

      it('should resolve "النهارده"', () => {
        expect(service.resolveRelativeDate('النهارده', referenceDate)).toBe('2026-02-16');
      });

      it('should resolve "اليوم"', () => {
        expect(service.resolveRelativeDate('اليوم', referenceDate)).toBe('2026-02-16');
      });
    });

    describe('tomorrow expressions', () => {
      it('should resolve "tomorrow"', () => {
        expect(service.resolveRelativeDate('tomorrow', referenceDate)).toBe('2026-02-17');
      });

      it('should resolve "بكرة"', () => {
        expect(service.resolveRelativeDate('بكرة', referenceDate)).toBe('2026-02-17');
      });

      it('should resolve "غدا"', () => {
        expect(service.resolveRelativeDate('غدا', referenceDate)).toBe('2026-02-17');
      });
    });

    describe('day after tomorrow expressions', () => {
      it('should resolve "day after tomorrow"', () => {
        expect(service.resolveRelativeDate('day after tomorrow', referenceDate)).toBe('2026-02-18');
      });

      it('should resolve "بعد بكره"', () => {
        expect(service.resolveRelativeDate('بعد بكره', referenceDate)).toBe('2026-02-18');
      });
    });

    describe('day names - English', () => {
      it('should resolve "thursday" (Feb 16 is Monday)', () => {
        const result = service.resolveRelativeDate('thursday', referenceDate);
        expect(result).toBe('2026-02-19'); // Next Thursday
      });

      it('should resolve "friday"', () => {
        const result = service.resolveRelativeDate('friday', referenceDate);
        expect(result).toBe('2026-02-20'); // Next Friday
      });

      it('should resolve "sunday"', () => {
        const result = service.resolveRelativeDate('sunday', referenceDate);
        expect(result).toBe('2026-02-22'); // Next Sunday
      });
    });

    describe('day names - Arabic', () => {
      it('should resolve "الخميس"', () => {
        const result = service.resolveRelativeDate('الخميس', referenceDate);
        expect(result).toBe('2026-02-19'); // Next Thursday
      });

      it('should resolve "الجمعة"', () => {
        const result = service.resolveRelativeDate('الجمعة', referenceDate);
        expect(result).toBe('2026-02-20'); // Next Friday
      });

      it('should resolve "جمعة"', () => {
        const result = service.resolveRelativeDate('جمعة', referenceDate);
        expect(result).toBe('2026-02-20'); // Next Friday
      });
    });

    describe('invalid expressions', () => {
      it('should return null for unrecognized expression', () => {
        expect(service.resolveRelativeDate('asdfghjkl', referenceDate)).toBeNull();
      });

      it('should return null for empty expression', () => {
        expect(service.resolveRelativeDate('', referenceDate)).toBeNull();
      });
    });
  });

  describe('entity normalization', () => {
    it('should normalize time slot from Arabic', async () => {
      mockOpenAi.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'task_create',
                confidence: 0.9,
                entities: {
                  taskTitle: 'test',
                  timeSlot: 'بعد_الضهر',
                },
              }),
            },
          },
        ],
      });

      const result = await service.classify('test', createMockContext());

      expect(result.entities.timeSlot).toBe('after_dhuhr');
    });

    it('should resolve raw date expression to target date', async () => {
      mockOpenAi.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'task_shift',
                confidence: 0.9,
                entities: {
                  taskId: '1',
                  rawDateExpression: 'بكرة',
                },
              }),
            },
          },
        ],
      });

      const result = await service.classify('نقل 1 لبكرة', createMockContext());

      expect(result.entities.targetDate).toBe('2026-02-17');
    });

    it('should normalize task ID format', async () => {
      mockOpenAi.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'task_complete',
                confidence: 0.9,
                entities: {
                  taskId: 't-1',
                },
              }),
            },
          },
        ],
      });

      const result = await service.classify('done t-1', createMockContext());

      expect(result.entities.taskId).toBe('t-001');
    });
  });
});
