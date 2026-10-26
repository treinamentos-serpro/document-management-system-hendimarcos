const { randomUUID } = require('node:crypto');

class DocumentError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.code = code;
  }
}

function publicMetadata({ storageName, ...document }) {
  return document;
}

function createDocumentService(repository) {
  function normalizeOwner(owner) {
    if (typeof owner !== 'string' || !owner.trim()) {
      throw new DocumentError('OWNER_REQUIRED', 'Informe o identificador do usuário.');
    }
    return owner.trim();
  }

  async function discardUpload(storageName) {
    if (!storageName) return;
    try {
      await repository.removeFile(storageName);
    } catch (error) {
      console.error('Falha ao remover arquivo de um upload não concluído.', error);
    }
  }

  return {
    normalizeOwner,
    discardUpload,

    async createDocument(owner, file) {
      owner = normalizeOwner(owner);
      if (!file) {
        throw new DocumentError('FILE_REQUIRED', 'Envie um arquivo para continuar.');
      }

      try {
        const document = await repository.save({
          id: randomUUID(),
          originalName: file.originalName,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          owner,
          storageName: file.storageName,
        });
        return publicMetadata(document);
      } catch (error) {
        await discardUpload(file.storageName);
        throw new DocumentError('STORAGE_ERROR', 'Não foi possível salvar o documento.', error);
      }
    },

    async listDocuments(owner) {
      const documents = await repository.listByOwner(normalizeOwner(owner));
      return documents.map(publicMetadata);
    },

    async getDownload(owner, id) {
      owner = normalizeOwner(owner);
      const document = await repository.findById(id);
      if (!document || document.owner !== owner) {
        throw new DocumentError('DOCUMENT_NOT_FOUND', 'Documento não encontrado.');
      }
      return {
        originalName: document.originalName,
        filePath: repository.getFilePath(document.storageName),
      };
    },
  };
}

module.exports = { createDocumentService, DocumentError };
