# Frontend do DMS

Interface React com componentes funcionais e hooks para envio, listagem e
download de documentos. O cliente em `src/services/documentApi.js` centraliza
as chamadas `fetch` usando `/api` e o cabeçalho `X-Owner-Id`.

## Execução

No diretório `frontend`, use `npm ci` e `npm run dev`.
O backend deve estar disponível em `http://localhost:3000`.
O proxy do Vite encaminha `/api` para esse endereço, removendo o prefixo.
Para gerar a versão de produção, use `npm run build`.
Em produção, o servidor deve configurar um encaminhamento equivalente para
`/api`; o proxy de desenvolvimento não faz parte do build estático.

## Uso

1. Informe um identificador e clique em **Usar identificador**.
2. Selecione um arquivo e clique em **Enviar documento**.
3. A lista é atualizada após o envio; **Atualizar lista** permite tentar novamente
   após uma falha ou consultar mudanças.
4. Use **Baixar** para salvar o documento com seu nome original.

Ao trocar o identificador, a interface limpa a lista anterior e cancela a
consulta pendente. O identificador não autentica o usuário e não protege os
documentos contra quem informar outro identificador.
Não há restrições de tamanho ou tipo impostas pela interface.

Os testes do cliente de API usam o runner nativo do Node:

```sh
node --test test/documentApi.test.js
```
