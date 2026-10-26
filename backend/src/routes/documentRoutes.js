const { randomUUID } = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { createDocumentRepository } = require('../repositories/documentRepository');
const { createDocumentService, DocumentError } = require('../services/documentService');
const { createDocumentController } = require('../controllers/documentController');

function createDocumentRouter(repository = createDocumentRepository()) {
  const router = express.Router();
  const service = createDocumentService(repository);
  const controller = createDocumentController(service);
  const storage = multer.diskStorage({
    destination(req, file, callback) {
      repository.prepareStorage().then(
        (directory) => callback(null, directory),
        (error) => callback(error),
      );
    },
    filename(req, file, callback) {
      req.uploadStorageName = randomUUID();
      callback(null, req.uploadStorageName);
    },
  });
  const upload = multer({ storage, defParamCharset: 'utf8' }).single('file');

  router.post('/upload', controller.validateOwner, (req, res, next) => {
    upload(req, res, (error) => {
      if (!error) return next();

      if (error.storageErrors?.length) {
        console.error('Falha na limpeza de arquivos do upload.', error.storageErrors);
      }
      const invalidMultipart = error instanceof multer.MulterError || !error.code;
      const uploadError = new DocumentError(
        invalidMultipart ? 'INVALID_MULTIPART' : 'STORAGE_ERROR',
        invalidMultipart
          ? 'Envie um único arquivo no campo file em um formulário multipart válido.'
          : 'Não foi possível gravar o arquivo.',
        error,
      );
      service.discardUpload(req.uploadStorageName).then(
        () => next(uploadError),
        next,
      );
    });
  }, controller.upload);
  router.get('/documents', controller.validateOwner, controller.list);
  router.get('/documents/:id/download', controller.validateOwner, controller.download);

  return router;
}

module.exports = { createDocumentRouter };
