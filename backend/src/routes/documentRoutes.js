const { randomUUID } = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { createDocumentRepository } = require('../repositories/documentRepository');
const { createDocumentService, DocumentError } = require('../services/documentService');
const { createDocumentController } = require('../controllers/documentController');
const logger = require('../logger');

const defaultMaxUploadSize = 25 * 1024 * 1024;

function createDocumentRouter(repository = createDocumentRepository()) {
  const router = express.Router();
  const service = createDocumentService(repository);
  const controller = createDocumentController(service);
  const configuredMaxUploadSize = Number(process.env.MAX_UPLOAD_SIZE_BYTES);
  const maxUploadSize = Number.isSafeInteger(configuredMaxUploadSize) && configuredMaxUploadSize > 0
    ? configuredMaxUploadSize
    : defaultMaxUploadSize;
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
  const upload = multer({
    storage,
    defParamCharset: 'utf8',
    limits: { fileSize: maxUploadSize, files: 1 },
  }).single('file');

  router.post('/upload', controller.validateOwner, (req, res, next) => {
    upload(req, res, (error) => {
      if (!error) {
        if (!req.file) return next();
        repository.restrictFilePermissions(req.uploadStorageName).then(
          () => next(),
          (permissionError) => service.discardUpload(req.uploadStorageName).then(
            () => next(new DocumentError(
              'STORAGE_ERROR',
              'Não foi possível proteger o arquivo enviado.',
              permissionError,
            )),
            next,
          ),
        );
        return;
      }

      if (error.storageErrors?.length) {
        logger.error('upload.cleanup.failed', {
          errorCode: error.code,
          storageErrorCount: error.storageErrors.length,
        });
      }
      const uploadTooLarge = error.code === 'LIMIT_FILE_SIZE';
      const invalidMultipart = error instanceof multer.MulterError || !error.code;
      const uploadError = new DocumentError(
        uploadTooLarge ? 'UPLOAD_TOO_LARGE' : (invalidMultipart ? 'INVALID_MULTIPART' : 'STORAGE_ERROR'),
        uploadTooLarge
          ? 'O arquivo excede o tamanho máximo permitido.'
          : invalidMultipart
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
