import type {
  ColorSample,
  ExtractedFrame,
  KeySettings,
  ProcessedFrame,
  RGBColor,
} from '../types';

function distance(a: RGBColor, b: RGBColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hex(rgb: RGBColor): string {
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function sampleCanvasColor(
  canvas: HTMLCanvasElement,
  point: { x: number; y: number },
): ColorSample {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  const x = clamp(Math.round(point.x), 0, canvas.width - 1);
  const y = clamp(Math.round(point.y), 0, canvas.height - 1);
  const data = context.getImageData(x, y, 1, 1).data;
  const rgb = { r: data[0], g: data[1], b: data[2] };

  return { x, y, rgb, hex: hex(rgb) };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function mixChannel(source: number, target: number, amount: number): number {
  return Math.round(source + (target - source) * amount);
}

export function applyChromaKey(
  frame: ExtractedFrame,
  settings: KeySettings,
): ProcessedFrame {
  const source = frame.image;
  const sourceContext = source.getContext('2d');

  if (!sourceContext) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  const sourceData = sourceContext.getImageData(0, 0, source.width, source.height);
  const resultCanvas = createCanvas(source.width, source.height);
  const maskCanvas = createCanvas(source.width, source.height);
  const resultContext = resultCanvas.getContext('2d');
  const maskContext = maskCanvas.getContext('2d');

  if (!resultContext || !maskContext) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  const resultData = resultContext.createImageData(source.width, source.height);
  const maskData = maskContext.createImageData(source.width, source.height);
  const target = settings.sample?.rgb ?? { r: 0, g: 255, b: 255 };
  const softRadius = Math.max(settings.softness, 1);

  for (let index = 0; index < sourceData.data.length; index += 4) {
    const pixel = {
      r: sourceData.data[index],
      g: sourceData.data[index + 1],
      b: sourceData.data[index + 2],
    };

    const alpha = sourceData.data[index + 3];
    const diff = distance(pixel, target);
    const lower = Math.max(0, settings.tolerance - softRadius);
    const upper = settings.tolerance + softRadius;

    let matte = 1;
    if (diff <= lower) {
      matte = 0;
    } else if (diff < upper) {
      matte = (diff - lower) / (upper - lower);
    }

    const finalAlpha = Math.round(alpha * matte);
    const despillAmount = (1 - matte) * (settings.despill / 100);

    resultData.data[index] = mixChannel(pixel.r, Math.max(pixel.r, target.r), despillAmount * 0.2);
    resultData.data[index + 1] = mixChannel(
      pixel.g,
      Math.min(pixel.g, Math.floor((pixel.r + pixel.b) / 2)),
      despillAmount,
    );
    resultData.data[index + 2] = mixChannel(pixel.b, Math.max(pixel.b, target.b), despillAmount * 0.2);
    resultData.data[index + 3] = finalAlpha;

    maskData.data[index] = finalAlpha;
    maskData.data[index + 1] = finalAlpha;
    maskData.data[index + 2] = finalAlpha;
    maskData.data[index + 3] = 255;
  }

  resultContext.putImageData(resultData, 0, 0);
  maskContext.putImageData(maskData, 0, 0);

  return {
    ...frame,
    resultCanvas,
    maskCanvas,
  };
}

export function processFrames(
  frames: ExtractedFrame[],
  settings: KeySettings,
): ProcessedFrame[] {
  if (!settings.enabled || !settings.sample) {
    return frames.map((frame) => {
      const passthrough = createCanvas(frame.image.width, frame.image.height);
      const mask = createCanvas(frame.image.width, frame.image.height);
      const passthroughContext = passthrough.getContext('2d');
      const maskContext = mask.getContext('2d');

      passthroughContext?.drawImage(frame.image, 0, 0);
      if (maskContext) {
        maskContext.fillStyle = '#ffffff';
        maskContext.fillRect(0, 0, mask.width, mask.height);
      }

      return {
        ...frame,
        resultCanvas: passthrough,
        maskCanvas: mask,
      };
    });
  }

  return frames.map((frame) => applyChromaKey(frame, settings));
}
