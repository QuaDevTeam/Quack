/* eslint-disable no-promise-executor-return */
import fs from 'fs';
import * as crypto from 'crypto';

export const getMD5ofFile = (filePath: string) => {
  return new Promise<string | null>((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return resolve(null);
    }
    const readStream = fs.createReadStream(filePath);
    const hash = crypto.createHash('md5');
    readStream.on('data', (data) => {
      hash.update(data);
    });
    readStream.on('error', (err) => {
      reject(err);
    });
    readStream.on('end', () => {
      readStream.close();
      resolve(hash.digest('hex'));
    });
  });
};
