import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Captures a DOM element and exports it as a PDF.
 * Useful for exporting EDA reports directly from the browser.
 */
export const exportElementToPDF = async (elementId: string, filename: string = 'report.pdf') => {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id ${elementId} not found`);
  }

  // Temporarily adjust styles for better printing if necessary
  const originalBackground = element.style.background;
  element.style.background = '#ffffff'; // Ensure white background for PDF
  
  try {
    const canvas = await html2canvas(element, {
      scale: 2, // Higher resolution
      useCORS: true,
      logging: false
    });
    
    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    const pdf = new jsPDF({
      orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });
    
    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
    pdf.save(filename);
  } finally {
    // Restore original style
    element.style.background = originalBackground;
  }
};
