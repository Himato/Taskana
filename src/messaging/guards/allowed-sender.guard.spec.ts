import { ConfigService } from '@nestjs/config';

import { AllowedSenderGuard } from './allowed-sender.guard';

describe('AllowedSenderGuard', () => {
  let guard: AllowedSenderGuard;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
  });

  describe('when MY_PHONE_NUMBER is set', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue('20123456789');
      guard = new AllowedSenderGuard(mockConfigService);
    });

    it('should allow messages from the configured number', () => {
      expect(guard.isAllowed('20123456789')).toBe(true);
    });

    it('should deny messages from other numbers', () => {
      expect(guard.isAllowed('20987654321')).toBe(false);
    });

    it('should deny messages from similar but different numbers', () => {
      expect(guard.isAllowed('201234567890')).toBe(false);
      expect(guard.isAllowed('2012345678')).toBe(false);
    });
  });

  describe('when MY_PHONE_NUMBER is not set', () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue('');
      guard = new AllowedSenderGuard(mockConfigService);
    });

    it('should allow all senders', () => {
      expect(guard.isAllowed('20123456789')).toBe(true);
      expect(guard.isAllowed('20987654321')).toBe(true);
      expect(guard.isAllowed('anything')).toBe(true);
    });
  });
});
