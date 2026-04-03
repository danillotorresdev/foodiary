# Foodiary API - Padroes de Projeto e Arquitetura

Este documento cataloga todos os **padroes de design** e **padroes arquiteturais** utilizados no projeto, com exemplos do proprio codigo.

---

## Indice

- [1. Padroes Arquiteturais](#1-padroes-arquiteturais)
  - [1.1 Clean Architecture / Hexagonal](#11-clean-architecture--hexagonal)
  - [1.2 CQRS (Command Query Responsibility Segregation)](#12-cqrs-command-query-responsibility-segregation)
  - [1.3 Event-Driven Architecture](#13-event-driven-architecture)
  - [1.4 Serverless / FaaS](#14-serverless--faas)
  - [1.5 Single Table Design (DynamoDB)](#15-single-table-design-dynamodb)
- [2. Padroes de Design (GoF e outros)](#2-padroes-de-design-gof-e-outros)
  - [2.1 Repository Pattern](#21-repository-pattern)
  - [2.2 Unit of Work](#22-unit-of-work)
  - [2.3 Saga Pattern](#23-saga-pattern)
  - [2.4 Gateway Pattern](#24-gateway-pattern)
  - [2.5 Adapter Pattern](#25-adapter-pattern)
  - [2.6 Data Mapper Pattern](#26-data-mapper-pattern)
  - [2.7 Dependency Injection (IoC)](#27-dependency-injection-ioc)
  - [2.8 Decorator Pattern](#28-decorator-pattern)
  - [2.9 Singleton Pattern](#29-singleton-pattern)
  - [2.10 Template Method Pattern](#210-template-method-pattern)
  - [2.11 Factory Method Pattern](#211-factory-method-pattern)
  - [2.12 Strategy Pattern (implicito)](#212-strategy-pattern-implicito)
- [3. Padroes de Dominio (DDD-lite)](#3-padroes-de-dominio-ddd-lite)
  - [3.1 Entity](#31-entity)
  - [3.2 Value Object (via Enums)](#32-value-object-via-enums)
  - [3.3 Domain Service](#33-domain-service)
  - [3.4 Application Service (Use Case)](#34-application-service-use-case)
- [4. Padroes de API e Integracao](#4-padroes-de-api-e-integracao)
  - [4.1 Controller Pattern](#41-controller-pattern)
  - [4.2 DTO Pattern](#42-dto-pattern)
  - [4.3 Schema Validation Pattern](#43-schema-validation-pattern)
  - [4.4 Error Handling Pattern](#44-error-handling-pattern)
  - [4.5 Presigned URL Pattern](#45-presigned-url-pattern)
- [5. Padroes de Infraestrutura AWS](#5-padroes-de-infraestrutura-aws)
  - [5.1 Dead Letter Queue (DLQ)](#51-dead-letter-queue-dlq)
  - [5.2 Origin Access Control (OAC)](#52-origin-access-control-oac)
  - [5.3 JWT Custom Claims](#53-jwt-custom-claims)
- [6. Resumo Visual](#6-resumo-visual)

---

## 1. Padroes Arquiteturais

### 1.1 Clean Architecture / Hexagonal

**O que e:** Separacao em camadas concentricas onde o dominio/aplicacao fica no centro, independente de frameworks e infraestrutura.

**Como aparece no projeto:**

```
src/
├── kernel/      # Nucleo do framework (DI, decorators)
├── shared/      # Codigo compartilhado (config, utils)
├── application/ # Logica de negocio (entities, usecases, controllers)
├── infra/       # Detalhes de implementacao (AWS, OpenAI, emails)
└── main/        # Ponto de entrada (Lambda handlers, adapters)
```

**Regra de dependencia:** As camadas externas dependem das internas, nunca o contrario.

- `main` -> `application` -> `kernel/shared`
- `infra` -> `application` -> `kernel/shared`

**Beneficio:** Trocar DynamoDB por PostgreSQL? So muda `infra/database/`. Trocar Lambda por Express? So muda `main/`.

---

### 1.2 CQRS (Command Query Responsibility Segregation)

**O que e:** Separar operacoes de **leitura** (Query) das operacoes de **escrita** (Command), cada uma com seu proprio modelo/caminho.

**Como aparece no projeto:**

| Tipo | Caminho | Exemplo |
|------|---------|---------|
| **Command** (escrita) | Controller → UseCase → Repository/Gateway | `SignUpUseCase`, `CreateMealUseCase` |
| **Query** (leitura) | Controller → Query | `GetProfileAndGoalQuery`, `ListMealsByDayQuery` |

**Exemplo de Query (leitura otimizada):**

```typescript
// src/application/query/ListMealsByDayQuery.ts
@Injectable()
export class ListMealsByDayQuery {
  async execute({ accountId, date }): Promise<Output> {
    const command = new QueryCommand({
      TableName: this.config.db.dynamodb.mainTable,
      IndexName: 'GSI1',  // Usa indice secundario
      ProjectionExpression: '#id, #createdAt, #foods, #icon, #name',  // So campos necessarios
      KeyConditionExpression: '#GSI1PK = :GSI1PK',
      FilterExpression: '#status = :status',
      // ...
    });
    // Retorna DTO direto, sem passar por Entity
  }
}
```

**Exemplo de Command (escrita com regras):**

```typescript
// src/application/usecases/auth/SignUpUseCase.ts
@Injectable()
export class SignUpUseCase {
  async execute(input): Promise<Output> {
    // 1. Validacao de negocio
    const emailAlreadyInUse = await this.accountRepository.findByEmail(email);
    if (emailAlreadyInUse) throw new EmailAlreadyInUse();

    // 2. Cria entidades
    const account = new Account({ email });
    const profile = new Profile({ ... });
    const goal = new Goal({ ... });

    // 3. Integra com sistema externo (Cognito)
    const { externalId } = await this.authGateway.signUp({ ... });

    // 4. Persiste atomicamente (Unit of Work)
    await this.signUpUow.run({ account, goal, profile });

    // 5. Retorna resultado
    return { accessToken, refreshToken };
  }
}
```

**Quando usar Query vs UseCase:**
- **Query:** Leitura simples, listagens, dashboards, sem regras de negocio
- **UseCase:** Qualquer operacao que altera estado ou tem logica de dominio

---

### 1.3 Event-Driven Architecture

**O que e:** Componentes se comunicam via **eventos** ao inves de chamadas diretas. Desacoplamento temporal e espacial.

**Como aparece no projeto:**

```
[Mobile] --POST /meals--> [Lambda: createMeal]
                               |
                               v
                          [DynamoDB: Meal UPLOADING]
                               |
[Mobile] --upload file-------> [S3 Bucket]
                               |
                               v (S3 Event: ObjectCreated)
                          [Lambda: onMealFileUploaded]
                               |
                               v
                          [DynamoDB: Meal QUEUED]
                               |
                               v (SQS Message)
                          [Lambda: processMeal]
                               |
                               v
                          [OpenAI API]
                               |
                               v
                          [DynamoDB: Meal SUCCESS]
```

**Eventos no projeto:**
1. **S3 Event** (`s3:ObjectCreated:*`) → `onMealFileUploaded`
2. **SQS Message** → `processMeal`
3. **Cognito Triggers** → `preSignUp`, `preTokenGeneration`, `customMessage`

**Beneficio:** Cada Lambda escala independentemente. Falha em um estagio nao bloqueia os outros.

---

### 1.4 Serverless / FaaS

**O que e:** Funcoes efemeras executadas sob demanda, sem gerenciar servidores.

**Como aparece no projeto:**

- Cada endpoint e uma Lambda separada (definida em `sls/functions/*.yml`)
- `memorySize: 128` MB por padrao
- `package.individually: true` — cada Lambda tem seu proprio bundle

**Caracteristicas:**
- Cold start: primeira execucao pode demorar mais
- Stateless: cada invocacao e independente
- Pay-per-use: paga so pelo tempo de execucao

---

### 1.5 Single Table Design (DynamoDB)

**O que e:** Armazenar todas as entidades em **uma unica tabela**, diferenciadas por padroes de chaves (PK/SK).

**Como aparece no projeto:**

| Entidade | PK | SK | GSI1PK | GSI1SK |
|----------|----|----|--------|--------|
| Account | `ACCOUNT#{id}` | `ACCOUNT#{id}` | `ACCOUNT#{email}` | `ACCOUNT#{email}` |
| Profile | `ACCOUNT#{accountId}` | `ACCOUNT#{accountId}#PROFILE` | — | — |
| Goal | `ACCOUNT#{accountId}` | `ACCOUNT#{accountId}#GOAL` | — | — |
| Meal | `ACCOUNT#{accountId}#MEAL#{mealId}` | (mesmo) | `MEALS#{accountId}#YYYY-MM-DD` | `MEAL#{mealId}` |

**Beneficios:**
- Uma query pode retornar Profile + Goal juntos (usando `begins_with`)
- Transacoes atomicas entre entidades diferentes
- Menor custo (uma tabela vs varias)

**Exemplo de query "join":**

```typescript
// GetProfileAndGoalQuery.ts
KeyConditionExpression: '#PK = :PK AND begins_with(#SK, :SK)',
ExpressionAttributeValues: {
  ':PK': `ACCOUNT#${accountId}`,
  ':SK': `ACCOUNT#${accountId}#`,  // Retorna PROFILE e GOAL
}
```

---

## 2. Padroes de Design (GoF e outros)

### 2.1 Repository Pattern

**O que e:** Abstrai o acesso a dados, expondo operacoes de dominio (find, save, create) sem expor detalhes do banco.

**Onde aparece:**
- `AccountRepository`
- `ProfileRepository`
- `GoalRepository`
- `MealRepository`

**Exemplo:**

```typescript
// src/infra/database/dynamo/repositories/MealRepository.ts
@Injectable()
export class MealRepository {
  async findById({ mealId, accountId }): Promise<Meal | null> {
    const command = new GetCommand({
      TableName: this.config.db.dynamodb.mainTable,
      Key: {
        PK: MealItem.getPK({ accountId, mealId }),
        SK: MealItem.getSK({ accountId, mealId }),
      },
    });
    const { Item } = await dynamoClient.send(command);
    return Item ? MealItem.toEntity(Item) : null;
  }

  async save(meal: Meal) { /* UpdateCommand */ }
  async create(meal: Meal) { /* PutCommand */ }
}
```

**Beneficio:** UseCase nao sabe se e DynamoDB, PostgreSQL ou memoria. So chama `repository.findById()`.

---

### 2.2 Unit of Work

**O que e:** Agrupa multiplas operacoes de banco em uma **transacao atomica** — tudo ou nada.

**Onde aparece:**
- `UnitOfWork` (classe base)
- `SignUpUnitOfWork` (cria Account + Profile + Goal atomicamente)

**Exemplo:**

```typescript
// src/infra/database/dynamo/uow/UnitOfWork.ts
export abstract class UnitOfWork {
  private transactItems: TransactWriteCommandInput['TransactItems'] = [];

  protected addPut(putInput: PutCommandInput) {
    this.transactItems.push({ Put: putInput });
  }

  protected async commit() {
    await dynamoClient.send(
      new TransactWriteCommand({ TransactItems: this.transactItems })
    );
  }
}

// src/infra/database/dynamo/uow/SignUpUnitOfWork.ts
export class SignUpUnitOfWork extends UnitOfWork {
  async run({ account, goal, profile }) {
    this.addPut(this.accountRepository.getPutCommandInput(account));
    this.addPut(this.profileRepository.getPutCommandInput(profile));
    this.addPut(this.goalRepository.getPutCommandInput(goal));
    await this.commit();  // TransactWriteCommand — atomico
  }
}
```

**Beneficio:** Se qualquer Put falhar, nenhum e gravado. Sem dados inconsistentes.

---

### 2.3 Saga Pattern

**O que e:** Para operacoes distribuidas (multiplos servicos), cada passo tem uma **compensacao** que reverte a acao em caso de falha posterior.

**Onde aparece:**
- `Saga` (classe generica)
- `SignUpUseCase` (usa Saga para reverter Cognito se DynamoDB falhar)

**Exemplo:**

```typescript
// src/shared/saga/Saga.ts
@Injectable()
export class Saga {
  private compensations: CompensationFn[] = [];

  addCompensation(fn: CompensationFn) {
    this.compensations.unshift(fn);  // LIFO: ultima entra, primeira executa
  }

  async run<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      await this.compensate();  // Executa todas as compensacoes
      throw error;
    }
  }
}

// SignUpUseCase.ts
return this.saga.run(async () => {
  // 1. Cria no Cognito
  const { externalId } = await this.authGateway.signUp({ ... });

  // 2. Registra compensacao: se algo falhar depois, deleta do Cognito
  this.saga.addCompensation(() => this.authGateway.deleteUser({ externalId }));

  // 3. Persiste no DynamoDB (se falhar aqui, Cognito user e deletado)
  await this.signUpUow.run({ account, goal, profile });

  return { accessToken, refreshToken };
});
```

**Beneficio:** Consistencia eventual entre sistemas distribuidos sem 2PC (two-phase commit).

---

### 2.4 Gateway Pattern

**O que e:** Encapsula a comunicacao com **servicos externos** (APIs, SDKs), traduzindo entre o dominio e o protocolo externo.

**Onde aparece:**
- `AuthGateway` → Cognito
- `MealsFileStorageGateway` → S3
- `MealsQueueGateway` → SQS
- `MealsAIGateway` → OpenAI

**Exemplo:**

```typescript
// src/infra/gateways/AuthGateway.ts
@Injectable()
export class AuthGateway {
  async signUp({ email, password, internalId }): Promise<{ externalId: string }> {
    const command = new SignUpCommand({
      ClientId: this.appConfig.auth.cognito.client.id,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: 'custom:internalId', Value: internalId }],
      SecretHash: this.getSecretHash(email),
    });
    const { UserSub } = await cognitoClient.send(command);
    return { externalId: UserSub };
  }

  // signIn, refreshToken, forgotPassword, deleteUser...
}
```

**Beneficio:** UseCase nao sabe detalhes do Cognito SDK. Trocar Cognito por Auth0? So muda o Gateway.

---

### 2.5 Adapter Pattern

**O que e:** Converte uma interface em outra que o cliente espera. "Tradutor" entre sistemas incompativeis.

**Onde aparece:**
- `lambdaHttpAdapter` — API Gateway Event → Controller
- `lambdaS3Adapter` — S3 Event → IFileEventHandler
- `lambdaSQSAdapter` — SQS Event → IQueueConsumer

**Exemplo:**

```typescript
// src/main/adapters/lambdaHttpAdapter.ts
export function lambdaHttpAdapter(controllerImpl: Constructor<Controller>) {
  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    // Adapta: AWS Event -> Request do dominio
    const controller = Registry.getInstance().resolve(controllerImpl);
    const body = lambdaBodyParser(event.body);
    const params = event.pathParameters ?? {};
    const queryParams = event.queryStringParameters ?? {};
    const accountId = event.requestContext.authorizer?.jwt.claims.internalId;

    // Executa
    const response = await controller.execute({ body, params, queryParams, accountId });

    // Adapta: Response do dominio -> AWS Response
    return {
      statusCode: response.statusCode,
      body: JSON.stringify(response.body),
    };
  };
}
```

**Beneficio:** Controllers nao sabem que estao em Lambda. Poderiam rodar em Express, Fastify, etc.

---

### 2.6 Data Mapper Pattern

**O que e:** Objeto que transfere dados entre **entidade de dominio** e **representacao de persistencia**, mantendo ambos independentes.

**Onde aparece:**
- `AccountItem`
- `ProfileItem`
- `GoalItem`
- `MealItem`

**Exemplo:**

```typescript
// src/infra/database/dynamo/items/MealItem.ts
export class MealItem {
  static fromEntity(meal: Meal): MealItem {
    return new MealItem({
      ...meal,
      createdAt: meal.createdAt.toISOString(),  // Date -> string
    });
  }

  static toEntity(item: MealItem.ItemType): Meal {
    return new Meal({
      ...item,
      createdAt: new Date(item.createdAt),  // string -> Date
    });
  }

  toItem(): MealItem.ItemType {
    return {
      ...this.keys,  // PK, SK, GSI1PK, GSI1SK
      ...this.attrs,
      type: 'Meal',
    };
  }
}
```

**Beneficio:** Entidade `Meal` nao sabe nada sobre PK/SK/GSI. Pode ser usada fora do DynamoDB.

---

### 2.7 Dependency Injection (IoC)

**O que e:** Dependencias sao **injetadas** no objeto ao inves de criadas por ele. Inversao de Controle.

**Onde aparece:**
- `Registry` (container DI custom)
- `@Injectable()` (registra classe)
- Todos os construtores com dependencias

**Exemplo:**

```typescript
// Registro automatico via decorator
@Injectable()
export class SignUpUseCase {
  constructor(
    private readonly authGateway: AuthGateway,        // Injetado
    private readonly accountRepository: AccountRepository,  // Injetado
    private readonly signUpUow: SignUpUnitOfWork,     // Injetado
    private readonly saga: Saga,                       // Injetado
  ) {}
}

// Resolucao no adapter
const controller = Registry.getInstance().resolve(SignUpController);
// Registry resolve recursivamente: SignUpController -> SignUpUseCase -> AuthGateway -> AppConfig...
```

**Beneficio:** Testabilidade (mock das dependencias), desacoplamento, configuracao centralizada.

---

### 2.8 Decorator Pattern

**O que e:** Adiciona comportamento a objetos dinamicamente, sem alterar a classe.

**Onde aparece:**
- `@Injectable()` — registra classe no container DI
- `@Schema()` — vincula schema Zod ao controller

**Exemplo:**

```typescript
// src/kernel/decorators/Injectable.ts
export function Injectable(): ClassDecorator {
  return (target) => {
    Registry.getInstance().register(target as Constructor);
  };
}

// src/kernel/decorators/Schema.ts
export function Schema(schema: z.ZodSchema): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(SCHEMA_METADATA_KEY, schema, target);
  };
}

// Uso
@Injectable()
@Schema(signUpSchema)
export class SignUpController extends Controller<'public', ...> { }
```

**Beneficio:** Metaprogramacao limpa. Adiciona DI e validacao sem poluir a logica do controller.

---

### 2.9 Singleton Pattern

**O que e:** Garante que uma classe tenha apenas **uma instancia** global.

**Onde aparece:**
- `Registry.getInstance()`
- Clients AWS (constantes de modulo)

**Exemplo:**

```typescript
// src/kernel/di/Registry.ts
export class Registry {
  private static instance: Registry | undefined;

  static getInstance() {
    if (!this.instance) {
      this.instance = new Registry();
    }
    return this.instance;
  }

  private constructor() {}  // Construtor privado
}

// src/infra/clients/dynamoClient.ts
export const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient());
// Constante de modulo = singleton no contexto do bundle
```

**Beneficio:** Reutiliza conexao/cliente, evita criar multiplas instancias desnecessarias.

---

### 2.10 Template Method Pattern

**O que e:** Define o **esqueleto** de um algoritmo na classe base, permitindo que subclasses redefinam passos especificos.

**Onde aparece:**
- `Controller` (classe abstrata)

**Exemplo:**

```typescript
// src/application/contracts/Controller.ts
export abstract class Controller<TType, TBody> {
  // Template method — define o fluxo
  public execute(request: Request<TType>): Promise<Response<TBody>> {
    const body = this.validateBody(request.body);  // Passo 1: valida
    return this.handle({ ...request, body });       // Passo 2: delega para subclasse
  }

  private validateBody(body) {
    const schema = getSchema(this);
    return schema ? schema.parse(body) : body;
  }

  // Metodo abstrato — subclasse implementa
  protected abstract handle(request: Request<TType>): Promise<Response<TBody>>;
}

// Subclasse so implementa handle()
export class SignUpController extends Controller<'public', ...> {
  protected override async handle({ body }) {
    // Logica especifica
  }
}
```

**Beneficio:** Validacao Zod e automatica para todos os controllers. Subclasse so foca na logica.

---

### 2.11 Factory Method Pattern

**O que e:** Define um metodo para **criar objetos**, permitindo que subclasses decidam qual classe instanciar.

**Onde aparece:**
- `*Item.fromEntity()` / `*Item.toEntity()`
- `MealsFileStorageGateway.generateInputFileKey()`

**Exemplo:**

```typescript
// MealItem.ts
static fromEntity(meal: Meal): MealItem {
  return new MealItem({ ...meal, createdAt: meal.createdAt.toISOString() });
}

// MealsFileStorageGateway.ts
static generateInputFileKey({ accountId, inputType }): string {
  const extension = inputType === Meal.InputType.AUDIO ? 'm4a' : 'jpeg';
  const filename = `${KSUID.randomSync().string}.${extension}`;
  return `${accountId}/${filename}`;
}
```

**Beneficio:** Centraliza logica de criacao. Mudou o formato do key? So muda em um lugar.

---

### 2.12 Strategy Pattern (implicito)

**O que e:** Define familia de algoritmos intercambiaveis.

**Onde aparece:**
- `MealsAIGateway.processMeal()` — escolhe estrategia baseado no `inputType`

**Exemplo:**

```typescript
// src/infra/ai/gateways/MealsAIGateway.ts
async processMeal(meal: Meal) {
  const mealFileURL = this.mealsFileStorageGateway.getFileURL(meal.inputFileKey);

  if (meal.inputType === Meal.InputType.PICTURE) {
    // Estrategia 1: Visao (envia imagem para GPT)
    return this.callAI({
      systemPrompt: getImagePrompt(),
      userMessageParts: [{ type: 'image_url', image_url: { url: mealFileURL } }],
    });
  }

  // Estrategia 2: Audio (transcreve + texto)
  const transcription = await this.transcribe(mealFileURL);
  return this.callAI({
    systemPrompt: getTextPrompt(),
    userMessageParts: `Meal: ${transcription}`,
  });
}
```

**Beneficio:** Adicionar novo tipo (ex: VIDEO) e so adicionar mais um `if`/estrategia.

---

## 3. Padroes de Dominio (DDD-lite)

### 3.1 Entity

**O que e:** Objeto com **identidade** (ID) que persiste ao longo do tempo. Dois objetos com mesmos atributos mas IDs diferentes sao entidades diferentes.

**Onde aparece:**
- `Account`, `Profile`, `Goal`, `Meal`

**Exemplo:**

```typescript
// src/application/entities/Meal.ts
export class Meal {
  readonly id: string;        // Identidade
  readonly accountId: string;
  status: Meal.Status;        // Estado mutavel
  // ...

  constructor(attr: Meal.Attributes) {
    this.id = attr.id ?? KSUID.randomSync().string;  // Gera ID se nao fornecido
    // ...
  }
}
```

**Caracteristicas:**
- ID gerado com KSUID (K-Sortable, ordenavel por tempo)
- Atributos mutaveis (status, foods, etc.)
- Ciclo de vida (criacao, atualizacao, estados)

---

### 3.2 Value Object (via Enums)

**O que e:** Objeto definido pelos seus **atributos**, sem identidade. Dois VOs com mesmos atributos sao iguais.

**Onde aparece:** Enums funcionam como Value Objects simples:
- `Meal.Status` (UPLOADING, QUEUED, PROCESSING, SUCCESS, FAILED)
- `Meal.InputType` (AUDIO, PICTURE)
- `Profile.Gender` (MALE, FEMALE)
- `Profile.Goal` (LOSE, MAINTAIN, GAIN)
- `Profile.ActivityLevel` (SEDENTARY, LIGHT, MODERATE, HEAVY, ATHLETE)

**Exemplo:**

```typescript
export namespace Meal {
  export enum Status {
    UPLOADING = 'UPLOADING',
    QUEUED = 'QUEUED',
    PROCESSING = 'PROCESSING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
  }
}

// Comparacao por valor, nao por referencia
if (meal.status === Meal.Status.SUCCESS) { ... }
```

---

### 3.3 Domain Service

**O que e:** Logica de dominio que **nao pertence naturalmente a nenhuma entidade**.

**Onde aparece:**
- `GoalCalculator`

**Exemplo:**

```typescript
// src/application/services/GoalCalculator.ts
export class GoalCalculator {
  static calculate(profile: Profile): CalculateGoalResult {
    // Calculo de BMR (Harris-Benedict)
    const bmr = profile.gender === Profile.Gender.MALE
      ? 88.36 + 13.4 * weight + 4.8 * height - 5.7 * age
      : 447.6 + 9.2 * weight + 3.1 * height - 4.3 * age;

    // TDEE = BMR * multiplicador de atividade
    const tdee = bmr * this.activityMultipliers[profile.activityLevel];

    // Ajuste por objetivo (+/- 500 kcal)
    // Distribuicao de macros...

    return { calories, proteins, carbohydrates, fats };
  }
}
```

**Por que nao esta em `Profile` ou `Goal`?** O calculo envolve dados de ambos e representa uma **politica de negocio**, nao estado de uma entidade.

---

### 3.4 Application Service (Use Case)

**O que e:** Orquestra **um fluxo de negocio** completo, coordenando entidades, repositorios e servicos externos.

**Onde aparece:**
- Todos os `*UseCase.ts`

**Caracteristicas:**
- Um metodo publico: `execute(input): Promise<output>`
- Coordena multiplos passos
- Nao contem regras de dominio "puras" (essas vao em Entity ou Domain Service)
- Pode usar Saga, Unit of Work, Gateways

---

## 4. Padroes de API e Integracao

### 4.1 Controller Pattern

**O que e:** Recebe requisicoes, delega para a camada de aplicacao, formata resposta.

**Onde aparece:**
- Todos os `*Controller.ts`

**Responsabilidades:**
1. Receber request HTTP (body, params, queryParams, accountId)
2. Validar entrada (via `@Schema`)
3. Delegar para UseCase ou Query
4. Formatar response (statusCode + body)

**Nao deve:** Conter logica de negocio, acessar banco diretamente, chamar outros controllers.

---

### 4.2 DTO Pattern

**O que e:** Objeto simples para **transferir dados** entre camadas, sem logica.

**Onde aparece:**
- `namespace Controller { type Request, type Response }`
- `namespace UseCase { type Input, type Output }`
- `namespace Query { type Input, type Output }`

**Exemplo:**

```typescript
export namespace SignUpUseCase {
  export type Input = {
    account: { email: string; password: string };
    profile: { name: string; birthDate: Date; ... };
  };

  export type Output = {
    accessToken: string;
    refreshToken: string;
  };
}
```

**Beneficio:** Contrato claro entre camadas. Mudou o shape? TypeScript avisa em compile time.

---

### 4.3 Schema Validation Pattern

**O que e:** Validar dados de entrada **declarativamente** usando schemas.

**Onde aparece:**
- Todos os schemas Zod em `controllers/*/schemas/`
- Decorator `@Schema()` no controller

**Exemplo:**

```typescript
// src/application/controllers/auth/schemas/signUpSchema.ts
export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  profile: z.object({
    name: z.string().min(1),
    birthDate: z.coerce.date(),
    gender: z.nativeEnum(Profile.Gender),
    // ...
  }),
});

export type SignUpBody = z.infer<typeof signUpSchema>;

// Controller
@Schema(signUpSchema)
export class SignUpController extends Controller<'public', ...> { }
```

**Beneficio:**
- Validacao automatica no `Controller.execute()`
- Tipos inferidos do schema (`z.infer`)
- Mensagens de erro padronizadas

---

### 4.4 Error Handling Pattern

**O que e:** Hierarquia de erros customizados mapeados para respostas HTTP.

**Onde aparece:**
- `src/application/errors/`
- `lambdaHttpAdapter` (trata erros)

**Hierarquia:**

```
Error (JS nativo)
├── ZodError (validacao) → 400 + VALIDATION
├── HttpError
│   ├── BadRequest → 400
│   └── Unauthorized → 401
└── ApplicationError
    ├── EmailAlreadyInUse → 400 + EMAIL_ALREADY_IN_USE
    ├── InvalidCredentials → 401 + INVALID_CREDENTIALS
    ├── InvalidRefreshToken → 401 + INVALID_REFRESH_TOKEN
    └── ResourceNotFound → 404 + RESOURCE_NOT_FOUND
```

**Exemplo de tratamento:**

```typescript
// lambdaHttpAdapter.ts
} catch (error) {
  if (error instanceof ZodError) {
    return lambdaErrorResponse({ statusCode: 400, code: ErrorCode.VALIDATION, ... });
  }
  if (error instanceof HttpError) {
    return lambdaErrorResponse(error);
  }
  if (error instanceof ApplicationError) {
    return lambdaErrorResponse({ statusCode: error.statusCode ?? 400, ... });
  }
  return lambdaErrorResponse({ statusCode: 500, code: 'INTERNAL_SERVER_ERROR' });
}
```

---

### 4.5 Presigned URL Pattern

**O que e:** Gerar credenciais **temporarias e restritas** para upload/download direto no storage.

**Onde aparece:**
- `MealsFileStorageGateway.createPOST()`

**Fluxo:**

```
1. Client chama POST /meals
2. API gera presigned POST com restricoes:
   - Bucket/Key exatos
   - Content-Type exato
   - Tamanho exato
   - Metadados obrigatorios
3. API retorna uploadSignature (base64 do {url, fields})
4. Client faz POST direto para S3 com os fields
5. S3 valida e aceita (ou rejeita)
```

**Beneficio:** Arquivo nunca passa pela Lambda. Economiza tempo de execucao, memoria e custo.

---

## 5. Padroes de Infraestrutura AWS

### 5.1 Dead Letter Queue (DLQ)

**O que e:** Fila que recebe mensagens que **falharam** repetidamente no processamento.

**Onde aparece:**
- `MealsDLQ` (recebe de `MealsQueue` apos 2 falhas)
- `MealsDLQAlarm` (CloudWatch) → `DLQAlarmsTopic` (SNS email)

**Beneficio:** Mensagens problematicas nao sao perdidas. Podem ser analisadas e reprocessadas manualmente.

---

### 5.2 Origin Access Control (OAC)

**O que e:** Bucket S3 **privado** que so pode ser acessado pelo CloudFront.

**Onde aparece:**
- `MealsCDNOAC` + `MealsBucketCDNPolicy`

**Beneficio:** Todas as requisicoes passam pelo CDN (cache, HTTPS, metricas). Ninguem acessa o bucket diretamente.

---

### 5.3 JWT Custom Claims

**O que e:** Adicionar claims customizados ao token JWT durante a geracao.

**Onde aparece:**
- Cognito `PreTokenGeneration` trigger → adiciona `internalId`

**Exemplo:**

```typescript
// preTokenGenerationTrigger.ts
export const handler: PreTokenGenerationV2TriggerHandler = async (event) => {
  const internalId = event.request.userAttributes['custom:internalId'];

  event.response.claimsAndScopeOverrideDetails = {
    accessTokenGeneration: {
      claimsToAddOrOverride: { internalId },
    },
  };

  return event;
};
```

**Beneficio:** API extrai `accountId` do token JWT sem precisar consultar banco em cada request.

---

## 6. Resumo Visual

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PADROES NO FOODIARY-API                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ARQUITETURAIS           DESIGN (GoF)           DOMINIO (DDD)       │
│  ─────────────           ────────────           ─────────────       │
│  • Clean/Hexagonal       • Repository           • Entity            │
│  • CQRS                  • Unit of Work         • Value Object      │
│  • Event-Driven          • Saga                 • Domain Service    │
│  • Serverless/FaaS       • Gateway              • Application Svc   │
│  • Single Table Design   • Adapter                                  │
│                          • Data Mapper          API/INTEGRACAO      │
│                          • DI/IoC               ──────────────      │
│  INFRAESTRUTURA AWS      • Decorator            • Controller        │
│  ──────────────────      • Singleton            • DTO               │
│  • Dead Letter Queue     • Template Method      • Schema Validation │
│  • Origin Access Ctrl    • Factory Method       • Error Handling    │
│  • JWT Custom Claims     • Strategy             • Presigned URL     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Referencias para Estudo

| Padrao | Onde aprender mais |
|--------|-------------------|
| Clean Architecture | "Clean Architecture" - Robert C. Martin |
| CQRS | Martin Fowler (martinfowler.com/bliki/CQRS.html) |
| Repository | "Patterns of Enterprise Application Architecture" - Martin Fowler |
| Unit of Work | "Patterns of Enterprise Application Architecture" - Martin Fowler |
| Saga | "Microservices Patterns" - Chris Richardson |
| DDD | "Domain-Driven Design" - Eric Evans |
| GoF Patterns | "Design Patterns" - Gang of Four |
| Single Table Design | Alex DeBrie (dynamodbbook.com) |
