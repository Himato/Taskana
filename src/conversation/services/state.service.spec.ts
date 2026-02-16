import { Test, TestingModule } from '@nestjs/testing';

import { StateService } from './state.service';

describe('StateService', () => {
  let service: StateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StateService],
    }).compile();

    service = module.get<StateService>(StateService);
  });

  afterEach(() => {
    service.clearAll();
  });

  describe('getState', () => {
    it('should create initial state for new phone number', () => {
      const state = service.getState('201234567890');

      expect(state.phoneNumber).toBe('201234567890');
      expect(state.pendingState).toBe('idle');
      expect(state.recentMessages).toEqual([]);
      expect(state.lastActivity).toBeDefined();
    });

    it('should return same state for existing phone number', () => {
      const state1 = service.getState('201234567890');
      const state2 = service.getState('201234567890');

      expect(state1).toBe(state2);
    });

    it('should return different states for different phone numbers', () => {
      const state1 = service.getState('201234567890');
      const state2 = service.getState('201111111111');

      expect(state1).not.toBe(state2);
      expect(state1.phoneNumber).toBe('201234567890');
      expect(state2.phoneNumber).toBe('201111111111');
    });
  });

  describe('setState', () => {
    it('should update pending state', () => {
      service.setState('201234567890', {
        pendingState: 'awaiting_justification',
        pendingReference: 'habit-1',
        pendingAction: 'skip habit',
      });

      const state = service.getState('201234567890');

      expect(state.pendingState).toBe('awaiting_justification');
      expect(state.pendingReference).toBe('habit-1');
      expect(state.pendingAction).toBe('skip habit');
      expect(state.pendingSetAt).toBeDefined();
    });

    it('should clear pendingSetAt when state is idle', () => {
      service.setState('201234567890', {
        pendingState: 'awaiting_justification',
        pendingReference: 'habit-1',
      });

      service.setState('201234567890', {
        pendingState: 'idle',
      });

      const state = service.getState('201234567890');

      expect(state.pendingState).toBe('idle');
      expect(state.pendingSetAt).toBeUndefined();
    });

    it('should update lastActivity', () => {
      const before = new Date();
      service.setState('201234567890', { pendingState: 'idle' });
      const state = service.getState('201234567890');

      expect(state.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('clearPendingState', () => {
    it('should reset pending state to idle', () => {
      service.setState('201234567890', {
        pendingState: 'awaiting_confirmation',
        pendingReference: 'some-ref',
        pendingAction: 'some action',
      });

      service.clearPendingState('201234567890');
      const state = service.getState('201234567890');

      expect(state.pendingState).toBe('idle');
      expect(state.pendingReference).toBeUndefined();
      expect(state.pendingAction).toBeUndefined();
      expect(state.pendingSetAt).toBeUndefined();
    });
  });

  describe('addMessage', () => {
    it('should add user message to history', () => {
      service.addMessage('201234567890', 'user', 'Hello');

      const messages = service.getRecentMessages('201234567890');

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello');
      expect(messages[0].timestamp).toBeDefined();
    });

    it('should add assistant message to history', () => {
      service.addMessage('201234567890', 'assistant', 'Hi there!');

      const messages = service.getRecentMessages('201234567890');

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('Hi there!');
    });

    it('should cap messages at 10', () => {
      for (let i = 0; i < 15; i++) {
        service.addMessage('201234567890', 'user', `Message ${i}`);
      }

      const messages = service.getRecentMessages('201234567890');

      expect(messages).toHaveLength(10);
      expect(messages[0].content).toBe('Message 5');
      expect(messages[9].content).toBe('Message 14');
    });
  });

  describe('hasPendingState', () => {
    it('should return false for idle state', () => {
      expect(service.hasPendingState('201234567890')).toBe(false);
    });

    it('should return true for active pending state', () => {
      service.setState('201234567890', {
        pendingState: 'awaiting_justification',
        pendingReference: 'habit-1',
      });

      expect(service.hasPendingState('201234567890')).toBe(true);
    });
  });

  describe('pending state expiry', () => {
    it('should expire pending state after 5 minutes', () => {
      jest.useFakeTimers();

      service.setState('201234567890', {
        pendingState: 'awaiting_justification',
        pendingReference: 'habit-1',
      });

      expect(service.hasPendingState('201234567890')).toBe(true);

      // Advance time by 6 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);

      // Getting state should auto-clear expired pending state
      const state = service.getState('201234567890');

      expect(state.pendingState).toBe('idle');
      expect(service.hasPendingState('201234567890')).toBe(false);

      jest.useRealTimers();
    });

    it('should not expire pending state before 5 minutes', () => {
      jest.useFakeTimers();

      service.setState('201234567890', {
        pendingState: 'awaiting_justification',
        pendingReference: 'habit-1',
      });

      // Advance time by 4 minutes
      jest.advanceTimersByTime(4 * 60 * 1000);

      expect(service.hasPendingState('201234567890')).toBe(true);

      const state = service.getState('201234567890');
      expect(state.pendingState).toBe('awaiting_justification');

      jest.useRealTimers();
    });
  });
});
