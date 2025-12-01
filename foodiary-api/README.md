# Foodiary API

API serverless para o projeto Foodiary, desenvolvida com TypeScript e AWS Lambda usando o Serverless Framework.

## 📋 Sobre o Projeto

O Foodiary API é uma aplicação serverless construída com arquitetura limpa e princípios SOLID. O projeto utiliza injeção de dependências, validação de dados com Zod e está preparado para rodar na AWS Lambda.

## 🏗️ Arquitetura

A arquitetura do projeto segue uma estrutura em camadas, promovendo separação de responsabilidades e facilitando a manutenção e testabilidade do código:

```
src/
├── application/     # Camada de Aplicação
├── kernel/          # Núcleo do Framework
├── main/            # Camada de Infraestrutura
└── shared/          # Recursos Compartilhados
```

### Fluxo de Dados

```
AWS Lambda Event → Adapter → Controller → UseCase → Controller → Adapter → Lambda Response
```

### Camadas

#### 🎯 Application (Camada de Aplicação)
Contém a lógica de negócio da aplicação, incluindo:
- **Controllers**: Recebem requisições HTTP, validam dados e orquestram casos de uso
- **UseCases**: Implementam regras de negócio específicas
- **Errors**: Tratamento de erros padronizado
- **Schemas**: Validação de dados com Zod

[Documentação detalhada →](./src/application/README.md)

#### ⚙️ Kernel (Núcleo do Framework)
Fornece funcionalidades essenciais e reutilizáveis:
- **DI (Dependency Injection)**: Sistema de injeção de dependências
- **Decorators**: Decorators para metadados e funcionalidades (@Injectable, @Schema)

[Documentação detalhada →](./src/kernel/README.md)

#### 🔌 Main (Camada de Infraestrutura)
Responsável pela integração com serviços externos:
- **Adapters**: Adaptadores para AWS Lambda
- **Functions**: Handlers das funções Lambda
- **Utils**: Utilitários para parsing e tratamento de erros

[Documentação detalhada →](./src/main/README.md)

#### 📦 Shared (Recursos Compartilhados)
Tipos e utilitários compartilhados entre todas as camadas.

[Documentação detalhada →](./src/shared/README.md)

## 🚀 Tecnologias

- **TypeScript**: Linguagem principal
- **AWS Lambda**: Plataforma serverless
- **Serverless Framework**: Framework para deploy
- **Zod**: Validação de schemas
- **Reflect Metadata**: Suporte para decorators e injeção de dependências
- **ESBuild**: Build tool para bundle otimizado

## 📦 Instalação

```bash
# Instalar dependências
pnpm install
```

## 🛠️ Scripts Disponíveis

```bash
# Verificar tipos TypeScript
pnpm typecheck

# Deploy para AWS
serverless deploy

# Desenvolvimento local
serverless dev
```

## 🏃 Como Usar

### Exemplo de Implementação de uma Nova Funcionalidade

1. **Criar o UseCase** em `src/application/usecases/`
2. **Criar o Controller** em `src/application/controllers/`
3. **Criar o Schema de Validação** em `src/application/controllers/schemas/`
4. **Criar o Handler Lambda** em `src/main/functions/`
5. **Configurar a função** no `serverless.yml`

### Exemplo de UseCase

```typescript
import { Injectable } from '@kernel/decorators/Injectable';

@Injectable()
export class MeuUseCase {
  async execute(input: MeuUseCase.Input): Promise<MeuUseCase.Output> {
    // Lógica de negócio
    return { result: 'success' };
  }
}

export namespace MeuUseCase {
  export type Input = { /* ... */ };
  export type Output = { /* ... */ };
}
```

### Exemplo de Controller

```typescript
import { Controller } from '@application/contracts/Controller';
import { Injectable } from '@kernel/decorators/Injectable';
import { Schema } from '@kernel/decorators/Schema';

@Injectable()
@Schema(meuSchema)
export class MeuController extends Controller {
  constructor(private readonly useCase: MeuUseCase) {
    super();
  }

  protected async handle(request: Controller.Request): Promise<Controller.Response> {
    const result = await this.useCase.execute(request.body);
    return { statusCode: 200, body: result };
  }
}
```

### Exemplo de Handler Lambda

```typescript
import 'reflect-metadata';
import { MeuController } from '@application/controllers/MeuController';
import { Registry } from '@kernel/di/Registry';
import { lambdaHttpAdapter } from '@main/adapters/lambdaHttpAdapter';

const controller = Registry.getInstance().resolve(MeuController);
export const handler = lambdaHttpAdapter(controller);
```

## 📝 Convenções

- Use o decorator `@Injectable()` em todos os UseCases e Controllers
- Sempre defina schemas de validação com Zod para os Controllers
- Utilize namespaces para tipos Input/Output dos UseCases
- Mantenha a separação de responsabilidades entre as camadas

## 🔧 Configuração

O projeto utiliza:
- `tsconfig.json`: Configuração do TypeScript com paths aliases
- `eslint.config.mts`: Configuração do ESLint
- `serverless.yml`: Configuração de deploy AWS
- `esbuild.config.mjs`: Configuração de build

## 📚 Documentação das Camadas

- [Application](./src/application/README.md)
- [Kernel](./src/kernel/README.md)
- [Main](./src/main/README.md)
- [Shared](./src/shared/README.md)
