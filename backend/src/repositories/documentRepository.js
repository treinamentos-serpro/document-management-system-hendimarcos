const { mkdir, unlink } = require('node:fs/promises');
const path = require('node:path');

const storageDirectory = path.resolve(__dirname, '../../storage');

function createDocumentRepository(directory = storageDirectory) {
  const documents = new Map();

  return {
    storageDirectory: directory,

    async prepareStorage() {
      await mkdir(directory, { recursive: true });
      return directory;
    },

    save(document) {
      documents.set(document.id, { ...document });
      return { ...document };
    },

    listByOwner(owner) {
      return Array.from(documents.values())
        .filter((document) => document.owner === owner)
        .sort((first, second) => second.uploadedAt.localeCompare(first.uploadedAt))
        .map((document) => ({ ...document }));
    },

    findById(id) {
      const document = documents.get(id);
      return document ? { ...document } : undefined;
    },

    getFilePath(storageName) {
      return path.join(directory, storageName);
    },

    async removeFile(storageName) {
      try {
        await unlink(path.join(directory, storageName));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    },
  };
}

module.exports = { createDocumentRepository };
