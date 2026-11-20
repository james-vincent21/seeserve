export interface Detection {
  label: string;
  confidence: number;
  /** Bounding box in normalized 0..1 image coordinates. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** COCO keypoint order when a pose model is used: shoulders 5/6, wrists 9/10. */
  keypoints?: Array<{ x: number; y: number; confidence: number }>;
}

export interface InferenceProvider {
  detect(jpegBase64: string): Promise<Detection[]>;
}
