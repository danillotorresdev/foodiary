# Foodiary API - Arquitetura Detalhada

## Indice

- [1. Visao Geral](#1-visao-geral)
- [2. Stack Tecnologica](#2-stack-tecnologica)
- [3. Estrutura de Pastas](#3-estrutura-de-pastas)
- [4. Camadas da Arquitetura](#4-camadas-da-arquitetura)
  - [4.1 Kernel (Nucleo)](#41-kernel-nucleo)
  - [4.2 Shared (Compartilhado)](#42-shared-compartilhado)
  - [4.3 Application (Aplicacao)](#43-application-aplicacao)
  - [4.4 Infra (Infraestrutura)](#44-infra-infraestrutura)
  - [4.5 Main (Ponto de Entrada)](#45-main-ponto-de-entrada)
- [5. Infraestrutura AWS (CloudFormation via Serverless)](#5-infraestrutura-aws-cloudformation-via-serverless)
  - [5.1 DynamoDB - Single Table Design](#51-dynamodb---single-table-design)
  - [5.2 Cognito - Autenticacao](#52-cognito---autenticacao)
  - [5.3 S3 + CloudFront - Storage de Arquivos](#53-s3--cloudfront---storage-de-arquivos)
  - [5.4 SQS - Fila de Processamento](#54-sqs---fila-de-processamento)
  - [5.5 SNS + CloudWatch - Monitoramento](#55-sns--cloudwatch---monitoramento)
  - [5.6 API Gateway + Custom Domain](#56-api-gateway--custom-domain)
- [6. Fluxos Principais](#6-fluxos-principais)
  - [6.1 Sign Up (Cadastro)](#61-sign-up-cadastro)
  - [6.2 Criacao e Processamento de Refeicao](#62-criacao-e-processamento-de-refeicao)
- [7. Sistema de Injecao de Dependencias](#7-sistema-de-injecao-de-dependencias)
- [8. Tratamento de Erros](#8-tratamento-de-erros)
- [9. Mapa Completo de Rotas HTTP](#9-mapa-completo-de-rotas-http)
- [10. Diagrama de Dependencia entre Camadas](#10-diagrama-de-dependencia-entre-camadas)
- [11. Conceitos de Backend e Infra para Revisao](#11-conceitos-de-backend-e-infra-para-revisao)

---

## 1. Visao Geral

O **Foodiary API** e um backend serverless construido com **Serverless Framework** + **AWS Lambda** + **TypeScript**. Ele fornece uma API REST para um app de diario alimentar onde o usuario pode:

- Criar conta e autenticar-se
- Configurar perfil fisico (peso, altura, genero, etc.)
- Ter metas nutricionais calculadas automaticamente (calorias, proteinas, carboidratos, gorduras)
- Registrar refeicoes enviando **foto** ou **audio**, que sao processados por **IA (OpenAI)** para extrair os alimentos e informacoes nutricionais

A arquitetura segue um estilo **Clean Architecture / Hexagonal**, com separacao clara entre:
- Logica de negocio (application)
- Detalhes de infraestrutura (infra)
- Pontos de entrada (main)
- Nucleo do framework (kernel)

---

## 2. Stack Tecnologica

| Categoria | Tecnologia |
|-----------|-----------|
| Linguagem | TypeScript (strict mode, decorators experimentais) |
| Runtime | Node.js 24.x (AWS Lambda) |
| Framework | Serverless Framework v4 |
| Banco de dados | Amazon DynamoDB (single table design) |
| Autenticacao | Amazon Cognito (User Pool + JWT) |
| Storage | Amazon S3 + CloudFront CDN |
| Fila | Amazon SQS (com DLQ) |
| IA | OpenAI API (GPT-4.1-mini para visao/texto, GPT-4o-mini-transcribe para audio) |
| Validacao | Zod |
| Build | esbuild (via Serverless Framework) |
| IDs | KSUID (K-Sortable Unique Identifiers) |
| Injecao de Dependencias | Custom (reflect-metadata + decorators) |
| Emails | React Email (templates em JSX/TSX) |
| Package manager | pnpm |

---

## 3. Estrutura de Pastas

```
foodiary-api/
├── serverless.yml              # Configuracao principal do Serverless Framework
├── esbuild.config.mjs          # Config de build (esbuild + decorators)
├── tsconfig.json               # Config TypeScript com path aliases
├── package.json                # Dependencias
├── .env.example                # Variaveis de ambiente necessarias
│
├── sls/                        # Configuracao Serverless (modular)
│   ├── config/
│   │   ├── env.yml             # Variaveis de ambiente (refs CloudFormation)
│   │   └── role.yml            # Permissoes IAM das Lambdas
│   ├── functions/              # Definicoes das Lambda functions
│   │   ├── auth.yml            # Rotas de autenticacao + triggers Cognito
│   │   ├── meals.yml           # Rotas de refeicoes + S3 event + SQS consumer
│   │   ├── accounts.yml        # Rota GET /me
│   │   ├── profiles.yml        # Rota PUT /profiles
│   │   └── goals.yml           # Rota PUT /goals
│   └── resources/              # Recursos AWS (CloudFormation)
│       ├── MainTable.yml       # DynamoDB
│       ├── UserPool.yml        # Cognito User Pool + Client
│       ├── MealsBucket.yml     # S3 Bucket
│       ├── MealsBucketCDN.yml  # CloudFront + OAC + Route53
│       ├── MealsQueue.yml      # SQS Queue + DLQ + CloudWatch Alarm
│       ├── DLQAlarmsTopic.yml  # SNS Topic para alertas
│       └── APIGWCustomDomain.yml # Custom domain do API Gateway
│
├── src/
│   ├── kernel/                 # Nucleo: DI container + Decorators
│   │   ├── di/
│   │   │   └── Registry.ts     # Container de DI (singleton)
│   │   └── decorators/
│   │       ├── Injectable.ts   # @Injectable() - registra classe no container
│   │       └── Schema.ts       # @Schema() - vincula Zod schema a controller
│   │
│   ├── shared/                 # Codigo compartilhado entre camadas
│   │   ├── config/
│   │   │   ├── env.ts          # Validacao das env vars com Zod
│   │   │   └── AppConfig.ts    # Classe @Injectable com configs tipadas
│   │   ├── saga/
│   │   │   └── Saga.ts         # Padrao Saga para compensacao
│   │   ├── types/
│   │   │   └── Constructor.ts  # Tipo utilitario
│   │   └── utils/
│   │       ├── mbToBytes.ts
│   │       └── minutesToSeconds.ts
│   │
│   ├── application/            # Logica de negocio
│   │   ├── contracts/          # Interfaces/classes abstratas
│   │   │   ├── Controller.ts   # Classe base de controller HTTP
│   │   │   ├── IFileEventHandler.ts  # Interface para eventos S3
│   │   │   └── IQueueConsumer.ts     # Interface para consumidores SQS
│   │   ├── entities/           # Entidades de dominio
│   │   │   ├── Account.ts
│   │   │   ├── Profile.ts
│   │   │   ├── Goal.ts
│   │   │   └── Meal.ts
│   │   ├── usecases/           # Casos de uso (logica de negocio)
│   │   │   ├── auth/           # SignUp, SignIn, RefreshToken, ForgotPassword, ConfirmForgotPassword
│   │   │   ├── meals/          # CreateMeal, MealUploaded, ProcessMeal, GetMealById
│   │   │   ├── profiles/       # UpdateProfile
│   │   │   └── goals/          # UpdateGoal
│   │   ├── controllers/        # Controllers HTTP (recebem request, delegam para usecases)
│   │   │   ├── auth/           # + schemas/ (Zod)
│   │   │   ├── meals/          # + schemas/ (Zod)
│   │   │   ├── accounts/
│   │   │   ├── profiles/       # + schemas/ (Zod)
│   │   │   └── goals/          # + schemas/ (Zod)
│   │   ├── query/              # Queries diretas ao banco (read-optimized)
│   │   │   ├── GetProfileAndGoalQuery.ts
│   │   │   └── ListMealsByDayQuery.ts
│   │   ├── queues/             # Consumidores de fila
│   │   │   └── MealsQueueConsumer.ts
│   │   ├── events/             # Handlers de eventos (S3)
│   │   │   └── files/MealUploadedFileEventHandler.ts
│   │   ├── services/           # Servicos de dominio
│   │   │   └── GoalCalculator.ts
│   │   └── errors/             # Erros customizados
│   │       ├── ErrorCode.ts
│   │       ├── http/           # HttpError, BadRequest, Unauthorized
│   │       └── application/    # ApplicationError, EmailAlreadyInUse, InvalidCredentials, etc.
│   │
│   ├── infra/                  # Implementacoes de infraestrutura
│   │   ├── clients/            # Clientes AWS SDK (singleton)
│   │   │   ├── cognitoClient.ts
│   │   │   ├── dynamoClient.ts
│   │   │   ├── s3Client.ts
│   │   │   └── sqsClient.ts
│   │   ├── database/dynamo/
│   │   │   ├── items/          # Mapeamento Entity <-> DynamoDB Item
│   │   │   │   ├── AccountItem.ts
│   │   │   │   ├── ProfileItem.ts
│   │   │   │   ├── GoalItem.ts
│   │   │   │   └── MealItem.ts
│   │   │   ├── repositories/   # Operacoes CRUD no DynamoDB
│   │   │   │   ├── AccountRepository.ts
│   │   │   │   ├── ProfileRepository.ts
│   │   │   │   ├── GoalRepository.ts
│   │   │   │   └── MealRepository.ts
│   │   │   └── uow/            # Unit of Work (transacoes DynamoDB)
│   │   │       ├── UnitOfWork.ts
│   │   │       └── SignUpUnitOfWork.ts
│   │   ├── gateways/           # Integracao com servicos externos
│   │   │   ├── AuthGateway.ts          # Cognito operations
│   │   │   ├── MealsFileStorageGateway.ts  # S3 presigned POST + metadata
│   │   │   └── MealsQueueGateway.ts    # SQS publish
│   │   ├── ai/                 # Integracao com OpenAI
│   │   │   ├── gateways/MealsAIGateway.ts
│   │   │   └── prompts/
│   │   │       ├── getImagePrompt.ts
│   │   │       └── getTextPrompt.ts
│   │   └── emails/             # Templates de email (React Email)
│   │       ├── components/TailwindConfig.tsx
│   │       └── templates/auth/ForgotPassword.tsx
│   │
│   ├── main/                   # Ponto de entrada (Lambda handlers)
│   │   ├── adapters/           # Adaptadores Lambda <-> Application
│   │   │   ├── lambdaHttpAdapter.ts    # API Gateway v2 -> Controller
│   │   │   ├── lambdaS3Adapter.ts      # S3 Event -> IFileEventHandler
│   │   │   └── lambdaSQSAdapter.ts     # SQS Event -> IQueueConsumer
│   │   ├── functions/          # Entrypoints das Lambdas
│   │   │   ├── auth/
│   │   │   │   ├── signUp.ts
│   │   │   │   ├── signIn.ts
│   │   │   │   ├── refreshToken.ts
│   │   │   │   ├── forgotPassword.ts
│   │   │   │   ├── confirmForgotPassword.ts
│   │   │   │   └── cognito/    # Triggers do Cognito
│   │   │   │       ├── preSignUpTrigger.ts
│   │   │   │       ├── preTokenGenerationTrigger.ts
│   │   │   │       └── customMessageTrigger.ts
│   │   │   ├── meals/
│   │   │   │   ├── createMeal.ts
│   │   │   │   ├── listMealsByDay.ts
│   │   │   │   ├── getMealById.ts
│   │   │   │   ├── onMealFileUploaded.ts   # Trigger S3
│   │   │   │   └── processMeal.ts          # Consumer SQS
│   │   │   ├── accounts/getMe.ts
│   │   │   ├── profiles/updateProfile.ts
│   │   │   └── goals/updateGoal.ts
│   │   └── utils/
│   │       ├── lambdaBodyParser.ts
│   │       └── lambdaErrorResponse.ts
│   │
│   └── utils/
│       └── downloadFileFromURL.ts
│
└── scripts/                    # Scripts utilitarios para desenvolvimento
    ├── ai.ts
    └── createMeal.ts
```

---

## 4. Camadas da Arquitetura

### 4.1 Kernel (Nucleo)

O kernel e o **motor do framework custom** do projeto. Ele implementa dois conceitos fundamentais:

#### Registry (Container de Injecao de Dependencias)

```typescript
// src/kernel/di/Registry.ts
export class Registry {
  private static instance: Registry | undefined;  // Singleton
  private readonly providers = new Map<string, Registry.Provider>();

  register(impl: Constructor) {
    const token = impl.name;
    const deps = Reflect.getMetadata('design:paramtypes', impl) ?? [];
    this.providers.set(token, { impl, deps });
  }

  resolve<TImpl extends Constructor>(impl: TImpl): InstanceType<TImpl> {
    const provider = this.providers.get(impl.name);
    const deps = provider.deps.map(dep => this.resolve(dep));  // Resolve recursivo
    return new provider.impl(...deps);
  }
}
```

**Como funciona:**
1. Quando uma classe e decorada com `@Injectable()`, ela e registrada no `Registry`
2. O `reflect-metadata` captura automaticamente os tipos dos parametros do construtor (`design:paramtypes`)
3. Quando `resolve()` e chamado, ele resolve recursivamente todas as dependencias

#### Decorator `@Injectable()`

```typescript
export function Injectable(): ClassDecorator {
  return (target) => {
    Registry.getInstance().register(target as unknown as Constructor);
  };
}
```

Toda classe que precisa participar do sistema de DI deve usar `@Injectable()`.

#### Decorator `@Schema()`

```typescript
export function Schema(schema: z.ZodSchema): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(SCHEMA_METADATA_KEY, schema, target);
  };
}
```

Vincula um schema Zod a um controller. O controller base (`Controller.execute()`) usa `getSchema()` para validar o body automaticamente antes de chamar `handle()`.

---

### 4.2 Shared (Compartilhado)

Contem codigo que e utilizado por todas as camadas:

#### AppConfig

Classe `@Injectable` que centraliza todas as configuracoes da aplicacao. As env vars sao validadas com Zod no `env.ts` e depois organizadas em um objeto tipado:

```typescript
@Injectable()
export class AppConfig {
  readonly auth: AppConfig.Auth;      // Cognito client ID, secret, pool ID
  readonly db: AppConfig.Database;    // Nome da tabela DynamoDB
  readonly storage: AppConfig.Storage; // Nome do bucket S3
  readonly cdns: AppConfig.CDNs;      // Dominio do CloudFront
  readonly queues: AppConfig.Queues;  // URL da fila SQS
}
```

Qualquer classe que precisar de configuracao recebe `AppConfig` via DI no construtor.

#### Saga

Implementacao do **padrao Saga** para compensacao de operacoes distribuidas:

```typescript
@Injectable()
export class Saga {
  private compensations: CompensationFn[] = [];

  addCompensation(fn: CompensationFn) {
    this.compensations.unshift(fn);  // LIFO - ultima compensacao e executada primeiro
  }

  async run<TResult>(fn: () => Promise<TResult>) {
    try {
      return await fn();
    } catch (error) {
      await this.compensate();  // Em caso de erro, executa todas as compensacoes
      throw error;
    }
  }
}
```

Usado no `SignUpUseCase`: se o cadastro no DynamoDB falhar apos criar usuario no Cognito, a saga deleta o usuario no Cognito automaticamente.

---

### 4.3 Application (Aplicacao)

A camada de aplicacao contem **toda a logica de negocio** sem depender de detalhes de infraestrutura (exceto as Queries, que acessam DynamoDB diretamente por serem otimizacoes de leitura).

#### 4.3.1 Entities (Entidades de Dominio)

As entidades representam os objetos de negocio. Cada uma gera seu proprio ID usando **KSUID**:

| Entidade | Campos principais | Observacoes |
|----------|-------------------|------------|
| **Account** | id, email, externalId (Cognito sub), createdAt | `externalId` e preenchido apos signup no Cognito |
| **Profile** | accountId, name, birthDate, gender, height, weight, activityLevel, goal | Enums: Gender (MALE/FEMALE), Goal (LOSE/MAINTAIN/GAIN), ActivityLevel (SEDENTARY a ATHLETE) |
| **Goal** | accountId, calories, proteins, carbohydrates, fats | Calculado automaticamente pelo GoalCalculator |
| **Meal** | id, accountId, status, attempts, inputType, inputFileKey, name, icon, foods[] | Status: UPLOADING -> QUEUED -> PROCESSING -> SUCCESS/FAILED |

A entidade `Meal` tem uma **maquina de estados** implicita:

```
UPLOADING  -->  QUEUED  -->  PROCESSING  -->  SUCCESS
                                |
                                v
                             FAILED (apos MAX_ATTEMPTS = 2)
                                ^
                                |
                            QUEUED (retry)
```

#### 4.3.2 Controllers

Controllers sao classes que:
1. Estendem `Controller<TRouteType, TResponseBody>`
2. Recebem um `Request` tipado (com `accountId` para rotas privadas, `null` para publicas)
3. Retornam um `Response` com `statusCode` e `body`

```typescript
// Exemplo: CreateMealController
@Injectable()
@Schema(createMealSchema)
export class CreateMealController extends Controller<'private', CreateMealController.Response> {
  constructor(private readonly createMealUseCase: CreateMealUseCase) {
    super();
  }

  protected override async handle({
    body, accountId,
  }: Controller.Request<'private', CreateMealBody>): Promise<Controller.Response<...>> {
    const result = await this.createMealUseCase.execute({
      accountId,
      file: { inputType: body.inputType, size: body.fileSize },
    });
    return { statusCode: 201, body: result };
  }
}
```

O tipo generico `'private'` | `'public'` garante em **compile time** que:
- Rotas privadas sempre tem `accountId: string`
- Rotas publicas sempre tem `accountId: null`

#### 4.3.3 Use Cases

Cada use case encapsula **uma operacao de negocio**:

| Use Case | O que faz |
|----------|-----------|
| `SignUpUseCase` | Verifica email unico, cria Account/Profile/Goal, registra no Cognito, usa Saga para compensacao, retorna tokens |
| `SignInUseCase` | Delega para AuthGateway.signIn() |
| `RefreshTokenUseCase` | Delega para AuthGateway.refreshToken() |
| `ForgotPasswordUseCase` | Delega para AuthGateway.forgotPassword() |
| `ConfirmForgotPasswordUseCase` | Delega para AuthGateway.confirmForgotPassword() |
| `CreateMealUseCase` | Cria entidade Meal (status UPLOADING), gera presigned POST para S3 |
| `MealUploadedUseCase` | Ao receber evento S3, muda status para QUEUED e publica na fila SQS |
| `ProcessMealUseCase` | Consome da fila, envia para OpenAI (visao ou transcricao+texto), salva resultado |
| `GetMealByIdUseCase` | Busca meal por ID |
| `UpdateProfileUseCase` | Atualiza perfil do usuario |
| `UpdateGoalUseCase` | Atualiza metas nutricionais |

#### 4.3.4 Queries

Queries sao **operacoes de leitura otimizadas** que acessam o DynamoDB diretamente (sem passar por repository/entity):

- **GetProfileAndGoalQuery**: Busca Profile + Goal em uma unica query no DynamoDB (usando `begins_with` na SK)
- **ListMealsByDayQuery**: Lista refeicoes de um dia usando GSI1 (filtro por data + status SUCCESS)

#### 4.3.5 Servico GoalCalculator

Calcula metas nutricionais baseado no perfil do usuario:

1. Calcula **BMR** (Basal Metabolic Rate) usando a formula de Harris-Benedict
2. Aplica multiplicador de **nivel de atividade** para obter o **TDEE** (Total Daily Energy Expenditure)
3. Ajusta +/- 500 calorias conforme o objetivo (ganhar/perder/manter)
4. Distribui macronutrientes:
   - **Proteinas**: 2.0-2.2g por kg de peso
   - **Gorduras**: 0.8-1.0g por kg de peso
   - **Carboidratos**: calorias restantes / 4

#### 4.3.6 Erros

Hierarquia de erros:

```
HttpError (statusCode + code + message)
├── BadRequest (400)
└── Unauthorized (401)

ApplicationError (code + message + statusCode opcional)
├── EmailAlreadyInUse
├── InvalidCredentials
├── InvalidRefreshToken
└── ResourceNotFound
```

O `lambdaHttpAdapter` trata cada tipo de erro de forma diferente na resposta HTTP.

---

### 4.4 Infra (Infraestrutura)

Contem todas as implementacoes especificas de servicos AWS e externos.

#### 4.4.1 Clients AWS

Instancias singleton dos clientes AWS SDK v3:
- `cognitoClient` - CognitoIdentityProviderClient
- `dynamoClient` - DynamoDBDocumentClient (wrapper do DynamoDBClient)
- `s3Client` - S3Client
- `sqsClient` - SQSClient

#### 4.4.2 Items (Mapeamento DynamoDB)

Cada `*Item` e responsavel por converter entre **entidade de dominio** e **item do DynamoDB**:

```typescript
// Exemplo: AccountItem
class AccountItem {
  static readonly type = 'Account';

  // Gera as chaves (PK, SK, GSI1PK, GSI1SK)
  constructor(private readonly attrs: AccountItem.Attributes) {
    this.keys = {
      PK: `ACCOUNT#${attrs.id}`,
      SK: `ACCOUNT#${attrs.id}`,
      GSI1PK: `ACCOUNT#${attrs.email}`,
      GSI1SK: `ACCOUNT#${attrs.email}`,
    };
  }

  toItem()      // -> Item DynamoDB completo (keys + attrs + type)
  static fromEntity(account: Account)  // Entity -> Item
  static toEntity(item: ItemType)      // Item -> Entity
}
```

**Padrao de chaves por entidade:**

| Entidade | PK | SK | GSI1PK | GSI1SK |
|----------|----|----|--------|--------|
| Account | `ACCOUNT#{id}` | `ACCOUNT#{id}` | `ACCOUNT#{email}` | `ACCOUNT#{email}` |
| Profile | `ACCOUNT#{accountId}` | `ACCOUNT#{accountId}#PROFILE` | - | - |
| Goal | `ACCOUNT#{accountId}` | `ACCOUNT#{accountId}#GOAL` | - | - |
| Meal | `ACCOUNT#{accountId}#MEAL#{mealId}` | `ACCOUNT#{accountId}#MEAL#{mealId}` | `MEALS#{accountId}#YYYY-MM-DD` | `MEAL#{mealId}` |

Esse design permite:
- **Buscar Account por email** via GSI1
- **Buscar Profile + Goal juntos** usando `PK = ACCOUNT#{id}` e `begins_with(SK, 'ACCOUNT#{id}#')`
- **Listar meals por dia** via GSI1 usando `GSI1PK = MEALS#{accountId}#2026-04-03`

#### 4.4.3 Repositories

Cada repository encapsula operacoes CRUD para uma entidade:

| Repository | Metodos |
|-----------|---------|
| AccountRepository | `findByEmail(email)`, `create(account)`, `getPutCommandInput(account)` |
| ProfileRepository | `findByAccountId(id)`, `save(profile)`, `create(profile)`, `getPutCommandInput(profile)` |
| GoalRepository | `findByAccountId(id)`, `save(goal)`, `create(goal)`, `getPutCommandInput(goal)` |
| MealRepository | `findById({mealId, accountId})`, `save(meal)`, `create(meal)`, `getPutCommandInput(meal)` |

O metodo `getPutCommandInput()` existe para suportar o **Unit of Work** (transacoes DynamoDB).

#### 4.4.4 Unit of Work

Implementacao do padrao **Unit of Work** para transacoes DynamoDB (`TransactWriteCommand`):

```typescript
// UnitOfWork base
export abstract class UnitOfWork {
  private transactItems: TransactWriteCommandInput['TransactItems'] = [];

  protected addPut(putInput: PutCommandInput) {
    this.transactItems.push({ Put: putInput });
  }

  protected async commit() {
    await dynamoClient.send(new TransactWriteCommand({ TransactItems: this.transactItems }));
  }
}

// SignUpUnitOfWork - Cria Account + Profile + Goal atomicamente
export class SignUpUnitOfWork extends UnitOfWork {
  async run({ account, goal, profile }) {
    this.addPut(this.accountRepository.getPutCommandInput(account));
    this.addPut(this.profileRepository.getPutCommandInput(profile));
    this.addPut(this.goalRepository.getPutCommandInput(goal));
    await this.commit();  // Tudo ou nada
  }
}
```

#### 4.4.5 Gateways

| Gateway | Responsabilidade |
|---------|-----------------|
| **AuthGateway** | Todas as operacoes do Cognito: signUp, signIn, refreshToken, forgotPassword, confirmForgotPassword, deleteUser. Gera `SECRET_HASH` usando HMAC-SHA256. |
| **MealsFileStorageGateway** | Gera `inputFileKey` (KSUID + extensao), cria presigned POST para upload no S3, busca metadata do arquivo (accountId, mealId), monta URL via CDN. |
| **MealsQueueGateway** | Publica mensagem na fila SQS (SendMessageCommand). |

#### 4.4.6 AI Gateway (OpenAI)

O `MealsAIGateway` e o coracao do processamento de refeicoes:

**Para PICTURE (foto):**
1. Monta URL do arquivo via CDN
2. Envia para `gpt-4.1-mini` com prompt de visao + imagem
3. Usa `zodResponseFormat` para garantir que a resposta segue o schema esperado

**Para AUDIO:**
1. Baixa arquivo de audio do CDN
2. Transcreve com `gpt-4o-mini-transcribe`
3. Envia transcricao para `gpt-4.1-mini` com prompt de texto
4. Valida resposta com Zod

Os prompts instruem a IA a:
- Identificar alimentos na imagem/texto
- Estimar quantidades em gramas
- Calcular calorias e macronutrientes
- Definir nome e icone da refeicao baseado no horario
- Responder sempre em portugues brasileiro

#### 4.4.7 Emails

Templates de email usando **React Email** (JSX):
- `ForgotPassword.tsx` - Email de recuperacao de senha com codigo de verificacao
- `TailwindConfig.tsx` - Componente wrapper com configuracao do Tailwind

---

### 4.5 Main (Ponto de Entrada)

A camada `main` e a "cola" entre a AWS Lambda e a camada de aplicacao.

#### 4.5.1 Adapters

Tres adapters que convertem eventos AWS em formato consumivel pela aplicacao:

**lambdaHttpAdapter** (API Gateway HTTP v2 -> Controller):
```
1. Recebe evento do API Gateway v2
2. Resolve o controller via Registry.resolve()
3. Extrai: body (JSON parse), pathParameters, queryStringParameters
4. Extrai accountId do JWT (claim 'internalId') se autenticado
5. Chama controller.execute({ body, params, queryParams, accountId })
6. Trata erros: ZodError -> 400, HttpError -> statusCode, ApplicationError -> 400, outros -> 500
7. Retorna { statusCode, body: JSON.stringify(response.body) }
```

**lambdaS3Adapter** (S3 Event -> IFileEventHandler):
```
1. Recebe evento S3 (multiplos Records)
2. Resolve o handler via Registry.resolve()
3. Processa todos os records em paralelo (Promise.allSettled)
4. Loga erros mas nao relanca (para nao reprocessar records que tiveram sucesso)
```

**lambdaSQSAdapter** (SQS Event -> IQueueConsumer):
```
1. Recebe evento SQS (multiplos Records)
2. Resolve o consumer via Registry.resolve()
3. Faz JSON.parse de cada record.body
4. Processa todos em paralelo (Promise.all) - falha relanca para retry via SQS
```

#### 4.5.2 Functions (Lambda Handlers)

Cada arquivo em `functions/` e um entrypoint de Lambda. O padrao e sempre:

```typescript
import 'reflect-metadata';  // Necessario para o sistema de DI (decorators)
import { lambdaHttpAdapter } from '@main/adapters/lambdaHttpAdapter';
import { SomeController } from '@application/controllers/...';

export const handler = lambdaHttpAdapter(SomeController);
```

**Triggers do Cognito** sao diferentes pois nao usam os adapters:

- **preSignUpTrigger**: Auto-confirma usuario e email (pula fluxo de verificacao)
- **preTokenGenerationTrigger**: Adiciona `custom:internalId` como claim `internalId` no access token
- **customMessageTrigger**: Renderiza email HTML customizado para forgot password usando React Email

---

## 5. Infraestrutura AWS (CloudFormation via Serverless)

### 5.1 DynamoDB - Single Table Design

Uma unica tabela (`MainTable`) armazena TODAS as entidades:

```yaml
KeySchema:
  PK (HASH) + SK (RANGE)

GlobalSecondaryIndexes:
  GSI1: GSI1PK (HASH) + GSI1SK (RANGE)
    Projection: ALL

BillingMode: PAY_PER_REQUEST        # Sem provisionar capacidade
DeletionProtectionEnabled: true      # Protecao contra delete acidental
PointInTimeRecoveryEnabled: true     # Backup continuo por 35 dias
```

**Por que Single Table Design?**
- Uma unica query pode retornar entidades de tipos diferentes (ex: Profile + Goal)
- Menor custo (uma unica tabela vs varias)
- Transacoes atomicas entre entidades (TransactWriteCommand)

### 5.2 Cognito - Autenticacao

```yaml
UserPool:
  UsernameAttributes: [email]        # Login por email
  MfaConfiguration: OFF
  Schema:
    - Name: internalId               # Atributo custom (id interno no DynamoDB)
      Mutable: false
  LambdaConfig:
    PreTokenGenerationConfig:
      LambdaVersion: V2_0            # Permite modificar access token claims
  EmailConfiguration:
    EmailSendingAccount: DEVELOPER   # Usa SES para emails customizados

UserPoolClient:
  GenerateSecret: true               # Client confidencial (SECRET_HASH necessario)
  ExplicitAuthFlows:
    - ALLOW_USER_PASSWORD_AUTH       # Fluxo com email + senha
  AccessTokenValidity: 12 hours
  RefreshTokenRotation:
    Feature: ENABLED                 # Refresh tokens sao rotacionados a cada uso
    RetryGracePeriodSeconds: 0       # Sem periodo de graca (token antigo invalido imediatamente)
```

**Fluxo de autenticacao:**
1. SignUp: API cria usuario no Cognito com `custom:internalId`
2. preSignUpTrigger: Auto-confirma (sem email de verificacao)
3. SignIn: API chama `InitiateAuthCommand` com `USER_PASSWORD_AUTH` + `SECRET_HASH`
4. Tokens: O access token JWT inclui `internalId` (adicionado pelo `preTokenGenerationTrigger`)
5. API Gateway: JWT authorizer valida o token e disponibiliza claims para a Lambda

**JWT Authorizer no API Gateway HTTP v2:**
```yaml
authorizers:
  CognitoAuthorizer:
    type: jwt
    identitySource: $request.header.Authorization
    issuerUrl: !GetAtt UserPool.ProviderURL
    audience: [!Ref UserPoolClient]
```

### 5.3 S3 + CloudFront - Storage de Arquivos

```
MealsBucket (S3)
  └── {accountId}/{ksuid}.{jpeg|m4a}     # Fotos e audios de refeicoes

MealsBucketCDN (CloudFront)
  └── OAC (Origin Access Control)         # S3 so aceita requests do CloudFront
  └── Custom domain opcional (via .env)
  └── HTTP/2 + HTTP/3
  └── Auto-compress
  └── Redirect HTTP -> HTTPS
```

**Fluxo de upload (Presigned POST):**
1. App mobile chama `POST /meals` com tipo (AUDIO/PICTURE) e tamanho do arquivo
2. API cria Meal no DynamoDB (status UPLOADING) e gera presigned POST para S3
3. O presigned POST e retornado como `uploadSignature` (base64 com url + fields)
4. App mobile faz POST diretamente para o S3 com os campos do presigned POST
5. S3 dispara evento `s3:ObjectCreated:*` que aciona a Lambda `onMealFileUploaded`

**Seguranca do upload:**
- `['eq', '$key', file.key]` - Chave do arquivo deve ser exatamente a gerada pela API
- `['eq', '$Content-Type', contentType]` - Tipo de conteudo deve corresponder
- `['content-length-range', file.size, file.size]` - Tamanho exato do arquivo
- Metadados `x-amz-meta-mealid` e `x-amz-meta-accountid` vinculam arquivo ao registro

### 5.4 SQS - Fila de Processamento

```yaml
MealsQueue:
  VisibilityTimeout: 130             # 2min10s para processar (Lambda timeout + margem)
  ReceiveMessageWaitTimeSeconds: 20  # Long polling
  RedrivePolicy:
    maxReceiveCount: 2               # Apos 2 falhas, vai para DLQ

MealsDLQ:
  MessageRetentionPeriod: 1209600    # 14 dias de retencao

MealsDLQAlarm (CloudWatch):
  MetricName: ApproximateNumberOfMessagesVisible
  Threshold: 0                       # Qualquer msg na DLQ dispara alarme
  -> Notifica via SNS (email)
```

**Fluxo completo da fila:**
1. `MealUploadedUseCase` publica mensagem `{ accountId, mealId }` na `MealsQueue`
2. Lambda `processMeal` consome da fila (batch de 1 mensagem, definido em `meals.yml`)
3. Se processar com sucesso, mensagem e removida da fila
4. Se falhar, mensagem volta para a fila (apos VisibilityTimeout)
5. Apos 2 tentativas (`maxReceiveCount`), mensagem vai para `MealsDLQ`
6. CloudWatch detecta mensagens na DLQ e dispara alarme para SNS (email de notificacao)

### 5.5 SNS + CloudWatch - Monitoramento

```yaml
DLQAlarmsTopic (SNS):
  Subscription:
    - Protocol: email
      Endpoint: ${env:DLQ_ALARM_EMAIL}  # Email configurado no .env
```

Quando uma refeicao falha o processamento por IA apos 2 tentativas, a equipe recebe um email de alerta.

### 5.6 API Gateway + Custom Domain

```yaml
APIGWCustomDomain:
  ACM Certificate (us-east-1)
  API Gateway v2 DomainName
  ApiMapping (stage -> domain)
  Route53 A Record (alias para o API Gateway)
```

Configuracao condicional: so cria custom domain se as variaveis de ambiente `API_DOMAIN_NAME`, `API_CERTIFICATE_ARN` e `ROUTE53_HOSTED_ZONE_ID` estiverem preenchidas.

---

## 6. Fluxos Principais

### 6.1 Sign Up (Cadastro)

```
Mobile App                    API (Lambda)                 Cognito              DynamoDB
    |                              |                          |                    |
    |-- POST /auth/sign-up ------->|                          |                    |
    |   { email, password,         |                          |                    |
    |     profile: {...} }         |                          |                    |
    |                              |-- findByEmail(email) ----|----------------->  |
    |                              |<-- null (email livre) ---|------------------  |
    |                              |                          |                    |
    |                              |-- Cria Account entity    |                    |
    |                              |-- Cria Profile entity    |                    |
    |                              |-- GoalCalculator.calc()  |                    |
    |                              |-- Cria Goal entity       |                    |
    |                              |                          |                    |
    |                              |-- signUp(email, pass, ---|-->                 |
    |                              |     internalId)          |   Cria usuario     |
    |                              |<-- externalId -----------|                    |
    |                              |                          |                    |
    |                              |  saga.addCompensation(   |                    |
    |                              |    deleteUser(extId))    |                    |
    |                              |                          |                    |
    |                              |-- TransactWrite ---------|----------------->  |
    |                              |   (Account+Profile+Goal) |   Atomico         |
    |                              |<-- OK -------------------|------------------  |
    |                              |                          |                    |
    |                              |-- signIn(email, pass) ---|-->                 |
    |                              |<-- tokens --------------|                    |
    |                              |                          |                    |
    |<-- { accessToken,            |                          |                    |
    |      refreshToken } ---------|                          |                    |
```

**Se o TransactWrite falhar:** A Saga executa a compensacao `deleteUser()` no Cognito.

### 6.2 Criacao e Processamento de Refeicao

```
Mobile App          API (Lambda)         S3          SQS        Lambda (Worker)      OpenAI
    |                    |                |            |              |                 |
    |-- POST /meals ---->|                |            |              |                 |
    |   { inputType,     |                |            |              |                 |
    |     fileSize }     |                |            |              |                 |
    |                    |-- create Meal  |            |              |                 |
    |                    |   (UPLOADING)  |            |              |                 |
    |                    |-- presigned -->|            |              |                 |
    |                    |   POST        |            |              |                 |
    |<-- { mealId,       |                |            |              |                 |
    |    uploadSignature}|                |            |              |                 |
    |                    |                |            |              |                 |
    |-- POST file -------|-------------->|            |              |                 |
    |   (direct to S3)   |                |            |              |                 |
    |<-- 200 OK ---------|-------------  |            |              |                 |
    |                    |                |            |              |                 |
    |                    |   S3 Event --->|            |              |                 |
    |                    |   onMealFileUploaded        |              |                 |
    |                    |-- getMetadata->|            |              |                 |
    |                    |<- accountId,  |            |              |                 |
    |                    |   mealId      |            |              |                 |
    |                    |-- save(QUEUED) |            |              |                 |
    |                    |-- publish -----|----------->|              |                 |
    |                    |                |            |              |                 |
    |                    |                |            |-- consume -->|                 |
    |                    |                |            |              |-- processMeal   |
    |                    |                |            |              |   save(PROCESSING)
    |                    |                |            |              |                 |
    |                    |                |            |              |-- AI request -->|
    |                    |                |            |              |   (image/audio) |
    |                    |                |            |              |<- foods data ---|
    |                    |                |            |              |                 |
    |                    |                |            |              |-- save(SUCCESS) |
    |                    |                |            |              |   name, icon,   |
    |                    |                |            |              |   foods[]       |
```

---

## 7. Sistema de Injecao de Dependencias

O sistema de DI e **custom**, construido sobre `reflect-metadata` e decorators do TypeScript.

**Passo a passo de como funciona na pratica:**

1. **Importacao**: Cada Lambda handler importa `reflect-metadata` no topo
2. **Registro**: Todos os `import` de classes `@Injectable()` executam o decorator, registrando no Registry
3. **Resolucao**: O adapter chama `Registry.getInstance().resolve(Controller)` que:
   - Busca dependencias do construtor via `Reflect.getMetadata('design:paramtypes', impl)`
   - Resolve cada dependencia recursivamente
   - Instancia a classe com as dependencias resolvidas

**Exemplo de cadeia de resolucao para `SignUpController`:**

```
SignUpController
  └── SignUpUseCase
        ├── AuthGateway
        │     └── AppConfig
        ├── AccountRepository
        │     └── AppConfig
        ├── SignUpUnitOfWork
        │     ├── AccountRepository (ja resolvido)
        │     ├── ProfileRepository
        │     │     └── AppConfig
        │     └── GoalRepository
        │           └── AppConfig
        └── Saga
```

**Observacao importante**: O Registry cria **novas instancias** a cada `resolve()`. Nao ha conceito de singleton por padrao (exceto o proprio Registry e os clients AWS que sao constantes de modulo).

---

## 8. Tratamento de Erros

O `lambdaHttpAdapter` centraliza todo o tratamento de erros HTTP:

| Tipo de Erro | Status HTTP | Formato da Resposta |
|-------------|-------------|---------------------|
| `ZodError` (validacao) | 400 | `{ code: 'VALIDATION', message: [{ field, error }] }` |
| `HttpError` (BadRequest, Unauthorized) | Definido na classe | `{ code, message }` |
| `ApplicationError` (dominio) | `statusCode` da classe ou 400 | `{ code, message }` |
| Qualquer outro erro | 500 | `{ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' }` |

---

## 9. Mapa Completo de Rotas HTTP

| Metodo | Rota | Auth | Controller | Descricao |
|--------|------|------|-----------|-----------|
| POST | `/auth/sign-up` | Publica | SignUpController | Cadastro com email, senha e perfil |
| POST | `/auth/sign-in` | Publica | SignInController | Login com email e senha |
| POST | `/auth/refresh-token` | Publica | RefreshTokenController | Renovar tokens |
| POST | `/auth/forgot-password` | Publica | ForgotPasswordController | Solicitar reset de senha |
| POST | `/auth/forgot-password/confirm` | Publica | ConfirmForgotPasswordController | Confirmar reset com codigo |
| GET | `/me` | JWT | GetMeController | Dados do perfil e metas |
| PUT | `/profiles` | JWT | UpdateProfileController | Atualizar perfil |
| PUT | `/goals` | JWT | UpdateGoalController | Atualizar metas nutricionais |
| POST | `/meals` | JWT | CreateMealController | Criar refeicao (retorna upload signature) |
| GET | `/meals?date=YYYY-MM-DD` | JWT | ListMealsByDayController | Listar refeicoes do dia |
| GET | `/meals/{mealId}` | JWT | GetMealByIdController | Detalhes de uma refeicao |

**Eventos asincronos (nao-HTTP):**

| Trigger | Handler | Descricao |
|---------|---------|-----------|
| S3 `s3:ObjectCreated:*` | onMealFileUploaded | Arquivo enviado ao bucket |
| SQS MealsQueue | processMeal | Processar refeicao com IA |
| Cognito PreSignUp | preSignUpTrigger | Auto-confirmar usuario |
| Cognito PreTokenGeneration | preTokenGenerationTrigger | Adicionar internalId ao token |
| Cognito CustomMessage | customMessageTrigger | Email HTML customizado |

---

## 10. Diagrama de Dependencia entre Camadas

```
┌─────────────────────────────────────────────────────┐
│                    main (Lambda)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ HTTP Adapter  │  │  S3 Adapter  │  │SQS Adapter│ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
└─────────┼──────────────────┼────────────────┼───────┘
          │                  │                │
          ▼                  ▼                ▼
┌─────────────────────────────────────────────────────┐
│                   application                        │
│  ┌────────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ │
│  │ Controllers│ │ UseCases │ │Queries │ │Services│ │
│  └─────┬──────┘ └────┬─────┘ └───┬────┘ └────────┘ │
│        │             │           │                   │
│  ┌─────┴─────────────┴───────────┘                  │
│  │  Entities, Errors, Contracts                      │
│  └──────────────────────────────────────────────────│
└──────────────────────┬──────────────────────────────┘
                       │ depende de
                       ▼
┌─────────────────────────────────────────────────────┐
│                      infra                           │
│  ┌────────────┐ ┌──────────────┐ ┌───────────────┐ │
│  │Repositories│ │   Gateways   │ │   AI Gateway  │ │
│  │ + Items    │ │(Auth,S3,SQS) │ │   (OpenAI)    │ │
│  └────────────┘ └──────────────┘ └───────────────┘ │
│  ┌────────────┐ ┌──────────────┐                    │
│  │   UoW      │ │    Emails    │                    │
│  └────────────┘ └──────────────┘                    │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│              kernel + shared (base)                   │
│  ┌────────────┐ ┌──────────────┐ ┌───────────────┐ │
│  │  Registry   │ │  Decorators  │ │   AppConfig   │ │
│  │  (DI)       │ │ Injectable   │ │   Saga        │ │
│  │             │ │ Schema       │ │   Utils       │ │
│  └────────────┘ └──────────────┘ └───────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Regra de dependencia**: As setas apontam para baixo. Camadas superiores dependem das inferiores, nunca o contrario.

**Excecao**: Os `UseCases` e `Queries` da camada `application` importam diretamente classes da camada `infra` (repositories, gateways). Em uma Clean Architecture pura, isso seria feito via interfaces. Neste projeto, a decisao foi pragmatica: como os servicos AWS sao bem definidos e o DI e feito via construtor, a inversao de dependencias via interfaces foi considerada overhead desnecessario para o escopo do projeto.

---

## 11. Conceitos de Backend e Infra para Revisao

Aqui estao os **conceitos-chave** de backend e infraestrutura que este projeto utiliza e que valem a pena entender profundamente:

### Serverless / FaaS (Function as a Service)
Cada endpoint e uma funcao Lambda independente. Nao ha servidor rodando continuamente. A AWS gerencia scaling, patching e disponibilidade. Voce paga apenas pelo tempo de execucao.

### Single Table Design (DynamoDB)
Todas as entidades vivem na mesma tabela, diferenciadas por prefixos nas chaves (PK/SK). Isso permite queries eficientes que retornam dados de multiplas "tabelas" em uma unica operacao.

### Presigned POST (S3)
O backend gera credenciais temporarias com restricoes. O mobile faz upload direto para o S3 sem o arquivo passar pelo Lambda, economizando custo e tempo de execucao.

### Event-Driven Architecture
O upload no S3 dispara um evento que aciona uma Lambda, que publica na SQS, que aciona outra Lambda. Cada peca e desacoplada e pode escalar independentemente.

### Saga Pattern
Para operacoes distribuidas (Cognito + DynamoDB), o padrao Saga garante que em caso de falha parcial, as operacoes ja completadas sao revertidas.

### Unit of Work
Agrupa multiplas operacoes de banco em uma unica transacao atomica (tudo ou nada).

### Dead Letter Queue (DLQ)
Mensagens que falham repetidamente sao movidas para uma fila separada ao inves de serem perdidas. Isso permite analise posterior e reprocessamento manual.

### JWT + Custom Claims
O Cognito emite tokens JWT que incluem um `internalId` customizado (adicionado pelo PreTokenGeneration trigger). Isso vincula o usuario do Cognito ao registro interno no DynamoDB sem precisar de uma lookup adicional a cada request.

### Origin Access Control (OAC)
O bucket S3 e privado. Apenas o CloudFront pode ler dele. Isso garante que todos os acessos passem pelo CDN (cache, HTTPS, HTTP/2+3).

### IAM Least Privilege
Cada Lambda tem apenas as permissoes minimas necessarias: DynamoDB (CRUD), Cognito (AdminDeleteUser), S3 (Put/Get), SQS (SendMessage).
