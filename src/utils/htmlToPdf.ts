// src/utils/htmlToPdf.ts
import html2Canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface PdfOptions {
  filename: string;
  elementId?: string;
  margin?: number;
  format?: 'a4' | 'a3' | 'letter';
  orientation?: 'portrait' | 'landscape';
  quality?: number;
}

/**
 * 将HTML元素导出为PDF
 */
export async function exportToPdf(options: PdfOptions): Promise<void> {
  const {
    filename,
    elementId = 'pdfDom',
    margin = 10,
    format = 'a4',
    orientation = 'portrait',
    quality = 1.0
  } = options;
  
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`找不到ID为"${elementId}"的元素`);
  }
  
  try {
    // 使用现代配置
    const canvas = await html2Canvas(element, {
      useCORS: true,
      scale: 2,
      logging: false,
      backgroundColor: '#ffffff',
      allowTaint: false,
    });
    
    const pdf = new jsPDF(
      orientation === 'portrait' ? 'p' : 'l',
      'mm',
      format
    );
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // 计算图片尺寸
    const contentWidth = pageWidth - 2 * margin;
    const contentHeight = (canvas.height * contentWidth) / canvas.width;
    
    let heightLeft = contentHeight;
    let position = 0;
    // 移除未使用的 page 变量
    // let page = 0;
    
    // 添加第一页
    pdf.addImage(
      canvas.toDataURL('image/jpeg', quality),
      'JPEG',
      margin,
      margin + position,
      contentWidth,
      contentHeight
    );
    
    heightLeft -= pageHeight;
    
    // 添加剩余页面
    while (heightLeft > 0) {
      position = heightLeft - contentHeight;
      pdf.addPage();
      pdf.addImage(
        canvas.toDataURL('image/jpeg', quality),
        'JPEG',
        margin,
        margin + position,
        contentWidth,
        contentHeight
      );
      heightLeft -= pageHeight;
    }
    
    // 保存文件
    const finalFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(finalFilename);
    
  } catch (error) {
    throw error;
  }
}

// 保持向后兼容
const htmlToPdf = {
  getPdf(title: string) {
    exportToPdf({
      filename: title,
      elementId: 'pdfDom'
    }).catch(console.error);
  }
};

export default htmlToPdf;