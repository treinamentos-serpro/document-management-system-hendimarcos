const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { mkdtemp, readFile, readdir, rm, stat, unlink } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const app = require('../src/app');
const { createDocumentRepository } = require('../src/repositories/documentRepository');
const { createDocumentRouter } = require('../src/routes/documentRoutes');
const { handleError } = require('../src/controllers/documentController');
const logger = require('../src/logger');

async function startServer(t, application) {
  const server = application.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function setup(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dms-backend-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = createDocumentRepository(path.join(directory, 'storage'));
  const application = express();
  application.use(createDocumentRouter(repository));
  application.use(handleError);
  const url = await startServer(t, application);
  return { url, repository };
}

function upload(url, owner = 'usuario-123', content = 'conteúdo do documento', name = 'relatório.pdf') {
  const body = new FormData();
  body.append('file', new Blob([content], { type: 'application/x-tipo-livre' }), name);
  return fetch(`${url}/upload`, {
    method: 'POST',
    headers: { 'X-Owner-Id': owner },
    body,
  });
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
  assert.deepEqual(Object.keys(body), ['error']);
  return body;
}

test('o app registra as rotas de documentos e preserva /health', async (t) => {
  const url = await startServer(t, app);
  const health = await fetch(`${url}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const documents = await fetch(`${url}/documents`, { headers: { 'X-Owner-Id': 'sem-documentos' } });
  assert.equal(documents.status, 200);
  assert.deepEqual(await documents.json(), { documents: [] });
  await expectError(await fetch(`${url}/upload`, { method: 'POST' }), 400, 'OWNER_REQUIRED');
  await expectError(await fetch(`${url}/documents/inexistente/download`, {
    headers: { 'X-Owner-Id': 'sem-documentos' },
  }), 404, 'DOCUMENT_NOT_FOUND');
});

test('o repositório padrão aponta para backend/storage independentemente do diretório de execução', () => {
  assert.equal(createDocumentRepository().storageDirectory, path.resolve(__dirname, '../storage'));
});

test('o repositório rejeita caminhos fora do diretório de armazenamento', async () => {
  const repository = createDocumentRepository(path.join(os.tmpdir(), 'dms-storage-path-test'));
  assert.throws(() => repository.getFilePath('../fora.txt'), /fora do diretório/);
  assert.throws(() => repository.getFilePath(path.join(os.tmpdir(), 'fora.txt')), /fora do diretório/);
  await assert.rejects(repository.removeFile('../fora.txt'), /fora do diretório/);
});

test('logger aplica LOG_LEVEL sem emitir conteúdo de contexto em outro nível', (t) => {
  const previousLevel = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'error';
  t.after(() => {
    if (previousLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previousLevel;
  });
  const infoOutput = t.mock.method(console, 'log', () => {});
  const errorOutput = t.mock.method(console, 'error', () => {});

  logger.info('evento.oculto');
  logger.error('evento.visivel', { errorCode: 'STORAGE_ERROR' });

  assert.equal(infoOutput.mock.callCount(), 0);
  assert.equal(errorOutput.mock.callCount(), 1);
  assert.deepEqual(JSON.parse(errorOutput.mock.calls[0].arguments[0]), {
    level: 'error',
    event: 'evento.visivel',
    errorCode: 'STORAGE_ERROR',
  });
});

test('upload grava bytes em disco e retorna somente os metadados públicos', async (t) => {
  const { url, repository } = await setup(t);
  const response = await upload(url, '  usuario-123  ');
  assert.equal(response.status, 201);
  const { document } = await response.json();
  assert.deepEqual(Object.keys(document).sort(), ['id', 'originalName', 'owner', 'size', 'uploadedAt']);
  assert.match(document.id, /^[0-9a-f-]{36}$/);
  assert.equal(document.originalName, 'relatório.pdf');
  assert.equal(document.size, Buffer.byteLength('conteúdo do documento'));
  assert.equal(document.owner, 'usuario-123');
  assert.equal(new Date(document.uploadedAt).toISOString(), document.uploadedAt);

  const stored = repository.findById(document.id);
  assert.notEqual(stored.storageName, document.originalName);
  assert.match(stored.storageName, /^[0-9a-f-]{36}$/);
  assert.deepEqual(await readdir(repository.storageDirectory), [stored.storageName]);
  assert.equal(await readFile(repository.getFilePath(stored.storageName), 'utf8'), 'conteúdo do documento');
  assert.equal((await stat(repository.storageDirectory)).mode & 0o777, 0o700);
  assert.equal((await stat(repository.getFilePath(stored.storageName))).mode & 0o777, 0o600);
});

test('listagem filtra pelo dono, normaliza o identificador e retorna lista vazia', async (t) => {
  const { url } = await setup(t);
  const first = (await (await upload(url, 'dono-a')).json()).document;
  const second = (await (await upload(url, 'dono-b')).json()).document;

  for (const [owner, expected] of [[' dono-a ', [first]], ['dono-b', [second]], ['outro', []]]) {
    const response = await fetch(`${url}/documents`, { headers: { 'X-Owner-Id': owner } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { documents: expected });
  }
});

test('listagem permite buscar páginas sem alterar a resposta sem parâmetros', async (t) => {
  const { url } = await setup(t);
  for (let index = 0; index < 3; index += 1) await upload(url, 'dono', `conteúdo-${index}`);

  const allResponse = await fetch(`${url}/documents`, { headers: { 'X-Owner-Id': 'dono' } });
  const allDocuments = (await allResponse.json()).documents;
  const pageResponse = await fetch(`${url}/documents?limit=1&offset=1`, {
    headers: { 'X-Owner-Id': 'dono' },
  });
  assert.deepEqual((await pageResponse.json()).documents, allDocuments.slice(1, 2));
});

test('listagem rejeita parâmetros de paginação inválidos', async (t) => {
  const { url } = await setup(t);
  await expectError(await fetch(`${url}/documents?limit=101`, {
    headers: { 'X-Owner-Id': 'dono' },
  }), 400, 'INVALID_PAGINATION');
});

test('repositório ordena a lista por data decrescente e não expõe registros mutáveis', () => {
  const repository = createDocumentRepository();
  repository.save({ id: 'antigo', owner: 'dono', uploadedAt: '2026-01-01T00:00:00.000Z' });
  repository.save({ id: 'novo', owner: 'dono', uploadedAt: '2026-02-01T00:00:00.000Z' });
  const documents = repository.listByOwner('dono');
  assert.deepEqual(documents.map((document) => document.id), ['novo', 'antigo']);
  documents[0].owner = 'outro';
  repository.findById('novo').owner = 'outro';
  assert.equal(repository.findById('novo').owner, 'dono');
});

test('download retorna os bytes como anexo com nome original', async (t) => {
  const { url } = await setup(t);
  const bytes = Buffer.from([0, 1, 2, 128, 255]);
  const { document } = await (await upload(url, 'dono', bytes)).json();
  const response = await fetch(`${url}/documents/${document.id}/download`, {
    headers: { 'X-Owner-Id': ' dono ' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.match(response.headers.get('content-disposition'), /^attachment;/);
  assert.match(response.headers.get('content-disposition'), /filename="relatório\.pdf"/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
});

test('documento de outro dono e documento inexistente produzem o mesmo 404', async (t) => {
  const { url } = await setup(t);
  const { document } = await (await upload(url, 'dono')).json();
  const responses = [];
  for (const id of [document.id, 'inexistente', '..%2F..%2Fpackage.json']) {
    const response = await fetch(`${url}/documents/${id}/download`, {
      headers: { 'X-Owner-Id': 'outro' },
    });
    responses.push(await expectError(response, 404, 'DOCUMENT_NOT_FOUND'));
  }
  assert.deepEqual(responses[0], responses[1]);
  assert.deepEqual(responses[0], responses[2]);
});

test('arquivo removido do disco resulta em 404 sem expor o caminho físico', async (t) => {
  const { url, repository } = await setup(t);
  const { document } = await (await upload(url, 'dono')).json();
  await unlink(repository.getFilePath(repository.findById(document.id).storageName));
  const response = await fetch(`${url}/documents/${document.id}/download`, {
    headers: { 'X-Owner-Id': 'dono' },
  });
  const body = await expectError(response, 404, 'DOCUMENT_NOT_FOUND');
  assert.equal(JSON.stringify(body).includes(repository.storageDirectory), false);
});

test('todas as rotas rejeitam owner ausente ou vazio antes de gravar arquivos', async (t) => {
  const { url, repository } = await setup(t);
  for (const owner of [undefined, '   ']) {
    const headers = owner === undefined ? {} : { 'X-Owner-Id': owner };
    for (const endpoint of ['/documents', '/documents/id/download', '/upload']) {
      const options = { headers };
      if (endpoint === '/upload') {
        options.method = 'POST';
        options.body = new FormData();
        options.body.append('file', new Blob(['dados']), 'arquivo.txt');
      }
      await expectError(await fetch(`${url}${endpoint}`, options), 400, 'OWNER_REQUIRED');
    }
  }
  await assert.rejects(readdir(repository.storageDirectory), { code: 'ENOENT' });
  assert.deepEqual(repository.listByOwner('dono'), []);
});

test('upload sem arquivo retorna FILE_REQUIRED', async (t) => {
  const { url } = await setup(t);
  const response = await fetch(`${url}/upload`, {
    method: 'POST',
    headers: { 'X-Owner-Id': 'dono' },
    body: new FormData(),
  });
  await expectError(response, 400, 'FILE_REQUIRED');
});

test('upload acima do limite configurado retorna 413 e remove o arquivo parcial', async (t) => {
  const previousLimit = process.env.MAX_UPLOAD_SIZE_BYTES;
  process.env.MAX_UPLOAD_SIZE_BYTES = '10';
  t.after(() => {
    if (previousLimit === undefined) delete process.env.MAX_UPLOAD_SIZE_BYTES;
    else process.env.MAX_UPLOAD_SIZE_BYTES = previousLimit;
  });
  const { url, repository } = await setup(t);
  await expectError(await upload(url, 'dono', Buffer.alloc(11)), 413, 'UPLOAD_TOO_LARGE');
  assert.deepEqual(repository.listByOwner('dono'), []);
  assert.deepEqual(await readdir(repository.storageDirectory), []);
});

test('campos incorretos e arquivos extras são rejeitados e limpos', async (t) => {
  const { url, repository } = await setup(t);
  await repository.prepareStorage();
  for (const fields of [['outro'], ['file', 'file']]) {
    const body = new FormData();
    for (const field of fields) body.append(field, new Blob(['dados']), 'arquivo.txt');
    const response = await fetch(`${url}/upload`, {
      method: 'POST',
      headers: { 'X-Owner-Id': 'dono' },
      body,
    });
    await expectError(response, 400, 'INVALID_MULTIPART');
    assert.deepEqual(await readdir(repository.storageDirectory), []);
    assert.deepEqual(repository.listByOwner('dono'), []);
  }
});

test('multipart truncado remove o arquivo parcial e não cria metadados', async (t) => {
  const { url, repository } = await setup(t);
  await repository.prepareStorage();
  const response = await fetch(`${url}/upload`, {
    method: 'POST',
    headers: {
      'X-Owner-Id': 'dono',
      'Content-Type': 'multipart/form-data; boundary=teste',
    },
    body: '--teste\r\nContent-Disposition: form-data; name="file"; filename="arquivo.txt"\r\n'
      + 'Content-Type: text/plain\r\n\r\nconteudo sem fechamento',
  });
  await expectError(response, 400, 'INVALID_MULTIPART');
  assert.deepEqual(await readdir(repository.storageDirectory), []);
  assert.deepEqual(repository.listByOwner('dono'), []);
});

test('multipart sem boundary retorna erro de entrada', async (t) => {
  const { url } = await setup(t);
  const response = await fetch(`${url}/upload`, {
    method: 'POST',
    headers: { 'X-Owner-Id': 'dono', 'Content-Type': 'multipart/form-data' },
    body: 'invalido',
  });
  await expectError(response, 400, 'INVALID_MULTIPART');
});

test('falha inesperada na consulta retorna erro JSON sem detalhes internos', async (t) => {
  const { url, repository } = await setup(t);
  const logs = t.mock.method(console, 'error', () => {});
  t.mock.method(repository, 'listByOwner', () => { throw new Error('detalhe interno'); });
  const response = await fetch(`${url}/documents`, { headers: { 'X-Owner-Id': 'dono' } });
  const body = await expectError(response, 500, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(body).includes('detalhe interno'), false);
  assert.equal(logs.mock.callCount(), 1);
});

test('JSON inválido é rejeitado pelo app com erro estruturado', async (t) => {
  const url = await startServer(t, app);
  const response = await fetch(`${url}/upload`, {
    method: 'POST',
    headers: { 'X-Owner-Id': 'dono', 'Content-Type': 'application/json' },
    body: '{',
  });
  await expectError(response, 400, 'INVALID_REQUEST');
});

test('falha na criação do diretório retorna STORAGE_ERROR sem registrar metadados', async (t) => {
  const { url, repository } = await setup(t);
  const logs = t.mock.method(console, 'error', () => {});
  t.mock.method(repository, 'prepareStorage', async () => {
    throw Object.assign(new Error('disco indisponivel'), { code: 'ENOSPC' });
  });
  await expectError(await upload(url), 500, 'STORAGE_ERROR');
  assert.deepEqual(repository.listByOwner('usuario-123'), []);
  assert.equal(logs.mock.callCount(), 1);
});

test('falha ao salvar metadados limpa o arquivo já enviado', async (t) => {
  const { url, repository } = await setup(t);
  const logs = t.mock.method(console, 'error', () => {});
  t.mock.method(repository, 'save', () => { throw new Error('falha ao registrar'); });
  await expectError(await upload(url), 500, 'STORAGE_ERROR');
  assert.deepEqual(await readdir(repository.storageDirectory), []);
  assert.deepEqual(repository.listByOwner('usuario-123'), []);
  assert.equal(logs.mock.callCount(), 1);
});

test('falha de limpeza é registrada sem retornar sucesso no upload', async (t) => {
  const { url, repository } = await setup(t);
  const logs = t.mock.method(console, 'error', () => {});
  t.mock.method(repository, 'save', () => { throw new Error('falha ao registrar'); });
  t.mock.method(repository, 'removeFile', async () => {
    throw Object.assign(new Error('sem permissao'), { code: 'EACCES' });
  });
  await expectError(await upload(url), 500, 'STORAGE_ERROR');
  assert.deepEqual(repository.listByOwner('usuario-123'), []);
  assert.equal(logs.mock.callCount(), 2);
});

test('upload aceita arquivo vazio e arquivo maior que 10 MiB de tipo arbitrário', async (t) => {
  const { url } = await setup(t);
  for (const size of [0, 11 * 1024 * 1024]) {
    const response = await upload(url, 'dono', Buffer.alloc(size), 'arquivo.bin');
    assert.equal(response.status, 201);
    const { document } = await response.json();
    assert.equal(document.size, size);
    const download = await fetch(`${url}/documents/${document.id}/download`, {
      headers: { 'X-Owner-Id': 'dono' },
    });
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), Buffer.alloc(size));
  }
});

test('uma nova instância do repositório não recupera metadados dos arquivos no disco', async (t) => {
  const { url, repository } = await setup(t);
  await (await upload(url)).json();
  const restarted = createDocumentRepository(repository.storageDirectory);
  assert.deepEqual(restarted.listByOwner('usuario-123'), []);
  assert.equal((await readdir(repository.storageDirectory)).length, 1);
});
