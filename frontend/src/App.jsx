import { useEffect, useState } from 'react';
import UploadComponent from './components/UploadComponent.jsx';
import DocumentList from './components/DocumentList.jsx';
import { listDocuments } from './services/documentApi.js';

function DocumentWorkspace({ owner }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    async function loadDocuments() {
      try {
        const result = await listDocuments(owner, controller.signal);
        if (!controller.signal.aborted) setDocuments(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDocuments();
    return () => controller.abort();
  }, [owner, revision]);

  function refreshDocuments() {
    setRevision((current) => current + 1);
  }

  return (
    <>
      <p>Identificador em uso: <strong>{owner}</strong></p>
      <UploadComponent owner={owner} onUploaded={refreshDocuments} />
      <DocumentList
        owner={owner}
        documents={documents}
        loading={loading}
        error={error}
        onRefresh={refreshDocuments}
      />
    </>
  );
}

export default function App() {
  const [ownerInput, setOwnerInput] = useState('');
  const [owner, setOwner] = useState('');
  const [error, setError] = useState('');

  function handleOwnerSubmit(event) {
    event.preventDefault();
    const normalizedOwner = ownerInput.trim();
    if (!normalizedOwner) {
      setError('Informe o identificador do usuário.');
      return;
    }
    setError('');
    setOwnerInput(normalizedOwner);
    setOwner(normalizedOwner);
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Document Management System</h1>
      <p>
        Informe seu identificador para enviar, listar e baixar documentos.
        Este identificador não é autenticação: esta versão é apenas para demonstração.
      </p>
      <form onSubmit={handleOwnerSubmit}>
        <label htmlFor="owner">Identificador do usuário</label>
        <input
          id="owner"
          name="owner"
          value={ownerInput}
          onChange={(event) => setOwnerInput(event.target.value)}
        />
        <button type="submit">Usar identificador</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {owner && <DocumentWorkspace key={owner} owner={owner} />}
    </main>
  );
}
