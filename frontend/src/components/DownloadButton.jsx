import { useState } from 'react';
import { downloadDocument, saveDocument } from '../services/documentApi.js';

export default function DownloadButton({ owner, document }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  async function handleDownload() {
    setDownloading(true);
    setError('');
    try {
      const blob = await downloadDocument(owner, document.id);
      saveDocument(blob, document.originalName);
    } catch (error) {
      setError(error.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        aria-label={`Baixar ${document.originalName}`}
      >
        {downloading ? 'Baixando…' : 'Baixar'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
