/* MedIndex registry parser worker: keeps large payload work off the UI thread. */
'use strict';

const BASE64_CHUNK = 256 * 1024;

function decodeBase64Parts(parts) {
  const encoded = Array.isArray(parts) ? parts.join('') : '';
  if (!encoded) throw new Error('Payload-i i regjistrit është bosh.');

  const chunks = [];
  let total = 0;
  for (let offset = 0; offset < encoded.length; offset += BASE64_CHUNK) {
    const end = Math.min(encoded.length, offset + BASE64_CHUNK);
    const alignedEnd = end < encoded.length ? end - ((end - offset) % 4) : end;
    const binary = atob(encoded.slice(offset, alignedEnd));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    chunks.push(bytes);
    total += bytes.length;
    offset = alignedEnd - BASE64_CHUNK;
  }

  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

async function parseRegistry(parts) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Browser-i nuk e mbështet dekompresimin e regjistrit.');
  }
  const compressed = decodeBase64Parts(parts);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

self.addEventListener('message', async event => {
  if (event.data?.type !== 'PARSE_REGISTRY') return;
  try {
    const data = await parseRegistry(event.data.parts);
    self.postMessage({ type:'REGISTRY_PARSED', ok:true, data });
  } catch (error) {
    self.postMessage({
      type:'REGISTRY_PARSED',
      ok:false,
      error:String(error?.message || error || 'Regjistri nuk u lexua.'),
    });
  }
});
