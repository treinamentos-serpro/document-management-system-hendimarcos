import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadDocument, listDocuments, saveDocument, uploadDocument } from '../src/services/documentApi.js';

test('listagem usa /api, cabeçalho de dono e sinal de cancelamento', async (t) => {
  const documents = [{ id: '1', originalName: 'arquivo.txt' }];
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ documents }));
  const controller = new AbortController();
  assert.deepEqual(await listDocuments('dono', controller.signal), documents);
  assert.deepEqual(fetchMock.mock.calls[0].arguments, ['/api/documents', {
    signal: controller.signal,
    headers: { 'X-Owner-Id': 'dono' },
  }]);
});

test('listagem aceita paginação opcional sem mudar chamadas existentes', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ documents: [] }));
  await listDocuments('dono', undefined, { limit: 50, offset: 100 });
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/documents?limit=50&offset=100');
});

test('upload envia FormData sem sobrescrever o Content-Type do navegador', async (t) => {
  const document = { id: '1', originalName: 'relatório.txt' };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ document }, { status: 201 }));
  const file = new File(['conteúdo'], 'relatório.txt');
  assert.deepEqual(await uploadDocument('dono', file), document);
  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, '/api/upload');
  assert.equal(options.method, 'POST');
  assert.deepEqual(options.headers, { 'X-Owner-Id': 'dono' });
  assert.ok(options.body instanceof FormData);
  assert.equal(options.body.get('file').name, file.name);
  assert.equal(await options.body.get('file').text(), 'conteúdo');
});

test('download codifica o identificador, envia o dono e retorna bytes', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([0, 128, 255])));
  const blob = await downloadDocument('dono', 'id/com espaço');
  assert.deepEqual(fetchMock.mock.calls[0].arguments, [
    '/api/documents/id%2Fcom%20espa%C3%A7o/download', { headers: { 'X-Owner-Id': 'dono' } },
  ]);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array([0, 128, 255]));
});

test('operações propagam a mensagem JSON de erro do backend', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    error: { code: 'OWNER_REQUIRED', message: 'Informe o identificador do usuário.' },
  }, { status: 400 }));
  for (const operation of [
    () => listDocuments(''),
    () => uploadDocument('', new File([''], 'arquivo.txt')),
    () => downloadDocument('', 'id'),
  ]) {
    await assert.rejects(operation, { message: 'Informe o identificador do usuário.' });
  }
});

test('erro HTTP sem JSON não é tratado como sucesso', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('proxy indisponível', { status: 502 }));
  await assert.rejects(() => listDocuments('dono'), /HTTP 502/);
});

test('falha de conexão tem mensagem em português e cancelamento é preservado', async (t) => {
  const networkError = new TypeError('fetch failed');
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw networkError; });
  await assert.rejects(() => listDocuments('dono'), (error) => {
    assert.match(error.message, /Não foi possível conectar ao servidor/);
    assert.equal(error.cause, networkError);
    return true;
  });
  const abort = new DOMException('cancelado', 'AbortError');
  fetchMock.mock.mockImplementation(async () => { throw abort; });
  await assert.rejects(() => listDocuments('dono'), (error) => error === abort);
});

test('download usa nome original e libera o link e a URL temporários', (t) => {
  const blob = new Blob(['dados']);
  const events = [];
  const link = {
    click() { events.push('click'); },
    remove() { events.push('remove'); },
  };
  t.mock.method(URL, 'createObjectURL', (received) => {
    assert.equal(received, blob);
    return 'blob:teste';
  });
  const revoke = t.mock.method(URL, 'revokeObjectURL', () => {});
  t.mock.method(globalThis, 'setTimeout', (callback) => {
    events.push('schedule');
    callback();
  });
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  });
  globalThis.document = {
    createElement(tag) { assert.equal(tag, 'a'); return link; },
    body: { append(element) { assert.equal(element, link); events.push('append'); } },
  };
  saveDocument(blob, 'relatório.pdf');
  assert.equal(link.href, 'blob:teste');
  assert.equal(link.download, 'relatório.pdf');
  assert.deepEqual(events, ['append', 'click', 'remove', 'schedule']);
  assert.equal(revoke.mock.calls[0].arguments[0], 'blob:teste');
});
