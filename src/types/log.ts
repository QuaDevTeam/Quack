export interface FileRecordItem {
  hash: string;
}

export type FileRecords = Record<string, FileRecordItem>;

export interface BuildLog {
  build: string;
  files: FileRecords;
  time: number;
}
