async function request(path, owner, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'X-Owner-Id': owner, ...options.headers },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar ao servidor. Tente novamente.', { cause: error });
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      throw new Error(body.error?.message || `A operação falhou (HTTP ${response.status}).`);
    }
    throw new Error(`A operação falhou (HTTP ${response.status}). Tente novamente.`);
  }

  return response;
}

export async function listDocuments(owner, signal) {
  const response = await request('/documents', owner, { signal });
  const body = await response.json();
  return body.documents;
}

export async function uploadDocument(owner, file) {
  const body = new FormData();
  body.append('file', file);
  const response = await request('/upload', owner, { method: 'POST', body });
  const result = await response.json();
  return result.document;
}

export async function downloadDocument(owner, id) {
  const response = await request(`/documents/${encodeURIComponent(id)}/download`, owner);
  return response.blob();
}

export function saveDocument(blob, originalName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = originalName;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // O navegador precisa iniciar o download antes da liberação da URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
