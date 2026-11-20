import type { Detection, InferenceProvider } from '../../domain/vision/detection.js';

export class MockInferenceProvider implements InferenceProvider {
  async detect(_jpegBase64: string): Promise<Detection[]> {
    return [];
  }
}
