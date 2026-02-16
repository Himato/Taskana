import * as fs from 'fs/promises';
import * as path from 'path';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { downloadMediaMessage, WAMessage } from '@whiskeysockets/baileys';

/**
 * Handles media download and persistence for Baileys messages.
 */
@Injectable()
export class BaileysMediaService {
  private readonly logger = new Logger(BaileysMediaService.name);
  private readonly mediaDir: string;

  constructor(private readonly configService: ConfigService) {
    this.mediaDir = this.configService.get<string>('paths.media', './data/media');
  }

  /**
   * Download media from an incoming Baileys message.
   * Returns the raw Buffer.
   */
  async download(rawMessage: WAMessage): Promise<Buffer> {
    const buffer = await downloadMediaMessage(rawMessage, 'buffer', {});
    return buffer as Buffer;
  }

  /**
   * Download and persist media to disk.
   * Returns the saved file path.
   */
  async downloadAndSave(rawMessage: WAMessage, filename: string): Promise<string> {
    const buffer = await this.download(rawMessage);
    const filePath = path.join(this.mediaDir, filename);

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);

    this.logger.debug(`Saved media → ${filePath} (${buffer.length} bytes)`);
    return filePath;
  }
}
