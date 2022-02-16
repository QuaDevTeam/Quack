export type ShippingMode = 'default' | 'diff';

export interface ShippedManifest {
  mode: ShippingMode;
  hash: string;
  version?: string;
  build: string;
  buildTime: number;
  dist: {
    path: string;
  };
}
