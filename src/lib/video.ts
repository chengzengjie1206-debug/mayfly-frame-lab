import type {
  CropRect,
  CropRectPercent,
  ExtractedFrame,
  VideoMeta,
} from '../types';

type VideoAsset = {
  url: string;
  meta: VideoMeta;
};

export type VideoFrameReader = {
  capture: (time: number) => Promise<HTMLCanvasElement>;
  dispose: () => void;
};

const MIN_PERCENT = 1;

function waitForEvent<T extends keyof HTMLMediaElementEventMap>(
  video: HTMLVideoElement,
  eventName: T,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, onSuccess);
      video.removeEventListener('error', onError);
    };

    const onSuccess = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error('视频加载失败，请使用常见的 MP4 或 WebM 文件。'));
    };

    video.addEventListener(eventName, onSuccess, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function createVideo(url: string): HTMLVideoElement {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = url;
  return video;
}

function disposeVideo(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

export async function loadVideoAsset(file: File): Promise<VideoAsset> {
  const url = URL.createObjectURL(file);
  const video = createVideo(url);

  try {
    await waitForEvent(video, 'loadedmetadata');
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }

  const { duration, videoWidth, videoHeight } = video;
  disposeVideo(video);

  if (!duration || !videoWidth || !videoHeight || !Number.isFinite(duration)) {
    URL.revokeObjectURL(url);
    throw new Error('无法读取视频元数据，请更换文件后重试。');
  }

  return {
    url,
    meta: {
      name: file.name,
      duration,
      width: videoWidth,
      height: videoHeight,
    },
  };
}

export function revokeVideoAsset(url: string): void {
  URL.revokeObjectURL(url);
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.001) {
    return;
  }

  const promise = waitForEvent(video, 'seeked');
  video.currentTime = time;
  await promise;
}

function frameFromVideo(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前浏览器不支持 Canvas 2D 上下文。');
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function createVideoFrameReader(url: string): Promise<VideoFrameReader> {
  const video = createVideo(url);
  await waitForEvent(video, 'loadeddata');

  return {
    capture: async (time) => {
      const targetTime = clamp(time, 0, Number.isFinite(video.duration) ? video.duration : time);
      await seekTo(video, targetTime);
      return frameFromVideo(video);
    },
    dispose: () => {
      disposeVideo(video);
    },
  };
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function normalizeCropRectPercent(rect?: CropRectPercent | null): CropRectPercent {
  if (!rect) {
    return {
      leftPercent: 0,
      topPercent: 0,
      widthPercent: 100,
      heightPercent: 100,
    };
  }

  const leftPercent = clamp(rect.leftPercent, 0, 100 - MIN_PERCENT);
  const topPercent = clamp(rect.topPercent, 0, 100 - MIN_PERCENT);

  return {
    leftPercent,
    topPercent,
    widthPercent: clamp(rect.widthPercent, MIN_PERCENT, 100 - leftPercent),
    heightPercent: clamp(rect.heightPercent, MIN_PERCENT, 100 - topPercent),
  };
}

export function cropBoundsForSize(
  sourceWidth: number,
  sourceHeight: number,
  cropRectPercent?: CropRectPercent | null,
): CropRect {
  const normalized = normalizeCropRectPercent(cropRectPercent);
  const x = Math.round((normalized.leftPercent / 100) * sourceWidth);
  const y = Math.round((normalized.topPercent / 100) * sourceHeight);
  const width = clamp(
    Math.round((normalized.widthPercent / 100) * sourceWidth),
    1,
    sourceWidth - x,
  );
  const height = clamp(
    Math.round((normalized.heightPercent / 100) * sourceHeight),
    1,
    sourceHeight - y,
  );

  return { x, y, width, height };
}

export function cropCanvas(
  source: HTMLCanvasElement,
  cropRectPercent?: CropRectPercent | null,
): HTMLCanvasElement {
  const bounds = cropBoundsForSize(source.width, source.height, cropRectPercent);
  const canvas = document.createElement('canvas');
  canvas.width = bounds.width;
  canvas.height = bounds.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('当前浏览器不支持 Canvas 2D 上下文。');
  }

  context.drawImage(
    source,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );

  return canvas;
}

export function sampleTimes(
  duration: number,
  startTime: number,
  endTime: number,
  fps: number,
  maxFrames: number,
): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || fps <= 0 || maxFrames <= 0) {
    return [];
  }

  const start = clamp(Math.min(startTime, endTime), 0, duration);
  const end = clamp(Math.max(startTime, endTime), 0, duration);
  const span = Math.max(end - start, 0);

  if (span < 0.001) {
    return [Number(start.toFixed(3))];
  }

  const interval = 1 / fps;
  const times: number[] = [];
  let cursor = start;

  while (cursor <= end + 0.0001 && times.length < maxFrames) {
    times.push(Number(cursor.toFixed(3)));
    cursor += interval;
  }

  if (times.length === maxFrames && times[times.length - 1] < end) {
    times[times.length - 1] = Number(end.toFixed(3));
  }

  return [...new Set(times)];
}

function formatTimestamp(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  const milliseconds = Math.round((totalSeconds % 1) * 1000)
    .toString()
    .padStart(3, '0');

  return `${minutes}:${seconds}.${milliseconds}`;
}

export async function extractFrames(
  reader: VideoFrameReader,
  times: number[],
  cropRectPercent?: CropRectPercent | null,
  onProgress?: (completed: number, total: number) => void,
): Promise<ExtractedFrame[]> {
  const frames: ExtractedFrame[] = [];

  for (const [index, time] of times.entries()) {
    const canvas = await reader.capture(time);
    const cropped = cropCanvas(canvas, cropRectPercent);

    frames.push({
      index,
      time,
      label: formatTimestamp(time),
      image: cropped,
    });

    onProgress?.(index + 1, times.length);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  return frames;
}
