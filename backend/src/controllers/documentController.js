const { DocumentError } = require('../services/documentService');
const logger = require('../logger');

const errorStatuses = {
  OWNER_REQUIRED: 400,
  INVALID_PAGINATION: 400,
  FILE_REQUIRED: 400,
  INVALID_MULTIPART: 400,
  UPLOAD_TOO_LARGE: 413,
  DOCUMENT_NOT_FOUND: 404,
  STORAGE_ERROR: 500,
};

function createDocumentController(service) {
  return {
    validateOwner(req, res, next) {
      logger.info('controller.validateOwner.request', {
        method: req.method,
        path: req.path,
        ownerProvided: Boolean(req.get('X-Owner-Id')),
      });
      try {
        req.owner = service.normalizeOwner(req.get('X-Owner-Id'));
        logger.info('controller.validateOwner.accepted');
        next();
      } catch (error) {
        next(error);
      }
    },

    async upload(req, res) {
      logger.info('controller.upload.request', {
        method: req.method,
        path: req.path,
        filePresent: Boolean(req.file),
        fileSize: req.file?.size,
      });
      const file = req.file && {
        originalName: req.file.originalname,
        size: req.file.size,
        storageName: req.file.filename,
      };
      const document = await service.createDocument(req.owner, file);
      logger.info('controller.upload.response', { status: 201, documentId: document.id });
      res.status(201).json({ document });
    },

    async list(req, res) {
      logger.info('controller.list.request', {
        method: req.method,
        path: req.path,
      });
      let pagination;
      if (req.query.limit !== undefined || req.query.offset !== undefined) {
        const limitValue = req.query.limit ?? '50';
        const offsetValue = req.query.offset ?? '0';
        if (!/^\d+$/.test(limitValue) || !/^\d+$/.test(offsetValue)) {
          throw new DocumentError('INVALID_PAGINATION', 'Use valores inteiros para limit e offset.');
        }
        const limit = Number(limitValue);
        const offset = Number(offsetValue);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset)) {
          throw new DocumentError('INVALID_PAGINATION', 'limit deve estar entre 1 e 100 e offset deve ser válido.');
        }
        pagination = { limit, offset };
      }
      const documents = await service.listDocuments(req.owner, pagination);
      logger.info('controller.list.response', { status: 200, documentCount: documents.length });
      res.json({ documents });
    },

    async download(req, res, next) {
      logger.info('controller.download.request', {
        method: req.method,
        path: req.path,
        documentId: req.params.id,
      });
      const document = await service.getDownload(req.owner, req.params.id);
      res.download(document.filePath, document.originalName, {
        headers: { 'Content-Type': 'application/octet-stream' },
        acceptRanges: false,
        cacheControl: false,
      }, (error) => {
        if (!error) {
          logger.info('controller.download.response', {
            status: res.statusCode,
            documentId: req.params.id,
          });
          return;
        }
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.status === 404) {
          next(new DocumentError('DOCUMENT_NOT_FOUND', 'Documento não encontrado.', error));
        } else {
          next(new DocumentError('STORAGE_ERROR', 'Não foi possível baixar o documento.', error));
        }
      });
    },
  };
}

function handleError(error, req, res, next) {
  const isDocumentError = error instanceof DocumentError;
  const invalidJson = error.type === 'entity.parse.failed';
  const status = isDocumentError ? (errorStatuses[error.code] || 500) : (invalidJson ? 400 : 500);

  const errorCode = isDocumentError ? error.code : (invalidJson ? 'INVALID_REQUEST' : 'INTERNAL_ERROR');
  logger.info('controller.error.request', {
    method: req.method,
    path: req.path,
    errorCode,
    status,
  });
  if (status >= 500 || res.headersSent) {
    logger.error('controller.request.failed', {
      method: req.method,
      path: req.path,
      errorCode,
      errorName: error.name,
    });
  }
  if (res.headersSent) return next(error);

  const response = {
    error: {
      code: isDocumentError ? error.code : (invalidJson ? 'INVALID_REQUEST' : 'INTERNAL_ERROR'),
      message: isDocumentError ? error.message : (
        invalidJson ? 'O corpo JSON da requisição é inválido.' : 'Não foi possível concluir a operação.'
      ),
    },
  };
  logger.info('controller.error.response', { status, errorCode });
  res.status(status).json(response);
}

module.exports = { createDocumentController, handleError };
