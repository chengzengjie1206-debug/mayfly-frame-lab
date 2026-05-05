declare module 'pica' {
  export default class Pica {
    resize(from: HTMLCanvasElement, to: HTMLCanvasElement): Promise<HTMLCanvasElement>;
  }
}
