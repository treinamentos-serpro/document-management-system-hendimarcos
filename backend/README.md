# Backend do DMS

Backend Node.js/Express em CommonJS, com o fluxo
`routes -> controllers -> services -> repositories`.

## Comandos

No diretório `backend`, execute:

```sh
npm ci
npm start
```

A porta padrão é `3000`; use a variável de ambiente `PORT` para alterá-la.
Para desenvolvimento com reinício automático, use `npm run dev`.
Os testes usam o runner nativo do Node e podem ser executados com `npm test`.

## API

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/health` | Verificação de saúde, sem identificação de usuário. |
| POST | `/upload` | Recebe um único arquivo no campo multipart `file`. |
| GET | `/documents` | Lista os documentos do dono; aceita `limit` e `offset` opcionais. |
| GET | `/documents/:id/download` | Retorna os bytes como anexo com o nome original. |

Todas as rotas de documentos exigem `X-Owner-Id`. Espaços nas extremidades
são removidos. O cabeçalho identifica o dono, **mas não é autenticação**:
qualquer cliente pode informar o identificador de outra pessoa. Esta versão
é destinada a desenvolvimento/demonstração, não à proteção de documentos.

```sh
curl -H 'X-Owner-Id: usuario-123' \
  -F 'file=@/caminho/relatorio.pdf' http://localhost:3000/upload

curl -H 'X-Owner-Id: usuario-123' http://localhost:3000/documents

curl -H 'X-Owner-Id: usuario-123' \
  'http://localhost:3000/documents?limit=50&offset=0'

curl -H 'X-Owner-Id: usuario-123' \
  http://localhost:3000/documents/ID_DO_DOCUMENTO/download -o relatorio.pdf
```

Uploads retornam `201` com `{ "document": { ... } }`; listagens retornam
`200` com `{ "documents": [ ... ] }`. A listagem aceita `limit` (1 a 100) e
`offset` opcionais; sem eles, mantém o comportamento de retornar todos os
documentos. Erros usam
`{ "error": { "code": "...", "message": "..." } }`.
Um documento inexistente, de outro dono ou sem arquivo físico retorna `404`.
Consulte os contratos completos na [especificação](../docs/specs/dms-spec.md).

## Armazenamento

Os arquivos são gravados exclusivamente em `backend/storage` com Multer
`diskStorage`, usando nomes físicos UUID, independentemente do diretório de
execução. O diretório recebe permissões `0700` e cada arquivo `0600` em sistemas
POSIX. O diretório é criado no primeiro upload, se necessário. O limite padrão
de upload é 25 MiB e pode ser alterado por `MAX_UPLOAD_SIZE_BYTES`; não há
validação de tipo MIME.

Os metadados ficam em memória e são perdidos quando o backend reinicia.
Os arquivos permanecem no disco, mas não são redescobertos nem removidos
automaticamente. Caminhos físicos e nomes internos não são expostos pela API.
O nível de log pode ser configurado por `LOG_LEVEL` (`error`, `warn`, `info` ou
`debug`); o padrão é `info`. Os logs omitem identificadores de dono, nomes de
arquivos e conteúdo dos documentos.
