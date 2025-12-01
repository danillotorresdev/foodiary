# Kernel (Núcleo do Framework)

O Kernel é o núcleo do framework customizado da aplicação. Fornece funcionalidades essenciais e reutilizáveis que suportam toda a arquitetura, incluindo sistema de injeção de dependências e decorators.

## 📁 Estrutura

```
kernel/
├── decorators/        # Decorators TypeScript
│   ├── Injectable.ts # Decorator para registro no DI
│   └── Schema.ts     # Decorator para validação de schemas
└── di/               # Dependency Injection
    └── Registry.ts   # Container de injeção de dependências
```

## 🎯 Responsabilidades

### Dependency Injection (DI)

O sistema de injeção de dependências é implementado através do **Registry**, um singleton que gerencia todas as dependências da aplicação.

#### Registry

**Características:**
- Singleton pattern - única instância em toda a aplicação
- Usa Reflection Metadata para detectar dependências automaticamente
- Registra e resolve classes com suas dependências
- Suporta injeção via construtor

**Funcionamento:**
```typescript
// 1. Registro de uma classe
registry.register(HelloUseCase);

// 2. Resolução automática com dependências injetadas
const instance = registry.resolve(HelloUseCase);
```

**Fluxo de resolução:**
1. Busca a classe no registro de providers
2. Obtém metadados das dependências do construtor (via Reflect)
3. Resolve recursivamente todas as dependências
4. Cria instância com dependências injetadas
5. Retorna instância pronta para uso

**Exemplo de uso:**
```typescript
import { Registry } from '@kernel/di/Registry';

const registry = Registry.getInstance();

// Registrar classes (feito automaticamente pelo decorator @Injectable)
registry.register(CreateMealUseCase);
registry.register(HelloUseCase);

// Resolver com dependências injetadas
const helloUseCase = registry.resolve(HelloUseCase);
// HelloUseCase será criado com CreateMealUseCase já injetado
```

### Decorators

Decorators TypeScript que adicionam funcionalidades e metadados às classes.

#### @Injectable()

Marca uma classe como injetável e a registra automaticamente no Registry.

**Uso:**
```typescript
@Injectable()
export class HelloUseCase {
  constructor(private readonly createMealUseCase: CreateMealUseCase) {}
  // ...
}
```

**O que faz:**
- Registra a classe no Registry automaticamente
- Permite que a classe seja resolvida com suas dependências
- Deve ser usado em todas as classes que participam da DI (UseCases, Controllers, Services, etc.)

**Implementação:**
```typescript
export function Injectable(): ClassDecorator {
  return (target) => {
    Registry.getInstance().register(target as unknown as Constructor);
  };
}
```

#### @Schema(zodSchema)

Associa um schema Zod a um Controller para validação automática do body.

**Uso:**
```typescript
@Injectable()
@Schema(helloSchema)
export class HelloController extends Controller<unknown> {
  // Body será validado automaticamente antes de handle()
}
```

**O que faz:**
- Armazena o schema Zod como metadado da classe
- O Controller usa esse metadado para validar automaticamente o body
- Se a validação falhar, retorna erro 400 com detalhes

**Implementação:**
```typescript
const SCHEMA_KEY = Symbol('schema');

export function Schema(schema: z.ZodSchema): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(SCHEMA_KEY, schema, target.prototype);
  };
}

export function getSchema(target: object): z.ZodSchema | undefined {
  return Reflect.getMetadata(SCHEMA_KEY, target);
}
```

## 🔧 Tecnologias Utilizadas

### Reflect Metadata

O Kernel utiliza `reflect-metadata` para:
- Detectar tipos de parâmetros do construtor automaticamente
- Armazenar e recuperar metadados customizados (schemas)
- Implementar injeção de dependências via decorators

**Metadados utilizados:**
- `design:paramtypes`: Tipos dos parâmetros do construtor (injeção automática)
- Custom metadata: Schemas de validação, tokens de injeção, etc.

## 🎨 Padrões de Design

### Singleton Pattern
- **Registry** é implementado como singleton
- Garante uma única instância do container DI
- Acesso via `Registry.getInstance()`

### Decorator Pattern
- Decorators adicionam comportamentos sem modificar as classes
- `@Injectable()` adiciona registro no DI
- `@Schema()` adiciona validação automática

### Inversion of Control (IoC)
- Classes declaram suas dependências no construtor
- Registry resolve e injeta automaticamente
- Classes não criam suas próprias dependências

### Reflection
- Metadados são lidos em runtime
- Permite injeção de dependências automática
- Extensível para novos decorators e funcionalidades

## 🔄 Fluxo de Injeção de Dependências

```
1. Classes são marcadas com @Injectable()
   ↓
2. Decorator registra a classe no Registry
   ↓
3. Em runtime, Registry.resolve() é chamado
   ↓
4. Registry lê metadados do construtor (Reflect)
   ↓
5. Resolve recursivamente todas as dependências
   ↓
6. Cria instância com dependências injetadas
   ↓
7. Retorna instância pronta para uso
```

## ✅ Boas Práticas

1. **Sempre use @Injectable()**: Toda classe que precisa ser injetada ou tem dependências deve usar este decorator
2. **Registre no momento certo**: O decorator registra na inicialização da classe (import time)
3. **Evite circular dependencies**: Organize suas dependências para evitar ciclos
4. **Um schema por Controller**: Use @Schema() para validar o body de cada Controller
5. **Import reflect-metadata**: Sempre importe no entry point da aplicação (handler)

## 🔗 Integração com Outras Camadas

- **Application**: UseCases e Controllers usam `@Injectable()` e `@Schema()`
- **Main**: Handlers resolvem Controllers usando `Registry.resolve()`
- **Shared**: Usa tipos compartilhados como `Constructor`

## 📝 Exemplo Completo

```typescript
// 1. Definir UseCase com dependências
@Injectable()
export class CreateMealUseCase {
  async execute() {
    return { meal: 'created' };
  }
}

@Injectable()
export class HelloUseCase {
  // CreateMealUseCase será injetado automaticamente
  constructor(private readonly createMealUseCase: CreateMealUseCase) {}

  async execute(input: HelloUseCase.Input): Promise<HelloUseCase.Output> {
    const data = await this.createMealUseCase.execute();
    return { helloUseCase: input.email, data };
  }
}

// 2. Definir Controller com validação
const helloSchema = z.object({
  email: z.string().email(),
});

@Injectable()
@Schema(helloSchema)
export class HelloController extends Controller {
  // HelloUseCase será injetado automaticamente
  constructor(private readonly helloUseCase: HelloUseCase) {
    super();
  }

  protected async handle(request: Controller.Request) {
    // Body já validado automaticamente
    const result = await this.helloUseCase.execute({
      email: request.body.email,
    });
    return { statusCode: 200, body: { result } };
  }
}

// 3. Resolver no handler
import 'reflect-metadata'; // Importante!

const controller = Registry.getInstance().resolve(HelloController);
// Todas as dependências já foram injetadas recursivamente
```

## 🚀 Extensibilidade

O Kernel é projetado para ser extensível. Você pode:

1. **Criar novos decorators**: Para adicionar comportamentos customizados
2. **Estender o Registry**: Para suportar novos tipos de injeção (por exemplo, factory, singleton)
3. **Adicionar metadados**: Para funcionalidades adicionais (cache, logs, métricas, etc.)

Exemplo de novo decorator:
```typescript
export function Cache(ttl: number): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata('cache:ttl', ttl, target, propertyKey);
    // Implementar lógica de cache...
  };
}
```
