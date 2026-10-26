import { useRef, useState } from 'react';
import { uploadDocument } from '../services/documentApi.js';

export default function UploadComponent({ owner, onUploaded }) {
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    const file = fileInput.current.files[0];
    if (!file) {
      setError('Selecione um arquivo para enviar.');
      return;
    }

    setUploading(true);
    try {
      await uploadDocument(owner, file);
      fileInput.current.value = '';
      setMessage('Documento enviado com sucesso.');
      onUploaded();
    } catch (error) {
      setError(error.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section aria-labelledby="upload-title">
      <h2 id="upload-title">Enviar documento</h2>
      <form onSubmit={handleSubmit} aria-busy={uploading}>
        <label htmlFor="document-file">Arquivo</label>
        <input id="document-file" name="file" type="file" ref={fileInput} disabled={uploading} />
        <button type="submit" disabled={uploading}>
          {uploading ? 'Enviando…' : 'Enviar documento'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
