import DownloadButton from './DownloadButton.jsx';

export default function DocumentList({
  owner,
  documents,
  loading,
  loadingMore,
  hasMore,
  error,
  loadMoreError,
  onRefresh,
  onLoadMore,
}) {
  return (
    <section aria-labelledby="documents-title">
      <h2 id="documents-title">Seus documentos</h2>
      <button type="button" onClick={onRefresh} disabled={loading || loadingMore}>
        Atualizar lista
      </button>
      {loading && <p role="status">Carregando documentos…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && documents.length === 0 && <p>Nenhum documento enviado.</p>}
      {!loading && !error && documents.length > 0 && (
        <ul aria-busy={loading}>
          {documents.map((document) => (
            <li key={document.id}>
              <strong>{document.originalName}</strong>
              <p>
                {document.size.toLocaleString('pt-BR')} bytes ·{' '}
                {new Date(document.uploadedAt).toLocaleString('pt-BR')}
              </p>
              <DownloadButton owner={owner} document={document} />
            </li>
          ))}
        </ul>
      )}
      {loadMoreError && <p role="alert">{loadMoreError}</p>}
      {!loading && !error && hasMore && (
        <button type="button" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </section>
  );
}
