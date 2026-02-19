import { Test, TestingModule } from '@nestjs/testing';

import { AR } from '../../common/messages/ar';
import { Habit } from '../../habit/habit.schema';
import { HabitService } from '../../habit/habit.service';
import { IMessagingService } from '../../messaging/interfaces';
import { MESSAGING_SERVICE } from '../../messaging/messaging.constants';
import {
  ClassifiedIntent,
  CONVERSATION_AI_SERVICE,
  IConversationAiService,
} from '../../openai/interfaces';
import { ISttService, STT_SERVICE } from '../../openai/interfaces/stt-service.interface';
import { DailyLog } from '../../persistence/daily-log.schema';
import { PersistenceService } from '../../persistence/persistence.service';
import { PrayerTimeService } from '../../prayer-time/prayer-time.service';
import { TaskService } from '../../task/task.service';

import { ConversationService } from './conversation.service';
import { StateService } from './state.service';

describe('ConversationService', () => {
  let service: ConversationService;
  let stateService: StateService;
  let mockMessaging: jest.Mocked<IMessagingService>;
  let mockSttService: jest.Mocked<ISttService>;
  let mockAiService: jest.Mocked<IConversationAiService>;
  let mockHabitService: jest.Mocked<HabitService>;
  let mockPersistenceService: jest.Mocked<PersistenceService>;
  let mockPrayerTimeService: jest.Mocked<PrayerTimeService>;
  let mockTaskService: jest.Mocked<TaskService>;

  const mockHabit: Habit = {
    id: 'quran-reading',
    name: 'قراءة القرآن',
    description: 'قراءة ورد يومي من القرآن',
    schedule: {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      islamicTimeSlot: 'after_fajr',
      durationMinutes: 30,
    },
    reminders: {
      atStart: true,
      beforeEnd: true,
      beforeEndMinutes: 5,
    },
    requiresJustification: true,
  };

  const mockDailyLog: DailyLog = {
    date: '2026-02-16',
    habits: [],
    tasks: [],
    nextTaskId: 1,
  };

  const createMockClassified = (
    intent: string,
    confidence = 0.9,
    entities = {},
  ): ClassifiedIntent => ({
    intent: intent as ClassifiedIntent['intent'],
    confidence,
    entities,
  });

  beforeEach(async () => {
    mockMessaging = {
      initialize: jest.fn(),
      disconnect: jest.fn(),
      getConnectionState: jest.fn(),
      sendText: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
      sendFormattedText: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
      sendButtons: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
      sendList: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
      sendImage: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
      sendAudio: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
      sendReaction: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
      downloadMedia: jest.fn().mockResolvedValue(Buffer.from('audio data')),
    };

    mockSttService = {
      transcribe: jest.fn().mockResolvedValue({
        text: 'مرحبا',
        language: 'ar',
        confidence: 0.9,
        success: true,
      }),
    };

    mockAiService = {
      classify: jest.fn().mockResolvedValue(createMockClassified('greeting')),
      resolveRelativeDate: jest.fn().mockReturnValue('2026-02-17'),
    };

    mockHabitService = {
      getAll: jest.fn().mockReturnValue([mockHabit]),
      getById: jest.fn().mockReturnValue(mockHabit),
      getByTimeSlot: jest.fn().mockReturnValue([mockHabit]),
      getForDay: jest.fn().mockReturnValue([mockHabit]),
      getForDayAndSlot: jest.fn().mockReturnValue([mockHabit]),
      count: jest.fn().mockReturnValue(1),
      loadAll: jest.fn().mockResolvedValue([mockHabit]),
    } as unknown as jest.Mocked<HabitService>;

    mockPersistenceService = {
      loadDay: jest.fn().mockResolvedValue(mockDailyLog),
      getDay: jest.fn().mockResolvedValue(mockDailyLog),
      saveDay: jest.fn().mockResolvedValue(undefined),
      updateHabitStatus: jest.fn().mockResolvedValue({
        habitId: 'quran-reading',
        status: 'done',
        justification: null,
        completedAt: new Date().toISOString(),
        images: [],
      }),
      addTask: jest.fn(),
      updateTask: jest.fn(),
      getTask: jest.fn(),
      getTasksBySlot: jest.fn(),
      getHabitEntry: jest.fn(),
      addImage: jest.fn(),
      clearCache: jest.fn(),
    } as unknown as jest.Mocked<PersistenceService>;

    mockPrayerTimeService = {
      getTodayTimes: jest.fn().mockReturnValue({
        fajr: new Date('2026-02-16T05:00:00'),
        sunrise: new Date('2026-02-16T06:30:00'),
        dhuhr: new Date('2026-02-16T12:00:00'),
        asr: new Date('2026-02-16T15:00:00'),
        maghrib: new Date('2026-02-16T17:30:00'),
        isha: new Date('2026-02-16T19:00:00'),
        date: '2026-02-16',
      }),
      getTimesForDate: jest.fn(),
      getSlotTime: jest.fn(),
      getCurrentSlot: jest.fn().mockReturnValue('after_fajr'),
      getSlotEndTime: jest.fn(),
      clearCache: jest.fn(),
    } as unknown as jest.Mocked<PrayerTimeService>;

    mockTaskService = {
      create: jest.fn().mockResolvedValue({
        success: true,
        task: {
          id: 't-001',
          title: 'اشتري خضار',
          islamicTimeSlot: 'after_dhuhr',
          status: 'pending',
          completedAt: null,
          createdAt: new Date().toISOString(),
          images: [],
        },
        message: 'تم إضافة مهمة: "اشتري خضار"',
      }),
      complete: jest.fn().mockResolvedValue({
        success: true,
        task: { id: 't-001', title: 'اشتري خضار', status: 'done' },
        message: '✅ تم إنهاء: "اشتري خضار"',
      }),
      skip: jest.fn().mockResolvedValue({
        success: true,
        task: { id: 't-001', title: 'اشتري خضار', status: 'skipped' },
        message: '⏭️ تم تخطي: "اشتري خضار"',
      }),
      shift: jest.fn().mockResolvedValue({
        success: true,
        task: { id: 't-001', title: 'اشتري خضار' },
        message: '✅ تم نقل "اشتري خضار" لـ بكرة',
      }),
      update: jest.fn().mockResolvedValue({
        success: true,
        task: { id: 't-001', title: 'عنوان جديد' },
        message: 'تم تحديث المهمة "عنوان جديد"',
      }),
      delete: jest.fn().mockResolvedValue({
        success: true,
        task: { id: 't-001', title: 'اشتري خضار' },
        message: '🗑️ تم حذف: "اشتري خضار"',
      }),
      listForDay: jest.fn().mockResolvedValue([]),
      getBySlot: jest.fn().mockResolvedValue(new Map()),
      getById: jest.fn().mockResolvedValue(null),
      findSimilarInWeek: jest.fn().mockResolvedValue(null),
      formatDate: jest.fn().mockReturnValue('بكرة'),
    } as unknown as jest.Mocked<TaskService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        StateService,
        { provide: MESSAGING_SERVICE, useValue: mockMessaging },
        { provide: STT_SERVICE, useValue: mockSttService },
        { provide: CONVERSATION_AI_SERVICE, useValue: mockAiService },
        { provide: HabitService, useValue: mockHabitService },
        { provide: PersistenceService, useValue: mockPersistenceService },
        { provide: PrayerTimeService, useValue: mockPrayerTimeService },
        { provide: TaskService, useValue: mockTaskService },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
    stateService = module.get<StateService>(StateService);
  });

  afterEach(() => {
    stateService.clearAll();
    jest.clearAllMocks();
  });

  describe('handleText', () => {
    it('should handle greeting intent', async () => {
      mockAiService.classify.mockResolvedValue(createMockClassified('greeting'));

      await service.handleText('201234567890', 'مرحبا');

      expect(mockAiService.classify).toHaveBeenCalled();
      expect(mockMessaging.sendText).toHaveBeenCalledWith('201234567890', AR.GREETING);
    });

    it('should handle help intent', async () => {
      mockAiService.classify.mockResolvedValue(createMockClassified('help'));

      await service.handleText('201234567890', 'مساعدة');

      expect(mockMessaging.sendText).toHaveBeenCalledWith('201234567890', AR.HELP);
    });

    it('should send help for very low confidence', async () => {
      mockAiService.classify.mockResolvedValue(createMockClassified('task_create', 0.2));

      await service.handleText('201234567890', 'gibberish');

      expect(mockMessaging.sendText).toHaveBeenCalledWith('201234567890', AR.UNKNOWN_INTENT);
    });

    it('should request confirmation for medium confidence action', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('habit_done', 0.5, { habitId: 'quran-reading' }),
      );

      await service.handleText('201234567890', 'خلصت');

      const call = mockMessaging.sendText.mock.calls[0];
      expect(call[1]).toContain('صح؟');

      const state = stateService.getState('201234567890');
      expect(state.pendingState).toBe('awaiting_confirmation');
    });

    it('should add messages to conversation history', async () => {
      mockAiService.classify.mockResolvedValue(createMockClassified('greeting'));

      await service.handleText('201234567890', 'مرحبا');

      const messages = stateService.getRecentMessages('201234567890');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('مرحبا');
      expect(messages[1].role).toBe('assistant');
    });

    it('should handle errors gracefully', async () => {
      mockAiService.classify.mockRejectedValue(new Error('API error'));

      await service.handleText('201234567890', 'test');

      expect(mockMessaging.sendText).toHaveBeenCalledWith('201234567890', AR.ERROR_GENERIC);
    });
  });

  describe('handleAudio', () => {
    it('should transcribe and re-enter as text', async () => {
      mockSttService.transcribe.mockResolvedValue({
        text: 'مرحبا',
        language: 'ar',
        confidence: 0.9,
        success: true,
      });
      mockAiService.classify.mockResolvedValue(createMockClassified('greeting'));

      await service.handleAudio('201234567890', {}, 5);

      expect(mockMessaging.downloadMedia).toHaveBeenCalled();
      expect(mockSttService.transcribe).toHaveBeenCalled();
      expect(mockAiService.classify).toHaveBeenCalled();
      expect(mockMessaging.sendText).toHaveBeenCalledWith('201234567890', AR.GREETING);
    });

    it('should send error for failed transcription', async () => {
      mockSttService.transcribe.mockResolvedValue({
        text: '',
        language: 'ar',
        confidence: 0,
        success: false,
        error: 'Transcription failed',
      });

      await service.handleAudio('201234567890', {}, 5);

      expect(mockMessaging.sendText).toHaveBeenCalledWith('201234567890', AR.TRANSCRIPTION_FAILED);
    });
  });

  describe('habit handlers', () => {
    it('should mark habit as done', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('habit_done', 0.9, { habitId: 'quran-reading' }),
      );

      await service.handleText('201234567890', 'خلصت القراءة');

      expect(mockPersistenceService.updateHabitStatus).toHaveBeenCalledWith(
        expect.any(String),
        'quran-reading',
        'done',
      );
      expect(mockMessaging.sendText).toHaveBeenCalledWith(
        '201234567890',
        AR.HABIT_DONE('قراءة القرآن'),
      );
    });

    it('should ask for justification when skipping habit that requires it', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('habit_skipped', 0.9, { habitId: 'quran-reading' }),
      );

      await service.handleText('201234567890', 'متعملتش');

      expect(mockMessaging.sendText).toHaveBeenCalledWith(
        '201234567890',
        AR.HABIT_ASK_JUSTIFICATION,
      );

      const state = stateService.getState('201234567890');
      expect(state.pendingState).toBe('awaiting_justification');
      expect(state.pendingReference).toBe('quran-reading');
    });

    it('should skip habit with justification directly', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('habit_skipped', 0.9, {
          habitId: 'quran-reading',
          justification: 'مريض',
        }),
      );

      await service.handleText('201234567890', 'متعملتش عشان مريض');

      expect(mockPersistenceService.updateHabitStatus).toHaveBeenCalledWith(
        expect.any(String),
        'quran-reading',
        'skipped',
        'مريض',
      );
      expect(mockMessaging.sendText).toHaveBeenCalledWith(
        '201234567890',
        AR.HABIT_SKIPPED('قراءة القرآن'),
      );
    });
  });

  describe('confirmation flow', () => {
    it('should execute pending action on confirmation', async () => {
      // First, trigger a medium-confidence action
      mockAiService.classify.mockResolvedValueOnce(
        createMockClassified('habit_done', 0.5, { habitId: 'quran-reading' }),
      );
      await service.handleText('201234567890', 'خلصت');

      // Verify we're in awaiting_confirmation state
      expect(stateService.getState('201234567890').pendingState).toBe('awaiting_confirmation');

      // Now confirm
      mockAiService.classify.mockResolvedValueOnce(createMockClassified('confirmation', 0.9));
      await service.handleText('201234567890', 'نعم');

      // Should have executed the habit_done action
      expect(mockPersistenceService.updateHabitStatus).toHaveBeenCalledWith(
        expect.any(String),
        'quran-reading',
        'done',
      );
    });

    it('should cancel pending action on rejection', async () => {
      // First, trigger a medium-confidence action
      mockAiService.classify.mockResolvedValueOnce(
        createMockClassified('habit_done', 0.5, { habitId: 'quran-reading' }),
      );
      await service.handleText('201234567890', 'خلصت');

      // Now reject
      mockAiService.classify.mockResolvedValueOnce(createMockClassified('rejection', 0.9));
      await service.handleText('201234567890', 'لا');

      // Should have cleared pending state
      expect(stateService.getState('201234567890').pendingState).toBe('idle');

      // Should NOT have executed the action
      expect(mockPersistenceService.updateHabitStatus).not.toHaveBeenCalled();
    });
  });

  describe('daily summary', () => {
    it('should return formatted daily summary', async () => {
      mockAiService.classify.mockResolvedValue(createMockClassified('daily_summary'));

      await service.handleText('201234567890', 'ملخص');

      const call = mockMessaging.sendText.mock.calls[0];
      expect(call[1]).toContain('ملخص يوم');
      expect(call[1]).toContain('العادات');
    });

    it('should include tasks in summary', async () => {
      mockPersistenceService.getDay.mockResolvedValue({
        ...mockDailyLog,
        tasks: [
          {
            id: 't-001',
            title: 'اشتري خضار',
            islamicTimeSlot: 'after_dhuhr',
            status: 'pending',
            completedAt: null,
            createdAt: new Date().toISOString(),
            images: [],
          },
        ],
      });

      mockAiService.classify.mockResolvedValue(createMockClassified('daily_summary'));

      await service.handleText('201234567890', 'ملخص');

      const call = mockMessaging.sendText.mock.calls[0];
      expect(call[1]).toContain('المهام');
      expect(call[1]).toContain('اشتري خضار');
    });
  });

  describe('buildContext', () => {
    it('should build context with all required fields', async () => {
      const context = await service.buildContext('201234567890');

      expect(context.phoneNumber).toBe('201234567890');
      expect(context.currentDate).toBeDefined();
      expect(context.currentSlot).toBe('after_fajr');
      expect(context.pendingState).toBe('idle');
      expect(context.activeHabits).toContain('قراءة القرآن');
      expect(context.todayTasks).toEqual([]);
      expect(context.recentMessages).toEqual([]);
    });

    it('should include pending state in context', async () => {
      stateService.setState('201234567890', {
        pendingState: 'awaiting_justification',
        pendingReference: 'quran-reading',
        pendingAction: 'skip habit',
      });

      const context = await service.buildContext('201234567890');

      expect(context.pendingState).toBe('awaiting_justification');
      expect(context.pendingReference).toBe('quran-reading');
      expect(context.pendingAction).toBe('skip habit');
    });
  });

  describe('task handlers', () => {
    it('should create task via task_create intent', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('task_create', 0.9, {
          taskTitle: 'اشتري خضار',
          timeSlot: 'after_dhuhr',
        }),
      );

      await service.handleText('201234567890', 'اضف مهمة اشتري خضار بعد الظهر');

      expect(mockTaskService.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ taskTitle: 'اشتري خضار' }),
      );
      expect(mockMessaging.sendText).toHaveBeenCalledWith(
        '201234567890',
        expect.stringContaining('اشتري خضار'),
      );
    });

    it('should complete task via task_complete intent', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('task_complete', 0.9, { taskId: '1' }),
      );

      await service.handleText('201234567890', 'خلصت مهمة 1');

      expect(mockTaskService.complete).toHaveBeenCalledWith(expect.any(String), '1');
    });

    it('should skip task via task_skip intent', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('task_skip', 0.9, { taskId: '1' }),
      );

      await service.handleText('201234567890', 'تخطي مهمة 1');

      expect(mockTaskService.skip).toHaveBeenCalledWith(expect.any(String), '1', undefined);
    });

    it('should shift task with target date', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('task_shift', 0.9, {
          taskId: '1',
          targetDate: '2026-02-17',
        }),
      );

      await service.handleText('201234567890', 'انقل مهمة 1 لبكرة');

      expect(mockTaskService.shift).toHaveBeenCalledWith(
        expect.any(String),
        '1',
        '2026-02-17',
        undefined,
      );
    });

    it('should ask for shift date when not provided', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('task_shift', 0.9, { taskId: '1' }),
      );

      await service.handleText('201234567890', 'انقل مهمة 1');

      expect(mockMessaging.sendText).toHaveBeenCalledWith('201234567890', AR.TASK_ASK_SHIFT_DATE);

      const state = stateService.getState('201234567890');
      expect(state.pendingState).toBe('awaiting_shift_date');
      expect(state.pendingReference).toBe('1');
    });

    it('should complete shift when date is provided in pending state', async () => {
      stateService.setState('201234567890', {
        pendingState: 'awaiting_shift_date',
        pendingReference: '1',
        pendingAction: 'shift task',
      });

      mockAiService.resolveRelativeDate.mockReturnValue('2026-02-17');

      await service.handleText('201234567890', 'بكرة');

      expect(mockTaskService.shift).toHaveBeenCalledWith(expect.any(String), '1', '2026-02-17');
    });

    it('should delete task via task_delete intent', async () => {
      mockAiService.classify.mockResolvedValue(
        createMockClassified('task_delete', 0.9, { taskId: '1' }),
      );

      await service.handleText('201234567890', 'احذف مهمة 1');

      expect(mockTaskService.delete).toHaveBeenCalledWith(expect.any(String), '1');
    });

    it('should handle task operation errors gracefully', async () => {
      mockTaskService.create.mockResolvedValue({
        success: false,
        message: 'لازم تحدد عنوان المهمة.',
        error: 'Missing task title',
      });

      mockAiService.classify.mockResolvedValue(createMockClassified('task_create', 0.9, {}));

      await service.handleText('201234567890', 'اضف مهمة');

      expect(mockMessaging.sendText).toHaveBeenCalledWith(
        '201234567890',
        'لازم تحدد عنوان المهمة.',
      );
    });

    it('should ask for confirmation when duplicate task found', async () => {
      mockTaskService.findSimilarInWeek.mockResolvedValue({
        task: {
          id: 't-001',
          title: 'اشتري خضار',
          islamicTimeSlot: 'after_dhuhr',
          status: 'pending',
          completedAt: null,
          createdAt: new Date().toISOString(),
          images: [],
        },
        date: '2026-02-19',
        similarity: 1.0,
      });
      mockTaskService.formatDate.mockReturnValue('بكرة');

      mockAiService.classify.mockResolvedValue(
        createMockClassified('task_create', 0.9, { taskTitle: 'اشتري خضار' }),
      );

      await service.handleText('201234567890', 'اضف مهمة اشتري خضار');

      expect(mockMessaging.sendText).toHaveBeenCalledWith(
        '201234567890',
        expect.stringContaining('عندك مهمة مشابهة'),
      );

      const state = stateService.getState('201234567890');
      expect(state.pendingState).toBe('awaiting_duplicate_confirmation');
    });

    it('should create task when user confirms duplicate', async () => {
      stateService.setState('201234567890', {
        pendingState: 'awaiting_duplicate_confirmation',
        pendingReference: JSON.stringify({ taskTitle: 'اشتري خضار', timeSlot: 'after_dhuhr' }),
        pendingAction: 'إضافة مهمة "اشتري خضار"',
      });

      await service.handleText('201234567890', 'نعم');

      expect(mockTaskService.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ taskTitle: 'اشتري خضار' }),
      );
    });

    it('should cancel task creation when user rejects duplicate', async () => {
      stateService.setState('201234567890', {
        pendingState: 'awaiting_duplicate_confirmation',
        pendingReference: JSON.stringify({ taskTitle: 'اشتري خضار' }),
        pendingAction: 'إضافة مهمة',
      });

      await service.handleText('201234567890', 'لا');

      expect(mockTaskService.create).not.toHaveBeenCalled();
      expect(mockMessaging.sendText).toHaveBeenCalledWith(
        '201234567890',
        AR.TASK_DUPLICATE_CANCELLED,
      );

      const state = stateService.getState('201234567890');
      expect(state.pendingState).toBe('idle');
    });
  });
});
