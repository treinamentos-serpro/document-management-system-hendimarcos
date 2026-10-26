const { DocumentError } = require('../services/documentService');

const errorStatuses = {
  OWNER_REQUIRED: 400,
  FILE_REQUIRED: 400,
  INVALID_MULTIPART: 400,
  DOCUMENT_NOT_FOUND: 404,
  STORAGE_ERROR: 500,
};

function createDocumentController(service) {
  return {
    validateOwner(req, res, next) {
      try {
        req.owner = service.normalizeOwner(req.get('X-Owner-Id'));
        next();
      } catch (error) {
        next(error);
      }
    },

    async upload(req, res) {
      const file = req.file && {
        originalName: req.file.originalname,
        size: req.file.size,
        storageName: req.file.filename,
      };
      const document = await service.createDocument(req.owner, file);
      res.status(201).json({ document });
    },

    async list(req, res) {
      const documents = await service.listDocuments(req.owner);
      res.json({ documents });
    },

    async download(req, res, next) {
      const document = await service.getDownload(req.owner, req.params.id);
      res.download(document.filePath, document.originalName, {
        headers: { 'Content-Type': 'application/octet-stream' },
        acceptRanges: false,
        cacheControl: false,
      }, (error) => {
        if (!error) return;
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

  if (status >= 500 || res.headersSent) {
    console.error('Falha ao processar requisição do DMS.', error);
  }
  if (res.headersSent) return next(error);

  res.status(status).json({
    error: {
      code: isDocumentError ? error.code : (invalidJson ? 'INVALID_REQUEST' : 'INTERNAL_ERROR'),
      message: isDocumentError ? error.message : (
        invalidJson ? 'O corpo JSON da requisição é inválido.' : 'Não foi possível concluir a operação.'
      ),
    },
  });
}

module.exports = { createDocumentController, handleError };
