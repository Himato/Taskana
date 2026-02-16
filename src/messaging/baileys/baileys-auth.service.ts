import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticationState, useMultiFileAuthState } from '@whiskeysockets/baileys';

/**
 * Manages Baileys authentication state and session persistence.
 */
@Injectable()
export class BaileysAuthService {
  private readonly logger = new Logger(BaileysAuthService.name);
  private readonly sessionDir: string;

  private state!: AuthenticationState;
  private saveCreds!: () => Promise<void>;

  constructor(private readonly configService: ConfigService) {
    this.sessionDir = this.configService.get<string>('whatsapp.sessionDir', './data/session');
  }

  /**
   * Initialize the auth state from the session directory.
   * Creates the directory if it doesn't exist.
   */
  async initialize(): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const resolvedPath = path.resolve(this.sessionDir);
    this.logger.log(`Loading session from ${resolvedPath}`);

    const { state, saveCreds } = await useMultiFileAuthState(resolvedPath);
    this.state = state;
    this.saveCreds = saveCreds;

    this.logger.log('Session state loaded successfully');
    return { state, saveCreds };
  }

  /**
   * Get the current authentication state.
   */
  getState(): AuthenticationState {
    return this.state;
  }

  /**
   * Persist credentials to disk.
   * Called automatically by Baileys on credential updates.
   */
  async persistCreds(): Promise<void> {
    await this.saveCreds();
  }
}
