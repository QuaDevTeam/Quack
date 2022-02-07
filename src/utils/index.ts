import fs from 'fs';
import path from 'path';

export interface QuaFileList {
  path: string;
  file: string[];
}

export async function* walk(dir: string): AsyncGenerator<QuaFileList> {
  let fileList: QuaFileList = { path: dir, file: [] };
  for await (const file of await fs.promises.opendir(dir)) {
    const entry = path.join(dir, file.name);
    if (file.isDirectory()) yield* walk(entry);
    else if (file.isFile()) fileList.file.push(file.name);
  }
  if (fileList.file.length > 0) yield fileList;
}

export function getAllKeys(targetKey: string, data: {
  [propName: string]: any;
}, replace: {
  [propName: string]: string;
}): string[] {
  let result: string[] = [];
  if (typeof data === 'string') {
    return result;
  }
  const keys = Object.keys(data);
  keys.forEach((key) => {
    const safeKey = key as keyof typeof data;
    const item = data[safeKey];
    if (item) {
      const str = item.toString();
      if (typeof item === 'object' && str === '[object Object]') {
        // is object
        result = result.concat(getAllKeys(targetKey, data[safeKey], replace));
      } else if (Array.isArray(item)) {
        item.forEach((child) => {
          result = result.concat(getAllKeys(targetKey, child, replace));
        });
      } else if (safeKey === targetKey) {
        if (replace[str]) {
          data[safeKey] = replace[str];
        }
        result.push(data[safeKey]);
      }
    }
  });

  return result;
}
