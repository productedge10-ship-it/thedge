import { decodeBuffer, parseCandles } from './parseCsv';

/* Воркер лише читає файл і віддає масиви назад «передачею», без
   копіювання: 45 МБ копії зайвий раз блокували б головний потік. */
self.onmessage = async (e) => {
  try {
    const buf = await e.data.file.arrayBuffer();
    self.postMessage({ type: 'progress', p: 0.02 });
    const text = decodeBuffer(buf);
    const r = parseCandles(text, (p) => self.postMessage({ type: 'progress', p: 0.05 + p * 0.9 }));
    if (!r.n) throw new Error('no_rows');
    self.postMessage(
      { type: 'done', set: r },
      [r.t.buffer, r.o.buffer, r.h.buffer, r.l.buffer, r.c.buffer, ...(r.v ? [r.v.buffer] : [])],
    );
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
