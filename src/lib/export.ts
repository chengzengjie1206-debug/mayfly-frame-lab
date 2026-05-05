import JSZip from 'jszip';
import Pica from 'pica';
import type { ProcessedFrame, RenderSheetResult } from '../types';

const pica = new Pica();

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function resizeCanvas(
  source: HTMLCanvasElement,
  size: number,
): Promise<HTMLCanvasElement> {
  if (source.width === size && source.height === size) {
    return source;
  }

  const aspect = source.width / source.height;
  const targetWidth = aspect >= 1 ? size : Math.max(1, Math.round(size * aspect));
  const targetHeight = aspect >= 1 ? Math.max(1, Math.round(size / aspect)) : size;
  const scaled = createCanvas(targetWidth, targetHeight);
  await pica.resize(source, scaled);

  const target = createCanvas(size, size);
  const context = target.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  const offsetX = Math.floor((size - targetWidth) / 2);
  const offsetY = Math.floor((size - targetHeight) / 2);
  context.clearRect(0, 0, size, size);
  context.drawImage(scaled, offsetX, offsetY);
  return target;
}

export async function buildSheet(
  frames: ProcessedFrame[],
  columns: number,
  gap: number,
  outputMode: 'original' | 'fixed',
  outputSize: number,
): Promise<RenderSheetResult> {
  if (!frames.length) {
    throw new Error('No frames available to export.');
  }

  const normalizedColumns = Math.max(1, columns);
  const rows = Math.ceil(frames.length / normalizedColumns);
  const firstFrame = frames[0].resultCanvas;
  const frameSize =
    outputMode === 'fixed'
      ? Math.max(8, outputSize)
      : Math.max(firstFrame.width, firstFrame.height);
  const frameWidth = outputMode === 'fixed' ? frameSize : firstFrame.width;
  const frameHeight = outputMode === 'fixed' ? frameSize : firstFrame.height;
  const canvasWidth = normalizedColumns * frameWidth + Math.max(0, normalizedColumns - 1) * gap;
  const canvasHeight = rows * frameHeight + Math.max(0, rows - 1) * gap;
  const sheetCanvas = createCanvas(canvasWidth, canvasHeight);
  const context = sheetCanvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  for (const [index, frame] of frames.entries()) {
    const column = index % normalizedColumns;
    const row = Math.floor(index / normalizedColumns);
    const x = column * (frameWidth + gap);
    const y = row * (frameHeight + gap);
    const source = outputMode === 'fixed'
      ? await resizeCanvas(frame.resultCanvas, frameSize)
      : frame.resultCanvas;

    context.drawImage(source, x, y, frameWidth, frameHeight);
  }

  return {
    canvas: sheetCanvas,
    width: canvasWidth,
    height: canvasHeight,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create image blob.'));
        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}

export async function sheetBlob(
  frames: ProcessedFrame[],
  columns: number,
  gap: number,
  outputMode: 'original' | 'fixed',
  outputSize: number,
): Promise<Blob> {
  const sheet = await buildSheet(frames, columns, gap, outputMode, outputSize);
  return canvasToBlob(sheet.canvas);
}

export async function framesZipBlob(
  frames: ProcessedFrame[],
  outputMode: 'original' | 'fixed',
  outputSize: number,
): Promise<Blob> {
  const zip = new JSZip();

  for (const frame of frames) {
    const source =
      outputMode === 'fixed'
        ? await resizeCanvas(frame.resultCanvas, Math.max(8, outputSize))
        : frame.resultCanvas;
    const blob = await canvasToBlob(source);
    const fileName = `frame-${String(frame.index + 1).padStart(3, '0')}.png`;
    zip.file(fileName, blob);
  }

  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
