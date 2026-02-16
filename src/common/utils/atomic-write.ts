import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Write data to a file atomically.
 *
 * Writes to a temporary file first, then renames to the target path.
 * This prevents file corruption if the process crashes during write.
 *
 * @param filePath - Target file path
 * @param data - Data to write (will be stringified if object)
 * @param options - Optional configuration
 */
export async function atomicWrite(
  filePath: string,
  data: string | object,
  options: { pretty?: boolean } = {},
): Promise<void> {
  const { pretty = true } = options;

  // Convert to string if needed
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, pretty ? 2 : 0);

  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Write to temp file first
  const tmpPath = `${filePath}.${Date.now()}.tmp`;

  try {
    await fs.writeFile(tmpPath, content, 'utf-8');

    // Atomic rename
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Read and parse a JSON file.
 * Returns null if the file doesn't exist.
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
