export interface ShippedManifest {
  hash: string;
  version?: string;
  build: string;
  buildTime: number;
  dist: {
    path: string;
  };
}
