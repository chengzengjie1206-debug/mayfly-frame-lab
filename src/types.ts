export type VideoMeta = {
  name: string;
  duration: number;
  width: number;
  height: number;
};

export type SamplePoint = {
  x: number;
  y: number;
};

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CropRectPercent = {
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
};

export type ColorSample = {
  x: number;
  y: number;
  hex: string;
  rgb: RGBColor;
};

export type RGBColor = {
  r: number;
  g: number;
  b: number;
};

export type PreviewMode = 'result' | 'mask' | 'solid';

export type FramePreviewMode = 'sheet' | 'animation';

export type KeySettings = {
  enabled: boolean;
  sample: ColorSample | null;
  tolerance: number;
  softness: number;
  despill: number;
  solidBackground: string;
};

export type ExtractionSettings = {
  startTime: number;
  endTime: number;
  framesPerSecond: number;
  maxFrames: number;
  columns: number;
  gap: number;
  outputMode: 'original' | 'fixed';
  outputSize: number;
};

export type ExtractedFrame = {
  index: number;
  time: number;
  label: string;
  image: HTMLCanvasElement;
};

export type ProcessedFrame = ExtractedFrame & {
  resultCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
};

export type RenderSheetResult = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};
