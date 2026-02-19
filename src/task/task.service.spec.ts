import { Test, TestingModule } from '@nestjs/testing';

import { TaskEntry } from '../persistence/daily-log.schema';
import { PersistenceService } from '../persistence/persistence.service';

import { TaskService } from './task.service';

describe('TaskService', () => {
  let service: TaskService;
  let mockPersistenceService: jest.Mocked<PersistenceService>;

  const mockTask: TaskEntry = {
    id: 't-001',
    title: 'اشتري خضار',
    islamicTimeSlot: 'after_dhuhr',
    status: 'pending',
    completedAt: null,
    createdAt: '2026-02-16T10:00:00.000Z',
    images: [],
  };

  beforeEach(async () => {
    mockPersistenceService = {
      addTask: jest.fn().mockResolvedValue(mockTask),
      getTask: jest.fn().mockResolvedValue(mockTask),
      updateTask: jest.fn().mockResolvedValue({ ...mockTask, status: 'done' }),
      deleteTask: jest.fn().mockResolvedValue(true),
      getDay: jest.fn().mockResolvedValue({ tasks: [mockTask] }),
      getTasksBySlot: jest.fn().mockResolvedValue(new Map([['after_dhuhr', [mockTask]]])),
      loadDay: jest.fn(),
      saveDay: jest.fn(),
      updateHabitStatus: jest.fn(),
      getHabitEntry: jest.fn(),
      addImage: jest.fn(),
      clearCache: jest.fn(),
    } as unknown as jest.Mocked<PersistenceService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskService, { provide: PersistenceService, useValue: mockPersistenceService }],
    }).compile();

    service = module.get<TaskService>(TaskService);
  });

  describe('create', () => {
    it('should create a task with valid entities', async () => {
      const result = await service.create('2026-02-16', {
        taskTitle: 'اشتري خضار',
        timeSlot: 'after_dhuhr',
      });

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.message).toContain('اشتري خضار');
      expect(mockPersistenceService.addTask).toHaveBeenCalledWith(
        '2026-02-16',
        expect.objectContaining({
          title: 'اشتري خضار',
          islamicTimeSlot: 'after_dhuhr',
        }),
      );
    });

    it('should return error when task title is missing', async () => {
      const result = await service.create('2026-02-16', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing task title');
    });

    it('should use default time slot if not specified', async () => {
      await service.create('2026-02-16', { taskTitle: 'Test task' });

      expect(mockPersistenceService.addTask).toHaveBeenCalledWith(
        '2026-02-16',
        expect.objectContaining({
          islamicTimeSlot: 'after_dhuhr',
        }),
      );
    });
  });

  describe('complete', () => {
    it('should mark task as done', async () => {
      const result = await service.complete('2026-02-16', '1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('✅');
      expect(mockPersistenceService.updateTask).toHaveBeenCalledWith('2026-02-16', 't-001', {
        status: 'done',
      });
    });

    it('should return error for non-existent task', async () => {
      mockPersistenceService.getTask.mockResolvedValue(null);

      const result = await service.complete('2026-02-16', '999');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });

    it('should return error for already completed task', async () => {
      mockPersistenceService.getTask.mockResolvedValue({ ...mockTask, status: 'done' });

      const result = await service.complete('2026-02-16', '1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task already completed');
    });

    it('should return error for shifted task', async () => {
      mockPersistenceService.getTask.mockResolvedValue({ ...mockTask, status: 'shifted' });

      const result = await service.complete('2026-02-16', '1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task was shifted');
    });

    it('should normalize task ID formats', async () => {
      await service.complete('2026-02-16', 't-1');
      expect(mockPersistenceService.getTask).toHaveBeenCalledWith('2026-02-16', 't-001');

      await service.complete('2026-02-16', '001');
      expect(mockPersistenceService.getTask).toHaveBeenCalledWith('2026-02-16', 't-001');
    });
  });

  describe('skip', () => {
    it('should skip task without justification', async () => {
      mockPersistenceService.updateTask.mockResolvedValue({ ...mockTask, status: 'skipped' });

      const result = await service.skip('2026-02-16', '1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('⏭️');
    });

    it('should skip task with justification', async () => {
      mockPersistenceService.updateTask.mockResolvedValue({ ...mockTask, status: 'skipped' });

      const result = await service.skip('2026-02-16', '1', 'مشغول');

      expect(result.success).toBe(true);
      expect(mockPersistenceService.updateTask).toHaveBeenCalledWith(
        '2026-02-16',
        't-001',
        expect.objectContaining({ shiftReason: 'مشغول' }),
      );
    });

    it('should return error for completed task', async () => {
      mockPersistenceService.getTask.mockResolvedValue({ ...mockTask, status: 'done' });

      const result = await service.skip('2026-02-16', '1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot skip completed task');
    });
  });

  describe('shift', () => {
    it('should shift task to future date', async () => {
      const newTask = { ...mockTask, id: 't-001', origin: '2026-02-18' };
      mockPersistenceService.addTask.mockResolvedValue(newTask);

      const result = await service.shift('2026-02-18', '1', '2026-02-20');

      expect(result.success).toBe(true);
      expect(result.message).toContain('تم نقل');

      // Should mark original as shifted
      expect(mockPersistenceService.updateTask).toHaveBeenCalledWith(
        '2026-02-18',
        't-001',
        expect.objectContaining({
          status: 'shifted',
          shiftedTo: '2026-02-20',
        }),
      );

      // Should create new task in target date
      expect(mockPersistenceService.addTask).toHaveBeenCalledWith(
        '2026-02-20',
        expect.objectContaining({
          title: 'اشتري خضار',
          origin: '2026-02-18',
        }),
      );
    });

    it('should shift with reason', async () => {
      mockPersistenceService.addTask.mockResolvedValue({ ...mockTask, origin: '2026-02-18' });

      await service.shift('2026-02-18', '1', '2026-02-20', 'المكتب مقفول');

      expect(mockPersistenceService.updateTask).toHaveBeenCalledWith(
        '2026-02-18',
        't-001',
        expect.objectContaining({
          shiftReason: 'المكتب مقفول',
        }),
      );
    });

    it('should return error when shifting to past date', async () => {
      const result = await service.shift('2026-02-18', '1', '2026-02-15');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot shift to past date');
      expect(mockPersistenceService.updateTask).not.toHaveBeenCalled();
    });

    it('should return error for completed task', async () => {
      mockPersistenceService.getTask.mockResolvedValue({ ...mockTask, status: 'done' });

      const result = await service.shift('2026-02-18', '1', '2026-02-20');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot shift completed task');
    });

    it('should return error for already shifted task', async () => {
      mockPersistenceService.getTask.mockResolvedValue({ ...mockTask, status: 'shifted' });

      const result = await service.shift('2026-02-18', '1', '2026-02-20');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task already shifted');
    });
  });

  describe('update', () => {
    it('should update task title', async () => {
      mockPersistenceService.updateTask.mockResolvedValue({
        ...mockTask,
        title: 'عنوان جديد',
      });

      const result = await service.update('2026-02-16', '1', { taskTitle: 'عنوان جديد' });

      expect(result.success).toBe(true);
      expect(mockPersistenceService.updateTask).toHaveBeenCalledWith(
        '2026-02-16',
        't-001',
        expect.objectContaining({ title: 'عنوان جديد' }),
      );
    });

    it('should return error when no updates provided', async () => {
      const result = await service.update('2026-02-16', '1', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('No updates provided');
    });
  });

  describe('delete', () => {
    it('should delete task', async () => {
      const result = await service.delete('2026-02-16', '1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('🗑️');
      expect(mockPersistenceService.deleteTask).toHaveBeenCalledWith('2026-02-16', 't-001');
    });

    it('should return error for non-existent task', async () => {
      mockPersistenceService.getTask.mockResolvedValue(null);

      const result = await service.delete('2026-02-16', '999');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });
  });

  describe('listForDay', () => {
    it('should return all tasks for a day', async () => {
      const tasks = await service.listForDay('2026-02-16');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('t-001');
    });
  });

  describe('getBySlot', () => {
    it('should return tasks grouped by slot', async () => {
      const bySlot = await service.getBySlot('2026-02-16');

      expect(bySlot.get('after_dhuhr')).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should return task by ID', async () => {
      const task = await service.getById('2026-02-16', '1');

      expect(task).toBeDefined();
      expect(task?.id).toBe('t-001');
    });

    it('should normalize task ID', async () => {
      await service.getById('2026-02-16', 't-1');
      expect(mockPersistenceService.getTask).toHaveBeenCalledWith('2026-02-16', 't-001');
    });
  });

  describe('findSimilarInWeek', () => {
    it('should find similar task within week', async () => {
      // Return task with exact same title on one of the days (similarity = 1.0)
      mockPersistenceService.getDay.mockImplementation(async (date: string) => {
        if (date === '2026-02-19') {
          return {
            date: '2026-02-19',
            habits: [],
            tasks: [
              {
                id: 't-001',
                title: 'اشتري خضار',
                islamicTimeSlot: 'after_dhuhr',
                status: 'pending',
                completedAt: null,
                createdAt: '2026-02-19T10:00:00.000Z',
                images: [],
              },
            ],
            nextTaskId: 2,
          };
        }
        return { date, habits: [], tasks: [], nextTaskId: 1 };
      });

      const result = await service.findSimilarInWeek('2026-02-18', 'اشتري خضار');

      expect(result).not.toBeNull();
      expect(result?.task.title).toBe('اشتري خضار');
      expect(result?.similarity).toBe(1.0);
    });

    it('should return null when no similar task found', async () => {
      mockPersistenceService.getDay.mockResolvedValue({
        date: '2026-02-18',
        habits: [],
        tasks: [
          {
            id: 't-001',
            title: 'اذهب للطبيب',
            islamicTimeSlot: 'after_dhuhr',
            status: 'pending',
            completedAt: null,
            createdAt: '2026-02-18T10:00:00.000Z',
            images: [],
          },
        ],
        nextTaskId: 2,
      });

      const result = await service.findSimilarInWeek('2026-02-18', 'اشتري خضار');

      expect(result).toBeNull();
    });

    it('should skip shifted tasks', async () => {
      mockPersistenceService.getDay.mockResolvedValue({
        date: '2026-02-18',
        habits: [],
        tasks: [
          {
            id: 't-001',
            title: 'اشتري خضار',
            islamicTimeSlot: 'after_dhuhr',
            status: 'shifted',
            completedAt: null,
            createdAt: '2026-02-18T10:00:00.000Z',
            images: [],
          },
        ],
        nextTaskId: 2,
      });

      const result = await service.findSimilarInWeek('2026-02-18', 'اشتري خضار');

      expect(result).toBeNull();
    });

    it('should skip completed tasks', async () => {
      mockPersistenceService.getDay.mockResolvedValue({
        date: '2026-02-18',
        habits: [],
        tasks: [
          {
            id: 't-001',
            title: 'اشتري خضار',
            islamicTimeSlot: 'after_dhuhr',
            status: 'done',
            completedAt: '2026-02-18T12:00:00.000Z',
            createdAt: '2026-02-18T10:00:00.000Z',
            images: [],
          },
        ],
        nextTaskId: 2,
      });

      const result = await service.findSimilarInWeek('2026-02-18', 'اشتري خضار');

      expect(result).toBeNull();
    });
  });

  describe('formatDate', () => {
    it('should return النهارده for today', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(service.formatDate(today)).toBe('النهارده');
    });

    it('should return بكرة for tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      expect(service.formatDate(tomorrowStr)).toBe('بكرة');
    });
  });
});
