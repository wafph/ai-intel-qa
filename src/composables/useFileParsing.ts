/**
 * 文件解析工具模块。
 *
 * 提供 DOCX / TXT / Markdown / JSON 等格式的纯文本提取能力，
 * 供合规审核文件上传流程使用。所有函数均为纯工具函数，不依赖 Vue 响应式系统。
 */

/**
 * 从 AgentArts 上传接口返回结果中提取文本内容。
 * 兼容多种字段命名（content / text / document_content 等）。
 *
 * @param result - 上传接口返回的原始对象
 * @returns 提取到的文本，找不到时返回空字符串
 */
export const getTextFromUploadResult = (result: any): string => {
  return (
    result?.content ||
    result?.text ||
    result?.document_content ||
    result?.documentContent ||
    result?.data?.content ||
    result?.data?.text ||
    ''
  );
};

/**
 * 从 DataView 的小端序 uint16。
 * DOCX zip 格式解析辅助函数。
 *
 * @param view - 数据视图
 * @param offset - 读取偏移量
 * @returns 小端序 uint16 值
 */
const readUint16 = (view: DataView, offset: number) => view.getUint16(offset, true);

/**
 * 从 DataView 的小端序 uint32。
 * DOCX zip 格式解析辅助函数。
 *
 * @param view - 数据视图
 * @param offset - 读取偏移量
 * @returns 小端序 uint32 值
 */
const readUint32 = (view: DataView, offset: number) => view.getUint32(offset, true);

/**
 * 使用浏览器原生 DecompressionStream 解压 deflate-raw 数据。
 *
 * @param data - 压缩后的字节数组
 * @returns 解压后的字节数组
 * @throws 当浏览器不支持 DecompressionStream 时抛出错误
 */
const decompressDeflateRaw = async (data: Uint8Array): Promise<Uint8Array> => {
  const DecompressionStreamConstructor = (window as any).DecompressionStream;
  if (!DecompressionStreamConstructor) {
    throw new Error('当前浏览器不支持解压 docx 内容');
  }

  const compressedBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(compressedBuffer).set(data);
  const stream = new Blob([compressedBuffer]).stream().pipeThrough(
    new DecompressionStreamConstructor('deflate-raw'),
  );
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
};

/**
 * 解析 DOCX 内 word/document.xml 的 XML 文本，提取纯文本内容。
 * 递归遍历段落 (<w:p>) 中的文本节点、制表符和换行符。
 *
 * @param xmlText - document.xml 的原始 XML 字符串
 * @returns 提取到的纯文本，段落之间以换行符分隔
 */
const parseDocxXmlText = (xmlText: string): string => {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parserError = xml.querySelector('parsererror');
  if (parserError) return '';

  const paragraphs = Array.from(xml.getElementsByTagNameNS('*', 'p'));

  /**
   * 递归读取 XML 元素节点中的文本内容。
   * 支持 <w:t>（文本）、<w:tab>（制表符）、<w:br>/<w:cr>（换行）。
   */
  const readNodeText = (node: Element): string => {
    let text = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || '';
        return;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const childElement = child as Element;
      if (childElement.localName === 't') {
        text += childElement.textContent || '';
      } else if (childElement.localName === 'tab') {
        text += '\t';
      } else if (childElement.localName === 'br' || childElement.localName === 'cr') {
        text += '\n';
      } else {
        text += readNodeText(childElement);
      }
    });
    return text;
  };

  return paragraphs
    .map((paragraph) => readNodeText(paragraph).trim())
    .filter(Boolean)
    .join('\n');
};

/**
 * 从 DOCX 文件中提取纯文本。
 * 手动解析 ZIP 格式，定位 word/document.xml 并解压。
 *
 * @param file - 用户上传的 DOCX 文件
 * @returns 提取到的纯文本，失败时返回空字符串
 */
export const extractDocxText = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-8');
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;

  // 从文件末尾向前查找 End of Central Directory 记录
  for (let offset = bytes.length - 22; offset >= 0; offset--) {
    if (readUint32(view, offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset === -1) return '';

  const centralDirectoryEntries = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  let centralOffset = centralDirectoryOffset;

  // 遍历中央目录条目，查找 word/document.xml
  for (let index = 0; index < centralDirectoryEntries; index++) {
    if (readUint32(view, centralOffset) !== 0x02014b50) break;

    const compressionMethod = readUint16(view, centralOffset + 10);
    const compressedSize = readUint32(view, centralOffset + 20);
    const fileNameLength = readUint16(view, centralOffset + 28);
    const extraLength = readUint16(view, centralOffset + 30);
    const commentLength = readUint16(view, centralOffset + 32);
    const localHeaderOffset = readUint32(view, centralOffset + 42);
    const fileName = decoder.decode(
      bytes.slice(centralOffset + 46, centralOffset + 46 + fileNameLength),
    );

    if (fileName === 'word/document.xml') {
      if (readUint32(view, localHeaderOffset) !== 0x04034b50) return '';

      const localFileNameLength = readUint16(view, localHeaderOffset + 26);
      const localExtraLength = readUint16(view, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData = bytes.slice(dataStart, dataStart + compressedSize);
      const xmlBytes =
        compressionMethod === 0
          ? compressedData
          : compressionMethod === 8
            ? await decompressDeflateRaw(compressedData)
            : new Uint8Array();

      return parseDocxXmlText(decoder.decode(xmlBytes));
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return '';
};

/**
 * 从用户上传的可读文件中提取纯文本。
 * 支持 DOCX、TXT、Markdown、CSV、JSON、XML、HTML 等格式。
 *
 * @param file - 用户上传的文件
 * @returns 提取到的纯文本，无法解析时返回空字符串
 */
export const extractReadableFileText = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  if (extension === 'docx') {
    try {
      return await extractDocxText(file);
    } catch {
      return '';
    }
  }

  const readableExtensions = [
    'txt',
    'md',
    'markdown',
    'csv',
    'json',
    'xml',
    'html',
    'htm',
    'log',
    'yml',
    'yaml',
  ];

  if (file.type.startsWith('text/') || readableExtensions.includes(extension)) {
    try {
      return await file.text();
    } catch {
      return '';
    }
  }

  return '';
};
