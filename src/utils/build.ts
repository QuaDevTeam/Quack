/* eslint-disable no-async-promise-executor */
import fs from 'fs';
import { Xxh32 } from '@node-rs/xxhash';
import { FileRecordItem } from '../types/log';

type FileStats = ReturnType<typeof fs.statSync>;

export const getFileRecord = (filePath: string, fileStats?: FileStats): Promise<FileRecordItem> => {
  return new Promise(async (resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      reject(new Error('[Build Log] Cannot locate the file.'));
    }
    const stats = fileStats || (await fs.promises.stat(filePath));
    const xxh = new Xxh32();
    const readStream = fs.createReadStream(filePath);
    readStream.on('data', (data) => {
      xxh.update(data);
    });
    readStream.on('error', (err) => {
      reject(err);
    });
    readStream.on('end', () => {
      resolve({
        hash: xxh.digest(),
        mtime: stats.mtimeMs,
      });
    });
  });
};

// Save build logs for furthur usage
export const saveBuildLog = () => {};
