import type { Detection, InferenceProvider } from '../../domain/vision/detection.js';

/** A clearly labeled integration fallback; it produces no real vision results. */
export class MockInferenceProvider implements InferenceProvider {
  async detect(_jpegBase64: string): Promise<Detection[]> {
    return [];
  }
}
