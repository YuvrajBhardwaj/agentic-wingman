/**
 * Parse a Server-Sent-Events response body, yielding the JSON payload of each
 * `data:` line. Stops on the `[DONE]` sentinel. Tolerates multi-line frames.
 */
export async function* parseSseJson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      // Frames are separated by a blank line (\n\n).
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const payload = extractData(frame);
        if (payload === null) continue;
        if (payload === '[DONE]') return;
        yield JSON.parse(payload) as T;
      }
    }

    const tail = extractData(buffer);
    if (tail !== null && tail !== '[DONE]' && tail.trim() !== '') {
      yield JSON.parse(tail) as T;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Join the `data:` lines of an SSE frame, ignoring comments and other fields. */
const extractData = (frame: string): string | null => {
  const lines = frame.split('\n');
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return data.length === 0 ? null : data.join('\n');
};

/**
 * Parse a newline-delimited JSON (NDJSON) stream — used by Ollama's native API.
 */
export async function* parseNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line !== '') yield JSON.parse(line) as T;
      }
    }
    const last = buffer.trim();
    if (last !== '') yield JSON.parse(last) as T;
  } finally {
    reader.releaseLock();
  }
}
