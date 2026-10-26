# Especificação — Document Management System

## 1. Objetivo

Entregar uma aplicação web que permita identificar um usuário, enviar documentos, consultar os documentos associados a esse identificador e baixar esses arquivos, mantendo os arquivos no filesystem local e os metadados em memória.

## 2. Escopo

### Dentro do escopo

- Envio de um arquivo por requisição.
- Listagem dos documentos associados ao identificador de usuário informado.
- Download de um documento somente quando ele pertence ao identificador informado.
- Interface React para informar o identificador, enviar arquivos, consultar a lista e iniciar downloads.
- Armazenamento dos arquivos no diretório local `backend/storage`, usando Multer com `diskStorage`.
- Armazenamento dos metadados em memória durante a execução do backend.
- Tratamento explícito de entradas inválidas, arquivos inexistentes e falhas de armazenamento.

### Fora do escopo

- Autenticação, autorização baseada em credenciais, cadastro ou administração de contas.
- Garantia de que o identificador de usuário enviado pelo cliente corresponde a uma pessoa autenticada.
- Armazenamento externo, em nuvem ou em banco de dados.
- Versionamento, edição, exclusão, compartilhamento ou busca de documentos.
- Persistência dos metadados após reinicialização do backend.
- Validação de tipo MIME ou conteúdo de arquivo.

> **Limite importante:** o identificador `owner` é fornecido pelo cliente e serve para separar os documentos no contexto desta versão inicial. Ele não é uma credencial e não protege os documentos contra um cliente que informe o identificador de outra pessoa. A aplicação não deve ser apresentada como um sistema com isolamento seguro entre usuários enquanto não houver autenticação e autorização.

## 3. Requisitos funcionais

| ID | Requisito |
| --- | --- |
| RF-01 | A interface deve permitir informar um identificador de usuário não vazio, após remover espaços das extremidades, para usar nas operações de documentos. Esse identificador é enviado no cabeçalho `X-Owner-Id`; não há fluxo de autenticação ou cadastro de usuários. |
| RF-02 | O usuário pode enviar um único arquivo por requisição, associado ao `owner` informado. O backend gera um identificador único para o documento e registra seu nome original, tamanho em bytes, data/hora do envio e dono. |
| RF-03 | O arquivo enviado deve ser gravado no filesystem local em `backend/storage` por meio de `multer` configurado com `diskStorage`. O nome original não deve ser usado como nome físico do arquivo. |
| RF-04 | O usuário pode listar os metadados dos documentos associados ao `owner` informado. A resposta não deve incluir documentos de outros identificadores. Uma lista sem resultados deve ser retornada como sucesso com uma coleção vazia. |
| RF-05 | O usuário pode baixar um documento pelo identificador quando o documento existe e seu `owner` corresponde ao cabeçalho enviado. A resposta deve conter os bytes do arquivo como anexo e usar o nome original como nome sugerido para download. |
| RF-06 | Um documento inexistente e um documento associado a outro `owner` devem produzir a mesma resposta `404`, sem revelar se o identificador existe. |
| RF-07 | A interface deve apresentar confirmação após envio, permitir atualizar/consultar a lista e iniciar o download de cada documento listado. Deve apresentar uma mensagem compreensível quando uma operação falhar. |
| RF-08 | Se o armazenamento do arquivo falhar, o backend não deve registrar metadados como se o envio tivesse sido concluído. Arquivos parciais criados pela tentativa devem ser removidos quando possível; falhas de limpeza devem ser registradas pelo backend. |
| RF-09 | A listagem deve aceitar paginação opcional por `limit` e `offset`; sem esses parâmetros, deve preservar a resposta completa atual. |

### Fluxo principal

1. A pessoa informa seu identificador na interface.
2. A interface envia o arquivo em `multipart/form-data` para a API com `X-Owner-Id`.
3. O backend grava o arquivo localmente, registra os metadados em memória e retorna o documento criado.
4. A interface atualiza ou consulta a lista daquele identificador.
5. Ao solicitar um download, a interface envia novamente `X-Owner-Id` e o identificador do documento.
6. O backend valida a associação com o dono antes de transmitir o arquivo.

## 4. Requisitos não funcionais

| ID | Requisito |
| --- | --- |
| RNF-01 | Os arquivos devem permanecer no filesystem local da aplicação, no diretório `backend/storage`, e ser recebidos com Multer usando `diskStorage`. Não utilizar serviços de upload ou armazenamento externos. |
| RNF-02 | Os metadados devem ser mantidos em memória no processo do backend. Eles são perdidos quando o processo reinicia; arquivos que permanecerem em `backend/storage` após a reinicialização não terão metadados recuperáveis nesta versão. |
| RNF-03 | A configuração operacional, como a porta do backend, deve usar variáveis de ambiente (`PORT`), respeitando o princípio 12-Factor. O caminho de armazenamento desta versão permanece `backend/storage`. |
| RNF-04 | O backend deve usar Node.js e Express em CommonJS; o frontend deve usar React e Vite em ESM. O backend deve manter as camadas `routes/`, `controllers/`, `services/` e `repositories/`. |
| RNF-05 | A comunicação do frontend deve usar `fetch` com o prefixo `/api`. No desenvolvimento, o proxy do Vite encaminha esse prefixo para os endpoints do backend, que são definidos sem `/api` (por exemplo, `/api/documents` no frontend para `/documents` no backend). |
| RNF-06 | O upload tem limite padrão de 25 MiB configurável por `MAX_UPLOAD_SIZE_BYTES`; não há validação de tipo MIME. O filesystem e a infraestrutura continuam sujeitos aos limites operacionais do ambiente. |
| RNF-07 | O backend deve responder a falhas com status HTTP e formato de erro consistentes, sem retornar sucesso quando uma operação de arquivo ou metadados falhar. |
| RNF-08 | A aplicação é destinada ao desenvolvimento/demonstração enquanto não existir autenticação. Não expor os endpoints como mecanismo de proteção de documentos entre usuários. |
| RNF-09 | O nível dos logs deve ser configurável por `LOG_LEVEL`, com padrão `info`, sem registrar conteúdo de arquivos, nomes originais ou identificadores de dono. |

## 5. Modelo de dados

Não existe entidade persistida de usuário nesta fase. `owner` é um identificador opaco, recebido do cliente, e não uma chave estrangeira ou prova de identidade.

### Metadados públicos do documento

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | string | Sim | Identificador único, gerado pelo backend (UUID). |
| `originalName` | string | Sim | Nome original fornecido no upload; usado para exibição e como nome sugerido no download, nunca como caminho físico. |
| `size` | number | Sim | Tamanho do arquivo em bytes, como inteiro não negativo. |
| `uploadedAt` | string | Sim | Data/hora do upload em ISO 8601, em UTC. |
| `owner` | string | Sim | Identificador normalizado (sem espaços nas extremidades) recebido em `X-Owner-Id`. |

### Metadado interno de armazenamento

O repositório mantém, além dos campos públicos, uma referência interna ao nome físico gerado para o arquivo (por exemplo, `storageName`). Essa referência aponta para um arquivo dentro de `backend/storage`; não deve ser incluída nas respostas da API. O arquivo físico deve receber um nome único gerado pela aplicação, independente de `originalName`.

Os registros de metadados são mantidos em memória pelo backend e indexados por `id`. A associação do documento ao usuário é feita comparando `owner` com o valor recebido em cada requisição. Não há necessidade de persistir uma coleção de usuários.

## 6. Contratos de API

### Convenções

- Todos os endpoints de documentos exigem o cabeçalho `X-Owner-Id` com valor não vazio após remover espaços das extremidades. O backend deve usar o valor normalizado tanto ao registrar quanto ao consultar documentos.
- O cabeçalho identifica o escopo de consulta, mas **não autentica** o solicitante.
- As rotas do backend são `/upload`, `/documents` e `/documents/:id/download`. No frontend, usar o prefixo `/api` encaminhado pelo proxy do Vite.
- Erros JSON usam o formato:

```json
{
  "error": {
    "code": "FILE_REQUIRED",
    "message": "Envie um arquivo para continuar."
  }
}
```

- As mensagens acima são exemplos em português. Códigos de erro são identificadores estáveis para tratamento pela interface.

### `POST /upload`

Envia um arquivo e cria os metadados do documento.

**Cabeçalhos**

| Nome | Obrigatório | Descrição |
| --- | --- | --- |
| `X-Owner-Id` | Sim | Identificador não vazio do dono do documento. |
| `Content-Type` | Sim | `multipart/form-data`, incluindo o boundary gerado pelo cliente. |

**Corpo**

- Um campo de arquivo chamado `file`.
- Um arquivo por requisição.
- Não enviar o dono como campo multipart; a fonte do valor é o cabeçalho `X-Owner-Id`.
- O limite padrão é 25 MiB, configurável por `MAX_UPLOAD_SIZE_BYTES`; arquivos acima dele retornam `413 UPLOAD_TOO_LARGE`.
- Não há validação de tipo MIME ou conteúdo do arquivo.

**Sucesso — `201 Created`**

```json
{
  "document": {
    "id": "8f3f1b46-e02f-4c83-b45b-2ef7927e0ff4",
    "originalName": "relatorio.pdf",
    "size": 24576,
    "uploadedAt": "2026-10-26T19:15:19.022Z",
    "owner": "usuario-123"
  }
}
```

**Erros**

| Status | Código | Condição |
| --- | --- | --- |
| `400` | `OWNER_REQUIRED` | Cabeçalho ausente ou vazio. |
| `400` | `FILE_REQUIRED` | Campo `file` ausente ou sem arquivo. |
| `400` | `INVALID_MULTIPART` | Corpo multipart malformado ou incompatível com o contrato de arquivo único. |
| `413` | `UPLOAD_TOO_LARGE` | O arquivo ultrapassa `MAX_UPLOAD_SIZE_BYTES`. |
| `500` | `STORAGE_ERROR` | Falha inesperada ao gravar o arquivo ou registrar os metadados. Não retornar um documento criado. |

### `GET /documents`

Lista os documentos associados ao dono informado. A lista deve ser ordenada do mais recente para o mais antigo por `uploadedAt`.
Opcionalmente, `limit` (1 a 100) e `offset` permitem buscar uma página; sem parâmetros, a resposta continua contendo a coleção completa.

**Cabeçalhos**

| Nome | Obrigatório | Descrição |
| --- | --- | --- |
| `X-Owner-Id` | Sim | Identificador não vazio cujo conjunto de documentos será consultado. |

**Resposta de sucesso — `200 OK`**

```json
{
  "documents": [
    {
      "id": "8f3f1b46-e02f-4c83-b45b-2ef7927e0ff4",
      "originalName": "relatorio.pdf",
      "size": 24576,
      "uploadedAt": "2026-10-26T19:15:19.022Z",
      "owner": "usuario-123"
    }
  ]
}
```

Sem documentos, retornar `200 OK` com `"documents": []`.

**Erros**

| Status | Código | Condição |
| --- | --- | --- |
| `400` | `OWNER_REQUIRED` | Cabeçalho ausente ou vazio. |
| `400` | `INVALID_PAGINATION` | `limit` ou `offset` não é um inteiro válido. |
| `500` | `INTERNAL_ERROR` | Falha inesperada ao consultar os metadados. |

### `GET /documents/:id/download`

Transmite os bytes do documento como anexo, somente se ele existir e pertencer ao dono informado.

**Cabeçalhos**

| Nome | Obrigatório | Descrição |
| --- | --- | --- |
| `X-Owner-Id` | Sim | Identificador não vazio que deve corresponder ao `owner` do documento. |

**Sucesso — `200 OK`**

- Corpo: conteúdo binário original.
- `Content-Type: application/octet-stream`.
- `Content-Disposition: attachment` com `originalName` como nome sugerido, codificado de forma segura para cabeçalho HTTP.
- `Content-Length` pode ser enviado quando conhecido.

**Erros**

| Status | Código | Condição |
| --- | --- | --- |
| `400` | `OWNER_REQUIRED` | Cabeçalho ausente ou vazio. |
| `404` | `DOCUMENT_NOT_FOUND` | Documento não existe, não pertence ao dono informado ou o arquivo físico não está disponível. A mesma resposta deve ser usada para não revelar a existência de documentos de outro dono. |
| `500` | `STORAGE_ERROR` | Falha inesperada ao ler/transmitir o arquivo. |

### Chamadas do frontend

O frontend deve usar `fetch` para:

- `POST /api/upload`, com `X-Owner-Id` e `FormData` contendo `file`. Não definir manualmente o `Content-Type` do multipart; o navegador deve incluir o boundary.
- `GET /api/documents`, com `X-Owner-Id`.
- `GET /api/documents/:id/download`, com `X-Owner-Id`; tratar a resposta como `Blob` e iniciar o download.

O frontend deve verificar `response.ok`, interpretar o formato JSON de erro nas respostas JSON e não apresentar uma falha como sucesso.

## 7. Decisões arquiteturais

### Backend — Clean Architecture simples

Fluxo de dependência: `routes -> controllers -> services -> repositories`.

- **`routes/`**: declara os endpoints e liga o middleware de upload Multer às rotas apropriadas. A configuração usa `diskStorage` com destino local `backend/storage` e nome físico gerado; não contém regras de propriedade do documento.
- **`controllers/`**: lê cabeçalhos, parâmetros e `req.file`, valida a forma básica da entrada e traduz os resultados dos serviços para status, cabeçalhos e corpos HTTP.
- **`services/`**: aplica as regras de negócio, incluindo exigir `owner`, criar metadados e confirmar a correspondência entre dono e documento antes da leitura.
- **`repositories/`**: mantém os metadados em memória e encapsula a localização/leitura dos arquivos locais para os serviços. Caminhos físicos não são expostos pela API.
- Falhas de upload devem evitar registros de sucesso sem arquivo gravado e devem limpar arquivos parciais quando possível. Erros de limpeza devem ser observáveis pelo mecanismo de log do backend.
- A camada de domínio/serviços não deve depender de detalhes HTTP ou do React.

### Frontend

- Componentes funcionais com React Hooks, organizados em `components/`, `pages/` e `services/`.
- Um serviço centraliza as chamadas `fetch` para a API.
- A interface coleta o identificador usado em `X-Owner-Id`; essa entrada é apenas identificação de escopo, não login.
- A tela deve distinguir estados de carregamento, lista vazia, sucesso e erro, sem duplicar lógica de comunicação nos componentes. Listagens longas devem ser buscadas em páginas.

### Armazenamento e configuração

- O diretório padrão e obrigatório do projeto para arquivos é `backend/storage`, no filesystem local da aplicação.
- Multer com `diskStorage` grava os arquivos; o nome original permanece somente nos metadados.
- O repositório mantém os registros ordenados por dono para evitar filtrar e ordenar todo o mapa em cada listagem paginada.
- `backend/storage` usa permissões restritas em sistemas POSIX; os nomes físicos são validados para permanecer dentro do diretório.
- Metadados em memória são a fonte para listagem e resolução de `id` para arquivo durante a vida do processo.
- Nesta fase, não reconstruir metadados a partir dos arquivos no disco após reinicialização. Arquivos remanescentes sem metadados são inacessíveis pela API e não são limpos automaticamente.
- A porta do servidor é configurada por `PORT`, com valor padrão definido pelo backend. O frontend usa o proxy `/api` do Vite em desenvolvimento.
- O tamanho máximo do upload e o nível de log podem ser configurados por `MAX_UPLOAD_SIZE_BYTES` e `LOG_LEVEL`.

## 8. Plano de execução

As etapas abaixo são um roteiro futuro para orientar a implementação. **Esta especificação não implementa nem altera arquivos de backend ou frontend.**

1. Preparar a configuração do servidor e o tratamento comum de erros, preservando a rota de saúde existente.
2. Configurar o recebimento multipart com Multer e `diskStorage` no diretório local `backend/storage`, usando nomes físicos únicos e sem restrições próprias de tamanho ou tipo.
3. Definir o registro de metadados em memória e as operações do repositório para armazenar, listar, localizar e ler documentos.
4. Implementar serviços com criação de metadados, isolamento por `owner`, validação das entradas e tratamento de falhas de arquivo.
5. Expor `POST /upload`, `GET /documents` e `GET /documents/:id/download` por rotas e controllers, com os contratos e status definidos nesta especificação.
6. Adicionar testes do backend para upload, listagem por dono, download, entradas inválidas, documento de outro dono e falhas de armazenamento.
7. Implementar no frontend o serviço `fetch`, a coleta do identificador, o envio do arquivo, a lista e a ação de download, com estados de sucesso e erro.
8. Validar o fluxo integrado via proxy `/api`, incluindo lista vazia, isolamento por `owner`, download e comportamento após reinicialização do backend.
