import { calculateGRM } from './genomicsMath';

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'CALCULATE_GRM') {
    const { snpMatrix, method, tuneType } = payload;
    try {
      const result = calculateGRM(snpMatrix, method, tuneType);
      self.postMessage({ type: 'GRM_RESULT', payload: result });
    } catch (error) {
      self.postMessage({ type: 'GRM_ERROR', error: error instanceof Error ? error.message : 'Unknown error during GRM calculation' });
    }
  }
};
