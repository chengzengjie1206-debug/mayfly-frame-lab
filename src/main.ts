import './style.css';
import type {
  ColorSample,
  CropRectPercent,
  ExtractionSettings,
  FramePreviewMode,
  KeySettings,
  PreviewMode,
  ProcessedFrame,
  VideoMeta,
} from './types';
import {
  clamp,
  createVideoFrameReader,
  cropBoundsForSize,
  extractFrames,
  loadVideoAsset,
  revokeVideoAsset,
  sampleTimes,
} from './lib/video';
import { processFrames, sampleCanvasColor } from './lib/chroma';
import { buildSheet, downloadBlob, framesZipBlob, sheetBlob } from './lib/export';

type ViewMode = 'home' | 'console' | 'support';

const GITHUB_REPO_URL = 'https://github.com/chengzengjie1206-debug/mayfly-frame-lab';
const LOGO_URL = `${import.meta.env.BASE_URL}niuma.png`;
const QR_CODE_URL = `${import.meta.env.BASE_URL}zhifu.jpg`;

type AppState = {
  videoUrl: string | null;
  videoMeta: VideoMeta | null;
  cropRectPercent: CropRectPercent;
  keySettings: KeySettings;
  extraction: ExtractionSettings;
  previewMode: PreviewMode;
  framePreviewMode: FramePreviewMode;
  sourceFrame: HTMLCanvasElement | null;
  sourcePreviewFrame: HTMLCanvasElement | null;
  processedPreview: ProcessedFrame | null;
  frames: ProcessedFrame[];
  isBusy: boolean;
  status: string;
  view: ViewMode;
};

const DEFAULT_CROP: CropRectPercent = {
  leftPercent: 0,
  topPercent: 0,
  widthPercent: 100,
  heightPercent: 100,
};

const state: AppState = {
  videoUrl: null,
  videoMeta: null,
  cropRectPercent: { ...DEFAULT_CROP },
  keySettings: {
    enabled: true,
    sample: null,
    tolerance: 34,
    softness: 18,
    despill: 55,
    solidBackground: '#0f172a',
  },
  extraction: {
    startTime: 0,
    endTime: 0,
    framesPerSecond: 8,
    maxFrames: 24,
    columns: 4,
    gap: 0,
    outputMode: 'original',
    outputSize: 256,
  },
  previewMode: 'result',
  framePreviewMode: 'sheet',
  sourceFrame: null,
  sourcePreviewFrame: null,
  processedPreview: null,
  frames: [],
  isBusy: false,
  status: '请先上传本地视频，开始生成你的游戏序列帧素材。',
  view: 'home',
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <div class="page-shell">
    <div class="orb orb-a"></div>
    <div class="orb orb-b"></div>
    <div class="orb orb-c"></div>

    <header class="global-header">
      <div class="header-inner">
        <button class="brand-button" data-switch-view="home" type="button">
          <img class="brand-logo" src="${LOGO_URL}" alt="Mayfly 图标" />
          <span class="brand-text">
            <strong>mayfly工具站</strong>
            <small>视频转游戏序列帧</small>
          </span>
        </button>

        <nav class="global-nav">
          <button class="nav-link is-active" data-switch-view="home" type="button">首页</button>
          <button class="nav-link" data-switch-view="console" type="button">控制台</button>
          <button class="nav-link" data-switch-view="support" type="button">支持项目</button>
        </nav>
      </div>
    </header>

    <main class="app-frame">
      <section class="home-view" id="home-view">
        <div class="site-notice">
          <div class="site-notice__text">
            <strong>如果这个工具对你有帮助</strong>
            <span>欢迎点击支持项目，也可以前往 GitHub 给作者项目点一个收藏，这会对后续更新很有帮助。</span>
          </div>
          <div class="site-notice__actions">
            <button class="notice-button" data-switch-view="support" type="button">支持项目</button>
            <a class="notice-button notice-button--ghost" href="${GITHUB_REPO_URL}" target="_blank" rel="noreferrer">前往 GitHub</a>
          </div>
        </div>

        <section class="home-hero">
          <div class="home-hero__panel">
            <div class="home-hero__glow"></div>
            <div class="home-hero__content">
              <span class="hero-badge">Mayfly 工具站</span>
              <h1>视频转游戏<br />序列帧工作台</h1>
              <p>把视频素材快速整理成游戏可用的序列帧资源，在浏览器本地完成裁剪、取色抠图、透明预览、动画检查和导出交付，适合 Unity、Godot 以及独立游戏素材流程。</p>

              <div class="home-hero__entry">
                <div class="hero-entry__shell">
                  <span>本地处理路径</span>
                  <strong>上传视频 -> 裁剪主体 -> 取色抠图 -> 预览动画 -> 导出序列帧</strong>
                </div>
              </div>

              <div class="hero-points">
                <span>纯前端本地处理</span>
                <span>支持透明单帧导出</span>
                <span>适合游戏动画素材</span>
              </div>

              <div class="hero-actions">
                <button class="hero-action primary-link" data-switch-view="console" type="button">进入控制台</button>
                <button class="hero-action secondary-link" data-switch-view="support" type="button">支持项目</button>
              </div>
            </div>
          </div>
        </section>

        <section class="home-overview">
          <div class="overview-highlights">
            <article class="feature-card feature-card--highlight">
              <span class="feature-tag">特点 01</span>
              <h2>本地优先，不上传素材</h2>
              <p>所有裁剪、抠图、预览和导出都直接在浏览器里完成，适合敏感素材、快速试错和个人工作流。</p>
            </article>

            <article class="feature-card feature-card--highlight">
              <span class="feature-tag">特点 02</span>
              <h2>面向 Unity / Godot 的交付结果</h2>
              <p>直接获得序列图和透明单帧，方便继续导入动画系统、角色控制器或你自己的美术整理流程。</p>
            </article>
          </div>

          <div class="overview-workflow">
            <article class="feature-card">
              <span class="feature-index">01</span>
              <h2>上传视频</h2>
              <p>支持本地上传或拖拽导入，自动读取文件名、时长和分辨率，快速进入处理状态。</p>
            </article>

            <article class="feature-card">
              <span class="feature-index">02</span>
              <h2>裁剪主体</h2>
              <p>通过拖拽选框或数值输入锁定角色区域，去掉留白、水印和无关画面。</p>
            </article>

            <article class="feature-card">
              <span class="feature-index">03</span>
              <h2>抠图与预览</h2>
              <p>点击背景取色，切换抠图结果、Alpha 蒙版、纯底色和动画预览，确认最终交付效果。</p>
            </article>
          </div>
        </section>
      </section>

      <section class="support-view view-hidden" id="support-view">
        <div class="support-shell">
          <article class="support-copy-card">
            <span class="section-kicker">支持项目</span>
            <h1>支持 Mayfly 的持续更新</h1>
            <p>Mayfly 会继续保持中文界面、本地优先和开源迭代。如果这个工具帮你节省了整理视频和序列帧的时间，欢迎支持作者继续打磨体验。</p>

            <div class="support-note-grid">
              <article class="support-note">
                <strong>作者信息</strong>
                <p>微信号：matfly-9527</p>
              </article>

              <article class="support-note">
                <strong>交流群</strong>
                <p>QQ群：834625545，欢迎一起交流游戏素材处理、序列帧整理和工具建议。</p>
              </article>

              <article class="support-note">
                <strong>支持会用在什么地方</strong>
                <p>继续维护界面、修复问题、补充导出选项，并扩展更适合游戏素材处理的功能。</p>
              </article>

              <article class="support-note">
                <strong>项目说明</strong>
                <p>项目保持公开可复用，二次部署或改版时请保留来源说明与许可文本。</p>
              </article>

              <article class="support-note">
                <strong>适合谁</strong>
                <p>适合独立游戏开发者、个人美术，以及需要快速把视频整理为动画序列的创作者。</p>
              </article>
            </div>

            <div class="support-actions">
              <button class="hero-action primary-link" data-switch-view="console" type="button">进入控制台</button>
              <button class="hero-action secondary-link" data-switch-view="home" type="button">返回首页</button>
              <a class="hero-action secondary-link" href="${GITHUB_REPO_URL}" target="_blank" rel="noreferrer">前往 GitHub</a>
            </div>
          </article>

          <aside class="support-qr-card">
            <span class="section-kicker">为更新助力</span>
            <h2>支持作者</h2>
            <p>如果你觉得这个工具对你有帮助，并且愿意为后续更新助力，可以扫描下方二维码。</p>
            <img src="${QR_CODE_URL}" alt="Mayfly 支付二维码" class="support-card__image" />
            <div class="support-caption">支付宝收款码</div>
          </aside>
        </div>
      </section>

      <section class="console-view view-hidden" id="console-view">
        <div class="console-shell">
          <aside class="console-sidebar">
            <div class="sidebar-title">控制台导航</div>
            <button class="sidebar-link is-active" data-section-target="dashboard-top" type="button">数据看板</button>
            <button class="sidebar-link" data-section-target="source-console" type="button">素材输入</button>
            <button class="sidebar-link" data-section-target="crop-console" type="button">裁剪工作区</button>
            <button class="sidebar-link" data-section-target="keying-console" type="button">抠图工作区</button>
            <button class="sidebar-link" data-section-target="preview-console" type="button">预览工作区</button>
            <button class="sidebar-link" data-section-target="export-console" type="button">导出工作区</button>
          </aside>

          <div class="console-main">
            <section class="dashboard-top" id="dashboard-top">
              <div class="dashboard-heading">
                <div>
                  <span class="section-kicker">控制台</span>
                  <h2>序列帧处理后台</h2>
                </div>
                <p>在这里按顺序完成素材导入、裁剪、抠图、动画检查与导出交付。</p>
              </div>

              <div class="stats-grid">
                <article class="stat-card">
                  <span>源视频尺寸</span>
                  <strong id="metric-resolution">-</strong>
                </article>
                <article class="stat-card">
                  <span>片段时长</span>
                  <strong id="metric-duration">-</strong>
                </article>
                <article class="stat-card">
                  <span>已生成帧数</span>
                  <strong id="metric-frames">0</strong>
                </article>
                <article class="stat-card">
                  <span>处理模式</span>
                  <strong>浏览器本地处理</strong>
                </article>
              </div>
            </section>

            <section class="status-bar">
              <div id="status-text">${state.status}</div>
            </section>

            <div class="board-row">
              <article class="panel" id="source-console">
                <div class="panel-head">
                  <h2>1. 素材输入台</h2>
                  <span>本地视频导入</span>
                </div>

                <label class="upload-drop" for="video-file">
                  <input id="video-file" type="file" accept="video/*" />
                  <strong>拖拽视频到这里，或点击选择本地文件</strong>
                  <span>推荐使用 MP4 或 WebM。所有处理都在浏览器本地完成，不会上传到服务器。</span>
                </label>

                <div class="meta-list" id="video-meta">
                  <div><span>文件名</span><strong>-</strong></div>
                  <div><span>时长</span><strong>-</strong></div>
                  <div><span>分辨率</span><strong>-</strong></div>
                </div>
              </article>

              <article class="panel">
                <div class="panel-head">
                  <h2>2. 抽帧参数台</h2>
                  <span>时间段与抽帧频率</span>
                </div>

                <div class="control-grid">
                  <label>
                    <span>开始时间</span>
                    <input id="start-time" type="number" min="0" step="0.1" value="0" />
                  </label>
                  <label>
                    <span>结束时间</span>
                    <input id="end-time" type="number" min="0" step="0.1" value="0" />
                  </label>
                  <label>
                    <span>每秒抽帧数</span>
                    <input id="fps" type="number" min="1" max="24" step="1" value="8" />
                  </label>
                  <label>
                    <span>最大帧数</span>
                    <input id="max-frames" type="number" min="1" max="120" step="1" value="24" />
                  </label>
                </div>
              </article>
            </div>

            <div class="board-row">
              <article class="panel" id="crop-console">
                <div class="panel-head">
                  <h2>3. 裁剪工作区</h2>
                  <span>拖拽框选保留区域</span>
                </div>

                <div class="canvas-stage">
                  <canvas id="crop-canvas"></canvas>
                </div>

                <div class="control-grid">
                  <label>
                    <span>左边距 %</span>
                    <input id="crop-left" type="number" min="0" max="99" step="0.1" value="0" />
                  </label>
                  <label>
                    <span>上边距 %</span>
                    <input id="crop-top" type="number" min="0" max="99" step="0.1" value="0" />
                  </label>
                  <label>
                    <span>宽度 %</span>
                    <input id="crop-width" type="number" min="1" max="100" step="0.1" value="100" />
                  </label>
                  <label>
                    <span>高度 %</span>
                    <input id="crop-height" type="number" min="1" max="100" step="0.1" value="100" />
                  </label>
                </div>
              </article>

              <article class="panel" id="keying-console">
                <div class="panel-head">
                  <h2>4. 抠图工作区</h2>
                  <span>点击背景取色并观察结果</span>
                </div>

                <div class="tabs">
                  <button class="tab is-active" data-preview-mode="result" type="button">抠图结果</button>
                  <button class="tab" data-preview-mode="mask" type="button">Alpha 蒙版</button>
                  <button class="tab" data-preview-mode="solid" type="button">纯底色</button>
                </div>

                <div class="preview-grid">
                  <div>
                    <p class="mini-title">原图取样区</p>
                    <div class="canvas-stage">
                      <canvas id="sample-canvas"></canvas>
                    </div>
                  </div>
                  <div>
                    <p class="mini-title">右侧结果预览</p>
                    <div class="canvas-stage checker">
                      <canvas id="result-canvas"></canvas>
                    </div>
                  </div>
                </div>

                <div class="control-grid">
                  <label class="switch-row">
                    <span>启用抠图</span>
                    <input id="key-enabled" type="checkbox" checked />
                  </label>
                  <label>
                    <span>取样颜色</span>
                    <input id="sample-color" type="text" value="" placeholder="#00ffff" readonly />
                  </label>
                  <label>
                    <span>容差</span>
                    <input id="tolerance" type="range" min="1" max="120" step="1" value="34" />
                  </label>
                  <label>
                    <span>边缘柔化</span>
                    <input id="softness" type="range" min="0" max="80" step="1" value="18" />
                  </label>
                  <label>
                    <span>去溢色</span>
                    <input id="despill" type="range" min="0" max="100" step="1" value="55" />
                  </label>
                  <label>
                    <span>纯底色预览</span>
                    <input id="solid-background" type="color" value="#0f172a" />
                  </label>
                </div>
              </article>
            </div>

            <div class="board-row">
              <article class="panel" id="preview-console">
                <div class="panel-head">
                  <h2>5. 预览工作区</h2>
                  <span>序列图与动画验收</span>
                </div>

                <div class="tabs">
                  <button class="tab is-active" data-frame-preview="sheet" type="button">序列图</button>
                  <button class="tab" data-frame-preview="animation" type="button">动画预览</button>
                </div>

                <div id="sheet-preview" class="sheet-preview checker"></div>
                <div id="animation-preview" class="animation-preview checker view-hidden">
                  <canvas id="animation-canvas"></canvas>
                </div>
              </article>

              <article class="panel" id="export-console">
                <div class="panel-head">
                  <h2>6. 导出工作区</h2>
                  <span>本地导出与最终交付</span>
                </div>

                <div class="control-grid">
                  <label>
                    <span>导出列数</span>
                    <input id="columns" type="number" min="1" max="12" step="1" value="4" />
                  </label>
                  <label>
                    <span>帧间距</span>
                    <input id="gap" type="number" min="0" max="32" step="1" value="0" />
                  </label>
                  <label>
                    <span>输出模式</span>
                    <select id="output-mode">
                      <option value="original">保持原始尺寸</option>
                      <option value="fixed">固定方形尺寸</option>
                    </select>
                  </label>
                  <label>
                    <span>方形尺寸</span>
                    <input id="output-size" type="number" min="32" max="1024" step="32" value="256" />
                  </label>
                </div>

                <div class="export-summary">
                  <div>
                    <span>推荐用途</span>
                    <strong>角色动画、特效序列、透明素材</strong>
                  </div>
                  <div>
                    <span>导出前建议</span>
                    <strong>先确认没有抖动、裁切和明显边缘脏色</strong>
                  </div>
                </div>

                <div class="action-stack">
                  <button id="generate-button" class="primary-button" type="button">生成当前序列帧</button>
                  <button id="download-sheet" class="secondary-button" type="button">下载序列图 PNG</button>
                  <button id="download-zip" class="secondary-button" type="button">下载透明单帧 ZIP</button>
                </div>
              </article>
            </div>

            <section class="console-cta">
              <div class="console-cta__copy">
                <strong>如果这个工具对你有帮助</strong>
                <p>欢迎点击支持项目，也可以前往 GitHub 给作者项目点一个收藏。你的支持会帮助 Mayfly 持续迭代。</p>
              </div>
              <div class="console-cta__actions">
                <button class="hero-action secondary-link" data-switch-view="support" type="button">支持项目</button>
                <a class="hero-action primary-link" href="${GITHUB_REPO_URL}" target="_blank" rel="noreferrer">前往 GitHub 收藏</a>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  </div>
`;

const homeView = byId<HTMLElement>('home-view');
const consoleView = byId<HTMLElement>('console-view');
const supportView = byId<HTMLElement>('support-view');
const fileInput = byId<HTMLInputElement>('video-file');
const uploadDrop = fileInput.closest('.upload-drop') as HTMLLabelElement;
const cropCanvas = byId<HTMLCanvasElement>('crop-canvas');
const sampleCanvas = byId<HTMLCanvasElement>('sample-canvas');
const resultCanvas = byId<HTMLCanvasElement>('result-canvas');
const animationCanvas = byId<HTMLCanvasElement>('animation-canvas');
const videoMetaPanel = byId<HTMLDivElement>('video-meta');
const statusText = byId<HTMLDivElement>('status-text');
const generateButton = byId<HTMLButtonElement>('generate-button');
const downloadSheetButton = byId<HTMLButtonElement>('download-sheet');
const downloadZipButton = byId<HTMLButtonElement>('download-zip');
const sheetPreview = byId<HTMLDivElement>('sheet-preview');
const animationPreview = byId<HTMLDivElement>('animation-preview');
const sampleColorInput = byId<HTMLInputElement>('sample-color');
const metricResolution = byId<HTMLElement>('metric-resolution');
const metricDuration = byId<HTMLElement>('metric-duration');
const metricFrames = byId<HTMLElement>('metric-frames');

const startTimeInput = byId<HTMLInputElement>('start-time');
const endTimeInput = byId<HTMLInputElement>('end-time');
const fpsInput = byId<HTMLInputElement>('fps');
const maxFramesInput = byId<HTMLInputElement>('max-frames');
const columnsInput = byId<HTMLInputElement>('columns');
const gapInput = byId<HTMLInputElement>('gap');
const outputModeSelect = byId<HTMLSelectElement>('output-mode');
const outputSizeInput = byId<HTMLInputElement>('output-size');

const cropLeftInput = byId<HTMLInputElement>('crop-left');
const cropTopInput = byId<HTMLInputElement>('crop-top');
const cropWidthInput = byId<HTMLInputElement>('crop-width');
const cropHeightInput = byId<HTMLInputElement>('crop-height');

const keyEnabledInput = byId<HTMLInputElement>('key-enabled');
const toleranceInput = byId<HTMLInputElement>('tolerance');
const softnessInput = byId<HTMLInputElement>('softness');
const despillInput = byId<HTMLInputElement>('despill');
const solidBackgroundInput = byId<HTMLInputElement>('solid-background');

let dragStart: { x: number; y: number } | null = null;
let animationIndex = 0;
let animationHandle = 0;
let animationLastTick = 0;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} was not found.`);
  }

  return element as T;
}

function setStatus(message: string): void {
  state.status = message;
  statusText.textContent = message;
}

function switchView(view: ViewMode, options: { scroll?: boolean } = {}): void {
  state.view = view;
  homeView.classList.toggle('view-hidden', view !== 'home');
  consoleView.classList.toggle('view-hidden', view !== 'console');
  supportView.classList.toggle('view-hidden', view !== 'support');

  document.querySelectorAll<HTMLElement>('.global-nav [data-switch-view]').forEach((node) => {
    const target = node.dataset.switchView as ViewMode;
    node.classList.toggle('is-active', target === view);
  });

  if (options.scroll) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function setBusy(busy: boolean): void {
  state.isBusy = busy;
  generateButton.disabled = busy;
  downloadSheetButton.disabled = busy || state.frames.length === 0;
  downloadZipButton.disabled = busy || state.frames.length === 0;
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateMetrics(): void {
  metricResolution.textContent = state.videoMeta
    ? `${state.videoMeta.width} × ${state.videoMeta.height}`
    : '-';
  metricDuration.textContent = state.videoMeta ? formatSeconds(state.videoMeta.duration) : '-';
  metricFrames.textContent = String(state.frames.length);
}

function readControls(): void {
  state.extraction.startTime = Number(startTimeInput.value) || 0;
  state.extraction.endTime = Number(endTimeInput.value) || 0;
  state.extraction.framesPerSecond = Number(fpsInput.value) || 8;
  state.extraction.maxFrames = Number(maxFramesInput.value) || 24;
  state.extraction.columns = Number(columnsInput.value) || 4;
  state.extraction.gap = Number(gapInput.value) || 0;
  state.extraction.outputMode = outputModeSelect.value === 'fixed' ? 'fixed' : 'original';
  state.extraction.outputSize = Number(outputSizeInput.value) || 256;
  state.cropRectPercent = {
    leftPercent: Number(cropLeftInput.value) || 0,
    topPercent: Number(cropTopInput.value) || 0,
    widthPercent: Number(cropWidthInput.value) || 100,
    heightPercent: Number(cropHeightInput.value) || 100,
  };
  state.keySettings.enabled = keyEnabledInput.checked;
  state.keySettings.tolerance = Number(toleranceInput.value) || 34;
  state.keySettings.softness = Number(softnessInput.value) || 18;
  state.keySettings.despill = Number(despillInput.value) || 55;
  state.keySettings.solidBackground = solidBackgroundInput.value;
}

function writeCropInputs(): void {
  cropLeftInput.value = state.cropRectPercent.leftPercent.toFixed(1);
  cropTopInput.value = state.cropRectPercent.topPercent.toFixed(1);
  cropWidthInput.value = state.cropRectPercent.widthPercent.toFixed(1);
  cropHeightInput.value = state.cropRectPercent.heightPercent.toFixed(1);
}

function drawCanvas(
  target: HTMLCanvasElement,
  source: HTMLCanvasElement | null,
  options?: {
    marker?: ColorSample | null;
    background?: string | null;
    cropRect?: CropRectPercent | null;
  },
): void {
  if (!source) {
    target.width = 1;
    target.height = 1;
    return;
  }

  target.width = source.width;
  target.height = source.height;
  const context = target.getContext('2d');

  if (!context) {
    return;
  }

  context.clearRect(0, 0, target.width, target.height);
  if (options?.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, target.width, target.height);
  }
  context.drawImage(source, 0, 0);

  if (options?.cropRect) {
    const bounds = cropBoundsForSize(source.width, source.height, options.cropRect);
    context.save();
    context.fillStyle = 'rgba(15, 23, 42, 0.42)';
    context.fillRect(0, 0, target.width, bounds.y);
    context.fillRect(0, bounds.y, bounds.x, bounds.height);
    context.fillRect(bounds.x + bounds.width, bounds.y, target.width - bounds.x - bounds.width, bounds.height);
    context.fillRect(0, bounds.y + bounds.height, target.width, target.height - bounds.y - bounds.height);
    context.strokeStyle = '#ff8a3d';
    context.lineWidth = Math.max(2, target.width / 280);
    context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    context.restore();
  }

  if (options?.marker) {
    context.save();
    context.strokeStyle = '#ff8a3d';
    context.lineWidth = Math.max(2, target.width / 220);
    context.beginPath();
    context.arc(options.marker.x, options.marker.y, Math.max(10, target.width / 34), 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

function updatePreviewCanvases(): void {
  drawCanvas(cropCanvas, state.sourceFrame, { cropRect: state.cropRectPercent });
  drawCanvas(sampleCanvas, state.sourcePreviewFrame, { marker: state.keySettings.sample });

  const preview = state.processedPreview;
  if (!preview) {
    drawCanvas(resultCanvas, null);
    return;
  }

  if (state.previewMode === 'mask') {
    drawCanvas(resultCanvas, preview.maskCanvas);
    return;
  }

  if (state.previewMode === 'solid') {
    drawCanvas(resultCanvas, preview.resultCanvas, {
      background: state.keySettings.solidBackground,
    });
    return;
  }

  drawCanvas(resultCanvas, preview.resultCanvas);
}

function setPreviewMode(mode: PreviewMode): void {
  state.previewMode = mode;
  document.querySelectorAll<HTMLElement>('[data-preview-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.previewMode === mode);
  });
  updatePreviewCanvases();
}

function setFramePreviewMode(mode: FramePreviewMode): void {
  state.framePreviewMode = mode;
  document.querySelectorAll<HTMLElement>('[data-frame-preview]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.framePreview === mode);
  });
  sheetPreview.classList.toggle('view-hidden', mode !== 'sheet');
  animationPreview.classList.toggle('view-hidden', mode !== 'animation');
}

function updateVideoMetaPanel(): void {
  const meta = state.videoMeta;
  videoMetaPanel.innerHTML = `
    <div><span>文件名</span><strong>${meta?.name ?? '-'}</strong></div>
    <div><span>时长</span><strong>${meta ? `${meta.duration.toFixed(2)} 秒` : '-'}</strong></div>
    <div><span>分辨率</span><strong>${meta ? `${meta.width} × ${meta.height}` : '-'}</strong></div>
  `;
}

async function refreshPreviewFrame(): Promise<void> {
  if (!state.videoUrl || !state.videoMeta) {
    return;
  }

  readControls();
  const reader = await createVideoFrameReader(state.videoUrl);

  try {
    const time = clamp(state.extraction.startTime, 0, state.videoMeta.duration);
    state.sourceFrame = await reader.capture(time);
    const [previewFrame] = await extractFrames(reader, [time], state.cropRectPercent);
    state.sourcePreviewFrame = previewFrame.image;
    const [processed] = processFrames([previewFrame], state.keySettings);
    state.processedPreview = processed;
    updatePreviewCanvases();
  } finally {
    reader.dispose();
  }
}

async function loadVideo(file: File): Promise<void> {
  if (state.videoUrl) {
    revokeVideoAsset(state.videoUrl);
  }

  const asset = await loadVideoAsset(file);
  state.videoUrl = asset.url;
  state.videoMeta = asset.meta;
  state.cropRectPercent = { ...DEFAULT_CROP };
  state.frames = [];
  state.keySettings.sample = null;
  sampleColorInput.value = '';
  state.extraction.startTime = 0;
  state.extraction.endTime = Number(asset.meta.duration.toFixed(2));
  startTimeInput.value = '0';
  endTimeInput.value = asset.meta.duration.toFixed(2);
  writeCropInputs();
  updateMetrics();
  updateVideoMetaPanel();
  setStatus('视频已载入。你可以先拖拽裁剪区域，再点击取样区选择背景色。');
  await refreshPreviewFrame();
  await renderSheetPreview();
}

async function handleFile(file: File): Promise<void> {
  setBusy(true);
  setStatus('正在加载视频...');
  try {
    await loadVideo(file);
    switchView('console', { scroll: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '当前视频无法加载，请更换文件重试。';
    setStatus(message);
  } finally {
    setBusy(false);
  }
}

function pointerToCanvas(event: PointerEvent | MouseEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function updateCropFromDrag(start: { x: number; y: number }, end: { x: number; y: number }): void {
  if (!state.sourceFrame) {
    return;
  }

  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.max(1, Math.abs(end.x - start.x));
  const height = Math.max(1, Math.abs(end.y - start.y));

  state.cropRectPercent = {
    leftPercent: clamp((left / state.sourceFrame.width) * 100, 0, 99),
    topPercent: clamp((top / state.sourceFrame.height) * 100, 0, 99),
    widthPercent: clamp((width / state.sourceFrame.width) * 100, 1, 100),
    heightPercent: clamp((height / state.sourceFrame.height) * 100, 1, 100),
  };
  writeCropInputs();
  void refreshPreviewFrame();
}

async function renderSheetPreview(): Promise<void> {
  if (!state.frames.length) {
    sheetPreview.innerHTML = '<div class="empty-state">生成完成后，这里会显示序列图预览。</div>';
    stopAnimation();
    return;
  }

  const sheet = await buildSheet(
    state.frames,
    state.extraction.columns,
    state.extraction.gap,
    state.extraction.outputMode,
    state.extraction.outputSize,
  );
  const url = sheet.canvas.toDataURL('image/png');
  sheetPreview.innerHTML = `<img src="${url}" alt="序列图预览" />`;
  startAnimation();
}

function stopAnimation(): void {
  if (animationHandle) {
    window.cancelAnimationFrame(animationHandle);
    animationHandle = 0;
  }
}

function startAnimation(): void {
  stopAnimation();
  if (!state.frames.length) {
    return;
  }

  const context = animationCanvas.getContext('2d');
  const frameCanvas = state.frames[0].resultCanvas;
  if (!context) {
    return;
  }

  animationCanvas.width = frameCanvas.width;
  animationCanvas.height = frameCanvas.height;
  animationIndex = 0;
  animationLastTick = 0;
  const frameDuration = 1000 / Math.max(1, state.extraction.framesPerSecond);

  const tick = (time: number) => {
    if (!animationLastTick) {
      animationLastTick = time;
    }

    if (time - animationLastTick >= frameDuration) {
      animationIndex = (animationIndex + 1) % state.frames.length;
      animationLastTick = time;
    }

    context.clearRect(0, 0, animationCanvas.width, animationCanvas.height);
    context.drawImage(state.frames[animationIndex].resultCanvas, 0, 0);
    animationHandle = window.requestAnimationFrame(tick);
  };

  animationHandle = window.requestAnimationFrame(tick);
}

async function generateFrames(): Promise<void> {
  if (!state.videoUrl || !state.videoMeta) {
    setStatus('请先上传视频，再生成序列帧。');
    return;
  }

  readControls();
  setBusy(true);
  setStatus('正在准备抽帧任务...');
  const times = sampleTimes(
    state.videoMeta.duration,
    state.extraction.startTime,
    state.extraction.endTime,
    state.extraction.framesPerSecond,
    state.extraction.maxFrames,
  );

  const reader = await createVideoFrameReader(state.videoUrl);

  try {
    const rawFrames = await extractFrames(reader, times, state.cropRectPercent, (completed, total) => {
      setStatus(`正在抽帧 ${completed} / ${total} ...`);
    });
    state.frames = processFrames(rawFrames, state.keySettings);
    updateMetrics();
    setStatus(`已生成 ${state.frames.length} 帧。现在可以预览序列图或直接导出。`);
    await renderSheetPreview();
  } catch (error) {
    const message = error instanceof Error ? error.message : '抽帧失败，请调整参数后重试。';
    setStatus(message);
  } finally {
    reader.dispose();
    setBusy(false);
  }
}

async function exportSheet(): Promise<void> {
  if (!state.frames.length) {
    return;
  }

  setBusy(true);
  try {
    const blob = await sheetBlob(
      state.frames,
      state.extraction.columns,
      state.extraction.gap,
      state.extraction.outputMode,
      state.extraction.outputSize,
    );
    downloadBlob(blob, 'mayfly-sprite-sheet.png');
    setStatus('序列图 PNG 已导出。');
  } finally {
    setBusy(false);
  }
}

async function exportZip(): Promise<void> {
  if (!state.frames.length) {
    return;
  }

  setBusy(true);
  try {
    const blob = await framesZipBlob(
      state.frames,
      state.extraction.outputMode,
      state.extraction.outputSize,
    );
    downloadBlob(blob, 'mayfly-transparent-frames.zip');
    setStatus('透明单帧 ZIP 已导出。');
  } finally {
    setBusy(false);
  }
}

document.querySelectorAll<HTMLElement>('[data-switch-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const nextView = button.dataset.switchView as ViewMode;
    switchView(nextView, { scroll: true });
  });
});

document.querySelectorAll<HTMLElement>('[data-section-target]').forEach((button) => {
  button.addEventListener('click', () => {
    const targetId = button.dataset.sectionTarget;
    if (!targetId) {
      return;
    }

    document.querySelectorAll<HTMLElement>('[data-section-target]').forEach((item) => {
      item.classList.toggle('is-active', item === button);
    });

    switchView('console');
    byId<HTMLElement>(targetId).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }

  await handleFile(file);
});

uploadDrop.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadDrop.classList.add('is-dragover');
});

uploadDrop.addEventListener('dragleave', () => {
  uploadDrop.classList.remove('is-dragover');
});

uploadDrop.addEventListener('drop', async (event) => {
  event.preventDefault();
  uploadDrop.classList.remove('is-dragover');
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }

  await handleFile(file);
});

for (const input of [
  startTimeInput,
  endTimeInput,
  fpsInput,
  maxFramesInput,
  columnsInput,
  gapInput,
  outputSizeInput,
  cropLeftInput,
  cropTopInput,
  cropWidthInput,
  cropHeightInput,
  toleranceInput,
  softnessInput,
  despillInput,
  solidBackgroundInput,
  keyEnabledInput,
  outputModeSelect,
]) {
  input.addEventListener('input', () => {
    readControls();
    void refreshPreviewFrame();
    if (state.frames.length) {
      void renderSheetPreview();
    }
  });
}

cropCanvas.addEventListener('pointerdown', (event) => {
  if (!state.sourceFrame) {
    return;
  }

  dragStart = pointerToCanvas(event, cropCanvas);
  cropCanvas.setPointerCapture(event.pointerId);
});

cropCanvas.addEventListener('pointermove', (event) => {
  if (!dragStart || !state.sourceFrame) {
    return;
  }

  const current = pointerToCanvas(event, cropCanvas);
  updateCropFromDrag(dragStart, current);
});

cropCanvas.addEventListener('pointerup', (event) => {
  if (!dragStart) {
    return;
  }

  const end = pointerToCanvas(event, cropCanvas);
  updateCropFromDrag(dragStart, end);
  dragStart = null;
  cropCanvas.releasePointerCapture(event.pointerId);
});

sampleCanvas.addEventListener('click', (event) => {
  if (!state.sourcePreviewFrame) {
    return;
  }

  const point = pointerToCanvas(event, sampleCanvas);
  state.keySettings.sample = sampleCanvasColor(state.sourcePreviewFrame, point);
  sampleColorInput.value = state.keySettings.sample.hex;
  void refreshPreviewFrame();
});

document.querySelectorAll<HTMLElement>('[data-preview-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.previewMode as PreviewMode;
    setPreviewMode(mode);
  });
});

document.querySelectorAll<HTMLElement>('[data-frame-preview]').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.framePreview as FramePreviewMode;
    setFramePreviewMode(mode);
  });
});

generateButton.addEventListener('click', () => {
  void generateFrames();
});

downloadSheetButton.addEventListener('click', () => {
  void exportSheet();
});

downloadZipButton.addEventListener('click', () => {
  void exportZip();
});

setBusy(false);
updateVideoMetaPanel();
updateMetrics();
setPreviewMode('result');
setFramePreviewMode('sheet');
switchView('home');
