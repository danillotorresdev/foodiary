# Main (Camada de Infraestrutura)

A camada Main é responsável pela infraestrutura e integração da aplicação com serviços externos, especialmente AWS Lambda e API Gateway. É o ponto de entrada da aplicação e faz a ponte entre o mundo externo e a lógica de negócio.

## 📁 Estrutura

```
main/
├── adapters/              # Adaptadores para serviços externos
│   └── lambdaHttpAdapter.ts
├── functions/             # Handlers das funções Lambda
│   └── hello.ts
└── utils/                # Utilitários de infraestrutura
    ├── lambdaBodyParser.ts
    └── lambdaErrorResponse.ts
```

## 🎯 Responsabilidades

### Adapters

Os adapters fazem a conversão entre o formato de entrada/saída dos serviços externos e o formato esperado pela aplicação.

#### lambdaHttpAdapter

Adapta Controllers para funcionarem como handlers AWS Lambda.

**Responsabilidades:**
- Converte eventos do API Gateway (v2) para o formato do Controller
- Extrai body, params e queryParams do evento Lambda
- Executa o controller com os dados parseados
- Trata erros e converte para respostas HTTP apropriadas
- Formata a resposta do controller para o formato do API Gateway

**Tratamento de Erros:**
- **ZodError**: Retorna 400 com detalhes de validação
- **HttpError**: Retorna o status code e mensagem do erro
- **Erros desconhecidos**: Retorna 500 Internal Server Error

**Exemplo:**
```typescript
const handler = lambdaHttpAdapter(myController);
export { handler };
```

**Fluxo:**
```
API Gateway Event
      ↓
lambdaHttpAdapter
      ↓
Parse body, params, queryParams
      ↓
Controller.execute()
      ↓
Format response
      ↓
API Gateway Response
```

### Functions

Arquivos que definem os handlers das funções Lambda. Cada arquivo representa uma função serverless.

**Estrutura típica:**
```typescript
import 'reflect-metadata'; // Necessário para DI

import { HelloController } from '@application/controllers/HelloController';
import { Registry } from '@kernel/di/Registry';
import { lambdaHttpAdapter } from '@main/adapters/lambdaHttpAdapter';

// Resolver o controller com todas as dependências injetadas
const controller = Registry.getInstance().resolve(HelloController);

// Exportar o handler adaptado para Lambda
export const handler = lambdaHttpAdapter(controller);
```

**Características:**
- Cada função é um ponto de entrada independente
- Import `reflect-metadata` no topo é obrigatório
- Resolve o Controller via Registry (DI automática)
- Usa o adapter para transformar Controller em Lambda handler
- Exporta o handler para ser usado pelo Serverless Framework

### Utils

Utilitários específicos para infraestrutura Lambda.

#### lambdaBodyParser

Faz o parse do body da requisição Lambda.

**Funcionalidade:**
- Converte string JSON para objeto JavaScript
- Retorna objeto vazio se body for undefined/null
- Trata erros de parsing

**Exemplo:**
```typescript
const body = lambdaBodyParser(event.body);
// '{"email":"test@test.com"}' → { email: "test@test.com" }
```

#### lambdaErrorResponse

Formata erros para respostas HTTP do API Gateway.

**Funcionalidade:**
- Padroniza formato de resposta de erro
- Inclui statusCode, code e message
- Serializa para JSON

**Formato de resposta:**
```typescript
{
  statusCode: 400,
  body: JSON.stringify({
    code: 'VALIDATION_ERROR',
    message: [
      { field: 'email', error: 'Email inválido' }
    ]
  })
}
```

## 🔄 Fluxo Completo de uma Requisição

```
1. API Gateway recebe requisição HTTP
         ↓
2. Invoca função Lambda (handler)
         ↓
3. lambdaHttpAdapter recebe APIGatewayProxyEventV2
         ↓
4. lambdaBodyParser converte body para objeto
         ↓
5. Adapter extrai params e queryParams
         ↓
6. Controller.execute() é chamado
         ↓
7. Controller valida dados (Zod Schema)
         ↓
8. Controller chama UseCase
         ↓
9. UseCase executa lógica de negócio
         ↓
10. UseCase retorna resultado
         ↓
11. Controller formata resposta
         ↓
12. Adapter converte para APIGatewayProxyResultV2
         ↓
13. Lambda retorna resposta para API Gateway
         ↓
14. API Gateway retorna HTTP Response ao cliente
```

## 🚨 Tratamento de Erros

O adapter implementa tratamento robusto de erros:

### ZodError (Validação)
```typescript
{
  statusCode: 400,
  body: {
    code: "VALIDATION",
    message: [
      { field: "email", error: "Invalid email" }
    ]
  }
}
```

### HttpError (Erros de Negócio)
```typescript
{
  statusCode: error.statusCode,
  body: {
    code: error.code,
    message: error.message
  }
}
```

### Erro Desconhecido
```typescript
{
  statusCode: 500,
  body: {
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error."
  }
}
```

## 📝 Adicionando Nova Função Lambda

Para adicionar uma nova função Lambda:

1. **Criar o handler** em `src/main/functions/`:
```typescript
// src/main/functions/createMeal.ts
import 'reflect-metadata';

import { CreateMealController } from '@application/controllers/CreateMealController';
import { Registry } from '@kernel/di/Registry';
import { lambdaHttpAdapter } from '@main/adapters/lambdaHttpAdapter';

const controller = Registry.getInstance().resolve(CreateMealController);
export const handler = lambdaHttpAdapter(controller);
```

2. **Configurar no serverless.yml**:
```yaml
functions:
  createMeal:
    handler: src/main/functions/createMeal.handler
    events:
      - httpApi:
          path: /meals
          method: post
```

3. **Deploy**:
```bash
serverless deploy
```

## 🎨 Padrões Utilizados

### Adapter Pattern
- Converte interface externa (Lambda) para interna (Controller)
- Desacopla infraestrutura da lógica de negócio
- Facilita testes e mudanças de infraestrutura

### Handler Pattern
- Cada função Lambda tem seu próprio handler
- Handlers são pontos de entrada independentes
- Configurados via Serverless Framework

### Error Handling Pattern
- Tratamento centralizado de erros no adapter
- Conversão automática de erros para respostas HTTP
- Logging de erros desconhecidos

## ✅ Boas Práticas

1. **Import reflect-metadata**: Sempre no topo dos handlers
2. **Um handler por função**: Cada função Lambda tem seu arquivo
3. **Use o adapter**: Sempre use `lambdaHttpAdapter` para controllers HTTP
4. **Trate erros apropriadamente**: Use classes de erro do framework
5. **Mantenha handlers simples**: Apenas resolver controller e exportar
6. **Parse antes de usar**: Use os utils para parsing de body e formatação de erros

## 🔗 Integração com Outras Camadas

- **Application**: Resolve e executa Controllers via adapter
- **Kernel**: Usa Registry para resolver dependências
- **Shared**: Usa tipos compartilhados

## 🚀 Deploy e Execução

### Deploy
```bash
serverless deploy
```

### Desenvolvimento Local
```bash
serverless dev
```

### Logs
```bash
serverless logs -f hello -t
```

## 📊 API Gateway Event (v2)

Estrutura do evento recebido:
```typescript
{
  version: '2.0',
  routeKey: 'POST /hello',
  rawPath: '/hello',
  headers: { ... },
  queryStringParameters: { ... },
  pathParameters: { ... },
  body: '{"email":"test@test.com"}',
  isBase64Encoded: false,
  requestContext: { ... }
}
```

Estrutura da resposta:
```typescript
{
  statusCode: 200,
  headers?: { ... },
  body?: '{"result":"success"}',
  isBase64Encoded?: false
}
```
