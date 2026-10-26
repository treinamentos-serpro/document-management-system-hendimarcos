const { chmod, mkdir, unlink } = require('node:fs/promises');
const path = require('node:path');

const storageDirectory = path.resolve(__dirname, '../../storage');

function createDocumentRepository(directory = storageDirectory) {
  directory = path.resolve(directory);
  const documents = new Map();
  const documentsByOwner = new Map();

  function getStoragePath(storageName) {
    if (typeof storageName !== 'string' || !storageName) {
      throw new TypeError('Nome de armazenamento inválido.');
    }
    const filePath = path.resolve(directory, storageName);
    const relativePath = path.relative(directory, filePath);
    if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
      throw new TypeError('Caminho fora do diretório de armazenamento.');
    }
    return filePath;
  }

  return {
    storageDirectory: directory,

    async prepareStorage() {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      return directory;
    },

    save(document) {
      const previousDocument = documents.get(document.id);
      if (previousDocument) {
        const previousOwnerDocuments = documentsByOwner.get(previousDocument.owner) || [];
        const remainingDocuments = previousOwnerDocuments.filter((item) => item.id !== document.id);
        if (remainingDocuments.length) documentsByOwner.set(previousDocument.owner, remainingDocuments);
        else documentsByOwner.delete(previousDocument.owner);
      }

      const storedDocument = { ...document };
      documents.set(document.id, storedDocument);
      const ownerDocuments = documentsByOwner.get(document.owner) || [];
      const insertionIndex = ownerDocuments.findIndex(
        (item) => item.uploadedAt.localeCompare(storedDocument.uploadedAt) < 0,
      );
      if (insertionIndex === -1) ownerDocuments.push(storedDocument);
      else ownerDocuments.splice(insertionIndex, 0, storedDocument);
      documentsByOwner.set(document.owner, ownerDocuments);
      return { ...storedDocument };
    },

    listByOwner(owner, pagination) {
      const ownedDocuments = documentsByOwner.get(owner) || [];
      const selectedDocuments = pagination
        ? ownedDocuments.slice(pagination.offset, pagination.offset + pagination.limit)
        : ownedDocuments;
      return selectedDocuments.map((document) => ({ ...document }));
    },

    findById(id) {
      const document = documents.get(id);
      return document ? { ...document } : undefined;
    },

    getFilePath(storageName) {
      return getStoragePath(storageName);
    },

    async restrictFilePermissions(storageName) {
      await chmod(getStoragePath(storageName), 0o600);
    },

    async removeFile(storageName) {
      try {
        await unlink(getStoragePath(storageName));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
  };
}

module.exports = { createDocumentRepository };
