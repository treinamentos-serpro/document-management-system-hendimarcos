import { useEffect, useState } from 'react';
import UploadComponent from './components/UploadComponent.jsx';
import DocumentList from './components/DocumentList.jsx';
import { listDocuments } from './services/documentApi.js';

const pageSize = 50;

function DocumentWorkspace({ owner }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [loadMoreError, setLoadMoreError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setLoadMoreError('');

    async function loadDocuments() {
      try {
        const result = await listDocuments(owner, controller.signal, { limit: pageSize, offset: 0 });
        if (!controller.signal.aborted) {
          setDocuments(result);
          setHasMore(result.length === pageSize);
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    async function loadMoreDocuments() {
      setLoadingMore(true);
      setLoadMoreError('');
      try {
        const result = await listDocuments(owner, undefined, { limit: pageSize, offset: documents.length });
        setDocuments((current) => [...current, ...result]);
        setHasMore(result.length === pageSize);
      } catch (error) {
        setLoadMoreError(error.message);
      } finally {
        setLoadingMore(false);
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
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={error}
        loadMoreError={loadMoreError}
        onRefresh={refreshDocuments}
        onLoadMore={loadMoreDocuments}
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
