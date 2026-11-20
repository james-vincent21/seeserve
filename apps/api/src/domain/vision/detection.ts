export interface Detection {
  label: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  keypoints?: Array<{ x: number; y: number; confidence: number }>;
}

export interface InferenceProvider {
  detect(jpegBase64: string): Promise<Detection[]>;
}
