export interface FileRecordItem {
  hash: number | string;
  mtime: number | bigint;
}

export type FileName = string;

export type FileRecords = Record<FileName, FileRecordItem>;

export interface BuildLog {
  build: string;
  files: FileRecords;
  time: number;
}
