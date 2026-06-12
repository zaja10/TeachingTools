import { generateAndRankCrosses } from './crossEngine';

// Listen for messages from the main thread
self.onmessage = (event: MessageEvent) => {
  try {
    const { fullData, selectedTraits, optimalB, lineNames } = event.data;
    
    // Execute the heavy computational logic
    const results = generateAndRankCrosses(fullData, selectedTraits, optimalB, lineNames);
    
    // Post the results back to the main thread
    self.postMessage({ success: true, crosses: results });
  } catch (error) {
    self.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
};
