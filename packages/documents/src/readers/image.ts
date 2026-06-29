import { imageSize } from 'image-size';

import type { DocumentReader } from '../types.js';

/**
 * Reads image metadata (dimensions, type). Text-from-image (OCR) plugs in via a
 * separate optional OCR provider; this reader provides the structural facts.
 */
export const imageReader: DocumentReader = {
  id: 'image',
  extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff'],
  async parse(input) {
    const dimensions = imageSize(input.bytes);
    const description =
      `Image ${dimensions.type ?? ''} ${dimensions.width}x${dimensions.height}`.trim();
    return {
      format: 'image',
      text: description,
      tables: [],
      metadata: {
        width: dimensions.width,
        height: dimensions.height,
        type: dimensions.type,
        bytes: input.bytes.length,
      },
    };
  },
};
