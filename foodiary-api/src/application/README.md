# Application (Camada de Aplicação)

A camada de aplicação contém toda a lógica de negócio e orquestração de casos de uso da API. É aqui que as regras de negócio são implementadas e validadas.

## 📁 Estrutura

```
application/
├── contracts/          # Contratos e interfaces base
├── controllers/        # Controllers que recebem requisições HTTP
│   └── schemas/       # Schemas de validação Zod
├── errors/            # Tratamento de erros
│   └── http/         # Erros HTTP específicos
└── usecases/          # Casos de uso (lógica de negócio)
```

## 🎯 Responsabilidades

### Controllers

Os Controllers são responsáveis por:
- Receber e processar requisições HTTP
- Validar dados de entrada usando schemas Zod
- Orquestrar a execução de UseCases
- Formatar e retornar respostas HTTP

**Características:**
- Estendem a classe abstrata `Controller<TBody>`
- Usam o decorator `@Injectable()` para injeção de dependências
- Usam o decorator `@Schema()` para validação automática de dados
- Implementam o método `handle()` com a lógica específica

**Exemplo:**
```typescript
@Injectable()
@Schema(helloSchema)
export class HelloController extends Controller<unknown> {
  constructor(private readonly helloUseCase: HelloUseCase) {
    super();
  }

  protected async handle(
    request: Controller.Request<HelloBody>
  ): Promise<Controller.Response<unknown>> {
    const result = await this.helloUseCase.execute({
      email: request.body.email,
    });

    return {
      statusCode: 200,
      body: { result },
    };
  }
}
```

### Contracts

Define interfaces e classes base que estabelecem contratos para a aplicação:

- **Controller**: Classe abstrata base para todos os controllers
  - Fornece validação automática de body usando schemas Zod
  - Define a estrutura de Request (body, params, queryParams)
  - Define a estrutura de Response (statusCode, body)

### UseCases

Os UseCases encapsulam regras de negócio específicas:
- Cada UseCase representa uma operação ou funcionalidade específica
- São classes independentes e testáveis
- Podem depender de outros UseCases
- Definem tipos Input e Output usando namespaces

**Características:**
- Usam o decorator `@Injectable()` para participar da DI
- Implementam método `execute()` com a lógica de negócio
- Definem tipos Input/Output em namespaces

**Exemplo:**
```typescript
@Injectable()
export class HelloUseCase {
  constructor(private readonly createMealUseCase: CreateMealUseCase) {}

  async execute(input: HelloUseCase.Input): Promise<HelloUseCase.Output> {
    return {
      helloUseCase: input.email,
      data: await this.createMealUseCase.execute(),
    };
  }
}

export namespace HelloUseCase {
  export type Input = { email: string };
  export type Output = { helloUseCase: string; data: any };
}
```

### Schemas

Schemas de validação usando Zod:
- Definem a estrutura esperada dos dados de entrada
- São aplicados automaticamente nos Controllers via decorator `@Schema()`
- Validação falha retorna erro 400 com detalhes dos campos inválidos

**Exemplo:**
```typescript
import { z } from 'zod';

export const helloSchema = z.object({
  email: z.string().email('Email inválido'),
});

export type HelloBody = z.infer<typeof helloSchema>;
```

### Errors

Sistema de tratamento de erros padronizado:

- **ErrorCode**: Enum com códigos de erro padronizados
- **HttpError**: Classe base para erros HTTP
- **BadRequest**: Erro específico para requisições inválidas (400)

Todos os erros são interceptados pelo adapter Lambda e convertidos em respostas HTTP apropriadas.

## 🔄 Fluxo de Dados

```
1. Request HTTP chega ao Controller
2. Controller valida o body usando Schema (Zod)
3. Se válido, Controller chama o UseCase
4. UseCase executa a lógica de negócio
5. UseCase retorna resultado
6. Controller formata e retorna a resposta HTTP
```

## 🎨 Padrões Utilizados

- **Controller Pattern**: Separação entre recebimento de requisições e lógica de negócio
- **Use Case Pattern**: Encapsulamento de regras de negócio em casos de uso
- **Dependency Injection**: Injeção de dependências via decorators
- **Validation Pattern**: Validação declarativa usando schemas
- **Namespace Pattern**: Organização de tipos relacionados

## ✅ Boas Práticas

1. **Controllers devem ser finos**: Apenas orquestram, não implementam lógica de negócio
2. **UseCases devem ser coesos**: Cada UseCase tem uma responsabilidade única
3. **Sempre valide inputs**: Use schemas Zod para todos os Controllers
4. **Use namespaces para tipos**: Mantenha tipos Input/Output organizados
5. **Dependency Injection**: Sempre use `@Injectable()` para classes que precisam de DI
6. **Trate erros apropriadamente**: Use classes de erro específicas (HttpError, BadRequest, etc.)

## 🔗 Integração com Outras Camadas

- **Kernel**: Usa decorators (@Injectable, @Schema) e Registry para DI
- **Main**: Controllers são resolvidos e adaptados para Lambda handlers
- **Shared**: Usa tipos compartilhados (Constructor, etc.)
