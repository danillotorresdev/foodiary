# Shared (Recursos Compartilhados)

A camada Shared contém tipos, utilitários e recursos que são compartilhados entre todas as camadas da aplicação. É uma camada de suporte que não contém lógica de negócio, mas fornece abstrações e definições comuns.

## 📁 Estrutura

```
shared/
└── types/              # Tipos TypeScript compartilhados
    └── Constructor.ts  # Tipo genérico para construtores
```

## 🎯 Responsabilidades

Esta camada é responsável por:
- Definir tipos genéricos e reutilizáveis
- Fornecer abstrações comuns usadas em múltiplas camadas
- Centralizar definições de tipos para evitar duplicação
- Manter consistência de tipos em toda a aplicação

## 📦 Tipos Disponíveis

### Constructor

Define um tipo genérico para construtores de classes.

**Definição:**
```typescript
export type Constructor<T = unknown> = new (...args: any[]) => T;
```

**Uso:**
- Sistema de injeção de dependências (Registry)
- Decorators que manipulam classes
- Funções que recebem/retornam classes

**Exemplos:**
```typescript
// No Registry
register(impl: Constructor) { ... }
resolve<TImpl extends Constructor>(impl: TImpl): InstanceType<TImpl> { ... }

// Em decorators
export function Injectable(): ClassDecorator {
  return (target) => {
    Registry.getInstance().register(target as unknown as Constructor);
  };
}

// Em funções utilitárias
function createInstance<T>(ctor: Constructor<T>, ...args: any[]): T {
  return new ctor(...args);
}
```

**Características:**
- Genérico: Pode representar qualquer construtor
- Type-safe: Preserva o tipo da instância criada
- Flexível: Aceita qualquer número/tipo de argumentos

## 🎨 Princípios da Camada Shared

### 1. Sem Dependências Externas
- Não depende de outras camadas da aplicação
- Pode ser usado por qualquer camada
- Mantém baixo acoplamento

### 2. Tipos Genéricos
- Fornece abstrações reutilizáveis
- Não contém lógica específica de negócio
- Foca em estruturas e padrões comuns

### 3. Centralização
- Evita duplicação de código
- Mantém consistência de tipos
- Facilita manutenção

## 📝 Quando Adicionar Algo ao Shared

Adicione à camada Shared quando:

✅ **SIM:**
- Tipo usado em múltiplas camadas
- Abstrações genéricas e reutilizáveis
- Utilitários sem lógica de negócio
- Constantes globais da aplicação
- Interfaces comuns entre camadas

❌ **NÃO:**
- Lógica de negócio
- Código específico de uma camada
- Dependências externas específicas
- Implementações concretas de regras

## 🔄 Exemplos de Uso

### Constructor Type

```typescript
// kernel/di/Registry.ts
import { Constructor } from '@shared/types/Constructor';

export class Registry {
  private readonly providers = new Map<string, {
    impl: Constructor;
    deps: Constructor[];
  }>();

  register(impl: Constructor) {
    // ...
  }

  resolve<TImpl extends Constructor>(impl: TImpl): InstanceType<TImpl> {
    // ...
  }
}
```

### Em Decorators

```typescript
// kernel/decorators/Injectable.ts
import { Constructor } from '@shared/types/Constructor';

export function Injectable(): ClassDecorator {
  return (target) => {
    Registry.getInstance().register(target as unknown as Constructor);
  };
}
```

## 📚 Possíveis Adições Futuras

Exemplos de tipos/utilitários que podem ser adicionados:

### Result Type (para tratamento de erros)
```typescript
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };
```

### Optional Type
```typescript
export type Optional<T> = T | undefined;
export type Nullable<T> = T | null;
```

### Utility Types
```typescript
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};
```

### ID Types
```typescript
export type UUID = string;
export type Timestamp = number;
export type EntityId = string | number;
```

### Pagination Types
```typescript
export type PaginationParams = {
  page: number;
  limit: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
};
```

## ✅ Boas Práticas

1. **Mantenha genérico**: Tipos devem ser reutilizáveis e sem lógica específica
2. **Documente bem**: Adicione comentários explicando o propósito e uso
3. **Evite complexidade**: Prefira tipos simples e claros
4. **Teste a reutilização**: Se o tipo é usado em apenas um lugar, provavelmente não pertence ao Shared
5. **Organize por categoria**: Agrupe tipos relacionados (types/, utils/, constants/)

## 🔗 Integração com Outras Camadas

A camada Shared é usada por todas as outras camadas:

- **Kernel**: Usa `Constructor` no sistema de DI
- **Application**: Pode usar tipos comuns para DTOs, etc.
- **Main**: Pode usar tipos para configurações, etc.

**Importante**: Shared não importa de nenhuma outra camada, apenas exporta.

## 📊 Diagrama de Dependências

```
┌─────────────┐
│ Application │─┐
└─────────────┘ │
                │
┌─────────────┐ │    ┌────────┐
│   Kernel    │─┼───▶│ Shared │
└─────────────┘ │    └────────┘
                │
┌─────────────┐ │
│    Main     │─┘
└─────────────┘
```

Todas as camadas podem usar Shared, mas Shared não depende de ninguém.
